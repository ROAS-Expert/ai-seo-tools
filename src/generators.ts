// Pure text builders for the two client-side tools:
//   /llms-txt   -> buildLlmsTxt()
//   /robots-ai  -> parseRobots(), botState(), buildRobotsAi(), applyPreset()
// No DOM, no fetch: the same file is bundled for the browser
// (static/js/generators.js, see scripts/build-generators.mjs) and imported by
// functions/api/prefill.ts and the tests. The 11 bot tokens come from the
// audit engine (src/engine/robots.ts) so there is one list.

import { AI_BOTS as ENGINE_BOTS } from './engine/robots';

export type BotRole = 'search' | 'user' | 'training';

export interface AiBot {
  token: string;
  operator: string;
  role: BotRole;
  /** One plain sentence shown next to the toggle. */
  note: string;
}

const BOT_META: Record<string, { role: BotRole; note: string }> = {
  'OAI-SearchBot': { role: 'search', note: 'Builds the index ChatGPT search answers from. Block it and you leave ChatGPT search results.' },
  'ChatGPT-User': { role: 'user', note: 'Fetches a page when a ChatGPT user asks about it. May not follow robots.txt.' },
  'GPTBot': { role: 'training', note: 'Collects pages to train future OpenAI models. No effect on ChatGPT search.' },
  'ClaudeBot': { role: 'training', note: "Anthropic's crawler. Blocking it keeps future content out of training." },
  'Claude-SearchBot': { role: 'search', note: 'Indexes pages so Claude can cite them in search answers.' },
  'PerplexityBot': { role: 'search', note: 'Builds the Perplexity index. Not used for training.' },
  'Google-Extended': { role: 'training', note: 'Controls Gemini training and grounding. No effect on Google Search ranking.' },
  'Bingbot': { role: 'search', note: 'Bing and Copilot. Blocking it removes you from Bing results and Copilot answers.' },
  'Applebot-Extended': { role: 'training', note: 'Training control only. Pages stay in Siri and Spotlight results.' },
  'Amazonbot': { role: 'training', note: 'General crawler that may be used for training. Caches robots.txt for up to 30 days.' },
  'meta-externalagent': { role: 'training', note: 'Collects pages to train Meta models.' },
};

/** The 11 AI bots the audit reports on, in the order the audit shows them. */
export const AI_BOTS: readonly AiBot[] = ENGINE_BOTS.map((b) => ({
  token: b.ua,
  operator: b.owner,
  role: BOT_META[b.ua]?.role ?? 'training',
  note: BOT_META[b.ua]?.note ?? b.purpose,
}));

export type Decision = 'allow' | 'block';
export type Decisions = Record<string, Decision>;

/**
 * Presets. "search" matches the spec's "Allow search assistants, block
 * training crawlers" list exactly (ClaudeBot is on the allow side there).
 */
export const PRESETS: Record<string, { label: string; decisions: Decisions }> = {
  search: {
    label: 'Allow search assistants, block training crawlers',
    decisions: {
      'OAI-SearchBot': 'allow', 'ChatGPT-User': 'allow', 'PerplexityBot': 'allow',
      'ClaudeBot': 'allow', 'Claude-SearchBot': 'allow', 'Bingbot': 'allow',
      'GPTBot': 'block', 'Google-Extended': 'block', 'Applebot-Extended': 'block',
      'Amazonbot': 'block', 'meta-externalagent': 'block',
    },
  },
  allow: {
    label: 'Allow every AI bot',
    decisions: Object.fromEntries(AI_BOTS.map(b => [b.token, 'allow'])) as Decisions,
  },
  block: {
    label: 'Block every AI bot',
    decisions: Object.fromEntries(AI_BOTS.map(b => [b.token, 'block'])) as Decisions,
  },
};

export function applyPreset(name: keyof typeof PRESETS): Decisions {
  const p = PRESETS[name];
  return { ...p.decisions };
}

/* ------------------------------------------------------------------ */
/* llms.txt                                                            */
/* ------------------------------------------------------------------ */

export interface LlmsLink {
  url: string;
  title?: string;
  note?: string;
}

export interface LlmsSection {
  title: string;
  links: LlmsLink[];
}

export interface LlmsInput {
  name: string;
  description?: string;
  /** Optional paragraph(s) shown under the description, before the sections. */
  details?: string;
  sections?: LlmsSection[];
  /** Optional links that go under "## Optional" (the spec's low-priority list). */
  optional?: LlmsLink[];
}

