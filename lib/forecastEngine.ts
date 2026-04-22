// ─── Forecast Engine ──────────────────────────────────────────────────────────
// Budget allocation and forecast math.
// Import from here in any page that needs enrichment or country forecasts.

import type { ProjectAssumptions } from "@/lib/projectStore";
import type { Keyword, EnrichedKeyword, CountryForecast, PriorityLevel, MatchType } from "@/lib/keywordEngine";
import { SQL_RATE } from "@/lib/keywordEngine";

// ─── Enrich options ───────────────────────────────────────────────────────────

export interface EnrichOpts {
  matchMods?: Record<MatchType, { cpcFactor: number; cvrFactor: number; label?: string }>;
  brandCvrUplift?: number;
  competitorCvrDiscount?: number;
  cpcMultiplier?: number;
}

// ─── Match type forecast modifiers ───────────────────────────────────────────
// Broad: cheaper clicks but lower intent → lower CVR per click
// Phrase: baseline (all factors × 1.0)
// Exact: higher effective CPC (more competition for precise queries) but stronger CVR
// Edit these constants to tune the forecast sensitivity to match type.

export const MATCH_TYPE_MODIFIERS: Record<MatchType, {
  cpcFactor: number; // multiplied against effectiveCpc — higher = fewer clicks per dollar
  cvrFactor: number; // multiplied against lpConversionRate — higher = more leads per click
  label:     string;
}> = {
  Broad:  { cpcFactor: 0.85, cvrFactor: 0.75, label: "High reach, lower intent" },
  Phrase: { cpcFactor: 1.00, cvrFactor: 1.00, label: "Balanced reach & intent"  },
  Exact:  { cpcFactor: 1.15, cvrFactor: 1.25, label: "Precise intent, lower volume" },
};

// ─── Budget allocation ────────────────────────────────────────────────────────
// Buy keywords receive 85% of total budget (proportional to opportunity score).
// Test keywords share the remaining 15%.
// "No" keywords receive $0.

export function allocateBudgets(
  inScope: Keyword[],
  totalBudget: number,
): Map<number, number> {
  const buyKws  = inScope.filter((k) => k.action === "Buy");
  const testKws = inScope.filter((k) => k.action === "Test");

  const hasBuy  = buyKws.length  > 0;
  const hasTest = testKws.length > 0;

  const buyRatio  = hasBuy  ? (hasTest ? 0.85 : 1.0) : 0;
  const testRatio = hasTest ? (hasBuy  ? 0.15 : 1.0) : 0;

  const buyScoreSum  = buyKws.reduce((s, k)  => s + k.opportunityScore, 0);
  const testScoreSum = testKws.reduce((s, k) => s + k.opportunityScore, 0);

  const map = new Map<number, number>();

  for (const kw of inScope) {
    let budget = 0;
    if (kw.action === "Buy"  && buyScoreSum  > 0) {
      budget = Math.round((kw.opportunityScore / buyScoreSum)  * totalBudget * buyRatio);
    } else if (kw.action === "Test" && testScoreSum > 0) {
      budget = Math.round((kw.opportunityScore / testScoreSum) * totalBudget * testRatio);
    }
    map.set(kw.id, budget);
  }

  return map;
}

// ─── Per-keyword enrichment ───────────────────────────────────────────────────

