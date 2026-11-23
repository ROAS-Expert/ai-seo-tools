// Profit margin calculator for /profit-margin-calculator. Pure, unit-tested.
// One product, one order: what you keep after product cost, shipping, fees, returns and the ad cost to win the order.

export interface MarginInput {
  price: number;        // selling price before discount
  discountPct: number;  // average discount, 0..1
  cost: number;         // product cost (landed: unit, inbound freight, duties)
  shipping: number;     // what you pay to ship and pack one order (net of any shipping the customer pays)
  feePct: number;       // payment fee, 0..1
  feeFixed: number;     // payment fee per order
  platformPct: number;  // marketplace or platform fee, 0..1
  returnsPct: number;   // revenue lost to returns and refunds, 0..1
  cpa: number;          // ad cost per order
  targetPct: number;    // net margin you want after ads, 0..1
}

export interface MarginResult {
  netPrice: number;
  grossProfit: number;
  grossMarginPct: number | null;
  markupPct: number | null;
  fees: number;
  returns: number;
  contribution: number;          // after cost, shipping, fees and returns, before ads
  contributionPct: number | null;
  profit: number;                // after ads
  profitPct: number | null;
  breakEvenRoas: number | null;  // net price / contribution
  maxCpa: number;                // the ad cost per order at which profit is zero
  priceForTarget: number | null; // selling price (before discount) that hits targetPct at this cpa
  lines: Array<{ label: string; value: number }>;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function marginCalc(i: MarginInput): MarginResult {
  const net = i.price * (1 - i.discountPct);
  const fees = net * i.feePct + i.feeFixed + net * i.platformPct;
  const returns = net * i.returnsPct;
  const gross = net - i.cost;
  const contribution = net - i.cost - i.shipping - fees - returns;
  const profit = contribution - i.cpa;
  const share = 1 - i.discountPct;
  const denom = share * (1 - i.feePct - i.platformPct - i.returnsPct - i.targetPct);
  const priceForTarget = denom > 0 ? (i.cost + i.shipping + i.feeFixed + i.cpa) / denom : null;
  return {
    netPrice: r2(net),
    grossProfit: r2(gross),
    grossMarginPct: net > 0 ? gross / net : null,
    markupPct: i.cost > 0 ? gross / i.cost : null,
    fees: r2(fees),
    returns: r2(returns),
    contribution: r2(contribution),
    contributionPct: net > 0 ? contribution / net : null,
    profit: r2(profit),
    profitPct: net > 0 ? profit / net : null,
    breakEvenRoas: contribution > 0 ? Math.round((net / contribution) * 100) / 100 : null,
    maxCpa: r2(Math.max(0, contribution)),
    priceForTarget: priceForTarget === null ? null : r2(priceForTarget),
    lines: [
      { label: 'Price after discount', value: r2(net) },
      { label: 'Product cost', value: -r2(i.cost) },
      { label: 'Shipping and packing', value: -r2(i.shipping) },
      { label: 'Payment and platform fees', value: -r2(fees) },
      { label: 'Returns', value: -r2(returns) },
      { label: 'Ad cost per order', value: -r2(i.cpa) },
      { label: 'Profit per order', value: r2(profit) },
    ],
  };
}
