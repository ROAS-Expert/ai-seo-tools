// UTM builder logic for /utm-builder. Pure: no DOM, no network, unit-tested.
// Builds tagged links, keeps ad platform macros like {{campaign.name}} intact, lints naming,
// and predicts the GA4 default channel group a link will land in.

export interface UtmInput { url: string; source: string; medium: string; campaign: string; term?: string; content?: string; id?: string }
export interface UtmResult { ok: boolean; url: string; suffix: string; error?: string; warnings: string[]; channel: string; channelWhy: string }

export interface Preset { id: string; label: string; source: string; medium: string; campaign: string; term: string; content: string; where: string }
export const PRESETS: Preset[] = [
  { id: 'meta', label: 'Meta ads', source: 'facebook', medium: 'paid_social', campaign: '{{campaign.name}}', term: '{{adset.name}}', content: '{{ad.name}}', where: 'Paste the URL parameters into the "URL parameters" box at ad level in Ads Manager. Meta fills the names when the ad is clicked.' },
  { id: 'google', label: 'Google Ads', source: 'google', medium: 'cpc', campaign: '{campaignid}', term: '{keyword}', content: '{creative}', where: 'Paste the URL parameters into "Final URL suffix" at account or campaign level. Keep auto-tagging on as well: GA4 uses the gclid first.' },
  { id: 'tiktok', label: 'TikTok ads', source: 'tiktok', medium: 'paid_social', campaign: '__CAMPAIGN_NAME__', term: '__AID_NAME__', content: '__CID_NAME__', where: 'Add the parameters to the destination URL in each ad, or use the URL parameters field. TikTok fills the names at click time.' },
  { id: 'pinterest', label: 'Pinterest ads', source: 'pinterest', medium: 'paid_social', campaign: '{campaign_name}', term: '{adgroup_name}', content: '', where: 'Add the parameters to the destination URL of each Pin promotion.' },
  { id: 'microsoft', label: 'Microsoft Ads', source: 'bing', medium: 'cpc', campaign: '{Campaign}', term: '{keyword}', content: '{AdGroup}', where: 'Paste into the "Final URL suffix" at account or campaign level.' },
  { id: 'email', label: 'Email newsletter', source: 'newsletter', medium: 'email', campaign: '', term: '', content: '', where: 'Many email tools can add UTMs for you in their settings. Use this when yours does not, or for one-off links.' },
  { id: 'klaviyo', label: 'Klaviyo flow or campaign', source: 'klaviyo', medium: 'email', campaign: '', term: '', content: '', where: 'Klaviyo can tag every link automatically under Settings, UTM tracking. Match these values there so reports stay consistent.' },
  { id: 'organic', label: 'Organic social post', source: 'instagram', medium: 'social', campaign: '', term: '', content: '', where: 'Use one link per post or bio, and change the source to the network you post on.' },
  { id: 'influencer', label: 'Influencer or creator', source: 'creator-name', medium: 'influencer', campaign: '', term: '', content: '', where: 'Give each creator their own source. GA4 puts "influencer" in Unassigned unless you add a custom channel group, so many teams use medium "social" or "affiliate" instead.' },
  { id: 'affiliate', label: 'Affiliate or partner', source: 'partner-name', medium: 'affiliate', campaign: '', term: '', content: '', where: 'One source per partner, so you can pay and compare them.' },
  { id: 'qr', label: 'QR code or print', source: 'qr', medium: 'offline', campaign: '', term: '', content: '', where: 'Use content to tell flyers, packaging inserts and posters apart.' },
];

const MACRO = /\{\{[^}]+\}\}|\{[A-Za-z_:.]+\}|__[A-Z_]+__/;

function enc(v: string): string {
  if (!MACRO.test(v)) return encodeURIComponent(v);
  // Keep macros as typed so the ad platform can replace them; encode the text around them.
  return v.split(/(\{\{[^}]+\}\}|\{[A-Za-z_:.]+\}|__[A-Z_]+__)/).map((part) => (MACRO.test(part) ? part : encodeURIComponent(part))).join('');
}

const SEARCH = /^(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia|naver|brave|startpage|search)$/;
const SOCIAL = /^(facebook|fb|instagram|ig|meta|tiktok|linkedin|lnkd\.in|pinterest|twitter|x|t\.co|reddit|snapchat|threads|quora|tumblr|whatsapp|discord|messenger)$/;
const VIDEO = /^(youtube|vimeo|twitch|dailymotion)$/;
const SHOP = /^(shopping|google shopping|amazon|ebay|etsy|walmart|shopify|mercadolibre)$/;
const PAID = /^(.*cp.*|ppc|retargeting|paid.*)$/;

