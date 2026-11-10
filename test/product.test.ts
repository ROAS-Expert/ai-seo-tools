import { describe, expect, it } from 'vitest';
import { auditProduct, collectProductFacts, detectProduct, productCacheKey, scoreProductFindings } from '../src/engine/product';
import { extractHtml } from '../src/engine/html';
import { PRODUCT_CATALOG } from '../src/engine/catalog';
import { FIXES } from '../src/engine/fixes';
import { fakeFetch, productShopifyGood, productShopifyBad, productWoo, productMagento, nonProductSite, SHOPIFY_PRODUCT_GOOD, BLOG_POST } from './fixtures';
import type { AuditReport } from '../src/engine/types';

const byId = (r: AuditReport, id: string) => r.findings.find((f) => f.id === id)!;
const answer = (r: AuditReport, q: string) => r.product!.answers.find((a) => a.question.startsWith(q))!;

async function run(site: ReturnType<typeof productShopifyGood>, url: string, id = 'p1') {
  const out = await auditProduct(fakeFetch(site), url, id);
  if (out.kind !== 'product') throw new Error('expected a product report, got ' + out.kind);
  return out.report;
}

describe('product catalog and fixes', () => {
  it('has 19 checks whose weights sum to 100, each with fix copy', () => {
    expect(PRODUCT_CATALOG.length).toBe(19);
    expect(PRODUCT_CATALOG.reduce((a, c) => a + c.weight, 0)).toBe(100);
    for (const c of PRODUCT_CATALOG) expect(FIXES[c.id]?.generic, c.id).toBeTruthy();
    const text = JSON.stringify(PRODUCT_CATALOG) + JSON.stringify(Object.fromEntries(PRODUCT_CATALOG.map((c) => [c.id, FIXES[c.id]])));
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/\b(seamless|leverage|robust|elevate|supercharge|game-changer|delve)/i);
  });
});

describe('product page extraction and detection', () => {
  it('reads product signals from the HTML', async () => {
    const h = await extractHtml(SHOPIFY_PRODUCT_GOOD, 'https://trailkettle.example/products/titanium-kettle-600');
    expect(h.product.meta['price:amount']).toBe('79.00');
    expect(h.product.addToCart).toBe(true);
    expect(h.product.variantInputs).toBeGreaterThan(0);
    expect(h.product.reviewSignals).toBe(true);
    expect(h.product.gallery).toEqual({ total: 2, withAlt: 2 });
    expect(h.product.text).toContain('€79.00');
    expect(h.product.text).not.toContain('"@type"');
    expect(h.product.bodyClass).toBe('template-product');
  });
  it('tells a product page from a blog post', async () => {
    const good = await extractHtml(SHOPIFY_PRODUCT_GOOD, 'https://trailkettle.example/products/titanium-kettle-600');
    const page = { url: '', finalUrl: 'https://trailkettle.example/products/titanium-kettle-600', status: 200, redirects: 0, ttfbMs: 1, totalMs: 1, bytes: 1, truncated: false, headers: {}, html: good };
    expect(detectProduct(page).isProduct).toBe(true);
    expect(detectProduct(page).signals).toContain('Product JSON-LD');
    const blog = await extractHtml(BLOG_POST, 'https://roasexpert.example/blog/what-is-llms-txt');
    const d = detectProduct({ ...page, finalUrl: 'https://roasexpert.example/blog/what-is-llms-txt', html: blog });
    expect(d.isProduct).toBe(false);
    expect(d.signals).toEqual([]);
    expect(d.looked.length).toBeGreaterThan(3);
  });
  it('builds a stable cache key', () => {
    expect(productCacheKey(new URL('https://www.store.example/products/a?utm_source=x&variant=1#top'))).toBe('https://store.example/products/a');
    expect(productCacheKey(new URL('https://store.example/products/a/'))).toBe('https://store.example/products/a');
    expect(productCacheKey(new URL('https://store.example/p?id=9'))).toBe('https://store.example/p?id=9');
  });
});

