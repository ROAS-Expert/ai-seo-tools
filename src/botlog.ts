// Browser-side AI crawler log analyser. Pure functions, no DOM, no network: the log never leaves the visitor's machine.
// Accepts Apache/Nginx combined format, Cloudflare Logpush JSON lines, and simple CSV with a user agent column.

export interface BotDef {
  id: string;
  label: string;
  owner: string;
  kind: 'search' | 'assistant' | 'training' | 'other';
  re: RegExp;
  verify?: string;
}

export const LOG_BOTS: BotDef[] = [
  { id: 'gptbot', label: 'GPTBot', owner: 'OpenAI', kind: 'training', re: /\bGPTBot\b/i, verify: 'https://openai.com/gptbot.json' },
  { id: 'oai-searchbot', label: 'OAI-SearchBot', owner: 'OpenAI', kind: 'search', re: /\bOAI-SearchBot\b/i, verify: 'https://openai.com/searchbot.json' },
  { id: 'chatgpt-user', label: 'ChatGPT-User', owner: 'OpenAI', kind: 'assistant', re: /\bChatGPT-User\b/i, verify: 'https://openai.com/chatgpt-user.json' },
  { id: 'claudebot', label: 'ClaudeBot', owner: 'Anthropic', kind: 'training', re: /\bClaudeBot\b/i },
  { id: 'claude-searchbot', label: 'Claude-SearchBot', owner: 'Anthropic', kind: 'search', re: /\bClaude-SearchBot\b/i },
  { id: 'claude-user', label: 'Claude-User', owner: 'Anthropic', kind: 'assistant', re: /\bClaude-User\b/i },
  { id: 'perplexitybot', label: 'PerplexityBot', owner: 'Perplexity', kind: 'search', re: /\bPerplexityBot\b/i, verify: 'https://www.perplexity.com/perplexitybot.json' },
  { id: 'perplexity-user', label: 'Perplexity-User', owner: 'Perplexity', kind: 'assistant', re: /\bPerplexity-User\b/i },
  { id: 'googlebot', label: 'Googlebot', owner: 'Google', kind: 'search', re: /\bGooglebot\b/i, verify: 'https://developers.google.com/search/apis/ipranges/googlebot.json' },
  { id: 'google-other', label: 'GoogleOther', owner: 'Google', kind: 'other', re: /\bGoogleOther\b/i },
  { id: 'bingbot', label: 'Bingbot', owner: 'Microsoft', kind: 'search', re: /\bbingbot\b/i, verify: 'https://www.bing.com/toolbox/bingbot.json' },
  { id: 'applebot', label: 'Applebot', owner: 'Apple', kind: 'search', re: /\bApplebot\b/i },
  { id: 'amazonbot', label: 'Amazonbot', owner: 'Amazon', kind: 'assistant', re: /\bAmazonbot\b/i },
  { id: 'meta-externalagent', label: 'meta-externalagent', owner: 'Meta', kind: 'training', re: /\bmeta-externalagent\b/i },
  { id: 'meta-externalfetcher', label: 'meta-externalfetcher', owner: 'Meta', kind: 'assistant', re: /\bmeta-externalfetcher\b/i },
  { id: 'bytespider', label: 'Bytespider', owner: 'ByteDance', kind: 'training', re: /\bBytespider\b/i },
  { id: 'ccbot', label: 'CCBot', owner: 'Common Crawl', kind: 'training', re: /\bCCBot\b/i },
  { id: 'duckassistbot', label: 'DuckAssistBot', owner: 'DuckDuckGo', kind: 'assistant', re: /\bDuckAssistBot\b/i },
  { id: 'mistral', label: 'MistralAI-User', owner: 'Mistral', kind: 'assistant', re: /\bMistralAI-User\b/i },
  { id: 'cohere', label: 'cohere-ai', owner: 'Cohere', kind: 'training', re: /\bcohere-ai\b/i },
  { id: 'youbot', label: 'YouBot', owner: 'You.com', kind: 'search', re: /\bYouBot\b/i },
  { id: 'diffbot', label: 'Diffbot', owner: 'Diffbot', kind: 'training', re: /\bDiffbot\b/i },
];

export interface LogHit {
  bot: string;
  path: string;
  status: number;
  ts: number | null; // epoch ms
  ip: string;
  bytes: number;
}

export interface ParseResult {
  format: 'combined' | 'jsonl' | 'csv' | 'unknown';
  lines: number;
  parsed: number;
  hits: LogHit[];
  humanish: number; // parsed lines not matching any bot
}

