import { describe, expect, it } from 'vitest';
import { buildUtm, ga4Channel, parseUtm, lintUtm } from '../src/utm';
import { marginCalc } from '../src/margin';
import { checkSchema, buildSchema } from '../src/schemacheck';
import { detectPixels } from '../src/engine/pixels';
import { detectStack, shopifyTheme } from '../src/engine/stack';

const cms = (id: string) => ({ id, name: id, ecommerce: true, confidence: 'high' as const, signals: [] });

describe('utm', () => {
  it('builds a link and keeps Meta macros unencoded', () => {
    const r = buildUtm({ url: 'shop.com/p?a=1&utm_source=old', source: 'facebook', medium: 'paid_social', campaign: '{{campaign.name}}', content: '{{ad.name}}' });
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://shop.com/p?a=1&utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}');
    expect(r.channel).toBe('Paid Social');
  });
  it('encodes spaces and warns about case', () => {
    const r = buildUtm({ url: 'https://shop.com/', source: 'Facebook', medium: 'paid_social', campaign: 'Black Friday' });
    expect(r.url).toContain('utm_campaign=Black%20Friday');
    expect(r.warnings.join(' ')).toMatch(/capital/);
    expect(r.warnings.join(' ')).toMatch(/spaces/);
  });
  it('maps GA4 channels', () => {
    expect(ga4Channel('google', 'cpc').channel).toBe('Paid Search');
    expect(ga4Channel('klaviyo', 'email').channel).toBe('Email');
    expect(ga4Channel('instagram', 'social').channel).toBe('Organic Social');
    expect(ga4Channel('creator', 'influencer').channel).toBe('Unassigned');
    expect(ga4Channel('newsletter', 'paid').channel).toBe('Paid Other');
    expect(ga4Channel('google', 'cpc', 'shopping-q4').channel).toBe('Paid Shopping');
  });
  it('reads tags back and needs source and medium', () => {
    expect(parseUtm('shop.com/x?utm_source=fb&utm_medium=cpc&k=1')?.tags).toEqual({ source: 'fb', medium: 'cpc' });
    expect(buildUtm({ url: 'shop.com', source: '', medium: 'cpc', campaign: 'x' }).ok).toBe(false);
    expect(lintUtm({ url: '', source: 'fb', medium: 'cpc', campaign: '' }).length).toBe(2);
  });
});

describe('margin', () => {
  it('works out margin, markup, break-even ROAS and price for target', () => {
    const r = marginCalc({ price: 100, discountPct: 0, cost: 40, shipping: 0, feePct: 0, feeFixed: 0, platformPct: 0, returnsPct: 0, cpa: 20, targetPct: 0.2 });
    expect(r.grossMarginPct).toBeCloseTo(0.6);
    expect(r.markupPct).toBeCloseTo(1.5);
    expect(r.contribution).toBe(60);
    expect(r.profit).toBe(40);
    expect(r.breakEvenRoas).toBeCloseTo(1.67, 2);
    expect(r.priceForTarget).toBe(75); // (40+20)/(1-0.2)
  });
  it('handles a loss-making product', () => {
    const r = marginCalc({ price: 10, discountPct: 0, cost: 9, shipping: 3, feePct: 0, feeFixed: 0, platformPct: 0, returnsPct: 0, cpa: 0, targetPct: 0 });
    expect(r.contribution).toBe(-2);
    expect(r.breakEvenRoas).toBeNull();
    expect(r.maxCpa).toBe(0);
  });
});

