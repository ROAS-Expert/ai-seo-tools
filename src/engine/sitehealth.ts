// Redirect checker, broken link checker and meta/Open Graph tag checker. Server side, guarded fetches only.
// Budget: Pages Functions allow 50 subrequests per request on the free plan, so every tool stays under 45.
import { guardedFetch } from './fetcher';
import type { Fetcher, PageFacts } from './types';

export type Lvl = 'pass' | 'warn' | 'fail' | 'info';
export interface Finding { level: Lvl; title: string; detail: string; fix?: string }

/* ------------------------------------------------------------------ redirects */

export interface Hop { url: string; status: number; location: string | null; ms: number; error?: string }
export interface Chain { start: string; hops: Hop[]; final: string; finalStatus: number; loop: boolean }

export async function redirectChain(f: Fetcher, start: string, max = 10): Promise<Chain> {
  const hops: Hop[] = [];
  const seen = new Set<string>();
  let url = start;
  let loop = false;
  for (let i = 0; i <= max; i++) {
    if (seen.has(url)) { loop = true; break; }
    seen.add(url);
    const r = await guardedFetch(f, url, { follow: false, method: 'GET', maxBytes: 20000, timeoutMs: 7000 });
    const loc = r.location || r.headers['location'] || null;
    let next: string | null = null;
    if (loc && r.status >= 300 && r.status < 400) {
      try { next = new URL(loc, url).toString(); } catch { next = null; }
    }
    hops.push({ url, status: r.status, location: next, ms: r.totalMs, ...(r.error ? { error: r.error } : {}) });
    if (!next) break;
    url = next;
  }
  const last = hops[hops.length - 1];
  return { start, hops, final: last.location && loop ? last.location : last.url, finalStatus: loop ? 0 : last.status, loop };
}

export interface RedirectReport { chain: Chain; variants: Chain[]; findings: Finding[] }

export async function checkRedirects(f: Fetcher, url: string): Promise<RedirectReport> {
  const chain = await redirectChain(f, url);
  const u = new URL(url);
  const isRoot = u.pathname === '/' && !u.search;
  const host = u.hostname.replace(/^www\./, '');
  const variants = isRoot ? await Promise.all(['http://' + host + '/', 'http://www.' + host + '/', 'https://' + host + '/', 'https://www.' + host + '/'].filter((v) => v !== u.toString()).map((v) => redirectChain(f, v, 6))) : [];
  return { chain, variants, findings: redirectFindings(chain, variants) };
}

export function redirectFindings(chain: Chain, variants: Chain[]): Finding[] {
  const out: Finding[] = [];
  const redirects = chain.hops.filter((h) => h.location).length;
  if (chain.loop) out.push({ level: 'fail', title: 'Redirect loop', detail: 'The address redirects back to a page it already passed through. Browsers and crawlers give up.', fix: 'Find the two rules that point at each other (often an http to https rule plus a www rule) and remove one.' });
  else if (chain.finalStatus === 0) out.push({ level: 'fail', title: 'The final page did not answer', detail: chain.hops[chain.hops.length - 1].error || 'No response.' });
  else if (chain.finalStatus >= 400) out.push({ level: 'fail', title: `Ends in an error (HTTP ${chain.finalStatus})`, detail: 'Visitors and crawlers land on an error page.', fix: 'Point the redirect at a live page, or restore the page.' });
  else out.push({ level: 'pass', title: `Ends on a working page (HTTP ${chain.finalStatus})`, detail: chain.final });
  if (redirects === 0 && !chain.loop) out.push({ level: 'pass', title: 'No redirect', detail: 'The address answers directly.' });
  if (redirects === 1) out.push({ level: 'pass', title: 'One redirect', detail: 'A single hop is fine.' });
  if (redirects >= 2) out.push({ level: 'warn', title: `Redirect chain of ${redirects} hops`, detail: 'Each hop adds a round trip, and crawlers may stop following long chains.', fix: `Point the first address straight at ${chain.final}.` });
  const temp = chain.hops.filter((h) => h.location && (h.status === 302 || h.status === 307));
  if (temp.length) out.push({ level: 'warn', title: `Temporary redirect (${temp.map((h) => h.status).join(', ')})`, detail: 'A 302 or 307 tells search engines the move is temporary, so they may keep the old address in results.', fix: 'Use 301 or 308 if the move is permanent.' });
  if (chain.hops.some((h, i) => i > 0 && h.url.startsWith('http://') && chain.hops[i - 1].url.startsWith('https://'))) out.push({ level: 'fail', title: 'Redirect drops from https to http', detail: 'Part of the chain leaves the secure version of the site.', fix: 'Make every rule point at https addresses.' });
  if (variants.length) {
    const all = [chain, ...variants].filter((c) => !c.loop && c.finalStatus > 0 && c.finalStatus < 400);
    const finals = new Set(all.map((c) => c.final.replace(/\/$/, '')));
    if (finals.size > 1) out.push({ level: 'fail', title: 'The http, https, www and non-www versions end on different pages', detail: [...finals].join(', '), fix: 'Pick one version and redirect the other three to it with a 301. Duplicate versions split links and rankings.' });
    else if (all.length === variants.length + 1) out.push({ level: 'pass', title: 'All four versions end on the same page', detail: [...finals][0] || '' });
    const slow = variants.filter((c) => c.hops.filter((h) => h.location).length > 1);
    if (slow.length) out.push({ level: 'warn', title: `${slow.length} version${slow.length > 1 ? 's take' : ' takes'} more than one hop`, detail: slow.map((c) => c.start).join(', '), fix: 'Redirect each version straight to the final address in one hop.' });
  }
  return out;
}

