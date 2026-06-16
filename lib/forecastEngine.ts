// ─── Forecast Engine ──────────────────────────────────────────────────────────
// SEMrush-style estimation pipeline:
//   impressions = searches × IS → clicks = impressions × CTR (position curve)
//   clicks = min(clicks, budget/CPC) → leads = clicks × CVR (intent-based)
//
// All intermediate values stay as floats. Math.round only at final output.

import type { ProjectAssumptions } from "@/lib/projectStore";
import type { Keyword, EnrichedKeyword, CountryForecast, PriorityLevel, MatchType, Intent } from "@/lib/keywordEngine";
import { SQL_RATE } from "@/lib/keywordEngine";
import { toPerfCategory } from "@/lib/historicalCalibration";

// ─── Enrich options ───────────────────────────────────────────────────────────

export interface EnrichOpts {
  matchMods?: Record<MatchType, { cpcFactor: number; cvrFactor: number; label?: string }>;
  brandCvrUplift?: number;
  competitorCvrDiscount?: number;
  cpcMultiplier?: number;
  // Scenario-level multipliers (default 1.0 = no-op)
  ctrMultiplier?: number;
  cvrMultiplier?: number;
  impShareMultiplier?: number;
  // Data-anchored CVR per perf category (brand/service/competitor/other).
  // When present, overrides the hardcoded category priors in computeEffectiveCvr.
  calibratedCvrByCategory?: Record<string, number>;
}

export type ConfidenceLevel = "High" | "Medium" | "Low";

// ─── CTR curve — position-based (SEMrush benchmarks) ─────────────────────────
// Index = position (1-based). Applied directly — no secondary caps.

const CTR_BY_POSITION: number[] = [
  0,      // 0 — unused
  0.28,   // 1
  0.15,   // 2
  0.10,   // 3
  0.07,   // 4
  0.05,   // 5
  0.04,   // 6
  0.03,   // 7
  0.025,  // 8
  0.02,   // 9
  0.015,  // 10
];

// ─── Intent CPC multipliers ───────────────────────────────────────────────────

const INTENT_CPC_MULT: Record<Intent, number> = {
  Transactional: 1.15,
  Commercial:    1.05,
  Navigational:  1.00,
  Informational: 0.90,
};

// ─── CVR ranges — intent/category benchmarks ─────────────────────────────────
// Used for clamping and UI display (keywords page debug strip).

export const CVR_RANGES: Record<string, { min: number; max: number; label: string }> = {
  brand:      { min: 0.10, max: 0.20, label: "10% – 20%" },
  highIntent: { min: 0.04, max: 0.08, label: "4% – 8%"   },
  pricing:    { min: 0.04, max: 0.08, label: "4% – 8%"   },
  local:      { min: 0.04, max: 0.08, label: "4% – 8%"   },
  competitor: { min: 0.03, max: 0.07, label: "3% – 7%"   },
  generic:    { min: 0.01, max: 0.03, label: "1% – 3%"   },
};

export const INTENT_CVR_RANGES: Record<Intent, { min: number; max: number; label: string }> = {
  Transactional: { min: 0.04,  max: 0.08,  label: "4% – 8%"       },
  Commercial:    { min: 0.03,  max: 0.07,  label: "3% – 7%"        },
  Navigational:  { min: 0.08,  max: 0.20,  label: "8% – 20%"       },
  Informational: { min: 0.005, max: 0.015, label: "0.5% – 1.5%"    },
};

// ─── CVR midpoints — intent-based starting point ──────────────────────────────
// Midpoint of each benchmark range. Scaled by user's LP CVR vs. 3.5% baseline.
// clamped to [range.min, range.max] after scaling.

const CVR_MIDPOINT: Record<string, number> = {
  brand:      0.15,  // 10–20%
  highIntent: 0.06,  // 4–8%
  pricing:    0.06,  // 4–8%
  local:      0.05,  // 4–8%
  competitor: 0.05,  // 3–7%
  generic:    0.02,  // 1–3%
};

const CVR_MIDPOINT_BY_INTENT: Record<Intent, number> = {
  Transactional: 0.06,   // 4–8%
  Commercial:    0.05,   // 3–7%
  Navigational:  0.12,   // brand-like
  Informational: 0.01,   // 0.5–1.5%
};

