// ─── Forecast Assumptions Store ──────────────────────────────────────────────
// Per-project localStorage store for editable forecast model parameters.
// These extend and override the hardcoded engine defaults and project settings.

import type { Project } from "@/lib/projectStore";
import type { MatchType } from "@/lib/keywordEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForecastAssumptions {
  // ── Conversion funnel ──────────────────────────────────────────────────────
  lpConversionRate: number;      // landing page CVR % (e.g. 3.5)
  sqlRate:          number;      // % of leads that are SQL (e.g. 50)
  closeRate:        number;      // % close rate (e.g. 20)
  avgDealSize:      number;      // avg deal size in $ (e.g. 10000)

  // ── Bid modifier ───────────────────────────────────────────────────────────
  cpcMultiplier: number;         // global CPC multiplier on top of scenario (e.g. 1.0)

  // ── Intent modifiers ───────────────────────────────────────────────────────
  brandCvrUplift:        number; // CVR multiplier for brand keywords (e.g. 1.5)
  competitorCvrDiscount: number; // CVR multiplier for competitor keywords (e.g. 0.8)

  // ── Match type factors ─────────────────────────────────────────────────────
  broadCpcFactor:  number;  // e.g. 0.85
  broadCvrFactor:  number;  // e.g. 0.75
  phraseCpcFactor: number;  // e.g. 1.00
  phraseCvrFactor: number;  // e.g. 1.00
  exactCpcFactor:  number;  // e.g. 1.15
  exactCvrFactor:  number;  // e.g. 1.25
}

