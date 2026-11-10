import type { Fetcher } from './types';

export const UA = 'Mozilla/5.0 (compatible; ROASExpertAudit/1.0; +https://tools.roasexpert.com/about)';
export const MAX_BYTES = 1_500_000;
export const TIMEOUT_MS = 9000;
export const MAX_REDIRECTS = 5;

const PRIVATE_HOST_RE = /^(localhost|.*\.local|.*\.internal|.*\.localhost|.*\.home|.*\.lan)$/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardError';
  }
}

/** Normalise user input into a safe https URL. Throws GuardError on anything we refuse to fetch. */
export function normaliseInput(raw: string): URL {
  let s = (raw || '').trim();
  if (!s) throw new GuardError('Enter a website address.');
  if (s.length > 2048) throw new GuardError('That address is too long.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new GuardError('That does not look like a valid website address.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new GuardError('Only http and https sites can be audited.');
  if (u.username || u.password) throw new GuardError('Addresses with credentials are not allowed.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new GuardError('Only ports 80 and 443 are allowed.');
  u.hash = '';
  assertPublicHost(u.hostname);
  if (u.protocol === 'http:') u.protocol = 'https:';
  return u;
}

export function assertPublicHost(hostname: string): void {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h) throw new GuardError('Missing hostname.');
  if (h.startsWith('[') || h.includes(':')) throw new GuardError('IP addresses are not allowed. Use the site name.');
  if (IPV4_RE.test(h)) throw new GuardError('IP addresses are not allowed. Use the site name.');
  if (PRIVATE_HOST_RE.test(h)) throw new GuardError('Private or local hosts are not allowed.');
  if (!h.includes('.')) throw new GuardError('Use a full site name, like example.com.');
  const labels = h.split('.');
  const tld = labels[labels.length - 1];
  if (!/^[a-z0-9-]{2,63}$/.test(tld) || /^\d+$/.test(tld)) throw new GuardError('That domain ending is not valid.');
  if (!labels.every((l) => /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith('-') && !l.endsWith('-') || /^xn--/.test(l))) {
    throw new GuardError('That domain contains characters we cannot audit.');
  }
}

export interface FetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  redirects: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  truncated: boolean;
  ttfbMs: number;
  totalMs: number;
  error?: string;
  location?: string;
}

const KEEP_HEADERS = [
  'content-type',
  'content-encoding',
  'cache-control',
  'x-robots-tag',
  'server',
  'x-powered-by',
  'content-length',
  'location',
  'link',
  'x-shopify-stage',
  'x-magento-cache-debug',
  'x-wix-request-id',
  'x-hs-cache-config',
  'x-framer-server',
  'x-bigcommerce-id',
  'x-sorting-hat-shopid',
  'cf-cache-status',
  'x-cache',
  'set-cookie',
  'vary',
  'strict-transport-security',
];

/**
 * Fetch with manual redirect handling (each hop re-validated), timeout, and a byte cap.
 * `follow=false` returns the first response without following.
 */
export async function guardedFetch(
  fetchImpl: Fetcher,
  url: string,
  opts: { follow?: boolean; method?: 'GET' | 'HEAD'; maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<FetchResult> {
  const follow = opts.follow !== false;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  let current = url;
  let redirects = 0;
  const started = Date.now();
  const empty = (status: number, error?: string): FetchResult => ({
    ok: false,
    status,
    finalUrl: current,
    redirects,
    headers: {},
    body: '',
    bytes: 0,
    truncated: false,
    ttfbMs: Date.now() - started,
    totalMs: Date.now() - started,
    error,
  });

  for (;;) {
    let target: URL;
    try {
      target = new URL(current);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return empty(0, 'Unsupported protocol in redirect');
      if (target.port && target.port !== '80' && target.port !== '443') return empty(0, 'Redirect to a non-standard port');
      assertPublicHost(target.hostname);
    } catch (e) {
      return empty(0, (e as Error).message);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    const hopStart = Date.now();
    try {
      res = await fetchImpl(target.toString(), {
        method: opts.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en',
          ...(opts.headers ?? {}),
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = (e as Error).name === 'AbortError' ? `Timed out after ${timeoutMs} ms` : (e as Error).message;
      return empty(0, msg);
    }
    const ttfbMs = Date.now() - hopStart;
    if (res.status === 530 || res.status === 523 || res.status === 522) {
      // Cloudflare Workers answer 530/523/522 when the origin does not resolve or cannot be reached.
      await res.body?.cancel().catch(() => {});
      clearTimeout(timer);
      return empty(0, res.status === 530 ? 'the domain does not resolve (DNS lookup failed)' : 'the server could not be reached');
    }
    const headers: Record<string, string> = {};
    for (const k of KEEP_HEADERS) {
      const v = res.headers.get(k);
      if (v) headers[k] = v.slice(0, 500);
    }
    const status = res.status;
    if (status >= 300 && status < 400 && res.headers.get('location')) {
      const loc = res.headers.get('location')!;
      let next: string;
      try {
        next = new URL(loc, current).toString();
      } catch {
        clearTimeout(timer);
        return { ...empty(status, 'Bad redirect location'), headers, location: loc };
      }
      await res.body?.cancel().catch(() => {});
      clearTimeout(timer);
      if (!follow) {
        return { ok: false, status, finalUrl: current, redirects, headers, body: '', bytes: 0, truncated: false, ttfbMs, totalMs: Date.now() - started, location: next };
      }
      redirects += 1;
      if (redirects > MAX_REDIRECTS) return empty(status, 'Too many redirects');
      current = next;
      continue;
    }
    // Read body up to cap
    let body = '';
    let bytes = 0;
    let truncated = false;
    if (res.body && opts.method !== 'HEAD') {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false });
      const chunks: string[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            const keep = value.subarray(0, Math.max(0, value.byteLength - (bytes - maxBytes)));
            chunks.push(decoder.decode(keep, { stream: true }));
            truncated = true;
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(decoder.decode(value, { stream: true }));
        }
        chunks.push(decoder.decode());
      } catch (e) {
        clearTimeout(timer);
        return { ok: false, status, finalUrl: current, redirects, headers, body: chunks.join(''), bytes, truncated, ttfbMs, totalMs: Date.now() - started, error: 'Body read failed: ' + (e as Error).message };
      }
      body = chunks.join('');
    }
    clearTimeout(timer);
    return { ok: status >= 200 && status < 300, status, finalUrl: current, redirects, headers, body, bytes, truncated, ttfbMs, totalMs: Date.now() - started };
  }
}
