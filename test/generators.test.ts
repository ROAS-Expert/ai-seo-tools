import { describe, it, expect } from 'vitest';
import {
  AI_BOTS, PRESETS, applyPreset,
  buildLlmsTxt, groupUrlsByPrefix, sectionForPrefix,
  parseRobots, isAllowed, botState, botStates, decisionsFromRobots,
  buildRobotsAi, robotsWarnings,
} from '../src/generators';
import { AI_BOTS as ENGINE_BOTS } from '../src/engine/robots';

const SHOPIFY_ROBOTS = `# we use Shopify as our ecommerce platform
User-agent: *
Disallow: /a/downloads/-/*
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account
Disallow: /collections/*sort_by*
Allow: /collections/*sort_by*=best-selling
Sitemap: https://example.com/sitemap.xml

User-agent: adsbot-google
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account

User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: Nutch
Disallow: /
`;

describe('AI_BOTS and presets', () => {
  it('has the 11 bots the audit reports on, in the engine order', () => {
    expect(AI_BOTS).toHaveLength(11);
    expect(new Set(AI_BOTS.map(b => b.token)).size).toBe(11);
    expect(AI_BOTS.map(b => b.token)).toEqual(ENGINE_BOTS.map(b => b.ua));
    expect(AI_BOTS.every(b => b.note.length > 20 && b.operator)).toBe(true);
  });
  it('search preset allows the six assistants and blocks the five training crawlers', () => {
    const d = applyPreset('search');
    expect(Object.keys(d)).toHaveLength(11);
    expect(AI_BOTS.filter(b => d[b.token] === 'allow').map(b => b.token).sort())
      .toEqual(['Bingbot', 'ChatGPT-User', 'Claude-SearchBot', 'ClaudeBot', 'OAI-SearchBot', 'PerplexityBot']);
    expect(AI_BOTS.filter(b => d[b.token] === 'block').map(b => b.token).sort())
      .toEqual(['Amazonbot', 'Applebot-Extended', 'GPTBot', 'Google-Extended', 'meta-externalagent']);
  });
  it('applyPreset returns a copy', () => {
    const d = applyPreset('allow');
    d['GPTBot'] = 'block';
    expect(PRESETS.allow.decisions['GPTBot']).toBe('allow');
  });
});

describe('buildLlmsTxt', () => {
  it('writes the llmstxt.org shape', () => {
    const txt = buildLlmsTxt({
      name: 'Acme Shoes',
      description: 'Handmade running shoes shipped from Lisbon.',
      details: 'Prices are in EUR. Free returns within 30 days.',
      sections: [
        { title: 'Products or services', links: [{ url: 'https://acme.example/products/trail', title: 'Trail runner', note: 'our best seller' }] },
        { title: 'Policies', links: [{ url: 'https://acme.example/policies/returns' }] },
      ],
      optional: [{ url: 'https://acme.example/blog', title: 'Blog' }],
    });
    expect(txt).toBe(
      '# Acme Shoes\n\n> Handmade running shoes shipped from Lisbon.\n\nPrices are in EUR. Free returns within 30 days.\n\n' +
      '## Products or services\n\n- [Trail runner](https://acme.example/products/trail): our best seller\n\n' +
      '## Policies\n\n- [returns](https://acme.example/policies/returns)\n\n' +
      '## Optional\n\n- [Blog](https://acme.example/blog)\n');
  });
  it('drops empty rows and empty sections and collapses newlines in one-line fields', () => {
    const txt = buildLlmsTxt({
      name: '  Acme \n Shoes ',
      description: 'line one\nline two',
      sections: [
        { title: 'Docs', links: [{ url: '' }, { url: '   ' }] },
        { title: 'Blog', links: [{ url: 'https://acme.example/blog/a', title: 'A [draft]' }] },
      ],
    });
    expect(txt).toBe('# Acme Shoes\n\n> line one line two\n\n## Blog\n\n- [A draft](https://acme.example/blog/a)\n');
  });
  it('falls back to a name and a title', () => {
    expect(buildLlmsTxt({ name: '' })).toBe('# Untitled site\n');
    expect(buildLlmsTxt({ name: 'X', sections: [{ title: '', links: [{ url: 'https://x.example/' }] }] }))
      .toBe('# X\n\n## Links\n\n- [x.example](https://x.example/)\n');
  });
});

