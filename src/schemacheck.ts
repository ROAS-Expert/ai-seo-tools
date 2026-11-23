// Schema (JSON-LD) checker and generator. Pure: no DOM, no network. Used by /api/schema (checker, on the server)
// and by /js/tools.js (generator, in the browser). Rules follow Google's rich result docs: required fields make a
// type eligible, recommended fields make it useful to search engines and AI assistants.

export type Level = 'pass' | 'warn' | 'fail';
export interface NodeCheck { type: string; level: Level; name: string; missing: string[]; missingRecommended: string[]; notes: string[] }
export interface SchemaReport { found: string[]; parseErrors: number; microdata: string[]; nodes: NodeCheck[]; suggestions: Array<{ type: string; why: string }>; score: number }

type Node = Record<string, unknown>;
const has = (n: Node | undefined, k: string): boolean => {
  if (!n) return false;
  const v = n[k];
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};
const first = (v: unknown): Node | undefined => (Array.isArray(v) ? (v[0] as Node) : v && typeof v === 'object' ? (v as Node) : undefined);
const typeList = (n: Node): string[] => (typeof n['@type'] === 'string' ? [n['@type'] as string] : Array.isArray(n['@type']) ? (n['@type'] as string[]).filter((x) => typeof x === 'string') : []);
const label = (n: Node): string => String(n.name || n.headline || n['@id'] || '').slice(0, 80);

function checkProduct(n: Node): NodeCheck {
  const missing: string[] = [];
  const rec: string[] = [];
  const notes: string[] = [];
  if (!has(n, 'name')) missing.push('name');
  const offer = first(n.offers);
  if (!offer && !has(n, 'review') && !has(n, 'aggregateRating')) missing.push('offers (or review or aggregateRating)');
  if (offer) {
    const typ = typeList(offer)[0] || '';
    if (/AggregateOffer/i.test(typ)) {
      if (!has(offer, 'lowPrice')) missing.push('offers.lowPrice');
    } else if (!has(offer, 'price') && !has(offer, 'priceSpecification')) missing.push('offers.price');
    if (!has(offer, 'priceCurrency') && !has(first(offer.priceSpecification), 'priceCurrency')) missing.push('offers.priceCurrency');
    if (!has(offer, 'availability')) rec.push('offers.availability');
    if (!has(offer, 'shippingDetails')) rec.push('offers.shippingDetails');
    if (!has(offer, 'hasMerchantReturnPolicy')) rec.push('offers.hasMerchantReturnPolicy');
    if (has(offer, 'price') && !/^\d+(\.\d+)?$/.test(String(offer.price).trim())) notes.push('offers.price should be a plain number like 49.00, with no currency sign or comma.');
  }
  if (!has(n, 'image')) rec.push('image');
  if (!has(n, 'description')) rec.push('description');
  if (!has(n, 'brand')) rec.push('brand');
  if (!['sku', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'mpn'].some((k) => has(n, k))) rec.push('sku, gtin or mpn');
  if (!has(n, 'aggregateRating')) rec.push('aggregateRating');
  return { type: 'Product', level: missing.length ? 'fail' : rec.length > 2 ? 'warn' : 'pass', name: label(n), missing, missingRecommended: rec, notes };
}

