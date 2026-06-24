// ─── Monthly Benchmarks & Next-Month Forecast ────────────────────────────────
// Sibling to historicalCalibration.ts. Where recomputeBenchmarks() collapses ALL
// months into one blended CVR/CPA per category, THIS module keeps the time
// dimension: one row per category × month. From that short series it projects the
// next month using a recency-weighted moving average plus a guarded momentum
// nudge.
//
// DESIGN NOTE (read before "improving" the math):
// With Elitez data the robust monthly signals are CLICKS, COST and CPC. Monthly
// CONVERSIONS are single-digit-to-teens, so monthly CVR is noise — we store it
// for display but do NOT trend it. Linear regression on n=3 is intentionally
// avoided: one noisy month swings the slope. The recency-weighted MA degrades
// gracefully as months are added and is what you'd defend in a forecast review.

import { supabase } from "@/lib/supabase";

export const FULL_TRUST_CLICKS = 200;

// Recency weights for the trailing-3 moving average (most-recent first).
// Re-normalised over however many months are actually present (1, 2, or 3+).
const RECENCY_WEIGHTS = [0.5, 0.33, 0.17];

// Month abbreviations used by loadMonthlyOptions to format period labels.
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export interface MonthlyPoint {
  periodMonth: string;   // yyyy-mm-01
  clicks:      number;
  impressions: number;
  cost:        number;
  conversions: number;
  cpc:         number;   // cost / clicks
  cvr:         number;   // conversions / clicks
  confidence:  number;   // min(1, clicks / FULL_TRUST_CLICKS)
}

export interface CategoryForecast {
  category:    string;
  months:      MonthlyPoint[];        // the stored series, oldest → newest
  projected: {
    clicks:      number;
    cost:        number;
    cpc:         number;
    conversions: number;              // derived from clicks × trailing CVR — LOW confidence
  };
  trend:       "up" | "down" | "flat";
  confidence:  "High" | "Medium" | "Low";
  basis:       string;                // human-readable explanation for the UI/audit
}

export interface MonthCategoryRow {
  category:    string;
  cost:        number;
  clicks:      number;
  conversions: number;
  cpc:         number;
  cvr:         number;
}

export interface MonthOption {
  periodMonth: string;          // "2026-03-01"
  label:       string;          // "Mar 2026"
  totalBudget: number;          // sum of cost across all categories for this month
  totalClicks: number;
  totalLeads:  number;          // sum of conversions
  avgCpc:      number;          // totalBudget / totalClicks
  avgCvr:      number;          // totalLeads / totalClicks
  byCategory:  MonthCategoryRow[];
}

// ─── Rollup: write semaudit_monthly_benchmarks from raw rows ──────────────────
/**
 * Recompute the month-grain benchmarks for a project. Called after every upload.
 * Groups raw historical rows by (category, snapshot_date) → one row per month.
 */
export async function recomputeMonthlyBenchmarks(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from("semaudit_historical_keyword_performance")
    .select("category, clicks, impressions, cost, conversions, snapshot_date")
    .eq("project_id", projectId);

  if (error) throw new Error(`Monthly read failed: ${error.message}`);

  const agg = new Map<
    string,
    { category: string; month: string; clicks: number; impr: number; cost: number; conv: number }
  >();

  for (const r of data ?? []) {
    const month = String(r.snapshot_date); // already month-first from the parser
    const key = `${r.category}|${month}`;
    const a = agg.get(key) ?? {
      category: r.category, month, clicks: 0, impr: 0, cost: 0, conv: 0,
    };
    a.clicks += Number(r.clicks)      || 0;
    a.impr   += Number(r.impressions) || 0;
    a.cost   += Number(r.cost)        || 0;
    a.conv   += Number(r.conversions) || 0;
    agg.set(key, a);
  }

  const upserts = Array.from(agg.values()).map((a) => ({
    project_id:   projectId,
    category:     a.category,
    period_month: a.month,
    clicks:       a.clicks,
    impressions:  a.impr,
    cost:         a.cost,
    conversions:  a.conv,
    cpc:          a.clicks > 0 ? a.cost / a.clicks : 0,
    cvr:          a.clicks > 0 ? a.conv / a.clicks : 0,
    confidence:   Math.min(1, a.clicks / FULL_TRUST_CLICKS),
    updated_at:   new Date().toISOString(),
  }));

  if (upserts.length) {
    const { error: upErr } = await supabase
      .from("semaudit_monthly_benchmarks")
      .upsert(upserts, { onConflict: "project_id,category,period_month" });
    if (upErr) throw new Error(`Monthly write failed: ${upErr.message}`);
  }
}

