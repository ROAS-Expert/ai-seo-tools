/**
 * Product page mode: one product URL in, a score out of 100 for how well a shopping assistant can read it.
 * Same engine pieces as the site audit (guarded fetch, HTMLRewriter extraction, robots parser, CMS detection, fixes).
 */
import type { AnswerState, AuditReport, CategoryScore, CmsResult, Finding, PageFacts, ProductAnswer, ProductCategory, ProductDetection, ProductFacts, RobotsFacts, Status } from './types';
import { guardedFetch, normaliseInput } from './fetcher';
import { ENGINE_VERSION, loadPage } from './audit';
import { findType, flattenJsonLd, typesOf } from './html';
import { isAllowed, parseRobots } from './robots';
import { detectCms } from './cms';
import { attachFixes } from './fixes';
import { EARN, grade, topFindings } from './score';

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  pdata: 'Structured data',
  pread: 'Readable without JS',
  paccess: 'Crawler access',
  ptags: 'Page tags',
  pplatform: 'Platform extras',
};
export const PRODUCT_CATEGORY_WEIGHTS: Record<ProductCategory, number> = { pdata: 45, pread: 20, paccess: 15, ptags: 12, pplatform: 8 };

/** The crawlers behind shopping answers. Bingbot carries Copilot and Bing Shopping, so it is a fail on its own. */
export const SHOPPING_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Google-Extended', 'PerplexityBot', 'Amazonbot', 'Bingbot', 'ClaudeBot'];

/** Signals that cannot be read from outside the account. Named in every report so nobody assumes they were checked. */
export const OUTSIDE_SIGNALS = [
  'Google Merchant Center feed status and shipping settings (they cover Google Shopping, not assistants reading the page)',
  'Shopify Agentic Storefront or Shopify Catalog enrollment',
  'Inventory, price or shipping feeds that sit behind a login or an API key',
];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const AVAIL_RE = /^(https?:\/\/schema\.org\/)?(InStock|OutOfStock|PreOrder|BackOrder|LimitedAvailability|OnlineOnly|InStoreOnly|SoldOut|Discontinued|PreSale)$/i;
const AVAIL_WORD_RE = /^(InStock|OutOfStock|PreOrder|BackOrder|LimitedAvailability|OnlineOnly|InStoreOnly|SoldOut|Discontinued|PreSale)$/i;
const ISO = 'USD|EUR|GBP|CAD|AUD|INR|JPY|CHF|SEK|NOK|DKK|NZD|SGD|AED|ZAR|BRL|MXN|PLN|CZK|HUF|RON|TRY|KRW|HKD';
const CURRENCY_RE = new RegExp(`(?:[$€£¥₹]|\\b(?:${ISO}|Rs\\.?)\\b)\\s?\\d[\\d.,]*|(?<![\\w-])\\d[\\d.,]*\\s?(?:[$€£¥₹](?!\\s?\\d)|\\b(?:${ISO}|kr|zł)\\b)`);
const STOCK_RE = /\b(in stock|out of stock|sold out|available|unavailable|add to (cart|bag|basket)|pre-?order|ships in|ships within|in-stock|only \d+ left|low stock|back ?order|buy now|dispatched within)\b/i;
const TRACKING_PARAMS = /^(utm_|fbclid|gclid|msclkid|ttclid|mc_|ref$|_ga|srsltid|variant$|currency$)/i;

