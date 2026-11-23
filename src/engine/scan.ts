// One-page scan shared by the theme and app detector, the pixel checker and the schema checker.
// One guarded GET of the page the visitor gave, HTML facts extracted once, platform detected once.
import { guardedFetch, type FetchResult } from './fetcher';
import { extractHtml } from './html';
import { detectCms } from './cms';
import type { CmsResult, Fetcher, PageFacts } from './types';

export interface ScannedPage {
  requested: string;
  finalUrl: string;
  hostname: string;
  status: number;
  ok: boolean;
  /** Set when the page did not load or a bot wall answered instead. Plain words for the visitor. */
  problem?: string;
  headers: Record<string, string>;
  /** The raw HTML, capped by the fetcher. Analysers read it; it is never sent back to the browser. */
  body: string;
  page: PageFacts | null;
  cms: CmsResult;
}

const WALL = /cf-chl|challenge-platform|just a moment\.\.\.|attention required|px-captcha|_incapsula_|datadome|access denied|captcha/i;

export function problemFor(r: FetchResult): string | undefined {
  if (r.error) return 'The page did not load: ' + r.error + '.';
  if (r.status === 401) return 'The page asks for a password (HTTP 401). Password-protected stores cannot be scanned.';
  if ((r.status === 403 || r.status === 503 || r.status === 429) && WALL.test(r.body.slice(0, 20000))) return 'Bot protection answered instead of the page (HTTP ' + r.status + '). Crawlers and AI agents meet the same wall.';
  if (r.status >= 400) return 'The page answered with HTTP ' + r.status + '.';
  if (/\/password\/?$/.test(new URL(r.finalUrl).pathname)) return 'This store is password protected, so only the password page is public.';
  return undefined;
}

export async function scanPage(fetchImpl: Fetcher, url: string): Promise<ScannedPage> {
  const r = await guardedFetch(fetchImpl, url, { headers: { accept: 'text/html,application/xhtml+xml' } });
  const finalUrl = r.finalUrl || url;
  const hostname = (() => { try { return new URL(finalUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const problem = problemFor(r);
  let page: PageFacts | null = null;
  if (r.body) {
    const html = await extractHtml(r.body, finalUrl);
    page = { url, finalUrl, status: r.status, redirects: r.redirects, ttfbMs: r.ttfbMs, totalMs: r.totalMs, bytes: r.bytes, truncated: r.truncated, headers: r.headers, html };
  }
  return { requested: url, finalUrl, hostname, status: r.status, ok: !problem, problem, headers: r.headers, body: r.body, page, cms: detectCms(page) };
}