/* ------------------------------------------------------------------ broken links */

export interface LinkResult { url: string; text: string; internal: boolean; status: number; state: 'ok' | 'redirect' | 'broken' | 'blocked' | 'error'; location?: string; error?: string }
export interface LinkReport { found: number; checked: number; skipped: number; links: LinkResult[]; counts: Record<LinkResult['state'], number>; findings: Finding[] }

export function extractLinks(html: string, base: string): Array<{ url: string; text: string }> {
  const out: Array<{ url: string; text: string }> = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim().replace(/&amp;/g, '&');
    if (!raw || /^(#|mailto:|tel:|javascript:|sms:|data:)/i.test(raw)) continue;
    let abs: string;
    try { const u = new URL(raw, base); if (!/^https?:$/.test(u.protocol)) continue; u.hash = ''; abs = u.toString(); } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ url: abs, text: m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) });
  }
  return out;
}

export async function checkLinks(f: Fetcher, html: string, base: string, max = 40): Promise<LinkReport> {
  const all = extractLinks(html, base);
  const host = new URL(base).hostname.replace(/^www\./, '');
  const isInternal = (u: string) => new URL(u).hostname.replace(/^www\./, '') === host;
  const picked = all.slice(0, max);
  const results: LinkResult[] = new Array(picked.length);
  let budget = 44;
  let i = 0;
  const worker = async () => {
    while (i < picked.length) {
      const k = i++;
      const { url, text } = picked[k];
      const internal = isInternal(url);
      if (budget <= 0) { results[k] = { url, text, internal, status: 0, state: 'error', error: 'not checked (request budget)' }; continue; }
      budget--;
      let r = await guardedFetch(f, url, { follow: false, method: 'HEAD', maxBytes: 1000, timeoutMs: 6000 });
      if ((r.status === 405 || r.status === 501 || r.status === 400) && budget > 0) { budget--; r = await guardedFetch(f, url, { follow: false, method: 'GET', maxBytes: 2000, timeoutMs: 6000 }); }
      const loc = r.location || r.headers['location'];
      const state: LinkResult['state'] = r.error && !r.status ? 'error' : r.status >= 200 && r.status < 300 ? 'ok' : r.status >= 300 && r.status < 400 ? 'redirect' : r.status === 401 || r.status === 403 || r.status === 429 || r.status === 999 ? 'blocked' : r.status >= 400 ? 'broken' : 'error';
      results[k] = { url, text, internal, status: r.status, state, ...(loc ? { location: String(new URL(loc, url)) } : {}), ...(r.error ? { error: r.error } : {}) };
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const counts = { ok: 0, redirect: 0, broken: 0, blocked: 0, error: 0 } as Record<LinkResult['state'], number>;
  for (const r of results) counts[r.state]++;
  const findings: Finding[] = [];
  const brokenInt = results.filter((r) => r.state === 'broken' && r.internal).length;
  if (counts.broken) findings.push({ level: 'fail', title: `${counts.broken} broken link${counts.broken > 1 ? 's' : ''}`, detail: `${brokenInt} on your own site, ${counts.broken - brokenInt} to other sites. Visitors hit an error page and crawlers waste their visit.`, fix: 'Update each link to the live page, or remove it. For your own pages that moved, add a 301 redirect.' });
  else findings.push({ level: 'pass', title: 'No broken links found', detail: `All ${results.length} checked links answered.` });
  const redirInt = results.filter((r) => r.state === 'redirect' && r.internal).length;
  if (redirInt) findings.push({ level: 'warn', title: `${redirInt} internal link${redirInt > 1 ? 's go' : ' goes'} through a redirect`, detail: 'Linking to the final address saves a round trip and keeps link value.', fix: 'Change those links to the address they redirect to.' });
  if (counts.blocked) findings.push({ level: 'info', title: `${counts.blocked} link${counts.blocked > 1 ? 's' : ''} refused our checker`, detail: 'Sites like LinkedIn and Amazon block automated checks (401, 403, 429 or 999). They usually work in a browser.' });
  if (counts.error) findings.push({ level: 'warn', title: `${counts.error} link${counts.error > 1 ? 's' : ''} did not answer`, detail: 'Timeouts or DNS errors. Open them by hand to confirm.' });
  if (all.length > picked.length) findings.push({ level: 'info', title: `Checked the first ${picked.length} of ${all.length} links`, detail: 'The free check reads one page and up to 40 links in page order.' });
  return { found: all.length, checked: picked.length, skipped: all.length - picked.length, links: results, counts, findings };
}

/* ------------------------------------------------------------------ meta and Open Graph tags */

export interface MetaReport {
  tags: { title: string; description: string; canonical: string; robots: string; lang: string; og: Record<string, string>; twitter: Record<string, string> };
  image: { url: string; status: number; type: string; bytes: number | null } | null;
  findings: Finding[];
  score: number;
}

export async function checkMeta(f: Fetcher, page: PageFacts): Promise<MetaReport> {
  const h = page.html;
  const og = h.og || {};
  const tw = h.twitter || {};
  const findings: Finding[] = [];
  const add = (level: Lvl, title: string, detail: string, fix?: string) => findings.push({ level, title, detail, ...(fix ? { fix } : {}) });
  const t = h.title.trim();
  if (!t) add('fail', 'No title tag', 'Search engines will make one up from the page.', 'Add a <title> of 30 to 60 characters that names the page and the brand.');
  else if (t.length > 60) add('warn', `Title is ${t.length} characters`, 'Google cuts titles around 60 characters on most screens.', 'Shorten it, with the important words first.');
  else if (t.length < 25) add('warn', `Title is only ${t.length} characters`, 'Short titles leave room unused and often lack the words people search for.');
  else add('pass', `Title is ${t.length} characters`, t);
  const d = h.metaDescription.trim();
  if (!d) add('warn', 'No meta description', 'Google picks a snippet from the page text, which is often a menu or a cookie line.', 'Add a description of 70 to 160 characters that says what the page offers.');
  else if (d.length > 160) add('warn', `Description is ${d.length} characters`, 'Google usually cuts it around 155 to 160 characters.');
  else if (d.length < 70) add('warn', `Description is only ${d.length} characters`, 'There is room to say more about the page.');
  else add('pass', `Description is ${d.length} characters`, d);
  if (!h.canonical) add('warn', 'No canonical tag', 'Without it, search engines guess which address is the main one when the page has variants.', 'Add <link rel="canonical"> pointing at this page.');
  else add('pass', 'Canonical tag set', h.canonical);
  if (/noindex/i.test(h.metaRobots)) add('fail', 'The page tells search engines not to index it', `meta robots: ${h.metaRobots}`, 'Remove noindex if this page should appear in search.');
  for (const [k, label] of [['og:title', 'og:title'], ['og:description', 'og:description'], ['og:image', 'og:image'], ['og:url', 'og:url']] as const) {
    const key = k.replace('og:', '');
    if (!og[key]) add(k === 'og:image' ? 'fail' : 'warn', `Missing ${label}`, k === 'og:image' ? 'Links shared on LinkedIn, Facebook, WhatsApp and Slack show no picture.' : 'Social apps fall back to other tags or show nothing.', `Add <meta property="${k}" content="...">.`);
  }
  if (!og['type']) add('info', 'No og:type', 'Defaults to website. Product pages can use og:type product.');
  if (!tw['card']) add('warn', 'No twitter:card', 'X shows a small text link instead of a card.', 'Add <meta name="twitter:card" content="summary_large_image">.');
  if (!h.lang) add('warn', 'No lang attribute on <html>', 'Search engines and screen readers have to guess the language.');
  let image: MetaReport['image'] = null;
  const img = og['image'] || tw['image'];
  if (img) {
    let abs = img;
    try { abs = new URL(img, page.finalUrl).toString(); } catch { /* keep */ }
    if (!/^https?:\/\//i.test(img)) add('warn', 'og:image is a relative address', 'Some apps need a full address starting with https://.', `Use ${abs}`);
    const r = await guardedFetch(f, abs, { method: 'HEAD', maxBytes: 1000, timeoutMs: 6000 });
    const bytes = r.headers['content-length'] ? Number(r.headers['content-length']) : null;
    image = { url: abs, status: r.status, type: r.headers['content-type'] || '', bytes };
    if (!(r.status >= 200 && r.status < 300)) add('fail', `og:image does not load (HTTP ${r.status || 'error'})`, abs, 'Point og:image at a public image.');
    else if (!/^image\//.test(image.type)) add('warn', 'og:image is not served as an image', `content-type: ${image.type || 'none'}`);
    else if (bytes && bytes > 5_000_000) add('warn', `og:image is ${(bytes / 1e6).toFixed(1)} MB`, 'Facebook and LinkedIn may skip images this large.', 'Use a 1200 x 630 JPG or PNG under 1 MB.');
    else add('pass', 'og:image loads', abs);
  }
  const weights: Record<Lvl, number> = { fail: 20, warn: 8, info: 0, pass: 0 };
  const score = Math.max(0, 100 - findings.reduce((n, x) => n + weights[x.level], 0));
  return { tags: { title: t, description: d, canonical: h.canonical, robots: h.metaRobots, lang: h.lang, og, twitter: tw }, image, findings, score };
}
