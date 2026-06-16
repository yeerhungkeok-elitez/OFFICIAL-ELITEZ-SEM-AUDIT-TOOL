// ─── Historical Calibration ───────────────────────────────────────────────────
// Reads stored actuals from Supabase, rolls them up per category, and blends
// them with the engine's hardcoded priors using a confidence-weighted average:
//
//   blended = w · actual + (1 − w) · prior      w = min(1, clicks / FULL_TRUST)
//
// At low click volume the prior dominates; once a category has enough clicks the
// actuals take over. This is what fixes the brand-vs-service inversion: with real
// Elitez data, brand (~779 clicks) and service (~1012 clicks) both reach w≈1, so
// their true 2.6% / 6.2% CVRs replace the wrong 15% / 2% priors.

import { supabase } from "@/lib/supabase";

export const FULL_TRUST_CLICKS = 200;

// Prior CVR midpoints by performance category (fallback when no/low data).
// These mirror forecastEngine's category priors but in this module's vocabulary.
const PRIOR_CVR: Record<string, number> = {
  brand:      0.03,
  service:    0.06,
  competitor: 0.06,
  other:      0.03,
};

export interface CategoryBenchmark {
  category:   string;
  actualCvr:  number;   // conversions / clicks from stored data
  actualCpa:  number;   // cost / conversions
  clicks:     number;
  confidence: number;   // min(1, clicks / FULL_TRUST_CLICKS)
  blendedCvr: number;   // what the engine should use
}

/** Map a forecast-engine category (brand/commercial/purchase/generic/...) to a perf category. */
export function toPerfCategory(engineCategory: string, intent?: string): string {
  const c = engineCategory.toLowerCase();
  if (c === "brand") return "brand";
  if (c === "competitor") return "competitor";
  if (["commercial", "purchase", "comparison", "local", "urgent", "high-intent", "pricing", "highintent"].includes(c))
    return "service";
  if (c === "generic") return "service";
  if (intent === "Navigational") return "brand";
  return "other";
}

/**
 * Recompute calibration_benchmarks for a project from its raw historical rows.
 * Called after every CSV upload. Aggregates ALL snapshots (append-with-overwrite
 * means duplicates were already collapsed at write time).
 */
export async function recomputeBenchmarks(projectId: string): Promise<CategoryBenchmark[]> {
  const { data, error } = await supabase
    .from("semaudit_historical_keyword_performance")
    .select("category, clicks, conversions, cost, snapshot_date")
    .eq("project_id", projectId);

  if (error) throw new Error(`Calibration read failed: ${error.message}`);

  const agg = new Map<string, { clicks: number; conv: number; cost: number; last: string }>();
  for (const r of data ?? []) {
    const a = agg.get(r.category) ?? { clicks: 0, conv: 0, cost: 0, last: "" };
    a.clicks += Number(r.clicks) || 0;
    a.conv   += Number(r.conversions) || 0;
    a.cost   += Number(r.cost) || 0;
    if (r.snapshot_date > a.last) a.last = r.snapshot_date;
    agg.set(r.category, a);
  }

  const benchmarks: CategoryBenchmark[] = [];
  const upserts = [];

  for (const [category, a] of Array.from(agg)) {
    const actualCvr  = a.clicks > 0 ? a.conv / a.clicks : 0;
    const actualCpa  = a.conv   > 0 ? a.cost / a.conv   : 0;
    const confidence = Math.min(1, a.clicks / FULL_TRUST_CLICKS);
    const prior      = PRIOR_CVR[category] ?? 0.03;
    const blendedCvr = confidence * actualCvr + (1 - confidence) * prior;

    benchmarks.push({ category, actualCvr, actualCpa, clicks: a.clicks, confidence, blendedCvr });
    upserts.push({
      project_id:    projectId,
      category,
      total_clicks:  a.clicks,
      total_conv:    a.conv,
      total_cost:    a.cost,
      actual_cvr:    actualCvr,
      actual_cpa:    actualCpa,
      confidence,
      last_snapshot: a.last || null,
      updated_at:    new Date().toISOString(),
    });
  }

  if (upserts.length) {
    const { error: upErr } = await supabase
      .from("semaudit_calibration_benchmarks")
      .upsert(upserts, { onConflict: "project_id,category" });
    if (upErr) throw new Error(`Calibration write failed: ${upErr.message}`);
  }

  return benchmarks;
}

/**
 * Load blended CVR by perf category for a project. Returns null if the project
 * has no calibration data yet (engine then falls back to its own priors).
 */
export async function loadBlendedCvrMap(
  projectId: string,
): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from("semaudit_calibration_benchmarks")
    .select("category, actual_cvr, total_clicks")
    .eq("project_id", projectId);

  if (error || !data || data.length === 0) return null;

  const map: Record<string, number> = {};
  for (const r of data) {
    const clicks     = Number(r.total_clicks) || 0;
    const actualCvr  = Number(r.actual_cvr) || 0;
    const confidence = Math.min(1, clicks / FULL_TRUST_CLICKS);
    const prior      = PRIOR_CVR[r.category] ?? 0.03;
    map[r.category]  = confidence * actualCvr + (1 - confidence) * prior;
  }
  return map;
}