export interface ForecastAssumptionWarning {
  id:      string;
  level:   "error" | "warn" | "info";
  title:   string;
  message: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_FORECAST_ASSUMPTIONS: ForecastAssumptions = {
  lpConversionRate:      3.5,
  sqlRate:               50,
  closeRate:             20,
  avgDealSize:           10000,
  cpcMultiplier:         1.0,
  brandCvrUplift:        1.0,
  competitorCvrDiscount: 1.0,
  broadCpcFactor:        0.85,
  broadCvrFactor:        0.75,
  phraseCpcFactor:       1.00,
  phraseCvrFactor:       1.00,
  exactCpcFactor:        1.15,
  exactCvrFactor:        1.25,
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const storeKey = (projectId: string) => `elitez_forecast_assumptions_${projectId}`;

type ProjectBase = Pick<Project, "lpConversionRate" | "closeRate" | "avgDealSize">;

function buildDefaults(projectBase?: ProjectBase): ForecastAssumptions {
  return {
    ...DEFAULT_FORECAST_ASSUMPTIONS,
    ...(projectBase
      ? {
          lpConversionRate: projectBase.lpConversionRate,
          closeRate:        projectBase.closeRate,
          avgDealSize:      projectBase.avgDealSize,
        }
      : {}),
  };
}

/**
 * Returns stored forecast assumptions for a project.
 * Initialises from the project's own values if nothing has been saved yet.
 * New fields added in future releases are merged from defaults.
 */
export function getForecastAssumptions(
  projectId:   string,
  projectBase?: ProjectBase,
): ForecastAssumptions {
  if (typeof window === "undefined") return buildDefaults(projectBase);
  try {
    const raw = localStorage.getItem(storeKey(projectId));
    if (!raw) return buildDefaults(projectBase);
    const stored = JSON.parse(raw) as Partial<ForecastAssumptions>;
    return { ...buildDefaults(projectBase), ...stored };
  } catch {
    return buildDefaults(projectBase);
  }
}

export function saveForecastAssumptions(
  projectId:   string,
  assumptions: ForecastAssumptions,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storeKey(projectId), JSON.stringify(assumptions));
}

/** Clears stored assumptions and returns the project-initialised defaults. */
export function resetForecastAssumptions(
  projectId:    string,
  projectBase?: ProjectBase,
): ForecastAssumptions {
  if (typeof window !== "undefined") localStorage.removeItem(storeKey(projectId));
  return buildDefaults(projectBase);
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Builds the match type modifiers record from stored forecast assumptions. */
export function buildMatchTypeModifiers(
  fa: ForecastAssumptions,
): Record<MatchType, { cpcFactor: number; cvrFactor: number; label: string }> {
  return {
    Broad:  { cpcFactor: fa.broadCpcFactor,  cvrFactor: fa.broadCvrFactor,  label: "High reach, lower intent"         },
    Phrase: { cpcFactor: fa.phraseCpcFactor, cvrFactor: fa.phraseCvrFactor, label: "Balanced reach & intent"           },
    Exact:  { cpcFactor: fa.exactCpcFactor,  cvrFactor: fa.exactCvrFactor,  label: "Precise intent, lower volume" },
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateForecastAssumptions(
  fa: ForecastAssumptions,
): ForecastAssumptionWarning[] {
  const w: ForecastAssumptionWarning[] = [];

  // LP CVR
  if (fa.lpConversionRate > 30) {
    w.push({ id: "cvr-impossible", level: "error", title: "LP CVR cannot exceed 30%", message: `${fa.lpConversionRate}% is not realistic. Projections will be severely overstated.` });
  } else if (fa.lpConversionRate > 15) {
    w.push({ id: "cvr-high", level: "warn", title: "Very high landing page CVR", message: `${fa.lpConversionRate}% is well above B2B benchmarks (2–8%). Revenue projections will be significantly overstated.` });
  } else if (fa.lpConversionRate > 0 && fa.lpConversionRate < 0.5) {
    w.push({ id: "cvr-low", level: "warn", title: "Very low landing page CVR", message: "CVR below 0.5% is extremely low — confirm the value is a percentage (e.g. 3.5, not 0.035)." });
  }

  // SQL rate
  if (fa.sqlRate > 100) {
    w.push({ id: "sql-impossible", level: "error", title: "SQL rate cannot exceed 100%", message: "Enter a value between 1 and 100." });
  } else if (fa.sqlRate > 80) {
    w.push({ id: "sql-high", level: "warn", title: "Unusually high SQL rate", message: `${fa.sqlRate}% is above typical B2B qualification rates (30–60%).` });
  }

  // Close rate
  if (fa.closeRate > 100) {
    w.push({ id: "close-impossible", level: "error", title: "Close rate cannot exceed 100%", message: "Enter a value between 1 and 100." });
  } else if (fa.closeRate > 60) {
    w.push({ id: "close-high", level: "warn", title: "Very high close rate", message: `${fa.closeRate}% is above typical B2B benchmarks (15–30%). Revenue estimates will be inflated.` });
  }

  // Avg deal size
  if (fa.avgDealSize > 0 && fa.avgDealSize < 100) {
    w.push({ id: "deal-small", level: "warn", title: "Deal size looks very small", message: "Confirm the value is in whole dollars, not thousands." });
  }

  // CPC multiplier
  if (fa.cpcMultiplier < 0.3) {
    w.push({ id: "cpc-mult-low", level: "warn", title: "Very low CPC multiplier", message: `×${fa.cpcMultiplier} means CPCs are modelled at ${Math.round(fa.cpcMultiplier * 100)}% of stated rates — clicks will be overstated if actual bids are higher.` });
  } else if (fa.cpcMultiplier > 3) {
    w.push({ id: "cpc-mult-high", level: "warn", title: "Very high CPC multiplier", message: `×${fa.cpcMultiplier} will sharply reduce click estimates. Confirm this reflects actual market conditions.` });
  }

  // Match type: broad CVR near baseline
  if (fa.broadCvrFactor >= 0.95) {
    w.push({ id: "broad-cvr-high", level: "info", title: "Broad match CVR factor near Phrase baseline", message: "Broad match typically delivers lower conversion intent than Phrase. A factor ≥ 0.95 removes the expected intent discount." });
  }

  // Exact CPC below baseline
  if (fa.exactCpcFactor < 1.0) {
    w.push({ id: "exact-cpc-low", level: "info", title: "Exact match CPC below Phrase baseline", message: "Exact match typically commands an auction premium due to higher intent. A factor below 1.0 may understate the cost of exact match terms." });
  }

  // Brand uplift
  if (fa.brandCvrUplift > 3) {
    w.push({ id: "brand-uplift-high", level: "warn", title: "Very high brand CVR uplift", message: `×${fa.brandCvrUplift} will produce very high lead estimates for brand keywords. Industry average is 1.5–2.5×.` });
  }

  // Competitor discount
  if (fa.competitorCvrDiscount < 0.3) {
    w.push({ id: "competitor-discount-low", level: "warn", title: "Very aggressive competitor CVR discount", message: `×${fa.competitorCvrDiscount} means competitor keywords convert at only ${Math.round(fa.competitorCvrDiscount * 100)}% of the base rate — extremely conservative.` });
  }

  return w;
}
