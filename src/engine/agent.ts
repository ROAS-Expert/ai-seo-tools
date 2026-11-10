// Agent readiness check: can an AI shopping agent find, read and buy from this store?
// Read-only. GET and HEAD against public URLs only, through the same guarded fetcher as the audit.
import { guardedFetch, normaliseInput } from './fetcher';
import { loadPage, detectBlock } from './audit';
import { detectCms } from './cms';
import { parseRobots, isAllowed } from './robots';
import type { Fetcher, PageFacts, RobotsFacts, CmsResult } from './types';

export const AGENT_VERSION = '2026-11-10a';

export const AGENT_BOTS = [
  { ua: 'OAI-SearchBot', owner: 'OpenAI', what: 'ChatGPT search and shopping' },
  { ua: 'ChatGPT-User', owner: 'OpenAI', what: 'ChatGPT fetching a page for a user' },
  { ua: 'PerplexityBot', owner: 'Perplexity', what: 'Perplexity answers and shopping' },
  { ua: 'Claude-SearchBot', owner: 'Anthropic', what: 'Claude search' },
  { ua: 'ClaudeBot', owner: 'Anthropic', what: 'Claude crawling' },
  { ua: 'Amazonbot', owner: 'Amazon', what: 'Rufus and Alexa' },
  { ua: 'Bingbot', owner: 'Microsoft', what: 'Copilot' },
  { ua: 'Google-Extended', owner: 'Google', what: 'Gemini' },
] as const;

export type AgentStatus = 'pass' | 'warn' | 'fail' | 'info';
export type AgentStage = 'find' | 'read' | 'buy';

export interface AgentCheck {
  id: string;
  stage: AgentStage;
  label: string;
  status: AgentStatus;
  detail: string;
  evidence?: string;
  fix?: string;
}

export interface AgentReport {
  id: string;
  version: string;
  url: string;
  hostname: string;
  cms: CmsResult;
  platform: 'shopify' | 'woocommerce' | 'other';
  score: number;
  verdict: 'ready' | 'partly' | 'not';
  headline: string;
  stages: Array<{ id: AgentStage; label: string; pass: number; total: number }>;
  checks: AgentCheck[];
  bots: Array<{ ua: string; owner: string; what: string; home: boolean; product: boolean }>;
  product?: { url: string; name?: string; price?: string; currency?: string; availability?: string; source: string };
  looked: string[];
  createdAt: string;
  ms: number;
}

const STAGE_LABELS: Record<AgentStage, string> = { find: 'Find the store', read: 'Read the products', buy: 'Buy without a human' };

type Obj = Record<string, unknown>;

function flattenJsonLd(nodes: unknown[]): Obj[] {
  const out: Obj[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const o = n as Obj;
    out.push(o);
    if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(walk);
    for (const k of ['mainEntity', 'hasOfferCatalog', 'itemListElement', 'item']) if (o[k]) walk(o[k]);
  };
  nodes.forEach(walk);
  return out;
}