// Old CVR priors (from CVR_MIDPOINT) per perf-category, used to compute the
// calibration adjustment ratio in allocateBudgets.
const OLD_PRIOR_CVR_BY_PERF_CAT: Record<string, number> = {
  brand:      0.15,
  competitor: 0.05,
  service:    0.02,
  other:      0.02,
};

// ─── Match type forecast modifiers ───────────────────────────────────────────

export const MATCH_TYPE_MODIFIERS: Record<MatchType, {
  cpcFactor: number;
  cvrFactor: number;
  label:     string;
}> = {
  Broad:  { cpcFactor: 0.85, cvrFactor: 0.80, label: "High reach, lower intent"    },
  Phrase: { cpcFactor: 1.00, cvrFactor: 1.00, label: "Balanced reach & intent"      },
  Exact:  { cpcFactor: 1.15, cvrFactor: 1.10, label: "Precise intent, lower volume" },
};

// ─── B2B CPL floor ────────────────────────────────────────────────────────────
// Prevents lead counts that imply sub-market cost-per-lead for B2B accounts.

const B2B_MIN_CPL = 25;

// ─── LP CVR baseline (industry benchmark) ────────────────────────────────────
// User's project LP CVR is compared to this to scale intent midpoints up/down.

const LP_CVR_BASELINE = 3.5;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getCategory(kw: Keyword): string {
  return (kw as { campaignGroup?: string; category?: string }).campaignGroup
      ?? (kw as { category?: string }).category
      ?? "";
}

/**
 * Position estimator from pressure score.
 * Low pressure  (<33)  → positions 2–3
 * Medium        (33–65) → positions 4–5
 * High          (>65)  → positions 6–8
 */
function estimatePosition(pressureScore: number): number {
  if (pressureScore < 16) return 2;
  if (pressureScore < 33) return 3;
  if (pressureScore < 50) return 4;
  if (pressureScore < 66) return 5;
  if (pressureScore < 80) return 6;
  if (pressureScore < 90) return 7;
  return 8;
}

/**
 * Impression share based on competitive pressure.
 * Less competition → higher share of available impressions.
 */
