"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Info, Settings2, Download, ChevronDown } from "lucide-react";
import {
  projectToAssumptions,
  PROJECT_DEFAULTS,
  type ProjectAssumptions,
} from "@/lib/projectStore";
import {
  KEYWORDS,
  KEYWORD_COUNTRIES,
  type PriorityLevel,
  type CountryForecast,
} from "@/lib/keywordEngine";
import {
  allocateBudgets, buildCountryForecasts, enrich, getPriority,
  SCENARIO_SPECS, computeScenarioForecast,
  type ScenarioForecast,
} from "@/lib/forecastEngine";
import {
  getForecastAssumptions,
  DEFAULT_FORECAST_ASSUMPTIONS,
  buildMatchTypeModifiers,
  type ForecastAssumptions,
} from "@/lib/forecastAssumptionsStore";
import { exportForecastCsv, exportCampaignSummaryCsv, type CampaignSummaryRow } from "@/lib/csvExport";
import { applyScenario } from "@/lib/scenarioStore";
import { useAppContext } from "@/context/AppContext";
import { getLibraryKeywords, getSystemOverrides, buildWorkspaceKeywords, type WorkspaceKeyword } from "@/lib/keywordLibrary";
import { loadHistoricalKeywords } from "@/lib/historicalKeywords";
import { getCampaigns, getAdGroups, CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPE_STYLES } from "@/lib/campaignStore";
import { loadMonthlyOptions, type MonthOption } from "@/lib/monthlyBenchmarks";
import { averageMonthData, computeMonthlyForecast, type MonthlyForecastResult } from "@/lib/monthlyForecastEngine";

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${accent ? "bg-brand-500 border-brand-500" : "bg-white border-slate-100"}`}>
      <span className={`text-xs font-semibold uppercase tracking-widest leading-tight ${accent ? "text-blue-100" : "text-slate-400"}`}>{label}</span>
      <span className={`text-xl font-bold tracking-tight ${accent ? "text-white" : "text-slate-900"}`}>{value}</span>
      {sub && <span className={`text-xs leading-tight ${accent ? "text-blue-100" : "text-slate-400"}`}>{sub}</span>}
    </div>
  );
}

const PRIORITY_STYLES: Record<PriorityLevel, string> = {
  "High Priority": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Test Market":   "bg-amber-50  text-amber-700  border-amber-100",
  "Low Priority":  "bg-slate-50  text-slate-500  border-slate-100",
};

function PriorityBadge({ level }: { level: PriorityLevel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${PRIORITY_STYLES[level]}`}>
      {level === "High Priority" ? "▲ High Priority" : level === "Test Market" ? "◐ Test Market" : "○ Low Priority"}
    </span>
  );
}

function BarRow({
  label, value, displayValue, max, color,
}: {
  label: string; value: number; displayValue: string; max: number; color: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 group">
      <span className="w-24 shrink-0 text-xs font-medium text-slate-600 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-20 text-right text-xs font-semibold text-slate-700 tabular-nums shrink-0">{displayValue}</span>
    </div>
  );
}

