# Notes for coding agents

- Runtime: Cloudflare Workers. Tests run in the Workers runtime through `@cloudflare/vitest-plugin`.
- Commands: `npm install`, `npm test`, `npm run typecheck`, `npm run dev`.
- The site checks in `src/engine/` use `HTMLRewriter`, so they do not run in plain Node. `src/calc.ts`, `src/botlog.ts` and `src/generators.ts` are pure and run anywhere.
- Every network call must go through `guardedFetch` in `src/engine/fetcher.ts`. Do not call `fetch` directly from a check.
- Checks are read-only. GET and HEAD only. Never add a request that changes state on the target site.
- Each check function takes a `fetch` implementation as its first argument. Tests pass `fakeFetch(site)` from `test/fixtures.ts`. Add a fixture before you add a check.
- User-facing strings are plain English, with no em dashes and no semicolons.
- To use the hosted tools instead of the code, connect to the MCP server at https://tools.roasexpert.com/mcp or read https://tools.roasexpert.com/llms.txt.
