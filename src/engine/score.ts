import type { CategoryScore, Finding, SiteCategory } from './types';
import { CATEGORY_LABELS, CATEGORY_WEIGHTS } from './checks';

export const EARN: Record<string, number> = { pass: 1, warn: 0.5, fail: 0, info: 1, skip: 1 };

export function scoreFindings(findings: Finding[]): { score: number; grade: string; categories: CategoryScore[] } {
  const cats: CategoryScore[] = [];
  let weighted = 0;
  let totalWeight = 0;
  for (const id of Object.keys(CATEGORY_WEIGHTS) as SiteCategory[]) {
    const fs = findings.filter((f) => f.category === id && f.status !== 'info' && f.status !== 'skip');
    const possible = fs.reduce((a, f) => a + f.weight, 0);
    const earned = fs.reduce((a, f) => a + f.weight * EARN[f.status], 0);
    const score = possible ? Math.round((earned / possible) * 100) : 0;
    cats.push({ id, label: CATEGORY_LABELS[id], score, earned, possible, weight: CATEGORY_WEIGHTS[id] });
    if (possible) {
      weighted += score * CATEGORY_WEIGHTS[id];
      totalWeight += CATEGORY_WEIGHTS[id];
    }
  }
  let score = totalWeight ? Math.round(weighted / totalWeight) : 0;
  // Hard caps: an unreachable or noindexed homepage cannot score well whatever else is right.
  if (findings.some((f) => f.id === 'home_reachable' && f.status === 'fail')) score = 0;
  else if (findings.some((f) => (f.id === 'noindex' || f.id === 'robots_blocking') && f.status === 'fail')) score = Math.min(score, 35);
  return { score, grade: grade(score), categories: cats };
}

export function grade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'E';
}

/** The three findings most worth fixing first: fails before warns, heavier weight first, crawl and AI before cosmetics. */
export function topFindings(findings: Finding[], n = 3): Finding[] {
  const rank: Record<string, number> = { fail: 2, warn: 1 };
  const catBoost: Record<string, number> = { crawl: 1.2, ai: 1.1, schema: 1.0, onpage: 0.9, speed: 0.8, paccess: 1.1, pdata: 1.0, pread: 1.0, ptags: 0.9, pplatform: 0.9 };
  return findings
    .filter((f) => f.status === 'fail' || f.status === 'warn')
    .sort((a, b) => rank[b.status] * b.weight * (catBoost[b.category] ?? 1) - rank[a.status] * a.weight * (catBoost[a.category] ?? 1))
    .slice(0, n);
}
