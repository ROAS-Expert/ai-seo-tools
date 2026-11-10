import { describe, expect, it } from 'vitest';
import { merCalc, cacCalc, encodeParams, decodeParams, money } from '../src/calc';
import { parseLog, analyse, sampleLog, matchBot, parseClfDate, LOG_BOTS } from '../src/botlog';
import { agentCheck, scoreAgent, productFromJsonLd } from '../src/engine/agent';
import { fakeFetch, shopifySite, wordpressSite, SHOPIFY_PRODUCT_JSON, type Site } from './fixtures';

function agentShop(over: Site = {}): Site {
  const o = 'https://trailkettle.example';
  return {
    ...shopifySite(),
    [o + '/products.json?limit=3']: { body: JSON.stringify({ products: [{ id: 1, handle: 'titanium-kettle-600', title: '600 ml titanium kettle' }] }), headers: { 'content-type': 'application/json' } },
    [o + '/products/titanium-kettle-600.js']: { body: SHOPIFY_PRODUCT_JSON, headers: { 'content-type': 'application/json' } },
    [o + '/cart.js']: { body: JSON.stringify({ token: 't', items: [], item_count: 0 }), headers: { 'content-type': 'application/json' } },
    [o + '/checkout']: { status: 302, headers: { location: 'https://trailkettle.example/cart' } },
    [o + '/policies/shipping-policy']: { body: '<html><body><h1>Shipping policy</h1></body></html>' },
    [o + '/policies/refund-policy']: { body: '<html><body><h1>Refund policy</h1></body></html>' },
    ...over,
  };
}

describe('merCalc', () => {
  const base = { revenue: 120000, spend: 30000, cogsPct: 0.35, shippingPct: 0.08, feesPct: 0.03, returnsPct: 0.04, aov: 80, newSharePct: 0.6, targetMarginPct: 0.15 };
  it('works the example by hand', () => {
    const r = merCalc(base);
    expect(r.mer).toBe(4);
    expect(r.cmPct).toBe(0.5);
    expect(r.cmValue).toBe(60000);
    expect(r.breakEvenRoas).toBe(2);
    expect(r.profitAfterMarketing).toBe(30000);
    expect(r.netMarginPct).toBe(0.25);
    expect(r.requiredMer).toBe(2.86);
    expect(r.orders).toBe(1500);
    expect(r.cmPerOrder).toBe(40);
    expect(r.marketingPerOrder).toBe(20);
    expect(r.profitPerOrder).toBe(20);
    expect(r.newOrders).toBe(900);
    expect(r.cacIfAllAcquisition).toBe(33.33);
  });
  it('waterfall adds up to what you keep', () => {
    const r = merCalc(base);
    const sum = r.waterfall.slice(0, -1).reduce((a, w) => a + w.value, 0);
    expect(sum).toBeCloseTo(r.waterfall[r.waterfall.length - 1].value, 6);
    expect(r.waterfall.map((w) => w.label)).toEqual(['Revenue', 'Product cost', 'Shipping', 'Fees', 'Returns', 'Marketing', 'What you keep']);
  });
  it('handles zero spend, costs over 100% and junk input', () => {
    expect(merCalc({ ...base, spend: 0 }).mer).toBeNull();
    const over = merCalc({ ...base, cogsPct: 0.9, shippingPct: 0.2 });
    expect(over.cmPct).toBe(0);
    expect(over.breakEvenRoas).toBeNull();
    expect(over.requiredMer).toBeNull();
    const junk = merCalc({ revenue: NaN, spend: -5, cogsPct: 7, shippingPct: NaN, feesPct: 0, returnsPct: 0, aov: 0, newSharePct: 2, targetMarginPct: -1 });
    expect(junk.orders).toBe(0);
    expect(junk.netMarginPct).toBe(0);
    expect(junk.cacIfAllAcquisition).toBeNull();
    expect(merCalc({ ...base, targetMarginPct: 0.6 }).requiredMer).toBeNull();
  });
  it('a loss shows as negative profit', () => {
    const r = merCalc({ ...base, spend: 80000 });
    expect(r.profitAfterMarketing).toBe(-20000);
    expect(r.mer).toBe(1.5);
  });
});