// ─── Forecast: project next month per category ────────────────────────────────

/** Recency-weighted moving average over the most-recent values (most-recent first). */
function weightedMA(valuesNewestFirst: number[]): number {
  const w = RECENCY_WEIGHTS.slice(0, valuesNewestFirst.length);
  const wSum = w.reduce((s, x) => s + x, 0) || 1;
  return valuesNewestFirst.reduce((s, v, i) => s + v * w[i], 0) / wSum;
}

/** Direction of a series (oldest → newest) using sign of the median step. */
function trendOf(valuesOldestFirst: number[]): "up" | "down" | "flat" {
  if (valuesOldestFirst.length < 2) return "flat";
  const deltas: number[] = [];
  for (let i = 1; i < valuesOldestFirst.length; i++) {
    deltas.push(valuesOldestFirst[i] - valuesOldestFirst[i - 1]);
  }
  deltas.sort((a, b) => a - b);
  const med = deltas[Math.floor(deltas.length / 2)];
  const scale = Math.max(1, Math.abs(valuesOldestFirst[valuesOldestFirst.length - 1]));
  if (med / scale > 0.03) return "up";
  if (med / scale < -0.03) return "down";
  return "flat";
}

/**
 * Build a per-category next-month forecast for a project from the stored monthly
 * series. Returns [] when the project has no monthly data yet.
 */
export async function forecastNextMonth(projectId: string): Promise<CategoryForecast[]> {
  const { data, error } = await supabase
    .from("semaudit_monthly_benchmarks")
    .select("category, period_month, clicks, impressions, cost, conversions, cpc, cvr, confidence")
    .eq("project_id", projectId)
    .order("period_month", { ascending: true });

  if (error) throw new Error(`Forecast read failed: ${error.message}`);
  if (!data || data.length === 0) return [];

  const byCat = new Map<string, MonthlyPoint[]>();
  for (const r of data) {
    const arr = byCat.get(r.category) ?? [];
    arr.push({
      periodMonth: String(r.period_month),
      clicks:      Number(r.clicks)      || 0,
      impressions: Number(r.impressions) || 0,
      cost:        Number(r.cost)        || 0,
      conversions: Number(r.conversions) || 0,
      cpc:         Number(r.cpc)         || 0,
      cvr:         Number(r.cvr)         || 0,
      confidence:  Number(r.confidence)  || 0,
    });
    byCat.set(r.category, arr);
  }

  const out: CategoryForecast[] = [];

  for (const [category, monthsAsc] of Array.from(byCat)) {
    const newestFirst = [...monthsAsc].reverse();

    const projClicks = weightedMA(newestFirst.map((m) => m.clicks));
    const projCost   = weightedMA(newestFirst.map((m) => m.cost));
    const projCpc    = projClicks > 0 ? projCost / projClicks : weightedMA(newestFirst.map((m) => m.cpc));
    // Conversions: clicks × trailing CVR — flagged low confidence on purpose.
    const trailingCvr = weightedMA(newestFirst.map((m) => m.cvr));
    const projConv    = projClicks * trailingCvr;

    const clickTrend  = trendOf(monthsAsc.map((m) => m.clicks));
    const totalClicks = monthsAsc.reduce((s, m) => s + m.clicks, 0);
    const monthCount  = monthsAsc.length;

    // Confidence: needs both data volume AND ≥3 months of history.
    let confidence: CategoryForecast["confidence"] = "Low";
    if (totalClicks >= FULL_TRUST_CLICKS && monthCount >= 3) confidence = "High";
    else if (totalClicks >= 80 && monthCount >= 2)           confidence = "Medium";

    out.push({
      category,
      months: monthsAsc,
      projected: {
        clicks:      Math.round(projClicks),
        cost:        +projCost.toFixed(2),
        cpc:         +projCpc.toFixed(2),
        conversions: +projConv.toFixed(1),
      },
      trend: clickTrend,
      confidence,
      basis: `Recency-weighted avg of last ${Math.min(monthCount, 3)} month(s); `
           + `clicks trending ${clickTrend}. Conversions projection is low-confidence `
           + `(${monthsAsc.reduce((s, m) => s + m.conversions, 0)} total conv across ${monthCount} mo).`,
    });
  }

  return out;
}