const trim = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (!last) return u.hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/\.[a-z0-9]{1,5}$/i, '').trim() || u.hostname;
  } catch {
    return url;
  }
}

function linkLine(l: LlmsLink): string | null {
  const url = trim(l.url);
  if (!url) return null;
  const title = oneLine(trim(l.title) || titleFromUrl(url)).replace(/[\[\]]/g, '');
  const note = oneLine(trim(l.note));
  return `- [${title}](${url})${note ? `: ${note}` : ''}`;
}

/**
 * Builds an llms.txt file in the llmstxt.org shape: an H1, a blockquote
 * summary, free text, then H2 sections of markdown links. Empty rows and
 * empty sections are dropped. Always ends with one newline.
 */
export function buildLlmsTxt(input: LlmsInput): string {
  const out: string[] = [];
  const name = oneLine(trim(input.name)) || 'Untitled site';
  out.push(`# ${name}`);
  const desc = oneLine(trim(input.description));
  if (desc) out.push('', `> ${desc}`);
  const details = trim(input.details);
  if (details) out.push('', details.replace(/\r\n/g, '\n'));
  for (const s of input.sections ?? []) {
    const lines = (s.links ?? []).map(linkLine).filter((x): x is string => !!x);
    if (!lines.length) continue;
    out.push('', `## ${oneLine(trim(s.title)) || 'Links'}`, '', ...lines);
  }
  const opt = (input.optional ?? []).map(linkLine).filter((x): x is string => !!x);
  if (opt.length) out.push('', '## Optional', '', ...opt);
  return out.join('\n') + '\n';
}

/** Default section names for the form, in the order the page shows them. */
export const LLMS_SECTIONS = ['Docs', 'Products or services', 'Blog', 'Policies', 'Contact'] as const;

/**
 * Groups sitemap URLs by their first path segment so the prefill can offer
 * them as sections. Returns at most `maxGroups` groups of at most `maxPerGroup`
 * URLs each, biggest groups first; the homepage goes under "Home".
 */
export function groupUrlsByPrefix(urls: string[], maxGroups = 8, maxPerGroup = 12): { prefix: string; urls: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const raw of urls) {
    let u: URL;
    try { u = new URL(raw); } catch { continue; }
    const segs = u.pathname.split('/').filter(Boolean);
    const prefix = segs.length <= 1 ? (segs.length === 0 ? 'Home' : '/') : `/${segs[0]}/`;
    const list = groups.get(prefix) ?? [];
    if (list.length < maxPerGroup && !list.includes(u.href)) list.push(u.href);
    groups.set(prefix, list);
  }
  return [...groups.entries()]
    .map(([prefix, urls]) => ({ prefix, urls }))
    .sort((a, b) => b.urls.length - a.urls.length || a.prefix.localeCompare(b.prefix))
    .slice(0, maxGroups);
}

/** Maps a path prefix to one of the form's section names, or null. */
export function sectionForPrefix(prefix: string): (typeof LLMS_SECTIONS)[number] | null {
  const p = prefix.toLowerCase();
  if (/\/(docs?|documentation|help|support|guides?|kb|knowledge)/.test(p)) return 'Docs';
  if (/\/(products?|collections?|shop|store|services?|pricing|plans|solutions|catalog)/.test(p)) return 'Products or services';
  if (/\/(blog|news|insights|articles?|resources|posts?|journal)/.test(p)) return 'Blog';
  if (/\/(privacy|terms|policies|policy|legal|returns?|shipping|refund)/.test(p)) return 'Policies';
  if (/\/(contact|about|company|team)/.test(p)) return 'Contact';
  return null;
}

/* ------------------------------------------------------------------ */
/* robots.txt                                                          */
/* ------------------------------------------------------------------ */

export interface RobotsRule {
  type: 'allow' | 'disallow';
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  /** Lines inside the group that are not allow/disallow (crawl-delay, comments). */
  extra: string[];
}

export interface ParsedRobots {
  /** Lines before the first group and group-independent lines (Sitemap:, comments). */
  preamble: string[];
  groups: RobotsGroup[];
  sitemaps: string[];
}

const MARKER_START = '# AI crawlers: generated with tools.roasexpert.com/robots-ai';
const MARKER_END = '# end AI crawlers';