function computeImpressionShare(pressureScore: number): number {
  if (pressureScore < 33) return 0.50;  // low competition
  if (pressureScore < 66) return 0.35;  // medium
  return 0.20;                           // high competition
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

/** Returns the CVR benchmark range for a keyword (used for tooltips and debug display). */
export function getCvrRange(kw: Keyword): { min: number; max: number; label: string } {
  const category = getCategory(kw);
  return CVR_RANGES[category] ?? INTENT_CVR_RANGES[kw.intent] ?? { min: 0.01, max: 0.05, label: "1% – 5%" };
}

/** Effective CPC: base bid × pressure premium × intent uplift × match type × multiplier. */
export function computeEffectiveCpc(
  kw: Keyword,
  resolvedMatchType: MatchType,
  matchMods: Record<MatchType, { cpcFactor: number; cvrFactor: number; label?: string }>,
  cpcMultiplier: number,
): number {
  const pressureScore   = kw.competitorPressureScore ?? 50;
  const pressurePremium = 1 + Math.max(0, (pressureScore - 50) / 200);
  const intentMult      = INTENT_CPC_MULT[kw.intent] ?? 1.0;
  const matchMod        = matchMods[resolvedMatchType] ?? matchMods.Phrase;
  return kw.suggestedCpc * pressurePremium * intentMult * matchMod.cpcFactor * cpcMultiplier;
}

/**
 * Intent-based CVR (SEMrush-style):
 *   1. Start from intent/category midpoint (not LP CVR)
 *   2. Scale ±50% based on user's LP CVR vs. 3.5% benchmark
 *   3. Apply match type CVR factor
 *   4. Clamp to benchmark range
 *
 * No competition penalty. No country factor. No stacking.
 */
export function computeEffectiveCvr(
  kw: Keyword,
  lpConversionRate: number,
  matchMod: { cvrFactor: number },
  calibratedCvrByCategory?: Record<string, number>,
): number {
  const category  = getCategory(kw);

  // ── Calibration override ──────────────────────────────────────────────────
  // If the project has historical actuals (passed in as a blended CVR map keyed
  // by perf category), use the data-anchored value as the starting point instead
  // of the hardcoded prior. This is what corrects the brand-vs-service inversion.
  // The map already blends actuals with priors by confidence, so it is NOT
  // re-clamped to the static benchmark range (which encodes the wrong priors).
  if (calibratedCvrByCategory) {
    const perfCat = toPerfCategory(category, kw.intent);
    const blended = calibratedCvrByCategory[perfCat];
    if (blended != null && blended > 0) {
      const lpScale = Math.min(2.0, Math.max(0.5, lpConversionRate / LP_CVR_BASELINE));
      const raw     = blended * lpScale * matchMod.cvrFactor;
      return Math.max(0.002, Math.min(0.30, raw));
    }
  }

  // ── Prior-based fallback (no calibration data) ────────────────────────────
  const midpoint  = CVR_MIDPOINT[category] ?? CVR_MIDPOINT_BY_INTENT[kw.intent] ?? 0.03;
  const lpScale   = Math.min(2.0, Math.max(0.5, lpConversionRate / LP_CVR_BASELINE));
  const range     = getCvrRange(kw);
  const raw       = midpoint * lpScale * matchMod.cvrFactor;
  return Math.max(range.min, Math.min(range.max, raw));
}

/** Confidence level for a keyword's forecast based on data richness. */
export function getConfidenceLevel(kw: Keyword): ConfidenceLevel {
  const p = kw.competitorPressureScore ?? 50;
  if (kw.monthlySearches >= 500 && kw.suggestedCpc > 0 && p > 10 && p < 90) return "High";
  if (kw.monthlySearches >= 100 && kw.suggestedCpc > 0) return "Medium";
  return "Low";
}

// ─── Budget allocation ────────────────────────────────────────────────────────

export function allocateBudgets(
  inScope: Keyword[],
  totalBudget: number,
  calibratedCvrByCategory?: Record<string, number>,
): Map<number, number> {
  const buyKws  = inScope.filter((k) => k.action === "Buy");
  const testKws = inScope.filter((k) => k.action === "Test");

  const hasBuy  = buyKws.length  > 0;
  const hasTest = testKws.length > 0;

  const buyRatio  = hasBuy  ? (hasTest ? 0.85 : 1.0) : 0;
  const testRatio = hasTest ? (hasBuy  ? 0.15 : 1.0) : 0;

  // When calibration data is present, scale each keyword's opportunity score by
  // (calibratedCVR / oldPriorCVR) so that keywords the data shows as high-CVR
  // (service/competitor) attract proportionally more budget than brand, whose
  // prior was 15% but actual is ~2.6%.
  function adjScore(kw: Keyword): number {
    if (!calibratedCvrByCategory) return kw.opportunityScore;
    const perfCat  = toPerfCategory(getCategory(kw), kw.intent);
    const calib    = calibratedCvrByCategory[perfCat];
    const oldPrior = OLD_PRIOR_CVR_BY_PERF_CAT[perfCat] ?? 0.03;
    if (!calib || calib <= 0) return kw.opportunityScore;
    const ratio = Math.min(5, Math.max(0.1, calib / oldPrior));
    return kw.opportunityScore * ratio;
  }

  const buyScoreSum  = buyKws.reduce((s, k)  => s + adjScore(k), 0);
  const testScoreSum = testKws.reduce((s, k) => s + adjScore(k), 0);

  const map = new Map<number, number>();

  for (const kw of inScope) {
    let budget = 0;
    if (kw.action === "Buy"  && buyScoreSum  > 0) {
      budget = Math.round((adjScore(kw) / buyScoreSum)  * totalBudget * buyRatio);
    } else if (kw.action === "Test" && testScoreSum > 0) {
      budget = Math.round((adjScore(kw) / testScoreSum) * totalBudget * testRatio);
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

  const resolvedMatchType = ((kw as { effectiveMatchType?: string }).effectiveMatchType ?? kw.matchType) as MatchType;
  const modTable  = opts?.matchMods ?? MATCH_TYPE_MODIFIERS;
  const matchMod  = modTable[resolvedMatchType] ?? modTable.Phrase;

  const cpcMultiplier = opts?.cpcMultiplier ?? 1.0;
  const effectiveCpc  = computeEffectiveCpc(kw, resolvedMatchType, modTable, cpcMultiplier);

  const pressureScore = kw.competitorPressureScore ?? 50;
  const position      = estimatePosition(pressureScore);

  // Scenario-level multipliers
  const ctrMult      = opts?.ctrMultiplier      ?? 1.0;
  const cvrMult      = opts?.cvrMultiplier      ?? 1.0;
  const isMultiplier = opts?.impShareMultiplier ?? 1.0;

  // ── Step 1: Impressions (float) ───────────────────────────────────────────
  const impShare    = Math.min(computeImpressionShare(pressureScore) * isMultiplier, 1.0);
  const impressions = kw.monthlySearches * impShare;  // float — no rounding

  // ── Step 2: CTR from position curve — no secondary caps (float) ──────────
  const baseCtr = CTR_BY_POSITION[position] ?? 0.025;
  const ctr     = baseCtr * ctrMult;                  // float — no floor, no cap

  // ── Step 3: Impression-limited clicks (float) ─────────────────────────────
  const impClicks = impressions * ctr;

  // ── Step 4: Budget-limited clicks (float — no Math.floor) ────────────────
  const maxClicks = budget > 0 && effectiveCpc > 0 ? budget / effectiveCpc : 0;

  // ── Step 5: Final clicks — smaller of impression and budget capacity ──────
  const rawClicks = kw.action === "No" || budget === 0 ? 0 : Math.min(impClicks, maxClicks);

  // ── Step 6: Intent-based CVR (float) ─────────────────────────────────────
  const baseCvr      = computeEffectiveCvr(kw, assumptions.lpConversionRate, matchMod, opts?.calibratedCvrByCategory);
  const effectiveCvr = Math.max(0.005, Math.min(baseCvr * cvrMult, 0.30));

  // ── Step 7: Raw leads (float) ─────────────────────────────────────────────
  const rawLeads = rawClicks * effectiveCvr;

  // ── Step 8: Guarantee — if clicks > 10, at least 1 lead ──────────────────
  const guaranteedLeads = rawClicks > 10 ? Math.max(rawLeads, 1) : rawLeads;

  // ── Step 9: CPL floor — B2B minimum cost per lead ────────────────────────
  const cplCap      = budget > 0 ? budget / B2B_MIN_CPL : Infinity;
  const finalLeads  = Math.min(guaranteedLeads, cplCap);

  // ── Round only at output ──────────────────────────────────────────────────
  const clicks = Math.round(rawClicks);
  const leads  = Math.round(finalLeads);

  const cpl     = leads > 0 ? Math.round(budget / leads) : 0;
  const revenue = Math.round(leads * (assumptions.closeRate / 100) * assumptions.avgDealSize);
  const roas    = budget > 0 ? Math.min(+(revenue / budget).toFixed(2), 50) : 0;

  return {
    ...kw,
    suggestedMonthlyBudget: budget,
    estimatedClicks:        clicks,
    estimatedLeads:         leads,
    estimatedCpl:           cpl,
    revenuePotential:       revenue,
    roas,
    estimatedImpressions:   Math.round(impressions),
    estimatedPosition:      position,
    impressionShare:        impShare,
    confidenceLevel:        getConfidenceLevel(kw),
    effectiveCpcFinal:      effectiveCpc,
    estimatedCtr:           ctr,
    estimatedCvr:           effectiveCvr,
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
  calibratedCvrByCategory?: Record<string, number>,
): CountryForecast[] {
  const resolvedSqlRate = sqlRate ?? SQL_RATE;
  const seen = new Set<string>();
  const countries = inScope
    .map((k) => k.country)
    .filter((c) => { if (seen.has(c)) return false; seen.add(c); return true; });

  return countries.map((country) => {
    const kws = inScope.filter((k) => k.country === country && k.action !== "No");

    let budget = 0, buyBudget = 0, testBudget = 0;
    let totalRawClicks = 0, totalFinalLeads = 0;

    for (const kw of kws) {
      const b = budgetMap.get(kw.id) ?? 0;

      const resolvedMatchType = ((kw as { effectiveMatchType?: string }).effectiveMatchType ?? kw.matchType) as MatchType;
      const matchMod     = MATCH_TYPE_MODIFIERS[resolvedMatchType] ?? MATCH_TYPE_MODIFIERS.Phrase;
      const effectiveCpc = computeEffectiveCpc(kw, resolvedMatchType, MATCH_TYPE_MODIFIERS, 1.0);

      const pressureScore = kw.competitorPressureScore ?? 50;
      const position      = estimatePosition(pressureScore);

      const impShare    = computeImpressionShare(pressureScore);
      const impressions = kw.monthlySearches * impShare;

      const ctr       = CTR_BY_POSITION[position] ?? 0.025;
      const impClicks = impressions * ctr;
      const maxClicks = b > 0 && effectiveCpc > 0 ? b / effectiveCpc : 0;
      const rawClicks = Math.min(impClicks, maxClicks);

      const effectiveCvr    = computeEffectiveCvr(kw, assumptions.lpConversionRate, matchMod, calibratedCvrByCategory);
      const rawLeads        = rawClicks * effectiveCvr;
      const guaranteedLeads = rawClicks > 10 ? Math.max(rawLeads, 1) : rawLeads;
      const cplCap          = b > 0 ? b / B2B_MIN_CPL : Infinity;
      const finalLeads      = Math.min(guaranteedLeads, cplCap);

      budget += b;
      if (kw.action === "Buy")  buyBudget  += b;
      if (kw.action === "Test") testBudget += b;
      totalRawClicks  += rawClicks;
      totalFinalLeads += finalLeads;
    }

    const clicks  = Math.round(totalRawClicks);
    const leads   = Math.round(totalFinalLeads);
    const cpl     = leads > 0 ? Math.round(budget / leads) : 0;
    const sql     = Math.round(leads * resolvedSqlRate);
    const deals   = Math.round(leads * (assumptions.closeRate / 100));
    const revenue = deals * assumptions.avgDealSize;
    const priority = getPriority(leads, revenue, totalLeads, totalRevenue);

    return { country, budget, buyBudget, testBudget, clicks, leads, cpl, sql, deals, revenue, priority };
  });
}

// ─── Scenario specs ───────────────────────────────────────────────────────────

export type ScenarioTone = "red" | "neutral" | "green";

export interface ScenarioSpec {
  id: "conservative" | "balanced" | "aggressive";
  name: string;
  case: string;
  description: string;
  ctrMultiplier: number;
  cvrMultiplier: number;
  cpcMultiplier: number;
  impShareMultiplier: number;
  tone: ScenarioTone;
}

export const SCENARIO_SPECS: ScenarioSpec[] = [
  {
    id:                "conservative",
    name:              "Conservative",
    case:              "Worst Case",
    description:       "Lower ad performance, higher competition, weaker conversion",
    ctrMultiplier:     0.70,
    cvrMultiplier:     0.65,
    cpcMultiplier:     1.20,
    impShareMultiplier: 0.70,
    tone:              "red",
  },
  {
    id:                "balanced",
    name:              "Balanced",
    case:              "Expected Case",
    description:       "Expected performance based on current assumptions",
    ctrMultiplier:     1.00,
    cvrMultiplier:     1.00,
    cpcMultiplier:     1.00,
    impShareMultiplier: 1.00,
    tone:              "neutral",
  },
  {
    id:                "aggressive",
    name:              "Aggressive",
    case:              "Best Case",
    description:       "Strong performance with optimized ads and landing page",
    ctrMultiplier:     1.25,
    cvrMultiplier:     1.25,
    cpcMultiplier:     0.90,
    impShareMultiplier: 1.15,
    tone:              "green",
  },
];

export interface ScenarioForecast {
  spec: ScenarioSpec;
  budget: number;
  clicks: number;
  leads: number;
  cpl: number;
  revenue: number;
  roas: number;
}

export function computeScenarioForecast(
  inScope: Keyword[],
  budgetMap: Map<number, number>,
  assumptions: ProjectAssumptions,
  spec: ScenarioSpec,
  matchMods?: Record<MatchType, { cpcFactor: number; cvrFactor: number; label?: string }>,
  calibratedCvrByCategory?: Record<string, number>,
): ScenarioForecast {
  const enriched = enrich(inScope, budgetMap, assumptions, {
    matchMods:               matchMods ?? MATCH_TYPE_MODIFIERS,
    cpcMultiplier:           spec.cpcMultiplier,
    ctrMultiplier:           spec.ctrMultiplier,
    cvrMultiplier:           spec.cvrMultiplier,
    impShareMultiplier:      spec.impShareMultiplier,
    calibratedCvrByCategory,
  });

  const budget  = enriched.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
  const clicks  = enriched.reduce((s, k) => s + k.estimatedClicks,        0);
  const leads   = enriched.reduce((s, k) => s + k.estimatedLeads,         0);
  const revenue = enriched.reduce((s, k) => s + k.revenuePotential,       0);
  const cpl     = leads  > 0 ? Math.round(budget  / leads)                : 0;
  const roas    = budget > 0 ? Math.min(+(revenue / budget).toFixed(2), 50) : 0;

  return { spec, budget, clicks, leads, cpl, revenue, roas };
}