const RULES: Record<string, { req: string[]; rec: string[] }> = {
  Organization: { req: ['name'], rec: ['url', 'logo', 'sameAs', 'contactPoint'] },
  OnlineStore: { req: ['name'], rec: ['url', 'logo', 'sameAs', 'hasMerchantReturnPolicy'] },
  Corporation: { req: ['name'], rec: ['url', 'logo', 'sameAs'] },
  WebSite: { req: ['name', 'url'], rec: ['potentialAction'] },
  LocalBusiness: { req: ['name', 'address'], rec: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'image', 'priceRange'] },
  Article: { req: ['headline'], rec: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  BlogPosting: { req: ['headline'], rec: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  NewsArticle: { req: ['headline'], rec: ['image', 'datePublished', 'dateModified', 'author', 'publisher'] },
  BreadcrumbList: { req: ['itemListElement'], rec: [] },
  FAQPage: { req: ['mainEntity'], rec: [] },
  ProductGroup: { req: ['name'], rec: ['hasVariant', 'variesBy', 'productGroupID'] },
  Event: { req: ['name', 'startDate', 'location'], rec: ['endDate', 'image', 'description', 'offers', 'organizer'] },
  Recipe: { req: ['name', 'image'], rec: ['author', 'recipeIngredient', 'recipeInstructions', 'totalTime'] },
  VideoObject: { req: ['name', 'thumbnailUrl', 'uploadDate'], rec: ['description', 'contentUrl', 'duration'] },
};

function checkGeneric(n: Node, t: string): NodeCheck {
  const r = RULES[t];
  const missing = r.req.filter((k) => !has(n, k));
  const rec = r.rec.filter((k) => !has(n, k));
  const notes: string[] = [];
  if (t === 'BreadcrumbList' && Array.isArray(n.itemListElement)) {
    (n.itemListElement as Node[]).forEach((li, i) => {
      if (!has(li, 'position')) notes.push('Breadcrumb item ' + (i + 1) + ' has no position.');
      if (!has(li, 'name') && !has(first(li.item), 'name')) notes.push('Breadcrumb item ' + (i + 1) + ' has no name.');
    });
  }
  if (t === 'FAQPage') {
    const qs = Array.isArray(n.mainEntity) ? (n.mainEntity as Node[]) : n.mainEntity ? [n.mainEntity as Node] : [];
    const bad = qs.filter((q) => !has(q, 'name') || !has(first(q.acceptedAnswer), 'text')).length;
    if (bad) notes.push(bad + ' question(s) lack a name or an answer text.');
    notes.push('Google now shows FAQ rich results mainly for government and health sites. The markup still helps AI assistants read your answers.');
  }
  if ((t === 'Organization' || t === 'OnlineStore' || t === 'Corporation') && !has(n, 'sameAs')) notes.push('sameAs links (Instagram, LinkedIn, Wikipedia, Crunchbase) help AI assistants tie your brand to one entity.');
  return { type: t, level: missing.length ? 'fail' : rec.length > 2 ? 'warn' : 'pass', name: label(n), missing, missingRecommended: rec, notes };
}

export function flatten(blocks: unknown[]): Node[] {
  const out: Node[] = [];
  const visit = (v: unknown, d: number): void => {
    if (!v || typeof v !== 'object' || d > 6) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visit(x, d + 1));
      return;
    }
    const o = v as Node;
    if (o['@type']) out.push(o);
    if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach((x) => visit(x, d + 1));
  };
  blocks.forEach((b) => visit(b, 0));
  return out;
}

export interface PageHints { isHome: boolean; looksLikeProduct: boolean; looksLikeArticle: boolean }

export function checkSchema(blocks: unknown[], parseErrors: number, microdata: string[], hints: PageHints): SchemaReport {
  const nodes = flatten(blocks);
  const checks: NodeCheck[] = [];
  const found: string[] = [];
  for (const n of nodes) {
    for (const t of typeList(n)) {
      found.push(t);
      if (t === 'Product') checks.push(checkProduct(n));
      else if (RULES[t]) checks.push(checkGeneric(n, t));
    }
  }
  const types = new Set(found);
  const hasAny = (...ts: string[]) => ts.some((t) => types.has(t));
  const suggestions: Array<{ type: string; why: string }> = [];
  if (parseErrors) suggestions.push({ type: 'Fix broken JSON-LD', why: parseErrors + ' JSON-LD block(s) on the page do not parse, so search engines skip them.' });
  if (hints.looksLikeProduct && !types.has('Product') && !types.has('ProductGroup')) suggestions.push({ type: 'Product', why: 'This looks like a product page but has no Product markup, so Google Shopping and AI assistants have to guess the price and stock.' });
  if (hints.isHome && !hasAny('Organization', 'OnlineStore', 'Corporation', 'LocalBusiness')) suggestions.push({ type: 'Organization', why: 'The homepage should say who you are: name, logo and your social profiles. That is how assistants link mentions of your brand to your site.' });
  if (hints.isHome && !types.has('WebSite')) suggestions.push({ type: 'WebSite', why: 'WebSite markup on the homepage gives Google your site name for search results.' });
  if (!hints.isHome && !types.has('BreadcrumbList')) suggestions.push({ type: 'BreadcrumbList', why: 'Breadcrumbs show where the page sits in your site, in search results and to crawlers.' });
  if (hints.looksLikeArticle && !hasAny('Article', 'BlogPosting', 'NewsArticle')) suggestions.push({ type: 'Article', why: 'This reads like an article. Author and date markup are the trust signals AI answers look for.' });
  let score = 100;
  for (const c of checks) score -= c.level === 'fail' ? 25 : c.level === 'warn' ? 8 : 0;
  score -= suggestions.length * 15;
  if (!checks.length) score = Math.min(score, 20);
  return { found: [...new Set(found)], parseErrors, microdata, nodes: checks, suggestions, score: Math.max(0, Math.min(100, Math.round(score))) };
}