const COMBINED_RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(?:[A-Z]+) ([^" ]+)(?: HTTP\/[\d.]+)?" (\d{3}) (\S+)(?: "([^"]*)" "((?:[^"\\]|\\.)*)")?/;
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function parseClfDate(s: string): number | null {
  // 10/Nov/2026:13:55:36 +0000
  const m = s.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?: ([+-])(\d{2})(\d{2}))?/);
  if (!m) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  let t = Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]);
  if (m[7]) {
    const off = (+m[8] * 60 + +m[9]) * 60000;
    t += m[7] === '+' ? -off : off;
  }
  return t;
}

export function matchBot(ua: string): BotDef | null {
  if (!ua) return null;
  for (const b of LOG_BOTS) if (b.re.test(ua)) return b;
  return null;
}

function pathOnly(u: string): string {
  if (!u) return '/';
  if (/^https?:\/\//i.test(u)) {
    try {
      const x = new URL(u);
      return x.pathname + x.search;
    } catch {
      return u;
    }
  }
  return u;
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    const lk = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    if (lk && o[lk] !== undefined && o[lk] !== null && o[lk] !== '') return o[lk];
  }
  return undefined;
}

function toTs(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v > 1e15 ? Math.round(v / 1e6) : v > 1e12 ? v : v * 1000;
  const s = String(v);
  if (/^\d+$/.test(s)) return toTs(Number(s));
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : parseClfDate(s);
}

const UA_KEYS = ['ClientRequestUserAgent', 'user_agent', 'userAgent', 'ua', 'http_user_agent', 'useragent', 'request_user_agent', 'cs(User-Agent)'];
const PATH_KEYS = ['ClientRequestURI', 'ClientRequestPath', 'path', 'uri', 'request_uri', 'url', 'request', 'cs-uri-stem'];
const STATUS_KEYS = ['EdgeResponseStatus', 'OriginResponseStatus', 'status', 'status_code', 'response_status', 'sc-status', 'http_status'];
const TS_KEYS = ['EdgeStartTimestamp', 'timestamp', 'time', '@timestamp', 'ts', 'date', 'time_local'];
const IP_KEYS = ['ClientIP', 'client_ip', 'ip', 'remote_addr', 'c-ip', 'remoteAddr'];
const BYTES_KEYS = ['EdgeResponseBytes', 'bytes', 'body_bytes_sent', 'sc-bytes', 'size'];

function fromObject(o: Record<string, unknown>): LogHit | 'human' | null {
  const ua = String(pick(o, UA_KEYS) ?? '');
  if (!ua) return null;
  const bot = matchBot(ua);
  if (!bot) return 'human';
  let path = String(pick(o, PATH_KEYS) ?? '/');
  const reqm = path.match(/^[A-Z]+ (\S+)/);
  if (reqm) path = reqm[1];
  return { bot: bot.id, path: pathOnly(path), status: Number(pick(o, STATUS_KEYS) ?? 0) || 0, ts: toTs(pick(o, TS_KEYS)), ip: String(pick(o, IP_KEYS) ?? ''), bytes: Number(pick(o, BYTES_KEYS) ?? 0) || 0 };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseLog(text: string, maxLines = 500_000): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, maxLines);
  const res: ParseResult = { format: 'unknown', lines: lines.length, parsed: 0, hits: [], humanish: 0 };
  if (!lines.length) return res;
  const first = lines[0].trim();
  if (first.startsWith('{')) {
    res.format = 'jsonl';
    for (const l of lines) {
      let o: unknown;
      try {
        o = JSON.parse(l);
      } catch {
        continue;
      }
      if (!o || typeof o !== 'object') continue;
      const r = fromObject(o as Record<string, unknown>);
      if (r === null) continue;
      res.parsed++;
      if (r === 'human') res.humanish++;
      else res.hits.push(r);
    }
    return res;
  }
  if (COMBINED_RE.test(first)) {
    res.format = 'combined';
    for (const l of lines) {
      const m = l.match(COMBINED_RE);
      if (!m) continue;
      res.parsed++;
      const ua = m[7] || '';
      const bot = matchBot(ua);
      if (!bot) {
        res.humanish++;
        continue;
      }
      res.hits.push({ bot: bot.id, path: pathOnly(m[3]), status: +m[4], ts: parseClfDate(m[2]), ip: m[1], bytes: m[5] === '-' ? 0 : +m[5] || 0 });
    }
    return res;
  }
  // CSV/TSV with a header row naming a user agent column.
  const header = splitCsvLine(first).map((h) => h.trim().replace(/^"|"$/g, ''));
  const uaIdx = header.findIndex((h) => UA_KEYS.some((k) => k.toLowerCase() === h.toLowerCase()) || /user.?agent/i.test(h));
  if (uaIdx >= 0) {
    res.format = 'csv';
    for (const l of lines.slice(1)) {
      const cells = splitCsvLine(l);
      const o: Record<string, unknown> = {};
      header.forEach((h, i) => (o[h] = cells[i]));
      if (!o[header[uaIdx]]) continue;
      o['user_agent'] = o[header[uaIdx]];
      const r = fromObject(o);
      if (r === null) continue;
      res.parsed++;
      if (r === 'human') res.humanish++;
      else res.hits.push(r);
    }
  }
  return res;
}

