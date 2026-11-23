// Tracking tags read from page code: Meta, GA4, Google Tag Manager, Google Ads, TikTok, Pinterest, Snap, Microsoft,
// LinkedIn, X, Reddit, Klaviyo, Clarity, Hotjar, plus Shopify app pixels from webPixelsConfigList (sandboxed, so a
// browser extension cannot see them on the page, but their IDs are in the HTML). Consent tools and server-side
// tracking hints too. Reads HTML only: whether events fire is a live-browser question (Tracking Doctor answers it).

export type TagSource = 'page' | 'shopify-app';
export interface FoundTag { id: string; vendor: string; label: string; ids: string[]; sources: TagSource[] }
export interface TagIssue { level: 'fail' | 'warn' | 'info' | 'pass'; title: string; detail: string; fix?: string }
export interface PixelReport { tags: FoundTag[]; consent: string[]; serverSide: string[]; customPixels: number; issues: TagIssue[] }

interface Rule { id: string; vendor: string; label: string; present: RegExp[]; ids?: RegExp[] }

const RULES: Rule[] = [
  { id: 'meta', vendor: 'Meta', label: 'Meta Pixel', present: [/connect\.facebook\.net\/[^"']*fbevents\.js/i, /fbq\(\s*['"]init/i], ids: [/fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{12,20})/gi, /facebook\.com\/tr\?id=(\d{12,20})/gi] },
  { id: 'ga4', vendor: 'Google', label: 'Google Analytics 4', present: [/\bG-[A-Z0-9]{8,12}\b/], ids: [/\b(G-[A-Z0-9]{8,12})\b/g] },
  { id: 'gtm', vendor: 'Google', label: 'Google Tag Manager', present: [/googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]{5,9}\b/], ids: [/\b(GTM-[A-Z0-9]{5,9})\b/g] },
  { id: 'gads', vendor: 'Google', label: 'Google Ads tag', present: [/\bAW-\d{8,12}\b/], ids: [/\b(AW-\d{8,12})\b/g] },
  { id: 'tiktok', vendor: 'TikTok', label: 'TikTok Pixel', present: [/analytics\.tiktok\.com/i, /ttq\.load\(/i], ids: [/ttq\.load\(\s*['"]([A-Z0-9]{15,25})['"]/gi] },
  { id: 'pinterest', vendor: 'Pinterest', label: 'Pinterest Tag', present: [/s\.pinimg\.com\/ct\/core\.js/i, /pintrk\(\s*['"]load/i], ids: [/pintrk\(\s*['"]load['"]\s*,\s*['"](\d{10,16})/gi] },
  { id: 'snap', vendor: 'Snap', label: 'Snap Pixel', present: [/sc-static\.net\/scevent/i, /snaptr\(\s*['"]init/i], ids: [/snaptr\(\s*['"]init['"]\s*,\s*['"]([a-f0-9-]{36})/gi] },
  { id: 'uet', vendor: 'Microsoft', label: 'Microsoft Ads UET', present: [/bat\.bing\.com\/bat\.js/i], ids: [/\bti\s*:\s*['"]?(\d{6,10})/gi] },
  { id: 'linkedin', vendor: 'LinkedIn', label: 'LinkedIn Insight Tag', present: [/snap\.licdn\.com/i, /_linkedin_partner_id/i], ids: [/_linkedin_partner_id\s*=\s*['"]?(\d{4,10})/gi] },
  { id: 'x', vendor: 'X', label: 'X (Twitter) Pixel', present: [/static\.ads-twitter\.com/i, /twq\(\s*['"]config/i], ids: [/twq\(\s*['"]config['"]\s*,\s*['"](\w{4,10})/gi] },
  { id: 'reddit', vendor: 'Reddit', label: 'Reddit Pixel', present: [/redditstatic\.com\/ads\/pixel\.js/i, /rdt\(\s*['"]init/i], ids: [/rdt\(\s*['"]init['"]\s*,\s*['"]([at]2_\w+)/gi] },
  { id: 'klaviyo', vendor: 'Klaviyo', label: 'Klaviyo onsite', present: [/static\.klaviyo\.com\/onsite/i, /klaviyo\.js\?company_id=/i], ids: [/company_id=([A-Za-z0-9]{6})/g] },
  { id: 'clarity', vendor: 'Microsoft', label: 'Microsoft Clarity', present: [/clarity\.ms\/tag\//i], ids: [/clarity\.ms\/tag\/([a-z0-9]{6,12})/gi, /\(window,\s*document,\s*['"]clarity['"]\s*,\s*['"]script['"]\s*,\s*['"]([a-z0-9]{6,12})['"]/gi] },
  { id: 'hotjar', vendor: 'Hotjar', label: 'Hotjar', present: [/static\.hotjar\.com/i, /hjid\s*:/i], ids: [/hjid\s*:\s*(\d{5,9})/gi] },
];

const CONSENT: Array<[string, RegExp]> = [
  ['Google Consent Mode', /gtag\(\s*['"]consent['"]\s*,\s*['"]default/i],
  ['OneTrust', /cdn\.cookielaw\.org|onetrust/i],
  ['Cookiebot', /consent\.cookiebot\.com|cookiebot/i],
  ['Usercentrics', /usercentrics/i],
  ['CookieYes', /cookieyes/i],
  ['iubenda', /iubenda/i],
  ['Termly', /termly\.io/i],
  ['Pandectes', /pandectes/i],
  ['Consentmo', /consentmo|gdpr-legal-cookie/i],
  ['Didomi', /didomi/i],
  ['Axeptio', /axeptio/i],
];

const SERVER: Array<[string, RegExp]> = [
  ['Elevar', /getelevar|elevar/i],
  ['Stape', /stape\.io|stape\.net/i],
  ['Littledata', /littledata/i],
  ['Triple Whale', /triplewhale|triplepixel/i],
  ['Northbeam', /northbeam/i],
  ['Polar Analytics', /polaranalytics|polar-pixel/i],
  ['Meta Conversions API gateway', /capig\.|conversions-api-gateway/i],
];

/** Pull the webPixelsConfigList JSON text out of a Shopify page, unescaped. Empty string when absent. */
export function shopifyPixelText(html: string): string {
  const i = html.search(/webPixelsConfigList/);
  if (i < 0) return '';
  let seg = html.slice(i, i + 40000);
  const end = seg.indexOf('</script>');
  if (end > 0) seg = seg.slice(0, end);
  for (let k = 0; k < 3 && /\\"/.test(seg); k++) seg = seg.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  return seg;
}

function collect(text: string, res: RegExp[]): string[] {
  const out = new Set<string>();
  for (const re of res) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) if (m[1]) out.add(m[1]);
  }
  return [...out];
}

/** Shopify app pixel configs keep IDs under their own keys. */
function shopifyAppIds(seg: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (k: string, v: string[]) => { if (v.length) out[k] = [...new Set([...(out[k] || []), ...v])]; };
  add('meta', collect(seg, [/"pixel_?id"\s*:\s*"(\d{12,20})"/gi]));
  add('tiktok', collect(seg, [/"pixel_?code"\s*:\s*"([A-Z0-9]{15,25})"/gi]));
  add('pinterest', collect(seg, [/"(?:tag_?id|pinterest_?tag_?id)"\s*:\s*"(\d{10,16})"/gi]));
  add('ga4', collect(seg, [/\b(G-[A-Z0-9]{8,12})\b/g]));
  add('gads', collect(seg, [/\b(AW-\d{8,12})\b/g]));
  add('gtm', collect(seg, [/\b(GTM-[A-Z0-9]{5,9})\b/g]));
  add('snap', collect(seg, [/"(?:snap_?)?pixel_?id"\s*:\s*"([a-f0-9-]{36})"/gi]));
  return out;
}

export function detectPixels(html: string): PixelReport {
  const seg = shopifyPixelText(html);
  const i = html.search(/webPixelsConfigList/);
  const pageHtml = seg ? html.slice(0, i) + html.slice(i + Math.max(html.slice(i, i + 40000).indexOf('</script>'), 0)) : html;
  const app = seg ? shopifyAppIds(seg) : {};
  const tags: FoundTag[] = [];
  for (const r of RULES) {
    const onPage = r.present.some((re) => re.test(pageHtml));
    const pageIds = onPage ? collect(pageHtml, r.ids || []) : [];
    const appIds = app[r.id] || [];
    if (!onPage && !appIds.length) continue;
    const sources: TagSource[] = [];
    if (onPage) sources.push('page');
    if (appIds.length) sources.push('shopify-app');
    tags.push({ id: r.id, vendor: r.vendor, label: r.label, ids: [...new Set([...pageIds, ...appIds])], sources });
  }
  const consent = CONSENT.filter(([, re]) => re.test(html)).map(([n]) => n);
  const serverSide = SERVER.filter(([, re]) => re.test(html)).map(([n]) => n);
  const customPixels = seg ? (seg.match(/"type"\s*:\s*"CUSTOM"/g) || []).length : 0;
  return { tags, consent, serverSide, customPixels, issues: issuesFor(tags, consent, serverSide, !!seg) };
}

function issuesFor(tags: FoundTag[], consent: string[], serverSide: string[], shopify: boolean): TagIssue[] {
  const by = (id: string) => tags.find((t) => t.id === id);
  const out: TagIssue[] = [];
  const meta = by('meta');
  const ga4 = by('ga4');
  const gtm = by('gtm');
  if (!ga4 && !gtm) out.push({ level: 'warn', title: 'No Google Analytics or Tag Manager in the page code', detail: 'No GA4 measurement ID or GTM container is in the HTML. Headless stores and some apps load them later from a script bundle, so they may still run. If you are not sure, open the store with Tracking Doctor and watch for GA4 events.', fix: shopify ? 'Install the Google & YouTube app in Shopify and connect your GA4 property, or add GTM through a custom pixel.' : 'Add the GA4 tag (gtag.js) or a GTM container to every page.' });
  else if (ga4 && ga4.ids.length > 1) out.push({ level: 'warn', title: ga4.ids.length + ' GA4 measurement IDs on one page', detail: 'Found ' + ga4.ids.join(', ') + '. Two IDs send every visit to two properties, which is fine on purpose and a reporting mess by accident.', fix: 'Keep one production ID unless you mean to send data to two properties.' });
  else out.push({ level: 'pass', title: 'Analytics tag found', detail: ga4 ? 'GA4 ' + ga4.ids.join(', ') : 'GTM ' + (gtm as FoundTag).ids.join(', ') + ' (GA4 may be inside the container, which cannot be read from outside).' });
  if (ga4 && gtm && ga4.sources.includes('page') && gtm.sources.includes('page')) out.push({ level: 'info', title: 'GA4 tag and GTM both load', detail: 'If GTM also fires a GA4 configuration tag for ' + ga4.ids[0] + ', page views count twice.', fix: 'Open GTM and check whether it has a Google tag for the same ID. Keep one of the two.' });
  if (!meta && !by('tiktok') && !by('pinterest') && !by('snap')) out.push({ level: 'info', title: 'No paid social pixel found', detail: 'No Meta, TikTok, Pinterest or Snap pixel is in the page code or in Shopify app pixels.', fix: 'Fine if you do not run paid social. If you do, those platforms cannot optimise for purchases without one.' });
  if (meta) {
    if (meta.sources.length === 2) out.push({ level: 'warn', title: 'Meta Pixel loads twice', detail: 'The pixel is in the theme code and in a Shopify app pixel. Purchases and add-to-carts can be counted twice, which inflates ROAS in Ads Manager.', fix: 'Remove the hard-coded fbq snippet from the theme and keep the Facebook & Instagram app connection.' });
    if (meta.ids.length > 1) out.push({ level: 'warn', title: meta.ids.length + ' Meta Pixel IDs', detail: 'Found ' + meta.ids.join(', ') + '. Old pixels left behind by agencies or apps split your events.', fix: 'Keep the pixel your ad account optimises on and remove the others.' });
    if (meta.sources.length === 1 && !(meta.ids.length > 1)) out.push({ level: 'pass', title: 'Meta Pixel found', detail: meta.ids.length ? 'ID ' + meta.ids.join(', ') + (meta.sources[0] === 'shopify-app' ? ' through the Shopify app' : ' in the page code') : 'The Meta Pixel script loads.' });
  }
  if (!consent.length) out.push({ level: 'warn', title: 'No consent tool found', detail: 'No Google Consent Mode default and no known cookie banner in the page code. Shopify stores may still use the built-in banner, which this check cannot see.', fix: 'If you sell in the EU or UK, set a consent banner that sends Consent Mode v2 signals, or Google Ads loses remarketing and conversion modelling there.' });
  else out.push({ level: 'pass', title: 'Consent signals found', detail: consent.join(', ') + '.' });
  if (serverSide.length) out.push({ level: 'pass', title: 'Server-side or first-party tracking seen', detail: serverSide.join(', ') + '. Events can survive ad blockers and browser limits.' });
  else if (meta || ga4) out.push({ level: 'info', title: 'No server-side tracking seen', detail: 'Only browser tags were found. Ad blockers and browser privacy limits stop some purchase events from reaching the ad platforms.', fix: 'Turn on Meta Conversions API and Google enhanced conversions, through your platform app or a server container.' });
  return out;
}
