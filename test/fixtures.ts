import type { Fetcher } from '../src/engine/types';

export interface Site {
  [path: string]: { status?: number; body?: string; headers?: Record<string, string>; delay?: number } | undefined;
}

/** Build a fake fetcher from a map of full URLs to responses. Unknown URLs return 404. */
export function fakeFetch(site: Site, opts: { log?: string[] } = {}): Fetcher {
  return async (url: string, init?: RequestInit) => {
    opts.log?.push(url);
    const u = new URL(url);
    const key = u.origin + u.pathname + u.search;
    const exact = site[key] ?? site[u.origin + u.pathname];
    const entry = exact ?? (u.pathname.startsWith('/roas-audit-missing-') ? site[u.origin + '/__missing__'] : undefined) ?? site[u.origin + '/*'];
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (!entry) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
    if (entry.delay) await new Promise((r) => setTimeout(r, entry.delay));
    const status = entry.status ?? 200;
    if (status === 0) throw new TypeError('fetch failed: connection refused');
    const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', ...(entry.headers ?? {}) });
    return new Response(status >= 300 && status < 400 ? null : entry.body ?? '', { status, headers });
  };
}

export const SHOPIFY_HOME = `<!doctype html>
<html lang="en" class="js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trail Kettle Co. | Lightweight camping kettles and stoves</title>
<meta name="description" content="Titanium kettles and stoves for hikers who count grams. Free EU shipping over 60 EUR, 30-day returns, made in Sweden.">
<link rel="canonical" href="https://trailkettle.example/">
<link rel="icon" href="/cdn/shop/files/favicon.png">
<meta property="og:title" content="Trail Kettle Co.">
<meta property="og:description" content="Titanium kettles and stoves for hikers.">
<meta property="og:image" content="https://cdn.shopify.com/s/files/1/0001/og.jpg">
<script src="https://cdn.shopify.com/shopifycloud/shopify/assets/storefront/load_feature.js" defer></script>
<script>window.Shopify = window.Shopify || {}; Shopify.theme = {"name":"Dawn"};</script>
<script src="/cdn/shop/t/12/assets/global.js" defer></script>
<link rel="stylesheet" href="/cdn/shop/t/12/assets/base.css">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Trail Kettle Co.","url":"https://trailkettle.example/","logo":"https://cdn.shopify.com/s/files/1/0001/logo.png","sameAs":["https://instagram.com/trailkettle","https://linkedin.com/company/trailkettle","https://trustpilot.com/review/trailkettle.example"]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Trail Kettle Co.","url":"https://trailkettle.example/","potentialAction":{"@type":"SearchAction","target":"https://trailkettle.example/search?q={q}","query-input":"required name=q"}}</script>
</head>
<body class="template-index">
<header><a href="/"><img src="/cdn/shop/files/logo.webp" alt="Trail Kettle Co." width="120"></a>
<nav><a href="/collections/kettles">Kettles</a><a href="/collections/stoves">Stoves</a><a href="/blogs/journal">Journal</a><a href="/pages/about">About</a></nav></header>
<main id="MainContent">
<div class="shopify-section"><h1>Titanium kettles for people who count grams</h1>
<p>Every Trail Kettle is pressed from a single sheet of grade 1 titanium in our workshop outside Gothenburg. The result is a kettle that weighs less than your phone, boils half a litre in under four minutes on a canister stove, and will outlast the tent you carry it in. We ship across the EU and the UK, and every order comes with a 30-day return window so you can test it on a real trail before you decide.</p>
<h2>Why hikers switch to titanium</h2>
<p>Aluminium kettles dent, steel kettles weigh twice as much, and silicone collapsibles taste of silicone. Titanium holds its shape for decades, does not react with food, and shrugs off the knocks of a pack that gets thrown in a boot every weekend. Our 600 ml model weighs 92 grams with the lid, which is less than a bar of soap.</p>
<h2>Built in Sweden, shipped in days</h2>
<p>Orders placed before 14:00 CET leave the same day with DHL or PostNord. Most EU addresses see delivery in two to four working days, and we publish the live shipping table on every product page so there are no surprises at checkout.</p>
<h2>Questions people ask before buying</h2>
<div class="faq"><details><summary>Can I use it on an open fire?</summary><p>Yes. Titanium is fine on wood fires; keep the handle away from direct flame.</p></details><details><summary>Does it come with a lid?</summary><p>Every kettle ships with a hinged lid and a mesh bag.</p></details></div>
<div class="grid">
<img src="/cdn/shop/files/kettle-600.webp" alt="600 ml titanium kettle" loading="lazy">
<img src="/cdn/shop/files/kettle-900.webp" alt="900 ml titanium kettle" loading="lazy">
<img src="/cdn/shop/files/stove-mini.webp" alt="Mini canister stove" loading="lazy">
<img src="/cdn/shop/files/stove-wood.webp" alt="" loading="lazy">
<img src="/cdn/shop/files/bag.webp" alt="Mesh carry bag" loading="lazy">
<img src="/cdn/shop/files/lid.webp" alt="Hinged lid detail" loading="lazy">
</div>
<a href="/products/titanium-kettle-600">600 ml kettle</a>
<a href="/products/titanium-kettle-900">900 ml kettle</a>
</div>
</main>
<footer><p>Trail Kettle Co. AB, Gothenburg. <a href="https://instagram.com/trailkettle" rel="nofollow">Instagram</a></p></footer>
</body></html>`;

