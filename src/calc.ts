// Pure calculators for /mer-calculator and /cac-payback. No DOM, no network, fully unit-tested.

export interface MerInput {
  revenue: number;        // period revenue, currency units
  spend: number;          // total marketing spend in the period (ads, agency, tools, creative)
  cogsPct: number;        // cost of goods as a share of revenue, 0..1
  shippingPct: number;    // shipping and fulfilment as a share of revenue, 0..1
  feesPct: number;        // payment and platform fees, 0..1
  returnsPct: number;     // returns and refunds, 0..1
  aov: number;            // average order value
  newSharePct: number;    // share of revenue from first orders, 0..1
  targetMarginPct: number; // the net margin after marketing you want, 0..1
}

export interface MerResult {
  mer: number | null;                 // revenue / spend
  cmPct: number;                      // contribution margin before marketing, as a share of revenue
  cmValue: number;                    // contribution before marketing, currency
  profitAfterMarketing: number;       // cmValue - spend
  netMarginPct: number;               // profitAfterMarketing / revenue
  breakEvenRoas: number | null;       // 1 / cmPct: the ROAS at which a campaign adds nothing
  requiredMer: number | null;         // MER needed for targetMarginPct
  orders: number;                     // revenue / aov
  cmPerOrder: number;
  marketingPerOrder: number;
  profitPerOrder: number;
  newOrders: number;                  // orders from first-time buyers (newSharePct of revenue / aov)
  cacIfAllAcquisition: number | null; // spend / newOrders
  waterfall: Array<{ label: string; value: number; kind: 'in' | 'cost' | 'spend' | 'out' }>;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

export function merCalc(i: MerInput): MerResult {
  const revenue = pos(i.revenue), spend = pos(i.spend), aov = pos(i.aov);
  const cogs = clamp01(i.cogsPct), ship = clamp01(i.shippingPct), fees = clamp01(i.feesPct), ret = clamp01(i.returnsPct);
  const newShare = clamp01(i.newSharePct), target = clamp01(i.targetMarginPct);
  const cmPct = Math.max(0, 1 - cogs - ship - fees - ret);
  const cmValue = revenue * cmPct;
  const profitAfterMarketing = cmValue - spend;
  const orders = aov > 0 ? revenue / aov : 0;
  const newOrders = orders * newShare;
  const denom = cmPct - target;
  return {
    mer: spend > 0 ? +(revenue / spend).toFixed(2) : null,
    cmPct: +cmPct.toFixed(4),
    cmValue: +cmValue.toFixed(2),
    profitAfterMarketing: +profitAfterMarketing.toFixed(2),
    netMarginPct: revenue > 0 ? +(profitAfterMarketing / revenue).toFixed(4) : 0,
    breakEvenRoas: cmPct > 0 ? +(1 / cmPct).toFixed(2) : null,
    requiredMer: denom > 0 ? +(1 / denom).toFixed(2) : null,
    orders: +orders.toFixed(1),
    cmPerOrder: +(aov * cmPct).toFixed(2),
    marketingPerOrder: orders > 0 ? +(spend / orders).toFixed(2) : 0,
    profitPerOrder: orders > 0 ? +((cmValue - spend) / orders).toFixed(2) : 0,
    newOrders: +newOrders.toFixed(1),
    cacIfAllAcquisition: newOrders > 0 && spend > 0 ? +(spend / newOrders).toFixed(2) : null,
    waterfall: [
      { label: 'Revenue', value: revenue, kind: 'in' },
      { label: 'Product cost', value: -revenue * cogs, kind: 'cost' },
      { label: 'Shipping', value: -revenue * ship, kind: 'cost' },
      { label: 'Fees', value: -revenue * fees, kind: 'cost' },
      { label: 'Returns', value: -revenue * ret, kind: 'cost' },
      { label: 'Marketing', value: -spend, kind: 'spend' },
      { label: 'What you keep', value: profitAfterMarketing, kind: 'out' },
    ],
  };
}

export interface CacInput {
  cac: number;            // fully loaded cost to win one customer
  arpa: number;           // monthly revenue per account
  grossMarginPct: number; // 0..1
  churnPct: number;       // monthly logo churn, 0..1
  expansionPct: number;   // monthly net revenue expansion on surviving accounts, 0..1 (can be 0)
  horizonMonths?: number; // default 36
}

export interface CacResult {
  simplePaybackMonths: number | null;   // CAC / (ARPA * margin), ignores churn
  paybackMonths: number | null;         // first month where expected cumulative contribution covers CAC, with churn and expansion; null if never within 120 months
  ltv: number | null;                   // expected lifetime contribution per customer (120-month cap)
  ltvToCac: number | null;
  monthlyContribution: number;          // ARPA * margin in month 1
  expectedLifetimeMonths: number | null; // 1 / churn, capped at 120
  curve: Array<{ month: number; cumulative: number; survival: number }>; // 0..horizon, expected per acquired customer
}

export function cacCalc(i: CacInput): CacResult {
  const cac = pos(i.cac), arpa = pos(i.arpa);
  const margin = clamp01(i.grossMarginPct), churn = clamp01(i.churnPct), exp = Math.max(0, Number.isFinite(i.expansionPct) ? i.expansionPct : 0);
  const horizon = Math.min(120, Math.max(12, Math.round(i.horizonMonths || 36)));
  const m1 = arpa * margin;
  const curve: CacResult['curve'] = [{ month: 0, cumulative: 0, survival: 1 }];
  let cumulative = 0;
  let payback: number | null = null;
  let ltv = 0;
  for (let k = 1; k <= 120; k++) {
    const survival = Math.pow(1 - churn, k - 1);
    const contrib = m1 * Math.pow(1 + exp, k - 1) * survival;
    cumulative += contrib;
    ltv += contrib;
    if (payback === null && cac > 0 && cumulative >= cac) payback = k;
    if (k <= horizon) curve.push({ month: k, cumulative: +cumulative.toFixed(2), survival: +survival.toFixed(4) });
  }
  return {
    simplePaybackMonths: m1 > 0 && cac > 0 ? +(cac / m1).toFixed(1) : null,
    paybackMonths: payback,
    ltv: m1 > 0 ? +ltv.toFixed(2) : null,
    ltvToCac: m1 > 0 && cac > 0 ? +(ltv / cac).toFixed(2) : null,
    monthlyContribution: +m1.toFixed(2),
    expectedLifetimeMonths: churn > 0 ? +Math.min(120, 1 / churn).toFixed(1) : 120,
    curve,
  };
}

/** Round-trips calculator inputs through a query string so results are shareable. Only numbers, only known keys. */
export function encodeParams(obj: Record<string, number>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (Number.isFinite(v)) p.set(k, String(+v.toFixed(4)));
  return p.toString();
}

export function decodeParams<T extends Record<string, number>>(qs: string, defaults: T): T {
  const p = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
  const out = { ...defaults } as Record<string, number>;
  for (const k of Object.keys(defaults)) {
    const raw = p.get(k);
    if (raw === null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out as T;
}

export function money(n: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2, minimumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);
  } catch {
    return (currency === 'USD' ? '$' : currency + ' ') + n.toFixed(2);
  }
}