/**
 * A small robots.txt parser. Groups start at a User-agent line (consecutive
 * User-agent lines share one group). Sitemap lines are collected separately.
 * Blank lines and comments between groups go to the preamble when they come
 * before the first group, otherwise they are dropped (they carry no rules).
 */
export function parseRobots(text: string): ParsedRobots {
  const res: ParsedRobots = { preamble: [], groups: [], sitemaps: [] };
  let cur: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of (text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/^﻿/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) {
      if (!cur) { res.preamble.push(line); continue; }
      if (line === '') { lastWasAgent = false; continue; }
      if (line.startsWith('#')) { cur.extra.push(line); lastWasAgent = false; continue; }
      cur.extra.push(line);
      lastWasAgent = false;
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].replace(/\s+#.*$/, '').trim();
    if (key === 'sitemap') { res.sitemaps.push(value); lastWasAgent = false; continue; }
    if (key === 'user-agent') {
      if (cur && lastWasAgent) cur.agents.push(value);
      else { cur = { agents: [value], rules: [], extra: [] }; res.groups.push(cur); }
      lastWasAgent = true;
      continue;
    }
    if (!cur) { res.preamble.push(line); continue; }
    lastWasAgent = false;
    if (key === 'allow' || key === 'disallow') cur.rules.push({ type: key, path: value });
    else cur.extra.push(line);
  }
  // drop trailing blank preamble lines
  while (res.preamble.length && res.preamble[res.preamble.length - 1] === '') res.preamble.pop();
  return res;
}

/** Case-insensitive token match; a "/1.0" version suffix in the file is ignored. */
function agentMatches(agent: string, token: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\/.*$/, '');
  return norm(agent) === norm(token);
}

/** The groups that apply to a token: exact token groups, else the `*` groups. */
export function groupsFor(parsed: ParsedRobots, token: string): { groups: RobotsGroup[]; specific: boolean } {
  const specific = parsed.groups.filter(g => g.agents.some(a => agentMatches(a, token)));
  if (specific.length) return { groups: specific, specific: true };
  return { groups: parsed.groups.filter(g => g.agents.some(a => a.trim() === '*')), specific: false };
}

export type BotState = 'allowed' | 'blocked' | 'partial';

function matchesPath(rulePath: string, path: string): boolean {
  if (rulePath === '') return false;
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = '^' + body.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : '');
  return new RegExp(re).test(path);
}

/**
 * Whether a bot may fetch `path` under the parsed robots.txt, using the
 * longest-match rule (Google's and Bing's documented behaviour, allow wins ties).
 */