/** Normalise a product URL for the cache key: https, no hash, no tracking parameters, no trailing slash. */
export function productCacheKey(u: URL): string {
  const x = new URL(u.toString());
  for (const k of [...x.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) x.searchParams.delete(k);
  x.hash = '';
  x.hostname = x.hostname.replace(/^www\./, '');
  let s = x.toString();
  if (x.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function shopifyHandle(pathname: string): string | null {
  const m = pathname.match(/\/products\/([a-z0-9][a-z0-9-_.%]*?)(?:\.js|\.json)?\/?$/i);
  return m ? m[1] : null;
}

export function productNode(page: PageFacts): Obj | undefined {
  const nodes = flattenJsonLd(page.html.jsonld);
  const p = findType(nodes, 'Product');
  if (p) return p;
  const g = findType(nodes, 'ProductGroup');
  if (g) return g;
  // Some themes nest the Product under mainEntity of a WebPage without a @type on the wrapper.
  for (const b of page.html.jsonld) {
    const o = obj(b);
    const me = o && obj(o['mainEntity']);
    if (me && typesOf(me).some((t) => /^product(group)?$/i.test(t))) return me;
  }
  return undefined;
}

function countProductNodes(page: PageFacts): number {
  return flattenJsonLd(page.html.jsonld).filter((n) => typesOf(n).some((t) => /^product$/i.test(t))).length;
}

export function detectProduct(page: PageFacts | null): ProductDetection {
  const looked = ['Product or ProductGroup JSON-LD', 'og:type product', 'a Shopify /products/ path', 'Magento catalog-product-view body class', 'WooCommerce single-product body class with a cart form', 'an add to cart, add to bag or add to basket control'];
  if (!page || page.status === 0) return { isProduct: false, signals: [], looked };
  const signals: string[] = [];
  const h = page.html;
  if (productNode(page)) signals.push('Product JSON-LD');
  else if (h.microdataTypes.includes('Product')) signals.push('Product microdata');
  const ogType = (h.og['type'] || '').toLowerCase();
  if (ogType === 'product' || ogType === 'product.item' || ogType.startsWith('product')) signals.push('og:type ' + ogType);
  let path = '/';
  try {
    path = new URL(page.finalUrl).pathname;
  } catch {
    /* ignore */
  }
  if (shopifyHandle(path) && /shopify|\/cdn\/shop\//i.test(h.htmlSample)) signals.push('Shopify /products/ path');
  if (/\bcatalog-product-view\b/.test(h.product.bodyClass)) signals.push('Magento catalog-product-view');
  if (/\bsingle-product\b/.test(h.product.bodyClass) && (h.product.addToCart || /\bwoocommerce\b/.test(h.product.bodyClass))) signals.push('WooCommerce single-product');
  if (h.product.addToCart) signals.push('add to cart control');
  // A cart button alone is not enough (collection pages have them too); pair it with something that names a product.
  const strong = signals.some((s) => !/^add to cart control$/.test(s));
  return { isProduct: strong || (h.product.addToCart && h.h1.length === 1 && h.product.variantInputs > 0), signals, looked };
}

export async function collectProductFacts(fetchImpl: import('./types').Fetcher, rawUrl: string): Promise<ProductFacts> {
  const started = Date.now();
  const input = normaliseInput(rawUrl);
  const hostname = input.hostname.replace(/^www\./, '');
  const res = await loadPage(fetchImpl, input.toString());
  const page = res.page;
  const finalOrigin = page ? new URL(page.finalUrl).origin : input.origin;
  const robotsRes = await guardedFetch(fetchImpl, `${finalOrigin}/robots.txt`, { maxBytes: 200000, timeoutMs: 7000 });
  const robotsIsText = robotsRes.status === 200 && !/<html|<!doctype/i.test(robotsRes.body.slice(0, 300));
  const robots = parseRobots(robotsIsText ? robotsRes.body : '', robotsRes.status);

  let shopifyJson: ProductFacts['shopifyJson'] = null;
  if (page && page.status > 0 && page.status < 400) {
    const path = new URL(page.finalUrl).pathname;
    const handle = shopifyHandle(path);
    const looksShopify = /shopify|\/cdn\/shop\//i.test(page.html.htmlSample) || !!page.headers['x-shopify-stage'] || !!page.headers['x-sorting-hat-shopid'];
    if (handle && looksShopify) {
      const url = `${finalOrigin}/products/${handle}.js`;
      const r = await guardedFetch(fetchImpl, url, { maxBytes: 400000, timeoutMs: 7000, headers: { accept: 'application/json,*/*;q=0.5' } });
      let isJson = false;
      let variants = 0;
      let hasPrice = false;
      if (r.status === 200 && !/<html|<!doctype/i.test(r.body.slice(0, 200))) {
        try {
          const j = JSON.parse(r.body) as Obj;
          isJson = true;
          variants = Array.isArray(j['variants']) ? (j['variants'] as unknown[]).length : 0;
          hasPrice = j['price'] !== undefined || (Array.isArray(j['variants']) && (j['variants'] as Obj[]).some((v) => v && v['price'] !== undefined));
        } catch {
          isJson = false;
        }
      }
      shopifyJson = { url, status: r.status, isJson, variants, hasPrice };
    }
  }
  return { requested: rawUrl, hostname, page, pageError: res.error, robots, shopifyJson, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started };
}

interface OfferFacts {
  present: boolean;
  type: string;
  price: unknown;
  lowPrice: unknown;
  highPrice: unknown;
  currency: string;
  availability: string;
  availabilityOk: boolean;
  availabilityPlain: boolean;
  url: string;
  shipping?: Obj;
  returns?: Obj;
  count: number;
}

export function readOffer(prod: Obj | undefined): OfferFacts {
  const empty: OfferFacts = { present: false, type: '', price: undefined, lowPrice: undefined, highPrice: undefined, currency: '', availability: '', availabilityOk: false, availabilityPlain: false, url: '', count: 0 };
  if (!prod) return empty;
  let offersRaw = prod['offers'];
  // ProductGroup: take the first variant's offer when the group has none.
  if (!offersRaw && Array.isArray(prod['hasVariant'])) {
    const v = obj((prod['hasVariant'] as unknown[])[0]);
    offersRaw = v?.['offers'];
  }
  const arr = Array.isArray(offersRaw) ? (offersRaw as unknown[]) : offersRaw ? [offersRaw] : [];
  const o = obj(arr[0]);
  if (!o) return empty;
  const type = typesOf(o)[0] || '';
  const avail = str(first(o['availability']));
  const price = o['price'] ?? (obj(first(o['priceSpecification'])) ?? {})['price'];
  const currency = str(o['priceCurrency'] || (obj(first(o['priceSpecification'])) ?? {})['priceCurrency']);
  return {
    present: true,
    type,
    price,
    lowPrice: o['lowPrice'],
    highPrice: o['highPrice'],
    currency,
    availability: avail,
    availabilityOk: AVAIL_RE.test(avail),
    availabilityPlain: !!avail && !AVAIL_RE.test(avail),
    url: str(o['url']),
    shipping: obj(first(o['shippingDetails'])) ?? obj(first(prod['shippingDetails'])),
    returns: obj(first(o['hasMerchantReturnPolicy'])) ?? obj(first(prod['hasMerchantReturnPolicy'])),
    count: arr.length,
  };
}

function shippingFields(s: Obj | undefined): { rate: boolean; time: boolean; dest: boolean } {
  if (!s) return { rate: false, time: false, dest: false };
  const rate = obj(first(s['shippingRate']));
  const dt = obj(first(s['deliveryTime']));
  const dest = s['shippingDestination'];
  return {
    rate: !!rate && (rate['value'] !== undefined || rate['minValue'] !== undefined || rate['maxValue'] !== undefined) && !!rate['currency'],
    time: !!dt && (!!dt['handlingTime'] || !!dt['transitTime'] || !!dt['businessDays']),
    dest: !!dest,
  };
}

function returnFields(r: Obj | undefined): { category: boolean; days: boolean; country: boolean } {
  if (!r) return { category: false, days: false, country: false };
  return { category: !!r['returnPolicyCategory'], days: r['merchantReturnDays'] !== undefined, country: !!r['applicableCountry'] || !!r['returnPolicyCountry'] };
}

function identifiers(p: Obj | undefined): { sku: boolean; gtin: boolean; brand: boolean } {
  if (!p) return { sku: false, gtin: false, brand: false };
  const gtinKeys = ['gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'isbn', 'mpn', 'productID'];
  return { sku: !!p['sku'], gtin: gtinKeys.some((k) => !!p[k]), brand: !!p['brand'] };
}

function ratingPresent(p: Obj | undefined): boolean {
  const r = p && obj(p['aggregateRating']);
  return !!r && r['ratingValue'] !== undefined && (r['reviewCount'] !== undefined || r['ratingCount'] !== undefined);
}

function variantMarkup(p: Obj | undefined, offer: OfferFacts): boolean {
  if (!p) return false;
  if (Array.isArray(p['hasVariant']) && (p['hasVariant'] as unknown[]).length > 0) return true;
  if (typesOf(p).some((t) => /^productgroup$/i.test(t))) return true;
  if (/aggregateoffer/i.test(offer.type) && offer.lowPrice !== undefined && offer.highPrice !== undefined) return true;
  return offer.count > 1;
}

function stripTracking(u: URL): string {
  const x = new URL(u.toString());
  for (const k of [...x.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) x.searchParams.delete(k);
  x.hash = '';
  return x.toString().replace(/\/$/, '');
}

export function runProductChecks(facts: ProductFacts, cms: CmsResult): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, category: ProductCategory, label: string, status: Status, weight: number, detail: string, evidence?: string, earned?: number) => {
    out.push({ id, category, label, status, weight, detail, evidence, ...(earned !== undefined ? { earned } : {}) });
  };
  const page = facts.page;
  const platform = cms.id;
  if (!page || page.status === 0) {
    add('product_indexable', 'paccess', 'Product page reachable and indexable', 'fail', 5, `We could not load the page: ${facts.pageError || 'no response'}. Check the address and that the store is public.`);
    return out;
  }
  if (page.blocked) {
    add('product_indexable', 'paccess', 'Product page reachable and indexable', 'fail', 5, `${page.blocked} stopped our crawler before it saw the page (HTTP ${page.status}). AI shopping crawlers meet the same wall unless their user agents are allow-listed.`, page.html.title.slice(0, 120));
    return out;
  }
  if (page.status >= 400) {
    add('product_indexable', 'paccess', 'Product page reachable and indexable', 'fail', 5, `The page returned HTTP ${page.status}. Nothing can read a product that answers an error.`);
    return out;
  }
  const h = page.html;
  const pf = h.product;
  const prod = productNode(page);
  const offer = readOffer(prod);
  const name = str(prod?.['name']) || h.og['title'] || h.h1[0] || h.title;
  const finalU = new URL(page.finalUrl);
  const path = finalU.pathname;

  // ---------- Structured data (45) ----------
  const productNodes = countProductNodes(page);
  if (h.jsonldErrors && !prod) add('product_jsonld', 'pdata', 'Product JSON-LD present and valid', 'fail', 10, `${h.jsonldErrors} JSON-LD block${h.jsonldErrors === 1 ? '' : 's'} failed to parse and no Product block was readable. Broken JSON is ignored entirely, so the assistant sees no product data.`);
  else if (prod) add('product_jsonld', 'pdata', 'Product JSON-LD present and valid', 'pass', 10, `A ${typesOf(prod)[0]} block parses${h.jsonldErrors ? `, though ${h.jsonldErrors} other block${h.jsonldErrors === 1 ? '' : 's'} on the page ${h.jsonldErrors === 1 ? 'is' : 'are'} broken JSON` : ''}.`);
  else if (h.microdataTypes.includes('Product')) add('product_jsonld', 'pdata', 'Product JSON-LD present and valid', 'warn', 10, 'Product markup exists as microdata only. Assistants read microdata less reliably than JSON-LD, and microdata rarely carries shipping and return fields.');
  else add('product_jsonld', 'pdata', 'Product JSON-LD present and valid', 'fail', 10, `No Product JSON-LD on the page${h.jsonld.length ? ' (found ' + [...new Set(flattenJsonLd(h.jsonld).flatMap(typesOf))].slice(0, 4).join(', ') + ')' : ''}. This is the block shopping assistants read first for price, stock, shipping and identity.`);

  if (prod) {
    const img = first(prod['image']);
    const imgUrl = str(typeof img === 'object' ? (obj(img) ?? {})['url'] : img);
    const desc = str(prod['description']).trim();
    const missing: string[] = [];
    if (!str(prod['name'])) missing.push('name');
    if (!/^https?:\/\//i.test(imgUrl)) missing.push('image (absolute URL)');
    if (!desc || desc.length < 20 || desc === h.metaDescription.trim() && desc.length < 40) missing.push('description');
    if (missing.length) add('product_core_fields', 'pdata', 'Name, image and description', missing.length >= 2 ? 'fail' : 'warn', 5, `The Product block is missing ${missing.join(', ')}.`);
    else add('product_core_fields', 'pdata', 'Name, image and description', 'pass', 5, `name "${str(prod['name']).slice(0, 60)}", an absolute image URL and a ${desc.length} character description.`);

    if (!offer.present) add('product_offer', 'pdata', 'Offer with price, currency, availability and url', 'fail', 10, 'The Product block has no offers. Without an Offer the assistant cannot quote a price or say whether the item is in stock.');
    else {
      const priceOk = offer.price !== undefined ? Number.isFinite(Number(String(offer.price).replace(/,/g, ''))) : offer.lowPrice !== undefined;
      const curOk = /^[A-Z]{3}$/.test(offer.currency);
      const problems: string[] = [];
      let status: Status = 'pass';
      if (!priceOk) {
        problems.push('price is missing or not a number');
        status = 'fail';
      }
      if (!offer.availability) {
        problems.push('availability is missing');
        status = 'fail';
      } else if (offer.availabilityPlain) problems.push(`availability is plain text ("${offer.availability.slice(0, 30)}") instead of a schema.org URL`);
      if (!curOk) problems.push(`priceCurrency ${offer.currency ? '"' + offer.currency + '" is not an ISO code' : 'is missing'}`);
      if (!offer.url) problems.push('url is missing');
      if (status !== 'fail' && problems.length) status = 'warn';
      add('product_offer', 'pdata', 'Offer with price, currency, availability and url', status, 10, problems.length ? `${offer.type || 'Offer'}: ${problems.join('; ')}.` : `${offer.type}: ${offer.price ?? offer.lowPrice} ${offer.currency}, ${offer.availability.replace(/^https?:\/\/schema\.org\//, '')}, with a url.`);
    }

    const ids = identifiers(prod);
    const have = [ids.sku && 'sku', ids.gtin && 'gtin or mpn', ids.brand && 'brand'].filter(Boolean) as string[];
    const lack = [!ids.sku && 'sku', !ids.gtin && 'gtin or mpn', !ids.brand && 'brand'].filter(Boolean) as string[];
    if (!have.length) add('product_identifiers', 'pdata', 'sku, gtin or mpn, and brand', 'fail', 4, 'No sku, gtin, mpn or brand. Assistants match products across stores by identifier; without one yours is just a name.');
    else if (lack.length) add('product_identifiers', 'pdata', 'sku, gtin or mpn, and brand', 'warn', 4, `Has ${have.join(', ')}; missing ${lack.join(', ')}.`);
    else add('product_identifiers', 'pdata', 'sku, gtin or mpn, and brand', 'pass', 4, 'sku, a gtin or mpn, and brand are all present.');

    const sh = shippingFields(offer.shipping);
    if (!offer.shipping) add('product_shipping', 'pdata', 'Shipping details in the offer', 'fail', 5, 'No OfferShippingDetails. "Can it reach me by Friday" and "what does delivery cost" cannot be answered from this page. Merchant Center shipping settings cover Google Shopping only, not assistants reading the page.');
    else {
      const lack2 = [!sh.rate && 'shippingRate (value and currency)', !sh.time && 'deliveryTime (handlingTime or transitTime)', !sh.dest && 'shippingDestination'].filter(Boolean) as string[];
      add('product_shipping', 'pdata', 'Shipping details in the offer', lack2.length ? 'warn' : 'pass', 5, lack2.length ? `OfferShippingDetails is present but missing ${lack2.join(', ')}.` : 'OfferShippingDetails with a rate, delivery time and destination.');
    }

    const rt = returnFields(offer.returns);
    if (!offer.returns) add('product_returns', 'pdata', 'Return policy in the offer', 'fail', 5, 'No MerchantReturnPolicy. The assistant cannot say whether or how the item can be returned.');
    else {
      const lack3 = [!rt.category && 'returnPolicyCategory', !rt.days && !rt.country && 'merchantReturnDays (or applicableCountry with a category)'].filter(Boolean) as string[];
      add('product_returns', 'pdata', 'Return policy in the offer', lack3.length ? 'warn' : 'pass', 5, lack3.length ? `MerchantReturnPolicy is present but missing ${lack3.join(', ')}.` : `MerchantReturnPolicy with a category${rt.days ? ' and a return window' : ''}.`);
    }
  } else {
    for (const [id, label, w] of [
      ['product_core_fields', 'Name, image and description', 5],
      ['product_offer', 'Offer with price, currency, availability and url', 10],
      ['product_identifiers', 'sku, gtin or mpn, and brand', 4],
      ['product_shipping', 'Shipping details in the offer', 5],
      ['product_returns', 'Return policy in the offer', 5],
    ] as Array<[string, string, number]>) {
      add(id, 'pdata', label, 'fail', w, 'There is no Product JSON-LD to carry this field.');
    }
  }

  if (pf.reviewSignals) {
    if (ratingPresent(prod)) add('product_reviews', 'pdata', 'Ratings in the structured data', 'pass', 3, 'The page shows reviews and the Product block carries aggregateRating with a value and a count.');
    else add('product_reviews', 'pdata', 'Ratings in the structured data', 'warn', 3, 'The page shows reviews, but the Product block has no aggregateRating (ratingValue plus reviewCount or ratingCount). "Is it any good" gets answered from somewhere else.');
  } else add('product_reviews', 'pdata', 'Ratings in the structured data', 'info', 3, 'No reviews visible on the page, so this check is not scored.');

  const variantsVisible = pf.variantInputs > 0 || (facts.shopifyJson?.variants ?? 0) > 1;
  if (variantsVisible) {
    if (variantMarkup(prod, offer)) add('product_variants', 'pdata', 'Variants in the structured data', 'pass', 3, 'Variants are visible and the markup carries them (hasVariant, ProductGroup, an AggregateOffer with a price range, or one offer per variant).');
    else add('product_variants', 'pdata', 'Variants in the structured data', 'warn', 3, `The page offers ${pf.variantInputs || facts.shopifyJson?.variants} variant control${(pf.variantInputs || facts.shopifyJson?.variants) === 1 ? '' : 's'} but the Product block names no hasVariant, ProductGroup or AggregateOffer with lowPrice and highPrice. "Which sizes exist" cannot be answered from the data.`);
  } else add('product_variants', 'pdata', 'Variants in the structured data', 'info', 3, 'No variant controls on the page, so this check is not scored.');

  // ---------- Readable without JavaScript (20) ----------
  const priceInText = CURRENCY_RE.test(pf.text);
  const priceInData = offer.price !== undefined || offer.lowPrice !== undefined || !!pf.meta['price:amount'];
  if (priceInText) add('price_no_js', 'pread', 'Price in the HTML without JavaScript', 'pass', 8, `A price appears in the server HTML text (${(pf.text.match(CURRENCY_RE) || [''])[0].trim().slice(0, 20)}).`);
  else if (priceInData) add('price_no_js', 'pread', 'Price in the HTML without JavaScript', 'warn', 8, 'The price is only in structured data or meta tags, not in the visible HTML text. Most AI crawlers read the data, but a price drawn by JavaScript is missed by the ones that quote what they see.');
  else add('price_no_js', 'pread', 'Price in the HTML without JavaScript', 'fail', 8, 'No price anywhere in the server HTML: not in the text, not in the Product block, not in meta tags. A crawler that runs no JavaScript sees a product with no price.');

  const stockMatch = pf.text.match(STOCK_RE);
  if (stockMatch) add('stock_no_js', 'pread', 'Stock status in the HTML without JavaScript', 'pass', 6, `The HTML text says "${stockMatch[0]}".`);
  else if (offer.availabilityOk) add('stock_no_js', 'pread', 'Stock status in the HTML without JavaScript', 'warn', 6, 'No stock words (in stock, sold out, add to cart, ships in) in the HTML text. The Offer carries availability, so data readers manage; text readers do not.');
  else add('stock_no_js', 'pread', 'Stock status in the HTML without JavaScript', 'fail', 6, 'No stock words in the HTML text and no availability in the data. The assistant cannot say whether the item can be bought.');

  const h1 = h.h1;
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (h1.length === 0) add('product_h1', 'pread', 'One H1 that names the product', 'fail', 3, 'No H1 on the page.');
  else if (h1.length > 1) add('product_h1', 'pread', 'One H1 that names the product', 'fail', 3, `${h1.length} H1 headings: "${h1.slice(0, 3).map((x) => x.slice(0, 40)).join('" / "')}". One product, one H1.`);
  else if (name && (norm(h1[0]).includes(norm(name)) || norm(name).includes(norm(h1[0])))) add('product_h1', 'pread', 'One H1 that names the product', 'pass', 3, `H1 "${h1[0].slice(0, 80)}" matches the product name.`);
  else add('product_h1', 'pread', 'One H1 that names the product', 'warn', 3, `H1 "${h1[0].slice(0, 60)}" differs from the product name "${name.slice(0, 60)}".`);

  const g = pf.gallery.total ? pf.gallery : pf.firstImages;
  if (!g.total) add('product_image_alt', 'pread', 'Product images have alt text', 'info', 3, 'No product images found in the HTML (they may load from a script).');
  else if (g.withAlt === g.total) add('product_image_alt', 'pread', 'Product images have alt text', 'pass', 3, `All ${g.total} product image${g.total === 1 ? ' has' : 's have'} alt text.`);
  else add('product_image_alt', 'pread', 'Product images have alt text', 'warn', 3, `${g.total - g.withAlt} of ${g.total} product images have no alt text. Assistants that describe the item use the alt text.`);

  // ---------- Crawler access (15) ----------
  const r = facts.robots;
  const access: Record<string, 'allowed' | 'blocked'> = {};
  for (const ua of SHOPPING_BOTS) access[ua] = r && r.present && !isAllowed(r, ua, path) ? 'blocked' : 'allowed';
  const blocked = SHOPPING_BOTS.filter((ua) => access[ua] === 'blocked');
  const allowedN = SHOPPING_BOTS.length - blocked.length;
  const share = allowedN / SHOPPING_BOTS.length;
  if (!blocked.length) add('ai_shopping_bots', 'paccess', 'AI shopping crawlers allowed on this path', 'pass', 10, r?.present ? `robots.txt lets all seven in for ${path}: ${SHOPPING_BOTS.join(', ')}.` : 'No robots.txt rules, so every crawler is allowed.');
  else if (blocked.includes('Bingbot')) add('ai_shopping_bots', 'paccess', 'AI shopping crawlers allowed on this path', 'fail', 10, `robots.txt blocks ${blocked.join(', ')} for ${path}. Bingbot feeds Copilot and Bing Shopping, so that one alone removes you from those answers.${allowedN ? ` Allowed: ${SHOPPING_BOTS.filter((u) => access[u] === 'allowed').join(', ')}.` : ''}`, undefined, share);
  else add('ai_shopping_bots', 'paccess', 'AI shopping crawlers allowed on this path', 'warn', 10, `robots.txt blocks ${blocked.join(', ')} for ${path} (${allowedN} of 7 allowed). Each blocked crawler is one assistant that cannot quote this page.`, undefined, share);

  const noindex = /\bnoindex\b/.test(h.metaRobots) || /\bnoindex\b/.test((page.headers['x-robots-tag'] || '').toLowerCase());
  if (noindex) add('product_indexable', 'paccess', 'Product page reachable and indexable', 'fail', 5, 'The page carries a noindex directive. Search engines and most assistants drop it on sight.', h.metaRobots);
  else if (h.textWords < 30) add('product_indexable', 'paccess', 'Product page reachable and indexable', 'fail', 5, `Only ${h.textWords} words of text in the raw HTML. The page is a JavaScript shell to a crawler that runs no scripts.`);
  else add('product_indexable', 'paccess', 'Product page reachable and indexable', 'pass', 5, `HTTP ${page.status}, no noindex, ${h.textWords} words of text in the HTML.`);

  // ---------- Page tags (12) ----------
  if (!h.canonical) add('product_canonical', 'ptags', 'Self-referencing canonical', 'fail', 4, 'No canonical link. Collection paths, variants and tracking parameters all become duplicate product pages.');
  else {
    let c: URL | null = null;
    try {
      c = new URL(h.canonical, page.finalUrl);
    } catch {
      /* ignore */
    }
    const self = stripTracking(finalU);
    const cHandle = c ? shopifyHandle(c.pathname) : null;
    const pHandle = shopifyHandle(path);
    if (!c) add('product_canonical', 'ptags', 'Self-referencing canonical', 'warn', 4, `Canonical "${h.canonical}" is not a valid URL.`);
    else if (c.hostname.replace(/^www\./, '') !== finalU.hostname.replace(/^www\./, '')) add('product_canonical', 'ptags', 'Self-referencing canonical', 'fail', 4, `The canonical points to another host (${c.hostname}). You are handing this product's ranking to that domain.`, h.canonical);
    else if (stripTracking(c) === self || (pHandle && cHandle && pHandle === cHandle)) add('product_canonical', 'ptags', 'Self-referencing canonical', 'pass', 4, pHandle && cHandle && stripTracking(c) !== self ? `Canonical points at the plain /products/${cHandle} URL, as Shopify should.` : 'Self-referencing canonical.');
    else add('product_canonical', 'ptags', 'Self-referencing canonical', 'warn', 4, `The canonical points to ${c.pathname} rather than this page.`, h.canonical);
  }

  const og = h.og;
  const ogType = (og['type'] || '').toLowerCase();
  const ogMissing: string[] = [];
  if (!ogType.startsWith('product')) ogMissing.push('og:type product');
  if (!og['image']) ogMissing.push('og:image');
  if (!og['title']) ogMissing.push('og:title');
  const priceTags = !!pf.meta['price:amount'] && !!pf.meta['price:currency'];
  if (ogMissing.length) add('product_og', 'ptags', 'Open Graph product tags', ogMissing.some((m) => m !== 'og:title') ? 'fail' : 'warn', 4, `Missing ${ogMissing.join(', ')}${priceTags ? '' : ' and product:price:amount with product:price:currency'}.`);
  else if (!priceTags) add('product_og', 'ptags', 'Open Graph product tags', 'warn', 4, 'og:type, og:title and og:image are set, but product:price:amount and product:price:currency are missing. Link previews and some catalog readers use them.');
  else add('product_og', 'ptags', 'Open Graph product tags', 'pass', 4, `og:type ${ogType}, og:title, og:image and product:price:amount ${pf.meta['price:amount']} ${pf.meta['price:currency']}.`);

  const tl = h.title.length;
  const dl = h.metaDescription.length;
  if (!tl || !dl) add('product_title_meta', 'ptags', 'Title and meta description', 'fail', 4, !tl && !dl ? 'No title and no meta description.' : !tl ? 'No title tag.' : 'No meta description.');
  else {
    const issues: string[] = [];
    if (tl < 15 || tl > 60) issues.push(`title is ${tl} characters`);
    if (name && !norm(h.title).includes(norm(name).split(' ').slice(0, 3).join(' '))) issues.push('title does not contain the product name');
    if (dl < 50 || dl > 160) issues.push(`meta description is ${dl} characters`);
    add('product_title_meta', 'ptags', 'Title and meta description', issues.length ? 'warn' : 'pass', 4, issues.length ? issues.join('; ') + '.' : `Title ${tl} characters with the product name, meta description ${dl} characters.`);
  }

  // ---------- Platform extras (8) ----------
  const sj = facts.shopifyJson;
  if (platform === 'shopify' || sj) {
    if (!sj) add('shopify_product_json', 'pplatform', 'Shopify /products/handle.js answers JSON', 'info', 5, 'The URL has no /products/<handle> path, so the JSON endpoint could not be tested.');
    else if (sj.isJson && sj.hasPrice) add('shopify_product_json', 'pplatform', 'Shopify /products/handle.js answers JSON', 'pass', 5, `/products/<handle>.js returns JSON with ${sj.variants} variant${sj.variants === 1 ? '' : 's'} and prices. Agents and feeds read this endpoint.`);
    else if (sj.isJson) add('shopify_product_json', 'pplatform', 'Shopify /products/handle.js answers JSON', 'warn', 5, '/products/<handle>.js returns JSON but no price or variants.');
    else add('shopify_product_json', 'pplatform', 'Shopify /products/handle.js answers JSON', 'fail', 5, `/products/<handle>.js answered HTTP ${sj.status}${sj.status === 200 ? ' with HTML instead of JSON' : ''}. A password page, a redirect app or a storefront that blocks the endpoint hides the product from agents that read it.`);
  } else add('shopify_product_json', 'pplatform', 'Shopify /products/handle.js answers JSON', 'skip', 5, `Shopify only; this page runs on ${cms.name}.`);

  if (platform === 'shopify' || sj) {
    if (productNodes > 1) add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'warn', 3, `${productNodes} Product JSON-LD blocks on the page. Usually the theme plus an app both emit one; keep the complete one.`);
    else add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'pass', 3, 'One Product block from the theme.');
  } else if (platform === 'woocommerce' || platform === 'wordpress') {
    if (productNodes > 1) add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'warn', 3, `${productNodes} Product JSON-LD blocks: WooCommerce core plus an SEO plugin (Yoast, Rank Math) are both emitting. Keep one, and put shipping and returns in it.`);
    else add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'pass', 3, 'One Product block.');
  } else if (platform === 'magento') {
    if (priceInText && /\bswatch|super_attribute|product-options\b/i.test(h.classSample + ' ' + h.htmlSample)) add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'pass', 3, 'Price and swatches are in the server HTML.');
    else if (priceInText) add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'pass', 3, 'The price is in the server HTML.');
    else add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'warn', 3, 'The price box is empty in the server HTML; it is filled from the price-box JSON config by JavaScript. Crawlers that run no scripts see no price.');
  } else add('platform_render', 'pplatform', 'One Product block, price rendered server side', 'skip', 3, `Shopify, WooCommerce and Magento only; this page runs on ${cms.name}.`);

  return out;
}