// ---------------- generator ----------------

export interface GenField { key: string; label: string; hint?: string; multi?: boolean }
export const GEN_TYPES: Record<string, GenField[]> = {
  Product: [
    { key: 'name', label: 'Product name' }, { key: 'description', label: 'Short description' }, { key: 'image', label: 'Image URL' }, { key: 'url', label: 'Page URL' },
    { key: 'brand', label: 'Brand' }, { key: 'sku', label: 'SKU' }, { key: 'gtin', label: 'GTIN or barcode', hint: 'optional' },
    { key: 'price', label: 'Price', hint: 'number only, like 49.00' }, { key: 'currency', label: 'Currency', hint: 'USD, EUR, GBP' },
    { key: 'availability', label: 'Stock', hint: 'InStock, OutOfStock or PreOrder' }, { key: 'ratingValue', label: 'Average rating', hint: 'optional, like 4.7' }, { key: 'reviewCount', label: 'Number of reviews', hint: 'optional' },
    { key: 'shippingCost', label: 'Shipping cost', hint: 'optional, 0 for free' }, { key: 'shipTo', label: 'Ships to country', hint: 'optional, 2 letters like US' }, { key: 'returnDays', label: 'Return window in days', hint: 'optional' },
  ],
  Organization: [
    { key: 'name', label: 'Brand name' }, { key: 'url', label: 'Website' }, { key: 'logo', label: 'Logo URL' }, { key: 'description', label: 'One line on what you do' },
    { key: 'email', label: 'Contact email', hint: 'optional' }, { key: 'sameAs', label: 'Profiles', hint: 'one URL per line: Instagram, LinkedIn, X, YouTube', multi: true },
  ],
  LocalBusiness: [
    { key: 'name', label: 'Business name' }, { key: 'url', label: 'Website' }, { key: 'image', label: 'Photo or logo URL' }, { key: 'telephone', label: 'Phone' },
    { key: 'street', label: 'Street address' }, { key: 'city', label: 'City' }, { key: 'region', label: 'State or region' }, { key: 'postcode', label: 'Postcode' }, { key: 'country', label: 'Country', hint: '2 letters like US' },
    { key: 'hours', label: 'Opening hours', hint: 'one per line, like Mo-Fr 09:00-17:00', multi: true },
  ],
  FAQPage: [{ key: 'faq', label: 'Questions and answers', hint: 'one per line: Question | Answer', multi: true }],
  BreadcrumbList: [{ key: 'crumbs', label: 'Breadcrumb trail', hint: 'one per line, top level first: Name | URL', multi: true }],
  Article: [
    { key: 'headline', label: 'Headline' }, { key: 'image', label: 'Image URL' }, { key: 'author', label: 'Author name' }, { key: 'authorUrl', label: 'Author page URL', hint: 'optional' },
    { key: 'datePublished', label: 'Published', hint: 'YYYY-MM-DD' }, { key: 'dateModified', label: 'Updated', hint: 'optional, YYYY-MM-DD' }, { key: 'publisher', label: 'Publisher name' }, { key: 'publisherLogo', label: 'Publisher logo URL' },
  ],
};

function clean(o: Node): Node {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === '' || v === undefined || v === null || (Array.isArray(v) && !v.length)) delete o[k];
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      clean(v as Node);
      if (Object.keys(v as Node).filter((x) => x !== '@type').length === 0) delete o[k];
    }
  }
  return o;
}
const lines = (s: string | undefined): string[] => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const pair = (s: string): [string, string] => {
  const i = s.indexOf('|');
  return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
};
const num = (s: string | undefined): number | undefined => {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, ''));
  return isFinite(n) ? n : undefined;
};

