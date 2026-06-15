// ─── Planning Warnings ────────────────────────────────────────────────────────
// Pure functions — no side effects, no React.
// Two surfaces:
//   1. validateFormInputs   → live field errors inside ProjectForm
//   2. buildPlanningWarnings → campaign-level warnings shown on /reports

import type { ProjectAssumptions } from "@/lib/projectStore";
import type { EnrichedKeyword } from "@/lib/keywordEngine";
import { KEYWORD_COUNTRIES } from "@/lib/keywordEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WarningLevel = "error" | "warn" | "info";

export interface PlanningWarning {
  id:      string;
  level:   WarningLevel;
  title:   string;
  message: string;
}

// ─── 1. Form field validation ─────────────────────────────────────────────────
// Returns per-field error/warning strings. Empty string = no issue.
// Call with parsed numeric values (0 when blank is fine — blank fields are
// treated as "not yet set" and produce no error).

export interface FormFieldErrors {
  monthlyBudget:    string;
  lpConversionRate: string;
  closeRate:        string;
  avgDealSize:      string;
  sqlRate:          string;
}

export type FormFieldErrorLevel = "error" | "warn";
export interface FormFieldIssue {
  message: string;
  level:   FormFieldErrorLevel;
}

export function validateFormInputs(vals: {
  monthlyBudget:    number;
  lpConversionRate: number;
  closeRate:        number;
  avgDealSize:      number;
  sqlRate:          number;
  targetCountries:  string[];
}): Partial<Record<keyof Omit<typeof vals, "targetCountries">, FormFieldIssue>> {
  const out: Partial<Record<string, FormFieldIssue>> = {};

  if (vals.monthlyBudget > 0 && vals.monthlyBudget < 300) {
    out.monthlyBudget = {
      level:   "error",
      message: "Budget is too low — minimum viable SEM spend is $300+/mo.",
    };
  } else if (vals.monthlyBudget >= 300 && vals.monthlyBudget < 800) {
    out.monthlyBudget = {
      level:   "warn",
      message: "Budget is on the low side. Below $800/mo you may not generate enough data to optimise.",
    };
  } else if (
    vals.monthlyBudget > 0 &&
    vals.targetCountries.length > 1 &&
    vals.monthlyBudget / vals.targetCountries.length < 500
  ) {
    out.monthlyBudget = {
      level:   "warn",
      message: `$${Math.round(vals.monthlyBudget / vals.targetCountries.length).toLocaleString()}/country is thin for ${vals.targetCountries.length} markets. Consider fewer countries or a higher budget.`,
    };
  }

  if (vals.lpConversionRate > 30) {
    out.lpConversionRate = {
      level:   "error",
      message: "Landing page CVR cannot realistically exceed 30%.",
    };
  } else if (vals.lpConversionRate > 15) {
    out.lpConversionRate = {
      level:   "warn",
      message: `${vals.lpConversionRate}% CVR is very optimistic — B2B benchmarks are typically 2–8%. Projections will be overstated.`,
    };
  } else if (vals.lpConversionRate > 0 && vals.lpConversionRate < 0.5) {
    out.lpConversionRate = {
      level:   "warn",
      message: "CVR below 0.5% is very low. Check whether the figure is expressed as a percentage (e.g. 3.5, not 0.035).",
    };
  }

  if (vals.closeRate > 100) {
    out.closeRate = {
      level:   "error",
      message: "Close rate cannot exceed 100%.",
    };
  } else if (vals.closeRate > 60) {
    out.closeRate = {
      level:   "warn",
      message: `${vals.closeRate}% close rate is above typical B2B benchmarks of 15–30%. Revenue estimates will be inflated.`,
    };
  }

  if (vals.avgDealSize > 0 && vals.avgDealSize < 100) {
    out.avgDealSize = {
      level:   "warn",
      message: "Deal size looks very small — confirm the value is in whole dollars, not thousands.",
    };
  }

  if (vals.sqlRate > 100) {
    out.sqlRate = {
      level:   "error",
      message: "SQL rate cannot exceed 100%.",
    };
  } else if (vals.sqlRate > 80) {
    out.sqlRate = {
      level:   "warn",
      message: `${vals.sqlRate}% SQL rate is unusually high. A typical B2B SQL qualification rate is 30–60%.`,
    };
  }

  return out;
}