function typeOf(o: Obj): string[] {
  const t = o['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
}

export function productFromJsonLd(nodes: unknown[]): { node: Obj; offer: Obj | undefined } | null {
  for (const o of flattenJsonLd(nodes)) {
    if (!typeOf(o).some((t) => /Product$/i.test(t) && !/ProductGroup/i.test(t)) && !typeOf(o).includes('ProductGroup')) continue;
    let offer: unknown = o['offers'];
    if (Array.isArray(offer)) offer = offer[0];
    if (!offer && Array.isArray(o['hasVariant'])) offer = ((o['hasVariant'] as Obj[])[0] || {})['offers'];
    if (Array.isArray(offer)) offer = offer[0];
    if (offer && typeof offer === 'object' && Array.isArray((offer as Obj)['offers'])) offer = ((offer as Obj)['offers'] as unknown[])[0];
    return { node: o, offer: offer && typeof offer === 'object' ? (offer as Obj) : undefined };
  }
  return null;
}

function pickProductUrl(home: PageFacts | null, origin: string): string | null {
  if (!home) return null;
  const sample = home.html.links.sample || [];
  const pats = [/\/products\/[^/?#]+/i, /\/product\/[^/?#]+/i, /\/p\/[^/?#]+/i, /\/shop\/[^/?#]+\/[^/?#]+/i, /\/item\/[^/?#]+/i];
  for (const p of pats) {
    const hit = sample.find((l) => p.test(l));
    if (hit) {
      try {
        const u = new URL(hit, origin);
        if (u.origin === origin) return u.toString();
      } catch {
        /* skip */
      }
    }
  }
  const m = home.html.htmlSample.match(/href="(\/products\/[a-z0-9-]+)"/i) || home.html.htmlSample.match(/href="(\/product\/[a-z0-9-]+)\/?"/i);
  return m ? origin + m[1] : null;
}

async function tryJson(fetchImpl: Fetcher, url: string, looked: string[]): Promise<{ status: number; json: unknown | null; ctype: string }> {
  looked.push(url);
  const r = await guardedFetch(fetchImpl, url, { follow: true, maxBytes: 400_000, timeoutMs: 8000, headers: { accept: 'application/json' } });
  const ctype = r.headers['content-type'] || '';
  if (!r.ok) return { status: r.status, json: null, ctype };
  try {
    return { status: r.status, json: JSON.parse(r.body), ctype };
  } catch {
    return { status: r.status, json: null, ctype };
  }
}

export async function collectAgentFacts(fetchImpl: Fetcher, rawUrl: string) {
  const started = Date.now();
  const input = normaliseInput(rawUrl);
  const origin = input.origin;
  const looked: string[] = [];

  looked.push(origin + '/');
  const [homeRes, robotsRes] = await Promise.all([loadPage(fetchImpl, origin + '/'), guardedFetch(fetchImpl, origin + '/robots.txt', { follow: true, maxBytes: 200_000, timeoutMs: 8000 })]);
  looked.push(origin + '/robots.txt');
  const home = homeRes.page;
  const robotsIsText = robotsRes.ok && !/text\/html/i.test(robotsRes.headers['content-type'] || '');
  const robots: RobotsFacts = parseRobots(robotsIsText ? robotsRes.body : '', robotsRes.status);
  const cms = detectCms(home);
  const platform: AgentReport['platform'] = cms.id === 'shopify' ? 'shopify' : cms.id === 'woocommerce' ? 'woocommerce' : 'other';

  // A product URL: the input itself if it looks like one, else the platform feed, else a homepage link.
  let productUrl: string | null = /\/(products?|p|item)\/[^/?#]+/i.test(input.pathname) ? input.toString() : null;
  let feed: { kind: string; status: number; count: number; sample?: Obj } | null = null;
  if (platform === 'shopify') {
    const f = await tryJson(fetchImpl, origin + '/products.json?limit=3', looked);
    const products = f.json && typeof f.json === 'object' ? ((f.json as Obj)['products'] as Obj[] | undefined) : undefined;
    feed = { kind: '/products.json', status: f.status, count: Array.isArray(products) ? products.length : 0, sample: Array.isArray(products) ? products[0] : undefined };
    if (!productUrl && feed.sample && typeof feed.sample['handle'] === 'string') productUrl = origin + '/products/' + feed.sample['handle'];
  } else if (platform === 'woocommerce') {
    const f = await tryJson(fetchImpl, origin + '/wp-json/wc/store/v1/products?per_page=3', looked);
    const arr = Array.isArray(f.json) ? (f.json as Obj[]) : [];
    feed = { kind: '/wp-json/wc/store/v1/products', status: f.status, count: arr.length, sample: arr[0] };
    if (!productUrl && feed.sample && typeof feed.sample['permalink'] === 'string') productUrl = String(feed.sample['permalink']);
  }
  if (!productUrl) productUrl = pickProductUrl(home, origin);

  let product: PageFacts | null = null;
  let productErr: string | undefined;
  if (productUrl) {
    looked.push(productUrl);
    const pr = await loadPage(fetchImpl, productUrl);
    product = pr.page;
    productErr = pr.error;
  }

  // Platform JSON for one product, cart endpoint, checkout entry, policies, llms.txt. All GET.
  const extra: Record<string, { status: number; json: unknown | null; ctype: string; location?: string; body?: string }> = {};
  const jobs: Array<Promise<void>> = [];
  if (platform === 'shopify') {
    if (productUrl && /\/products\/[^/?#]+/.test(productUrl)) {
      const jsUrl = productUrl.replace(/\/products\/([^/?#]+).*$/, '/products/$1.js');
      jobs.push(tryJson(fetchImpl, jsUrl, looked).then((r) => void (extra.productJson = r)));
    }
    jobs.push(tryJson(fetchImpl, origin + '/cart.js', looked).then((r) => void (extra.cart = r)));
    jobs.push(
      (async () => {
        looked.push(origin + '/checkout');
        const r = await guardedFetch(fetchImpl, origin + '/checkout', { follow: false, maxBytes: 100_000, timeoutMs: 8000 });
        extra.checkout = { status: r.status, json: null, ctype: r.headers['content-type'] || '', location: r.location || r.headers['location'], body: r.body.slice(0, 5000) };
      })(),
    );
    for (const p of ['shipping-policy', 'refund-policy']) {
      jobs.push(
        (async () => {
          looked.push(origin + '/policies/' + p);
          const r = await guardedFetch(fetchImpl, origin + '/policies/' + p, { follow: true, maxBytes: 200_000, timeoutMs: 8000 });
          extra[p] = { status: r.status, json: null, ctype: r.headers['content-type'] || '', body: r.body.slice(0, 20000) };
        })(),
      );
    }
  } else if (platform === 'woocommerce') {
    jobs.push(tryJson(fetchImpl, origin + '/wp-json/wc/store/v1/cart', looked).then((r) => void (extra.cart = r)));
    if (feed?.sample && typeof feed.sample['id'] === 'number') jobs.push(tryJson(fetchImpl, origin + '/wp-json/wc/store/v1/products/' + feed.sample['id'], looked).then((r) => void (extra.productJson = r)));
  }
  jobs.push(
    (async () => {
      looked.push(origin + '/llms.txt');
      const r = await guardedFetch(fetchImpl, origin + '/llms.txt', { follow: true, maxBytes: 100_000, timeoutMs: 6000 });
      extra.llms = { status: r.status, json: null, ctype: r.headers['content-type'] || '', body: r.body.slice(0, 2000) };
    })(),
  );
  await Promise.all(jobs);

  return { input, origin, hostname: input.hostname.replace(/^www\./, ''), home, homeErr: homeRes.error, robots, cms, platform, productUrl, product, productErr, feed, extra, looked, ms: Date.now() - started };
}

export type AgentFacts = Awaited<ReturnType<typeof collectAgentFacts>>;

function botTable(robots: RobotsFacts, productPath: string): AgentReport['bots'] {
  return AGENT_BOTS.map((b) => ({ ua: b.ua, owner: b.owner, what: b.what, home: !robots.present || isAllowed(robots, b.ua, '/'), product: !robots.present || isAllowed(robots, b.ua, productPath) }));
}

export function runAgentChecks(f: AgentFacts): { checks: AgentCheck[]; bots: AgentReport['bots']; product?: AgentReport['product'] } {
  const checks: AgentCheck[] = [];
  const add = (c: AgentCheck) => checks.push(c);
  const productPath = f.productUrl ? new URL(f.productUrl).pathname : '/products/example';
  const bots = botTable(f.robots, productPath);
  const blockedOnProducts = bots.filter((b) => !b.product);
  const blockedBuyers = blockedOnProducts.filter((b) => ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Amazonbot', 'Bingbot'].includes(b.ua));

  // FIND
  const homeBlock = f.home ? detectBlock(f.home.status, f.home.headers, f.home.html.title, f.home.html.htmlSample) : undefined;
  if (!f.home) add({ id: 'home', stage: 'find', label: 'Homepage answers a plain fetch', status: 'fail', detail: 'The homepage did not return HTML to a normal fetch' + (f.homeErr ? ' (' + f.homeErr + ')' : '') + '. Agents fetch like this before anything else.', fix: 'Make sure the root URL returns a 200 HTML page to clients without cookies or JavaScript. Check the host, firewall and any geo rules.' });
  else if (homeBlock || f.home.status >= 400) add({ id: 'home', stage: 'find', label: 'Homepage answers a plain fetch', status: 'fail', detail: homeBlock ? 'A bot wall answered instead of the page: ' + homeBlock + '. Agents see the challenge, not the store.' : 'The homepage returned HTTP ' + f.home.status + '.', evidence: 'HTTP ' + f.home.status, fix: 'In Cloudflare, Akamai or your WAF, allow verified AI bots (OpenAI, Anthropic, Perplexity, Amazon, Microsoft publish IP ranges) or lower the challenge level for them.' });
  else add({ id: 'home', stage: 'find', label: 'Homepage answers a plain fetch', status: 'pass', detail: 'HTTP ' + f.home.status + ' in ' + f.home.totalMs + ' ms, no bot wall.' });

  // Nothing answered at all: every other check would only repeat that, so stop here.
  if (!f.home) return { checks, bots: [], product: undefined };

  if (!f.robots.present) add({ id: 'robots', stage: 'find', label: 'robots.txt lets shopping agents in', status: 'warn', detail: 'No robots.txt was found, so every bot is allowed by default. That works, but you have no control over training crawlers either.', fix: 'Publish a robots.txt that allows the shopping and search bots and decides on training bots. The robots.txt builder on this site writes one.' });
  else if (blockedBuyers.length) add({ id: 'robots', stage: 'find', label: 'robots.txt lets shopping agents in', status: 'fail', detail: blockedBuyers.map((b) => b.ua).join(', ') + ' cannot read your product pages. These are the bots behind ChatGPT shopping, Perplexity, Rufus and Copilot.', evidence: blockedOnProducts.map((b) => b.ua).join(', ') + ' blocked on ' + productPath, fix: 'Add Allow rules for OAI-SearchBot, ChatGPT-User, PerplexityBot, Amazonbot and Bingbot, at least on /products/ and /collections/. Keep GPTBot and Google-Extended blocked if you do not want training.' });
  else if (blockedOnProducts.length) add({ id: 'robots', stage: 'find', label: 'robots.txt lets shopping agents in', status: 'warn', detail: 'The buying bots are allowed. ' + blockedOnProducts.map((b) => b.ua).join(', ') + ' are blocked, which only affects training and Claude or Gemini answers.', evidence: blockedOnProducts.map((b) => b.ua).join(', ') });
  else add({ id: 'robots', stage: 'find', label: 'robots.txt lets shopping agents in', status: 'pass', detail: 'All eight shopping and assistant bots can read the homepage and product pages.' });

  if (f.feed) {
    if (f.feed.count > 0) add({ id: 'feed', stage: 'find', label: 'Machine-readable product list', status: 'pass', detail: f.feed.kind + ' returns products as JSON. Agents can list your catalogue without scraping.', evidence: f.feed.kind + ' HTTP ' + f.feed.status + ', ' + f.feed.count + ' sampled' });
    else add({ id: 'feed', stage: 'find', label: 'Machine-readable product list', status: f.platform === 'shopify' ? 'warn' : 'info', detail: f.feed.kind + ' did not return products (HTTP ' + f.feed.status + '). ' + (f.platform === 'shopify' ? 'Shopify serves it by default, so an app or a password page is probably in the way.' : 'The WooCommerce Store API is off or filtered.'), fix: f.platform === 'shopify' ? 'Check Online Store > Preferences for a password, and apps that rewrite /products.json. Agents and Google Merchant both use it.' : 'Enable the WooCommerce Store API (it is on by default since 7.x) or publish a product feed.' });
  } else {
    const sitemaps = f.robots.sitemaps.length;
    add({ id: 'feed', stage: 'find', label: 'Machine-readable product list', status: sitemaps ? 'info' : 'warn', detail: sitemaps ? 'No platform JSON endpoint detected for ' + f.cms.name + '. The sitemap listed in robots.txt is the discovery path.' : 'No platform JSON endpoint and no sitemap in robots.txt. Agents have to crawl link by link.', fix: 'Publish a product sitemap and a Google Merchant style feed, and list the sitemap in robots.txt.' });
  }

  // READ
  let product: AgentReport['product'] | undefined;
  if (!f.productUrl) add({ id: 'pdp', stage: 'read', label: 'A product page was found', status: 'fail', detail: 'No product URL could be found from the homepage links or a platform feed.', fix: 'Link products from the homepage with plain anchors (not only JavaScript cards), or paste a product URL into this tool.' });
  else if (!f.product) add({ id: 'pdp', stage: 'read', label: 'A product page was found', status: 'fail', detail: 'The product page did not return HTML' + (f.productErr ? ' (' + f.productErr + ')' : '') + '.', evidence: f.productUrl });
  else {
    add({ id: 'pdp', stage: 'read', label: 'A product page was found', status: 'pass', detail: 'Checked ' + f.productUrl.replace(/^https?:\/\//, ''), evidence: 'HTTP ' + f.product.status });
    const pj = productFromJsonLd(f.product.html.jsonld);
    const meta = f.product.html.product.meta;
    const name = pj ? String(pj.node['name'] || '') : f.product.html.h1[0] || '';
    const price = pj?.offer ? String(pj.offer['price'] ?? pj.offer['lowPrice'] ?? '') : meta['price:amount'] || '';
    const currency = pj?.offer ? String(pj.offer['priceCurrency'] ?? '') : meta['price:currency'] || '';
    const availability = pj?.offer ? String(pj.offer['availability'] ?? '').replace(/^https?:\/\/schema\.org\//, '') : '';
    product = { url: f.productUrl, name: name || undefined, price: price || undefined, currency: currency || undefined, availability: availability || undefined, source: pj ? 'JSON-LD Product' : meta['price:amount'] ? 'product: meta tags' : 'none' };

    if (pj && price && currency) add({ id: 'schema', stage: 'read', label: 'Price and currency in structured data', status: 'pass', detail: 'Product JSON-LD with an Offer: ' + price + ' ' + currency + '. Agents read this before the visible page.' });
    else if (price) add({ id: 'schema', stage: 'read', label: 'Price and currency in structured data', status: 'warn', detail: 'A price is present (' + price + (currency ? ' ' + currency : '') + ') but not as a complete Product and Offer in JSON-LD.', fix: 'Add Product JSON-LD with offers.price, offers.priceCurrency and offers.availability. Shopify themes since 2024 do this in the product template. Older themes need the snippet.' });
    else add({ id: 'schema', stage: 'read', label: 'Price and currency in structured data', status: 'fail', detail: 'No Product JSON-LD and no product:price meta tags. Agents have to guess the price from text.', fix: 'Add Product JSON-LD with an Offer (price, priceCurrency, availability, url). Every major platform has a native or plugin option.' });

    if (availability) add({ id: 'stock', stage: 'read', label: 'Stock state is explicit', status: /InStock|PreOrder|BackOrder|LimitedAvailability/i.test(availability) ? 'pass' : 'warn', detail: 'offers.availability is ' + availability + '.', fix: /OutOfStock|SoldOut|Discontinued/i.test(availability) ? 'The sampled product is out of stock. That is fine, but agents skip it, so make sure in-stock items carry InStock.' : undefined });
    else add({ id: 'stock', stage: 'read', label: 'Stock state is explicit', status: 'fail', detail: 'No availability value. An agent cannot tell whether it can order this item.', fix: 'Set offers.availability to https://schema.org/InStock or OutOfStock per variant.' });

    const text = f.product.html.product.text || '';
    const priceInText = price ? text.includes(price.replace(/\.00$/, '')) || text.includes(price) : /(\$|€|£|USD|EUR|GBP|INR|₹)\s?\d/.test(text);
    if (f.product.html.bodyWords < 40) add({ id: 'ssr', stage: 'read', label: 'Readable without JavaScript', status: 'fail', detail: 'Only ' + f.product.html.bodyWords + ' words of text are in the HTML. The page is drawn by JavaScript, which most agents do not run.', fix: 'Server-render the product name, price, description and add-to-cart. On headless builds, use SSR or static generation for product routes.' });
    else if (!priceInText) add({ id: 'ssr', stage: 'read', label: 'Readable without JavaScript', status: 'warn', detail: 'The text is there (' + f.product.html.bodyWords + ' words) but the price is not in the visible HTML, so it probably loads later.', fix: 'Render the price in the HTML, not only via a script after load.' });
    else add({ id: 'ssr', stage: 'read', label: 'Readable without JavaScript', status: 'pass', detail: f.product.html.bodyWords + ' words of product text and the price are in the raw HTML.' });

    const shipping = pj?.offer ? Boolean(pj.offer['shippingDetails']) : false;
    const returns = pj?.offer ? Boolean(pj.offer['hasMerchantReturnPolicy']) : false;
    const shipPolicy = f.extra['shipping-policy']?.status === 200 || /shipping/i.test(f.home?.html.links.sample.join(' ') || '');
    const refPolicy = f.extra['refund-policy']?.status === 200 || /(return|refund)/i.test(f.home?.html.links.sample.join(' ') || '');
    if (shipping && returns) add({ id: 'policy', stage: 'read', label: 'Shipping and returns are machine-readable', status: 'pass', detail: 'shippingDetails and hasMerchantReturnPolicy are in the Offer. Agents quote these when they compare stores.' });
    else if (shipPolicy || refPolicy) add({ id: 'policy', stage: 'read', label: 'Shipping and returns are machine-readable', status: 'warn', detail: 'Policy pages exist' + (shipPolicy && refPolicy ? '' : ' (' + (shipPolicy ? 'shipping' : 'returns') + ' only)') + ', but the Offer has no shippingDetails or hasMerchantReturnPolicy, so agents must read prose.', fix: 'Add OfferShippingDetails and MerchantReturnPolicy to the Product JSON-LD, or set them once in Google Merchant Center and reference the policies.' });
    else add({ id: 'policy', stage: 'read', label: 'Shipping and returns are machine-readable', status: 'fail', detail: 'No shipping or returns information was found in the structured data or linked from the homepage.', fix: 'Publish shipping and returns pages, link them in the footer, and add them to the Offer as shippingDetails and hasMerchantReturnPolicy.' });
  }

  // BUY
  const pjson = f.extra.productJson;
  if (f.platform === 'shopify') {
    if (pjson?.json && typeof pjson.json === 'object' && Array.isArray((pjson.json as Obj)['variants'])) {
      const variants = (pjson.json as Obj)['variants'] as Obj[];
      const avail = variants.filter((v) => v['available']).length;
      add({ id: 'pjson', stage: 'buy', label: 'Variant IDs and stock via JSON', status: 'pass', detail: '/products/<handle>.js lists ' + variants.length + ' variant' + (variants.length === 1 ? '' : 's') + ', ' + avail + ' available, with IDs an agent needs to add to cart.' });
    } else add({ id: 'pjson', stage: 'buy', label: 'Variant IDs and stock via JSON', status: 'warn', detail: '/products/<handle>.js did not return variant JSON' + (pjson ? ' (HTTP ' + pjson.status + ')' : '') + '.', fix: 'Shopify serves this by default. A password page, a bot rule or an app proxy is probably interfering.' });
    const cart = f.extra.cart;
    if (cart?.json && typeof cart.json === 'object' && 'items' in (cart.json as Obj)) add({ id: 'cart', stage: 'buy', label: 'Cart API reachable', status: 'pass', detail: 'GET /cart.js answers with a cart object. The Ajax Cart API (add.js, update.js) is what agent checkouts use.' });
    else add({ id: 'cart', stage: 'buy', label: 'Cart API reachable', status: 'fail', detail: '/cart.js did not return JSON' + (cart ? ' (HTTP ' + cart.status + ')' : '') + '. Agents cannot build a cart.', fix: 'Check bot protection and any app that rewrites /cart endpoints.' });
    const co = f.extra.checkout;
    const loc = co?.location || '';
    if (co && /account\/login|\/login/i.test(loc)) add({ id: 'checkout', stage: 'buy', label: 'Guest checkout allowed', status: 'fail', detail: '/checkout redirects to a login page. Agents and most shoppers will not create an account to buy.', evidence: loc, fix: 'Settings > Customer accounts: set accounts to optional, not required.' });
    else if (co && (co.status === 200 || (co.status >= 300 && co.status < 400))) add({ id: 'checkout', stage: 'buy', label: 'Guest checkout allowed', status: 'pass', detail: 'Checkout answers without asking for a login' + (loc ? ' (goes to ' + loc.replace(/^https?:\/\/[^/]+/, '') + ' while the cart is empty)' : '') + '.' });
    else add({ id: 'checkout', stage: 'buy', label: 'Guest checkout allowed', status: 'warn', detail: '/checkout returned HTTP ' + (co?.status ?? 0) + '. Could not confirm the account setting.', fix: 'Confirm Settings > Customer accounts is not set to required.' });
  } else if (f.platform === 'woocommerce') {
    if (pjson?.json && typeof pjson.json === 'object' && 'prices' in (pjson.json as Obj)) add({ id: 'pjson', stage: 'buy', label: 'Product and stock via Store API', status: 'pass', detail: 'The WooCommerce Store API returns prices and stock for a product, which is what an agent needs to order.' });
    else add({ id: 'pjson', stage: 'buy', label: 'Product and stock via Store API', status: 'warn', detail: 'The Store API product endpoint did not answer' + (pjson ? ' (HTTP ' + pjson.status + ')' : '') + '.', fix: 'Keep the WooCommerce Store API enabled and not blocked by a security plugin for /wp-json/wc/store/.' });
    const cart = f.extra.cart;
    if (cart?.json && typeof cart.json === 'object' && 'items' in (cart.json as Obj)) add({ id: 'cart', stage: 'buy', label: 'Cart API reachable', status: 'pass', detail: 'GET /wp-json/wc/store/v1/cart answers. Agents can add items and go to checkout.' });
    else add({ id: 'cart', stage: 'buy', label: 'Cart API reachable', status: 'fail', detail: 'The Store API cart endpoint did not return a cart' + (cart ? ' (HTTP ' + cart.status + ')' : '') + '.', fix: 'Check security plugins that block /wp-json/ for anonymous requests.' });
    const guest = f.product ? !/guest checkout is (not|un)available|must be logged in to checkout/i.test(f.product.html.htmlSample) : true;
    add({ id: 'checkout', stage: 'buy', label: 'Guest checkout allowed', status: guest ? 'info' : 'fail', detail: guest ? 'Could not verify from outside. WooCommerce > Settings > Accounts: "Enable guest checkout" should be on.' : 'The page says guests cannot check out.', fix: guest ? undefined : 'Turn on guest checkout in WooCommerce > Settings > Accounts & Privacy.' });
  } else {
    add({ id: 'pjson', stage: 'buy', label: 'Product and stock via an API', status: 'info', detail: 'No public cart or product API is known for ' + f.cms.name + '. Agents fall back to the structured data on the page.', fix: 'Expose a product feed (Google Merchant format) and keep the Product JSON-LD complete.' });
    const hasCart = f.product ? f.product.html.product.addToCart : false;
    add({ id: 'cart', stage: 'buy', label: 'Add to cart is in the HTML', status: hasCart ? 'pass' : 'warn', detail: hasCart ? 'An add-to-cart control is present in the server HTML.' : 'No add-to-cart control in the raw HTML. It is probably injected by JavaScript.', fix: hasCart ? undefined : 'Render the add-to-cart form server-side so agents and no-JS clients see it.' });
    add({ id: 'checkout', stage: 'buy', label: 'Guest checkout allowed', status: 'info', detail: 'Could not verify from outside. Check that checkout does not require an account.' });
  }

  const llms = f.extra.llms;
  const llmsOk = llms && llms.status === 200 && !/text\/html/i.test(llms.ctype) && /^#\s*\S/m.test(llms.body || '');
  add({ id: 'llms', stage: 'find', label: 'llms.txt describes the store', status: llmsOk ? 'pass' : 'info', detail: llmsOk ? 'An llms.txt is served at the root.' : 'No llms.txt. Optional, but it is the cheapest way to tell assistants what you sell and which pages matter.', fix: llmsOk ? undefined : 'Generate one with the llms.txt generator on this site.' });

  return { checks, bots, product };
}

export function scoreAgent(checks: AgentCheck[]): { score: number; verdict: AgentReport['verdict']; stages: AgentReport['stages'] } {
  const weights: Record<AgentStage, number> = { find: 30, read: 40, buy: 30 };
  let total = 0;
  const stages: AgentReport['stages'] = [];
  for (const id of ['find', 'read', 'buy'] as AgentStage[]) {
    const cs = checks.filter((c) => c.stage === id && c.status !== 'info');
    const earned = cs.reduce((a, c) => a + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
    const pct = cs.length ? earned / cs.length : 1;
    total += pct * weights[id];
    stages.push({ id, label: STAGE_LABELS[id], pass: cs.filter((c) => c.status === 'pass').length, total: cs.length });
  }
  const dead = checks.some((c) => c.id === 'home' && c.status === 'fail') && checks.length === 1;
  const score = dead ? 0 : Math.round(total);
  const hardFail = checks.some((c) => c.status === 'fail' && ['home', 'pdp', 'robots', 'cart', 'checkout'].includes(c.id));
  const verdict: AgentReport['verdict'] = hardFail || score < 50 ? 'not' : score < 80 || checks.some((c) => c.status === 'fail') ? 'partly' : 'ready';
  return { score, verdict, stages };
}

export function headlineFor(verdict: AgentReport['verdict'], checks: AgentCheck[]): string {
  const fails = checks.filter((c) => c.status === 'fail');
  if (verdict === 'ready') return 'An AI agent can find, read and buy here today.';
  if (verdict === 'partly') return 'An agent can find and read the store, but ' + (fails[0] ? fails[0].label.toLowerCase() + ' fails' : 'a few checks need work') + '.';
  const first = fails.find((c) => ['home', 'robots', 'pdp', 'cart', 'checkout'].includes(c.id)) || fails[0];
  return first ? 'Blocked at "' + first.label + '". Fix that first.' : 'Not ready yet.';
}

export async function agentCheck(fetchImpl: Fetcher, rawUrl: string, id: string): Promise<AgentReport> {
  const f = await collectAgentFacts(fetchImpl, rawUrl);
  const { checks, bots, product } = runAgentChecks(f);
  const { score, verdict, stages } = scoreAgent(checks);
  return {
    id,
    version: AGENT_VERSION,
    url: f.input.toString(),
    hostname: f.hostname,
    cms: f.cms,
    platform: f.platform,
    score,
    verdict,
    headline: f.home && f.platform === 'other' && !f.productUrl && !f.cms.ecommerce ? 'This does not look like an online store. No product pages were found, so the read and buy steps could not be tested.' : headlineFor(verdict, checks),
    stages,
    checks,
    bots,
    product,
    looked: Array.from(new Set(f.looked)),
    createdAt: new Date().toISOString(),
    ms: f.ms,
  };
}