export interface BotSummary {
  id: string;
  label: string;
  owner: string;
  kind: BotDef['kind'];
  hits: number;
  share: number; // of bot hits
  ok: number;
  blocked: number; // 401, 403, 429, 503
  notFound: number;
  redirected: number;
  bytes: number;
  first: number | null;
  last: number | null;
  ips: number;
  topPaths: Array<{ path: string; hits: number }>;
  verify?: string;
}

export interface Analysis {
  parse: Omit<ParseResult, 'hits'>;
  botHits: number;
  span: { from: number | null; to: number | null; days: number };
  bots: BotSummary[];
  kinds: Record<BotDef['kind'], number>;
  topPaths: Array<{ path: string; hits: number; bots: string[] }>;
  daily: Array<{ day: string; total: number; byKind: Record<BotDef['kind'], number> }>;
  notes: string[];
}

export function analyse(p: ParseResult): Analysis {
  const byBot = new Map<string, LogHit[]>();
  for (const h of p.hits) {
    const arr = byBot.get(h.bot) || [];
    arr.push(h);
    byBot.set(h.bot, arr);
  }
  const total = p.hits.length;
  const bots: BotSummary[] = [];
  const kinds: Record<BotDef['kind'], number> = { search: 0, assistant: 0, training: 0, other: 0 };
  for (const def of LOG_BOTS) {
    const hs = byBot.get(def.id);
    if (!hs || !hs.length) continue;
    const paths = new Map<string, number>();
    const ips = new Set<string>();
    let ok = 0, blocked = 0, notFound = 0, redirected = 0, bytes = 0, first: number | null = null, last: number | null = null;
    for (const h of hs) {
      const key = h.path.split('?')[0] || '/';
      paths.set(key, (paths.get(key) || 0) + 1);
      if (h.ip) ips.add(h.ip);
      if (h.status >= 200 && h.status < 300) ok++;
      else if ([401, 403, 429, 503].includes(h.status)) blocked++;
      else if (h.status === 404 || h.status === 410) notFound++;
      else if (h.status >= 300 && h.status < 400) redirected++;
      bytes += h.bytes;
      if (h.ts !== null) {
        if (first === null || h.ts < first) first = h.ts;
        if (last === null || h.ts > last) last = h.ts;
      }
    }
    kinds[def.kind] += hs.length;
    bots.push({ id: def.id, label: def.label, owner: def.owner, kind: def.kind, hits: hs.length, share: total ? hs.length / total : 0, ok, blocked, notFound, redirected, bytes, first, last, ips: ips.size, topPaths: Array.from(paths.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, hits]) => ({ path, hits })), verify: def.verify });
  }
  bots.sort((a, b) => b.hits - a.hits);

  const pathAgg = new Map<string, { hits: number; bots: Set<string> }>();
  for (const h of p.hits) {
    const key = h.path.split('?')[0] || '/';
    const e = pathAgg.get(key) || { hits: 0, bots: new Set<string>() };
    e.hits++;
    e.bots.add(h.bot);
    pathAgg.set(key, e);
  }
  const topPaths = Array.from(pathAgg.entries()).sort((a, b) => b[1].hits - a[1].hits).slice(0, 15).map(([path, e]) => ({ path, hits: e.hits, bots: Array.from(e.bots) }));

  const stamps = p.hits.map((h) => h.ts).filter((t): t is number => t !== null);
  const from = stamps.length ? Math.min(...stamps) : null;
  const to = stamps.length ? Math.max(...stamps) : null;
  const days = from !== null && to !== null ? Math.floor(to / 86400000) - Math.floor(from / 86400000) + 1 : 0;
  const dayMap = new Map<string, { total: number; byKind: Record<BotDef['kind'], number> }>();
  const kindOf = new Map(LOG_BOTS.map((b) => [b.id, b.kind] as const));
  for (const h of p.hits) {
    if (h.ts === null) continue;
    const day = new Date(h.ts).toISOString().slice(0, 10);
    const e = dayMap.get(day) || { total: 0, byKind: { search: 0, assistant: 0, training: 0, other: 0 } };
    e.total++;
    e.byKind[kindOf.get(h.bot) || 'other']++;
    dayMap.set(day, e);
  }
  const daily = Array.from(dayMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, e]) => ({ day, ...e }));

  const notes: string[] = [];
  if (!total) notes.push('No known AI or search crawler appeared in the parsed lines.');
  const training = kinds.training, answering = kinds.search + kinds.assistant;
  if (total && training > answering * 3) notes.push('Training crawlers (GPTBot, ClaudeBot, Bytespider, CCBot) make up most of the AI traffic. Search and assistant bots, the ones that send visitors, are a small share. That usually means content is being read for models but not cited yet.');
  if (total && answering > 0 && training === 0) notes.push('Only search and assistant bots were seen. Training crawlers are either blocked or have not found the site.');
  const blockedBots = bots.filter((b) => b.hits >= 5 && b.blocked / b.hits > 0.5);
  if (blockedBots.length) notes.push('Mostly blocked (401, 403, 429 or 503): ' + blockedBots.map((b) => b.label + ' (' + Math.round((100 * b.blocked) / b.hits) + '%)').join(', ') + '. If that is a WAF rule rather than a choice, these bots will stop coming.');
  const lost = bots.filter((b) => b.hits >= 5 && b.notFound / b.hits > 0.3);
  if (lost.length) notes.push('Many 404s for ' + lost.map((b) => b.label).join(', ') + '. Old URLs are still in their index, so add redirects.');
  const assistants = bots.filter((b) => b.kind === 'assistant');
  if (assistants.length) notes.push(assistants.map((b) => b.label).join(', ') + ' fetch a page when a person asks about it in the assistant. Each of those hits is a real question about your site.');
  const multiIp = bots.filter((b) => b.hits >= 20 && b.ips > 0 && b.ips / b.hits > 0.8);
  if (multiIp.length) notes.push(multiIp.map((b) => b.label).join(', ') + ' arrive from almost as many IPs as hits. Verify against the published IP lists. A user agent string is easy to fake.');
  return { parse: { format: p.format, lines: p.lines, parsed: p.parsed, humanish: p.humanish }, botHits: total, span: { from, to, days }, bots, kinds, topPaths, daily, notes };
}

