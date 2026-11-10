// Minimal Cloudflare Worker that exposes the three site checks as JSON.
// No storage, no rate limits, no keys. Put it behind your own limits before you make it public.
import { audit } from './engine/audit';
import { auditProduct } from './engine/product';
import { agentCheck } from './engine/agent';
import { GuardError, normaliseInput } from './engine/fetcher';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' } });
const id = () => crypto.randomUUID().slice(0, 8);

export default {
  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    const target = u.searchParams.get('url') || '';
    const routes = ['/audit', '/product', '/agent-check'];
    if (!routes.includes(u.pathname)) return json({ routes: routes.map((r) => r + '?url=example.com'), docs: 'https://github.com/roasexpert/ai-seo-tools' }, u.pathname === '/' ? 200 : 404);
    try {
      normaliseInput(target);
    } catch (e) {
      return json({ error: e instanceof GuardError ? e.message : 'Invalid URL.' }, 400);
    }
    try {
      if (u.pathname === '/audit') return json(await audit(fetch, target, id()));
      if (u.pathname === '/product') return json(await auditProduct(fetch, target, id()));
      return json(await agentCheck(fetch, target, id()));
    } catch (e) {
      return json({ error: (e as Error).message || 'The check failed.' }, 502);
    }
  },
};
