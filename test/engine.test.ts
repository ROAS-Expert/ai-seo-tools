import { describe, expect, it } from 'vitest';
import { audit, collectFacts } from '../src/engine/audit';
import { normaliseInput, guardedFetch, GuardError } from '../src/engine/fetcher';
import { parseRobots, isAllowed, aiBotAccess, blocksEverything } from '../src/engine/robots';
import { parseSitemap, pickKeyPage } from '../src/engine/sitemap';
import { extractHtml, decodeEntities } from '../src/engine/html';
import { detectBlock } from '../src/engine/audit';
import { detectCms } from '../src/engine/cms';
import { fakeFetch, shopifySite, wordpressSite, magentoSite, framerSite, SHOPIFY_HOME } from './fixtures';

const byId = (r: { findings: Array<{ id: string; status: string; detail: string; fix?: string }> }, id: string) => r.findings.find((f) => f.id === id)!;

describe('normaliseInput and SSRF guard', () => {
  it('adds https and strips hash', () => {
    expect(normaliseInput('example.com/path#x').toString()).toBe('https://example.com/path');
    expect(normaliseInput('http://Example.COM').toString()).toBe('https://example.com/');
  });
  it('refuses IPs, localhost, ports and credentials', () => {
    for (const bad of ['127.0.0.1', 'http://10.0.0.1/', 'localhost', 'http://[::1]/', 'https://example.com:8443/', 'https://user:pw@example.com/', 'ftp://example.com', 'example', 'metadata.internal', '169.254.169.254']) {
      expect(() => normaliseInput(bad), bad).toThrow(GuardError);
    }
  });
  it('re-validates redirect targets', async () => {
    const f = fakeFetch({ 'https://a.example/': { status: 302, headers: { location: 'http://169.254.169.254/latest' } } });
    const r = await guardedFetch(f, 'https://a.example/');
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/IP addresses/);
  });
  it('caps body size and marks truncation', async () => {
    const big = '<html><body>' + 'x'.repeat(50_000) + '</body></html>';
    const f = fakeFetch({ 'https://a.example/': { body: big } });
    const r = await guardedFetch(f, 'https://a.example/', { maxBytes: 10_000 });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBeLessThanOrEqual(10_000);
  });
  it('stops after too many redirects', async () => {
    const site: Record<string, { status: number; headers: Record<string, string> }> = {};
    for (let i = 0; i < 8; i++) site[`https://a.example/${i}`] = { status: 301, headers: { location: `https://a.example/${i + 1}` } };
    const r = await guardedFetch(fakeFetch(site), 'https://a.example/0');
    expect(r.error).toMatch(/Too many redirects/);
  });
});

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /private/\nAllow: /private/ok\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /products/\nSitemap: https://x.example/sitemap.xml`;
  const r = parseRobots(txt, 200);
  it('parses groups and sitemaps', () => {
    expect(r.groups.length).toBe(3);
    expect(r.sitemaps).toEqual(['https://x.example/sitemap.xml']);
  });
  it('applies longest-match rules', () => {
    expect(isAllowed(r, 'Googlebot', '/')).toBe(true);
    expect(isAllowed(r, 'Googlebot', '/private/x')).toBe(false);
    expect(isAllowed(r, 'Googlebot', '/private/ok')).toBe(true);
    expect(isAllowed(r, 'GPTBot', '/')).toBe(false);
    expect(isAllowed(r, 'claudebot', '/anything')).toBe(false);
    expect(isAllowed(r, 'PerplexityBot', '/')).toBe(true);
    expect(isAllowed(r, 'PerplexityBot', '/products/x')).toBe(false);
  });
  it('classifies AI bot access', () => {
    const a = aiBotAccess(r);
    expect(a['GPTBot']).toBe('blocked');
    expect(a['ClaudeBot']).toBe('blocked');
    expect(a['PerplexityBot']).toBe('partial');
    expect(a['OAI-SearchBot']).toBe('allowed');
  });
  it('detects a blanket block', () => {
    expect(blocksEverything(parseRobots('User-agent: *\nDisallow: /', 200))).toBe(true);
    expect(blocksEverything(parseRobots('User-agent: *\nDisallow:', 200))).toBe(false);
  });
});

describe('sitemap', () => {
  it('parses urlsets and indexes', () => {
    const s = parseSitemap('https://x/sitemap.xml', 200, '<?xml version="1.0"?><urlset><url><loc>https://x/a</loc></url><url><loc>https://x/b</loc></url></urlset>');
    expect(s.ok).toBe(true);
    expect(s.urlCount).toBe(2);
    const i = parseSitemap('https://x/sitemap.xml', 200, '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x/s1.xml</loc></sitemap></sitemapindex>');
    expect(i.isIndex).toBe(true);
    expect(i.childCount).toBe(1);
  });
  it('rejects html', () => {
    const s = parseSitemap('https://x/sitemap.xml', 200, '<!doctype html><html><body>404</body></html>', 'text/html');
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/HTML/);
  });
  it('picks product pages first', () => {
    const p = pickKeyPage(['/about', '/collections/kettles', '/products/kettle-600', '/cart', '/blog/post-1'], 'https://x.example');
    expect(p?.kind).toBe('product');
    expect(p?.url).toBe('https://x.example/products/kettle-600');
    const q = pickKeyPage(['/about', '/blog/post-1'], 'https://x.example');
    expect(q?.kind).toBe('article');
  });
});