describe('product audits', () => {
  it('Shopify product with full schema scores A and answers every question', async () => {
    const r = await run(productShopifyGood(), 'https://trailkettle.example/products/titanium-kettle-600');
    expect(r.kind).toBe('product');
    expect(r.cms.id).toBe('shopify');
    expect(r.product?.name).toBe('600 ml titanium kettle');
    for (const id of ['product_jsonld', 'product_core_fields', 'product_offer', 'product_identifiers', 'product_shipping', 'product_returns', 'product_reviews', 'product_variants', 'price_no_js', 'stock_no_js', 'product_h1', 'product_image_alt', 'ai_shopping_bots', 'product_indexable', 'product_canonical', 'product_og', 'product_title_meta', 'shopify_product_json', 'platform_render']) {
      expect(byId(r, id).status, id).toBe('pass');
    }
    expect(r.findings.length).toBe(19);
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.grade).toBe('A');
    expect(r.categories.map((c) => c.id)).toEqual(['pdata', 'pread', 'paccess', 'ptags', 'pplatform']);
    expect(r.product!.answers.every((a) => a.state === 'readable')).toBe(true);
    expect(answer(r, 'Can it reach Berlin').fields.map((f) => f.name)).toContain('shippingDetails.deliveryTime');
    expect(r.product!.outside.length).toBe(3);
    expect(r.facts.aiBots['Bingbot']).toBe('allowed');
    expect(r.top.length).toBe(0);
  });

  it('a Shopify collection path with a /products/ canonical passes the canonical check', async () => {
    const r = await run(productShopifyGood(), 'https://trailkettle.example/collections/kettles/products/titanium-kettle-600');
    expect(byId(r, 'product_canonical').status).toBe('pass');
    expect(byId(r, 'product_canonical').detail).toMatch(/plain \/products\//);
  });

  it('Shopify product with no schema and a JS price fails the right checks with Shopify fixes', async () => {
    const r = await run(productShopifyBad(), 'badkettle.example/products/foggy-mug');
    expect(r.cms.id).toBe('shopify');
    expect(byId(r, 'product_jsonld').status).toBe('fail');
    expect(byId(r, 'product_jsonld').fix).toMatch(/main-product\.liquid/);
    expect(byId(r, 'product_offer').status).toBe('fail');
    expect(byId(r, 'product_shipping').status).toBe('fail');
    expect(byId(r, 'product_shipping').fix).toMatch(/OfferShippingDetails/);
    expect(byId(r, 'price_no_js').status).toBe('fail');
    expect(byId(r, 'stock_no_js').status).toBe('pass');
    expect(byId(r, 'product_h1').status).toBe('fail');
    expect(byId(r, 'product_image_alt').status).toBe('warn');
    expect(byId(r, 'ai_shopping_bots').status).toBe('fail');
    expect(byId(r, 'ai_shopping_bots').detail).toMatch(/Bingbot/);
    expect(byId(r, 'ai_shopping_bots').detail).toMatch(/PerplexityBot/);
    expect(byId(r, 'ai_shopping_bots').earned).toBeCloseTo(5 / 7, 3);
    expect(byId(r, 'product_canonical').status).toBe('fail');
    expect(byId(r, 'product_og').status).toBe('fail');
    expect(byId(r, 'product_title_meta').status).toBe('fail');
    expect(byId(r, 'shopify_product_json').status).toBe('fail');
    expect(byId(r, 'product_reviews').status).toBe('info');
    expect(r.facts.aiBots['Bingbot']).toBe('blocked');
    expect(r.facts.aiBots['PerplexityBot']).toBe('blocked');
    expect(r.score).toBeLessThan(30);
    expect(r.top[0].status).toBe('fail');
    expect(answer(r, 'What does it cost').state).toBe('not');
    expect(answer(r, 'Can it reach Berlin').state).toBe('not');
    expect(answer(r, 'Is it in stock').state).toBe('partly');
  });

  it('WooCommerce variable product: duplicate blocks warn, variants pass, shipping and returns fail', async () => {
    const r = await run(productWoo(), 'https://brew.example/product/espresso-blend/');
    expect(r.cms.id).toBe('woocommerce');
    expect(byId(r, 'product_jsonld').status).toBe('pass');
    expect(byId(r, 'product_offer').status).toBe('pass');
    expect(byId(r, 'product_variants').status).toBe('pass');
    expect(byId(r, 'product_identifiers').status).toBe('warn');
    expect(byId(r, 'product_shipping').status).toBe('fail');
    expect(byId(r, 'product_shipping').fix).toMatch(/woocommerce_structured_data_product/);
    expect(byId(r, 'product_returns').status).toBe('fail');
    expect(byId(r, 'platform_render').status).toBe('warn');
    expect(byId(r, 'platform_render').detail).toMatch(/2 Product JSON-LD blocks/);
    expect(byId(r, 'price_no_js').status).toBe('pass');
    expect(byId(r, 'stock_no_js').status).toBe('pass');
    expect(byId(r, 'product_h1').status).toBe('pass');
    expect(byId(r, 'product_image_alt').status).toBe('warn');
    expect(byId(r, 'shopify_product_json').status).toBe('skip');
    expect(byId(r, 'product_og').status).toBe('warn');
    expect(byId(r, 'ai_shopping_bots').status).toBe('pass');
    expect(answer(r, 'Which sizes').state).toBe('readable');
    expect(answer(r, 'Can I return it').state).toBe('not');
    expect(r.score).toBeGreaterThanOrEqual(55);
    expect(r.score).toBeLessThan(85);
  });

  it('Magento product: microdata only, price server side, two shopping crawlers blocked', async () => {
    const r = await run(productMagento(), 'https://parts.example/hydraulic-pump-abc-123.html');
    expect(r.cms.id).toBe('magento');
    expect(byId(r, 'product_jsonld').status).toBe('warn');
    expect(byId(r, 'product_jsonld').fix).toMatch(/catalog_product_view\.xml/);
    expect(byId(r, 'product_offer').status).toBe('fail');
    expect(byId(r, 'price_no_js').status).toBe('pass');
    expect(byId(r, 'price_no_js').detail).toMatch(/\$1,299/);
    expect(byId(r, 'stock_no_js').status).toBe('pass');
    expect(byId(r, 'platform_render').status).toBe('pass');
    expect(byId(r, 'ai_shopping_bots').status).toBe('warn');
    expect(byId(r, 'ai_shopping_bots').detail).toMatch(/ClaudeBot/);
    expect(byId(r, 'ai_shopping_bots').fix).toMatch(/Search Engine Robots/);
    expect(byId(r, 'product_variants').status).toBe('warn');
    expect(byId(r, 'product_og').status).toBe('fail');
    expect(byId(r, 'product_og').fix).toMatch(/no Open Graph tags by default/);
    expect(byId(r, 'shopify_product_json').status).toBe('skip');
    expect(r.product?.name).toBe('Hydraulic pump ABC-123');
    expect(answer(r, 'What does it cost').state).toBe('partly');
    expect(r.score).toBeLessThan(60);
  });

  it('a blog post is reported as not a product, with the signals looked for', async () => {
    const out = await auditProduct(fakeFetch(nonProductSite()), 'https://roasexpert.example/blog/what-is-llms-txt', 'p9');
    expect(out.kind).toBe('not_product');
    if (out.kind !== 'not_product') return;
    expect(out.title).toMatch(/llms\.txt/);
    expect(out.hostname).toBe('roasexpert.example');
    expect(out.signals).toEqual([]);
    expect(out.looked.join(' ')).toMatch(/JSON-LD/);
  });

  it('an unreachable product URL still gets a one-finding report with score 0', async () => {
    const out = await auditProduct(fakeFetch({}), 'https://nowhere.example/products/x', 'p0');
    expect(out.kind).toBe('product');
    if (out.kind !== 'product') return;
    expect(out.report.findings.length).toBe(1);
    expect(out.report.findings[0].id).toBe('product_indexable');
    expect(out.report.score).toBe(0);
  });

  it('noindex caps the score at 35 and not-applicable checks leave the denominator', () => {
    const base = { category: 'pdata' as const, label: 'x', detail: '', weight: 10 };
    const s1 = scoreProductFindings([{ ...base, id: 'a', status: 'pass' }, { ...base, id: 'b', status: 'info', weight: 50 }]);
    expect(s1.score).toBe(100);
    const s2 = scoreProductFindings([{ ...base, id: 'a', status: 'pass' }, { ...base, id: 'product_indexable', category: 'paccess', status: 'fail', weight: 5 }]);
    expect(s2.score).toBeLessThanOrEqual(35);
    const s3 = scoreProductFindings([{ ...base, id: 'a', status: 'fail', earned: 0.5 }]);
    expect(s3.score).toBe(50);
  });

  it('uses few requests', async () => {
    const log: string[] = [];
    await collectProductFacts(fakeFetch(productShopifyGood(), { log }), 'https://trailkettle.example/products/titanium-kettle-600');
    expect(log.length).toBeLessThanOrEqual(3);
  });
});