function ChartCard({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function SplitBar({ buyBudget, testBudget }: { buyBudget: number; testBudget: number }) {
  const total = buyBudget + testBudget;
  if (total === 0) return <p className="text-xs text-slate-400">No budget allocated.</p>;
  const buyPct  = Math.round((buyBudget  / total) * 100);
  const testPct = 100 - buyPct;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
        <div className="bg-emerald-500 flex items-center justify-center transition-all" style={{ width: `${buyPct}%` }} title={`Buy: $${buyBudget.toLocaleString()} (${buyPct}%)`} />
        <div className="bg-amber-400 flex items-center justify-center transition-all" style={{ width: `${testPct}%` }} title={`Test: $${testBudget.toLocaleString()} (${testPct}%)`} />
      </div>
      <div className="flex items-center gap-6 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
          Buy — ${buyBudget.toLocaleString()} ({buyPct}%)
        </span>
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 shrink-0" />
          Test — ${testBudget.toLocaleString()} ({testPct}%)
        </span>
      </div>
    </div>
  );
}

// (Scenario outlook is computed inline via computeScenarioForecast — no page-level helpers needed)

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);
  const [selectedMonths,  setSelectedMonths]  = useState<string[]>([]);
  const isMonthlyMode = availableMonths.length > 0;
  const [forecastBasisOpen, setForecastBasisOpen] = useState(false);

  const { activeProject, activeScenario, calibration, monthlyForecast, refreshCalibration } = useAppContext();
  const scenario     = activeScenario;
  const isProjectSet = activeProject !== null;
  const assumptions: ProjectAssumptions = useMemo(
    () => activeProject ? projectToAssumptions(activeProject) : PROJECT_DEFAULTS,
    [activeProject],
  );

  const [fa, setFa] = useState<ForecastAssumptions>(DEFAULT_FORECAST_ASSUMPTIONS);
  useEffect(() => {
    const projectId = activeProject?.id ?? "default";
    setFa(getForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    ));
  }, [activeProject]);

  // Workspace data for Campaign Summary section
  const [wsCampaigns, setWsCampaigns] = useState(() => getCampaigns());
  const [wsAdGroups,  setWsAdGroups]  = useState(() => getAdGroups());
  const [wsLibKws,    setWsLibKws]    = useState(() => getLibraryKeywords());
  const [wsSysOvr,    setWsSysOvr]    = useState(() => getSystemOverrides());
  useEffect(() => {
    setWsCampaigns(getCampaigns());
    setWsAdGroups(getAdGroups());
    setWsLibKws(getLibraryKeywords());
    setWsSysOvr(getSystemOverrides());
  }, [activeProject]);

  const [historicalKws, setHistoricalKws] = useState<WorkspaceKeyword[]>([]);
  const [kwsLoading,    setKwsLoading]    = useState(false);

  useEffect(() => {
    if (activeProject?.keywordSource !== "historical") {
      setHistoricalKws([]);
      return;
    }
    setKwsLoading(true);
    loadHistoricalKeywords(activeProject.id)
      .then(setHistoricalKws)
      .finally(() => setKwsLoading(false));
  }, [activeProject?.id, activeProject?.keywordSource]);

  useEffect(() => {
    if (!activeProject) { setAvailableMonths([]); setSelectedMonths([]); return; }
    loadMonthlyOptions(activeProject.id).then((months) => {
      setAvailableMonths(months);
      // Auto-select the most recent month
      setSelectedMonths(months.length > 0 ? [months[months.length - 1].periodMonth] : []);
    });
  }, [activeProject?.id]);

  // Effective assumptions with scenario multipliers applied
  const effectiveAssumptions = useMemo(
    () => scenario ? applyScenario(assumptions, scenario) : assumptions,
    [assumptions, scenario]
  );

  // All target countries that have any data (system OR library keywords)
  const inScopeCountries = useMemo(() => {
    const libCountries = new Set(wsLibKws.map((k) => k.country));
    return effectiveAssumptions.targetCountries.filter(
      (c) => (KEYWORD_COUNTRIES as readonly string[]).includes(c) || libCountries.has(c)
    );
  }, [effectiveAssumptions.targetCountries, wsLibKws]);

  // Countries with truly no data at all
  const missingCountries = useMemo(() => {
    const libCountries = new Set(wsLibKws.map((k) => k.country));
    return effectiveAssumptions.targetCountries.filter(
      (c) => !(KEYWORD_COUNTRIES as readonly string[]).includes(c) && !libCountries.has(c)
    );
  }, [effectiveAssumptions.targetCountries, wsLibKws]);

  // Keywords with CPC multiplier applied (system only — used for scenario comparison)
  const scenarioKws = useMemo(() => {
    const mult = scenario?.cpcMultiplier ?? 1.0;
    return KEYWORDS.map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * mult }));
  }, [scenario]);

  // Unified forecast keywords: system + library, filtered to all target countries
  const inScopeKws = useMemo(() => {
    const cpcMult   = scenario?.cpcMultiplier ?? 1.0;
    const targetSet = new Set(effectiveAssumptions.targetCountries);
    if (activeProject?.keywordSource === "historical") {
      return historicalKws
        .map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * cpcMult, action: k.effectiveAction })) as never[];
    }
    const ws = buildWorkspaceKeywords(scenarioKws as never, wsSysOvr, wsLibKws, cpcMult, wsCampaigns, wsAdGroups);
    return ws
      .filter((kw) => targetSet.has(kw.country) && kw.effectiveAction !== "No")
      .map((kw) => ({ ...kw, action: kw.effectiveAction })) as never[];
  }, [activeProject?.keywordSource, historicalKws, scenarioKws, wsSysOvr, wsLibKws, wsCampaigns, wsAdGroups, effectiveAssumptions.targetCountries, scenario]);

  const budgetMap = useMemo(
    () => allocateBudgets(inScopeKws, effectiveAssumptions.monthlyBudget, calibration ?? undefined),
    [inScopeKws, effectiveAssumptions.monthlyBudget, calibration]
  );

  // Single enrich pass — identical opts to Campaign Summary so all sections agree
  const enrichedForForecast = useMemo(() =>
    enrich(inScopeKws as never, budgetMap, effectiveAssumptions, {
      matchMods:             buildMatchTypeModifiers(fa),
      brandCvrUplift:        fa.brandCvrUplift,
      competitorCvrDiscount: fa.competitorCvrDiscount,
      cpcMultiplier:         fa.cpcMultiplier,
      calibration:           calibration ?? undefined,
    }),
    [inScopeKws, budgetMap, effectiveAssumptions, fa, calibration]
  );

  const rawTotals = useMemo(() => ({
    totalLeads:   enrichedForForecast.reduce((s, k) => s + k.estimatedLeads,   0),
    totalRevenue: enrichedForForecast.reduce((s, k) => s + k.revenuePotential, 0),
  }), [enrichedForForecast]);

  const countryForecasts = useMemo((): CountryForecast[] => {
    const { totalLeads, totalRevenue } = rawTotals;
    const sqlRate = fa.sqlRate / 100;
    const byCountry = new Map<string, typeof enrichedForForecast>();
    for (const kw of enrichedForForecast) {
      const c = (kw as { country?: string }).country ?? "";
      if (!byCountry.has(c)) byCountry.set(c, []);
      byCountry.get(c)!.push(kw);
    }
    return Array.from(byCountry.entries()).map(([country, kws]) => {
      const budget     = kws.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
      const buyBudget  = kws.filter((k) => (k as { action?: string }).action === "Buy").reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
      const testBudget = kws.filter((k) => (k as { action?: string }).action === "Test").reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
      const clicks     = kws.reduce((s, k) => s + k.estimatedClicks, 0);
      const leads      = kws.reduce((s, k) => s + k.estimatedLeads,  0);
      const cpl        = leads > 0 ? Math.round(budget / leads) : 0;
      const sql        = Math.round(leads * sqlRate);
      const deals      = Math.round(leads * (effectiveAssumptions.closeRate / 100));
      const revenue    = deals * effectiveAssumptions.avgDealSize;
      const priority   = getPriority(leads, revenue, totalLeads, totalRevenue);
      return { country, budget, buyBudget, testBudget, clicks, leads, cpl, sql, deals, revenue, priority };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [enrichedForForecast, rawTotals, fa.sqlRate, effectiveAssumptions]);

  const totals = useMemo(() => {
    const budget  = countryForecasts.reduce((s, c) => s + c.budget,  0);
    const clicks  = countryForecasts.reduce((s, c) => s + c.clicks,  0);
    const leads   = countryForecasts.reduce((s, c) => s + c.leads,   0);
    const sql     = countryForecasts.reduce((s, c) => s + c.sql,     0);
    const deals   = countryForecasts.reduce((s, c) => s + c.deals,   0);
    const revenue = countryForecasts.reduce((s, c) => s + c.revenue, 0);
    const cpl     = leads > 0 ? Math.round(budget / leads) : 0;
    const buyBudget  = countryForecasts.reduce((s, c) => s + c.buyBudget,  0);
    const testBudget = countryForecasts.reduce((s, c) => s + c.testBudget, 0);
    return { budget, clicks, leads, sql, deals, revenue, cpl, buyBudget, testBudget };
  }, [countryForecasts]);

  const maxBudget  = Math.max(...countryForecasts.map((c) => c.budget),  1);
  const maxLeads   = Math.max(...countryForecasts.map((c) => c.leads),   1);
  const maxRevenue = Math.max(...countryForecasts.map((c) => c.revenue), 1);
  const roi = totals.budget > 0 ? (totals.revenue / totals.budget).toFixed(1) : "—";

  const monthlyAveraged = useMemo(() => {
    const selected = availableMonths.filter((m) => selectedMonths.includes(m.periodMonth));
    return averageMonthData(selected);
  }, [availableMonths, selectedMonths]);

  const monthlyResult = useMemo<MonthlyForecastResult | null>(() => {
    if (monthlyAveraged.length === 0) return null;
    return computeMonthlyForecast(monthlyAveraged, effectiveAssumptions.monthlyBudget, {
      sqlRate:     fa.sqlRate,
      closeRate:   effectiveAssumptions.closeRate,
      avgDealSize: effectiveAssumptions.avgDealSize,
    });
  }, [monthlyAveraged, effectiveAssumptions.monthlyBudget, effectiveAssumptions.closeRate, effectiveAssumptions.avgDealSize, fa.sqlRate]);

  const displayTotals = useMemo(() => {
    if (isMonthlyMode && monthlyResult) {
      return {
        budget:     monthlyResult.totals.budget,
        clicks:     monthlyResult.totals.clicks,
        leads:      monthlyResult.totals.leads,
        cpl:        monthlyResult.totals.cpl,
        sql:        monthlyResult.totals.sql,
        deals:      monthlyResult.totals.deals,
        revenue:    monthlyResult.totals.revenue,
        buyBudget:  0,
        testBudget: 0,
      };
    }
    return totals;
  }, [isMonthlyMode, monthlyResult, totals]);

  // Diagnose why forecast is $0
  const zeroBudgetDiagnosis = useMemo(() => {
    if (totals.budget > 0 || isMonthlyMode) return null;
    if (effectiveAssumptions.monthlyBudget === 0)
      return { msg: "Monthly budget is $0.", fix: "Set a budget in your project.", href: activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new" };
    if (wsLibKws.length === 0)
      return { msg: "No keywords have been generated yet.", fix: "Go to the Keywords page and click Recommend Keywords to get started.", href: "/keywords" };
    const libCountries = Array.from(new Set(wsLibKws.map((k) => k.country)));
    const targetSet    = new Set(effectiveAssumptions.targetCountries);
    const hasCountryMatch = libCountries.some((c) => targetSet.has(c));
    if (!hasCountryMatch)
      return { msg: `Your library keywords are for ${libCountries.join(", ")} but your project targets ${effectiveAssumptions.targetCountries.join(", ")}.`, fix: "Re-generate keywords or update your project's target countries.", href: "/keywords" };
    const allNoAction = wsLibKws.every((k) => k.action === "No" || k.action === undefined);
    if (allNoAction)
      return { msg: "All keywords are set to No action — none will receive budget.", fix: "Visit the Keywords page and enable some keywords (set to Buy or Test).", href: "/keywords" };
    const zeroCpc = (inScopeKws as { suggestedCpc: number }[]).some((k) => k.suggestedCpc <= 0);
    if (zeroCpc)
      return { msg: "Some active keywords have a $0 CPC, so no budget can be allocated.", fix: "Check the Keywords page for keywords with missing CPC values.", href: "/keywords" };
    return { msg: "Budget could not be allocated to any active keywords.", fix: "Check that your keywords have a Buy or Test action and a valid CPC.", href: "/keywords" };
  }, [totals.budget, isMonthlyMode, effectiveAssumptions, wsLibKws, inScopeKws, activeProject]);

  // Campaign Summary — enriched workspace keywords grouped by campaign / bucket
  const campaignSummary = useMemo<CampaignSummaryRow[]>(() => {
    const BUCKET_LABELS: Record<string, string> = {
      brand:      "Brand",
      generic:    "Generic / Service",
      highIntent: "High Intent",
      competitor: "Competitor",
    };
    // Fold removed categories into their nearest equivalent
    const BUCKET_NORMALIZE: Record<string, string> = {
      pricing: "generic",
      local:   "generic",
    };

    const cpcMult = scenario?.cpcMultiplier ?? 1.0;
    const targetSet = new Set(effectiveAssumptions.targetCountries);
    const workspaceKws = activeProject?.keywordSource === "historical"
      ? historicalKws.map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * cpcMult }))
      : buildWorkspaceKeywords(scenarioKws as never, wsSysOvr, wsLibKws, cpcMult, wsCampaigns, wsAdGroups);
    const inScope = activeProject?.keywordSource === "historical"
      ? workspaceKws
      : workspaceKws.filter((k) => targetSet.has(k.country) && k.effectiveAction !== "No");
    if (inScope.length === 0) return [];

    const bMap     = allocateBudgets(inScope as never, effectiveAssumptions.monthlyBudget, calibration ?? undefined);
    const enriched = enrich(inScope as never, bMap, effectiveAssumptions, {
      matchMods:               buildMatchTypeModifiers(fa),
      brandCvrUplift:          fa.brandCvrUplift,
      competitorCvrDiscount:   fa.competitorCvrDiscount,
      cpcMultiplier:           fa.cpcMultiplier,
      calibration:             calibration ?? undefined,
    });

    const totalBudget = enriched.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);

    // Group by: real campaign ID → bucket group → single "Unassigned" bucket
    const groups = new Map<string, typeof enriched>();
    for (const kw of enriched) {
      const cId    = (kw as { campaignId?: string }).campaignId;
      const rawGroup = (kw as { campaignGroup?: string }).campaignGroup;
      const cGroup = rawGroup ? (BUCKET_NORMALIZE[rawGroup] ?? rawGroup) : undefined;
      const key    = cId ? `campaign:${cId}` : `bucket:${cGroup ?? "generic"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(kw);
    }

    const rows: CampaignSummaryRow[] = [];
    for (const [key, kws] of Array.from(groups.entries())) {
      let name: string;
      if (key.startsWith("campaign:")) {
        const cId = key.slice("campaign:".length);
        name = wsCampaigns.find((c) => c.id === cId)?.name ?? "Unassigned";
      } else if (key.startsWith("bucket:")) {
        const bucketId = key.slice("bucket:".length);
        name = BUCKET_LABELS[bucketId] ?? "Unassigned";
      } else {
        name = "Unassigned";
      }

      const budget  = kws.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
      const leads   = kws.reduce((s, k) => s + k.estimatedLeads, 0);
      const revenue = kws.reduce((s, k) => s + k.revenuePotential, 0);
      rows.push({
        name,
        budget,
        pctTotal: totalBudget > 0 ? Math.round((budget / totalBudget) * 100) : 0,
        kwCount:  kws.length,
        leads,
        cpa:      leads > 0 ? Math.round(budget / leads) : 0,
        revenue,
        roas:     budget > 0 ? +(revenue / budget).toFixed(2) : 0,
      });
    }
    return rows.sort((a, b) => b.budget - a.budget);
  }, [activeProject?.keywordSource, historicalKws, wsCampaigns, wsAdGroups, wsLibKws, wsSysOvr, inScopeCountries, effectiveAssumptions, scenario, fa, calibration]);

  // Base keywords (no active-scenario CPC adjustment) for clean scenario comparison
  const baseInScopeKws = useMemo(() => {
    const targetSet = new Set(effectiveAssumptions.targetCountries);
    if (activeProject?.keywordSource === "historical") {
      return historicalKws
        .map((kw) => ({ ...kw, action: kw.effectiveAction })) as never[];
    }
    const ws = buildWorkspaceKeywords(KEYWORDS as never, wsSysOvr, wsLibKws, 1.0, wsCampaigns, wsAdGroups);
    return ws
      .filter((kw) => targetSet.has(kw.country) && kw.effectiveAction !== "No")
      .map((kw) => ({ ...kw, action: kw.effectiveAction })) as never[];
  }, [activeProject?.keywordSource, historicalKws, wsSysOvr, wsLibKws, wsCampaigns, wsAdGroups, effectiveAssumptions.targetCountries]);

  const baseBudgetMap = useMemo(
    () => allocateBudgets(baseInScopeKws, assumptions.monthlyBudget, calibration ?? undefined),
    [baseInScopeKws, assumptions.monthlyBudget, calibration],
  );

  // 3-scenario outlook: Conservative / Balanced / Aggressive
  const scenarioOutlook = useMemo<ScenarioForecast[]>(() => {
    if (baseInScopeKws.length === 0) return [];
    const mods = buildMatchTypeModifiers(fa);
    return SCENARIO_SPECS.map((spec) =>
      computeScenarioForecast(baseInScopeKws as never, baseBudgetMap, assumptions, spec, mods, calibration ?? undefined),
    );
  }, [baseInScopeKws, baseBudgetMap, assumptions, fa, calibration]);

  // ─── Calibration upload state ────────────────────────────────────────────────
  const [calibFile,   setCalibFile]   = useState<File | null>(null);
  const [calibUpload, setCalibUpload] = useState<{
    status: "idle" | "uploading" | "done" | "error";
    message?: string;
    benchmarks?: { category: string; actualCtr: number; actualCpc: number; actualCvr: number; blendedCvr: number; clicks: number; impressions: number; confidence: number }[];
  }>({ status: "idle" });

  function toggleMonth(periodMonth: string) {
    setSelectedMonths((prev) => {
      if (prev.includes(periodMonth)) {
        if (prev.length === 1) return prev; // always keep at least one selected
        return prev.filter((m) => m !== periodMonth);
      }
      return [...prev, periodMonth];
    });
  }

  async function handleCalibrationUpload() {
    if (!calibFile || !activeProject) return;
    setCalibUpload({ status: "uploading" });
    const form = new FormData();
    form.append("file", calibFile);
    form.append("projectId", activeProject.id);
    try {
      const res  = await fetch("/api/calibration/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setCalibUpload({ status: "error", message: json.error ?? "Upload failed." });
      } else {
        setCalibUpload({ status: "done", benchmarks: json.benchmarks, message: `${json.rowsIngested} rows ingested from ${json.snapshotDate}.` });
        refreshCalibration();
        setCalibFile(null);
      }
    } catch (e) {
      setCalibUpload({ status: "error", message: e instanceof Error ? e.message : "Unknown error." });
    }
  }

  if (!mounted || kwsLoading) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Forecast</h1>
          <p className="text-sm text-slate-400 mt-1">
            Projected SEM performance based on your project assumptions and keyword decision engine.
          </p>
        </div>
        <Link
          href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors whitespace-nowrap self-start"
        >
          <Settings2 size={13} />
          {isProjectSet ? "Edit Project" : "Set Up Project"}
        </Link>
      </div>

      {/* No-project nudge */}
      {!isProjectSet && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <Info size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">Using default assumptions.</span>{" "}
            No project has been saved yet. Forecasts below use $5,000/mo budget, 3.5% CVR, 20% close rate, and $10,000 avg deal size.{" "}
            <Link href="/projects/new" className="underline font-semibold hover:text-amber-900">Create a project →</Link>
          </p>
        </div>
      )}

      {/* Missing country data notice */}
      {missingCountries.length > 0 && (
        <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <Info size={15} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold">No keyword data yet for:</span>{" "}
            {missingCountries.join(", ")}. Generate keywords for these countries from the{" "}
            <Link href="/keywords" className="underline font-semibold hover:text-slate-700">Keywords page →</Link>
          </p>
        </div>
      )}

      {/* Calibration upload */}
      {isProjectSet && (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Performance Data Calibration</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload a Google Ads "Search keyword" export to anchor CVR forecasts to your actual conversion data.
              {calibration && (
                <span className="ml-1 text-emerald-600 font-medium">✓ Calibration active</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
              <Download size={12} />
              {calibFile ? calibFile.name : "Choose CSV file"}
              <input
                type="file"
                accept=".csv"
                className="sr-only"
                onChange={(e) => {
                  setCalibFile(e.target.files?.[0] ?? null);
                  setCalibUpload({ status: "idle" });
                }}
              />
            </label>
            <button
              onClick={handleCalibrationUpload}
              disabled={!calibFile || calibUpload.status === "uploading"}
              className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold disabled:opacity-40 hover:bg-brand-600 transition-colors"
            >
              {calibUpload.status === "uploading" ? "Uploading…" : "Upload"}
            </button>
            {calibUpload.status === "error" && (
              <span className="text-xs text-red-600">{calibUpload.message}</span>
            )}
            {calibUpload.status === "done" && (
              <span className="text-xs text-emerald-600 font-medium">{calibUpload.message}</span>
            )}
          </div>

          {calibUpload.status === "done" && calibUpload.benchmarks && calibUpload.benchmarks.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-1.5 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="text-right py-1.5 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Actual CTR</th>
                    <th className="text-right py-1.5 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Actual CPC</th>
                    <th className="text-right py-1.5 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Actual CVR</th>
                    <th className="text-right py-1.5 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Blended CVR</th>
                    <th className="text-right py-1.5 pr-4 font-semibold text-slate-500 uppercase tracking-wider">Clicks</th>
                    <th className="text-right py-1.5 font-semibold text-slate-500 uppercase tracking-wider">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {calibUpload.benchmarks.map((b) => (
                    <tr key={b.category} className="border-b border-slate-50">
                      <td className="py-1.5 pr-4 font-medium text-slate-700 capitalize">{b.category}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">{b.actualCtr}%</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">MYR {b.actualCpc}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">{b.actualCvr}%</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">{b.blendedCvr}%</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums text-slate-500">{b.clicks.toLocaleString()}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">{Math.round(b.confidence * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Month Selector — accordion, closed by default */}
      {isMonthlyMode && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setForecastBasisOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Forecast Basis</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedMonths.length} month{selectedMonths.length !== 1 ? "s" : ""} selected · click to {forecastBasisOpen ? "collapse" : "expand"}
              </p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${forecastBasisOpen ? "rotate-180" : ""}`}
            />
          </button>

          {forecastBasisOpen && (
            <div className="border-t border-slate-100 px-5 pb-5 pt-4 flex flex-col gap-4">
              <p className="text-xs text-slate-400">
                Select months to base the forecast on. Deselect outliers to exclude them from the averaged CPC, CVR, and budget distribution.
              </p>

              {/* Month rows */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-2 pr-3 w-8" />
                      <th className="py-2 pr-4 text-left font-semibold text-slate-400 uppercase tracking-wider">Month</th>
                      <th className="py-2 pr-4 text-right font-semibold text-slate-400 uppercase tracking-wider">Budget Spent</th>
                      <th className="py-2 pr-4 text-right font-semibold text-slate-400 uppercase tracking-wider">Avg CPC</th>
                      <th className="py-2 pr-4 text-right font-semibold text-slate-400 uppercase tracking-wider">Avg CVR</th>
                      <th className="py-2 pr-4 text-right font-semibold text-slate-400 uppercase tracking-wider">Clicks</th>
                      <th className="py-2 text-right font-semibold text-slate-400 uppercase tracking-wider">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableMonths.map((m) => {
                      const isSelected = selectedMonths.includes(m.periodMonth);
                      const isOnly     = selectedMonths.length === 1 && isSelected;
                      return (
                        <tr
                          key={m.periodMonth}
                          className={`border-t border-slate-50 transition-colors cursor-pointer hover:bg-slate-50 ${isSelected ? "" : "opacity-50"}`}
                          onClick={() => toggleMonth(m.periodMonth)}
                        >
                          <td className="py-2.5 pr-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isOnly}
                              onChange={() => toggleMonth(m.periodMonth)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 accent-brand-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-2.5 pr-4 font-semibold text-slate-800">{m.label}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">
                            MYR {m.totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">MYR {m.avgCpc.toFixed(2)}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{(m.avgCvr * 100).toFixed(1)}%</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">{m.totalClicks.toLocaleString()}</td>
                          <td className="py-2.5 text-right tabular-nums text-slate-500">{m.totalLeads}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Checker — per-category averages applied to forecast */}
              {monthlyAveraged.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Applied to forecast · avg of {selectedMonths.length} selected month{selectedMonths.length !== 1 ? "s" : ""}
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-1.5 pr-4 text-left font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                        <th className="py-1.5 pr-4 text-right font-semibold text-slate-400 uppercase tracking-wider">Cost Dist</th>
                        <th className="py-1.5 pr-4 text-right font-semibold text-slate-400 uppercase tracking-wider">CPC</th>
                        <th className="py-1.5 text-right font-semibold text-slate-400 uppercase tracking-wider">CVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyAveraged.map((a) => (
                        <tr key={a.category} className="border-t border-slate-50">
                          <td className="py-1.5 pr-4 font-medium text-slate-700 capitalize">{a.category}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">{(a.costDist * 100).toFixed(0)}%</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">MYR {a.avgCpc.toFixed(2)}</td>
                          <td className="py-1.5 text-right tabular-nums text-slate-700">{(a.avgCvr * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assumptions bar */}
      <div className="bg-white rounded-2xl border border-slate-100 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 shrink-0">Assumptions</span>
          {scenario && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-[11px] font-bold px-2.5 py-0.5">
              ⚗ {scenario.name}
            </span>
          )}
          {assumptions.projectName && (
            <span className="text-xs text-slate-700 font-medium">
              <span className="text-slate-400">Project: </span>{assumptions.projectName}
            </span>
          )}
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">Budget: </span>${effectiveAssumptions.monthlyBudget.toLocaleString()}/mo
          </span>
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">LP CVR: </span>{effectiveAssumptions.lpConversionRate.toFixed(2)}%
          </span>
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">SQL Rate: </span>{fa.sqlRate}% of leads
          </span>
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">Close Rate: </span>{effectiveAssumptions.closeRate}%
          </span>
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">Avg Deal: </span>${effectiveAssumptions.avgDealSize.toLocaleString()}
          </span>
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">Countries: </span>
            {inScopeCountries.length > 0 ? inScopeCountries.join(", ") : "—"}
          </span>
          <Link href="/assumptions" className="text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors shrink-0">
            Edit assumptions →
          </Link>
          <Link href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"} className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors shrink-0">
            Edit project →
          </Link>
        </div>
      </div>

      {/* Forecast disclaimer */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <Info size={15} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-600 leading-relaxed">
          <span className="font-semibold">Forecast estimates only.</span>{" "}
          Budget is allocated proportionally by Opportunity Score (85% Buy / 15% Test).
          Estimates are adjusted to reflect real-world inefficiencies in traffic quality, competition, and landing page performance — including a B2B CPL floor of $25.
          CTR, CPC and CVR are anchored to historical actuals per category where data exists, blended by confidence — falling back to priors otherwise. · Clicks = budget ÷ effective CPC · Leads = clicks × blended CVR (intent + match type + LP realism) · SQL = leads × SQL rate · Deals = leads × close rate · Revenue = deals × avg deal size.
          Actual results depend on ad quality, landing page performance, and market conditions.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Total Budget"  value={`$${Math.round(displayTotals.budget).toLocaleString()}`}  sub="allocated to Buy + Test"  accent />
        <KpiCard label="Proj. Clicks"  value={Math.round(displayTotals.clicks).toLocaleString()}         sub="across all categories"          />
        <KpiCard label="Proj. Leads"   value={Math.round(displayTotals.leads).toLocaleString()}          sub={isMonthlyMode ? "from historical CVR" : `${effectiveAssumptions.lpConversionRate.toFixed(2)}% LP CVR`} />
        <KpiCard label="Proj. CPL"     value={displayTotals.cpl > 0 ? `$${Math.round(displayTotals.cpl).toLocaleString()}` : "—"} sub="cost per lead"  />
        <KpiCard label="Proj. SQL"     value={Math.round(displayTotals.sql).toLocaleString()}            sub={`${fa.sqlRate}% of leads`}    />
        <KpiCard label="Proj. Deals"   value={Math.round(displayTotals.deals).toLocaleString()}          sub={`${effectiveAssumptions.closeRate}% close rate`} />
        <KpiCard label="Proj. Revenue" value={displayTotals.revenue > 0 ? `$${Math.round(displayTotals.revenue).toLocaleString()}` : "—"} sub={`${displayTotals.budget > 0 && displayTotals.revenue > 0 ? (displayTotals.revenue / displayTotals.budget).toFixed(1) : "—"}× budget ROI`} />
      </div>

      {/* Monthly Mode — Forecast by Category */}
      {isMonthlyMode && monthlyResult && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Forecast by Category</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Budget distributed by historical cost share · CPC and CVR averaged from selected months
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Category", "Budget", "Cost Dist", "CPC", "Clicks", "CVR", "Leads", "Revenue"].map((col) => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyResult.byCategory.map((c, i) => (
                  <tr key={c.category} className={`border-t border-slate-50 hover:bg-slate-50/80 transition-colors ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                    <td className="px-5 py-4 font-semibold text-slate-800 whitespace-nowrap capitalize">{c.category}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">${Math.round(c.budget).toLocaleString()}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600 whitespace-nowrap">{(c.costDist * 100).toFixed(0)}%</td>
                    <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">MYR {c.avgCpc.toFixed(2)}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">{Math.round(c.clicks).toLocaleString()}</td>
                    <td className="px-5 py-4 tabular-nums text-slate-600 whitespace-nowrap">{(c.avgCvr * 100).toFixed(1)}%</td>
                    <td className="px-5 py-4 tabular-nums whitespace-nowrap">
                      <span className="font-semibold text-emerald-600">{Math.round(c.leads)}</span>
                    </td>
                    <td className="px-5 py-4 tabular-nums whitespace-nowrap">
                      {c.revenue > 0
                        ? <span className="font-semibold text-brand-600">${Math.round(c.revenue).toLocaleString()}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">Total</td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">${Math.round(monthlyResult.totals.budget).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">100%</td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">—</td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">{Math.round(monthlyResult.totals.clicks).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">
                    {monthlyResult.totals.clicks > 0
                      ? `${(monthlyResult.totals.leads / monthlyResult.totals.clicks * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-emerald-600">{Math.round(monthlyResult.totals.leads)}</td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-brand-600">
                    {monthlyResult.totals.revenue > 0 ? `$${Math.round(monthlyResult.totals.revenue).toLocaleString()}` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Zero-budget diagnostic */}
      {zeroBudgetDiagnosis && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <Info size={15} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 leading-relaxed">
            <span className="font-semibold">Forecast shows $0 — </span>
            {zeroBudgetDiagnosis.msg}{" "}
            <Link href={zeroBudgetDiagnosis.href} className="underline font-semibold hover:text-red-900">
              {zeroBudgetDiagnosis.fix} →
            </Link>
          </p>
        </div>
      )}

      {/* Scenario Outlook — Conservative / Balanced / Aggressive */}
      {!isMonthlyMode && scenarioOutlook.length > 0 && (() => {
        const TONE_STYLES = {
          red:     { row: "bg-red-50/30",     name: "text-red-700",      badge: "bg-red-50 text-red-600 border-red-200",         leads: "text-red-600",      revenue: "text-red-700"     },
          neutral: { row: "",                  name: "text-slate-800",    badge: "bg-slate-100 text-slate-600 border-slate-200",  leads: "text-slate-700",    revenue: "text-slate-800"   },
          green:   { row: "bg-emerald-50/30",  name: "text-emerald-800",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200", leads: "text-emerald-700", revenue: "text-emerald-800" },
        };
        const balanced = scenarioOutlook.find((r) => r.spec.id === "balanced");
        return (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Scenario Outlook</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Best-case, expected, and worst-case projections — same budget, same keywords. Differences reflect realistic CTR, CVR, CPC, and impression share variations.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Scenario</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Leads</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">CPL</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Revenue</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">ROAS</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioOutlook.map((row) => {
                    const tc = TONE_STYLES[row.spec.tone];
                    const vsBalanced = balanced && balanced.leads > 0
                      ? Math.round(((row.leads - balanced.leads) / balanced.leads) * 100)
                      : null;
                    return (
                      <tr key={row.spec.id} className={`border-t border-slate-100 transition-colors ${tc.row}`}>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${tc.name}`}>{row.spec.name}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tc.badge}`}>
                                {row.spec.case}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-400 tabular-nums">
                              <span title="CTR multiplier">CTR ×{row.spec.ctrMultiplier.toFixed(2)}</span>
                              <span title="CVR multiplier">CVR ×{row.spec.cvrMultiplier.toFixed(2)}</span>
                              <span title="CPC multiplier">CPC ×{row.spec.cpcMultiplier.toFixed(2)}</span>
                              <span title="Impression share multiplier">IS ×{row.spec.impShareMultiplier.toFixed(2)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums whitespace-nowrap">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-base font-bold ${tc.leads}`}>{row.leads.toLocaleString()}</span>
                            {vsBalanced !== null && row.spec.id !== "balanced" && (
                              <span className={`text-[10px] font-medium ${vsBalanced >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {vsBalanced >= 0 ? "+" : ""}{vsBalanced}% vs balanced
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-slate-700 whitespace-nowrap font-medium">
                          {row.cpl > 0 ? `$${row.cpl.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums whitespace-nowrap">
                          <span className={`font-bold ${tc.revenue}`}>
                            {row.revenue > 0 ? `$${row.revenue.toLocaleString()}` : "—"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums whitespace-nowrap font-medium text-slate-700">
                          {row.roas > 0 ? `${row.roas}×` : "—"}
                        </td>
                        <td className="px-5 py-4 text-slate-400 italic text-xs hidden lg:table-cell">
                          {row.spec.description}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-400">
                Budget fixed at <span className="font-medium text-slate-600">${assumptions.monthlyBudget.toLocaleString()}/mo</span> across all scenarios.
                Aggressive assumes optimised Quality Score and strong landing page performance. Conservative reflects crowded auctions and lower intent traffic.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Historical Run-Rate — next-month projection */}
      {monthlyForecast && monthlyForecast.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Historical Run-Rate (Next Month)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Recency-weighted projection from your uploaded actuals · Categories with ≥3 months of data rated High confidence
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Category", "Trend", "Proj. Clicks", "Proj. Cost (MYR)", "Proj. CPC (MYR)", "Confidence", "Basis"].map((col) => (
                    <th key={col} className="px-5 py-3 text-left font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthlyForecast.map((f) => (
                  <tr key={f.category} className="border-t border-slate-50 hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 font-semibold text-slate-800 capitalize">{f.category}</td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${f.trend === "up" ? "text-emerald-600" : f.trend === "down" ? "text-red-500" : "text-slate-400"}`}>
                        {f.trend === "up" ? "↑ Up" : f.trend === "down" ? "↓ Down" : "→ Flat"}
                      </span>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{f.projected.clicks.toLocaleString()}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{f.projected.cost.toLocaleString()}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-700">{f.projected.cpc.toFixed(2)}</td>
                    <td className="px-5 py-3">
                      <span className={`font-semibold ${f.confidence === "High" ? "text-emerald-600" : f.confidence === "Medium" ? "text-amber-500" : "text-slate-400"}`}>
                        {f.confidence}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 italic max-w-xs truncate">{f.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts 2 × 2 — hidden in monthly mode */}
      {!isMonthlyMode && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="Budget by Country" subtitle="Proportional allocation — Buy 85% · Test 15%">
          {countryForecasts.length === 0
            ? <p className="text-xs text-slate-400">No countries in scope.</p>
            : countryForecasts.map((c) => (
                <BarRow key={c.country} label={c.country} value={c.budget} displayValue={`$${c.budget.toLocaleString()}`} max={maxBudget} color="bg-brand-500" />
              ))}
        </ChartCard>

        <ChartCard title="Leads by Country" subtitle={`Based on ${effectiveAssumptions.lpConversionRate.toFixed(2)}% landing page conversion rate`}>
          {countryForecasts.length === 0
            ? <p className="text-xs text-slate-400">No countries in scope.</p>
            : countryForecasts.map((c) => (
                <BarRow key={c.country} label={c.country} value={c.leads} displayValue={`${c.leads} lead${c.leads !== 1 ? "s" : ""}`} max={maxLeads} color="bg-emerald-500" />
              ))}
        </ChartCard>

        <ChartCard title="Revenue Potential by Country" subtitle={`Deals × $${effectiveAssumptions.avgDealSize.toLocaleString()} avg deal size`}>
          {countryForecasts.length === 0
            ? <p className="text-xs text-slate-400">No countries in scope.</p>
            : countryForecasts.map((c) => (
                <BarRow key={c.country} label={c.country} value={c.revenue} displayValue={c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—"} max={maxRevenue} color="bg-violet-500" />
              ))}
        </ChartCard>

        <ChartCard title="Buy vs Test Budget Allocation" subtitle="Buy keywords receive 85% · Test keywords receive 15%">
          <SplitBar buyBudget={totals.buyBudget} testBudget={totals.testBudget} />
          {countryForecasts.length > 0 && (
            <div className="mt-1 border-t border-slate-100 pt-3 flex flex-col gap-2.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">By country</p>
              {countryForecasts.map((c) => {
                const total = c.buyBudget + c.testBudget;
                if (total === 0) return null;
                const buyPct = Math.round((c.buyBudget / total) * 100);
                return (
                  <div key={c.country} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-medium text-slate-600">{c.country}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-slate-100 flex gap-0.5">
                      <div className="bg-emerald-500 rounded-l-full transition-all" style={{ width: `${buyPct}%` }} />
                      <div className="bg-amber-400 rounded-r-full transition-all" style={{ width: `${100 - buyPct}%` }} />
                    </div>
                    <span className="w-20 text-right text-xs text-slate-500 tabular-nums shrink-0">
                      ${c.buyBudget.toLocaleString()} / ${c.testBudget.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>}

      {/* Forecast Table by Country — hidden in monthly mode */}
      {!isMonthlyMode && <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Forecast by Country</h3>
            <p className="text-xs text-slate-400 mt-0.5">Aggregated projections · Sorted by revenue potential</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 tabular-nums">
              {countryForecasts.length} countr{countryForecasts.length !== 1 ? "ies" : "y"} in scope
            </span>
            {countryForecasts.length > 0 && (
              <button
                onClick={() => exportForecastCsv(countryForecasts, assumptions.projectName, scenario?.name ?? "Balanced")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              >
                <Download size={12} /> Export CSV
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Country", "Budget", "Clicks", "Leads", "CPL", "SQL", "Deals", "Revenue", "Priority"].map((col) => (
                  <th key={col} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countryForecasts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-400">
                    No keyword data available for your selected countries.
                    Try adding Singapore, Malaysia, Vietnam, or Thailand to your project.
                  </td>
                </tr>
              ) : (
                <>
                  {countryForecasts.map((c, i) => (
                    <tr
                      key={c.country}
                      className={`border-t border-slate-50 hover:bg-slate-50/80 transition-colors ${
                        c.priority === "High Priority" ? "border-l-2 border-l-emerald-400" :
                        c.priority === "Test Market"   ? "border-l-2 border-l-amber-400"   :
                                                         "border-l-2 border-l-slate-200"
                      } ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}
                    >
                      <td className="px-5 py-4 font-semibold text-slate-800 whitespace-nowrap">{c.country}</td>
                      <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">${c.budget.toLocaleString()}</td>
                      <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">{c.clicks.toLocaleString()}</td>
                      <td className="px-5 py-4 tabular-nums whitespace-nowrap"><span className="font-semibold text-emerald-600">{c.leads}</span></td>
                      <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">{c.cpl > 0 ? `$${c.cpl.toLocaleString()}` : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">{c.sql > 0 ? c.sql : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-4 tabular-nums text-slate-700 whitespace-nowrap">{c.deals > 0 ? c.deals : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-4 tabular-nums whitespace-nowrap">
                        {c.revenue > 0 ? <span className="font-semibold text-brand-600">${c.revenue.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap"><PriorityBadge level={c.priority} /></td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">Total</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">${totals.budget.toLocaleString()}</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">{totals.clicks.toLocaleString()}</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-emerald-600">{totals.leads}</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">{totals.cpl > 0 ? `$${totals.cpl.toLocaleString()}` : "—"}</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">{totals.sql}</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">{totals.deals}</td>
                    <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-brand-600">{totals.revenue > 0 ? `$${totals.revenue.toLocaleString()}` : "—"}</td>
                    <td className="px-5 py-3.5" />
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> High Priority</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> Test Market</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-slate-300 inline-block" /> Low Priority</span>
          </div>
          <span className="text-xs text-slate-400">
            {scenario ? `Scenario: ${scenario.name} · ` : ""}Forecasts update automatically when you edit project assumptions.
          </span>
        </div>
      </div>}

      {/* Campaign Summary */}
      {!isMonthlyMode && campaignSummary.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Campaign Summary</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Workspace keywords grouped by campaign · Budget, leads, and ROAS rolled up per campaign
              </p>
            </div>
            <button
              onClick={() => exportCampaignSummaryCsv(campaignSummary, assumptions.projectName, scenario?.name ?? "Balanced")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Download size={12} /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Campaign", "Budget", "% of Total", "Keywords", "Conversions", "CPA", "Revenue", "ROAS"].map((col) => (
                    <th key={col} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaignSummary.map((row, i) => {
                  const camp      = wsCampaigns.find((c) => c.name === row.name);
                  const typeStyle = camp?.campaignType ? CAMPAIGN_TYPE_STYLES[camp.campaignType] : null;
                  const typeLabel = camp?.campaignType ? CAMPAIGN_TYPE_LABELS[camp.campaignType] : null;
                  return (
                    <tr key={row.name} className={`border-t border-slate-50 hover:bg-slate-50/80 transition-colors ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{row.name}</span>
                          {typeLabel && typeStyle && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${typeStyle.badge}`}>
                              {typeLabel}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums font-medium text-slate-700 whitespace-nowrap">${row.budget.toLocaleString()}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${row.pctTotal}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate-500">{row.pctTotal}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-600 whitespace-nowrap">{row.kwCount}</td>
                      <td className="px-5 py-3.5 tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-emerald-600">{row.leads}</span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-700 whitespace-nowrap">
                        {row.cpa > 0 ? `$${row.cpa.toLocaleString()}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums whitespace-nowrap">
                        {row.revenue > 0
                          ? <span className="font-semibold text-brand-600">${row.revenue.toLocaleString()}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums whitespace-nowrap">
                        {row.roas > 0
                          ? <span className="font-semibold text-violet-600">{row.roas.toFixed(1)}×</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500">Total</td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">
                    ${campaignSummary.reduce((s, r) => s + r.budget, 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">100%</td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-slate-800">
                    {campaignSummary.reduce((s, r) => s + r.kwCount, 0)}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-emerald-600">
                    {campaignSummary.reduce((s, r) => s + r.leads, 0)}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">—</td>
                  <td className="px-5 py-3.5 tabular-nums text-xs font-bold text-brand-600">
                    ${campaignSummary.reduce((s, r) => s + r.revenue, 0).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    {(() => {
                      const b = campaignSummary.reduce((s, r) => s + r.budget, 0);
                      const v = campaignSummary.reduce((s, r) => s + r.revenue, 0);
                      return b > 0 ? <span className="font-bold text-violet-600">{(v / b).toFixed(1)}×</span> : <span className="text-slate-400">—</span>;
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Budgets are allocated proportionally by Opportunity Score. ROAS = projected revenue ÷ allocated budget.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
