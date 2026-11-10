import type { Category } from './types';

export interface CheckDef {
  id: string;
  category: Category;
  label: string;
  weight: number;
  what: string;
}

/** Every check the engine can emit, for the explorer on the landing page. Weights mirror checks.ts. */
export const CATALOG: CheckDef[] = [
  { id: 'home_reachable', category: 'crawl', label: 'Homepage reachable', weight: 6, what: 'Answers HTTP 200 to a plain crawler, no bot wall, no password page.' },
  { id: 'noindex', category: 'crawl', label: 'Homepage is indexable', weight: 6, what: 'No noindex in the robots meta tag or the X-Robots-Tag header.' },
  { id: 'robots_blocking', category: 'crawl', label: 'robots.txt lets search engines in', weight: 6, what: 'No blanket Disallow for Googlebot, and product and collection paths are open.' },
  { id: 'https_redirect', category: 'crawl', label: 'HTTP redirects to HTTPS', weight: 4, what: 'http:// answers with a 301 or 308 to the https:// version.' },
  { id: 'sitemap', category: 'crawl', label: 'XML sitemap works', weight: 4, what: 'Declared or at /sitemap.xml, returns XML with URLs, not an HTML page.' },
  { id: 'www_consistency', category: 'crawl', label: 'www and non-www agree', weight: 3, what: 'The other hostname redirects to the canonical one instead of serving a copy.' },
  { id: 'robots_present', category: 'crawl', label: 'robots.txt exists', weight: 3, what: 'Present and parseable, so you can declare sitemaps and AI crawler rules.' },
  { id: 'canonical', category: 'crawl', label: 'Canonical tag', weight: 3, what: 'Self-referencing, https, same host.' },
  { id: 'key_page_indexable', category: 'crawl', label: 'Product or inner page indexable', weight: 3, what: 'The product, collection or article page we read carries no noindex.' },
  { id: 'redirect_chain', category: 'crawl', label: 'Short redirect path', weight: 2, what: 'At most one hop from the typed address to the final URL.' },
  { id: 'robots_sitemap', category: 'crawl', label: 'Sitemap declared in robots.txt', weight: 2, what: 'A Sitemap: line so every crawler finds it.' },
  { id: 'soft_404', category: 'crawl', label: 'Missing pages return 404', weight: 2, what: 'A made-up URL ends in a 404 or 410, not a 200 or an endless redirect.' },
  { id: 'title', category: 'onpage', label: 'Title tag', weight: 4, what: 'Present and 25 to 65 characters.' },
  { id: 'meta_description', category: 'onpage', label: 'Meta description', weight: 3, what: 'Present and 60 to 170 characters.' },
  { id: 'h1', category: 'onpage', label: 'One H1 heading', weight: 3, what: 'Exactly one, with text in it.' },
  { id: 'img_alt', category: 'onpage', label: 'Image alt text', weight: 3, what: '90% or more of images have alt text.' },
  { id: 'html_lang', category: 'onpage', label: 'Language declared', weight: 2, what: 'A lang attribute on the html tag.' },
  { id: 'viewport', category: 'onpage', label: 'Mobile viewport', weight: 2, what: 'The viewport meta tag mobile-first indexing expects.' },
  { id: 'open_graph', category: 'onpage', label: 'Social preview tags', weight: 2, what: 'og:title, og:description and og:image.' },
  { id: 'heading_structure', category: 'onpage', label: 'Heading structure', weight: 1, what: 'Levels in order, no H2 to H4 jumps, at least two headings.' },
  { id: 'favicon', category: 'onpage', label: 'Favicon', weight: 1, what: 'Declared; Google shows it next to mobile results.' },
  { id: 'hreflang', category: 'onpage', label: 'hreflang tags', weight: 1, what: 'Valid codes and an x-default, when the site has several languages.' },
  { id: 'charset', category: 'onpage', label: 'Character set declared', weight: 1, what: 'A charset meta tag.' },
  { id: 'product_schema', category: 'schema', label: 'Product schema on a product page', weight: 6, what: 'JSON-LD Product with name, image and an Offer carrying price, currency and availability.' },
  { id: 'jsonld_valid', category: 'schema', label: 'JSON-LD parses', weight: 4, what: 'Every structured data block is valid JSON; broken blocks are ignored entirely.' },
  { id: 'org_schema', category: 'schema', label: 'Organization schema', weight: 4, what: 'Organization or LocalBusiness with name, url, logo and sameAs links.' },
  { id: 'article_schema', category: 'schema', label: 'Article schema on a post', weight: 4, what: 'Article or BlogPosting with headline, author and datePublished (blogs).' },
  { id: 'inner_schema', category: 'schema', label: 'Schema on an inner page', weight: 4, what: 'Any typed schema on the inner page we read (sites without products or posts).' },
  { id: 'website_schema', category: 'schema', label: 'WebSite schema', weight: 2, what: 'Names the site; can declare site search.' },
  { id: 'breadcrumb_inner', category: 'schema', label: 'Breadcrumbs on inner pages', weight: 2, what: 'BreadcrumbList on the product, collection or article page.' },
  { id: 'breadcrumb_schema', category: 'schema', label: 'Breadcrumb schema', weight: 2, what: 'BreadcrumbList on the homepage (informational).' },
  { id: 'faq_schema', category: 'schema', label: 'FAQ schema', weight: 2, what: 'FAQPage where you already answer questions.' },
  { id: 'ai_bots', category: 'ai', label: 'AI search crawlers allowed', weight: 6, what: 'robots.txt lets in OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Bingbot; training bots flagged separately.' },
  { id: 'text_without_js', category: 'ai', label: 'Content readable without JavaScript', weight: 5, what: 'At least 250 words of real text in the raw HTML; most AI crawlers do not run scripts.' },
  { id: 'llms_txt', category: 'ai', label: 'llms.txt', weight: 3, what: 'A plain-text map of your most useful pages for AI assistants.' },
  { id: 'entity_links', category: 'ai', label: 'Entity links (sameAs)', weight: 2, what: 'Two or more sameAs profile links so engines reconcile the brand.' },
  { id: 'author_date', category: 'ai', label: 'Author and date signals', weight: 2, what: 'Byline, author markup or dateModified on the pages we read.' },
  { id: 'descriptive_headings', category: 'ai', label: 'Sections with headings', weight: 1, what: 'At least two H2 sections; assistants quote sections.' },
  { id: 'answers', category: 'ai', label: 'Question and answer content', weight: 1, what: 'FAQ style content or FAQPage schema.' },
  { id: 'ttfb', category: 'speed', label: 'Server response time', weight: 4, what: 'Time to first byte under 600 ms; warn to 1.5 s.' },
  { id: 'html_weight', category: 'speed', label: 'HTML size', weight: 2, what: 'Under 300 KB; crawlers cap how much they read.' },
  { id: 'compression', category: 'speed', label: 'Text compression', weight: 2, what: 'gzip, brotli or zstd on the HTML response.' },
  { id: 'script_count', category: 'speed', label: 'Script count', weight: 2, what: '15 or fewer script tags; warn to 35.' },
  { id: 'render_blocking', category: 'speed', label: 'Render-blocking scripts', weight: 2, what: 'Two or fewer scripts in the head without defer or async.' },
  { id: 'cache_headers', category: 'speed', label: 'Cache headers', weight: 1, what: 'A Cache-Control header on the HTML.' },
  { id: 'modern_images', category: 'speed', label: 'Modern image formats', weight: 1, what: 'Half or more of images in WebP or AVIF.' },
  { id: 'lazy_loading', category: 'speed', label: 'Lazy loading', weight: 1, what: 'loading="lazy" on images when there are many.' },
  { id: 'stylesheets', category: 'speed', label: 'Stylesheet count', weight: 1, what: 'Six or fewer external stylesheets.' },
];

