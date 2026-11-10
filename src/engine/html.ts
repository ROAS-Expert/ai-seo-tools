import type { PageFacts } from './types';

type HtmlFacts = PageFacts['html'];

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe']);
const MODERN_IMG_RE = /\.(webp|avif)(\?|$)/i;
const SIG_TOKENS = [
  'cdn.shopify.com', 'Shopify.theme', '/cdn/shop/', 'shopify-section', 'myshopify.com',
  '/wp-content/', '/wp-includes/', 'wp-json', 'woocommerce', 'wc-add-to-cart',
  'Magento_', '/static/version', '/static/frontend/', 'data-mage-init', 'x-magento-init',
  'framerusercontent.com', 'data-framer-', 'data-wf-site', 'webflow.js', 'website-files.com',
  'wixstatic.com', 'parastorage.com', 'squarespace.com', 'hs-scripts.com', 'hsforms.net',
  '__NEXT_DATA__', '/_next/static/', '__NUXT__', '/_nuxt/', '___gatsby',
  'bigcommerce.com', 'stencil-utils', 'prestashop', '/modules/ps_', 'demandware.static', 'drupalSettings', 'shopware', 'vtexassets.com',
  'add-to-cart', 'data-product-id', 'ghost-sdk', 'wixstores', 'sqs-add-to-cart-button', 'route=product',
];

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', laquo: '\u00ab', raquo: '\u00bb', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', eacute: '\u00e9', uuml: '\u00fc', ouml: '\u00f6', auml: '\u00e4', szlig: '\u00df' };
export function decodeEntities(s: string): string {
  if (!s || s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g[0] === '#') {
      const code = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = ENT[g.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

function words(s: string): number {
  if (!s) return 0;
  const m = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export function emptyHtmlFacts(): HtmlFacts {
  return {
    title: '',
    metaDescription: '',
    metaRobots: '',
    canonical: '',
    lang: '',
    viewport: false,
    favicon: false,
    charset: false,
    generator: '',
    h1: [],
    headings: [],
    images: { total: 0, withAlt: 0, lazy: 0, modern: 0, srcset: 0 },
    scripts: { total: 0, external: 0, blocking: 0, inline: 0 },
    stylesheets: 0,
    preloadFonts: 0,
    og: {},
    twitter: {},
    hreflang: [],
    jsonld: [],
    jsonldErrors: 0,
    microdataTypes: [],
    links: { internal: 0, external: 0, nofollow: 0, sample: [] },
    textWords: 0,
    bodyWords: 0,
    hasNoscript: false,
    hasMain: false,
    bylineLike: false,
    dateLike: false,
    faqLike: false,
    scriptSrcSample: [],
    classSample: '',
    htmlSample: '',
    product: emptyProductFacts(),
  };
}

export function emptyProductFacts(): HtmlFacts['product'] {
  return { text: '', meta: {}, bodyClass: '', addToCart: false, variantInputs: 0, reviewSignals: false, gallery: { total: 0, withAlt: 0 }, firstImages: { total: 0, withAlt: 0 } };
}

const CART_RE = /add[\s_-]*to[\s_-]*(cart|bag|basket)|buy[\s_-]*now|\/cart\/add|addtocart|add-to-cart/i;
const VARIANT_RE = /size|colou?r|option|variant|attribute|super_attribute|swatch/i;
const REVIEW_CLASS_RE = /review|rating|stars?\b|jdgm|yotpo|okendo|loox|stamped|trustpilot/i;
const GALLERY_SEL = '[class*="gallery"] img,[class*="product-media"] img,[class*="product__media"] img,[class*="fotorama"] img,[class*="product-image"] img,[class*="product-photo"] img,[class*="product-single__media"] img,[class*="productView-image"] img';
const TEXT_CAP = 120_000;

/**
 * Extract page facts from an HTML string using HTMLRewriter (native, streaming).
 * `baseUrl` is the final URL of the page, used to classify links.
 */
export async function extractHtml(html: string, baseUrl: string): Promise<HtmlFacts> {
  const f = emptyHtmlFacts();
  const base = new URL(baseUrl);
  const baseHost = base.hostname.replace(/^www\./, '');
  let inHead = true;
  let skipDepth = 0;
  let title = '';
  let headingBuf = '';
  let headingLevel = 0;
  let jsonBuf = '';
  let inJsonLd = false;
  let faqHits = 0;
  let classBuf = '';
  let textWordCount = 0;
  let mainWordCount = 0;
  let inMain = false;
  const jsonBlocks: string[] = [];
  const pf = f.product;
  let textBuf = '';
  let reviewClassHit = false;
  const addText = (s: string) => {
    if (textBuf.length < TEXT_CAP) textBuf += s;
  };

  const rewriter = new HTMLRewriter()
    .on('html', {
      element(el) {
        f.lang = (el.getAttribute('lang') || '').trim();
      },
    })
    .on('head', {
      element(el) {
        inHead = true;
        el.onEndTag(() => {
          inHead = false;
        });
      },
    })
    .on('body', {
      element(el) {
        inHead = false;
        const c = el.getAttribute('class');
        if (c) classBuf += ' ' + c.slice(0, 500);
        pf.bodyClass = (c || '').slice(0, 500);
        const id = el.getAttribute('id');
        if (id) classBuf += ' #' + id.slice(0, 100);
      },
    })
    .on('title', {
      text(t) {
        if (inHead && skipDepth === 0 && title.length < 1000) title += t.text;
      },
    })
    .on('meta', {
      element(el) {
        const name = (el.getAttribute('name') || '').toLowerCase().trim();
        const prop = (el.getAttribute('property') || '').toLowerCase().trim();
        const content = (el.getAttribute('content') || '').trim();
        if (el.getAttribute('charset')) f.charset = true;
        const httpEquiv = (el.getAttribute('http-equiv') || '').toLowerCase();
        if (httpEquiv === 'content-type' && /charset=/i.test(content)) f.charset = true;
        if (name === 'description' && !f.metaDescription) f.metaDescription = decodeEntities(content).slice(0, 1000);
        else if (name === 'robots' || name === 'googlebot') f.metaRobots = (f.metaRobots ? f.metaRobots + ', ' : '') + content.toLowerCase();
        else if (name === 'viewport') f.viewport = true;
        else if (name === 'generator' && !f.generator) f.generator = content.slice(0, 200);
        else if (name === 'author' || name === 'article:author') f.bylineLike = true;
        else if (name.startsWith('twitter:')) f.twitter[name.slice(8)] = content.slice(0, 300);
        if (prop.startsWith('og:')) f.og[prop.slice(3)] = decodeEntities(content).slice(0, 500);
        else if (prop.startsWith('product:') && Object.keys(pf.meta).length < 40) pf.meta[prop.slice(8)] = decodeEntities(content).slice(0, 200);
        else if (prop === 'article:published_time' || prop === 'article:modified_time') f.dateLike = true;
        else if (prop === 'article:author') f.bylineLike = true;
      },
    })
    .on('link', {
      element(el) {
        const rel = (el.getAttribute('rel') || '').toLowerCase().split(/\s+/);
        const href = (el.getAttribute('href') || '').trim();
        if (rel.includes('canonical') && !f.canonical) f.canonical = href.slice(0, 1000);
        if (rel.includes('alternate')) {
          const hl = (el.getAttribute('hreflang') || '').trim();
          if (hl && f.hreflang.length < 100) f.hreflang.push({ lang: hl, href: href.slice(0, 500) });
        }
        if (rel.includes('icon') || rel.includes('apple-touch-icon')) f.favicon = true;
        if (rel.includes('stylesheet')) f.stylesheets += 1;
        if (rel.includes('preload') && (el.getAttribute('as') || '').toLowerCase() === 'font') f.preloadFonts += 1;
        if (rel.includes('author')) f.bylineLike = true;
        if (href && f.scriptSrcSample.length < 60 && rel.includes('stylesheet')) f.scriptSrcSample.push('css:' + href.slice(0, 200));
      },
    })
    .on('script', {
      element(el) {
        const src = el.getAttribute('src');
        const type = (el.getAttribute('type') || '').toLowerCase().trim();
        // One onEndTag per element: a later registration replaces an earlier one, so skip tracking lives here too.
        skipDepth += 1;
        if (type === 'application/ld+json') {
          jsonBuf = '';
          inJsonLd = true;
          el.onEndTag(() => {
            jsonBlocks.push(jsonBuf);
            jsonBuf = '';
            inJsonLd = false;
            skipDepth = Math.max(0, skipDepth - 1);
          });
          return;
        }
        el.onEndTag(() => {
          skipDepth = Math.max(0, skipDepth - 1);
        });
        f.scripts.total += 1;
        if (src) {
          f.scripts.external += 1;
          if (f.scriptSrcSample.length < 60) f.scriptSrcSample.push(src.slice(0, 200));
          const isModule = type === 'module';
          const deferred = el.hasAttribute('defer') || el.hasAttribute('async') || isModule;
          if (inHead && !deferred) f.scripts.blocking += 1;
        } else {
          f.scripts.inline += 1;
        }
      },
      text(t) {
        if (inJsonLd && jsonBuf.length < 200_000) jsonBuf += t.text;
      },
    })
    .on('h1,h2,h3,h4,h5,h6', {
      element(el) {
        headingLevel = Number(el.tagName[1]);
        headingBuf = '';
        el.onEndTag(() => {
          const text = decodeEntities(headingBuf).replace(/\s+/g, ' ').trim().slice(0, 300);
          if (f.headings.length < 400) f.headings.push({ level: headingLevel, text });
          if (headingLevel === 1) f.h1.push(text);
          if (/\b(faq|frequently asked|questions)\b/i.test(text)) faqHits += 2;
          headingBuf = '';
        });
      },
      text(t) {
        if (skipDepth === 0) headingBuf += t.text;
      },
    })
    .on(GALLERY_SEL, {
      element(el) {
        pf.gallery.total += 1;
        const alt = el.getAttribute('alt');
        if (alt !== null && alt.trim().length > 0) pf.gallery.withAlt += 1;
      },
    })
    .on('form[action*="cart"],form[action*="basket"],form[action*="checkout"],button[name="add"],button[name="add-to-cart"],input[name="add-to-cart"],button[id*="addtocart"],button[id*="add-to-cart"],button[class*="add-to-cart"],button[class*="addtocart"],button[class*="product-form__submit"],[data-action="add-to-cart"],.single_add_to_cart_button,#product-addtocart-button', {
      element() {
        pf.addToCart = true;
      },
    })
    .on('button,input[type="submit"],a[class*="cart"]', {
      element(el) {
        const label = `${el.getAttribute('name') || ''} ${el.getAttribute('value') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('class') || ''} ${el.getAttribute('data-action') || ''}`;
        if (CART_RE.test(label)) pf.addToCart = true;
      },
      text(t) {
        if (CART_RE.test(t.text)) pf.addToCart = true;
      },
    })
    .on('select,input[type="radio"],fieldset[class*="variant"],[class*="variations_form"],[class*="swatch-opt"],[class*="product-form__input"]', {
      element(el) {
        const label = `${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('class') || ''} ${el.getAttribute('data-option') || ''}`;
        if (VARIANT_RE.test(label) || el.tagName === 'fieldset' || el.tagName === 'div' || el.tagName === 'form') pf.variantInputs += 1;
      },
    })
    .on('[class*="review"],[class*="rating"],[id*="review"],[class*="jdgm"],[class*="yotpo"],[class*="okendo"],[class*="loox"],[class*="stamped"],[class*="spr-"]', {
      element() {
        reviewClassHit = true;
      },
    })
    .on('img', {
      element(el) {
        f.images.total += 1;
        const alt = el.getAttribute('alt');
        if (alt !== null && alt.trim().length > 0) f.images.withAlt += 1;
        if (!inHead && pf.firstImages.total < 3) {
          pf.firstImages.total += 1;
          if (alt !== null && alt.trim().length > 0) pf.firstImages.withAlt += 1;
        }
        if ((el.getAttribute('loading') || '').toLowerCase() === 'lazy') f.images.lazy += 1;
        const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
        const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset') || '';
        if (srcset) f.images.srcset += 1;
        if (MODERN_IMG_RE.test(src) || MODERN_IMG_RE.test(srcset) || /format=(webp|avif)|f_auto|fm=webp|fm=avif/i.test(src + srcset)) f.images.modern += 1;
      },
    })
    .on('source', {
      element(el) {
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'image/webp' || type === 'image/avif') f.images.modern += 1;
      },
    })
    .on('a[href]', {
      element(el) {
        const href = (el.getAttribute('href') || '').trim();
        if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) return;
        const rel = (el.getAttribute('rel') || '').toLowerCase();
        if (rel.includes('nofollow')) f.links.nofollow += 1;
        let u: URL | null = null;
        try {
          u = new URL(href, base);
        } catch {
          return;
        }
        const host = u.hostname.replace(/^www\./, '');
        if (host === baseHost) {
          f.links.internal += 1;
          if (f.links.sample.length < 300) f.links.sample.push(u.pathname + u.search);
        } else {
          f.links.external += 1;
        }
        if (rel.includes('author')) f.bylineLike = true;
      },
    })
    .on('main', {
      element(el) {
        f.hasMain = true;
        inMain = true;
        el.onEndTag(() => {
          inMain = false;
        });
      },
    })
    .on('noscript', {
      element() {
        f.hasNoscript = true;
      },
    })
    .on('[itemtype]', {
      element(el) {
        const t = el.getAttribute('itemtype') || '';
        const name = t.split('/').pop() || '';
        if (name && f.microdataTypes.length < 50 && !f.microdataTypes.includes(name)) f.microdataTypes.push(name);
      },
    })
    .on('time[datetime],[itemprop="datePublished"],[itemprop="dateModified"]', {
      element() {
        f.dateLike = true;
      },
    })
    .on('[class*="byline"],[class*="author"],[rel="author"],[itemprop="author"]', {
      element() {
        f.bylineLike = true;
      },
    })
    .on('[class*="faq"],[id*="faq"],details', {
      element() {
        faqHits += 1;
      },
    })
    .on('div,section,header,footer,nav,article', {
      element(el) {
        if (classBuf.length < 3000) {
          const c = el.getAttribute('class');
          if (c) classBuf += ' ' + c.slice(0, 200);
          const id = el.getAttribute('id');
          if (id) classBuf += ' #' + id.slice(0, 100);
        }
      },
    })
    .on('style,noscript,template,svg,iframe', {
      element(el) {
        skipDepth += 1;
        el.onEndTag(() => {
          skipDepth = Math.max(0, skipDepth - 1);
        });
      },
    })
    .on('body', {
      text(t) {
        if (skipDepth > 0) return;
        const w = words(t.text);
        if (w) {
          textWordCount += w;
          if (inMain) mainWordCount += w;
        }
        addText(t.text);
      },
    });

  const res = rewriter.transform(new Response(html, { headers: { 'content-type': 'text/html' } }));
  await res.arrayBuffer();

  f.title = decodeEntities(title).replace(/\s+/g, ' ').trim().slice(0, 500);
  f.textWords = textWordCount;
  f.bodyWords = mainWordCount || textWordCount;
  f.faqLike = faqHits >= 2;
  f.classSample = classBuf.trim().slice(0, 3000);
  pf.text = decodeEntities(textBuf).replace(/\s+/g, ' ').trim();
  pf.reviewSignals = reviewClassHit || /\b(\d+\s+)?(customer )?reviews?\b|\brated\b|\bout of 5\b|[★☆]/i.test(pf.text) || REVIEW_CLASS_RE.test(classBuf);
  // Cheap whole-document signature scan (native indexOf) so CMS detection is not limited to the head.
  const found: string[] = [];
  for (const tok of SIG_TOKENS) if (html.indexOf(tok) !== -1) found.push(tok);
  f.htmlSample = html.slice(0, 6000) + (found.length ? '\n<!-- sigs: ' + found.join(' ') + ' -->' : '');
  for (const block of jsonBlocks) {
    const cleaned = block.trim().replace(/^<!--|-->$/g, '').trim();
    if (!cleaned) continue;
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) f.jsonld.push(...parsed);
      else f.jsonld.push(parsed);
    } catch {
      f.jsonldErrors += 1;
    }
  }
  void SKIP_TAGS;
  return f;
}

/** Flatten JSON-LD graphs into a list of typed nodes. */
export function flattenJsonLd(blocks: unknown[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj['@type']) out.push(obj);
    if (Array.isArray(obj['@graph'])) (obj['@graph'] as unknown[]).forEach((n) => visit(n, depth + 1));
    for (const k of ['mainEntity', 'itemListElement', 'offers', 'hasPart', 'publisher', 'author', 'mainEntityOfPage', 'about']) {
      if (obj[k] && typeof obj[k] === 'object') visit(obj[k], depth + 1);
    }
  };
  blocks.forEach((b) => visit(b, 0));
  return out;
}

export function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x) => typeof x === 'string') as string[];
  return [];
}

export function findType(nodes: Array<Record<string, unknown>>, ...names: string[]): Record<string, unknown> | undefined {
  const wanted = names.map((n) => n.toLowerCase());
  return nodes.find((n) => typesOf(n).some((t) => wanted.includes(t.toLowerCase())));
}