describe('cacCalc', () => {
  it('no churn matches the simple formula', () => {
    const r = cacCalc({ cac: 1200, arpa: 200, grossMarginPct: 0.8, churnPct: 0, expansionPct: 0 });
    expect(r.monthlyContribution).toBe(160);
    expect(r.simplePaybackMonths).toBe(7.5);
    expect(r.paybackMonths).toBe(8);
    expect(r.expectedLifetimeMonths).toBe(120);
    expect(r.ltv).toBe(19200);
    expect(r.curve).toHaveLength(37);
    expect(r.curve[0]).toEqual({ month: 0, cumulative: 0, survival: 1 });
  });
  it('churn pushes payback out and caps LTV', () => {
    const r = cacCalc({ cac: 1200, arpa: 200, grossMarginPct: 0.8, churnPct: 0.025, expansionPct: 0 });
    expect(r.paybackMonths).toBe(9);
    expect(r.expectedLifetimeMonths).toBe(40);
    // geometric series: 160 * (1 - 0.975^120) / 0.025
    expect(r.ltv).toBeCloseTo((160 * (1 - Math.pow(0.975, 120))) / 0.025, 1);
    expect(r.ltvToCac).toBeCloseTo(r.ltv! / 1200, 2);
  });
  it('never pays back when churn is too high', () => {
    const r = cacCalc({ cac: 5000, arpa: 100, grossMarginPct: 0.5, churnPct: 0.2, expansionPct: 0 });
    expect(r.paybackMonths).toBeNull();
    expect(r.ltv).toBeLessThan(5000);
    expect(r.ltvToCac).toBeLessThan(1);
  });
  it('expansion shortens payback and horizon is clamped', () => {
    const flat = cacCalc({ cac: 3000, arpa: 200, grossMarginPct: 0.8, churnPct: 0.02, expansionPct: 0 });
    const grow = cacCalc({ cac: 3000, arpa: 200, grossMarginPct: 0.8, churnPct: 0.02, expansionPct: 0.03 });
    expect(grow.paybackMonths!).toBeLessThan(flat.paybackMonths!);
    expect(cacCalc({ cac: 1, arpa: 1, grossMarginPct: 1, churnPct: 0, expansionPct: 0, horizonMonths: 999 }).curve).toHaveLength(121);
    expect(cacCalc({ cac: 1, arpa: 1, grossMarginPct: 1, churnPct: 0, expansionPct: 0, horizonMonths: 1 }).curve).toHaveLength(13);
    expect(cacCalc({ cac: 0, arpa: 0, grossMarginPct: 0, churnPct: 0, expansionPct: 0 }).simplePaybackMonths).toBeNull();
  });
});

describe('share params and money', () => {
  it('round-trips and ignores unknown or bad keys', () => {
    const d = { a: 1, b: 2.5, c: 0 };
    const qs = encodeParams({ a: 10, b: 3.14159, c: 0 });
    expect(decodeParams('?' + qs, d)).toEqual({ a: 10, b: 3.1416, c: 0 });
    expect(decodeParams('a=abc&zzz=9&b=7', d)).toEqual({ a: 1, b: 7, c: 0 });
    expect(decodeParams('', d)).toEqual(d);
  });
  it('formats money', () => {
    expect(money(1234.5)).toBe('$1,235');
    expect(money(12.5)).toBe('$12.50');
    expect(money(-20000)).toBe('-$20,000');
    expect(money(5, 'EUR')).toContain('5.00');
    expect(money(5, 'NOPE!')).toContain('5.00');
  });
});