export const SHOPIFY_PRODUCT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>600 ml titanium kettle | Trail Kettle Co.</title>
<meta name="description" content="92 gram titanium kettle, 600 ml, hinged lid, made in Sweden."><link rel="canonical" href="https://trailkettle.example/products/titanium-kettle-600">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"600 ml titanium kettle","image":["https://cdn.shopify.com/s/files/1/0001/kettle-600.jpg"],"description":"92 gram titanium kettle","sku":"TK-600","brand":{"@type":"Brand","name":"Trail Kettle"},"offers":{"@type":"Offer","price":"79.00","priceCurrency":"EUR","availability":"https://schema.org/InStock","url":"https://trailkettle.example/products/titanium-kettle-600"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://trailkettle.example/"},{"@type":"ListItem","position":2,"name":"Kettles","item":"https://trailkettle.example/collections/kettles"}]}</script>
</head><body class="template-product"><main><h1>600 ml titanium kettle</h1><p>Our best seller. Boils 500 ml in 3 minutes 40 seconds on a standard canister stove at sea level. Weighs 92 grams with lid.</p><button name="add" class="product-form__submit">Add to cart</button></main></body></html>`;

export const SHOPIFY_ROBOTS = `# we use Shopify as our ecommerce platform
User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /blogs/*+*
Disallow: /*/blogs/*+*
Disallow: /*design_theme_id*
Disallow: /*preview_theme_id*
Disallow: /policies/
Disallow: /*/policies/
Allow: /products/*.atom
Sitemap: https://trailkettle.example/sitemap.xml

User-agent: adsbot-google
Disallow: /checkouts/

User-agent: Nutch
Disallow: /
`;

export const SHOPIFY_SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://trailkettle.example/sitemap_products_1.xml?from=1&amp;to=99</loc></sitemap><sitemap><loc>https://trailkettle.example/sitemap_pages_1.xml</loc></sitemap></sitemapindex>`;
export const SHOPIFY_SITEMAP_PRODUCTS = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://trailkettle.example/products/titanium-kettle-600</loc></url><url><loc>https://trailkettle.example/products/titanium-kettle-900</loc></url></urlset>`;

export function shopifySite(): Site {
  const o = 'https://trailkettle.example';
  return {
    [o + '/']: { body: SHOPIFY_HOME, headers: { 'content-encoding': 'br', 'x-shopify-stage': 'production', 'cache-control': 'max-age=0, private, must-revalidate' } },
    ['http://trailkettle.example/']: { status: 301, headers: { location: 'https://trailkettle.example/' } },
    ['https://www.trailkettle.example/']: { status: 301, headers: { location: 'https://trailkettle.example/' } },
    [o + '/robots.txt']: { body: SHOPIFY_ROBOTS, headers: { 'content-type': 'text/plain' } },
    [o + '/sitemap.xml']: { body: SHOPIFY_SITEMAP_INDEX, headers: { 'content-type': 'application/xml' } },
    [o + '/sitemap_products_1.xml?from=1&to=99']: { body: SHOPIFY_SITEMAP_PRODUCTS, headers: { 'content-type': 'application/xml' } },
    [o + '/products/titanium-kettle-600']: { body: SHOPIFY_PRODUCT, headers: { 'content-encoding': 'br' } },
    [o + '/__missing__']: { status: 404, body: '<html><body>Not found</body></html>' },
  };
}

export const WP_HOME = `<!DOCTYPE html><html lang="de-DE"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bäckerei Lindner</title>
<meta name="generator" content="WordPress 6.8.2">
<meta name="robots" content="noindex, follow">
<link rel="stylesheet" href="https://baeckerei-lindner.example/wp-content/themes/astra/style.css">
<script src="https://baeckerei-lindner.example/wp-includes/js/jquery/jquery.min.js"></script>
<script src="https://baeckerei-lindner.example/wp-content/plugins/woocommerce/assets/js/frontend/add-to-cart.min.js"></script>
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script>
<script src="https://cdn.example/a.js"></script><script src="https://cdn.example/b.js"></script><script src="https://cdn.example/c.js"></script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Bäckerei Lindner","url":"https://baeckerei-lindner.example/"}]}</script>
<script type="application/ld+json">{bad json,}</script>
</head><body class="home woocommerce woocommerce-page">
<h1>Willkommen</h1><h1>Frisch gebacken</h1>
<h3>Unsere Brote</h3>
<img src="/wp-content/uploads/brot.jpg"><img src="/wp-content/uploads/brot2.jpg"><img src="/wp-content/uploads/brot3.jpg" alt="Roggenbrot"><img src="/wp-content/uploads/b4.jpg"><img src="/wp-content/uploads/b5.jpg">
<p>Seit 1952 backen wir in Freiburg. Brot, Brötchen und Kuchen aus eigener Herstellung.</p>
<a href="/produkt/roggenbrot/">Roggenbrot</a>
<a href="/shop/">Shop</a>
</body></html>`;

export function wordpressSite(): Site {
  const o = 'https://baeckerei-lindner.example';
  return {
    [o + '/']: { body: WP_HOME, headers: { 'x-robots-tag': 'index', 'cache-control': 'no-cache' }, delay: 5 },
    ['http://baeckerei-lindner.example/']: { status: 200, body: WP_HOME },
    ['https://www.baeckerei-lindner.example/']: { status: 200, body: WP_HOME },
    [o + '/robots.txt']: { status: 404, body: '<html><body>404</body></html>' },
    [o + '/sitemap.xml']: { status: 404, body: '<html>404</html>' },
    [o + '/sitemap_index.xml']: { status: 404 },
    [o + '/wp-sitemap.xml']: { status: 404 },
    [o + '/__missing__']: { status: 200, body: '<html><body>Seite nicht gefunden</body></html>' },
    [o + '/produkt/roggenbrot/']: { body: '<html><head><title>Roggenbrot</title></head><body class="single-product"><h1>Roggenbrot</h1><p>1 kg Laib aus Roggensauerteig.</p><button class="single_add_to_cart_button">In den Warenkorb</button></body></html>' },
  };
}

export const MAGENTO_HOME = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Home page</title>
<meta name="description" content="Default Description">
<link rel="stylesheet" href="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/css/styles-m.css">
<script src="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/requirejs/require.js"></script>
<script src="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/mage/requirejs/mixins.js"></script>
<script src="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/requirejs-config.js"></script>
<script src="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/jquery.js"></script>
</head><body class="cms-index-index page-layout-1column" data-container="body" data-mage-init='{"loaderAjax": {}, "loader": { "icon": "loader-2.gif"}}'>
<script type="text/x-magento-init">{"*": {"Magento_PageCache/js/form-key-provider": {}}}</script>
<div class="page-wrapper"><header><a class="logo" href="https://parts.example/"><img src="/static/version1729000000/frontend/Vendor/theme/en_US/images/logo.svg" alt="Parts Example"></a></header>
<main id="maincontent"><h1 class="page-title">Home page</h1><p>CMS homepage content goes here.</p>
<a href="https://parts.example/hydraulic-pump-abc-123.html">Hydraulic pump</a><a href="https://parts.example/pumps.html">Pumps</a>
</main></div></body></html>`;

export const MAGENTO_PRODUCT = `<!doctype html><html lang="en"><head><title>Hydraulic pump ABC-123</title><link rel="canonical" href="https://parts.example/hydraulic-pump-abc-123.html"></head><body class="catalog-product-view page-layout-1column" data-mage-init='{}'>
<main><div class="product-info-main" itemscope itemtype="http://schema.org/Product"><h1 itemprop="name">Hydraulic pump ABC-123</h1><span class="price" itemprop="price">1,299.00</span><button id="product-addtocart-button" title="Add to Cart">Add to Cart</button></div></main></body></html>`;

export function magentoSite(): Site {
  const o = 'https://parts.example';
  return {
    [o + '/']: { body: MAGENTO_HOME, headers: { 'set-cookie': 'form_key=abc; path=/; X-Magento-Vary=1', 'content-encoding': 'gzip' }, delay: 1200 },
    ['http://parts.example/']: { status: 301, headers: { location: 'https://parts.example/' } },
    ['https://www.parts.example/']: { status: 301, headers: { location: 'https://parts.example/' } },
    [o + '/robots.txt']: { body: 'User-agent: *\nDisallow: /checkout/\nDisallow: /customer/\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\nSitemap: https://parts.example/sitemap.xml\n', headers: { 'content-type': 'text/plain' } },
    [o + '/sitemap.xml']: { body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://parts.example/</loc></url><url><loc>https://parts.example/hydraulic-pump-abc-123.html</loc></url><url><loc>https://parts.example/pumps.html</loc></url></urlset>', headers: { 'content-type': 'application/xml' } },
    [o + '/hydraulic-pump-abc-123.html']: { body: MAGENTO_PRODUCT },
    [o + '/__missing__']: { status: 404, body: '<html>404</html>' },
    [o + '/llms.txt']: { body: '# Parts Example\n\n> Industrial hydraulic parts.\n\n- [Pumps](https://parts.example/pumps.html): all pumps\n', headers: { 'content-type': 'text/plain' } },
  };
}

export const FRAMER_HOME = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="Framer 2d5bd1a"><title>Orbit Analytics</title><meta name="description" content="Revenue analytics for B2B SaaS teams.">
<link rel="icon" href="https://framerusercontent.com/images/favicon.png"><link rel="canonical" href="https://orbit.example/">
<meta property="og:title" content="Orbit Analytics"><meta property="og:image" content="https://framerusercontent.com/images/og.png">
<script async src="https://events.framer.com/script"></script>
</head><body><div id="main" data-framer-hydrate-v2='{"routeId":"augiA20Il"}'><div class="framer-abc"><h1 class="framer-text">Revenue analytics that finance trusts</h1></div></div></body></html>`;

export function framerSite(): Site {
  const o = 'https://orbit.example';
  return {
    [o + '/']: { body: FRAMER_HOME, headers: { 'content-encoding': 'br', 'x-framer-server': 'x' } },
    ['http://orbit.example/']: { status: 308, headers: { location: 'https://orbit.example/' } },
    ['https://www.orbit.example/']: { status: 0 },
    [o + '/robots.txt']: { body: 'User-agent: *\nAllow: /\nSitemap: https://orbit.example/sitemap.xml\n', headers: { 'content-type': 'text/plain' } },
    [o + '/sitemap.xml']: { body: '<?xml version="1.0"?><urlset><url><loc>https://orbit.example/</loc></url><url><loc>https://orbit.example/pricing</loc></url></urlset>', headers: { 'content-type': 'application/xml' } },
    [o + '/pricing']: { body: '<html lang="en"><head><title>Pricing</title></head><body><h1>Pricing</h1><p>Simple plans.</p></body></html>' },
    [o + '/__missing__']: { status: 404, body: '<html>404</html>' },
  };
}

// ---------- Product page mode fixtures ----------

export const SHOPIFY_PRODUCT_GOOD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>600 ml titanium kettle | Trail Kettle Co.</title>
<meta name="description" content="92 gram titanium kettle, 600 ml, hinged lid, made in Sweden. Free EU shipping over 60 EUR and 30-day returns.">
<link rel="canonical" href="https://trailkettle.example/products/titanium-kettle-600">
<meta property="og:type" content="product"><meta property="og:title" content="600 ml titanium kettle"><meta property="og:image" content="https://cdn.shopify.com/s/files/1/0001/kettle-600.jpg">
<meta property="product:price:amount" content="79.00"><meta property="product:price:currency" content="EUR">
<script src="/cdn/shop/t/12/assets/global.js" defer></script>
<script>window.Shopify = window.Shopify || {}; Shopify.theme = {"name":"Dawn"};</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"600 ml titanium kettle","image":["https://cdn.shopify.com/s/files/1/0001/kettle-600.jpg"],"description":"A 92 gram titanium kettle with a hinged lid, pressed from one sheet of grade 1 titanium in Sweden.","sku":"TK-600","gtin13":"7350012345678","brand":{"@type":"Brand","name":"Trail Kettle"},"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"212"},"offers":[{"@type":"Offer","sku":"TK-600","price":"79.00","priceCurrency":"EUR","availability":"https://schema.org/InStock","url":"https://trailkettle.example/products/titanium-kettle-600?variant=11","shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":"4.90","currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","handlingTime":{"@type":"QuantitativeValue","minValue":0,"maxValue":1,"unitCode":"DAY"},"transitTime":{"@type":"QuantitativeValue","minValue":2,"maxValue":4,"unitCode":"DAY"}}},"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnFiniteReturnWindow","merchantReturnDays":30,"returnMethod":"https://schema.org/ReturnByMail","returnFees":"https://schema.org/FreeReturn"}},{"@type":"Offer","sku":"TK-900","price":"99.00","priceCurrency":"EUR","availability":"https://schema.org/InStock","url":"https://trailkettle.example/products/titanium-kettle-600?variant=12"}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://trailkettle.example/"}]}</script>
</head><body class="template-product">
<header><a href="/"><img src="/cdn/shop/files/logo.webp" alt="Trail Kettle Co."></a></header>
<main id="MainContent">
<div class="shopify-section product">
<div class="product__media-gallery"><img src="/cdn/shop/files/kettle-600.webp" alt="600 ml titanium kettle on a rock"><img src="/cdn/shop/files/kettle-600-lid.webp" alt="Hinged lid detail"></div>
<h1 class="product__title">600 ml titanium kettle</h1>
<div class="price"><span class="price-item">€79.00</span></div>
<div class="jdgm-prev-badge">4.8 out of 5 stars, 212 reviews</div>
<form method="post" action="/cart/add" class="product-form">
<div class="product-form__input"><label>Size</label><select name="options[Size]"><option>600 ml</option><option>900 ml</option></select></div>
<button type="submit" name="add" class="product-form__submit">Add to cart</button>
</form>
<p class="stock">In stock, ships in 1 to 2 days from Gothenburg.</p>
<div class="product__description"><p>Our best seller. Boils 500 ml in 3 minutes 40 seconds on a standard canister stove at sea level. Weighs 92 grams with the lid, which is less than a bar of soap. Pressed from one sheet of grade 1 titanium, so there is no seam to fail and nothing to react with your tea. Comes with a hinged lid and a mesh bag, and a 30 day return window if the trail says otherwise.</p></div>
</div></main>
<footer><p>Trail Kettle Co. AB</p></footer>
</body></html>`;

export const SHOPIFY_PRODUCT_JSON = JSON.stringify({ id: 1, title: '600 ml titanium kettle', handle: 'titanium-kettle-600', price: 7900, variants: [{ id: 11, title: '600 ml', price: 7900, available: true }, { id: 12, title: '900 ml', price: 9900, available: true }] });

export function productShopifyGood(): Site {
  const o = 'https://trailkettle.example';
  return {
    [o + '/products/titanium-kettle-600']: { body: SHOPIFY_PRODUCT_GOOD, headers: { 'content-encoding': 'br', 'x-shopify-stage': 'production' } },
    [o + '/collections/kettles/products/titanium-kettle-600']: { body: SHOPIFY_PRODUCT_GOOD, headers: { 'x-shopify-stage': 'production' } },
    [o + '/products/titanium-kettle-600.js']: { body: SHOPIFY_PRODUCT_JSON, headers: { 'content-type': 'application/json' } },
    [o + '/robots.txt']: { body: SHOPIFY_ROBOTS, headers: { 'content-type': 'text/plain' } },
    [o + '/']: { body: SHOPIFY_HOME, headers: { 'x-shopify-stage': 'production' } },
  };
}

export const SHOPIFY_PRODUCT_BAD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mug</title>
<meta property="og:type" content="website"><meta property="og:title" content="Foggy mug">
<script src="/cdn/shop/t/3/assets/theme.js"></script>
<script>window.Shopify = {}; Shopify.theme = {"name":"Old"}; window.__price = 1200;</script>
</head><body class="template-product">
<header><h1><a href="/">Bad Kettle</a></h1></header>
<main id="MainContent" class="shopify-section">
<div class="product-single__photos"><img src="/cdn/shop/files/mug.jpg"><img src="/cdn/shop/files/mug-2.jpg"></div>
<h1>Foggy mug</h1>
<div id="price" class="price"></div>
<button class="btn" id="AddToCart">Add to cart</button>
<p>A mug. It holds coffee and sometimes tea. Enamel on steel, chips if you drop it, which you will. Grey, because the fog is grey. Sold in sets of one.</p>
</main></body></html>`;

export function productShopifyBad(): Site {
  const o = 'https://badkettle.example';
  return {
    [o + '/products/foggy-mug']: { body: SHOPIFY_PRODUCT_BAD, headers: { 'x-shopify-stage': 'production' } },
    [o + '/products/foggy-mug.js']: { status: 404, body: '<html>not found</html>' },
    [o + '/robots.txt']: { body: 'User-agent: *\nDisallow: /admin\n\nUser-agent: Bingbot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /products/\n', headers: { 'content-type': 'text/plain' } },
  };
}

export const WOO_PRODUCT = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Espresso Blend coffee beans, 250 g to 1 kg | Brew Co</title>
<meta name="description" content="Our house espresso blend, roasted weekly in Bristol. Chocolate and red fruit, works in every machine. From 250 g bags to 1 kg.">
<link rel="canonical" href="https://brew.example/product/espresso-blend/">
<meta property="og:type" content="product"><meta property="og:title" content="Espresso Blend"><meta property="og:image" content="https://brew.example/wp-content/uploads/espresso.jpg">
<link rel="stylesheet" href="https://brew.example/wp-content/plugins/woocommerce/assets/css/woocommerce.css">
<script src="https://brew.example/wp-content/plugins/woocommerce/assets/js/frontend/add-to-cart-variation.min.js" defer></script>
<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product","@id":"https://brew.example/product/espresso-blend/#product","name":"Espresso Blend","url":"https://brew.example/product/espresso-blend/","description":"Our house espresso blend, roasted weekly in Bristol.","image":"https://brew.example/wp-content/uploads/espresso.jpg","sku":"BREW-ESP","offers":[{"@type":"AggregateOffer","lowPrice":"14.00","highPrice":"28.00","offerCount":3,"priceCurrency":"GBP","availability":"https://schema.org/InStock","url":"https://brew.example/product/espresso-blend/"}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":"https://brew.example/product/espresso-blend/"},{"@type":"Product","name":"Espresso Blend","offers":{"@type":"Offer","price":"14.00","priceCurrency":"GBP"}}]}</script>
</head><body class="product-template-default single single-product postid-12 woocommerce woocommerce-page">
<header><a href="/"><img src="/wp-content/uploads/logo.png" alt="Brew Co"></a></header>
<main><div class="product type-product">
<div class="woocommerce-product-gallery"><img src="/wp-content/uploads/espresso.jpg" alt="Espresso Blend bag"><img src="/wp-content/uploads/espresso-2.jpg" alt=""></div>
<h1 class="product_title entry-title">Espresso Blend</h1>
<p class="price"><span class="woocommerce-Price-amount">£14.00</span> – <span class="woocommerce-Price-amount">£28.00</span></p>
<form class="variations_form cart" action="https://brew.example/product/espresso-blend/" method="post">
<table class="variations"><tr><th>Bag size</th><td><select name="attribute_pa_size"><option>250 g</option><option>500 g</option><option>1 kg</option></select></td></tr></table>
<p class="stock in-stock">In stock</p>
<button type="submit" class="single_add_to_cart_button button">Add to basket</button>
</form>
<div class="woocommerce-product-details__short-description"><p>Chocolate and red fruit. Roasted on Mondays, posted on Tuesdays, in your cup by Thursday. Works in espresso machines, moka pots and stovetops without changing the grind much. Ground to order if you ask.</p></div>
</div></main></body></html>`;

export function productWoo(): Site {
  const o = 'https://brew.example';
  return {
    [o + '/product/espresso-blend/']: { body: WOO_PRODUCT, headers: { 'content-encoding': 'gzip' } },
    [o + '/robots.txt']: { body: 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nSitemap: https://brew.example/sitemap_index.xml\n', headers: { 'content-type': 'text/plain' } },
  };
}

export const MAGENTO_PRODUCT_FULL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hydraulic pump ABC-123 | Parts Example</title>
<meta name="description" content="Hydraulic gear pump ABC-123, 25 cc per rev, 250 bar, SAE A mount. In stock in our Leeds warehouse, same day dispatch before 15:00.">
<link rel="canonical" href="https://parts.example/hydraulic-pump-abc-123.html">
<link rel="stylesheet" href="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/css/styles-m.css">
<script src="https://parts.example/static/version1729000000/frontend/Vendor/theme/en_US/requirejs/require.js"></script>
</head><body class="catalog-product-view product-hydraulic-pump-abc-123 page-layout-1column" data-container="body" data-mage-init='{"loaderAjax": {}}'>
<script type="text/x-magento-init">{"*": {"Magento_PageCache/js/form-key-provider": {}}}</script>
<div class="page-wrapper"><header><a class="logo" href="https://parts.example/"><img src="/static/version1729000000/frontend/Vendor/theme/en_US/images/logo.svg" alt="Parts Example"></a></header>
<main id="maincontent"><div class="product-info-main" itemscope itemtype="http://schema.org/Product">
<div class="fotorama-item"><img src="/media/catalog/product/a/b/abc-123.jpg" alt="Hydraulic pump ABC-123"></div>
<h1 class="page-title"><span itemprop="name">Hydraulic pump ABC-123</span></h1>
<div class="price-box price-final_price"><span class="price-container"><span class="price" itemprop="price">$1,299.00</span></span></div>
<div class="stock available"><span>In stock</span></div>
<div class="product-options-wrapper"><div class="swatch-opt" data-role="swatch-options"><select name="super_attribute[93]"><option>SAE A</option><option>SAE B</option></select></div></div>
<button type="submit" title="Add to Cart" class="action primary tocart" id="product-addtocart-button"><span>Add to Cart</span></button>
<div class="product attribute description"><p>Cast iron gear pump for mobile and industrial hydraulics. 25 cc per revolution, rated to 250 bar continuous, SAE A two bolt mount, clockwise rotation as standard with counter clockwise on request. Ships with a pressure test certificate and a two year warranty. Same day dispatch from Leeds for orders before 15:00.</p></div>
</div></main></div></body></html>`;

export function productMagento(): Site {
  const o = 'https://parts.example';
  return {
    [o + '/hydraulic-pump-abc-123.html']: { body: MAGENTO_PRODUCT_FULL, headers: { 'set-cookie': 'form_key=abc; path=/; X-Magento-Vary=1', 'content-encoding': 'gzip' } },
    [o + '/robots.txt']: { body: 'User-agent: *\nDisallow: /checkout/\nDisallow: /customer/\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\nSitemap: https://parts.example/sitemap.xml\n', headers: { 'content-type': 'text/plain' } },
  };
}

export const BLOG_POST = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>What is llms.txt and do you need one | ROAS Expert</title>
<meta name="description" content="llms.txt explained in plain words: what it is, who reads it, and whether your store needs one."><link rel="canonical" href="https://roasexpert.example/blog/what-is-llms-txt">
<meta property="og:type" content="article"><meta property="og:title" content="What is llms.txt">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"What is llms.txt and do you need one","author":{"@type":"Person","name":"Rishabh Gupta"},"datePublished":"2026-10-01"}</script>
</head><body class="blog-post"><main><article><h1>What is llms.txt and do you need one</h1><p class="byline">By Rishabh Gupta</p>
<p>llms.txt is a plain text file at the root of a site that tells AI assistants where the useful pages are. It is not a standard yet and nobody is obliged to read it, but it costs nothing to add and some crawlers already fetch it. This post explains what goes in it, how to write one in ten minutes, and which platforms make it hard.</p>
<h2>What goes in it</h2><p>A one line description of the business, then links to the pages that answer questions: services, pricing, top products, FAQs and contact. Keep it under 200 lines.</p>
</article></main></body></html>`;

export function nonProductSite(): Site {
  const o = 'https://roasexpert.example';
  return {
    [o + '/blog/what-is-llms-txt']: { body: BLOG_POST },
    [o + '/robots.txt']: { body: 'User-agent: *\nAllow: /\n', headers: { 'content-type': 'text/plain' } },
  };
}