export function scoreProductFindings(findings: Finding[]): { score: number; grade: string; categories: CategoryScore[] } {
  const cats: CategoryScore[] = [];
  let earnedAll = 0;
  let possibleAll = 0;
  for (const id of Object.keys(PRODUCT_CATEGORY_WEIGHTS) as ProductCategory[]) {
    const fs = findings.filter((f) => f.category === id && f.status !== 'info' && f.status !== 'skip');
    const possible = fs.reduce((a, f) => a + f.weight, 0);
    const earned = fs.reduce((a, f) => a + f.weight * (f.earned ?? EARN[f.status]), 0);
    cats.push({ id, label: PRODUCT_CATEGORY_LABELS[id], score: possible ? Math.round((earned / possible) * 100) : 0, earned, possible, weight: PRODUCT_CATEGORY_WEIGHTS[id] });
    earnedAll += earned;
    possibleAll += possible;
  }
  let score = possibleAll ? Math.round((earnedAll / possibleAll) * 100) : 0;
  const idx = findings.find((f) => f.id === 'product_indexable');
  if (idx?.status === 'fail') score = findings.length === 1 ? 0 : Math.min(score, 35);
  return { score, grade: grade(score), categories: cats };
}

/** Which questions a shopping assistant can answer from this page, and which fields decide it. */
export function productAnswers(facts: ProductFacts, findings: Finding[]): ProductAnswer[] {
  const page = facts.page;
  const prod = page ? productNode(page) : undefined;
  const offer = readOffer(prod);
  const by = (id: string) => findings.find((f) => f.id === id);
  const sh = shippingFields(offer.shipping);
  const rt = returnFields(offer.returns);
  const ids = identifiers(prod);
  const priceNoJs = by('price_no_js')?.status === 'pass';
  const stockNoJs = by('stock_no_js')?.status === 'pass';
  const priceOk = offer.price !== undefined || offer.lowPrice !== undefined;
  const state = (fields: Array<{ name: string; present: boolean }>): AnswerState => {
    const n = fields.filter((f) => f.present).length;
    return n === fields.length ? 'readable' : n ? 'partly' : 'not';
  };
  const rows: Array<Omit<ProductAnswer, 'state'>> = [
    { question: 'What does it cost', fields: [{ name: 'offers.price', present: priceOk }, { name: 'offers.priceCurrency', present: /^[A-Z]{3}$/.test(offer.currency) }, { name: 'price in the HTML text', present: priceNoJs }], note: 'The data gives the number; the text gives readers that quote the page.' },
    { question: 'Is it in stock', fields: [{ name: 'offers.availability', present: offer.availabilityOk }, { name: 'stock words in the HTML text', present: stockNoJs }], note: 'A schema.org availability URL plus a visible "in stock" or "add to cart".' },
    { question: 'Can it reach Berlin by Friday', fields: [{ name: 'shippingDetails.deliveryTime', present: sh.time }, { name: 'shippingDestination', present: sh.dest }, { name: 'shippingRate', present: sh.rate }, { name: 'offers.availability', present: offer.availabilityOk }], note: 'Handling and transit days, the countries served, the rate, and whether it is in stock today.' },
    { question: 'Can I return it', fields: [{ name: 'hasMerchantReturnPolicy', present: !!offer.returns }, { name: 'merchantReturnDays', present: rt.days }, { name: 'returnPolicyCategory', present: rt.category }], note: 'A return window and a category (finite window, unlimited, or no returns).' },
    { question: 'Which sizes or colours exist', fields: [{ name: 'hasVariant or AggregateOffer', present: variantMarkup(prod, offer) }, { name: 'variant controls on the page', present: (page?.html.product.variantInputs ?? 0) > 0 || (facts.shopifyJson?.variants ?? 0) > 1 }], note: 'Only scored when the page offers variants.' },
    { question: 'Is this the exact item', fields: [{ name: 'gtin or mpn', present: ids.gtin }, { name: 'brand', present: ids.brand }, { name: 'sku', present: ids.sku }], note: 'Identifiers let the assistant match your listing to the same product elsewhere.' },
    { question: 'Is it any good', fields: [{ name: 'aggregateRating', present: ratingPresent(prod) }], note: `A rating value with a count${prod && prod['review'] ? ', and review entries are there too' : '; review entries help further'}.` },
  ];
  return rows.map((r) => ({ ...r, state: state(r.fields) }));
}

