// Theme and app detector. Reads one page: the platform (shared cms.ts detector), the theme (Shopify.theme on Shopify,
// the theme folder on WordPress and Magento) and third-party apps by their script and markup fingerprints.
import type { CmsResult } from './types';

export interface ThemeInfo {
  name: string;             // the name the store gave it
  original?: string;        // the theme it was built from (Shopify schema_name), when it differs or is known
  version?: string;
  storeId?: number;         // Shopify Theme Store id: present when it is a Theme Store theme
  renamed: boolean;
  source: string;           // where we read it, in plain words
  storeUrl?: string;        // Theme Store page guess for Theme Store themes
}
export interface AppHit { name: string; category: string }
export interface StackReport { platform: CmsResult; theme: ThemeInfo | null; apps: AppHit[]; categories: Array<{ category: string; apps: string[] }> }

const APPS: Array<[string, string, RegExp]> = [
  ['Klaviyo', 'Email and SMS', /static\.klaviyo\.com|klaviyo\.js/i],
  ['Omnisend', 'Email and SMS', /omnisnippet|omnisend/i],
  ['Mailchimp', 'Email and SMS', /chimpstatic\.com|list-manage\.com/i],
  ['Attentive', 'Email and SMS', /cdn\.attn\.tv|attentivemobile/i],
  ['Postscript', 'Email and SMS', /postscript\.io/i],
  ['Privy', 'Pop-ups', /widget\.privy\.com|privy\.com\/widget/i],
  ['Justuno', 'Pop-ups', /justuno/i],
  ['Judge.me', 'Reviews', /judge\.me|judgeme/i],
  ['Yotpo', 'Reviews', /yotpo\.com|staticw2\.yotpo/i],
  ['Okendo', 'Reviews', /okendo\.io|okendo-reviews/i],
  ['Loox', 'Reviews', /loox\.io/i],
  ['Stamped', 'Reviews', /stamped\.io/i],
  ['REVIEWS.io', 'Reviews', /reviews\.io|reviewsio/i],
  ['Junip', 'Reviews', /juniphq\.com/i],
  ['Trustpilot', 'Reviews', /widget\.trustpilot\.com/i],
  ['Rebuy', 'Upsell and bundles', /rebuyengine\.com/i],
  ['Bold', 'Upsell and bundles', /boldapps\.net|boldcommerce/i],
  ['Vitals', 'Upsell and bundles', /appsolve\.io|vitals\.app/i],
  ['ReConvert', 'Upsell and bundles', /reconvert/i],
  ['Recharge', 'Subscriptions', /rechargecdn\.com|rechargepayments\.com|rechargeapps/i],
  ['Skio', 'Subscriptions', /skio\.com/i],
  ['Loop Subscriptions', 'Subscriptions', /loopsubscriptions/i],
  ['Smile.io', 'Loyalty', /smile\.io|sweettooth/i],
  ['LoyaltyLion', 'Loyalty', /loyaltylion/i],
  ['Growave', 'Loyalty', /growave|socialshopwave/i],
  ['Gorgias', 'Support and chat', /gorgias\.(chat|io)/i],
  ['Tidio', 'Support and chat', /tidio\.co/i],
  ['Zendesk', 'Support and chat', /zdassets\.com|zopim/i],
  ['Intercom', 'Support and chat', /widget\.intercom\.io|intercomcdn/i],
  ['Re:amaze', 'Support and chat', /reamaze/i],
  ['PageFly', 'Page builder', /pagefly/i],
  ['GemPages', 'Page builder', /gempages|gem-page/i],
  ['Shogun', 'Page builder', /getshogun|shogun-frontend/i],
  ['Replo', 'Page builder', /replo/i],
  ['Searchanise', 'Search and filters', /searchanise/i],
  ['Boost Commerce', 'Search and filters', /boostcommerce|bc-sf-filter/i],
  ['Algolia', 'Search and filters', /algolia/i],
  ['Nosto', 'Personalisation', /nosto/i],
  ['Klarna', 'Payments', /klarna/i],
  ['Afterpay', 'Payments', /afterpay|clearpay/i],
  ['Affirm', 'Payments', /affirm\.com\/js/i],
  ['Sezzle', 'Payments', /sezzle/i],
  ['Route', 'Shipping and returns', /routeapp|route-widget|cdn\.routeapp/i],
  ['AfterShip', 'Shipping and returns', /aftership/i],
  ['Loop Returns', 'Shipping and returns', /loopreturns/i],
  ['Weglot', 'Translation', /weglot/i],
  ['Langify', 'Translation', /langify/i],
  ['Swym Wishlist', 'Wishlist', /swymrelay|swym/i],
  ['Hotjar', 'Analytics', /static\.hotjar\.com/i],
  ['Microsoft Clarity', 'Analytics', /clarity\.ms\/tag/i],
  ['Lucky Orange', 'Analytics', /luckyorange/i],
  ['Triple Whale', 'Analytics', /triplewhale|triplepixel/i],
  ['Elevar', 'Analytics', /getelevar|elevar/i],
  ['Littledata', 'Analytics', /littledata/i],
  ['Northbeam', 'Analytics', /northbeam/i],
  ['OneTrust', 'Cookie consent', /cdn\.cookielaw\.org|onetrust/i],
  ['Cookiebot', 'Cookie consent', /cookiebot/i],
  ['Usercentrics', 'Cookie consent', /usercentrics/i],
  ['Pandectes', 'Cookie consent', /pandectes/i],
  ['Consentmo', 'Cookie consent', /consentmo|gdpr-legal-cookie/i],
  ['CookieYes', 'Cookie consent', /cookieyes/i],
  ['Elementor', 'Page builder', /\/plugins\/elementor\//i],
  ['Yoast SEO', 'SEO', /yoast/i],
  ['Rank Math', 'SEO', /rank-math|rankmath/i],
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function shopifyTheme(html: string): ThemeInfo | null {
  const m = html.match(/Shopify\.theme\s*=\s*(\{[^;]{0,1500}?\})\s*;/);
  if (!m) return null;
  let t: Record<string, unknown> = {};
  try {
    t = JSON.parse(m[1]);
  } catch {
    const name = m[1].match(/"name"\s*:\s*"([^"]{1,120})"/);
    if (!name) return null;
    t = { name: name[1] };
  }
  const name = String(t.name || '').trim() || 'Unnamed theme';
  const schema = typeof t.schema_name === 'string' && t.schema_name.trim() ? t.schema_name.trim() : undefined;
  const storeId = typeof t.theme_store_id === 'number' && t.theme_store_id > 0 ? t.theme_store_id : undefined;
  const renamed = !!schema && slug(schema) !== slug(name) && !slug(name).startsWith(slug(schema));
  return {
    name,
    original: schema,
    version: typeof t.schema_version === 'string' ? t.schema_version : undefined,
    storeId,
    renamed,
    source: 'Shopify.theme on the page',
    storeUrl: storeId && schema ? 'https://themes.shopify.com/themes/' + slug(schema) : undefined,
  };
}

function wordpressTheme(html: string): ThemeInfo | null {
  const all = [...html.matchAll(/\/wp-content\/themes\/([a-z0-9_.-]{1,60})\//gi)].map((x) => x[1]);
  if (!all.length) return null;
  const counts = new Map<string, number>();
  for (const t of all) counts.set(t, (counts.get(t) || 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const child = ranked[0];
  const parent = ranked.find((t) => t !== child && child.startsWith(t));
  return { name: child, original: parent, renamed: false, source: 'theme folder in /wp-content/themes/' };
}

function magentoTheme(html: string): ThemeInfo | null {
  const m = html.match(/\/static\/(?:version\d+\/)?frontend\/([A-Za-z0-9_]+)\/([A-Za-z0-9_]+)\//);
  if (!m) return null;
  return { name: m[1] + '/' + m[2], renamed: false, source: 'theme path in /static/frontend/' };
}

export function detectStack(html: string, platform: CmsResult): StackReport {
  let theme: ThemeInfo | null = null;
  if (platform.id === 'shopify' || /Shopify\.theme/.test(html)) theme = shopifyTheme(html);
  if (!theme && (platform.id === 'wordpress' || platform.id === 'woocommerce' || /\/wp-content\/themes\//.test(html))) theme = wordpressTheme(html);
  if (!theme && (platform.id === 'magento' || /\/static\/(version\d+\/)?frontend\//.test(html))) theme = magentoTheme(html);
  const apps: AppHit[] = [];
  for (const [name, category, re] of APPS) if (re.test(html)) apps.push({ name, category });
  const map = new Map<string, string[]>();
  for (const a of apps) map.set(a.category, [...(map.get(a.category) || []), a.name]);
  const categories = [...map.entries()].map(([category, list]) => ({ category, apps: list })).sort((a, b) => b.apps.length - a.apps.length || a.category.localeCompare(b.category));
  return { platform, theme, apps, categories };
}
