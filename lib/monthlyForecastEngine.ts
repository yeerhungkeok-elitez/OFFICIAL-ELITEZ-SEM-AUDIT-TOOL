import type { MonthOption } from "@/lib/monthlyBenchmarks";

export interface MonthlyAveraged {
  category: string;
  costDist: number;   // 0–1, normalised so all categories sum to 1
  avgCpc:   number;
  avgCvr:   number;
}

export interface MonthlyForecastCategory {
  category: string;
  budget:   number;
  costDist: number;
  avgCpc:   number;
  avgCvr:   number;
  clicks:   number;
  leads:    number;
  deals:    number;
  revenue:  number;
}

export interface MonthlyForecastResult {
  byCategory: MonthlyForecastCategory[];
  totals: {
    budget:  number;
    clicks:  number;
    leads:   number;
    cpl:     number;
    sql:     number;
    deals:   number;
    revenue: number;
  };
}

/**
 * Average CPC, CVR, and cost distribution across selected months per category.
 * For each month, costDist[cat] = that month's category cost / that month's total cost.
 * The per-month costDist values are then averaged across selected months.
 * Final costDist values are normalised to sum to 1.
 */
export function averageMonthData(selectedMonths: MonthOption[]): MonthlyAveraged[] {
  if (selectedMonths.length === 0) return [];

  const categories = new Set<string>();
  for (const m of selectedMonths) {
    for (const c of m.byCategory) categories.add(c.category);
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const rawAveraged = Array.from(categories).map((category) => {
    const costDists: number[] = [];
    const cpcs: number[]      = [];
    const cvrs: number[]      = [];

    for (const month of selectedMonths) {
      const row     = month.byCategory.find((r) => r.category === category);
      const catCost = row?.cost ?? 0;
      // Cost share for this category in this month
      costDists.push(month.totalBudget > 0 ? catCost / month.totalBudget : 0);
      // Only include months where this category had spend (cpc > 0)
      if (row && row.cpc > 0) cpcs.push(row.cpc);
      // Include all months for CVR (0 CVR months are valid data)
      cvrs.push(row?.cvr ?? 0);
    }

    return {
      category,
      costDist: avg(costDists),
      avgCpc:   avg(cpcs),
      avgCvr:   avg(cvrs),
    };
  });

  // Normalise costDist so categories always sum to exactly 1
  const totalDist = rawAveraged.reduce((s, a) => s + a.costDist, 0) || 1;
  return rawAveraged.map((a) => ({ ...a, costDist: a.costDist / totalDist }));
}

/**
 * Apply averaged category metrics to a total budget to produce the forecast.
 * budget × costDist → category budget → clicks (budget/cpc) → leads (clicks×cvr)
 */
export function computeMonthlyForecast(
  averaged: MonthlyAveraged[],
  budget: number,
  assumptions: { sqlRate: number; closeRate: number; avgDealSize: number },
): MonthlyForecastResult {
  const byCategory: MonthlyForecastCategory[] = averaged.map((a) => {
    const catBudget = budget * a.costDist;
    const clicks    = a.avgCpc > 0 ? catBudget / a.avgCpc : 0;
    const leads     = clicks * a.avgCvr;
    const deals     = leads * (assumptions.closeRate / 100);
    const revenue   = deals * assumptions.avgDealSize;
    return {
      category: a.category,
      budget:   catBudget,
      costDist: a.costDist,
      avgCpc:   a.avgCpc,
      avgCvr:   a.avgCvr,
      clicks,
      leads,
      deals,
      revenue,
    };
  });

  const totalClicks  = byCategory.reduce((s, c) => s + c.clicks,  0);
  const totalLeads   = byCategory.reduce((s, c) => s + c.leads,   0);
  const totalDeals   = byCategory.reduce((s, c) => s + c.deals,   0);
  const totalRevenue = byCategory.reduce((s, c) => s + c.revenue, 0);

  return {
    byCategory,
    totals: {
      budget:  budget,
      clicks:  totalClicks,
      leads:   totalLeads,
      cpl:     totalLeads > 0 ? budget / totalLeads : 0,
      sql:     totalLeads * (assumptions.sqlRate / 100),
      deals:   totalDeals,
      revenue: totalRevenue,
    },
  };
}