// ─── 2. Campaign-level planning warnings ─────────────────────────────────────
// Derived from computed assumptions + enriched keywords.
// Call after all useMemo chains are settled (inside useMemo on the page).

export function buildPlanningWarnings(
  assumptions:     ProjectAssumptions,
  enrichedKws:     EnrichedKeyword[],   // already filtered to action !== "No" typically
  inScopeCountries: string[],
): PlanningWarning[] {
  const warnings: PlanningWarning[] = [];

  // ── Budget per country ────────────────────────────────────────────────────
  if (inScopeCountries.length > 0 && assumptions.monthlyBudget > 0) {
    const perCountry = Math.round(assumptions.monthlyBudget / inScopeCountries.length);
    if (perCountry < 1000) {
      warnings.push({
        id:      "budget-per-country",
        level:   "warn",
        title:   "Budget may be too thin across selected markets",
        message: `At $${perCountry.toLocaleString()}/country, the allocated budget is below the recommended $1,000 minimum per market for meaningful SEM learning. Consider focusing on fewer countries or increasing total budget.`,
      });
    }
  }

  // ── LP conversion rate ────────────────────────────────────────────────────
  if (assumptions.lpConversionRate > 10) {
    warnings.push({
      id:      "cvr-optimistic",
      level:   "warn",
      title:   "Landing page CVR is unusually high",
      message: `A ${assumptions.lpConversionRate.toFixed(1)}% landing page conversion rate is well above the B2B average of 2–5%. Lead and revenue projections in this report will be significantly overstated if this figure is not validated by real data.`,
    });
  }

  // ── Close rate ────────────────────────────────────────────────────────────
  if (assumptions.closeRate > 50) {
    warnings.push({
      id:      "close-rate-optimistic",
      level:   "warn",
      title:   "Close rate is above industry norms",
      message: `A ${assumptions.closeRate}% close rate exceeds typical B2B benchmarks of 15–30%. Revenue pipeline estimates will be inflated. Consider stress-testing projections at a 20–25% close rate.`,
    });
  }

  // ── No Buy keywords ───────────────────────────────────────────────────────
  const allInScope = enrichedKws; // caller passes action !== "No" keywords
  const buyKws = allInScope.filter((k) => k.action === "Buy");
  if (allInScope.length > 0 && buyKws.length === 0) {
    warnings.push({
      id:      "no-buy-keywords",
      level:   "error",
      title:   "No Buy keywords are recommended",
      message: `All in-scope keywords are classified as Test or No. The keyword engine has not identified any high-confidence opportunities in the selected markets at this budget level. Expand target countries, increase budget, or review keyword actions manually.`,
    });
  }

  // ── Countries with no keyword coverage ───────────────────────────────────
  const uncovered = assumptions.targetCountries.filter(
    (c) => !(KEYWORD_COUNTRIES as readonly string[]).includes(c),
  );
  if (uncovered.length > 0) {
    const plural = uncovered.length === 1;
    warnings.push({
      id:      "missing-keyword-coverage",
      level:   "info",
      title:   `No keyword data for ${plural ? "1 selected country" : `${uncovered.length} selected countries`}`,
      message: `${uncovered.join(", ")} ${plural ? "is" : "are"} not yet covered in the keyword research dataset. Budget cannot be allocated to ${plural ? "this market" : "these markets"}. The dataset currently covers ${[...KEYWORD_COUNTRIES].join(", ")}.`,
    });
  }

  // ── High competitor pressure ───────────────────────────────────────────────
  if (allInScope.length > 0) {
    const highPressure = allInScope.filter((k) => k.competitorPressureScore >= 70);
    const pct = Math.round((highPressure.length / allInScope.length) * 100);
    if (pct >= 60) {
      warnings.push({
        id:      "high-competitor-pressure",
        level:   "warn",
        title:   "High competitor pressure across most keywords",
        message: `${pct}% of in-scope keywords have a competitor pressure score ≥ 70. Expect effective CPCs to run 5–10% above stated bid rates due to auction competition. Consider defensive match types (Exact preferred over Broad), ad scheduling during peak buying hours, and building negative keyword lists from the outset.`,
      });
    }
  }

  return warnings;
}
