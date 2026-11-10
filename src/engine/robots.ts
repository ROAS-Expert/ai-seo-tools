import type { RobotsFacts } from './types';

export const AI_BOTS: Array<{ ua: string; owner: string; purpose: string }> = [
  { ua: 'GPTBot', owner: 'OpenAI', purpose: 'training and ChatGPT browsing' },
  { ua: 'OAI-SearchBot', owner: 'OpenAI', purpose: 'ChatGPT search results' },
  { ua: 'ChatGPT-User', owner: 'OpenAI', purpose: 'on-demand fetches when a user asks' },
  { ua: 'ClaudeBot', owner: 'Anthropic', purpose: 'Claude crawling' },
  { ua: 'Claude-SearchBot', owner: 'Anthropic', purpose: 'Claude search results' },
  { ua: 'PerplexityBot', owner: 'Perplexity', purpose: 'Perplexity answers' },
  { ua: 'Google-Extended', owner: 'Google', purpose: 'Gemini training (does not affect Search or AI Overviews)' },
  { ua: 'Bingbot', owner: 'Microsoft', purpose: 'Bing and Copilot' },
  { ua: 'Applebot-Extended', owner: 'Apple', purpose: 'Apple Intelligence' },
  { ua: 'Amazonbot', owner: 'Amazon', purpose: 'Alexa and Rufus' },
  { ua: 'meta-externalagent', owner: 'Meta', purpose: 'Meta AI' },
];

export function parseRobots(text: string, status: number): RobotsFacts {
  const facts: RobotsFacts = { status, present: status === 200 && text.trim().length > 0, text: text.slice(0, 20000), sitemaps: [], groups: [] };
  if (!facts.present) return facts;
  let current: RobotsFacts['groups'][number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        facts.groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      if (value) facts.sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === 'disallow') current.disallow.push(value);
    else if (key === 'allow') current.allow.push(value);
  }
  return facts;
}

function matchGroup(facts: RobotsFacts, ua: string) {
  const u = ua.toLowerCase();
  // Longest matching agent token wins, per RFC 9309; '*' is the fallback.
  let best: { group: RobotsFacts['groups'][number]; len: number } | null = null;
  for (const g of facts.groups) {
    for (const a of g.agents) {
      if (a === '*') {
        if (!best) best = { group: g, len: 0 };
        continue;
      }
      if (u === a || u.startsWith(a) || a.startsWith(u)) {
        if (!best || a.length > best.len) best = { group: g, len: a.length };
      }
    }
  }
  return best?.group ?? null;
}

function pathMatches(rule: string, path: string): boolean {
  if (rule === '') return false;
  const re = new RegExp('^' + rule.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

/** Is `path` allowed for `ua` under this robots.txt? Longest rule wins, allow beats disallow on ties. */
export function isAllowed(facts: RobotsFacts, ua: string, path = '/'): boolean {
  if (!facts.present) return true;
  const g = matchGroup(facts, ua);
  if (!g) return true;
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const r of g.allow) if (pathMatches(r, path)) bestAllow = Math.max(bestAllow, r.length);
  for (const r of g.disallow) if (pathMatches(r, path)) bestDisallow = Math.max(bestDisallow, r.length);
  if (bestDisallow < 0) return true;
  return bestAllow >= bestDisallow;
}

export function blocksEverything(facts: RobotsFacts, ua = 'Googlebot'): boolean {
  return !isAllowed(facts, ua, '/') && !isAllowed(facts, ua, '/index.html');
}

export function aiBotAccess(facts: RobotsFacts): Record<string, 'allowed' | 'blocked' | 'partial'> {
  const out: Record<string, 'allowed' | 'blocked' | 'partial'> = {};
  for (const b of AI_BOTS) {
    const root = isAllowed(facts, b.ua, '/');
    const deep = isAllowed(facts, b.ua, '/products/example-item') && isAllowed(facts, b.ua, '/blog/example-post');
    out[b.ua] = root && deep ? 'allowed' : !root ? 'blocked' : 'partial';
  }
  return out;
}