// ─── Recent CPC by category (optional engine input) ───────────────────────────
/**
 * Latest-month actual CPC per category, for anchoring the forecast engine's
 * impressions→clicks→budget math to current cost instead of library estimates.
 * Returns null if the project has no monthly data.
 */
export async function loadRecentCpcByCategory(
  projectId: string,
): Promise<Record<string, number> | null> {
  const { data, error } = await supabase
    .from("semaudit_monthly_benchmarks")
    .select("category, period_month, cpc")
    .eq("project_id", projectId)
    .order("period_month", { ascending: false });

  if (error || !data || data.length === 0) return null;

  const seen = new Set<string>();
  const map: Record<string, number> = {};
  for (const r of data) {
    if (seen.has(r.category)) continue; // first = most recent month for this category
    const cpc = Number(r.cpc) || 0;
    if (cpc > 0) { map[r.category] = cpc; seen.add(r.category); }
  }
  return Object.keys(map).length ? map : null;
}

/**
 * Load all available months for a project from semaudit_monthly_benchmarks,
 * sorted oldest → newest, with per-month totals and per-category rows.
 */
export async function loadMonthlyOptions(projectId: string): Promise<MonthOption[]> {
  const { data, error } = await supabase
    .from("semaudit_monthly_benchmarks")
    .select("category, period_month, clicks, cost, conversions, cpc, cvr")
    .eq("project_id", projectId)
    .order("period_month", { ascending: true });

  if (error || !data || data.length === 0) return [];

  const byMonth = new Map<string, typeof data>();
  for (const r of data) {
    const month = String(r.period_month);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(r);
  }

  return Array.from(byMonth.entries()).map(([periodMonth, rows]) => {
    const totalBudget = rows.reduce((s, r) => s + (Number(r.cost)        || 0), 0);
    const totalClicks = rows.reduce((s, r) => s + (Number(r.clicks)      || 0), 0);
    const totalLeads  = rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0);
    // period_month is always "yyyy-mm-01"; use slice to avoid silent undefined
    // if the format ever changes (split("-") would drop the day silently).
    const year  = periodMonth.slice(0, 4);
    const mo    = periodMonth.slice(5, 7);
    const label = `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${year}`;

    const byCategory: MonthCategoryRow[] = rows.map((r) => ({
      category:    String(r.category),
      cost:        Number(r.cost)        || 0,
      clicks:      Number(r.clicks)      || 0,
      conversions: Number(r.conversions) || 0,
      // cpc here is the stored per-row value from the DB (cost/clicks per category).
      // MonthOption.avgCpc below is cost-weighted across all categories (totalBudget/totalClicks)
      // and will differ slightly — use avgCpc for month-level comparisons, byCategory[n].cpc
      // for per-category work in averageMonthData.
      cpc:         Number(r.cpc)         || 0,
      cvr:         Number(r.cvr)         || 0,
    }));

    return {
      periodMonth,
      label,
      totalBudget,
      totalClicks,
      totalLeads,
      avgCpc: totalClicks > 0 ? totalBudget / totalClicks : 0,
      avgCvr: totalClicks > 0 ? totalLeads  / totalClicks : 0,
      byCategory,
    };
  });
}