describe('groupUrlsByPrefix and sectionForPrefix', () => {
  it('groups by first path segment, biggest first, homepage under Home', () => {
    const g = groupUrlsByPrefix([
      'https://s.example/', 'https://s.example/products/a', 'https://s.example/products/b',
      'https://s.example/blog/x', 'https://s.example/about', 'not a url', 'https://s.example/products/a',
    ]);
    expect(g.map(x => x.prefix)).toEqual(['/products/', '/', '/blog/', 'Home']);
    expect(g[0].urls).toEqual(['https://s.example/products/a', 'https://s.example/products/b']);
  });
  it('caps groups and urls per group', () => {
    const urls = Array.from({ length: 40 }, (_, i) => `https://s.example/p${i % 10}/${i}`);
    const g = groupUrlsByPrefix(urls, 3, 2);
    expect(g).toHaveLength(3);
    expect(g.every(x => x.urls.length <= 2)).toBe(true);
  });
  it('maps common prefixes to the form sections', () => {
    expect(sectionForPrefix('/docs/')).toBe('Docs');
    expect(sectionForPrefix('/collections/')).toBe('Products or services');
    expect(sectionForPrefix('/insights/')).toBe('Blog');
    expect(sectionForPrefix('/policies/')).toBe('Policies');
    expect(sectionForPrefix('/contact/')).toBe('Contact');
    expect(sectionForPrefix('/p/')).toBeNull();
  });
});