export function buildProductReport(facts: ProductFacts, id: string): AuditReport {
  const cms = detectCms(facts.page);
  const findings = attachFixes(runProductChecks(facts, cms), cms.id);
  const { score, grade: g, categories } = scoreProductFindings(findings);
  const top = topFindings(findings, 3);
  const page = facts.page;
  const prod = page ? productNode(page) : undefined;
  const name = (prod && str(prod['name'])) || page?.html.og['title'] || page?.html.h1[0] || page?.html.title || facts.requested;
  const path = page ? new URL(page.finalUrl).pathname : '/';
  const aiBots: Record<string, 'allowed' | 'blocked' | 'partial'> = {};
  if (facts.robots) for (const ua of SHOPPING_BOTS) aiBots[ua] = facts.robots.present && !isAllowed(facts.robots, ua, path) ? 'blocked' : 'allowed';
  const detection = page ? detectProduct(page).signals : [];
  return {
    id,
    kind: 'product',
    product: { name: name.slice(0, 200), answers: productAnswers(facts, findings), outside: OUTSIDE_SIGNALS, detection },
    version: ENGINE_VERSION,
    url: page?.finalUrl || facts.requested,
    hostname: facts.hostname,
    cms,
    score,
    grade: g,
    categories,
    findings,
    top,
    summary: null,
    facts: {
      ttfbMs: page?.ttfbMs ?? 0,
      bytes: page?.bytes ?? 0,
      status: page?.status ?? 0,
      finalUrl: page?.finalUrl || '',
      title: page?.html.title || '',
      jsonldTypes: page ? [...new Set(flattenJsonLd(page.html.jsonld).flatMap(typesOf))] : [],
      keyPageUrl: facts.shopifyJson?.url ?? null,
      keyPageKind: facts.shopifyJson ? 'shopify-json' : 'none',
      sitemapUrls: 0,
      aiBots,
    },
    unlocked: false,
    createdAt: facts.startedAt,
    durationMs: facts.durationMs,
  };
}

