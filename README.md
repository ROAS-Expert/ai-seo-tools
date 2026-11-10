# AI SEO tools by ROAS Expert

Open source engine behind the free tools at [tools.roasexpert.com](https://tools.roasexpert.com). It checks whether search engines, AI assistants and AI shopping agents can crawl, read and buy from a website.

Everything runs on Cloudflare Workers or in the browser. No API keys. MIT licensed.

## The tools

| Tool | What it does | Try it | Source |
|---|---|---|---|
| AI SEO audit | Scores a site out of 100 across crawling, on-page basics, structured data, AI search readiness and speed signals. Detects the CMS and gives fixes for it. | [Run it](https://tools.roasexpert.com/) | `src/engine/audit.ts` |
| Product page check | Reads one product page the way an AI shopping assistant does: price, stock, shipping, returns, variants, identity. 19 checks. | [Run it](https://tools.roasexpert.com/product) | `src/engine/product.ts` |
| Agent readiness check | Acts like a shopping agent. Tests whether it can find the store, read a product and reach a checkout. Shopify and WooCommerce get the full set. | [Run it](https://tools.roasexpert.com/agent-check) | `src/engine/agent.ts` |
| Compare with competitors | Runs the audit on two or three sites and shows the checks a competitor passes that you fail. | [Run it](https://tools.roasexpert.com/compare) | `src/engine/audit.ts` |
| AI bot log analyzer | Reads a server access log in the browser and shows which of 22 AI and search crawlers visit, what they read and what gets blocked. | [Run it](https://tools.roasexpert.com/bot-log) | `src/botlog.ts` |
| llms.txt generator | Builds an llms.txt in the llmstxt.org shape from a homepage and sitemap. | [Run it](https://tools.roasexpert.com/llms-txt) | `src/generators.ts` |
| robots.txt builder for AI crawlers | Shows what a robots.txt does to 11 AI bots (GPTBot, ClaudeBot, PerplexityBot and the rest) and writes the file with existing rules kept. | [Run it](https://tools.roasexpert.com/robots-ai) | `src/generators.ts` |
| MER and break-even ROAS calculator | Revenue, spend and costs in. MER, break-even ROAS, the MER needed for a target margin and profit per order out. | [Run it](https://tools.roasexpert.com/mer-calculator) | `src/calc.ts` |
| CAC payback calculator | Payback month with churn and expansion, LTV, LTV to CAC and a payback curve. | [Run it](https://tools.roasexpert.com/cac-payback) | `src/calc.ts` |

## Use it from an AI assistant (MCP)

The hosted tools are available as an MCP server over Streamable HTTP. No install and no key.

```json
{
  "mcpServers": {
    "roas-expert-seo": { "type": "http", "url": "https://tools.roasexpert.com/mcp" }
  }
}
```

Tools exposed: `audit_site`, `audit_product_page`, `check_ai_visibility`, `get_report`, `unlock_report`, `list_checks`, `explain_fix`.

Works with Claude, ChatGPT, Cursor and any other MCP client. Registry name: `com.roasexpert.tools/seo-audit`.

## Use the hosted API

```bash
# Site audit
curl -X POST https://tools.roasexpert.com/api/audit \
  -H 'content-type: application/json' -d '{"url":"example.com"}'

# One product page
curl -X POST https://tools.roasexpert.com/api/product \
  -H 'content-type: application/json' -d '{"url":"https://store.com/products/example"}'

# Can an AI agent buy from this store?
curl -X POST https://tools.roasexpert.com/api/agent-check \
  -H 'content-type: application/json' -d '{"url":"store.com"}'

# Two or three sites side by side
curl -X POST https://tools.roasexpert.com/api/compare \
  -H 'content-type: application/json' -d '{"urls":["mine.com","rival.com"]}'
```

The OpenAPI description is at [tools.roasexpert.com/api/openapi](https://tools.roasexpert.com/api/openapi). The hosted API is rate limited per visitor.

## Run it yourself

```bash
git clone https://github.com/ROAS-Expert/ai-seo-tools.git
cd ai-seo-tools
npm install
npm test          # runs inside the Workers runtime
npm run dev       # local Worker
```

Then open:

```
http://localhost:8787/audit?url=example.com
http://localhost:8787/product?url=https://store.com/products/example
http://localhost:8787/agent-check?url=store.com
```

`src/worker.ts` is a small example Worker with no storage and no limits. Add your own rate limits before you put it on the public internet.

### Use the pure functions

The calculators, the log analyzer and the generators have no runtime needs. They work in Node, Workers and the browser.

```ts
import { merCalc, cacCalc } from './src/calc';
import { parseLog, analyse } from './src/botlog';
import { buildLlmsTxt, buildRobotsAi, botStates } from './src/generators';

merCalc({ revenue: 120000, spend: 30000, cogsPct: 0.35, shippingPct: 0.08, feesPct: 0.03, returnsPct: 0.04, aov: 80, newSharePct: 0.6, targetMarginPct: 0.15 });
// { mer: 4, breakEvenRoas: 2, requiredMer: 2.86, profitAfterMarketing: 30000, ... }

cacCalc({ cac: 1200, arpa: 200, grossMarginPct: 0.8, churnPct: 0.025, expansionPct: 0 });
// { paybackMonths: 9, simplePaybackMonths: 7.5, ltvToCac: ..., curve: [...] }

analyse(parseLog(accessLogText));
// { bots: [{ label: 'GPTBot', hits, blocked, notFound, topPaths }], kinds, daily, notes }

botStates(robotsTxtText);
// { GPTBot: 'allowed', ClaudeBot: 'blocked', ... }
```

`npm run build:browser` bundles the calculators and the log analyzer to `dist/tools.js` as a `RZTools` global.

The site checks (`audit`, `auditProduct`, `agentCheck`) parse HTML with `HTMLRewriter`, so they need the Cloudflare Workers runtime. Each takes a `fetch` function as its first argument, which is how the tests run them against fixtures.

## How the checks work

- Every request goes through `guardedFetch` in `src/engine/fetcher.ts`. It only allows public http and https hosts, re-checks every redirect hop, caps the body size and times out.
- The checks are read-only. They send GET requests to public URLs. They never log in, submit a form or add to a cart.
- The crawler identifies itself as `ROASExpertAudit/1.0`.
- The agent readiness check has three stages: find (homepage, robots.txt, product feed, llms.txt), read (product page, structured data, stock, server-rendered text, policies) and buy (product JSON, cart, checkout).
- The log analyzer understands Apache and Nginx combined logs, JSON lines such as Cloudflare Logpush, and CSV or TSV with a user agent column.

## Layout

```
src/engine/     site audit, product check, agent check, robots and sitemap parsers, CMS detection, fixes
src/calc.ts     MER and CAC payback maths
src/botlog.ts   access log parser and bot analysis
src/generators.ts  llms.txt and robots.txt builders
src/worker.ts   example Worker
test/           vitest suite with site fixtures for Shopify, WooCommerce, Magento and Framer
```

## Contributing

Issues and pull requests are welcome. Good first changes: a new bot in `src/botlog.ts`, a new CMS signature in `src/engine/cms.ts`, or a fixture for a platform that is not covered yet. Run `npm test` and `npm run typecheck` before you open a pull request.

## About

Built by [ROAS Expert](https://roasexpert.com), an agentic SEO and growth marketing agency. The hosted version at [tools.roasexpert.com](https://tools.roasexpert.com) adds shareable reports and an AI visibility check. For a full audit of your site, see [roasexpert.com/audit](https://roasexpert.com/audit).

## Licence

MIT. See [LICENSE](LICENSE).
