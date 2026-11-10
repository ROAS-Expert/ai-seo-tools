export type Status = 'pass' | 'warn' | 'fail' | 'info' | 'skip';
export type SiteCategory = 'crawl' | 'onpage' | 'schema' | 'ai' | 'speed';
/** Product page mode groups its checks differently: structured data, readable without JavaScript, crawler access, page tags, platform extras. */
export type ProductCategory = 'pdata' | 'pread' | 'paccess' | 'ptags' | 'pplatform';
export type Category = SiteCategory | ProductCategory;

export interface Finding {
  id: string;
  category: Category;
  label: string;
  status: Status;
  weight: number;
  detail: string;
  evidence?: string;
  fix?: string;
  /** Fraction of the weight earned when it is not the plain pass 1, warn 0.5, fail 0 (pro rata checks). */
  earned?: number;
}

export interface CategoryScore {
  id: Category;
  label: string;
  score: number;
  earned: number;
  possible: number;
  weight: number;
}

export interface CmsResult {
  id: string;
  name: string;
  ecommerce: boolean;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

export interface PageFacts {
  url: string;
  finalUrl: string;
  status: number;
  redirects: number;
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  truncated: boolean;
  blocked?: string;
  headers: Record<string, string>;
  html: {
    title: string;
    metaDescription: string;
    metaRobots: string;
    canonical: string;
    lang: string;
    viewport: boolean;
    favicon: boolean;
    charset: boolean;
    generator: string;
    h1: string[];
    headings: Array<{ level: number; text: string }>;
    images: { total: number; withAlt: number; lazy: number; modern: number; srcset: number };
    scripts: { total: number; external: number; blocking: number; inline: number };
    stylesheets: number;
    preloadFonts: number;
    og: Record<string, string>;
    twitter: Record<string, string>;
    hreflang: Array<{ lang: string; href: string }>;
    jsonld: unknown[];
    jsonldErrors: number;
    microdataTypes: string[];
    links: { internal: number; external: number; nofollow: number; sample: string[] };
    textWords: number;
    bodyWords: number;
    hasNoscript: boolean;
    hasMain: boolean;
    bylineLike: boolean;
    dateLike: boolean;
    faqLike: boolean;
    scriptSrcSample: string[];
    classSample: string;
    htmlSample: string;
    /** Signals the product page mode reads. Present on every page; cheap to collect. */
    product: ProductHtmlFacts;
  };
}

export interface ProductHtmlFacts {
  /** Visible text with scripts, styles and JSON-LD removed, capped. What a crawler that runs no JavaScript sees. */
  text: string;
  /** meta property="product:..." tags, keyed without the prefix (price:amount, price:currency). */
  meta: Record<string, string>;
  bodyClass: string;
  addToCart: boolean;
  variantInputs: number;
  reviewSignals: boolean;
  gallery: { total: number; withAlt: number };
  firstImages: { total: number; withAlt: number };
}

export type AnswerState = 'readable' | 'partly' | 'not';
export interface ProductAnswer {
  question: string;
  state: AnswerState;
  fields: Array<{ name: string; present: boolean }>;
  note: string;
}

export interface ProductFacts {
  requested: string;
  hostname: string;
  page: PageFacts | null;
  pageError?: string;
  robots: RobotsFacts | null;
  /** Shopify only: GET /products/<handle>.js */
  shopifyJson: { url: string; status: number; isJson: boolean; variants: number; hasPrice: boolean } | null;
  startedAt: string;
  durationMs: number;
}

export interface ProductDetection {
  isProduct: boolean;
  signals: string[];
  looked: string[];
}

export interface RobotsFacts {
  status: number;
  present: boolean;
  text: string;
  sitemaps: string[];
  groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }>;
}

export interface SitemapFacts {
  url: string;
  status: number;
  ok: boolean;
  isIndex: boolean;
  urlCount: number;
  childCount: number;
  sampleUrls: string[];
  error?: string;
}

export interface ProbeFacts {
  url: string;
  status: number;
  location?: string;
  redirects: number;
  finalUrl: string;
  error?: string;
}

export interface AuditInput {
  url: string;
}

export interface AuditFacts {
  requested: string;
  hostname: string;
  home: PageFacts | null;
  homeError?: string;
  httpProbe: ProbeFacts | null;
  altHostProbe: ProbeFacts | null;
  notFoundProbe: ProbeFacts | null;
  robots: RobotsFacts | null;
  sitemap: SitemapFacts | null;
  llmsTxt: { status: number; present: boolean; bytes: number } | null;
  keyPage: PageFacts | null;
  keyPageKind: 'product' | 'collection' | 'article' | 'page' | 'none';
  startedAt: string;
  durationMs: number;
}

export interface AuditReport {
  id: string;
  /** 'site' (default, older reports have no field) or 'product' for the product page mode. */
  kind?: 'site' | 'product';
  product?: {
    name: string;
    answers: ProductAnswer[];
    /** Signals that cannot be read from outside, named so the report is honest about them. */
    outside: string[];
    detection: string[];
  };
  version: string;
  url: string;
  hostname: string;
  cms: CmsResult;
  score: number;
  grade: string;
  categories: CategoryScore[];
  findings: Finding[];
  top: Finding[];
  summary: { source: 'gemini' | 'workers-ai' | 'rules'; text: string[]; notes?: string[] } | null;
  facts: {
    ttfbMs: number;
    bytes: number;
    status: number;
    finalUrl: string;
    title: string;
    jsonldTypes: string[];
    keyPageUrl: string | null;
    keyPageKind: string;
    sitemapUrls: number;
    aiBots: Record<string, 'allowed' | 'blocked' | 'partial'>;
  };
  unlocked: boolean;
  createdAt: string;
  durationMs: number;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
