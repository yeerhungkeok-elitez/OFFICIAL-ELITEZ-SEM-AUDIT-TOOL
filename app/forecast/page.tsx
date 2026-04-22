"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Info, Settings2, Download } from "lucide-react";
import {
  projectToAssumptions,
  PROJECT_DEFAULTS,
  type ProjectAssumptions,
} from "@/lib/projectStore";
import {
  KEYWORDS,
  KEYWORD_COUNTRIES,
  type PriorityLevel,
} from "@/lib/keywordEngine";
import { allocateBudgets, buildCountryForecasts } from "@/lib/forecastEngine";
import {
  getForecastAssumptions,
  DEFAULT_FORECAST_ASSUMPTIONS,
  type ForecastAssumptions,
} from "@/lib/forecastAssumptionsStore";
import { exportForecastCsv } from "@/lib/csvExport";
import { applyScenario, type Scenario } from "@/lib/scenarioStore";
import { useAppContext } from "@/context/AppContext";

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

// ─── Scenario comparison helpers ──────────────────────────────────────────────

interface ScenarioTotals {
  scenario: Scenario;
  budget: number;
  leads: number;
  cpl: number;
  revenue: number;
}

function computeScenarioTotals(
  baseAssumptions: ProjectAssumptions,
  scenario: Scenario
): ScenarioTotals {
  const eff = applyScenario(baseAssumptions, scenario);
  const inScope = KEYWORDS.filter((k) =>
    eff.targetCountries
      .filter((c) => (KEYWORD_COUNTRIES as readonly string[]).includes(c))
      .includes(k.country)
  );
  const kws = inScope.map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * scenario.cpcMultiplier }));
  const bMap = allocateBudgets(kws, eff.monthlyBudget);
  let budget = 0, leads = 0, revenue = 0;
  for (const kw of kws) {
    const b = bMap.get(kw.id) ?? 0;
    budget += b;
    const clicks = b > 0 ? Math.floor(b / kw.suggestedCpc) : 0;
    const l = Math.round(clicks * (eff.lpConversionRate / 100));
    leads += l;
    const deals = Math.round(l * (eff.closeRate / 100));
    revenue += deals * eff.avgDealSize;
  }
  const cpl = leads > 0 ? Math.round(budget / leads) : 0;
  return { scenario, budget, leads, cpl, revenue };
}

const SCENARIO_ORDER = ["Conservative", "Balanced", "Aggressive"];

