import type { SitemapFacts } from './types';

const LOC_RE = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

export function parseSitemap(url: string, status: number, body: string, contentType = ''): SitemapFacts {
  const facts: SitemapFacts = { url, status, ok: false, isIndex: false, urlCount: 0, childCount: 0, sampleUrls: [] };
  if (status !== 200) {
    facts.error = `HTTP ${status}`;
    return facts;
  }
  const head = body.slice(0, 2000);
  const looksXml = /<\?xml|<urlset|<sitemapindex/i.test(head);
  if (!looksXml) {
    facts.error = /text\/html/i.test(contentType) || /<html/i.test(head) ? 'Returned an HTML page, not XML' : 'Not an XML sitemap';
    return facts;
  }
  facts.isIndex = /<sitemapindex/i.test(head);
  let m: RegExpExecArray | null;
  let count = 0;
  LOC_RE.lastIndex = 0;
  while ((m = LOC_RE.exec(body)) && count < 50000) {
    count += 1;
    if (facts.sampleUrls.length < 200) facts.sampleUrls.push(decodeEntities(m[1]));
  }
  if (facts.isIndex) facts.childCount = count;
  else facts.urlCount = count;
  facts.ok = count > 0;
  if (!facts.ok) facts.error = 'No URLs found';
  return facts;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Pick a likely product, collection, article or content page from candidate paths. */
export function pickKeyPage(candidates: string[], origin: string): { url: string; kind: 'product' | 'collection' | 'article' | 'page' } | null {
  const seen = new Set<string>();
  const abs: URL[] = [];
  for (const c of candidates) {
    try {
      const u = new URL(c, origin);
      if (u.origin !== origin) continue;
      u.hash = '';
      const key = u.pathname + u.search;
      if (seen.has(key) || key === '/' || key === '') continue;
      seen.add(key);
      abs.push(u);
    } catch {
      /* ignore */
    }
  }
  const score = (u: URL): { kind: 'product' | 'collection' | 'article' | 'page'; s: number } => {
    const p = u.pathname.toLowerCase();
    if (/\.(xml|pdf|jpg|jpeg|png|gif|webp|svg|css|js|zip)$/.test(p)) return { kind: 'page', s: -100 };
    if (u.search) return { kind: 'page', s: -20 };
    if (/\/(products?|produkt|produit|item|p)\/[^/]+\/?$/.test(p) || /\/[^/]+\.html$/.test(p) && !/\/(blog|news|category|categories)\//.test(p)) return { kind: 'product', s: 100 };
    if (/\/(collections?|category|categories|c|shop|store|catalog|kategorie)\/[^/]+\/?$/.test(p)) return { kind: 'collection', s: 60 };
    if (/\/(blog|blogs|news|articles?|insights|resources|guides?|journal|magazine|posts?)\/[^/]+\/?/.test(p)) return { kind: 'article', s: 50 };
    if (/\/(about|services?|pricing|features?|solutions?|contact|product|platform)\b/.test(p)) return { kind: 'page', s: 20 };
    if (/\/(cart|checkout|account|login|register|wishlist|search|tag|tags|page|wp-admin|wp-json|feed|privacy|terms|legal|cookie)/.test(p)) return { kind: 'page', s: -50 };
    return { kind: 'page', s: Math.max(1, 10 - p.split('/').length) };
  };
  let best: { url: string; kind: 'product' | 'collection' | 'article' | 'page'; s: number } | null = null;
  for (const u of abs) {
    const r = score(u);
    if (!best || r.s > best.s) best = { url: u.toString(), kind: r.kind, s: r.s };
  }
  return best && best.s > 0 ? { url: best.url, kind: best.kind } : null;
}