export type ProductAuditResult = { kind: 'product'; report: AuditReport } | { kind: 'not_product'; url: string; title: string; signals: string[]; looked: string[]; hostname: string; error?: string };

export async function auditProduct(fetchImpl: import('./types').Fetcher, rawUrl: string, id: string): Promise<ProductAuditResult> {
  const facts = await collectProductFacts(fetchImpl, rawUrl);
  const det = detectProduct(facts.page);
  const page = facts.page;
  // An unreachable or blocked page still gets a report (score 0) so the visitor sees why; a readable non-product page does not.
  const unreadable = !page || page.status === 0 || page.status >= 400 || !!page.blocked;
  if (!det.isProduct && !unreadable) {
    return { kind: 'not_product', url: page!.finalUrl, title: page!.html.title, signals: det.signals, looked: det.looked, hostname: facts.hostname };
  }
  return { kind: 'product', report: buildProductReport(facts, id) };
}

/** Robots access for the seven shopping crawlers on one path, for the report table. */
export function shoppingBotAccess(robots: RobotsFacts | null, path: string): Record<string, 'allowed' | 'blocked'> {
  const out: Record<string, 'allowed' | 'blocked'> = {};
  for (const ua of SHOPPING_BOTS) out[ua] = robots && robots.present && !isAllowed(robots, ua, path) ? 'blocked' : 'allowed';
  return out;
}