function sortScenarios(scenarios: Scenario[]): Scenario[] {
  return [...scenarios].sort((a, b) => {
    const ai = SCENARIO_ORDER.indexOf(a.name);
    const bi = SCENARIO_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ForecastPage() {
  const { activeProject, activeScenario, scenarios: allScenarios } = useAppContext();
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

  // Effective assumptions with scenario multipliers applied
  const effectiveAssumptions = useMemo(
    () => scenario ? applyScenario(assumptions, scenario) : assumptions,
    [assumptions, scenario]
  );

  // Countries from the project that actually have keyword data
  const inScopeCountries = useMemo(
    () => effectiveAssumptions.targetCountries.filter((c) => (KEYWORD_COUNTRIES as readonly string[]).includes(c)),
    [effectiveAssumptions.targetCountries]
  );

  const missingCountries = useMemo(
    () => effectiveAssumptions.targetCountries.filter((c) => !(KEYWORD_COUNTRIES as readonly string[]).includes(c)),
    [effectiveAssumptions.targetCountries]
  );

  // Keywords with CPC multiplier applied
  const scenarioKws = useMemo(() => {
    const mult = scenario?.cpcMultiplier ?? 1.0;
    return KEYWORDS.map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * mult }));
  }, [scenario]);

  const inScopeKws = useMemo(
    () => scenarioKws.filter((k) => inScopeCountries.includes(k.country)),
    [scenarioKws, inScopeCountries]
  );

  const budgetMap = useMemo(
    () => allocateBudgets(inScopeKws, effectiveAssumptions.monthlyBudget),
    [inScopeKws, effectiveAssumptions.monthlyBudget]
  );

  const rawTotals = useMemo(() => {
    let totalLeads = 0, totalRevenue = 0;
    for (const kw of inScopeKws) {
      if (kw.action === "No") continue;
      const b = budgetMap.get(kw.id) ?? 0;
      const c = b > 0 ? Math.floor(b / kw.suggestedCpc) : 0;
      const l = Math.round(c * (effectiveAssumptions.lpConversionRate / 100));
      const deals = Math.round(l * (effectiveAssumptions.closeRate / 100));
      totalLeads   += l;
      totalRevenue += deals * effectiveAssumptions.avgDealSize;
    }
    return { totalLeads, totalRevenue };
  }, [inScopeKws, budgetMap, effectiveAssumptions]);

  const countryForecasts = useMemo(
    () => buildCountryForecasts(
      inScopeKws, budgetMap, effectiveAssumptions,
      rawTotals.totalRevenue, rawTotals.totalLeads,
      fa.sqlRate / 100,
    ).sort((a, b) => b.revenue - a.revenue),
    [inScopeKws, budgetMap, effectiveAssumptions, rawTotals, fa.sqlRate]
  );

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

  // Scenario comparison — only when project exists and ≥2 scenarios
  const scenarioComparison = useMemo<ScenarioTotals[]>(() => {
    if (!isProjectSet || allScenarios.length < 2) return [];
    return sortScenarios(allScenarios).map((s) =>
      computeScenarioTotals(assumptions, s)
    );
  }, [isProjectSet, allScenarios, assumptions]);

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
            {missingCountries.join(", ")}. Keyword research is currently available for Singapore, Malaysia, Vietnam, and Thailand.
          </p>
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
          Clicks = budget ÷ suggested CPC · Leads = clicks × LP CVR · SQL = leads × 50% · Deals = leads × close rate · Revenue = deals × avg deal size.
          Actual results depend on ad quality, landing page performance, and market conditions.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Total Budget"  value={`$${totals.budget.toLocaleString()}`}   sub="allocated to Buy + Test"   accent />
        <KpiCard label="Proj. Clicks"  value={totals.clicks.toLocaleString()}          sub="across all countries"             />
        <KpiCard label="Proj. Leads"   value={totals.leads.toLocaleString()}           sub={`${effectiveAssumptions.lpConversionRate.toFixed(2)}% LP CVR`} />
        <KpiCard label="Proj. CPL"     value={totals.cpl > 0 ? `$${totals.cpl.toLocaleString()}` : "—"} sub="cost per lead"  />
        <KpiCard label="Proj. SQL"     value={totals.sql.toLocaleString()}             sub={`${fa.sqlRate}% of leads`}    />
        <KpiCard label="Proj. Deals"   value={totals.deals.toLocaleString()}           sub={`${effectiveAssumptions.closeRate}% close rate`} />
        <KpiCard label="Proj. Revenue" value={totals.revenue > 0 ? `$${totals.revenue.toLocaleString()}` : "—"} sub={`${roi}× budget ROI`} />
      </div>

      {/* Scenario comparison table */}
      {scenarioComparison.length >= 2 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Scenario Comparison</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Side-by-side projection across all scenarios — based on your project&apos;s base assumptions.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Scenario</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Budget</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Leads</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">CPL</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Revenue</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">Budget ×</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">CVR ×</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">CPC ×</th>
                </tr>
              </thead>
              <tbody>
                {scenarioComparison.map((row, i) => {
                  const isActive = row.scenario.id === scenario?.id;
                  return (
                    <tr
                      key={row.scenario.id}
                      className={`border-t border-slate-50 transition-colors ${
                        isActive ? "bg-brand-50/60" : i % 2 !== 0 ? "bg-slate-50/30" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          {row.scenario.name}
                          {isActive && (
                            <span className="rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5">Active</span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-700 whitespace-nowrap font-medium">
                        ${row.budget.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-emerald-600">{row.leads}</span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-700 whitespace-nowrap">
                        {row.cpl > 0 ? `$${row.cpl.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums whitespace-nowrap">
                        <span className="font-semibold text-brand-600">
                          {row.revenue > 0 ? `$${row.revenue.toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-500 whitespace-nowrap text-xs">
                        ×{row.scenario.budgetMultiplier.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-500 whitespace-nowrap text-xs">
                        ×{row.scenario.cvrMultiplier.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-500 whitespace-nowrap text-xs">
                        ×{row.scenario.cpcMultiplier.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Switch scenarios using the ⚗ selector in the header. Manage scenarios from the{" "}
              {activeProject
                ? <Link href={`/projects/${activeProject.id}/scenarios`} className="text-brand-500 hover:text-brand-700 font-semibold">scenarios page →</Link>
                : "project settings."
              }
            </p>
          </div>
        </div>
      )}

      {/* Charts 2 × 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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
      </div>

      {/* Forecast Table by Country */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
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
      </div>

    </div>
  );
}
