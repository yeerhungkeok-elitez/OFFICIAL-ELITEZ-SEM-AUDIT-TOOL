"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Target,
  Zap,
  ArrowRight,
  Layers,
  BarChart3,
  Users,
  Download,
} from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { projectToAssumptions, PROJECT_DEFAULTS } from "@/lib/projectStore";
import { KEYWORDS, KEYWORD_COUNTRIES } from "@/lib/keywordEngine";
import type { Keyword } from "@/lib/keywordEngine";
import { allocateBudgets, enrich } from "@/lib/forecastEngine";
import {
  getForecastAssumptions,
  buildMatchTypeModifiers,
  DEFAULT_FORECAST_ASSUMPTIONS,
  type ForecastAssumptions,
} from "@/lib/forecastAssumptionsStore";
import type { MatchType } from "@/lib/keywordEngine";
import { applyScenario } from "@/lib/scenarioStore";
import { buildWorkspaceKeywords, getLibraryKeywords, getSystemOverrides } from "@/lib/keywordLibrary";
import type { KeywordCategory } from "@/lib/keywordLibrary";
import { getCampaigns, getAdGroups } from "@/lib/campaignStore";
import type { Campaign } from "@/lib/campaignStore";
import { getNegativeKeywords, isKeywordSuppressed } from "@/lib/negativeKeywordStore";
import { buildPlanningWarnings } from "@/lib/planningWarnings";
import type { PlanningWarning } from "@/lib/planningWarnings";
import { exportCampaignSummaryCsv } from "@/lib/csvExport";

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  brand:          "Brand",
  commercial:     "Commercial",
  purchase:       "Purchase Intent",
  "problem-aware": "Problem-Aware",
  comparison:     "Comparison",
  competitor:     "Competitor",
  informational:  "Informational",
  local:          "Local",
  urgent:         "Urgent",
};

// ─── Group-aware budget allocation (mirrors keywords page) ────────────────────

function groupedBudgetAllocate(
  forecastKws:   Keyword[],
  kwCampaignMap: Map<number, string | undefined>,
  campaigns:     Campaign[],
  totalBudget:   number,
): Map<number, number> {
  const manualCampaigns = campaigns.filter(
    (c) => (c.budgetMode ?? "auto") === "manual" && (c.budgetAmount ?? 0) > 0 && !c.excludeFromForecast,
  );

  if (manualCampaigns.length === 0) {
    return allocateBudgets(forecastKws, totalBudget);
  }

  const rawManualTotal = manualCampaigns.reduce((s, c) => s + (c.budgetAmount ?? 0), 0);
  const scale          = rawManualTotal > totalBudget ? totalBudget / rawManualTotal : 1;
  const manualIds      = new Set(manualCampaigns.map((c) => c.id));
  const remainingAuto  = Math.max(0, totalBudget - rawManualTotal * scale);

  const autoKws: Keyword[] = [];
  const manualKwsByCampaign = new Map<string, Keyword[]>();
  for (const kw of forecastKws) {
    const cId = kwCampaignMap.get(kw.id);
    if (cId && manualIds.has(cId)) {
      if (!manualKwsByCampaign.has(cId)) manualKwsByCampaign.set(cId, []);
      manualKwsByCampaign.get(cId)!.push(kw);
    } else {
      autoKws.push(kw);
    }
  }

  const resultMap = new Map<number, number>();
  allocateBudgets(autoKws, remainingAuto).forEach((budget, id) => resultMap.set(id, budget));
  for (const c of manualCampaigns) {
    const kwList  = manualKwsByCampaign.get(c.id) ?? [];
    const cBudget = Math.round((c.budgetAmount ?? 0) * scale);
    allocateBudgets(kwList, cBudget).forEach((budget, id) => resultMap.set(id, budget));
  }

  return resultMap;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, iconColor, iconBg,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; iconColor: string; iconBg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={17} className={iconColor} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function MiniBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-600 w-10 text-right">{pct}%</span>
      <span className="text-xs tabular-nums text-slate-400 w-6 text-right">{count}</span>
    </div>
  );
}