describe('bot log', () => {
  it('matches bots by user agent and parses CLF dates', () => {
    expect(matchBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot')?.id).toBe('gptbot');
    expect(matchBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)')?.id).toBe('claudebot');
    expect(matchBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36')).toBeNull();
    expect(parseClfDate('10/Nov/2026:13:55:36 +0000')).toBe(Date.UTC(2026, 10, 10, 13, 55, 36));
    expect(parseClfDate('10/Nov/2026:13:55:36 +0530')).toBe(Date.UTC(2026, 10, 10, 8, 25, 36));
    expect(LOG_BOTS).toHaveLength(22);
  });
  it('parses the combined format', () => {
    const log = [
      '20.171.207.11 - - [10/Nov/2026:13:55:36 +0000] "GET /products/kettle?variant=1 HTTP/1.1" 200 5123 "-" "Mozilla/5.0; compatible; GPTBot/1.2; +https://openai.com/gptbot"',
      '20.171.207.11 - - [10/Nov/2026:13:56:36 +0000] "GET /old HTTP/1.1" 404 300 "-" "Mozilla/5.0; compatible; GPTBot/1.2; +https://openai.com/gptbot"',
      '52.1.1.1 - - [11/Nov/2026:01:00:00 +0000] "GET / HTTP/2.0" 403 0 "-" "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"',
      '8.8.8.8 - - [11/Nov/2026:01:00:01 +0000] "GET / HTTP/2.0" 200 900 "https://google.com" "Mozilla/5.0 (Macintosh) Safari/605.1.15"',
      'garbage line',
    ].join('\n');
    const p = parseLog(log);
    expect(p.format).toBe('combined');
    expect(p.lines).toBe(5);
    expect(p.hits).toHaveLength(3);
    expect(p.humanish).toBe(1);
    const a = analyse(p);
    expect(a.botHits).toBe(3);
    const g = a.bots.find((b) => b.id === 'gptbot')!;
    expect(g).toMatchObject({ hits: 2, ok: 1, notFound: 1, ips: 1 });
    expect(g.topPaths[0].path).toMatch(/^\/(products\/kettle|old)$/);
    expect(a.bots.find((b) => b.id === 'perplexitybot')!.blocked).toBe(1);
    expect(a.span.days).toBe(2);
    expect(a.daily.map((d) => d.day)).toEqual(['2026-11-10', '2026-11-11']);
    expect(a.kinds.training).toBe(2);
    expect(a.kinds.search).toBe(1);
  });
  it('parses Cloudflare JSON lines and CSV', () => {
    const jl = [
      JSON.stringify({ ClientRequestUserAgent: 'ChatGPT-User/1.0', ClientRequestURI: '/pricing', EdgeResponseStatus: 200, EdgeStartTimestamp: '2026-11-09T10:00:00Z', ClientIP: '1.2.3.4' }),
      JSON.stringify({ ClientRequestUserAgent: 'Mozilla/5.0 Chrome/130', ClientRequestURI: '/', EdgeResponseStatus: 200, EdgeStartTimestamp: '2026-11-09T10:00:01Z', ClientIP: '1.2.3.5' }),
    ].join('\n');
    const pj = parseLog(jl);
    expect(pj.format).toBe('jsonl');
    expect(pj.hits).toHaveLength(1);
    expect(pj.hits[0]).toMatchObject({ bot: 'chatgpt-user', path: '/pricing', status: 200 });
    const csv = 'time,ip,path,status,user_agent\n2026-11-09T10:00:00Z,1.1.1.1,/a,200,"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"\n2026-11-09T10:00:05Z,1.1.1.2,/b,200,Mozilla/5.0 Firefox/130\n';
    const pc = parseLog(csv);
    expect(pc.format).toBe('csv');
    expect(pc.hits).toHaveLength(1);
    expect(pc.hits[0].bot).toBe('bingbot');
  });
  it('rejects text that is not a log and survives empty input', () => {
    expect(parseLog('hello world\nthis is not a log').format).toBe('unknown');
    expect(parseLog('').hits).toHaveLength(0);
    expect(analyse(parseLog('')).notes[0]).toMatch(/No known AI/);
  });
  it('the sample log analyses cleanly', () => {
    const a = analyse(parseLog(sampleLog()));
    expect(a.parse.format).toBe('combined');
    expect(a.botHits).toBeGreaterThan(20);
    expect(a.bots.length).toBeGreaterThanOrEqual(5);
    expect(a.span.days).toBeGreaterThanOrEqual(5);
    expect(a.topPaths.length).toBeGreaterThan(3);
    expect(a.notes.length).toBeGreaterThan(0);
    const shares = a.bots.reduce((s, b) => s + b.share, 0);
    expect(shares).toBeCloseTo(1, 5);
  });
});

describe('agent check engine', () => {
  it('a healthy Shopify store is ready', async () => {
    const log: string[] = [];
    const r = await agentCheck(fakeFetch(agentShop(), { log }), 'trailkettle.example', 'a1');
    expect(r.platform).toBe('shopify');
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(by).toMatchObject({ home: 'pass', feed: 'pass', pdp: 'pass', schema: 'pass', stock: 'pass', pjson: 'pass', cart: 'pass', checkout: 'pass' });
    expect(by.robots).not.toBe('fail');
    expect(r.product).toMatchObject({ price: '79.00', currency: 'EUR', availability: 'InStock', source: 'JSON-LD Product' });
    expect(r.stages.map((s) => s.id)).toEqual(['find', 'read', 'buy']);
    expect(r.verdict).not.toBe('not');
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.bots).toHaveLength(8);
    expect(r.looked).toContain('https://trailkettle.example/cart.js');
    // read-only: every request is a GET
    expect(log.length).toBeLessThanOrEqual(14);
  });
  it('a login wall on checkout and a dead cart mean not ready', async () => {
    const o = 'https://trailkettle.example';
    const r = await agentCheck(fakeFetch(agentShop({ [o + '/checkout']: { status: 302, headers: { location: o + '/account/login' } }, [o + '/cart.js']: { status: 403, body: 'no' } })), 'trailkettle.example', 'a2');
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
    expect(by.checkout.status).toBe('fail');
    expect(by.cart.status).toBe('fail');
    expect(by.checkout.fix).toBeTruthy();
    expect(r.verdict).toBe('not');
    expect(r.headline).toMatch(/Blocked at/);
  });
  it('robots.txt that blocks shopping bots fails the find stage', async () => {
    const o = 'https://trailkettle.example';
    const r = await agentCheck(fakeFetch(agentShop({ [o + '/robots.txt']: { body: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n', headers: { 'content-type': 'text/plain' } } })), 'trailkettle.example', 'a3');
    expect(r.checks.find((c) => c.id === 'robots')!.status).toBe('fail');
    expect(r.bots.find((b) => b.ua === 'OAI-SearchBot')).toMatchObject({ home: false, product: false });
    expect(r.bots.find((b) => b.ua === 'PerplexityBot')).toMatchObject({ home: true, product: true });
    expect(r.verdict).toBe('not');
  });
  it('a site that is down fails at the homepage', async () => {
    const r = await agentCheck(fakeFetch({ 'https://down.example/': { status: 0 } }), 'down.example', 'a4');
    expect(r.checks.find((c) => c.id === 'home')!.status).toBe('fail');
    expect(r.verdict).toBe('not');
    expect(r.checks).toHaveLength(1);
    expect(r.score).toBe(0);
    expect(r.bots).toHaveLength(0);
  });
  it('a non-store site gets a report without platform buy checks failing hard', async () => {
    const r = await agentCheck(fakeFetch(wordpressSite()), Object.keys(wordpressSite())[0], 'a5');
    expect(r.platform).not.toBe('shopify');
    expect(r.checks.find((c) => c.id === 'pdp')!.status).toBe('fail');
    expect(r.checks.length).toBeGreaterThan(4);
    const blog = await agentCheck(fakeFetch({ 'https://blog.example/': { body: '<html><head><title>Blog</title></head><body><h1>Blog</h1><p>Hello there.</p></body></html>' } }), 'blog.example', 'a6');
    expect(blog.headline).toMatch(/does not look like an online store/);
  });
  it('scoring helpers', () => {
    expect(scoreAgent([]).score).toBe(100);
    expect(productFromJsonLd([{ '@graph': [{ '@type': 'Product', name: 'X', offers: [{ price: '5', priceCurrency: 'USD' }] }] }])!.offer).toMatchObject({ price: '5' });
    expect(productFromJsonLd([{ '@type': 'Organization' }])).toBeNull();
  });
});

