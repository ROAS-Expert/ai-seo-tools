import type { AuditFacts, Category, CmsResult, Finding, SiteCategory, Status } from './types';
import { aiBotAccess, blocksEverything, isAllowed } from './robots';
import { findType, flattenJsonLd, typesOf } from './html';

const CATEGORY_LABELS: Record<SiteCategory, string> = {
  crawl: 'Crawling and indexing',
  onpage: 'On-page basics',
  schema: 'Structured data',
  ai: 'AI search readiness',
  speed: 'Speed signals',
};
export const CATEGORY_WEIGHTS: Record<SiteCategory, number> = { crawl: 25, onpage: 20, schema: 20, ai: 20, speed: 15 };
export { CATEGORY_LABELS };

export function runChecks(facts: AuditFacts, cms: CmsResult): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, category: Category, label: string, status: Status, weight: number, detail: string, evidence?: string) => {
    out.push({ id, category, label, status, weight, detail, evidence });
  };
  const home = facts.home;
  const h = home?.html;
  const host = facts.hostname;
  const ecommerce = cms.ecommerce;

  // ---------- Crawling and indexing ----------
  if (!home || home.status === 0) {
    add('home_reachable', 'crawl', 'Homepage reachable', 'fail', 6, `We could not load the homepage: ${facts.homeError || 'no response'}. Check the address, DNS and that the site is public.`);
    return out;
  } else if (home.blocked) {
    add('home_reachable', 'crawl', 'Homepage reachable', 'fail', 6, `${home.blocked} stopped our crawler before it saw the page (HTTP ${home.status}, final URL ${home.finalUrl}). We cannot audit what we cannot read. The same wall meets AI crawlers unless their user agents are allow-listed, so check the bot rules for GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot in your WAF or bot management settings.`, home.html.title.slice(0, 120));
    return out;
  } else if (home.status >= 400) {
    add('home_reachable', 'crawl', 'Homepage reachable', 'fail', 6, `The homepage returned HTTP ${home.status}. Search engines and AI crawlers get the same answer.`);
    return out;
  } else {
    add('home_reachable', 'crawl', 'Homepage reachable', 'pass', 6, `Homepage answered HTTP ${home.status} at ${home.finalUrl}.`);
  }

  if (facts.httpProbe) {
    const p = facts.httpProbe;
    if (p.status === 0) add('https_redirect', 'crawl', 'HTTP redirects to HTTPS', 'warn', 4, `http://${host} did not answer (${p.error || 'no response'}). If port 80 is closed, old links and typed addresses fail.`);
    else if (p.status >= 300 && p.status < 400 && p.location?.startsWith('https://')) add('https_redirect', 'crawl', 'HTTP redirects to HTTPS', 'pass', 4, `http://${host} sends a ${p.status} to ${p.location}.`);
    else if (p.status >= 200 && p.status < 300) add('https_redirect', 'crawl', 'HTTP redirects to HTTPS', 'fail', 4, `http://${host} serves the page over plain HTTP instead of redirecting. That splits signals between two versions of the site.`);
    else add('https_redirect', 'crawl', 'HTTP redirects to HTTPS', 'warn', 4, `http://${host} answered HTTP ${p.status}${p.location ? ' to ' + p.location : ''}.`);
  }

  if (facts.altHostProbe && home) {
    const p = facts.altHostProbe;
    const finalHost = new URL(home.finalUrl).hostname;
    const altHost = new URL(p.url).hostname;
    if (p.status === 0) add('www_consistency', 'crawl', 'www and non-www agree', 'warn', 3, `${altHost} did not answer (${p.error || 'no response'}). Visitors who type it get an error.`);
    else if (p.status >= 300 && p.status < 400 && p.location && new URL(p.location).hostname === finalHost) add('www_consistency', 'crawl', 'www and non-www agree', 'pass', 3, `${altHost} redirects to ${finalHost}.`);
    else if (p.status >= 200 && p.status < 300) add('www_consistency', 'crawl', 'www and non-www agree', 'fail', 3, `${altHost} serves its own copy of the site instead of redirecting to ${finalHost}. Two live hostnames means duplicate pages.`);
    else add('www_consistency', 'crawl', 'www and non-www agree', 'warn', 3, `${altHost} answered HTTP ${p.status}${p.location ? ' to ' + p.location : ''}.`);
  }

  if (home && home.redirects > 1) add('redirect_chain', 'crawl', 'Short redirect path', 'warn', 2, `The homepage took ${home.redirects} redirects to settle on ${home.finalUrl}. Each hop costs crawl budget and time.`);
  else if (home) add('redirect_chain', 'crawl', 'Short redirect path', 'pass', 2, home.redirects ? 'One redirect to the final URL.' : 'No redirects on the homepage.');

  const r = facts.robots;
  if (!r || r.status === 0) add('robots_present', 'crawl', 'robots.txt exists', 'warn', 3, 'robots.txt did not answer. Crawlers treat that as "crawl everything", which is fine, but you lose the place to declare sitemaps and AI bot rules.');
  else if (!r.present) add('robots_present', 'crawl', 'robots.txt exists', r.status === 404 ? 'warn' : 'warn', 3, `robots.txt returned HTTP ${r.status}${r.status === 200 ? ' but is empty' : ''}.`);
  else add('robots_present', 'crawl', 'robots.txt exists', 'pass', 3, `robots.txt found with ${r.groups.length} rule group${r.groups.length === 1 ? '' : 's'}.`);

  if (r?.present) {
    if (blocksEverything(r, 'Googlebot')) add('robots_blocking', 'crawl', 'robots.txt lets search engines in', 'fail', 6, 'robots.txt disallows the whole site for Googlebot. Nothing can rank until this is removed.', r.text.slice(0, 300));
    else if (!isAllowed(r, 'Googlebot', '/products/example') || !isAllowed(r, 'Googlebot', '/collections/example')) add('robots_blocking', 'crawl', 'robots.txt lets search engines in', 'warn', 6, 'robots.txt blocks product or collection style paths for Googlebot. Check that no revenue pages are disallowed.');
    else add('robots_blocking', 'crawl', 'robots.txt lets search engines in', 'pass', 6, 'Googlebot can reach the homepage and product-style paths.');
    if (r.sitemaps.length) add('robots_sitemap', 'crawl', 'Sitemap declared in robots.txt', 'pass', 2, `Declares ${r.sitemaps.length} sitemap${r.sitemaps.length === 1 ? '' : 's'}: ${r.sitemaps.slice(0, 2).join(', ')}${r.sitemaps.length > 2 ? '...' : ''}`);
    else add('robots_sitemap', 'crawl', 'Sitemap declared in robots.txt', 'warn', 2, 'No Sitemap: line in robots.txt. Crawlers can still find /sitemap.xml, but declaring it is free.');
  } else {
    add('robots_blocking', 'crawl', 'robots.txt lets search engines in', 'pass', 6, 'No robots.txt rules, so nothing is blocked.');
    add('robots_sitemap', 'crawl', 'Sitemap declared in robots.txt', 'skip', 2, 'No robots.txt to declare it in.');
  }

  const sm = facts.sitemap;
  if (!sm) add('sitemap', 'crawl', 'XML sitemap works', 'fail', 4, 'No sitemap found at /sitemap.xml or in robots.txt.');
  else if (sm.ok) add('sitemap', 'crawl', 'XML sitemap works', 'pass', 4, sm.isIndex ? `Sitemap index at ${sm.url} with ${sm.childCount} child sitemaps.` : `Sitemap at ${sm.url} lists ${sm.urlCount} URLs.`);
  else add('sitemap', 'crawl', 'XML sitemap works', 'fail', 4, `${sm.url} is not a working sitemap: ${sm.error}.`);

  if (h) {
    const robotsMeta = h.metaRobots;
    const xrobots = (home!.headers['x-robots-tag'] || '').toLowerCase();
    const noindex = /\bnoindex\b/.test(robotsMeta) || /\bnoindex\b/.test(xrobots);
    if (noindex) add('noindex', 'crawl', 'Homepage is indexable', 'fail', 6, `The homepage carries a noindex directive (${/\bnoindex\b/.test(xrobots) ? 'X-Robots-Tag header' : 'robots meta tag'}). It cannot appear in search results.`, robotsMeta || xrobots);
    else add('noindex', 'crawl', 'Homepage is indexable', 'pass', 6, 'No noindex directive on the homepage.');

    if (!h.canonical) add('canonical', 'crawl', 'Canonical tag', 'warn', 3, 'No canonical link on the homepage. Parameters, trailing slashes and tracking links can all become duplicates.');
    else {
      let c: URL | null = null;
      try {
        c = new URL(h.canonical, home!.finalUrl);
      } catch {
        /* ignore */
      }
      const finalU = new URL(home!.finalUrl);
      if (!c) add('canonical', 'crawl', 'Canonical tag', 'warn', 3, `Canonical "${h.canonical}" is not a valid URL.`);
      else if (c.hostname !== finalU.hostname) add('canonical', 'crawl', 'Canonical tag', 'fail', 3, `The homepage canonical points to another host (${c.hostname}). You are handing your ranking to that domain.`, h.canonical);
      else if (c.protocol !== 'https:') add('canonical', 'crawl', 'Canonical tag', 'warn', 3, 'The canonical uses http:// while the page is served over https://.', h.canonical);
      else if (c.pathname.replace(/\/$/, '') !== finalU.pathname.replace(/\/$/, '')) add('canonical', 'crawl', 'Canonical tag', 'warn', 3, `The homepage canonical points to ${c.pathname} rather than itself.`, h.canonical);
      else add('canonical', 'crawl', 'Canonical tag', 'pass', 3, 'Self-referencing canonical on the homepage.');
    }
  }

  if (facts.notFoundProbe) {
    const p = facts.notFoundProbe;
    if (p.status === 404 || p.status === 410) add('soft_404', 'crawl', 'Missing pages return 404', 'pass', 2, `A made-up URL returns HTTP ${p.status}${p.redirects ? ' after ' + p.redirects + ' redirect' + (p.redirects === 1 ? '' : 's') : ''}, as it should.`);
    else if (p.status >= 200 && p.status < 300) add('soft_404', 'crawl', 'Missing pages return 404', 'fail', 2, 'A made-up URL returns HTTP 200. Search engines call this a soft 404 and may index junk pages or distrust real ones.');
    else if (p.status >= 300 && p.status < 400) add('soft_404', 'crawl', 'Missing pages return 404', 'warn', 2, `A made-up URL keeps redirecting (last answer HTTP ${p.status}) instead of settling on a 404.`);
    else if (p.status === 0) add('soft_404', 'crawl', 'Missing pages return 404', 'info', 2, 'Could not test a missing page.');
    else add('soft_404', 'crawl', 'Missing pages return 404', 'warn', 2, `A made-up URL returns HTTP ${p.status}.`);
  }

  if (facts.keyPage && facts.keyPage.status >= 200) {
    const k = facts.keyPage;
    const kn = /\bnoindex\b/.test(k.html.metaRobots) || /\bnoindex\b/.test((k.headers['x-robots-tag'] || '').toLowerCase());
    if (kn) add('key_page_indexable', 'crawl', `${kindLabel(facts.keyPageKind)} page indexable`, 'fail', 3, `${k.finalUrl} carries noindex.`);
    else add('key_page_indexable', 'crawl', `${kindLabel(facts.keyPageKind)} page indexable`, 'pass', 3, `${shortUrl(k.finalUrl)} is indexable (HTTP ${k.status}).`);
  } else if (facts.keyPage) {
    add('key_page_indexable', 'crawl', `${kindLabel(facts.keyPageKind)} page indexable`, 'warn', 3, `${shortUrl(facts.keyPage.url)} returned HTTP ${facts.keyPage.status}.`);
  }

  // ---------- On-page ----------
  if (h) {
    const tl = h.title.length;
    if (!tl) add('title', 'onpage', 'Title tag', 'fail', 4, 'The homepage has no title. That is the headline in every search result.');
    else if (tl < 25) add('title', 'onpage', 'Title tag', 'warn', 4, `Title is ${tl} characters: "${h.title}". Under 25 wastes the space; say what you sell and for whom.`);
    else if (tl > 65) add('title', 'onpage', 'Title tag', 'warn', 4, `Title is ${tl} characters and will be cut off around 60: "${h.title.slice(0, 80)}".`);
    else add('title', 'onpage', 'Title tag', 'pass', 4, `"${h.title}" (${tl} characters).`);

    const dl = h.metaDescription.length;
    if (!dl) add('meta_description', 'onpage', 'Meta description', 'fail', 3, 'No meta description. Google writes its own, usually worse, and AI engines lose a clean summary.');
    else if (dl < 60) add('meta_description', 'onpage', 'Meta description', 'warn', 3, `Meta description is only ${dl} characters: "${h.metaDescription}".`);
    else if (dl > 170) add('meta_description', 'onpage', 'Meta description', 'warn', 3, `Meta description is ${dl} characters and will be truncated around 155.`);
    else add('meta_description', 'onpage', 'Meta description', 'pass', 3, `${dl} characters: "${h.metaDescription.slice(0, 120)}${dl > 120 ? '...' : ''}"`);

    if (h.h1.length === 0) add('h1', 'onpage', 'One H1 heading', 'fail', 3, 'No H1 on the homepage. Crawlers and screen readers use it as the page topic.');
    else if (h.h1.length > 1) add('h1', 'onpage', 'One H1 heading', 'warn', 3, `${h.h1.length} H1 headings: "${h.h1.slice(0, 3).map((x) => x.slice(0, 40)).join('" / "')}". Keep one topic per page.`);
    else if (!h.h1[0]) add('h1', 'onpage', 'One H1 heading', 'warn', 3, 'The H1 exists but is empty (probably a logo image without alt text).');
    else add('h1', 'onpage', 'One H1 heading', 'pass', 3, `H1: "${h.h1[0].slice(0, 100)}"`);

    const skipped = headingSkips(h.headings);
    if (h.headings.length < 2) add('heading_structure', 'onpage', 'Heading structure', 'warn', 1, `Only ${h.headings.length} heading${h.headings.length === 1 ? '' : 's'} on the homepage. Sections without headings are hard to summarise.`);
    else if (skipped) add('heading_structure', 'onpage', 'Heading structure', 'warn', 1, `Heading levels jump (for example H${skipped[0]} straight to H${skipped[1]}). Keep the outline in order.`);
    else add('heading_structure', 'onpage', 'Heading structure', 'pass', 1, `${h.headings.length} headings in a clean outline.`);

    if (h.images.total === 0) add('img_alt', 'onpage', 'Image alt text', 'info', 3, 'No <img> tags found in the HTML (images may load from CSS or JS).');
    else {
      const pct = Math.round((h.images.withAlt / h.images.total) * 100);
      if (pct >= 90) add('img_alt', 'onpage', 'Image alt text', 'pass', 3, `${pct}% of ${h.images.total} images have alt text.`);
      else if (pct >= 60) add('img_alt', 'onpage', 'Image alt text', 'warn', 3, `${h.images.total - h.images.withAlt} of ${h.images.total} images have no alt text (${pct}% covered).`);
      else add('img_alt', 'onpage', 'Image alt text', 'fail', 3, `Only ${pct}% of ${h.images.total} images have alt text. Image search, accessibility and AI image understanding all suffer.`);
    }

    if (!h.lang) add('html_lang', 'onpage', 'Language declared', 'warn', 2, 'No lang attribute on <html>. Browsers, translators and crawlers guess the language.');
    else add('html_lang', 'onpage', 'Language declared', 'pass', 2, `lang="${h.lang}"`);

    add('viewport', 'onpage', 'Mobile viewport', h.viewport ? 'pass' : 'fail', 2, h.viewport ? 'Viewport meta tag present.' : 'No viewport meta tag. The site will not pass mobile-first indexing cleanly.');

    const og = h.og;
    const ogMissing = ['title', 'description', 'image'].filter((k) => !og[k]);
    if (!ogMissing.length) add('open_graph', 'onpage', 'Social preview tags', 'pass', 2, 'og:title, og:description and og:image are set.');
    else if (ogMissing.length === 3) add('open_graph', 'onpage', 'Social preview tags', 'warn', 2, 'No Open Graph tags. Shared links show no image or summary on LinkedIn, WhatsApp, Slack or X.');
    else add('open_graph', 'onpage', 'Social preview tags', 'warn', 2, `Missing og:${ogMissing.join(', og:')}.`);

    add('favicon', 'onpage', 'Favicon', h.favicon ? 'pass' : 'warn', 1, h.favicon ? 'Favicon declared.' : 'No favicon link. Google shows favicons next to mobile results.');

    if (h.hreflang.length) {
      const bad = h.hreflang.filter((x) => !/^([a-z]{2,3})(-[a-z0-9]{2,8})*$|^x-default$/i.test(x.lang) || !x.href);
      const hasDefault = h.hreflang.some((x) => x.lang.toLowerCase() === 'x-default');
      if (bad.length) add('hreflang', 'onpage', 'hreflang tags', 'warn', 1, `${bad.length} hreflang entries are malformed (example "${bad[0].lang}").`);
      else add('hreflang', 'onpage', 'hreflang tags', hasDefault ? 'pass' : 'warn', 1, `${h.hreflang.length} hreflang entries${hasDefault ? ' including x-default.' : ', but no x-default fallback.'}`);
    } else {
      add('hreflang', 'onpage', 'hreflang tags', 'info', 1, 'No hreflang tags. Only needed if you serve several languages or countries.');
    }

    add('charset', 'onpage', 'Character set declared', h.charset ? 'pass' : 'warn', 1, h.charset ? 'Charset declared.' : 'No charset meta tag; special characters may render wrong.');
  }

  // ---------- Structured data ----------
  if (h) {
    const nodes = flattenJsonLd(h.jsonld);
    const types = [...new Set(nodes.flatMap(typesOf))];
    if (h.jsonldErrors) add('jsonld_valid', 'schema', 'JSON-LD parses', 'fail', 4, `${h.jsonldErrors} JSON-LD block${h.jsonldErrors === 1 ? '' : 's'} failed to parse. Broken JSON is ignored entirely.`);
    else if (!h.jsonld.length && !h.microdataTypes.length) add('jsonld_valid', 'schema', 'JSON-LD parses', 'fail', 4, 'No structured data on the homepage at all.');
    else add('jsonld_valid', 'schema', 'JSON-LD parses', 'pass', 4, `${h.jsonld.length} JSON-LD block${h.jsonld.length === 1 ? '' : 's'}${h.microdataTypes.length ? ' plus microdata (' + h.microdataTypes.slice(0, 4).join(', ') + ')' : ''}. Types: ${types.slice(0, 8).join(', ') || 'none'}.`);

    const org = findType(nodes, 'Organization', 'LocalBusiness', 'OnlineStore', 'Store', 'Corporation', 'Brand') || (h.microdataTypes.some((t) => /Organization|LocalBusiness|Store/.test(t)) ? ({ '@type': 'microdata' } as Record<string, unknown>) : undefined);
    if (!org) add('org_schema', 'schema', 'Organization schema', 'fail', 4, 'No Organization or LocalBusiness schema. This is how Google and AI engines connect your name, logo and social profiles into one entity.');
    else {
      const missing = ['name', 'url', 'logo'].filter((k) => !org[k]);
      const sameAs = Array.isArray(org['sameAs']) ? (org['sameAs'] as unknown[]).length : org['sameAs'] ? 1 : 0;
      if (org['@type'] === 'microdata') add('org_schema', 'schema', 'Organization schema', 'warn', 4, 'Organization markup exists as microdata only. JSON-LD is easier to keep complete.');
      else if (missing.length) add('org_schema', 'schema', 'Organization schema', 'warn', 4, `Organization schema is missing ${missing.join(', ')}.`);
      else if (sameAs < 2) add('org_schema', 'schema', 'Organization schema', 'warn', 4, `Organization schema has name, url and logo but ${sameAs ? 'only one' : 'no'} sameAs link. Add LinkedIn, Instagram, Trustpilot and other profiles.`);
      else add('org_schema', 'schema', 'Organization schema', 'pass', 4, `Organization schema with name, url, logo and ${sameAs} sameAs links.`);
    }

    const site = findType(nodes, 'WebSite');
    if (!site) add('website_schema', 'schema', 'WebSite schema', 'warn', 2, 'No WebSite schema. It names the site and can declare site search.');
    else add('website_schema', 'schema', 'WebSite schema', 'pass', 2, site['potentialAction'] ? 'WebSite schema with a search action.' : 'WebSite schema present.');

    const bc = findType(nodes, 'BreadcrumbList') || (h.microdataTypes.includes('BreadcrumbList') ? {} : undefined);
    add('breadcrumb_schema', 'schema', 'Breadcrumb schema', bc ? 'pass' : 'info', 2, bc ? 'BreadcrumbList found.' : 'No BreadcrumbList on the homepage. Expected on inner pages rather than the homepage; we check the key page below.');

    const kp = facts.keyPage;
    if (kp && kp.status >= 200 && kp.status < 300) {
      const knodes = flattenJsonLd(kp.html.jsonld);
      const ktypes = [...new Set(knodes.flatMap(typesOf))];
      if (facts.keyPageKind === 'product' || (ecommerce && facts.keyPageKind !== 'article')) {
        const prod = findType(knodes, 'Product', 'ProductGroup') || (kp.html.microdataTypes.includes('Product') ? ({ '@type': 'microdata' } as Record<string, unknown>) : undefined);
        if (!prod) add('product_schema', 'schema', 'Product schema on a product page', facts.keyPageKind === 'product' ? 'fail' : 'warn', 6, `${shortUrl(kp.finalUrl)} has no Product schema${ktypes.length ? ' (found ' + ktypes.slice(0, 4).join(', ') + ')' : ''}. Without it there are no price, stock or review rich results and no clean product data for shopping assistants.`);
        else if (prod['@type'] === 'microdata') add('product_schema', 'schema', 'Product schema on a product page', 'warn', 6, 'Product markup is microdata only. Move it to JSON-LD so it can carry offers, shipping and returns.');
        else {
          const offers = Array.isArray(prod['offers']) ? (prod['offers'] as Record<string, unknown>[])[0] : (prod['offers'] as Record<string, unknown> | undefined);
          const hasOffer = offers && typeof offers === 'object';
          const price = hasOffer ? offers['price'] ?? offers['lowPrice'] : undefined;
          const currency = hasOffer ? offers['priceCurrency'] : undefined;
          const avail = hasOffer ? offers['availability'] : undefined;
          const missing: string[] = [];
          if (!prod['name']) missing.push('name');
          if (!prod['image']) missing.push('image');
          if (!hasOffer) missing.push('offers');
          else {
            if (price === undefined) missing.push('offers.price');
            if (!currency) missing.push('offers.priceCurrency');
            if (!avail) missing.push('offers.availability');
          }
          if (missing.length) add('product_schema', 'schema', 'Product schema on a product page', 'warn', 6, `Product schema on ${shortUrl(kp.finalUrl)} is missing ${missing.join(', ')}.`);
          else add('product_schema', 'schema', 'Product schema on a product page', 'pass', 6, `Product schema on ${shortUrl(kp.finalUrl)} with price, currency and availability${prod['aggregateRating'] ? ' and ratings' : ''}.`);
        }
      } else if (facts.keyPageKind === 'article') {
        const art = findType(knodes, 'Article', 'BlogPosting', 'NewsArticle');
        if (!art) add('article_schema', 'schema', 'Article schema on a post', 'warn', 4, `${shortUrl(kp.finalUrl)} has no Article or BlogPosting schema. Add it with author, datePublished and dateModified.`);
        else {
          const missing = ['headline', 'author', 'datePublished'].filter((k) => !art[k]);
          add('article_schema', 'schema', 'Article schema on a post', missing.length ? 'warn' : 'pass', 4, missing.length ? `Article schema is missing ${missing.join(', ')}.` : 'Article schema with headline, author and date.');
        }
      } else {
        add('inner_schema', 'schema', 'Schema on an inner page', ktypes.length ? 'pass' : 'warn', 4, ktypes.length ? `${shortUrl(kp.finalUrl)} carries ${ktypes.slice(0, 5).join(', ')}.` : `${shortUrl(kp.finalUrl)} has no structured data.`);
      }
      const kbc = findType(knodes, 'BreadcrumbList') || (kp.html.microdataTypes.includes('BreadcrumbList') ? {} : undefined);
      add('breadcrumb_inner', 'schema', 'Breadcrumbs on inner pages', kbc ? 'pass' : 'warn', 2, kbc ? `BreadcrumbList on ${shortUrl(kp.finalUrl)}.` : `No BreadcrumbList on ${shortUrl(kp.finalUrl)}. Breadcrumbs tell crawlers and assistants where a page sits in the catalogue.`);
    } else if (ecommerce) {
      add('product_schema', 'schema', 'Product schema on a product page', 'info', 6, 'We could not find a product page to test. Give us a product URL to check Product schema.');
    }

    const faq = findType(nodes, 'FAQPage') || (facts.keyPage ? findType(flattenJsonLd(facts.keyPage.html.jsonld), 'FAQPage') : undefined);
    add('faq_schema', 'schema', 'FAQ schema', faq ? 'pass' : 'info', 2, faq ? 'FAQPage schema found.' : 'No FAQPage schema seen. Worth adding where you already answer customer questions.');
  }

  // ---------- AI readiness ----------
  const access = r ? aiBotAccess(r) : {};
  if (r?.present) {
    const blocked = Object.entries(access).filter(([, v]) => v === 'blocked').map(([k]) => k);
    const partial = Object.entries(access).filter(([, v]) => v === 'partial').map(([k]) => k);
    const searchBots = ['OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Bingbot'];
    const blockedSearch = blocked.filter((b) => searchBots.includes(b));
    if (blockedSearch.length) add('ai_bots', 'ai', 'AI search crawlers allowed', 'fail', 6, `robots.txt blocks ${blockedSearch.join(', ')}. Those are the crawlers behind ChatGPT, Claude, Perplexity and Copilot answers, so the site cannot be cited there.${blocked.filter((b) => !searchBots.includes(b)).length ? ' Also blocked: ' + blocked.filter((b) => !searchBots.includes(b)).join(', ') + '.' : ''}`);
    else if (blocked.length) add('ai_bots', 'ai', 'AI search crawlers allowed', 'warn', 6, `Search crawlers are allowed, but ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} blocked. Blocking training bots is a legitimate choice; just make sure it is deliberate.`);
    else if (partial.length) add('ai_bots', 'ai', 'AI search crawlers allowed', 'warn', 6, `${partial.join(', ')} can reach the homepage but not product or blog style paths.`);
    else add('ai_bots', 'ai', 'AI search crawlers allowed', 'pass', 6, 'GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Bingbot and Google-Extended are all allowed.');
  } else {
    add('ai_bots', 'ai', 'AI search crawlers allowed', 'pass', 6, 'No robots.txt rules, so every AI crawler is allowed by default.');
  }

  const llms = facts.llmsTxt;
  if (llms?.present) add('llms_txt', 'ai', 'llms.txt', 'pass', 3, `/llms.txt found (${llms.bytes} bytes).`);
  else add('llms_txt', 'ai', 'llms.txt', 'warn', 3, 'No /llms.txt. It is a plain-text map of your most useful pages for AI assistants. Cheap to add and an early signal of agentic readiness.');

  if (h) {
    const w = h.textWords;
    if (w < 80) add('text_without_js', 'ai', 'Content readable without JavaScript', 'fail', 5, `Only ${w} words of text in the raw HTML. Crawlers that do not run JavaScript (most AI bots) see an empty page.`);
    else if (w < 250) add('text_without_js', 'ai', 'Content readable without JavaScript', 'warn', 5, `${w} words in the raw HTML. Thin for a homepage; AI engines summarise what is in the HTML, not what scripts draw later.`);
    else add('text_without_js', 'ai', 'Content readable without JavaScript', 'pass', 5, `${w} words of real text in the HTML${h.hasMain ? ', inside a <main> landmark' : ''}.`);

    const nodes = flattenJsonLd(h.jsonld);
    const org = findType(nodes, 'Organization', 'LocalBusiness', 'OnlineStore', 'Store', 'Corporation');
    const sameAs = org && Array.isArray(org['sameAs']) ? (org['sameAs'] as unknown[]).length : 0;
    add('entity_links', 'ai', 'Entity links (sameAs)', sameAs >= 2 ? 'pass' : sameAs ? 'warn' : 'fail', 2, sameAs >= 2 ? `${sameAs} sameAs profile links connect the brand entity.` : sameAs ? 'Only one sameAs link. Add the rest of your public profiles.' : 'No sameAs links. AI engines reconcile a brand across LinkedIn, review sites and social profiles; give them the list.');

    const kp = facts.keyPage;
    const by = h.bylineLike || h.dateLike || (kp ? kp.html.bylineLike || kp.html.dateLike : false);
    add('author_date', 'ai', 'Author and date signals', by ? 'pass' : 'warn', 2, by ? 'Author or date markup found.' : 'No author, byline or dateModified signals on the pages we read. Engines weigh who wrote it and how fresh it is.');

    const h2s = h.headings.filter((x) => x.level === 2).length;
    add('descriptive_headings', 'ai', 'Sections with headings', h2s >= 2 ? 'pass' : 'warn', 1, h2s >= 2 ? `${h2s} H2 sections on the homepage.` : 'Fewer than two H2 sections. Assistants quote sections, not walls of text.');

    const faq = h.faqLike || findType(nodes, 'FAQPage') !== undefined;
    add('answers', 'ai', 'Question and answer content', faq ? 'pass' : 'info', 1, faq ? 'FAQ style content present.' : 'No FAQ style content on the homepage. Direct questions and short answers are what AI engines lift.');
  }

  // ---------- Speed signals ----------
  if (home && home.status > 0) {
    const t = home.ttfbMs;
    if (t <= 600) add('ttfb', 'speed', 'Server response time', 'pass', 4, `Time to first byte ${t} ms.`);
    else if (t <= 1500) add('ttfb', 'speed', 'Server response time', 'warn', 4, `Time to first byte ${t} ms. Aim under 600 ms; a CDN or page cache usually gets you there.`);
    else add('ttfb', 'speed', 'Server response time', 'fail', 4, `Time to first byte ${t} ms. Every page view waits this long before anything renders.`);

    const kb = Math.round(home.bytes / 1024);
    if (home.truncated) add('html_weight', 'speed', 'HTML size', 'fail', 2, `The homepage HTML is over ${kb} KB (we stopped reading). Crawlers cap how much they read per page.`);
    else if (kb <= 300) add('html_weight', 'speed', 'HTML size', 'pass', 2, `${kb} KB of HTML.`);
    else if (kb <= 800) add('html_weight', 'speed', 'HTML size', 'warn', 2, `${kb} KB of HTML. Inline scripts, SVGs or data URIs are bloating the document.`);
    else add('html_weight', 'speed', 'HTML size', 'fail', 2, `${kb} KB of HTML. That is heavier than most entire pages.`);

    const enc = (home.headers['content-encoding'] || '').toLowerCase();
    if (/br|gzip|zstd/.test(enc)) add('compression', 'speed', 'Text compression', 'pass', 2, `Served with ${enc} compression.`);
    else add('compression', 'speed', 'Text compression', home.bytes > 20000 ? 'fail' : 'warn', 2, 'No gzip or brotli compression on the HTML response.');

    const cc = home.headers['cache-control'] || '';
    add('cache_headers', 'speed', 'Cache headers', cc ? 'pass' : 'info', 1, cc ? `Cache-Control: ${cc.slice(0, 80)}` : 'No Cache-Control header on the HTML.');
  }
  if (h) {
    const s = h.scripts;
    if (s.total <= 15) add('script_count', 'speed', 'Script count', 'pass', 2, `${s.total} script tags (${s.external} external).`);
    else if (s.total <= 35) add('script_count', 'speed', 'Script count', 'warn', 2, `${s.total} script tags (${s.external} external). Tag managers and apps add up; audit what still earns its place.`);
    else add('script_count', 'speed', 'Script count', 'fail', 2, `${s.total} script tags (${s.external} external). This is the usual cause of poor mobile scores.`);

    if (s.blocking <= 2) add('render_blocking', 'speed', 'Render-blocking scripts', 'pass', 2, `${s.blocking} blocking script${s.blocking === 1 ? '' : 's'} in <head>.`);
    else if (s.blocking <= 6) add('render_blocking', 'speed', 'Render-blocking scripts', 'warn', 2, `${s.blocking} scripts in <head> load without defer or async and block first paint.`);
    else add('render_blocking', 'speed', 'Render-blocking scripts', 'fail', 2, `${s.blocking} render-blocking scripts in <head>.`);

    if (h.images.total >= 5) {
      const modernPct = Math.round((h.images.modern / h.images.total) * 100);
      add('modern_images', 'speed', 'Modern image formats', modernPct >= 50 ? 'pass' : modernPct > 0 ? 'warn' : 'warn', 1, modernPct >= 50 ? `${modernPct}% of images use WebP or AVIF.` : `${modernPct}% of images use WebP or AVIF; the rest are JPEG or PNG.`);
      const lazyPct = Math.round((h.images.lazy / h.images.total) * 100);
      add('lazy_loading', 'speed', 'Lazy loading', h.images.total < 10 || lazyPct >= 40 ? 'pass' : 'warn', 1, h.images.total < 10 ? `${h.images.total} images, lazy loading is not critical.` : `${lazyPct}% of ${h.images.total} images use loading="lazy".`);
    } else {
      add('modern_images', 'speed', 'Modern image formats', 'info', 1, 'Too few images in the HTML to judge.');
      add('lazy_loading', 'speed', 'Lazy loading', 'info', 1, 'Too few images in the HTML to judge.');
    }
    add('stylesheets', 'speed', 'Stylesheet count', h.stylesheets <= 6 ? 'pass' : h.stylesheets <= 12 ? 'warn' : 'fail', 1, `${h.stylesheets} external stylesheets.`);
  }

  return out;
}

function headingSkips(headings: Array<{ level: number }>): [number, number] | null {
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) return [prev, h.level];
    prev = h.level;
  }
  return null;
}

function kindLabel(k: string): string {
  return k === 'product' ? 'Product' : k === 'collection' ? 'Collection' : k === 'article' ? 'Blog post' : 'Inner';
}

export function shortUrl(u: string): string {
  try {
    const x = new URL(u);
    const p = x.pathname.length > 50 ? x.pathname.slice(0, 47) + '...' : x.pathname;
    return x.hostname + p;
  } catch {
    return u.slice(0, 60);
  }
}