export function enrichKeyword(
  kw: Keyword,
  budgetMap: Map<number, number>,
  assumptions: ProjectAssumptions,
  opts?: EnrichOpts,
): EnrichedKeyword {
  const budget = budgetMap.get(kw.id) ?? 0;

  const pressureScore   = kw.competitorPressureScore ?? 50;
  const pressurePremium = 1 + Math.max(0, (pressureScore - 50) / 100) * 0.18;

  const resolvedMatchType = ((kw as { effectiveMatchType?: string }).effectiveMatchType ?? kw.matchType) as MatchType;
  const modTable = opts?.matchMods ?? MATCH_TYPE_MODIFIERS;
  const matchMod = modTable[resolvedMatchType] ?? modTable.Phrase;

  const cpcMultiplier = opts?.cpcMultiplier ?? 1.0;
  const effectiveCpc = kw.suggestedCpc * pressurePremium * matchMod.cpcFactor * cpcMultiplier;
  const clicks = kw.action === "No" || budget === 0 ? 0 : Math.floor(budget / effectiveCpc);

  const category = (kw as { category?: string }).category ?? "";
  let cvrMult = matchMod.cvrFactor;
  if (category === "brand"      && opts?.brandCvrUplift        != null) cvrMult *= opts.brandCvrUplift;
  if (category === "competitor" && opts?.competitorCvrDiscount != null) cvrMult *= opts.competitorCvrDiscount;

  const leads   = Math.round(clicks * (assumptions.lpConversionRate / 100) * cvrMult);
  const cpl     = leads > 0 ? Math.round(budget / leads) : 0;
  const revenue = Math.round(leads * (assumptions.closeRate / 100) * assumptions.avgDealSize);

  return {
    ...kw,
    suggestedMonthlyBudget: budget,
    estimatedClicks:        clicks,
    estimatedLeads:         leads,
    estimatedCpl:           cpl,
    revenuePotential:       revenue,
  };
}

export function enrich(
  kws: Keyword[],
  budgetMap: Map<number, number>,
  assumptions: ProjectAssumptions,
  opts?: EnrichOpts,
): EnrichedKeyword[] {
  return kws.map((kw) => enrichKeyword(kw, budgetMap, assumptions, opts));
}

// ─── Priority recommendation ──────────────────────────────────────────────────

export function getPriority(
  leads: number,
  revenue: number,
  totalLeads: number,
  totalRevenue: number,
): PriorityLevel {
  if (leads === 0 || revenue === 0) return "Low Priority";
  const revShare  = totalRevenue > 0 ? revenue / totalRevenue : 0;
  const leadShare = totalLeads   > 0 ? leads   / totalLeads   : 0;
  if (revShare >= 0.30 || leadShare >= 0.35) return "High Priority";
  if (revShare >= 0.10 || leads >= 1)        return "Test Market";
  return "Low Priority";
}

// ─── Country-level aggregation ────────────────────────────────────────────────

export function buildCountryForecasts(
  inScope: Keyword[],
  budgetMap: Map<number, number>,
  assumptions: ProjectAssumptions,
  totalRevenue: number,
  totalLeads: number,
  sqlRate?: number,
): CountryForecast[] {
  const resolvedSqlRate = sqlRate ?? SQL_RATE;
  const seen = new Set<string>();
  const countries = inScope
    .map((k) => k.country)
    .filter((c) => { if (seen.has(c)) return false; seen.add(c); return true; });

  return countries.map((country) => {
    const kws = inScope.filter((k) => k.country === country && k.action !== "No");

    let budget = 0, buyBudget = 0, testBudget = 0, clicks = 0, leads = 0;

    for (const kw of kws) {
      const b = budgetMap.get(kw.id) ?? 0;
      const c = b > 0 ? Math.floor(b / kw.suggestedCpc) : 0;
      const l = Math.round(c * (assumptions.lpConversionRate / 100));
      budget += b;
      if (kw.action === "Buy")  buyBudget  += b;
      if (kw.action === "Test") testBudget += b;
      clicks += c;
      leads  += l;
    }

    const cpl     = leads > 0 ? Math.round(budget / leads) : 0;
    const sql     = Math.round(leads * resolvedSqlRate);
    const deals   = Math.round(leads * (assumptions.closeRate / 100));
    const revenue = deals * assumptions.avgDealSize;
    const priority = getPriority(leads, revenue, totalLeads, totalRevenue);

    return { country, budget, buyBudget, testBudget, clicks, leads, cpl, sql, deals, revenue, priority };
  });
}