describe('schema', () => {
  it('flags a product missing price and suggests Organization on the homepage', () => {
    const r = checkSchema([{ '@context': 'https://schema.org', '@type': 'Product', name: 'Shoe', offers: { '@type': 'Offer', priceCurrency: 'USD' } }], 0, [], { isHome: true, looksLikeProduct: false, looksLikeArticle: false });
    expect(r.nodes[0].level).toBe('fail');
    expect(r.nodes[0].missing).toContain('offers.price');
    expect(r.suggestions.map((s) => s.type)).toEqual(['Organization', 'WebSite']);
  });
  it('suggests Product on a product page with none', () => {
    const r = checkSchema([], 1, [], { isHome: false, looksLikeProduct: true, looksLikeArticle: false });
    expect(r.suggestions.map((s) => s.type)).toEqual(['Fix broken JSON-LD', 'Product', 'BreadcrumbList']);
    expect(r.score).toBeLessThanOrEqual(20);
  });
  it('generates clean JSON-LD and drops empty fields', () => {
    const o = buildSchema('Product', { name: 'Shoe', price: '$49', currency: 'usd', availability: 'InStock', brand: '' });
    expect(o).toMatchObject({ '@type': 'Product', name: 'Shoe', offers: { price: '49.00', priceCurrency: 'USD', availability: 'https://schema.org/InStock' } });
    expect(o).not.toHaveProperty('brand');
    const f = buildSchema('FAQPage', { faq: 'Do you ship? | Yes, worldwide\nbad line' });
    expect((f.mainEntity as unknown[]).length).toBe(1);
  });
});

describe('pixels', () => {
  it('finds page tags and Shopify app pixels, and flags a double Meta pixel', () => {
    const html = `<script>fbq('init', '123456789012345');</script><script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
<script id="web-pixels-manager-setup">var x={"webPixelsConfigList":[{"id":"1","configuration":"{\\"pixel_id\\":\\"123456789012345\\",\\"pixel_type\\":\\"facebook_pixel\\"}","type":"APP"},{"id":"2","type":"CUSTOM"}]};</script>`;
    const r = detectPixels(html);
    const meta = r.tags.find((t) => t.id === 'meta')!;
    expect(meta.ids).toEqual(['123456789012345']);
    expect(meta.sources).toEqual(['page', 'shopify-app']);
    expect(r.tags.find((t) => t.id === 'ga4')?.ids).toEqual(['G-ABCDEF1234']);
    expect(r.customPixels).toBe(1);
    expect(r.issues.some((i) => i.title === 'Meta Pixel loads twice')).toBe(true);
    expect(r.issues.some((i) => i.title === 'No consent tool found')).toBe(true);
  });
  it('reports missing analytics', () => {
    const r = detectPixels('<html><body>hi</body></html>');
    expect(r.tags).toEqual([]);
    expect(r.issues[0].level).toBe('warn');
    expect(r.issues[0].title).toMatch(/page code/);
  });
});

describe('stack', () => {
  it('reads a renamed Shopify theme', () => {
    const t = shopifyTheme('<script>Shopify.theme = {"name":"Live - Nov 2026","id":1,"schema_name":"Impulse","schema_version":"7.4.0","theme_store_id":857,"role":"main"};</script>');
    expect(t).toMatchObject({ name: 'Live - Nov 2026', original: 'Impulse', version: '7.4.0', storeId: 857, renamed: true, storeUrl: 'https://themes.shopify.com/themes/impulse' });
  });
  it('does not call Dawn renamed when the name is Dawn', () => {
    expect(shopifyTheme('Shopify.theme = {"name":"Dawn","schema_name":"Dawn","theme_store_id":887};')?.renamed).toBe(false);
  });
  it('reads a WordPress child theme and apps', () => {
    const html = '<link href="/wp-content/themes/astra/style.css"><link href="/wp-content/themes/astra-child/a.css"><link href="/wp-content/themes/astra-child/b.css"><script src="https://static.klaviyo.com/onsite/js/klaviyo.js"></script><div class="jdgm-widget" data-judgeme></div>';
    const s = detectStack(html, cms('woocommerce'));
    expect(s.theme).toMatchObject({ name: 'astra-child', original: 'astra' });
    expect(s.apps.map((a) => a.name)).toEqual(['Klaviyo', 'Judge.me']);
  });
});