/** Simplified GA4 default channel group rules, in GA4's own order. */
export function ga4Channel(sourceIn: string, mediumIn: string, campaignIn = ''): { channel: string; why: string } {
  const s = sourceIn.trim().toLowerCase();
  const m = mediumIn.trim().toLowerCase();
  const c = campaignIn.trim().toLowerCase();
  if (!s && !m) return { channel: 'Direct', why: 'No source and no medium.' };
  if (/cross-network/.test(c)) return { channel: 'Cross-network', why: 'The campaign name contains "cross-network".' };
  const paid = PAID.test(m);
  if ((SHOP.test(s) || /(^|[^a-df-z])shop|shopping/.test(c)) && paid) return { channel: 'Paid Shopping', why: 'A shopping source or campaign with a paid medium.' };
  if (SEARCH.test(s) && paid) return { channel: 'Paid Search', why: 'A search engine source with a paid medium such as cpc.' };
  if (SOCIAL.test(s) && paid) return { channel: 'Paid Social', why: 'A social network source with a paid medium.' };
  if (VIDEO.test(s) && paid) return { channel: 'Paid Video', why: 'A video site source with a paid medium.' };
  if (/^(display|banner|expandable|interstitial|cpm)$/.test(m)) return { channel: 'Display', why: 'The medium is a display medium.' };
  if (paid) return { channel: 'Paid Other', why: 'The medium is paid, but GA4 does not know the source. Use a known source name like google or facebook.' };
  if (SHOP.test(s) || /(^|[^a-df-z])shop|shopping/.test(c)) return { channel: 'Organic Shopping', why: 'A shopping source or campaign.' };
  if (SOCIAL.test(s) || /^(social|social-network|social-media|sm|social network|social media)$/.test(m)) return { channel: 'Organic Social', why: 'A social network source or a social medium.' };
  if (VIDEO.test(s) || /video/.test(m)) return { channel: 'Organic Video', why: 'A video site source or a video medium.' };
  if (SEARCH.test(s) || m === 'organic') return { channel: 'Organic Search', why: 'A search engine source or the organic medium.' };
  if (/^(referral|app|link)$/.test(m)) return { channel: 'Referral', why: 'The medium is referral.' };
  if (/^(email|e-mail|e_mail|e mail)$/.test(s) || /^(email|e-mail|e_mail|e mail)$/.test(m)) return { channel: 'Email', why: 'The source or medium is email.' };
  if (m === 'affiliate') return { channel: 'Affiliates', why: 'The medium is affiliate.' };
  if (m === 'audio') return { channel: 'Audio', why: 'The medium is audio.' };
  if (s === 'sms' || m === 'sms') return { channel: 'SMS', why: 'The source or medium is sms.' };
  if (/push$/.test(m) || /mobile|notification/.test(m)) return { channel: 'Mobile Push Notifications', why: 'The medium is a push notification.' };
  return { channel: 'Unassigned', why: 'GA4 cannot match this source and medium to any default channel. It will show as Unassigned unless you add a custom channel group.' };
}

export function lintUtm(i: UtmInput): string[] {
  const w: string[] = [];
  const parts: Array<[string, string | undefined]> = [['source', i.source], ['medium', i.medium], ['campaign', i.campaign], ['term', i.term], ['content', i.content]];
  for (const [k, v] of parts) {
    if (!v || MACRO.test(v)) continue;
    if (/[A-Z]/.test(v)) w.push('utm_' + k + ' has capital letters. GA4 treats "Facebook" and "facebook" as two sources, so keep everything lowercase.');
    if (/\s/.test(v)) w.push('utm_' + k + ' has spaces. Use - or _ instead, so the link does not break when it is copied.');
    if (/[?&#=]/.test(v)) w.push('utm_' + k + ' contains ? & # or =, which can cut the link short.');
  }
  if (i.medium && /^(paid|ads?)$/i.test(i.medium)) w.push('A medium of just "' + i.medium + '" lands in Paid Other. Use cpc for search or paid_social for social ads.');
  if (/^(fb|ig)$/i.test(i.source)) w.push('Pick one name per network and stick to it. "facebook" and "fb" show up as two rows in reports.');
  if (!i.campaign) w.push('No campaign name. Without one you cannot tell this link apart from others on the same channel.');
  return w;
}

export function buildUtm(i: UtmInput): UtmResult {
  const pairs: Array<[string, string]> = [];
  const add = (k: string, v?: string) => {
    const t = (v || '').trim();
    if (t) pairs.push([k, t]);
  };
  add('utm_source', i.source);
  add('utm_medium', i.medium);
  add('utm_campaign', i.campaign);
  add('utm_id', i.id);
  add('utm_term', i.term);
  add('utm_content', i.content);
  const suffix = pairs.map(([k, v]) => k + '=' + enc(v)).join('&');
  const ch = ga4Channel(i.source || '', i.medium || '', i.campaign || '');
  const warnings = lintUtm(i);
  const raw = (i.url || '').trim();
  if (!raw) return { ok: false, url: '', suffix, error: 'Enter the page address the link should open.', warnings, channel: ch.channel, channelWhy: ch.why };
  if (!i.source?.trim() || !i.medium?.trim()) return { ok: false, url: '', suffix, error: 'Source and medium are both needed. Without them GA4 ignores the other tags.', warnings, channel: ch.channel, channelWhy: ch.why };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return { ok: false, url: '', suffix, error: 'That does not look like a web address.', warnings, channel: ch.channel, channelWhy: ch.why };
  }
  const keep: string[] = [];
  u.searchParams.forEach((v, k) => {
    if (!/^utm_/i.test(k)) keep.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  });
  const q = [...keep, suffix].filter(Boolean).join('&');
  const url = u.origin + u.pathname + (q ? '?' + q : '') + u.hash;
  if (u.hash) warnings.push('The address has a #fragment. It stays at the end, after the UTM tags, which is where it belongs.');
  return { ok: true, url, suffix, warnings, channel: ch.channel, channelWhy: ch.why };
}

/** Read UTM tags back out of a link someone pasted. */
export function parseUtm(link: string): { base: string; tags: Record<string, string> } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(link.trim()) ? link.trim() : 'https://' + link.trim());
    const tags: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      if (/^utm_/i.test(k)) tags[k.toLowerCase().replace(/^utm_/, '')] = v;
    });
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'].forEach((k) => u.searchParams.delete(k));
    return { base: u.toString(), tags };
  } catch {
    return null;
  }
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\n');
}