export function buildSchema(type: string, f: Record<string, string>): Node {
  const g = (k: string): string => (f[k] || '').trim();
  const cur = g('currency').toUpperCase();
  let o: Node;
  if (type === 'Product') {
    const price = num(g('price'));
    const ship = g('shippingCost') !== '' ? num(g('shippingCost')) : undefined;
    o = {
      '@context': 'https://schema.org', '@type': 'Product', name: g('name'), description: g('description'), image: g('image') ? [g('image')] : '', url: g('url'), sku: g('sku'), gtin: g('gtin'),
      brand: g('brand') ? { '@type': 'Brand', name: g('brand') } : '',
      offers: {
        '@type': 'Offer', url: g('url'), price: price === undefined ? '' : price.toFixed(2), priceCurrency: cur,
        availability: g('availability') ? 'https://schema.org/' + g('availability').replace(/^https?:\/\/schema\.org\//, '').replace(/\s+/g, '') : '',
        shippingDetails: ship !== undefined || g('shipTo') ? { '@type': 'OfferShippingDetails', shippingRate: ship !== undefined ? { '@type': 'MonetaryAmount', value: ship, currency: cur } : '', shippingDestination: g('shipTo') ? { '@type': 'DefinedRegion', addressCountry: g('shipTo').toUpperCase() } : '' } : '',
        hasMerchantReturnPolicy: g('returnDays') ? { '@type': 'MerchantReturnPolicy', applicableCountry: (g('shipTo') || 'US').toUpperCase(), returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: num(g('returnDays')), returnMethod: 'https://schema.org/ReturnByMail' } : '',
      },
      aggregateRating: g('ratingValue') && g('reviewCount') ? { '@type': 'AggregateRating', ratingValue: num(g('ratingValue')), reviewCount: num(g('reviewCount')) } : '',
    };
  } else if (type === 'Organization') {
    o = { '@context': 'https://schema.org', '@type': 'Organization', name: g('name'), url: g('url'), logo: g('logo'), description: g('description'), email: g('email'), sameAs: lines(f.sameAs) };
  } else if (type === 'LocalBusiness') {
    o = {
      '@context': 'https://schema.org', '@type': 'LocalBusiness', name: g('name'), url: g('url'), image: g('image'), telephone: g('telephone'),
      address: { '@type': 'PostalAddress', streetAddress: g('street'), addressLocality: g('city'), addressRegion: g('region'), postalCode: g('postcode'), addressCountry: g('country').toUpperCase() },
      openingHours: lines(f.hours),
    };
  } else if (type === 'FAQPage') {
    o = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: lines(f.faq).map(pair).filter((p) => p[0] && p[1]).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  } else if (type === 'BreadcrumbList') {
    o = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: lines(f.crumbs).map(pair).filter((p) => p[0]).map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
  } else if (type === 'Article') {
    o = {
      '@context': 'https://schema.org', '@type': 'Article', headline: g('headline'), image: g('image') ? [g('image')] : '', datePublished: g('datePublished'), dateModified: g('dateModified') || g('datePublished'),
      author: g('author') ? { '@type': 'Person', name: g('author'), url: g('authorUrl') } : '',
      publisher: g('publisher') ? { '@type': 'Organization', name: g('publisher'), logo: g('publisherLogo') ? { '@type': 'ImageObject', url: g('publisherLogo') } : '' } : '',
    };
  } else {
    o = { '@context': 'https://schema.org', '@type': type };
  }
  return clean(o);
}

export function schemaScriptTag(o: Node): string {
  return '<script type="application/ld+json">\n' + JSON.stringify(o, null, 2).replace(/</g, '\\u003c') + '\n</script>';
}

/** Shopify Liquid version of the Product markup, for a custom liquid block on the product template. Values fill from the store. */
export const SHOPIFY_PRODUCT_LIQUID = [
  '{%- assign v = product.selected_or_first_available_variant -%}',
  '<script type="application/ld+json">',
  '{',
  '  "@context": "https://schema.org",',
  '  "@type": "Product",',
  '  "name": {{ product.title | json }},',
  '  "description": {{ product.description | strip_html | truncate: 500 | json }},',
  '  "image": [{{ product.featured_image | image_url: width: 1200 | prepend: "https:" | json }}],',
  '  "url": {{ shop.url | append: product.url | json }},',
  '  "sku": {{ v.sku | json }},',
  '  {%- if v.barcode != blank %}"gtin": {{ v.barcode | json }},{% endif %}',
  '  "brand": { "@type": "Brand", "name": {{ product.vendor | json }} },',
  '  "offers": {',
  '    "@type": "Offer",',
  '    "url": {{ shop.url | append: v.url | json }},',
  '    "price": {{ v.price | divided_by: 100.0 | json }},',
  '    "priceCurrency": {{ cart.currency.iso_code | json }},',
  '    "availability": "https://schema.org/{% if v.available %}InStock{% else %}OutOfStock{% endif %}"',
  '  }',
  '}',
  '</script>',
].join('\n');