describe('html extraction', () => {
  it('reads head, headings, images, links, jsonld and text', async () => {
    const h = await extractHtml(SHOPIFY_HOME, 'https://trailkettle.example/');
    expect(h.title).toContain('Trail Kettle');
    expect(h.metaDescription).toMatch(/Titanium/);
    expect(h.lang).toBe('en');
    expect(h.canonical).toBe('https://trailkettle.example/');
    expect(h.h1).toEqual(['Titanium kettles for people who count grams']);
    expect(h.headings.filter((x) => x.level === 2).length).toBe(3);
    expect(h.images.total).toBe(7);
    expect(h.images.withAlt).toBe(6);
    expect(h.images.modern).toBe(7);
    expect(h.images.lazy).toBe(6);
    expect(h.jsonld.length).toBe(2);
    expect(h.jsonldErrors).toBe(0);
    expect(h.links.internal).toBeGreaterThanOrEqual(6);
    expect(h.links.external).toBe(1);
    expect(h.links.nofollow).toBe(1);
    expect(h.textWords).toBeGreaterThan(200);
    expect(h.scripts.blocking).toBe(0);
    expect(h.scripts.total).toBe(3);
    expect(h.og.image).toContain('og.jpg');
    expect(h.faqLike).toBe(true);
    expect(h.hasMain).toBe(true);
    expect(h.htmlSample).toContain('sigs:');
  });
  it('ignores style and script text inside headings', async () => {
    const h = await extractHtml('<html><head><title>T</title></head><body><h1><style>.logo{max-height:unset}</style><a href="/">Shop name</a></h1><h2>Two<script>var x=1</script></h2></body></html>', 'https://x.example/');
    expect(h.h1).toEqual(['Shop name']);
    expect(h.headings[1].text).toBe('Two');
  });

  it('counts blocking scripts and broken jsonld', async () => {
    const h = await extractHtml('<html><head><script src="a.js"></script><script src="b.js" defer></script><script type="application/ld+json">{nope}</script></head><body><script src="c.js"></script></body></html>', 'https://x.example/');
    expect(h.scripts.blocking).toBe(1);
    expect(h.scripts.total).toBe(3);
    expect(h.jsonldErrors).toBe(1);
  });
});