function WarningCard({ w }: { w: PlanningWarning }) {
  const { icon: Icon, ring, bg, text } =
    w.level === "error"
      ? { icon: AlertCircle,   ring: "ring-rose-200",   bg: "bg-rose-50",   text: "text-rose-700" }
      : w.level === "warn"
      ? { icon: AlertTriangle, ring: "ring-amber-200",  bg: "bg-amber-50",  text: "text-amber-700" }
      : { icon: Info,          ring: "ring-sky-200",    bg: "bg-sky-50",    text: "text-sky-700" };
  return (
    <div className={`rounded-xl ring-1 ${ring} ${bg} p-4 flex gap-3`}>
      <Icon size={16} className={`${text} mt-0.5 shrink-0`} />
      <div>
        <p className={`text-sm font-semibold ${text}`}>{w.title}</p>
        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{w.message}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { activeProject, activeScenario } = useAppContext();

  const [fa, setFa] = useState<ForecastAssumptions>(DEFAULT_FORECAST_ASSUMPTIONS);
  useEffect(() => {
    const projectId = activeProject?.id ?? "default";
    setFa(getForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    ));
  }, [activeProject]);

  const [libraryKws,   setLibraryKws]   = useState(() => getLibraryKeywords());
  const [sysOverrides, setSysOverrides] = useState(() => getSystemOverrides());
  const [campaigns,    setCampaigns]    = useState(() => getCampaigns());
  const [adGroups,     setAdGroups]     = useState(() => getAdGroups());
  const [negativeKws,  setNegativeKws]  = useState(() => getNegativeKeywords());

  useEffect(() => {
    setLibraryKws(getLibraryKeywords());
    setSysOverrides(getSystemOverrides());
    setCampaigns(getCampaigns());
    setAdGroups(getAdGroups());
    setNegativeKws(getNegativeKeywords());
  }, [activeProject?.id]);

  // ─── Assumptions ─────────────────────────────────────────────────────────

  const assumptions = useMemo(() => {
    const base = activeProject ? projectToAssumptions(activeProject) : PROJECT_DEFAULTS;
    return activeScenario ? applyScenario(base, activeScenario) : base;
  }, [activeProject, activeScenario]);

  const scenario = activeScenario;

  // ─── Workspace keywords ───────────────────────────────────────────────────

  const workspaceKws = useMemo(() => {
    const scenarioKws = KEYWORDS
      .filter((k) => (assumptions.targetCountries as string[]).includes(k.country))
      .map((k): Keyword => ({
        ...k,
        suggestedCpc: k.suggestedCpc * (scenario?.cpcMultiplier ?? 1.0),
      }));
    return buildWorkspaceKeywords(scenarioKws, sysOverrides, libraryKws, scenario?.cpcMultiplier ?? 1.0, campaigns, adGroups);
  }, [assumptions.targetCountries, scenario, sysOverrides, libraryKws, campaigns, adGroups]);

  // ─── Forecast-ready keywords (suppression + exclusion filter) ────────────

  const forecastReadyKws = useMemo(() => {
    return workspaceKws.filter((kw) => {
      if (kw.action === "No")    return false;
      if (kw.exclude)            return false;
      if (!(KEYWORD_COUNTRIES as readonly string[]).includes(kw.country)) return false;
      if (isKeywordSuppressed(kw.keyword, kw.campaignId, kw.adGroupId, negativeKws)) return false;
      return true;
    });
  }, [workspaceKws, negativeKws]);

  // ─── Budget allocation + enrichment ──────────────────────────────────────

  const kwCampaignMap = useMemo(() => {
    const map = new Map<number, string | undefined>();
    workspaceKws.forEach((kw) => map.set(kw.id, kw.campaignId));
    return map;
  }, [workspaceKws]);

  const budgetMap = useMemo(
    () => groupedBudgetAllocate(forecastReadyKws as unknown as Keyword[], kwCampaignMap, campaigns, assumptions.monthlyBudget),
    [forecastReadyKws, kwCampaignMap, campaigns, assumptions.monthlyBudget],
  );

  const enrichedForecast = useMemo(
    () => enrich(forecastReadyKws as unknown as Keyword[], budgetMap, assumptions, {
      matchMods:             buildMatchTypeModifiers(fa),
      brandCvrUplift:        fa.brandCvrUplift,
      competitorCvrDiscount: fa.competitorCvrDiscount,
      cpcMultiplier:         fa.cpcMultiplier,
    }),
    [forecastReadyKws, budgetMap, assumptions, fa],
  );

  // ─── KPI totals ───────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalBudget  = enrichedForecast.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
    const totalLeads   = enrichedForecast.reduce((s, k) => s + k.estimatedLeads, 0);
    const totalRevenue = enrichedForecast.reduce((s, k) => s + k.revenuePotential, 0);
    const avgCpa       = totalLeads > 0 ? Math.round(totalBudget / totalLeads) : 0;
    const buyCount     = workspaceKws.filter((k) => k.action === "Buy" && !k.exclude).length;
    const testCount    = workspaceKws.filter((k) => k.action === "Test" && !k.exclude).length;
    const suppressed   = workspaceKws.filter((k) =>
      isKeywordSuppressed(k.keyword, k.campaignId, k.adGroupId, negativeKws)
    ).length;
    return { totalBudget, totalLeads, totalRevenue, avgCpa, buyCount, testCount, suppressed };
  }, [enrichedForecast, workspaceKws, negativeKws]);

  // ─── Warnings ─────────────────────────────────────────────────────────────

  const planningWarnings = useMemo(
    () => buildPlanningWarnings(assumptions, enrichedForecast.filter((k) => k.action !== "No"), assumptions.targetCountries),
    [assumptions, enrichedForecast],
  );

  const negativeWarnings = useMemo((): PlanningWarning[] => {
    if (negativeKws.length === 0) return [];
    const suppBuy = workspaceKws.filter((k) =>
      k.action === "Buy" && isKeywordSuppressed(k.keyword, k.campaignId, k.adGroupId, negativeKws)
    ).length;
    const buyTotal = workspaceKws.filter((k) => k.action === "Buy").length;
    const warnings: PlanningWarning[] = [];
    if (negativeKws.length > 0) {
      warnings.push({ id: "neg-count", level: "info", title: `${negativeKws.length} negative keyword${negativeKws.length === 1 ? "" : "s"} active`, message: `${suppBuy > 0 ? suppBuy + " Buy keyword" + (suppBuy > 1 ? "s are" : " is") + " suppressed." : "No Buy keywords are currently suppressed."}` });
    }
    if (buyTotal > 0 && suppBuy / buyTotal > 0.2) {
      warnings.push({ id: "neg-overbroad", level: "warn", title: "Negatives may be over-blocking Buy keywords", message: `${Math.round((suppBuy / buyTotal) * 100)}% of Buy keywords are suppressed by your negative keyword list. Review your negatives to avoid blocking high-intent traffic.` });
    }
    return warnings;
  }, [negativeKws, workspaceKws]);

  const matchTypeWarnings = useMemo((): PlanningWarning[] => {
    const warnings: PlanningWarning[] = [];
    const buyKws = workspaceKws.filter((k) => k.action === "Buy" && !k.exclude);

    const brandNotExact = buyKws.filter((k) => {
      const cat = (k as { category?: string }).category;
      return cat === "brand" && (k as { effectiveMatchType?: string }).effectiveMatchType !== "Exact";
    });
    if (brandNotExact.length > 0) {
      warnings.push({ id: "brand-not-exact", level: "warn", title: `${brandNotExact.length} brand keyword${brandNotExact.length > 1 ? "s" : ""} not on Exact match`, message: "Brand keywords on Broad or Phrase match waste budget on irrelevant queries. Set match type to Exact for brand terms." });
    }

    const compOnBroad = buyKws.filter((k) => {
      const cat = (k as { category?: string }).category;
      return cat === "competitor" && (k as { effectiveMatchType?: string }).effectiveMatchType === "Broad";
    });
    if (compOnBroad.length > 0) {
      warnings.push({ id: "competitor-broad", level: "warn", title: `${compOnBroad.length} competitor keyword${compOnBroad.length > 1 ? "s" : ""} on Broad match`, message: "Broad match on competitor terms risks showing ads for unrelated queries and inflating CPCs. Use Phrase or Exact." });
    }

    const broadBuyCount = buyKws.filter((k) => (k as { effectiveMatchType?: string }).effectiveMatchType === "Broad").length;
    if (buyKws.length > 0 && broadBuyCount / buyKws.length > 0.4) {
      const pct = Math.round((broadBuyCount / buyKws.length) * 100);
      warnings.push({ id: "too-many-broad", level: "info", title: `${pct}% of Buy keywords on Broad match`, message: `Broad match applies a ${Math.round((1 - fa.broadCvrFactor) * 100)}% CVR reduction in the forecast model. Mix in Phrase or Exact to improve lead quality estimates.` });
    }

    return warnings;
  }, [workspaceKws, fa.broadCvrFactor]);

  const allWarnings = useMemo(
    () => [...planningWarnings, ...matchTypeWarnings, ...negativeWarnings],
    [planningWarnings, matchTypeWarnings, negativeWarnings],
  );

  const errorWarnings = allWarnings.filter((w) => w.level === "error");
  const warnWarnings  = allWarnings.filter((w) => w.level === "warn");
  const infoWarnings  = allWarnings.filter((w) => w.level === "info");

  // ─── Campaign performance table ───────────────────────────────────────────

  const campaignStats = useMemo(() => {
    if (campaigns.length === 0) return [];

    const activeCampaigns = campaigns.filter((c) => !c.excludeFromForecast);

    return activeCampaigns.map((camp) => {
      const campKws = enrichedForecast.filter((k) => {
        const cId = kwCampaignMap.get(k.id);
        return cId === camp.id;
      });
      const budget  = campKws.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
      const leads   = campKws.reduce((s, k) => s + k.estimatedLeads, 0);
      const revenue = campKws.reduce((s, k) => s + k.revenuePotential, 0);
      const cpa     = leads > 0 ? Math.round(budget / leads) : 0;
      return { id: camp.id, name: camp.name, budget, leads, revenue, cpa, kwCount: campKws.length };
    });
  }, [campaigns, enrichedForecast, kwCampaignMap]);

  const unassignedStats = useMemo(() => {
    const unassigned = enrichedForecast.filter((k) => !kwCampaignMap.get(k.id));
    const budget  = unassigned.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
    const leads   = unassigned.reduce((s, k) => s + k.estimatedLeads, 0);
    const revenue = unassigned.reduce((s, k) => s + k.revenuePotential, 0);
    const cpa     = leads > 0 ? Math.round(budget / leads) : 0;
    return { budget, leads, revenue, cpa, kwCount: unassigned.length };
  }, [enrichedForecast, kwCampaignMap]);

  const totalCampaignBudget = campaignStats.reduce((s, c) => s + c.budget, 0) + unassignedStats.budget;

  // ─── Keyword mix ──────────────────────────────────────────────────────────

  const keywordMix = useMemo(() => {
    const inScope = workspaceKws.filter((k) => k.action !== "No" && !k.exclude);
    const total   = inScope.length;

    // Match type distribution
    const matchCounts = { Broad: 0, Phrase: 0, Exact: 0 };
    inScope.forEach((k) => {
      const mt = ((k as { effectiveMatchType?: MatchType }).effectiveMatchType ?? k.matchType) as MatchType;
      matchCounts[mt] = (matchCounts[mt] ?? 0) + 1;
    });

    // Buy vs Test
    const buyCount  = inScope.filter((k) => k.action === "Buy").length;
    const testCount = inScope.filter((k) => k.action === "Test").length;

    // Top categories
    const catCounts: Partial<Record<string, number>> = {};
    inScope.forEach((k) => {
      const cat = (k as { category?: string }).category ?? "commercial";
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    });
    const topCategories = Object.entries(catCounts)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 5)
      .map(([cat, count]) => ({ cat, count: count ?? 0 }));

    return { total, matchCounts, buyCount, testCount, topCategories };
  }, [workspaceKws]);

  // ─── Opportunity & Risk insights ──────────────────────────────────────────

  const insights = useMemo(() => {
    const buyKws = enrichedForecast.filter((k) => k.action === "Buy");
    const topOpp = buyKws.slice().sort((a, b) => b.revenuePotential - a.revenuePotential)[0] ?? null;

    // Risk: buy keyword with highest CPC and zero leads
    const riskKw = buyKws
      .filter((k) => k.estimatedLeads === 0 && k.suggestedMonthlyBudget > 0)
      .sort((a, b) => b.suggestedCpc - a.suggestedCpc)[0] ?? null;

    // Untapped: highest opportunity score "No" keyword
    const untapped = workspaceKws
      .filter((k) => k.action === "No")
      .sort((a, b) => b.opportunityScore - a.opportunityScore)[0] ?? null;

    return { topOpp, riskKw, untapped };
  }, [enrichedForecast, workspaceKws]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!activeProject) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center">
            <BarChart3 size={28} className="text-brand-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">No project selected</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-sm">
              Create a project to see your SEM forecast dashboard.
            </p>
          </div>
          <Link href="/settings" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors">
            Go to Settings <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            {activeProject.projectName} · {activeScenario?.name ?? "Balanced"} scenario
          </p>
        </div>
        <Link href="/keywords" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm self-start sm:self-auto">
          Open Keywords <ArrowRight size={14} />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Monthly Budget"
          value={`$${kpis.totalBudget.toLocaleString()}`}
          sub={`of $${Math.round(assumptions.monthlyBudget).toLocaleString()} allocated`}
          icon={DollarSign}
          iconColor="text-blue-500"
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="Buy / Test Keywords"
          value={`${kpis.buyCount} / ${kpis.testCount}`}
          sub={`${kpis.suppressed > 0 ? kpis.suppressed + " suppressed by negatives" : "no suppressed keywords"}`}
          icon={ShoppingCart}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-50"
        />
        <KpiCard
          label="Proj. Conversions"
          value={kpis.totalLeads.toLocaleString()}
          sub={kpis.avgCpa > 0 ? `avg CPA $${kpis.avgCpa.toLocaleString()}` : "no leads projected"}
          icon={Users}
          iconColor="text-violet-500"
          iconBg="bg-violet-50"
        />
        <KpiCard
          label="Revenue Potential"
          value={kpis.totalRevenue > 0 ? `$${kpis.totalRevenue.toLocaleString()}` : "—"}
          sub={kpis.totalRevenue > 0 ? `${assumptions.closeRate}% close · $${assumptions.avgDealSize.toLocaleString()} deal` : "set close rate & deal size in settings"}
          icon={TrendingUp}
          iconColor="text-amber-500"
          iconBg="bg-amber-50"
        />
      </div>

      {/* Strategy Health */}
      {allWarnings.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-slate-800 mb-3">Strategy Health</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Errors */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-rose-600 text-xs font-semibold uppercase tracking-wider">
                <AlertCircle size={13} /> Errors ({errorWarnings.length})
              </div>
              {errorWarnings.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <CheckCircle2 size={13} className="text-emerald-400" /> No errors
                </div>
              ) : (
                errorWarnings.map((w) => <WarningCard key={w.id} w={w} />)
              )}
            </div>
            {/* Warnings */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold uppercase tracking-wider">
                <AlertTriangle size={13} /> Warnings ({warnWarnings.length})
              </div>
              {warnWarnings.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <CheckCircle2 size={13} className="text-emerald-400" /> No warnings
                </div>
              ) : (
                warnWarnings.map((w) => <WarningCard key={w.id} w={w} />)
              )}
            </div>
            {/* Info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sky-600 text-xs font-semibold uppercase tracking-wider">
                <Info size={13} /> Info ({infoWarnings.length})
              </div>
              {infoWarnings.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <CheckCircle2 size={13} className="text-emerald-400" /> No notes
                </div>
              ) : (
                infoWarnings.map((w) => <WarningCard key={w.id} w={w} />)
              )}
            </div>
          </div>
        </section>
      )}

      {/* Campaign Performance */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-800">Campaign Performance</h2>
          <div className="flex items-center gap-3">
            {(campaignStats.length > 0 || unassignedStats.kwCount > 0) && (
              <button
                onClick={() => {
                  const rows = [
                    ...campaignStats.map((c) => ({
                      name: c.name,
                      budget: c.budget,
                      pctTotal: totalCampaignBudget > 0 ? Math.round((c.budget / totalCampaignBudget) * 100) : 0,
                      kwCount: c.kwCount,
                      leads: c.leads,
                      cpa: c.cpa,
                      revenue: c.revenue,
                    })),
                    ...(unassignedStats.kwCount > 0 ? [{
                      name: "Unassigned",
                      budget: unassignedStats.budget,
                      pctTotal: totalCampaignBudget > 0 ? Math.round((unassignedStats.budget / totalCampaignBudget) * 100) : 0,
                      kwCount: unassignedStats.kwCount,
                      leads: unassignedStats.leads,
                      cpa: unassignedStats.cpa,
                      revenue: unassignedStats.revenue,
                    }] : []),
                  ];
                  exportCampaignSummaryCsv(rows, assumptions.projectName, activeScenario?.name ?? "Balanced");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                <Download size={12} /> Export CSV
              </button>
            )}
            <Link href="/campaigns" className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1">
              Manage campaigns <ArrowRight size={11} />
            </Link>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {campaignStats.length === 0 && unassignedStats.kwCount === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No campaigns set up.{" "}
              <Link href="/campaigns" className="text-brand-500 hover:underline">Create a campaign</Link> to track budget by campaign.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Budget</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">% Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Keywords</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversions</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">CPA</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {campaignStats.map((c, i) => (
                  <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">${c.budget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden sm:table-cell">
                      {totalCampaignBudget > 0 ? Math.round((c.budget / totalCampaignBudget) * 100) : 0}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden md:table-cell">{c.kwCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{c.leads}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden lg:table-cell">{c.cpa > 0 ? `$${c.cpa.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 hidden lg:table-cell">{c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
                {unassignedStats.kwCount > 0 && (
                  <tr className="border-b border-slate-50 bg-slate-50/40 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 italic">Unassigned</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">${unassignedStats.budget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden sm:table-cell">
                      {totalCampaignBudget > 0 ? Math.round((unassignedStats.budget / totalCampaignBudget) * 100) : 0}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden md:table-cell">{unassignedStats.kwCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">{unassignedStats.leads}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden lg:table-cell">{unassignedStats.cpa > 0 ? `$${unassignedStats.cpa.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 hidden lg:table-cell">{unassignedStats.revenue > 0 ? `$${unassignedStats.revenue.toLocaleString()}` : "—"}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wide">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">${kpis.totalBudget.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell"></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500 hidden md:table-cell">
                    {campaignStats.reduce((s, c) => s + c.kwCount, 0) + unassignedStats.kwCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-700">{kpis.totalLeads.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-700 hidden lg:table-cell">{kpis.avgCpa > 0 ? `$${kpis.avgCpa.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 hidden lg:table-cell">{kpis.totalRevenue > 0 ? `$${kpis.totalRevenue.toLocaleString()}` : "—"}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {/* Keyword Mix */}
      <section>
        <h2 className="text-base font-bold text-slate-800 mb-3">Keyword Mix</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Match type distribution */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Effective Match Type</span>
            </div>
            <div className="space-y-2 pt-1">
              <MiniBar label="Broad" count={keywordMix.matchCounts.Broad} total={keywordMix.total} color="bg-amber-400" />
              <MiniBar label="Phrase" count={keywordMix.matchCounts.Phrase} total={keywordMix.total} color="bg-sky-400" />
              <MiniBar label="Exact" count={keywordMix.matchCounts.Exact} total={keywordMix.total} color="bg-emerald-400" />
            </div>
            <p className="text-xs text-slate-400">{keywordMix.total} in-scope keywords</p>
          </div>

          {/* Buy vs Test split */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={15} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Buy vs Test Split</span>
            </div>
            <div className="space-y-2 pt-1">
              <MiniBar label="Buy" count={keywordMix.buyCount} total={keywordMix.total} color="bg-emerald-500" />
              <MiniBar label="Test" count={keywordMix.testCount} total={keywordMix.total} color="bg-amber-400" />
              {kpis.suppressed > 0 && (
                <MiniBar label="Suppressed" count={kpis.suppressed} total={keywordMix.total} color="bg-rose-400" />
              )}
            </div>
            <p className="text-xs text-slate-400">Buy = 85% budget · Test = 15%</p>
          </div>

          {/* Top categories */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Top Categories</span>
            </div>
            <div className="space-y-2 pt-1">
              {keywordMix.topCategories.length === 0 ? (
                <p className="text-xs text-slate-400">No keyword data</p>
              ) : keywordMix.topCategories.map(({ cat, count }) => (
                <MiniBar
                  key={cat}
                  label={CATEGORY_LABELS[cat as KeywordCategory] ?? cat}
                  count={count}
                  total={keywordMix.total}
                  color="bg-brand-400"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Opportunity & Risk */}
      <section>
        <h2 className="text-base font-bold text-slate-800 mb-3">Opportunity &amp; Risk</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Top opportunity */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Target size={13} className="text-emerald-500" />
              </div>
              <span className="text-sm font-semibold text-slate-700">Top Opportunity</span>
            </div>
            {insights.topOpp ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">{insights.topOpp.keyword}</p>
                <p className="text-xs text-slate-500">{insights.topOpp.country}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md px-2 py-0.5 font-semibold">
                    ${insights.topOpp.revenuePotential.toLocaleString()} revenue
                  </span>
                  <span className="text-xs bg-slate-50 text-slate-600 border border-slate-100 rounded-md px-2 py-0.5">
                    {insights.topOpp.estimatedLeads} leads
                  </span>
                  <span className="text-xs bg-slate-50 text-slate-600 border border-slate-100 rounded-md px-2 py-0.5">
                    Score {insights.topOpp.opportunityScore}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No Buy keywords in forecast.</p>
            )}
          </div>

          {/* Risk spotlight */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                <AlertTriangle size={13} className="text-amber-500" />
              </div>
              <span className="text-sm font-semibold text-slate-700">Risk Spotlight</span>
            </div>
            {insights.riskKw ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">{insights.riskKw.keyword}</p>
                <p className="text-xs text-slate-500">{insights.riskKw.country}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 rounded-md px-2 py-0.5 font-semibold">
                    ${insights.riskKw.suggestedMonthlyBudget.toLocaleString()} budget
                  </span>
                  <span className="text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-md px-2 py-0.5">
                    0 leads projected
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">High CPC with no projected leads — review bid or exclude.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                <CheckCircle2 size={13} className="text-emerald-400" /> No high-risk keywords detected.
              </div>
            )}
          </div>

          {/* Untapped potential */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <Zap size={13} className="text-violet-500" />
              </div>
              <span className="text-sm font-semibold text-slate-700">Untapped Potential</span>
            </div>
            {insights.untapped ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 leading-snug">{insights.untapped.keyword}</p>
                <p className="text-xs text-slate-500">{insights.untapped.country}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 rounded-md px-2 py-0.5 font-semibold">
                    Score {insights.untapped.opportunityScore}
                  </span>
                  <span className="text-xs bg-slate-50 text-slate-600 border border-slate-100 rounded-md px-2 py-0.5">
                    {insights.untapped.monthlySearches.toLocaleString()} searches/mo
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Currently excluded — consider switching to Test.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                <CheckCircle2 size={13} className="text-emerald-400" /> All high-opportunity keywords are in scope.
              </div>
            )}
          </div>

        </div>
      </section>

    </div>
  );
}
