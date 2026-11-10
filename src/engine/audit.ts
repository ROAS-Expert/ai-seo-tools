import type { AuditFacts, AuditReport, Fetcher, PageFacts, ProbeFacts } from './types';
import { guardedFetch, normaliseInput } from './fetcher';
import { extractHtml, emptyHtmlFacts, flattenJsonLd, typesOf } from './html';
import { parseRobots, aiBotAccess } from './robots';
import { parseSitemap, pickKeyPage } from './sitemap';
import { detectCms } from './cms';
import { runChecks } from './checks';
import { scoreFindings, topFindings } from './score';
import { attachFixes } from './fixes';

export const ENGINE_VERSION = '1.0.0';

export async function loadPage(fetchImpl: Fetcher, url: string): Promise<{ page: PageFacts | null; error?: string }> {
  const r = await guardedFetch(fetchImpl, url, { follow: true });
  if (r.status === 0) return { page: null, error: r.error };
  const isHtml = /text\/html|application\/xhtml/i.test(r.headers['content-type'] || '') || /<html|<!doctype/i.test(r.body.slice(0, 500));
  const html = isHtml && r.body ? await extractHtml(r.body, r.finalUrl) : emptyHtmlFacts();
  const blocked = detectBlock(r.status, r.headers, html.title, r.body);
  return {
    page: {
      blocked,
      url,
      finalUrl: r.finalUrl,
      status: r.status,
      redirects: r.redirects,
      ttfbMs: r.ttfbMs,
      totalMs: r.totalMs,
      bytes: r.bytes,
      truncated: r.truncated,
      headers: r.headers,
      html,
    },
  };
}

const BLOCK_TITLE = /just a moment|attention required|access denied|verify you are human|security check|checking your browser|bot verification|are you a robot|pardon our interruption|request blocked|403 forbidden|captcha/i;
const BLOCK_BODY = /cf-chl|challenge-platform|_cf_chl_opt|cf-browser-verification|px-captcha|_Incapsula_Resource|distil_r_captcha|datadome|akamai.*reference #|awswaf|hcaptcha\.com|recaptcha\/api\.js.*challenge/i;

/** Returns a short reason when the response looks like bot protection rather than the site. */
export function detectBlock(status: number, headers: Record<string, string>, title: string, body: string): string | undefined {
  const head = body.slice(0, 20000);
  const server = (headers['server'] || '').toLowerCase();
  if (BLOCK_TITLE.test(title) || BLOCK_BODY.test(head)) {
    if (/cf-chl|challenge-platform|_cf_chl|cf-browser-verification|just a moment/i.test(head + ' ' + title)) return 'Cloudflare bot challenge';
    if (/datadome/i.test(head)) return 'DataDome bot protection';
    if (/px-captcha|perimeterx/i.test(head)) return 'PerimeterX bot protection';
    if (/_Incapsula_Resource|incapsula|imperva/i.test(head)) return 'Imperva bot protection';
    if (/akamai/i.test(head) || server.includes('akamai')) return 'Akamai bot protection';
    if (/awswaf/i.test(head)) return 'AWS WAF challenge';
    return 'a bot verification page';
  }
  if (status === 403 || status === 429 || status === 503) {
    if (server.includes('cloudflare')) return 'Cloudflare (HTTP ' + status + ')';
    return 'HTTP ' + status + ' for our crawler';
  }
  return undefined;
}

async function probe(fetchImpl: Fetcher, url: string, follow = false): Promise<ProbeFacts> {
  const r = await guardedFetch(fetchImpl, url, { follow, maxBytes: 20000, timeoutMs: 7000 });
  return { url, status: r.status, location: r.location, redirects: r.redirects, finalUrl: r.finalUrl, error: r.error };
}

