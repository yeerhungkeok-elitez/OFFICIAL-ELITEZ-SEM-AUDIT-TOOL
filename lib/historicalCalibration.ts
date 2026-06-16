// ─── Historical Calibration ───────────────────────────────────────────────────
// Reads stored actuals from Supabase, rolls them up per category, and blends
// them with the engine's hardcoded priors using a confidence-weighted average:
//
//   blended = w · actual + (1 − w) · prior      w = min(1, vol / FULL_TRUST_X)
//
// Separate confidence thresholds per metric: CTR stabilises on impressions,
// CPC on clicks (75), CVR on clicks (200).

import { supabase } from "@/lib/supabase";

export const FULL_TRUST_CLICKS      = 200;   // CVR (existing)
export const FULL_TRUST_IMPRESSIONS = 1000;  // CTR
export const FULL_TRUST_CLICKS_CPC  = 75;   // CPC

const PRIOR_CVR: Record<string, number> = {
  brand:      0.03,
  generic:    0.02,
  highIntent: 0.06,
  competitor: 0.06,
};

export interface CategoryBenchmark {
  category:    string;
  clicks:      number;
  impressions: number;
  actualCtr:   number;   // clicks / impressions
  actualCpc:   number;   // cost / clicks
  actualCvr:   number;   // conversions / clicks
  actualCpa:   number;   // cost / conversions
  confidence:  number;   // CVR confidence (clicks-based) — kept for upload UI
  blendedCvr:  number;
}

export interface CategoryCalibration {
  actualCtr:     number;
  actualCpc:     number;
  actualCvr:     number;
  actualCpl:     number;   // = actualCpa
  clicks:        number;
  impressions:   number;
  ctrConfidence: number;   // min(1, impressions / FULL_TRUST_IMPRESSIONS)
  cpcConfidence: number;   // min(1, clicks / FULL_TRUST_CLICKS_CPC)
  cvrConfidence: number;   // min(1, clicks / FULL_TRUST_CLICKS)
  blendedCvr:    number;   // cvrConfidence·actualCvr + (1−cvrConfidence)·PRIOR_CVR
}

export type CalibrationMap = Record<string, CategoryCalibration>;

/** Map a forecast-engine category to a perf category. */
export function toPerfCategory(engineCategory: string, intent?: string): string {
  const c = engineCategory.toLowerCase();
  if (c === "brand") return "brand";
  if (c === "competitor") return "competitor";
  if (c === "highintent" || c === "high-intent") return "highIntent";
  if (["commercial", "purchase", "comparison"].includes(c)) return "highIntent";
  if (["generic", "service", "other", "local", "urgent", "pricing"].includes(c)) return "generic";
  if (intent === "Navigational") return "brand";
  return "generic";
}

/**
 * Recompute calibration_benchmarks for a project from its raw historical rows.
 * Called after every CSV upload.
 */
export async function recomputeBenchmarks(projectId: string): Promise<CategoryBenchmark[]> {
  const { data, error } = await supabase
    .from("semaudit_historical_keyword_performance")
    .select("category, clicks, impressions, conversions, cost, snapshot_date")
    .eq("project_id", projectId);

  if (error) throw new Error(`Calibration read failed: ${error.message}`);

  const agg = new Map<string, { clicks: number; impr: number; conv: number; cost: number; last: string }>();
  for (const r of data ?? []) {
    const a = agg.get(r.category) ?? { clicks: 0, impr: 0, conv: 0, cost: 0, last: "" };
    a.clicks += Number(r.clicks)      || 0;
    a.impr   += Number(r.impressions) || 0;
    a.conv   += Number(r.conversions) || 0;
    a.cost   += Number(r.cost)        || 0;
    if (r.snapshot_date > a.last) a.last = r.snapshot_date;
    agg.set(r.category, a);
  }

  const benchmarks: CategoryBenchmark[] = [];
  const upserts = [];

  for (const [category, a] of Array.from(agg)) {
    const actualCtr  = a.impr   > 0 ? a.clicks / a.impr   : 0;
    const actualCpc  = a.clicks > 0 ? a.cost   / a.clicks : 0;
    const actualCvr  = a.clicks > 0 ? a.conv   / a.clicks : 0;
    const actualCpa  = a.conv   > 0 ? a.cost   / a.conv   : 0;
    const confidence = Math.min(1, a.clicks / FULL_TRUST_CLICKS);
    const prior      = PRIOR_CVR[category] ?? 0.03;
    const blendedCvr = confidence * actualCvr + (1 - confidence) * prior;

    benchmarks.push({
      category, clicks: a.clicks, impressions: a.impr,
      actualCtr, actualCpc, actualCvr, actualCpa, confidence, blendedCvr,
    });
    upserts.push({
      project_id:       projectId,
      category,
      total_clicks:     a.clicks,
      total_impressions: a.impr,
      total_conv:       a.conv,
      total_cost:       a.cost,
      actual_ctr:       actualCtr,
      actual_cpc:       actualCpc,
      actual_cvr:       actualCvr,
      actual_cpa:       actualCpa,
      confidence,
      last_snapshot:    a.last || null,
      updated_at:       new Date().toISOString(),
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
 * Load the full CalibrationMap for a project.
 * Returns null when no calibration data exists for this project.
 */
export async function loadBlendedBenchmarks(
  projectId: string,
): Promise<CalibrationMap | null> {
  const { data, error } = await supabase
    .from("semaudit_calibration_benchmarks")
    .select("category, total_clicks, total_impressions, actual_ctr, actual_cpc, actual_cvr, actual_cpa")
    .eq("project_id", projectId);

  if (error || !data || data.length === 0) return null;

  const map: CalibrationMap = {};
  for (const r of data) {
    const clicks      = Number(r.total_clicks)      || 0;
    const impressions = Number(r.total_impressions) || 0;
    const actualCvr   = Number(r.actual_cvr)        || 0;
    const cvrConfidence = Math.min(1, clicks / FULL_TRUST_CLICKS);
    const prior         = PRIOR_CVR[r.category] ?? 0.03;
    map[r.category] = {
      actualCtr:     Number(r.actual_ctr) || 0,
      actualCpc:     Number(r.actual_cpc) || 0,
      actualCvr,
      actualCpl:     Number(r.actual_cpa) || 0,
      clicks,
      impressions,
      ctrConfidence: Math.min(1, impressions / FULL_TRUST_IMPRESSIONS),
      cpcConfidence: Math.min(1, clicks / FULL_TRUST_CLICKS_CPC),
      cvrConfidence,
      blendedCvr:    cvrConfidence * actualCvr + (1 - cvrConfidence) * prior,
    };
  }
  return map;
}

/** @deprecated use loadBlendedBenchmarks */
export async function loadBlendedCvrMap(
  projectId: string,
): Promise<Record<string, number> | null> {
  const m = await loadBlendedBenchmarks(projectId);
  if (!m) return null;
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.blendedCvr]));
}

/** Strip match-type brackets/quotes from raw Google Ads keyword text (for matching/joins only — keep raw for display). */
export function normalizeKeyword(raw: string): string {
  return raw
    .replace(/^[\[\"']+|[\]\"']+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