export function sampleLog(): string {
  const now = Date.now();
  const day = 86400000;
  const fmt = (t: number) => {
    const d = new Date(t);
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${mon}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
  };
  const rows: Array<[string, string, string, number, string]> = [
    ['20.171.207.11', '/products/titanium-kettle-600', 'GPTBot/1.2', 200, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
    ['20.171.207.12', '/collections/kettles', 'GPTBot', 200, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
    ['20.171.207.12', '/blog/how-to-pack-light', 'GPTBot', 200, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'],
    ['104.210.140.2', '/products/titanium-kettle-600', 'OAI-SearchBot', 200, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot'],
    ['104.210.140.3', '/pages/shipping', 'ChatGPT-User', 200, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'],
    ['160.79.104.21', '/products/titanium-kettle-900', 'ClaudeBot', 403, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['160.79.104.21', '/', 'ClaudeBot', 403, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['3.224.220.101', '/products/titanium-kettle-600', 'PerplexityBot', 200, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'],
    ['3.224.220.101', '/old-kettle-page', 'PerplexityBot', 404, 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'],
    ['66.249.66.1', '/', 'Googlebot', 200, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['66.249.66.1', '/products/titanium-kettle-600', 'Googlebot', 200, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['40.77.167.5', '/collections/all', 'bingbot', 200, 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['110.249.201.9', '/products/titanium-kettle-600', 'Bytespider', 200, 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)'],
    ['110.249.201.9', '/products/titanium-kettle-900', 'Bytespider', 200, 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)'],
    ['52.70.240.171', '/products/titanium-kettle-600', 'Amazonbot', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)'],
    ['89.1.2.3', '/products/titanium-kettle-600', 'human', 200, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'],
    ['89.1.2.4', '/cart', 'human', 200, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'],
  ];
  const out: string[] = [];
  for (let d = 6; d >= 0; d--) {
    rows.forEach((r, i) => {
      if ((i + d) % 3 === 0 && r[2] !== 'Googlebot') return;
      out.push(`${r[0]} - - [${fmt(now - d * day - i * 3600000)}] "GET ${r[1]} HTTP/1.1" ${r[3]} ${1200 + i * 37} "-" "${r[4]}"`);
    });
  }
  return out.join('\n');
}