export async function collectFacts(fetchImpl: Fetcher, rawUrl: string): Promise<AuditFacts> {
  const started = Date.now();
  const input = normaliseInput(rawUrl);
  const hostname = input.hostname;
  const origin = input.origin;
  const bareHost = hostname.replace(/^www\./, '');
  const altHost = hostname.startsWith('www.') ? bareHost : 'www.' + bareHost;
  const nonce = Math.random().toString(36).slice(2, 10);

  // Homepage first: everything else keys off the final host after redirects, so www/non-www hops do not skew results.
  const homeRes = await loadPage(fetchImpl, input.toString());
  const home = homeRes.page;
  const finalOrigin = home ? new URL(home.finalUrl).origin : origin;
  const finalHost = new URL(finalOrigin).hostname;
  const finalBare = finalHost.replace(/^www\./, '');
  const finalAlt = finalHost.startsWith('www.') ? finalBare : 'www.' + finalBare;
  void altHost;

  const [httpProbe, altHostProbe, notFoundProbe, robotsRes, llmsRes] = await Promise.all([
    probe(fetchImpl, `http://${hostname}/`),
    probe(fetchImpl, `https://${finalAlt}/`),
    probe(fetchImpl, `${finalOrigin}/roas-audit-missing-${nonce}`, true),
    guardedFetch(fetchImpl, `${finalOrigin}/robots.txt`, { maxBytes: 200000, timeoutMs: 7000 }),
    guardedFetch(fetchImpl, `${finalOrigin}/llms.txt`, { maxBytes: 200000, timeoutMs: 7000 }),
  ]);
  const robotsIsText = robotsRes.status === 200 && !/<html|<!doctype/i.test(robotsRes.body.slice(0, 300));
  const robots = parseRobots(robotsIsText ? robotsRes.body : '', robotsRes.status);
  const llmsIsText = llmsRes.status === 200 && !/<html|<!doctype/i.test(llmsRes.body.slice(0, 300)) && llmsRes.body.trim().length > 20;
  const llmsTxt = { status: llmsRes.status, present: llmsIsText, bytes: llmsRes.bytes };

  // Sitemap: declared ones first, then /sitemap.xml, then /sitemap_index.xml
  const candidates = [...robots.sitemaps, `${finalOrigin}/sitemap.xml`, `${finalOrigin}/sitemap_index.xml`, `${finalOrigin}/wp-sitemap.xml`];
  let sitemap: AuditFacts['sitemap'] = null;
  const tried = new Set<string>();
  for (const c of candidates) {
    let abs: string;
    try {
      abs = new URL(c, finalOrigin).toString();
    } catch {
      continue;
    }
    if (tried.has(abs)) continue;
    tried.add(abs);
    const r = await guardedFetch(fetchImpl, abs, { maxBytes: 1_000_000, timeoutMs: 8000 });
    const parsed = parseSitemap(abs, r.status, r.body, r.headers['content-type']);
    if (parsed.ok) {
      sitemap = parsed;
      // If it is an index, read the first child to collect page URLs for key page selection.
      if (parsed.isIndex && parsed.sampleUrls.length) {
        const child = parsed.sampleUrls.find((u) => /product|collection|categor|post|blog|page/i.test(u)) || parsed.sampleUrls[0];
        const cr = await guardedFetch(fetchImpl, child, { maxBytes: 1_000_000, timeoutMs: 8000 });
        const cp = parseSitemap(child, cr.status, cr.body, cr.headers['content-type']);
        if (cp.ok) sitemap = { ...parsed, urlCount: cp.urlCount, sampleUrls: cp.sampleUrls };
      }
      break;
    }
    if (!sitemap) sitemap = parsed;
    if (tried.size >= 4) break;
  }

  // Key page: prefer sitemap URLs, then homepage links
  const linkCandidates = [...(sitemap?.sampleUrls ?? []), ...(home?.html.links.sample ?? [])];
  const pick = pickKeyPage(linkCandidates, finalOrigin);
  let keyPage: PageFacts | null = null;
  let keyPageKind: AuditFacts['keyPageKind'] = 'none';
  if (pick) {
    const kp = await loadPage(fetchImpl, pick.url);
    keyPage = kp.page;
    keyPageKind = pick.kind;
    // Refine kind from schema if the page says so.
    if (keyPage) {
      const types = flattenJsonLd(keyPage.html.jsonld).flatMap(typesOf).map((t) => t.toLowerCase());
      if (types.includes('product') || types.includes('productgroup')) keyPageKind = 'product';
      else if (types.some((t) => /article|blogposting|newsarticle/.test(t))) keyPageKind = 'article';
      else if (types.includes('collectionpage') || types.includes('itemlist')) keyPageKind = keyPageKind === 'product' ? 'product' : 'collection';
    }
  }

  return {
    requested: rawUrl,
    hostname: bareHost,
    home,
    homeError: homeRes.error,
    httpProbe,
    altHostProbe,
    notFoundProbe,
    robots,
    sitemap,
    llmsTxt,
    keyPage,
    keyPageKind,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
  };
}

export function buildReport(facts: AuditFacts, id: string): AuditReport {
  const cms = detectCms(facts.home);
  const findings = attachFixes(runChecks(facts, cms), cms.id);
  const { score, grade, categories } = scoreFindings(findings);
  const top = topFindings(findings, 3);
  const home = facts.home;
  const jsonldTypes = home ? [...new Set(flattenJsonLd(home.html.jsonld).flatMap(typesOf))] : [];
  return {
    id,
    version: ENGINE_VERSION,
    url: home?.finalUrl || facts.requested,
    hostname: facts.hostname,
    cms,
    score,
    grade,
    categories,
    findings,
    top,
    summary: null,
    facts: {
      ttfbMs: home?.ttfbMs ?? 0,
      bytes: home?.bytes ?? 0,
      status: home?.status ?? 0,
      finalUrl: home?.finalUrl || '',
      title: home?.html.title || '',
      jsonldTypes,
      keyPageUrl: facts.keyPage?.finalUrl ?? null,
      keyPageKind: facts.keyPageKind,
      sitemapUrls: facts.sitemap?.urlCount ?? 0,
      aiBots: facts.robots ? aiBotAccess(facts.robots) : {},
    },
    unlocked: false,
    createdAt: facts.startedAt,
    durationMs: facts.durationMs,
  };
}

export async function audit(fetchImpl: Fetcher, rawUrl: string, id: string): Promise<AuditReport> {
  const facts = await collectFacts(fetchImpl, rawUrl);
  return buildReport(facts, id);
}