export function isAllowed(parsed: ParsedRobots, token: string, path = '/'): boolean {
  const { groups } = groupsFor(parsed, token);
  let best: RobotsRule | null = null;
  for (const g of groups) for (const r of g.rules) {
    if (!matchesPath(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
  }
  return !best || best.type === 'allow';
}

/**
 * Summarises a bot's state at the site level: blocked when it cannot fetch
 * the root, partial when the root is open but some disallow line applies to
 * it, allowed otherwise.
 */
export function botState(parsed: ParsedRobots, token: string): BotState {
  if (!isAllowed(parsed, token, '/')) return 'blocked';
  const { groups } = groupsFor(parsed, token);
  const hasDisallow = groups.some(g => g.rules.some(r => r.type === 'disallow' && r.path !== ''));
  return hasDisallow ? 'partial' : 'allowed';
}

export function botStates(text: string): Record<string, BotState> {
  const parsed = parseRobots(text);
  return Object.fromEntries(AI_BOTS.map(b => [b.token, botState(parsed, b.token)]));
}

/** Decisions that reproduce the current file, so the toggles start from reality. */
export function decisionsFromRobots(text: string): Decisions {
  const states = botStates(text);
  return Object.fromEntries(AI_BOTS.map(b => [b.token, states[b.token] === 'blocked' ? 'block' : 'allow'])) as Decisions;
}

export interface RobotsAiInput {
  /** The site's current robots.txt, or empty for a fresh file. */
  existing?: string;
  decisions: Decisions;
  /** Added as a Sitemap: line when the existing file has none. */
  sitemap?: string;
}

function serialiseGroup(g: RobotsGroup): string[] {
  const out = g.agents.map(a => `User-agent: ${a}`);
  for (const r of g.rules) out.push(`${r.type === 'allow' ? 'Allow' : 'Disallow'}: ${r.path}`);
  out.push(...g.extra);
  return out;
}

/** Removes an earlier generated block so the builder is idempotent. */
function stripGeneratedBlock(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const l of lines) {
    if (l.trim() === MARKER_START) { skipping = true; continue; }
    if (skipping) { if (l.trim() === MARKER_END) skipping = false; continue; }
    out.push(l);
  }
  return out.join('\n');
}

function blocksRoot(g: RobotsGroup): boolean {
  let best: RobotsRule | null = null;
  for (const r of g.rules) {
    if (!matchesPath(r.path, '/')) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
  }
  return !!best && best.type === 'disallow';
}

/**
 * Keeps every rule in the existing file that is not about one of the 11 AI
 * bots, then appends one marked block that decides each AI bot:
 * - a blocked bot is removed from every existing group and listed under
 *   `Disallow: /`;
 * - an allowed bot that already has its own group which does not block the
 *   root keeps that group untouched (its path rules still apply);
 * - any other allowed bot is listed in an allow group that copies the `*`
 *   group's path rules, so allowing GPTBot does not also open /cart or
 *   /admin; with no `*` rules, or a `*` group that blocks everything, the
 *   group is `Allow: /`.
 * Running it twice gives the same output.
 */
export function buildRobotsAi(input: RobotsAiInput): string {
  const parsed = parseRobots(stripGeneratedBlock(input.existing ?? ''));
  const out: string[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/\/.*$/, '');

  const blockSet = new Set(Object.keys(input.decisions).filter(t => input.decisions[t] === 'block').map(norm));
  const allowSet = new Set(Object.keys(input.decisions).filter(t => input.decisions[t] === 'allow').map(norm));
  // allowed bots that keep an existing, non-blocking group of their own
  const keptAllowed = new Set<string>();
  for (const g of parsed.groups) {
    if (blocksRoot(g)) continue;
    for (const a of g.agents) if (allowSet.has(norm(a))) keptAllowed.add(norm(a));
  }

  if (parsed.preamble.length) out.push(...parsed.preamble, '');
  for (const g of parsed.groups) {
    const blocksAll = blocksRoot(g);
    const keep = g.agents.filter(a => {
      const n = norm(a);
      if (blockSet.has(n)) return false;
      if (allowSet.has(n)) return !blocksAll;
      return true;
    });
    if (!keep.length) continue;
    out.push(...serialiseGroup({ ...g, agents: keep }), '');
  }

  const allow = AI_BOTS.filter(b => input.decisions[b.token] === 'allow' && !keptAllowed.has(norm(b.token))).map(b => b.token);
  const block = AI_BOTS.filter(b => input.decisions[b.token] === 'block').map(b => b.token);
  const starGroups = parsed.groups.filter(g => g.agents.some(a => a.trim() === '*'));
  const starRules = starGroups.some(blocksRoot) ? [] : starGroups.flatMap(g => g.rules).filter(r => r.path !== '');
  out.push(MARKER_START);
  if (allow.length) {
    out.push(...allow.map(t => `User-agent: ${t}`));
    if (starRules.length) out.push(...starRules.map(r => `${r.type === 'allow' ? 'Allow' : 'Disallow'}: ${r.path}`));
    else out.push('Allow: /');
    out.push('');
  }
  if (block.length) {
    out.push(...block.map(t => `User-agent: ${t}`), 'Disallow: /', '');
  }
  if (!allow.length && !block.length) out.push('# no AI bot decisions yet', '');
  out.push(MARKER_END);

  const sitemaps = parsed.sitemaps.length ? parsed.sitemaps : (input.sitemap ? [input.sitemap] : []);
  if (sitemaps.length) out.push('', ...sitemaps.map(s => `Sitemap: ${s}`));

  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
}

/** Warnings the page shows above the preview. */
export function robotsWarnings(decisions: Decisions): string[] {
  const w: string[] = [];
  if (decisions['Bingbot'] === 'block') w.push('Blocking Bingbot removes your pages from Bing and from Copilot answers. Most sites should leave it allowed.');
  const searchBlocked = AI_BOTS.filter(b => b.role === 'search' && decisions[b.token] === 'block').map(b => b.token);
  if (searchBlocked.length) w.push(`You are blocking ${searchBlocked.join(', ')}. Those bots put you in AI search answers; blocking them means fewer recommendations, not more privacy.`);
  if (decisions['ChatGPT-User'] === 'block') w.push('ChatGPT-User fetches a page because a person asked about it, and OpenAI says it may not follow robots.txt. Blocking it mostly produces broken answers.');
  return w;
}