describe('full audits', () => {
  it('Shopify store scores well and is detected', async () => {
    const r = await audit(fakeFetch(shopifySite()), 'trailkettle.example', 'test1');
    expect(r.cms.id).toBe('shopify');
    expect(r.cms.ecommerce).toBe(true);
    expect(byId(r, 'https_redirect').status).toBe('pass');
    expect(byId(r, 'www_consistency').status).toBe('pass');
    expect(byId(r, 'robots_blocking').status).toBe('pass');
    expect(byId(r, 'sitemap').status).toBe('pass');
    expect(byId(r, 'product_schema').status).toBe('pass');
    expect(byId(r, 'org_schema').status).toBe('pass');
    expect(byId(r, 'ai_bots').status).toBe('pass');
    expect(byId(r, 'llms_txt').status).toBe('warn');
    expect(byId(r, 'llms_txt').fix).toMatch(/Shopify cannot serve/);
    expect(byId(r, 'text_without_js').status).toBe('pass');
    expect(byId(r, 'breadcrumb_inner').status).toBe('pass');
    expect(r.facts.keyPageKind).toBe('product');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.top.length).toBeLessThanOrEqual(3);
  });

  it('WordPress/WooCommerce site with noindex is capped and fixes are WordPress specific', async () => {
    const r = await audit(fakeFetch(wordpressSite()), 'https://baeckerei-lindner.example', 'test2');
    expect(r.cms.id).toBe('woocommerce');
    expect(byId(r, 'noindex').status).toBe('fail');
    expect(byId(r, 'noindex').fix).toMatch(/Settings > Reading/);
    expect(byId(r, 'https_redirect').status).toBe('fail');
    expect(byId(r, 'www_consistency').status).toBe('fail');
    expect(byId(r, 'robots_present').status).toBe('warn');
    expect(byId(r, 'sitemap').status).toBe('fail');
    expect(byId(r, 'soft_404').status).toBe('fail');
    expect(byId(r, 'h1').status).toBe('warn');
    expect(byId(r, 'heading_structure').status).toBe('warn');
    expect(byId(r, 'img_alt').status).toBe('fail');
    expect(byId(r, 'jsonld_valid').status).toBe('fail');
    expect(byId(r, 'meta_description').status).toBe('fail');
    expect(byId(r, 'render_blocking').status).toBe('warn');
    expect(byId(r, 'compression').status).toBe('warn');
    expect(byId(r, 'product_schema').status).toBe('fail');
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.top[0].status).toBe('fail');
  });

  it('Magento store: AI bots blocked, llms.txt present, slow TTFB', async () => {
    const r = await audit(fakeFetch(magentoSite()), 'parts.example', 'test3');
    expect(r.cms.id).toBe('magento');
    expect(byId(r, 'ai_bots').status).toBe('fail');
    expect(byId(r, 'ai_bots').detail).toMatch(/ClaudeBot/);
    expect(byId(r, 'ai_bots').fix).toMatch(/Search Engine Robots/);
    expect(byId(r, 'llms_txt').status).toBe('pass');
    expect(byId(r, 'ttfb').status).toBe('warn');
    expect(byId(r, 'title').status).toBe('warn');
    expect(byId(r, 'render_blocking').status).toBe('warn');
    expect(byId(r, 'product_schema').status).toBe('warn');
    expect(byId(r, 'product_schema').detail).toMatch(/microdata/);
    expect(r.facts.aiBots['GPTBot']).toBe('blocked');
  });

  it('Framer site: thin text, unreachable www, 308 https', async () => {
    const r = await audit(fakeFetch(framerSite()), 'orbit.example', 'test4');
    expect(r.cms.id).toBe('framer');
    expect(r.cms.ecommerce).toBe(false);
    expect(byId(r, 'https_redirect').status).toBe('pass');
    expect(byId(r, 'www_consistency').status).toBe('warn');
    expect(byId(r, 'text_without_js').status).toBe('fail');
    expect(byId(r, 'org_schema').status).toBe('fail');
    expect(byId(r, 'org_schema').fix).toMatch(/Custom Code/);
    expect(r.findings.find((f) => f.id === 'product_schema')).toBeUndefined();
  });

  it('handles a site that lives on www when given the bare host', async () => {
    const site = shopifySite();
    const o = 'https://www.trailkettle.example';
    const moved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(site)) moved[k.replace('https://trailkettle.example', o)] = v;
    moved['https://trailkettle.example/'] = { status: 301, headers: { location: o + '/' } };
    moved['http://trailkettle.example/'] = { status: 301, headers: { location: o + '/' } };
    const r = await audit(fakeFetch(moved as never), 'trailkettle.example', 'test6');
    expect(r.url).toBe(o + '/');
    expect(byId(r, 'www_consistency').status).toBe('pass');
    expect(byId(r, 'https_redirect').status).toBe('pass');
    expect(byId(r, 'robots_present').status).toBe('pass');
    expect(byId(r, 'sitemap').status).toBe('pass');
  });

  it('unreachable site produces a one-finding report with score 0', async () => {
    const r = await audit(fakeFetch({}), 'nowhere.example', 'test5');
    expect(byId(r, 'home_reachable').status).toBe('fail');
    expect(r.findings.length).toBe(1);
    expect(r.score).toBe(0);
    expect(r.cms.id).toBe('unknown');
  });

  it('bot challenge pages are reported as blocked, not audited', async () => {
    const chl = '<!doctype html><html><head><title>Just a moment...</title><meta name="robots" content="noindex"></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>';
    const r = await audit(fakeFetch({ 'https://wall.example/': { status: 403, body: chl, headers: { server: 'cloudflare' } } }), 'wall.example', 'test7');
    expect(byId(r, 'home_reachable').status).toBe('fail');
    expect(byId(r, 'home_reachable').detail).toMatch(/Cloudflare bot challenge/);
    expect(r.findings.length).toBe(1);
    expect(r.score).toBe(0);
    expect(detectBlock(200, {}, 'Welcome', '<html>fine</html>')).toBeUndefined();
    expect(detectBlock(403, { server: 'nginx' }, '', '')).toMatch(/HTTP 403/);
  });

  it('decodes entities in titles and descriptions', async () => {
    expect(decodeEntities('Agri &amp; Parts &#8211; 5M+ &quot;items&quot; &#x27;x&#x27;')).toBe('Agri & Parts \u2013 5M+ "items" \'x\'');
    const h = await extractHtml('<html><head><title>A &amp; B</title><meta name="description" content="C &amp; D"></head><body><h1>E &amp; F</h1></body></html>', 'https://x.example/');
    expect(h.title).toBe('A & B');
    expect(h.metaDescription).toBe('C & D');
    expect(h.h1[0]).toBe('E & F');
  });

  it('a generator meta beats a passing mention of another platform', async () => {
    const html = '<html><head><meta name="generator" content="Framer 2d5bd1a"><title>x</title></head><body><div data-framer-hydrate-v2="{}" class="framer-abc"><p>We also sell merch on Shopify: https://cdn.shopify.com/s/files/1/merch.png</p></div></body></html>';
    const facts = await extractHtml(html, 'https://f.example/');
    const cms = detectCms({ url: 'https://f.example/', finalUrl: 'https://f.example/', status: 200, redirects: 0, ttfbMs: 1, totalMs: 1, bytes: html.length, truncated: false, headers: {}, html: facts });
    expect(cms.id).toBe('framer');
  });

  it('collects facts in under a sane number of requests', async () => {
    const log: string[] = [];
    await collectFacts(fakeFetch(shopifySite(), { log }), 'trailkettle.example');
    expect(log.length).toBeLessThanOrEqual(12);
  });
});
