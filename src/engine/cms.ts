import type { CmsResult, PageFacts } from './types';

interface Sig {
  id: string;
  name: string;
  ecommerce: boolean;
  html?: RegExp[];
  scripts?: RegExp[];
  headers?: Array<[string, RegExp]>;
  generator?: RegExp;
  classes?: RegExp[];
  strong?: number; // signals needed for high confidence
}

const SIGS: Sig[] = [
  { id: 'shopify', name: 'Shopify', ecommerce: true, html: [/Shopify\.theme/i, /\/cdn\/shop\//i, /shopify-section/i, /myshopify\.com/i, /cdn\.shopify\.com\/(s\/files|shopifycloud)/i], scripts: [/\/cdn\/shop\//i, /cdn\.shopify\.com\/shopifycloud/i], headers: [['x-shopify-stage', /./], ['x-sorting-hat-shopid', /./], ['set-cookie', /_shopify_|cart_currency|secure_customer_sig/i]], classes: [/shopify-section/i], strong: 2 },
  { id: 'woocommerce', name: 'WooCommerce (WordPress)', ecommerce: true, html: [/woocommerce/i, /wc-add-to-cart|wc_add_to_cart|wc-cart-fragments/i], scripts: [/\/plugins\/woocommerce\//i, /wc-add-to-cart|wc-cart-fragments/i], classes: [/\bwoocommerce\b/i], strong: 1 },
  { id: 'magento', name: 'Magento (Adobe Commerce)', ecommerce: true, html: [/\/static\/(version\d+\/)?frontend\//i, /Magento_/i, /mage\/(requirejs|cookies|translate)/i, /data-mage-init/i, /x-magento-init/i], scripts: [/\/static\/(version\d+\/)?frontend\//i, /requirejs\/require\.js/i], headers: [['x-magento-cache-debug', /./], ['set-cookie', /mage-cache-storage|X-Magento-Vary|form_key/i]], classes: [/\bcms-index-index\b|\bpage-layout-|\bcatalog-product-view\b/i], strong: 2 },
  { id: 'bigcommerce', name: 'BigCommerce', ecommerce: true, html: [/cdn\d*\.bigcommerce\.com/i, /bigcommerce/i, /stencil-utils/i], scripts: [/bigcommerce\.com/i], headers: [['x-bigcommerce-id', /./]], strong: 1 },
  { id: 'prestashop', name: 'PrestaShop', ecommerce: true, html: [/prestashop/i, /\/modules\/ps_/i, /var prestashop/i], generator: /prestashop/i, strong: 1 },
  { id: 'shopware', name: 'Shopware', ecommerce: true, html: [/shopware/i, /\/bundles\/storefront\//i], strong: 1 },
  { id: 'wix', name: 'Wix', ecommerce: false, html: [/static\.wixstatic\.com/i, /static\.parastorage\.com/i, /wix\.com/i], headers: [['x-wix-request-id', /./]], generator: /wix/i, strong: 1 },
  { id: 'squarespace', name: 'Squarespace', ecommerce: false, html: [/static1?\.squarespace\.com/i, /squarespace\.com/i, /This is Squarespace/i], generator: /squarespace/i, strong: 1 },
  { id: 'webflow', name: 'Webflow', ecommerce: false, html: [/data-wf-site/i, /data-wf-page/i, /webflow\.js/i, /assets-global\.website-files\.com|cdn\.prod\.website-files\.com/i], generator: /webflow/i, classes: [/\bw-nav\b|\bw-container\b|\bw-layout-/i], strong: 1 },
  { id: 'framer', name: 'Framer', ecommerce: false, html: [/framerusercontent\.com/i, /data-framer-/i, /framer\.com/i, /events\.framer\.com/i], generator: /framer/i, classes: [/\bframer-/i], strong: 1 },
  { id: 'hubspot', name: 'HubSpot CMS', ecommerce: false, html: [/hs-scripts\.com/i, /hubspot/i, /hs-sites\.com|hs-sites-na\d\.com/i, /hsforms\.net/i], headers: [['x-hs-cache-config', /./]], generator: /hubspot/i, strong: 2 },
  { id: 'ghost', name: 'Ghost', ecommerce: false, generator: /ghost/i, html: [/ghost\.io|ghost-sdk|\/ghost\//i], strong: 1 },
  { id: 'drupal', name: 'Drupal', ecommerce: false, generator: /drupal/i, html: [/Drupal\.settings|drupalSettings/i, /\/sites\/default\/files\//i], strong: 1 },
  { id: 'joomla', name: 'Joomla', ecommerce: false, generator: /joomla/i, html: [/\/media\/jui\//i, /\/media\/system\/js\//i], strong: 1 },
  { id: 'wordpress', name: 'WordPress', ecommerce: false, html: [/\/wp-content\//i, /\/wp-includes\//i, /wp-json/i], scripts: [/\/wp-content\//i, /\/wp-includes\//i], generator: /wordpress/i, strong: 1 },
  { id: 'nextjs', name: 'Next.js (custom build)', ecommerce: false, html: [/__NEXT_DATA__/i, /\/_next\/static\//i], scripts: [/\/_next\//i], headers: [['x-powered-by', /next\.js/i]], strong: 1 },
  { id: 'nuxt', name: 'Nuxt (custom build)', ecommerce: false, html: [/__NUXT__/i, /\/_nuxt\//i], scripts: [/\/_nuxt\//i], strong: 1 },
  { id: 'gatsby', name: 'Gatsby', ecommerce: false, html: [/___gatsby/i, /gatsby-/i], generator: /gatsby/i, strong: 1 },
  { id: 'sfcc', name: 'Salesforce Commerce Cloud', ecommerce: true, html: [/demandware\.static/i, /on\/demandware\.store/i], strong: 1 },
  { id: 'vtex', name: 'VTEX', ecommerce: true, html: [/vtexassets\.com|vteximg\.com\.br/i], strong: 1 },
  { id: 'squarespace-commerce', name: 'Squarespace Commerce', ecommerce: true, html: [/sqs-add-to-cart-button|ProductItem-/i], strong: 1 },
  { id: 'wix-stores', name: 'Wix Stores', ecommerce: true, html: [/wixstores|wix-stores/i], strong: 1 },
  { id: 'ecwid', name: 'Ecwid', ecommerce: true, html: [/ecwid/i], strong: 1 },
  { id: 'opencart', name: 'OpenCart', ecommerce: true, html: [/catalog\/view\/theme|route=product|index\.php\?route=/i], strong: 1 },
];

const ORDER_PRIORITY: Record<string, number> = { woocommerce: 10, 'squarespace-commerce': 9, 'wix-stores': 9, shopify: 8, magento: 8, bigcommerce: 8, prestashop: 8, shopware: 8, sfcc: 8, vtex: 8, ecwid: 7, opencart: 7 };

export function detectCms(page: PageFacts | null): CmsResult {
  if (!page) return { id: 'unknown', name: 'Unknown', ecommerce: false, confidence: 'low', signals: [] };
  const h = page.html;
  const sample = h.htmlSample;
  const scripts = h.scriptSrcSample.join('\n');
  const hits: Array<{ sig: Sig; signals: string[] }> = [];
  for (const sig of SIGS) {
    const signals: string[] = [];
    if (sig.generator && sig.generator.test(h.generator)) signals.push('generator meta: ' + h.generator.slice(0, 60), 'generator meta (strong)', 'generator meta (strong)');
    for (const re of sig.html ?? []) {
      const m = sample.match(re);
      if (m) signals.push('html: ' + m[0].slice(0, 60));
    }
    for (const re of sig.scripts ?? []) {
      const m = scripts.match(re);
      if (m) signals.push('script: ' + m[0].slice(0, 60));
    }
    for (const [name, re] of sig.headers ?? []) {
      const v = page.headers[name];
      if (v && re.test(v)) signals.push('header: ' + name);
    }
    for (const re of sig.classes ?? []) {
      const m = h.classSample.match(re);
      if (m) signals.push('class: ' + m[0].slice(0, 40));
    }
    if (signals.length) hits.push({ sig, signals: [...new Set(signals)] });
  }
  if (!hits.length) return { id: 'unknown', name: 'Custom or unknown', ecommerce: false, confidence: 'low', signals: [] };
  // A generator meta names the platform outright. Platform priority (for example WooCommerce over WordPress) only
  // applies once a candidate has enough signals; a single passing mention of another platform's CDN does not count.
  const rank = (x: { sig: Sig; signals: string[] }) => {
    const gen = x.signals.some((v) => v.startsWith('generator meta')) ? 100 : 0;
    const enough = x.signals.length >= (x.sig.strong ?? 1);
    return gen + (enough ? ORDER_PRIORITY[x.sig.id] ?? 0 : 0) + x.signals.length;
  };
  hits.sort((a, b) => rank(b) - rank(a));
  let top = hits[0];
  // Commerce layers on top of a CMS win over the bare CMS when both are seen.
  const SUPERSEDES: Record<string, string> = { wordpress: 'woocommerce', squarespace: 'squarespace-commerce', wix: 'wix-stores' };
  const upper = SUPERSEDES[top.sig.id];
  if (upper) {
    const u = hits.find((x) => x.sig.id === upper);
    if (u) top = { sig: u.sig, signals: [...u.signals, ...top.signals] };
  }
  // Shopify and WooCommerce commonly embed third-party scripts naming other platforms; require generator or 2 signals for framework-only ids.
  const confidence: CmsResult['confidence'] = top.signals.length >= (top.sig.strong ?? 2) + 1 ? 'high' : top.signals.length >= (top.sig.strong ?? 1) ? 'medium' : 'low';
  const ecommerce = top.sig.ecommerce || hits.some((x) => x.sig.ecommerce && x.signals.length >= 2) || /add[-_ ]to[-_ ]cart|data-product-id|class="[^"]*product[^"]*price/i.test(sample);
  return { id: top.sig.id, name: top.sig.name, ecommerce, confidence, signals: [...new Set(top.signals)].slice(0, 6) };
}