describe('parseRobots', () => {
  it('reads groups, shared user-agent lines, sitemaps and the preamble', () => {
    const p = parseRobots(SHOPIFY_ROBOTS);
    expect(p.preamble).toEqual(['# we use Shopify as our ecommerce platform']);
    expect(p.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(p.groups).toHaveLength(4);
    expect(p.groups[2].agents).toEqual(['GPTBot', 'CCBot']);
    expect(p.groups[2].rules).toEqual([{ type: 'disallow', path: '/' }]);
    expect(p.groups[0].rules.filter(r => r.type === 'allow')).toHaveLength(1);
  });
  it('handles CRLF, a BOM, inline comments and an empty file', () => {
    const p = parseRobots('﻿User-agent: *\r\nDisallow: /private # keep out\r\nCrawl-delay: 5\r\n');
    expect(p.groups[0].rules).toEqual([{ type: 'disallow', path: '/private' }]);
    expect(p.groups[0].extra).toEqual(['Crawl-delay: 5']);
    expect(parseRobots('').groups).toEqual([]);
  });
});

describe('isAllowed and botState', () => {
  const p = parseRobots(SHOPIFY_ROBOTS);
  it('uses the specific group when there is one, else the * group', () => {
    expect(isAllowed(p, 'GPTBot', '/')).toBe(false);
    expect(isAllowed(p, 'gptbot/1.2', '/')).toBe(false);
    expect(isAllowed(p, 'ClaudeBot', '/')).toBe(true);
    expect(isAllowed(p, 'ClaudeBot', '/cart')).toBe(false);
    expect(isAllowed(p, 'ClaudeBot', '/products/x')).toBe(true);
  });
  it('longest match wins, allow wins ties, $ anchors', () => {
    expect(isAllowed(p, 'Bingbot', '/collections/all?sort_by=price')).toBe(false);
    expect(isAllowed(p, 'Bingbot', '/collections/all?sort_by=best-selling')).toBe(true);
    const q = parseRobots('User-agent: *\nDisallow: /*.pdf$\n');
    expect(isAllowed(q, 'GPTBot', '/a.pdf')).toBe(false);
    expect(isAllowed(q, 'GPTBot', '/a.pdfx')).toBe(true);
  });
  it('states: blocked, partial, allowed', () => {
    expect(botState(p, 'GPTBot')).toBe('blocked');
    expect(botState(p, 'ClaudeBot')).toBe('partial');
    expect(botState(parseRobots(''), 'ClaudeBot')).toBe('allowed');
    expect(botState(parseRobots('User-agent: *\nDisallow:\n'), 'PerplexityBot')).toBe('allowed');
    expect(botState(parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: Bingbot\nAllow: /\n'), 'Bingbot')).toBe('allowed');
    expect(botState(parseRobots('User-agent: *\nDisallow: /\n'), 'Bingbot')).toBe('blocked');
  });
  it('botStates and decisionsFromRobots cover all 11 bots', () => {
    const s = botStates(SHOPIFY_ROBOTS);
    expect(Object.keys(s)).toHaveLength(11);
    expect(s['GPTBot']).toBe('blocked');
    const d = decisionsFromRobots(SHOPIFY_ROBOTS);
    expect(d['GPTBot']).toBe('block');
    expect(d['Bingbot']).toBe('allow');
  });
});

describe('buildRobotsAi', () => {
  it('keeps the existing rules, moves the AI bots into one block, keeps the sitemap', () => {
    const out = buildRobotsAi({ existing: SHOPIFY_ROBOTS, decisions: applyPreset('search') });
    expect(out.startsWith('# we use Shopify as our ecommerce platform\n\nUser-agent: *\nDisallow: /a/downloads/-/*\n')).toBe(true);
    expect(out).toContain('User-agent: adsbot-google\nDisallow: /checkouts/');
    // the old GPTBot/CCBot group loses GPTBot but keeps CCBot
    expect(out).toContain('User-agent: CCBot\nDisallow: /\n');
    expect(out).not.toMatch(/User-agent: GPTBot\nUser-agent: CCBot/);
    expect(out).toContain('User-agent: Nutch\nDisallow: /');
    expect(out).toContain('# AI crawlers: generated with tools.roasexpert.com/robots-ai\n');
    // allowed bots inherit the * group's path rules instead of a bare Allow: /
    expect(out).toContain('User-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nUser-agent: ClaudeBot\nUser-agent: Claude-SearchBot\nUser-agent: PerplexityBot\nUser-agent: Bingbot\nDisallow: /a/downloads/-/*\nDisallow: /admin\nDisallow: /cart\n');
    expect(out).toContain('Allow: /collections/*sort_by*=best-selling\n\nUser-agent: GPTBot');
    expect(isAllowed(parseRobots(out), 'Bingbot', '/cart')).toBe(false);
    expect(isAllowed(parseRobots(out), 'Bingbot', '/products/x')).toBe(true);
    expect(out).toContain('User-agent: GPTBot\nUser-agent: Google-Extended\nUser-agent: Applebot-Extended\nUser-agent: Amazonbot\nUser-agent: meta-externalagent\nDisallow: /\n');
    expect(out.trimEnd().endsWith('Sitemap: https://example.com/sitemap.xml')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out).not.toMatch(/\n{3}/);
  });
  it('is idempotent and the output parses back to the decisions', () => {
    const d = applyPreset('search');
    const once = buildRobotsAi({ existing: SHOPIFY_ROBOTS, decisions: d });
    const twice = buildRobotsAi({ existing: once, decisions: d });
    expect(twice).toBe(once);
    const states = botStates(once);
    for (const b of AI_BOTS) expect(states[b.token]).toBe(d[b.token] === 'allow' ? 'partial' : 'blocked');
    const fresh = buildRobotsAi({ existing: '', decisions: d });
    const freshStates = botStates(fresh);
    for (const b of AI_BOTS) expect(freshStates[b.token]).toBe(d[b.token] === 'allow' ? 'allowed' : 'blocked');
  });
  it('an allowed bot with its own non-blocking group keeps that group', () => {
    const existing = 'User-agent: *\nDisallow: /cart\n\nUser-agent: PerplexityBot\nDisallow: /private\n';
    const out = buildRobotsAi({ existing, decisions: { PerplexityBot: 'allow', GPTBot: 'block' } });
    expect(out).toContain('User-agent: PerplexityBot\nDisallow: /private\n');
    expect(out.split('User-agent: PerplexityBot').length).toBe(2);
    expect(isAllowed(parseRobots(out), 'PerplexityBot', '/private')).toBe(false);
    expect(isAllowed(parseRobots(out), 'PerplexityBot', '/cart')).toBe(true);
    // and the same bot set to block leaves its old group
    const out2 = buildRobotsAi({ existing, decisions: { PerplexityBot: 'block' } });
    expect(out2).not.toContain('Disallow: /private');
    expect(botStates(out2)['PerplexityBot']).toBe('blocked');
  });
  it('a fresh file with no existing rules gets the block and the sitemap hint', () => {
    const out = buildRobotsAi({ existing: '', decisions: applyPreset('block'), sitemap: 'https://x.example/sitemap.xml' });
    expect(out).toBe(
      '# AI crawlers: generated with tools.roasexpert.com/robots-ai\n' +
      AI_BOTS.map(b => `User-agent: ${b.token}`).join('\n') + '\nDisallow: /\n\n# end AI crawlers\n\nSitemap: https://x.example/sitemap.xml\n');
  });
  it('flipping one toggle changes only that bot', () => {
    const d = applyPreset('search');
    d['Bingbot'] = 'block';
    const out = buildRobotsAi({ existing: SHOPIFY_ROBOTS, decisions: d });
    expect(botStates(out)['Bingbot']).toBe('blocked');
    expect(botStates(out)['PerplexityBot']).toBe('partial'); // inherits Shopify's /cart style rules
  });
  it('a star group that blocks everything still blocks the allowed bots\' other paths only through their own group', () => {
    const out = buildRobotsAi({ existing: 'User-agent: *\nDisallow: /\n', decisions: { Bingbot: 'allow', GPTBot: 'block' } });
    const states = botStates(out);
    expect(states['Bingbot']).toBe('allowed');
    expect(states['GPTBot']).toBe('blocked');
    expect(states['PerplexityBot']).toBe('blocked'); // undecided bots fall back to *
  });
});

describe('robotsWarnings', () => {
  it('warns about Bingbot, blocked search bots and ChatGPT-User', () => {
    expect(robotsWarnings(applyPreset('search'))).toEqual([]);
    const w = robotsWarnings(applyPreset('block'));
    expect(w).toHaveLength(3);
    expect(w[0]).toMatch(/Copilot/);
    expect(w[1]).toMatch(/OAI-SearchBot, Claude-SearchBot, PerplexityBot, Bingbot/);
  });
});