/** The product page mode: 19 checks, weights sum to 100. Mirrors product.ts. */
export const PRODUCT_CATALOG: CheckDef[] = [
  { id: 'product_jsonld', category: 'pdata', label: 'Product JSON-LD present and valid', weight: 10, what: 'A Product or ProductGroup block that parses. Microdata only is a warning.' },
  { id: 'product_offer', category: 'pdata', label: 'Offer with price, currency, availability and url', weight: 10, what: 'price as a number, priceCurrency as an ISO code, availability as a schema.org URL, url.' },
  { id: 'product_core_fields', category: 'pdata', label: 'Name, image and description', weight: 5, what: 'name, at least one absolute image URL, a real description.' },
  { id: 'product_shipping', category: 'pdata', label: 'Shipping details in the offer', weight: 5, what: 'OfferShippingDetails with shippingRate, deliveryTime and shippingDestination.' },
  { id: 'product_returns', category: 'pdata', label: 'Return policy in the offer', weight: 5, what: 'MerchantReturnPolicy with returnPolicyCategory and merchantReturnDays.' },
  { id: 'product_identifiers', category: 'pdata', label: 'sku, gtin or mpn, and brand', weight: 4, what: 'sku plus a gtin or mpn plus brand; sku alone is a warning.' },
  { id: 'product_reviews', category: 'pdata', label: 'Ratings in the structured data', weight: 3, what: 'aggregateRating when the page shows reviews; not scored otherwise.' },
  { id: 'product_variants', category: 'pdata', label: 'Variants in the structured data', weight: 3, what: 'hasVariant, ProductGroup or an AggregateOffer with a price range when the page offers variants.' },
  { id: 'price_no_js', category: 'pread', label: 'Price in the HTML without JavaScript', weight: 8, what: 'A currency and a number in the server HTML text; data only is a warning.' },
  { id: 'stock_no_js', category: 'pread', label: 'Stock status in the HTML without JavaScript', weight: 6, what: 'In stock, sold out, add to cart or ships in, in the HTML text.' },
  { id: 'product_h1', category: 'pread', label: 'One H1 that names the product', weight: 3, what: 'Exactly one H1 and it matches the product name.' },
  { id: 'product_image_alt', category: 'pread', label: 'Product images have alt text', weight: 3, what: 'Gallery images (or the first three) carry alt text.' },
  { id: 'ai_shopping_bots', category: 'paccess', label: 'AI shopping crawlers allowed on this path', weight: 10, what: 'robots.txt on the product path for OAI-SearchBot, ChatGPT-User, Google-Extended, PerplexityBot, Amazonbot, Bingbot and ClaudeBot, pro rata; Bingbot blocked is a fail.' },
  { id: 'product_indexable', category: 'paccess', label: 'Product page reachable and indexable', weight: 5, what: 'HTTP 200, no noindex, no bot wall, real text in the HTML.' },
  { id: 'product_canonical', category: 'ptags', label: 'Self-referencing canonical', weight: 4, what: 'The canonical equals the page URL without tracking parameters; Shopify collection paths may point at /products/.' },
  { id: 'product_og', category: 'ptags', label: 'Open Graph product tags', weight: 4, what: 'og:type product, og:title, og:image, product:price:amount with product:price:currency.' },
  { id: 'product_title_meta', category: 'ptags', label: 'Title and meta description', weight: 4, what: 'Title 15 to 60 characters with the product name; meta description 50 to 160 characters.' },
  { id: 'shopify_product_json', category: 'pplatform', label: 'Shopify /products/handle.js answers JSON', weight: 5, what: 'Shopify only: the JSON endpoint returns variants and prices.' },
  { id: 'platform_render', category: 'pplatform', label: 'One Product block, price rendered server side', weight: 3, what: 'Shopify and WooCommerce: one Product block, not duplicates. Magento: price and swatches in the server HTML.' },
];
