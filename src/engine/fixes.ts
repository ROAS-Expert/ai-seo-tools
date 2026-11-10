import type { Finding } from './types';

export type FixKey = 'shopify' | 'wordpress' | 'magento' | 'framer' | 'webflow' | 'wix' | 'squarespace' | 'bigcommerce' | 'hubspot' | 'nextjs' | 'generic';

export function fixKeyFor(cmsId: string): FixKey {
  switch (cmsId) {
    case 'shopify':
      return 'shopify';
    case 'wordpress':
    case 'woocommerce':
      return 'wordpress';
    case 'magento':
      return 'magento';
    case 'framer':
      return 'framer';
    case 'webflow':
      return 'webflow';
    case 'wix':
    case 'wix-stores':
      return 'wix';
    case 'squarespace':
    case 'squarespace-commerce':
      return 'squarespace';
    case 'bigcommerce':
      return 'bigcommerce';
    case 'hubspot':
      return 'hubspot';
    case 'nextjs':
    case 'nuxt':
    case 'gatsby':
      return 'nextjs';
    default:
      return 'generic';
  }
}

export type FixTable = Partial<Record<FixKey, string>> & { generic: string };

export const FIXES: Record<string, FixTable> = {
  home_reachable: {
    generic: 'Make sure the site answers HTTP 200 on its canonical URL. Check the host, DNS and any password or maintenance mode.',
    shopify: 'Online Store > Preferences: turn off password protection. If the store is on a trial, Shopify blocks crawlers until a plan is chosen.',
    framer: 'Site Settings > General: the site must be published and not password protected. Staging URLs are not for crawlers.',
    webflow: 'Site settings > Hosting: publish to the custom domain and make sure password protection is off.',
  },
  https_redirect: {
    generic: 'Add a server-level 301 from http:// to https:// for every path. Do it at the CDN or web server, not with JavaScript.',
    shopify: 'Settings > Domains: set the primary domain and turn on "Redirect all traffic to this domain". Shopify then forces HTTPS itself.',
    wordpress: 'Settings > General: set both URLs to https://. Then add the redirect at the host (most hosts have a "Force HTTPS" switch) or with the Really Simple SSL plugin.',
    magento: 'Stores > Configuration > General > Web > Base URLs (Secure): set the https base URL, "Use Secure URLs on Storefront" = Yes and "Auto-redirect to Base URL" = Yes (301 permanent). Also force it in nginx or Varnish.',
    framer: 'Site Settings > Domains: Framer forces HTTPS once the domain is verified. If http:// still serves a page, the DNS records are pointing somewhere else.',
    webflow: 'Site settings > Hosting: turn on SSL and republish. Webflow then redirects http:// for you.',
    wix: 'Wix forces HTTPS for connected domains. If http:// still serves, the domain is not fully connected under Settings > Domains.',
    squarespace: 'Settings > Advanced > SSL: choose Secure and HSTS Secure.',
    bigcommerce: 'Settings > Website > Site-wide HTTPS: turn it on. Add the redirect in your CDN if you use one.',
    hubspot: 'Settings > Website > Domains & URLs: HubSpot provisions SSL and redirects http:// automatically once the domain is connected. Check the domain status there.',
    nextjs: 'Redirect at the edge (Vercel does this by default for custom domains; on Cloudflare use an "Always Use HTTPS" rule).',
  },
  www_consistency: {
    generic: 'Pick one hostname (www or bare) and 301 the other to it at the DNS or CDN level.',
    shopify: 'Settings > Domains: add both versions, set one as primary, and "Redirect all traffic to this domain".',
    wordpress: 'Settings > General: the Site Address decides the canonical host. Add the redirect for the other host in your hosting panel or .htaccess.',
    magento: 'Set the Base URL to the host you want and turn on "Auto-redirect to Base URL". Add the other host as an nginx server block that 301s.',
    framer: 'Site Settings > Domains: connect both www and the root and choose which one is the primary. Framer redirects the other.',
    webflow: 'Site settings > Publishing: connect both hostnames and set one as default (the arrow icon). Webflow redirects the other.',
    hubspot: 'Settings > Website > Domains & URLs: connect the primary domain and add the other as a redirect domain.',
  },
  redirect_chain: {
    generic: 'Point every redirect straight at the final https:// URL. Chains like http > https > www > trailing slash should collapse into one hop.',
  },
  robots_present: {
    generic: 'Add a robots.txt at the site root. At minimum: "User-agent: *", "Allow: /" and a "Sitemap:" line.',
    shopify: 'Shopify serves robots.txt automatically. If it is missing, the store is password protected or still on a myshopify.com preview.',
    wordpress: 'Yoast SEO > Tools > File editor (or Rank Math > General Settings > Edit robots.txt) creates and edits it.',
    magento: 'Content > Design > Configuration > your website > Search Engine Robots: paste the rules into "Edit custom instruction of robots.txt File".',
    framer: 'Site Settings > General > Robots.txt: Framer generates one; you can add custom lines there.',
    webflow: 'Site settings > SEO > Indexing > robots.txt.',
    wix: 'SEO Settings > Tools > Robots.txt Editor.',
    squarespace: 'Squarespace writes robots.txt itself and does not let you edit it.',
    bigcommerce: 'Settings > Website > Search engine robots.',
    hubspot: 'Settings > Website > Pages > SEO & Crawlers > robots.txt.',
    nextjs: 'Add app/robots.ts (Next.js) exporting the rules and the sitemap URL, or a static public/robots.txt.',
  },
  robots_blocking: {
    generic: 'Remove the "Disallow: /" rule for "User-agent: *" (or for Googlebot) and any Disallow lines that cover product, collection or blog paths.',
    shopify: 'Edit robots.txt.liquid (Online Store > Themes > Edit code > Add template > robots.txt). Remove custom Disallow rules that cover /collections, /products or /blogs. If you never customised it, the store is in password mode.',
    wordpress: 'Check Settings > Reading: "Discourage search engines from indexing this site" must be unticked. Then remove the Disallow lines in Yoast or Rank Math.',
    magento: 'Content > Design > Configuration > Search Engine Robots: set Default Robots to INDEX, FOLLOW and delete the blanket Disallow in the custom instructions.',
    framer: 'Site Settings > General > Robots.txt: remove the custom Disallow lines.',
    webflow: 'Site settings > SEO > Indexing: remove the Disallow lines and republish.',
  },
  robots_sitemap: {
    generic: 'Add "Sitemap: https://yourdomain/sitemap.xml" as its own line in robots.txt.',
    shopify: 'Shopify includes the Sitemap line by default. If it is missing, your robots.txt.liquid override removed it; add it back with {{ sitemap }} or a literal line.',
    wordpress: 'Yoast and Rank Math add the Sitemap line when their sitemap feature is on. Check that the sitemap is enabled in the plugin.',
    magento: 'Stores > Configuration > Catalog > XML Sitemap > Search Engine Submission Settings: "Enable Submission to Robots.txt" = Yes.',
    squarespace: 'Squarespace adds the Sitemap line itself. If it is absent the site is not public yet.',
  },
  sitemap: {
    generic: 'Publish an XML sitemap at /sitemap.xml (or a sitemap index) that lists every indexable page, and reference it in robots.txt.',
    shopify: 'Shopify generates /sitemap.xml for products, collections, pages and blogs. If it fails, the store is password protected or the domain is not primary.',
    wordpress: 'Turn on the XML sitemap in Yoast (Settings > APIs > XML sitemaps) or Rank Math (Sitemap Settings). Core WordPress also serves /wp-sitemap.xml if no plugin disables it.',
    magento: 'Marketing > SEO & Search > Site Map > Add Sitemap (filename sitemap.xml, path /). Then enable generation in Stores > Configuration > Catalog > XML Sitemap and make sure cron runs.',
    framer: 'Framer serves /sitemap.xml automatically for published pages. Pages with "Hide from search engines" are excluded.',
    webflow: 'Site settings > SEO > Indexing: "Auto-generate sitemap" on, then republish.',
    wix: 'Wix generates /sitemap.xml. Pages hidden from search are left out.',
    bigcommerce: 'BigCommerce serves /xmlsitemap.php. Make sure robots.txt points to it.',
    hubspot: 'HubSpot serves /sitemap.xml for all published pages and posts; check Settings > Website > Pages > SEO & Crawlers.',
    nextjs: 'Add app/sitemap.ts (Next.js) that returns every indexable route, or generate a static sitemap in the build.',
  },
  noindex: {
    generic: 'Remove the noindex robots meta tag or X-Robots-Tag header from the homepage. If it came from a staging setting, check the production build.',
    shopify: 'A noindex on the homepage usually means password protection (Online Store > Preferences) or a theme edit in theme.liquid. Search theme.liquid for "noindex".',
    wordpress: 'Settings > Reading: untick "Discourage search engines". Then open the homepage in Yoast or Rank Math and set "Allow search engines to show this page" to Yes.',
    magento: 'Content > Design > Configuration > Search Engine Robots > Default Robots = INDEX, FOLLOW. Also check Content > Pages > Home page > Search Engine Optimization.',
    framer: 'Page settings (the gear next to the page) > turn off "Hide from search engines". Staging and framer.app domains add noindex on purpose.',
    webflow: 'Page settings > SEO: untick "Exclude this page from search engine results". The webflow.io subdomain is noindexed by design; that is fine.',
    wix: 'Page SEO panel > "Let search engines index this page" on.',
    squarespace: 'Page settings > SEO > untick "Hide this page from search results".',
    hubspot: 'Page editor > Settings > Advanced options > untick "Prevent search engines from indexing".',
    nextjs: 'Check the metadata export: robots.index must not be false in production. Also check for an X-Robots-Tag header set at the edge for previews.',
  },
  canonical: {
    generic: 'Output a self-referencing canonical link on every page: <link rel="canonical" href="https://yourdomain/path">. Use the final https host.',
    shopify: 'theme.liquid should contain <link rel="canonical" href="{{ canonical_url }}">. If an app removed it, add it back. Set the primary domain under Settings > Domains.',
    wordpress: 'Yoast and Rank Math output canonicals automatically. If the host is wrong, fix Settings > General > Site Address.',
    magento: 'Stores > Configuration > Catalog > Catalog > Search Engine Optimization: "Use Canonical Link Meta Tag For Categories/Products" = Yes. For CMS pages use a module or the page head.',
    framer: 'Framer writes canonicals for the primary domain. If it points elsewhere, the primary domain under Site Settings > Domains is wrong.',
    webflow: 'Site settings > SEO > Indexing > Global canonical tag URL: set your https primary domain.',
    hubspot: 'Page settings > Advanced options > Canonical URL. HubSpot defaults to the page URL.',
    nextjs: 'Set metadata.alternates.canonical per route, using the production origin.',
  },
  soft_404: {
    generic: 'Missing pages must return HTTP 404 (or 410), not 200. Check the "not found" route in the platform or server config.',
    magento: 'Stores > Configuration > General > Web > Default Pages: "CMS No Route Page" should be the no-route page and it must return a 404 status (default behaviour). A 200 usually means a custom catch-all route.',
    nextjs: 'Return notFound() from the route and keep the not-found page from being a catch-all with a 200 status.',
  },
  key_page_indexable: {
    generic: 'Remove noindex from product, collection and blog pages that should rank.',
    shopify: 'Products in draft status or hidden from the Online Store channel are noindexed. Check product status and sales channel.',
    wordpress: 'Open the page in Yoast or Rank Math and allow indexing. WooCommerce product visibility must be "Shop and search results".',
  },
  title: {
    generic: 'Give the homepage a 30 to 60 character title that says what you sell and for whom, brand last.',
    shopify: 'Online Store > Preferences > Homepage title.',
    wordpress: 'Edit the front page and set the SEO title in the Yoast or Rank Math box (or Settings > General > Tagline if the theme uses it).',
    magento: 'Content > Pages > Home page > Search Engine Optimization > Meta Title, or Content > Design > Configuration > HTML Head > Default Page Title.',
    framer: 'Page settings (gear) > Title.',
    webflow: 'Page settings > SEO settings > Title tag.',
    wix: 'Page SEO panel > Title tag.',
    squarespace: 'Page settings > SEO > SEO title.',
    hubspot: 'Page settings > Page title.',
    nextjs: 'Export metadata.title from the page or layout.',
  },
  meta_description: {
    generic: 'Write a 70 to 155 character meta description that states the offer, the audience and one reason to click.',
    shopify: 'Online Store > Preferences > Homepage meta description.',
    wordpress: 'Front page > Yoast or Rank Math box > Meta description.',
    magento: 'Content > Pages > Home page > Search Engine Optimization > Meta Description.',
    framer: 'Page settings (gear) > Description.',
    webflow: 'Page settings > SEO settings > Meta description.',
    wix: 'Page SEO panel > Meta description.',
    squarespace: 'Page settings > SEO > SEO description.',
    hubspot: 'Page settings > Meta description.',
    nextjs: 'Export metadata.description from the page.',
  },
  h1: {
    generic: 'Use exactly one H1 per page that names the page topic. Other headings become H2 and below.',
    shopify: 'In the theme editor the hero heading has a "heading size" or "tag" setting; set it to H1 and make sure the logo is not also wrapped in an H1 (common in older themes: check header.liquid).',
    wordpress: 'In the block editor select the heading block and set its level to H1. Many themes make the site title an H1 on the front page; check the theme header.',
    magento: 'Edit the Home page content (Content > Pages) and make the main headline an H1. Luma puts the page title in an H1; hidden titles need a visible headline instead.',
    framer: 'Select the headline text layer and set Tag to H1 in the right panel.',
    webflow: 'Select the heading, open Element settings and choose H1.',
    wix: 'Select the text, choose the Heading 1 theme and keep it unique.',
    hubspot: 'In the rich text module set the headline style to Heading 1.',
  },
  heading_structure: {
    generic: 'Keep the outline in order: one H1, sections as H2, sub-sections as H3. Do not pick heading levels for their size; style them with CSS.',
  },
  img_alt: {
    generic: 'Add descriptive alt text to every meaningful image, especially product images (product name, variant, angle). Decorative images get alt="".',
    shopify: 'Products > product > Media > click an image > Add alt text. Theme images have an alt field in the section settings.',
    wordpress: 'Media Library > image > Alternative Text. WooCommerce uses the product image alt text.',
    magento: 'Catalog > Products > Images and Videos > Alt Text on each image. Category images in Catalog > Categories.',
    framer: 'Select the image fill > Alt text (or a CMS field mapped to alt).',
    webflow: 'Assets panel > image settings > Alt text, or the alt field on the CMS image.',
    wix: 'Image settings > Alt text.',
    squarespace: 'Image block > Design > Alt text (or the caption for gallery images).',
    hubspot: 'Image module > Alt text.',
    nextjs: 'Pass alt to every next/image; lint with jsx-a11y/alt-text.',
  },
  html_lang: {
    generic: 'Add lang="en" (or your language code) to the <html> tag.',
    shopify: 'theme.liquid: <html lang="{{ request.locale.iso_code }}">.',
    wordpress: 'Settings > General > Site Language; the theme should print language_attributes() on the html tag.',
    magento: 'Stores > Configuration > General > Locale Options; Luma prints the locale on the html tag.',
    framer: 'Site Settings > General > Language.',
    webflow: 'Site settings > General > Language code.',
  },
  viewport: {
    generic: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the head.',
  },
  open_graph: {
    generic: 'Add og:title, og:description and a 1200x630 og:image so shared links show a preview.',
    shopify: 'Online Store > Preferences > Social sharing image. Most themes print og tags in snippets/meta-tags.liquid.',
    wordpress: 'Yoast > Social tab on the page, or Rank Math > Social tab. Set a default social image in the plugin settings.',
    magento: 'Magento prints no Open Graph tags by default. Add them in the page head (Content > Design > Configuration > HTML Head > Scripts and Style Sheets) or with an SEO module.',
    framer: 'Page settings > Social image; Site Settings > General > Social image for the default.',
    webflow: 'Page settings > Open Graph settings.',
    wix: 'Page SEO panel > Social share.',
    squarespace: 'Page settings > Social image; Settings > Marketing > Social sharing.',
    hubspot: 'Page settings > Featured image, which HubSpot uses for og:image.',
    nextjs: 'Export metadata.openGraph with title, description and images.',
  },
  favicon: {
    generic: 'Add a favicon link (SVG or 48x48 PNG) in the head.',
    shopify: 'Theme editor > Theme settings > Favicon.',
    wordpress: 'Appearance > Customize > Site Identity > Site Icon.',
    magento: 'Content > Design > Configuration > HTML Head > Favicon Icon.',
    framer: 'Site Settings > General > Favicon.',
    webflow: 'Site settings > General > Favicon.',
  },
  hreflang: {
    generic: 'Each language or country version needs reciprocal hreflang links plus an x-default. Use valid codes (en, en-gb, de-de).',
    shopify: 'Shopify Markets prints hreflang for each market domain or folder automatically; malformed tags usually come from a translation app.',
    wordpress: 'WPML or Polylang print hreflang; set the default language as x-default.',
    magento: 'Use a hreflang module (Magento has none built in) and map store views to language-region codes.',
  },
  charset: { generic: 'Add <meta charset="utf-8"> as the first element in the head.' },
  jsonld_valid: {
    generic: 'Fix the JSON syntax in the structured data block (trailing commas and unescaped quotes are the usual culprits). Validate at validator.schema.org.',
    shopify: 'The broken block is usually in a theme snippet or an app. Search the theme for application/ld+json, or test with apps disabled.',
    wordpress: 'A plugin or theme prints broken JSON-LD. Deactivate SEO plugins one by one on a staging copy to find it.',
  },
  org_schema: {
    generic: 'Add Organization JSON-LD on the homepage with name, url, logo, and sameAs links to every public profile (LinkedIn, Instagram, X, Trustpilot, Google Business Profile).',
    shopify: 'Add a JSON-LD script to theme.liquid (or snippets/meta-tags.liquid) with shop.name, shop.url, the logo URL and your profile links.',
    wordpress: 'Yoast SEO > Settings > Site representation: choose Organization, add the logo and all social profiles. Rank Math: Titles & Meta > Local SEO.',
    magento: 'Paste the Organization JSON-LD into Content > Design > Configuration > HTML Head > Scripts and Style Sheets (it accepts script tags), or add a block in default_head_blocks.xml.',
    framer: 'Site Settings > General > Custom Code > Start of head tag: paste the JSON-LD script.',
    webflow: 'Site settings > Custom code > Head code (needs a paid site plan), or page settings > Custom code for the homepage.',
    wix: 'Page SEO panel > Advanced SEO > Structured data > Add new markup.',
    squarespace: 'Settings > Advanced > Code Injection > Header (Business plan or higher).',
    bigcommerce: 'Storefront > Script Manager > create a script in the head with the JSON-LD.',
    hubspot: 'Settings > Website > Pages > Site header HTML, or the homepage head HTML.',
    nextjs: 'Render a <script type="application/ld+json"> in the root layout with the Organization object.',
  },
  website_schema: {
    generic: 'Add WebSite JSON-LD with name, url and (if you have site search) a SearchAction.',
    wordpress: 'Yoast and Rank Math output WebSite schema automatically when site representation is set.',
  },
  breadcrumb_schema: { generic: 'Add BreadcrumbList JSON-LD on inner pages that mirrors the visible breadcrumb trail.' },
  breadcrumb_inner: {
    generic: 'Add BreadcrumbList JSON-LD on product, category and article pages, matching the visible breadcrumb.',
    shopify: 'Many themes include breadcrumb schema in snippets/breadcrumbs.liquid; otherwise add a JSON-LD snippet using collection and product objects.',
    wordpress: 'Yoast > Settings > Advanced > Breadcrumbs; Rank Math > General Settings > Breadcrumbs. Both print the schema.',
    magento: 'Luma prints breadcrumbs as HTML only. Add BreadcrumbList JSON-LD with an SEO module or a small template override.',
  },
  product_schema: {
    generic: 'Product pages need Product JSON-LD with name, image, description, sku, brand and offers (price, priceCurrency, availability, url). Add shippingDetails and hasMerchantReturnPolicy for merchant listing rich results.',
    shopify: 'Check sections/main-product.liquid or snippets/product-schema.liquid for application/ld+json. Dawn and most modern themes include it; if an app or edit removed it, restore the snippet. Make sure offers carry availability and priceCurrency.',
    wordpress: 'WooCommerce outputs Product JSON-LD on single product pages by default. If it is missing, a theme or plugin is suppressing it (check with other SEO plugins disabled). Yoast WooCommerce SEO fills gaps like brand and GTIN.',
    magento: 'Magento prints no Product JSON-LD out of the box. Add it with a module (for example Amasty SEO Toolkit, Mageplaza SEO or the Hyvä schema module) or a block on catalog_product_view.xml that renders name, image, sku, brand and offers.',
    framer: 'Framer has no commerce layer. Add the Product JSON-LD in the page custom code, filled from CMS fields.',
    webflow: 'Webflow Ecommerce: add a JSON-LD embed on the product template page using CMS fields for name, price and availability.',
    wix: 'Wix Stores prints Product schema automatically. If it is missing, the page is not a Wix Stores product page.',
    squarespace: 'Squarespace Commerce prints Product schema on product pages automatically; if missing, the page is a regular page, not a product.',
    bigcommerce: 'Cornerstone-based themes print Product schema. Check templates/components/products/product-view.html for application/ld+json.',
    nextjs: 'Render Product JSON-LD in the product route from the same data that renders the page.',
  },
  article_schema: {
    generic: 'Add Article or BlogPosting JSON-LD on posts with headline, author (Person with url), datePublished, dateModified and image.',
    wordpress: 'Yoast and Rank Math print Article schema on posts. Make sure the author profile has a name and the post has a featured image.',
    shopify: 'Add a JSON-LD snippet to sections/main-article.liquid using article.title, article.author and article.published_at.',
    hubspot: 'HubSpot prints BlogPosting schema on blog posts automatically; make sure the author profile is complete.',
  },
  inner_schema: { generic: 'Add schema that matches the page type: Service or Product for offers, Article for posts, FAQPage where you answer questions.' },
  faq_schema: {
    generic: 'Where you already answer customer questions, add FAQPage JSON-LD with the same questions and answers that are visible on the page.',
    shopify: 'Add a FAQ section with a JSON-LD snippet, or use a FAQ app that outputs FAQPage schema.',
    wordpress: 'Use the Yoast FAQ block or Rank Math FAQ block; both print the schema.',
  },
  ai_bots: {
    generic: 'In robots.txt, allow the crawlers behind AI answers: OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Bingbot. GPTBot and Google-Extended are training crawlers; allow or block them on purpose, not by accident.',
    shopify: 'Shopify\'s default robots.txt allows these bots. If they are blocked, someone added rules to robots.txt.liquid (Online Store > Themes > Edit code). Remove the Disallow lines for those user agents.',
    wordpress: 'Edit robots.txt in Yoast (Tools > File editor) or Rank Math and delete the Disallow rules for those user agents. Some security plugins add AI-bot blocks; check their settings too.',
    magento: 'Content > Design > Configuration > Search Engine Robots: remove the Disallow rules for those user agents from the custom instructions.',
    framer: 'Site Settings > General > Robots.txt: remove the blocking lines.',
    webflow: 'Site settings > SEO > Indexing > robots.txt: remove the blocking lines.',
    wix: 'SEO Settings > Tools > Robots.txt Editor: remove the blocking lines.',
    squarespace: 'Settings > Site visibility and Settings > Advanced > "AI crawlers": Squarespace has a toggle that blocks AI crawlers; turn it off if you want to be cited.',
    hubspot: 'Settings > Website > Pages > SEO & Crawlers > robots.txt: remove the blocking lines.',
    nextjs: 'Edit app/robots.ts or public/robots.txt and remove the Disallow rules for those agents. If you use Cloudflare, also check the "Block AI bots" switch under Security > Bots.',
  },
  llms_txt: {
    generic: 'Publish /llms.txt: a markdown file with a one-line description of the business, then links to your most useful pages (services, pricing, top products, FAQs, contact) with a sentence each. Keep it under 200 lines.',
    shopify: 'Shopify cannot serve files at the root. Use an app that serves llms.txt (search the App Store for "llms.txt") or a reverse proxy such as a Cloudflare Worker in front of the store. If neither is an option, skip this one; it is a small signal.',
    wordpress: 'Yoast SEO (Settings > APIs > llms.txt) and Rank Math both generate /llms.txt. Or upload the file to the web root over SFTP.',
    magento: 'Drop llms.txt into the pub/ directory (the web root) and deploy; nginx serves it as text/plain.',
    framer: 'Framer does not host root files. A Cloudflare Worker or similar proxy in front of the site can serve it; otherwise skip.',
    webflow: 'Webflow does not host root text files. Serve it through a reverse proxy or skip.',
    wix: 'Check SEO Settings > Tools: recent Wix plans generate llms.txt automatically. If the option is not there, skip.',
    squarespace: 'Squarespace does not host root text files. Skip unless you add a proxy in front.',
    bigcommerce: 'Upload llms.txt over WebDAV to the content folder and add a URL rewrite to the root, or serve it through a CDN worker.',
    hubspot: 'HubSpot cannot serve a root text file on the Free tier. Skip for now.',
    nextjs: 'Add public/llms.txt (served as-is) or an app/llms.txt/route.ts that returns text/plain.',
  },
  text_without_js: {
    generic: 'Server-render the main content so it is in the HTML response. Headless or single-page builds need SSR or static generation for public pages.',
    shopify: 'Liquid themes render server-side. Thin text usually means the homepage is all images and app widgets; add real copy in text sections (what you sell, for whom, why).',
    wordpress: 'WordPress renders server-side. If words are thin, the page is mostly images or builder widgets that load later; add an intro paragraph and section copy.',
    magento: 'Luma renders server-side. A PWA Studio or headless front end needs SSR (Venia SSR or a prerender service) for crawlers.',
    framer: 'Framer pre-renders pages, so thin text means the page really has little copy. Add a proper intro and section paragraphs.',
    webflow: 'Webflow renders static HTML; thin text means the page needs more written content.',
    nextjs: 'Use server components, SSG or SSR for public routes. Client-only data fetching leaves crawlers with an empty shell.',
  },
  entity_links: {
    generic: 'In Organization JSON-LD, add a sameAs array with your LinkedIn, Instagram, X, YouTube, Trustpilot, Crunchbase and Google Business Profile URLs.',
    wordpress: 'Yoast SEO > Settings > Site representation > Other profiles. Rank Math: Titles & Meta > Local SEO > social profiles.',
  },
  author_date: {
    generic: 'Show who wrote key pages and when they were last updated (a visible byline and a dateModified in Article schema).',
    wordpress: 'Turn on author boxes and "last updated" dates in the theme or SEO plugin. Fill in author profiles with a bio and links.',
    shopify: 'Blog templates show the author; add "Updated on" to articles and services pages, and an author profile page.',
  },
  descriptive_headings: { generic: 'Break the page into sections with H2 headings that read as answers ("Shipping to the EU in 3 days", not "Our promise").' },
  answers: { generic: 'Add a short FAQ with the real questions customers ask (shipping, returns, compatibility, lead times) and mark it up with FAQPage schema.' },
  ttfb: {
    generic: 'Put a CDN with page caching in front of the site, enable server caching, and move to a faster host if the origin is slow.',
    shopify: 'Shopify\'s own TTFB is fast. Slow responses usually come from a proxy in front (Cloudflare with wrong settings) or a flood of theme app extensions. Check Online Store > Themes > Speed report.',
    wordpress: 'Install a page cache (LiteSpeed Cache, WP Rocket or your host\'s cache), add a CDN, and check PHP version (8.2+) and object cache. Slow TTFB almost always means no page cache.',
    magento: 'Stores > Configuration > Advanced > System > Full Page Cache: use Varnish, not built-in. Add a CDN (Fastly or Cloudflare) and make sure indexers are on schedule and cron runs.',
    framer: 'Framer serves from a CDN; slow TTFB usually comes from a redirect chain or a proxy in front.',
    webflow: 'Webflow serves from a CDN; check for a proxy or redirect chain.',
    bigcommerce: 'BigCommerce caches at the edge; slow responses usually mean uncached pages (logged-in sessions, cart cookies) or a proxy.',
    nextjs: 'Cache rendered pages (ISR or static) and serve from the edge; avoid uncached data fetches on the critical path.',
  },
  html_weight: {
    generic: 'Move inline scripts, styles and SVG sprites into cached external files; remove base64 images from the HTML; paginate huge menus.',
    shopify: 'Large HTML on Shopify is usually inline JSON from apps and a mega menu. Remove unused apps and trim menu depth.',
    wordpress: 'Page builders inline a lot of CSS. Enable critical CSS or the builder\'s "optimised DOM output", and remove unused widgets.',
    magento: 'Large HTML usually comes from a deep category menu and inline x-magento-init scripts. Limit menu depth and consider Hyvä.',
  },
  compression: {
    generic: 'Enable brotli or gzip on the web server or CDN for text responses.',
    magento: 'Enable gzip in nginx (gzip on; gzip_types text/html text/css application/javascript application/json) or turn on Brotli at the CDN.',
    nextjs: 'Most hosts compress by default; if self-hosted, enable compression in your reverse proxy.',
  },
  cache_headers: { generic: 'Set Cache-Control on HTML (short, with revalidation) and long max-age with versioned filenames on static assets.' },
  script_count: {
    generic: 'Audit every third-party script: remove tags you no longer use, load the rest through one tag manager, and defer anything not needed for first paint.',
    shopify: 'Online Store > Themes > Customize > App embeds: turn off app embeds you do not use, then uninstall the apps. Each app you remove drops scripts.',
    wordpress: 'Deactivate plugins that add front-end scripts you do not need, and use Perfmatters or Asset CleanUp to unload scripts per page.',
    magento: 'Enable JS bundling and minification for production (Stores > Configuration > Advanced > Developer, in developer mode) or move to Hyvä which ships without RequireJS.',
    framer: 'Framer itself is light; the count comes from custom code embeds (chat widgets, analytics). Keep only the ones that pay for themselves.',
    webflow: 'Webflow is light; custom code embeds and apps add the rest. Remove what you do not use.',
    hubspot: 'HubSpot loads its own tracking and chat scripts; turn off the chat widget and unused tracking under Settings > Tracking & Analytics.',
  },
  render_blocking: {
    generic: 'Add defer (or async) to scripts in the head, or move them before </body>. Inline only the tiny critical bits.',
    shopify: 'Theme scripts in theme.liquid should use defer. App scripts that insist on blocking belong in the app embed settings or removal list.',
    wordpress: 'Use a performance plugin (WP Rocket, Perfmatters, LiteSpeed Cache) to defer JavaScript; test checkout afterwards.',
    magento: 'Enable "Move JS code to the bottom of the page" and deferred loading in Stores > Configuration > Advanced > Developer > JavaScript Settings, or use Hyvä.',
  },
  modern_images: {
    generic: 'Serve WebP or AVIF (with JPEG fallback) and size images to their display size with srcset.',
    shopify: 'Shopify\'s CDN serves WebP automatically when the theme uses image_url filters with width parameters. Replace hard-coded image URLs in custom sections with the image_tag filter.',
    wordpress: 'WordPress 6.5+ can generate WebP on upload (Settings > Media in some hosts), or use ShortPixel, Imagify or EWWW to convert and serve WebP.',
    magento: 'Use Fastly or Cloudflare image optimisation, or a WebP module; Magento core does not convert images.',
    framer: 'Framer converts to WebP/AVIF automatically; the misses are images in custom code embeds.',
    webflow: 'Webflow converts uploaded images to WebP when you choose "Compress" in the Assets panel.',
  },
  lazy_loading: {
    generic: 'Add loading="lazy" to images below the fold; keep the hero image eager with fetchpriority="high".',
    shopify: 'Modern themes lazy load by default; in custom sections pass loading: "lazy" to image_tag.',
    wordpress: 'WordPress adds loading="lazy" by default since 5.5; a theme or plugin may be removing it.',
  },
  stylesheets: { generic: 'Merge and minify stylesheets, and inline the critical CSS for above-the-fold content.' },

  // ---------- Product page mode ----------
  product_jsonld: {
    generic: 'Add one Product JSON-LD block to the product template with name, image, description, sku, brand and offers (price, priceCurrency, availability as a schema.org URL, url). Validate at validator.schema.org.',
    shopify: 'Most themes emit Product JSON-LD from sections/main-product.liquid or snippets/product-schema.liquid. Online Store > Themes > Edit code, search for application/ld+json. If it is gone, restore the snippet; if the JSON is broken, an app is usually injecting a second block.',
    wordpress: 'WooCommerce core emits a Product block from WC_Structured_Data on single product pages. If it is missing, a theme or plugin suppresses it; test with other SEO plugins off. Keep one block, not WooCommerce plus Yoast plus Rank Math.',
    magento: 'Magento emits no Product JSON-LD by default. Add a block in catalog_product_view.xml (or an SEO module such as Amasty, Mageplaza or the Hyvä schema module) that writes Product with offers from the product attributes.',
    framer: 'Framer has no commerce layer. Add the Product JSON-LD in the page custom code, filled from CMS fields.',
    webflow: 'Webflow Ecommerce: add a JSON-LD embed on the product template page using CMS fields for name, price and availability.',
    bigcommerce: 'Cornerstone themes print Product schema in templates/components/products/product-view.html. Check the block parses and carries offers.',
    nextjs: 'Render Product JSON-LD in the product route from the same data that renders the page, with offers and the schema.org availability URL.',
  },
  product_core_fields: {
    generic: 'Fill name, at least one absolute image URL and a real description (not the site tagline) in the Product block.',
    shopify: 'In the schema snippet use product.title, product.featured_image | image_url and product.description | strip_html | truncate. Make sure the image URL starts with https://.',
    wordpress: 'WooCommerce fills these from the product title, featured image and short description. An empty short description leaves description blank; write one per product.',
    magento: 'Map name, the base image URL (absolute, with the media base URL) and the short description attribute in the schema block.',
  },
  product_offer: {
    generic: 'Add offers to the Product block: "@type": "Offer", price as a number, priceCurrency as an ISO code (EUR, USD), availability as https://schema.org/InStock (or OutOfStock, PreOrder, BackOrder), and url.',
    shopify: 'In the schema snippet set price from product.selected_or_first_available_variant.price | money_without_currency, priceCurrency from cart.currency.iso_code (or shop.currency), availability from variant.available, and url from canonical_url.',
    wordpress: 'WooCommerce writes the Offer itself. A missing price usually means a variable product with no default variation, or a plugin hiding prices for guests; set a default variation or show prices to guests.',
    magento: 'In the schema block write offers with the final price, the store currency code and availability from is_salable (InStock or OutOfStock), plus the product URL.',
    webflow: 'Bind price and the Availability field in the JSON-LD embed; use the full https://schema.org/InStock URL, not the word.',
  },
  product_identifiers: {
    generic: 'Add sku, brand and a gtin (gtin13, gtin12, gtin8 or gtin14), or mpn when there is no barcode, to the Product block.',
    shopify: 'Use variant.sku, variant.barcode (as gtin) and product.vendor (as brand) in the schema snippet. Fill the barcode field on each variant in Products.',
    wordpress: 'WooCommerce has SKU built in. For GTIN, WooCommerce 9.2+ has a GTIN, UPC, EAN or ISBN field under Inventory; older stores use Yoast WooCommerce SEO or Rank Math for GTIN and brand.',
    magento: 'Map the sku attribute, a manufacturer or brand attribute and an EAN or UPC attribute in the schema block. Create the attribute in Stores > Attributes if it does not exist.',
  },
  product_shipping: {
    generic: 'Add offers.shippingDetails as an OfferShippingDetails object with shippingRate (value, currency), shippingDestination (addressCountry) and deliveryTime (ShippingDeliveryTime with handlingTime and transitTime as QuantitativeValue in days). One block covers every product.',
    shopify: "Shopify's default JSON-LD has no shippingDetails. Add an OfferShippingDetails block to the schema snippet with your flat rate and delivery days per country; one snippet in the product template covers every product. Apps that write shipping schema exist too.",
    wordpress: 'Add shippingDetails through the woocommerce_structured_data_product filter in a small plugin or your child theme functions.php, with your flat rate, the countries you ship to and handling plus transit days.',
    magento: 'Add OfferShippingDetails to the schema block with the flat rate from your shipping method, the allowed countries and handling plus transit days from your carrier settings.',
    webflow: 'Add an OfferShippingDetails object to the JSON-LD embed with the rate, the countries you ship to and delivery days.',
    nextjs: 'Add shippingDetails to the Product JSON-LD from your shipping table: rate, destination countries, handling and transit days.',
  },
  product_returns: {
    generic: 'Add offers.hasMerchantReturnPolicy as a MerchantReturnPolicy with applicableCountry, returnPolicyCategory (https://schema.org/MerchantReturnFiniteReturnWindow, MerchantReturnUnlimitedWindow or MerchantReturnNotPermitted), merchantReturnDays and returnMethod.',
    shopify: "Shopify's default JSON-LD has no return policy. Add a MerchantReturnPolicy block to the schema snippet with your return window in days and the countries it applies to; one snippet covers every product.",
    wordpress: 'Add hasMerchantReturnPolicy through the woocommerce_structured_data_product filter, with your return window in days, the category and the countries.',
    magento: 'Add a MerchantReturnPolicy object to the schema block from your returns page: window in days, category and countries.',
    webflow: 'Add a MerchantReturnPolicy object to the JSON-LD embed with the return window in days and the category.',
  },
  product_reviews: {
    generic: 'Add aggregateRating (ratingValue, reviewCount or ratingCount, bestRating) to the Product block from the same reviews the page shows, and review entries for a few of them.',
    shopify: 'Review apps (Judge.me, Yotpo, Okendo, Loox) can write aggregateRating into the Product JSON-LD; turn that on in the app settings rather than adding a second Product block.',
    wordpress: 'WooCommerce adds aggregateRating when native reviews are on (Products > Settings > Enable reviews). Review plugins should merge into that block, not emit another.',
    magento: 'Add aggregateRating from the review summary (rating_summary and reviews_count) to the schema block.',
  },
  product_variants: {
    generic: 'Describe variants in the data: a ProductGroup with hasVariant Products (each with its own offer), or an AggregateOffer with lowPrice, highPrice and offerCount when one page covers all variants.',
    shopify: 'In the schema snippet loop product.variants and emit one Offer per variant (sku, price, availability, url with ?variant=), or a ProductGroup with hasVariant. Dawn 13+ emits offers per variant; older themes do not.',
    wordpress: 'WooCommerce emits an AggregateOffer with lowPrice and highPrice for variable products. If yours shows a single price, a plugin is overriding the block; let WooCommerce write it.',
    magento: 'For configurable products emit an AggregateOffer with the lowest and highest child price, or one Offer per child with its sku.',
  },
  price_no_js: {
    generic: 'Render the price in the HTML on the server, not only in a script-driven component. A crawler that runs no JavaScript must see the number and the currency in the page text.',
    shopify: 'Keep the price in the Liquid markup (the price snippet in main-product.liquid), not only in a JavaScript-rendered component. Check with JavaScript off in the browser.',
    wordpress: 'The price is in the server HTML for simple products. For variable products add the price range to the template so it is there before a variation is chosen; some themes hide it until selection.',
    magento: 'Luma and Hyvä render the price box server side. If the price-box div is empty and the number is only in the data-mage-init JSON, add it to the template or fix the price indexer.',
    nextjs: 'Server-render the price (server components, SSR or SSG). Client-only fetching of product data leaves crawlers a page with no price.',
  },
  stock_no_js: {
    generic: 'Print the stock status (in stock, sold out, ships in 2 days) and the add to cart button in the server HTML, not only after a script runs.',
    shopify: 'Keep the add to cart button and the inventory text in the Liquid template. Some apps replace the buy button with a script-rendered one; keep a server-rendered fallback.',
    wordpress: 'WooCommerce prints the stock status and the cart form server side. If they are missing, a theme or app is rendering the buy box with JavaScript.',
    magento: 'Luma prints the stock label and the add to cart button server side. Headless or PWA front ends need server rendering for the buy box.',
  },
  product_h1: {
    generic: 'Use exactly one H1 and put the product name in it. The logo, the vendor and the collection belong in other tags.',
    shopify: 'In main-product.liquid the title block should be the only H1. Older themes wrap the logo in an H1 in header.liquid; change that to a div or span.',
    wordpress: 'The product title is the H1 in WooCommerce templates. A theme that also makes the site title an H1 on every page needs a header fix.',
    magento: 'The page-title block renders the H1. Remove extra H1s from the theme header or from CMS blocks on the page.',
  },
  product_image_alt: {
    generic: 'Give every product image alt text with the product name, variant and angle.',
    shopify: 'Products > product > Media > click an image > Add alt text. Themes print it on the gallery images.',
    wordpress: 'Media Library > image > Alternative Text. WooCommerce uses it on the gallery.',
    magento: 'Catalog > Products > Images and Videos > Alt Text on each image.',
  },
  ai_shopping_bots: {
    generic: 'In robots.txt, allow OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Amazonbot, Bingbot and Google-Extended on the product paths. Do not Disallow the folder your products live in for these user agents.',
    shopify: 'Edit robots.txt.liquid (Online Store > Themes > Edit code > Add template > robots.txt). Shopify allows these bots by default; remove any Disallow lines someone added for them, and never block /products/.',
    wordpress: 'Edit robots.txt in Yoast (Tools > File editor) or Rank Math and remove the Disallow rules for those user agents. Do not disallow /product/ or /shop/. Security plugins and Cloudflare "Block AI bots" can add blocks too.',
    magento: 'Content > Design > Configuration > Search Engine Robots: remove the Disallow rules for those user agents from the custom instructions; do not disallow /catalog/ for them.',
    framer: 'Site Settings > General > Robots.txt: remove the blocking lines.',
    webflow: 'Site settings > SEO > Indexing > robots.txt: remove the blocking lines.',
    nextjs: 'Edit app/robots.ts or public/robots.txt. If you use Cloudflare, also check the "Block AI bots" switch under Security > Bots.',
  },
  product_indexable: {
    generic: 'The product page must answer HTTP 200 with real text in the HTML and no noindex. Remove bot protection for the AI user agents, and server-render the page.',
    shopify: 'A noindex on a product usually means the product is in draft, hidden from the Online Store channel, or password protection is on. Check product status and sales channels.',
    wordpress: 'Open the product in Yoast or Rank Math and allow indexing; set catalog visibility to "Shop and search results".',
    magento: 'Catalog > Products > the product > Search Engine Optimization: the robots setting must be INDEX, FOLLOW, and the product must be enabled and visible in catalog and search.',
  },
  product_canonical: {
    generic: 'Output a self-referencing canonical on every product page: <link rel="canonical" href="https://yourdomain/the-product-url">, without tracking or variant parameters.',
    shopify: 'theme.liquid should contain <link rel="canonical" href="{{ canonical_url }}">; Shopify then points collection paths at the plain /products/ URL. If an app changed it, restore the line.',
    wordpress: 'Yoast and Rank Math print the canonical. If it points elsewhere, check the per-product Advanced tab for a manual canonical.',
    magento: 'Stores > Configuration > Catalog > Catalog > Search Engine Optimization: "Use Canonical Link Meta Tag For Products" = Yes.',
    webflow: 'Site settings > SEO > Indexing > Global canonical tag URL, and no manual canonical on the product template.',
    nextjs: 'Set metadata.alternates.canonical in the product route to the clean product URL.',
  },
  product_og: {
    generic: 'Add og:type product, og:title, og:image, product:price:amount and product:price:currency to the product template head.',
    shopify: 'Most themes print these in snippets/meta-tags.liquid (og:type "product" and product:price:amount from the current variant). If missing, add them there.',
    wordpress: 'Yoast and Rank Math print og:type product on product pages; product:price:amount comes from Yoast WooCommerce SEO or a small filter on wpseo_opengraph.',
    magento: 'Magento prints no Open Graph tags by default. Add them in the product page head with an SEO module or a template block using the product name, image and final price.',
    webflow: 'Page settings > Open Graph settings on the product template, plus a custom code embed for product:price:amount.',
  },
  product_title_meta: {
    generic: 'Give the product a 15 to 60 character title that contains the product name, and a 50 to 160 character meta description that states what it is, for whom, and one reason to buy.',
    shopify: 'Products > product > Search engine listing > Edit: page title and meta description.',
    wordpress: 'Edit the product and set the SEO title and meta description in the Yoast or Rank Math box.',
    magento: 'Catalog > Products > the product > Search Engine Optimization > Meta Title and Meta Description.',
  },
  shopify_product_json: {
    generic: 'Shopify only: /products/<handle>.js should return the product JSON.',
    shopify: '/products/<handle>.js is on by default. A 404 or an HTML answer means password protection (Online Store > Preferences), a redirect app rewriting /products/ URLs, or a storefront proxy that blocks the endpoint. Agents and feeds read it, so keep it open.',
  },
  platform_render: {
    generic: 'Keep one complete Product JSON-LD block per page and render the price in the server HTML.',
    shopify: 'Two Product blocks usually means the theme snippet plus an app (reviews, bundles, schema apps). Keep the theme block and turn off the app schema, or the other way round, but not both.',
    wordpress: 'Keep one Product block. In Yoast, WooCommerce SEO merges into the WooCommerce block; in Rank Math turn off the Product schema when WooCommerce already prints one.',
    magento: 'Make sure the price box renders server side (check the page with JavaScript off). If it is empty, the theme fills it from the price-box JSON config; add the final price to the template.',
  },
};

export function fixFor(finding: Finding, key: FixKey): string | undefined {
  if (finding.status === 'pass' || finding.status === 'info' || finding.status === 'skip') return undefined;
  const table = FIXES[finding.id];
  if (!table) return undefined;
  return table[key] ?? table.generic;
}

export function attachFixes(findings: Finding[], cmsId: string): Finding[] {
  const key = fixKeyFor(cmsId);
  return findings.map((f) => ({ ...f, fix: fixFor(f, key) }));
}
