"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, FileText, Info, Printer, Settings2 } from "lucide-react";
import {
  projectToAssumptions,
  PROJECT_DEFAULTS,
  type ProjectAssumptions,
} from "@/lib/projectStore";
import {
  KEYWORDS,
  KEYWORD_COUNTRIES,
  type Intent,
  type CompetitorPressure,
  type CompetitiveDifficulty,
  type PriorityLevel,
  type EnrichedKeyword,
  type CountryForecast,
} from "@/lib/keywordEngine";
import { allocateBudgets, enrichKeyword, buildCountryForecasts } from "@/lib/forecastEngine";
import { buildMatchTypeModifiers } from "@/lib/forecastAssumptionsStore";
import {
  getForecastAssumptions,
  DEFAULT_FORECAST_ASSUMPTIONS,
  type ForecastAssumptions,
} from "@/lib/forecastAssumptionsStore";
import { applyScenario } from "@/lib/scenarioStore";
import { saveSnapshot } from "@/lib/snapshotStore";
import { useAppContext } from "@/context/AppContext";
import { buildPlanningWarnings, type PlanningWarning } from "@/lib/planningWarnings";

// ─── Market recommendation copy ───────────────────────────────────────────────

const COUNTRY_NOTES: Record<string, { high: string; test: string; low: string }> = {
  Singapore: {
    high: "Singapore is the highest-intent market in this portfolio. Commercial and transactional keywords show strong buyer signals with above-average CPC, justified by deal value. Recommend allocating the largest budget share here, maintaining exact match discipline to protect against broad click waste, and scheduling weekly bid reviews.",
    test: "Singapore shows moderate opportunity but elevated CPC levels relative to returns in the current keyword set. Recommend a controlled budget with a focus on exact match transactional terms before scaling.",
    low:  "Limited keyword opportunity identified for Singapore at current budget levels. Recommend revisiting once keyword list is expanded or budget is increased.",
  },
  Malaysia: {
    high: "Malaysia offers a strong cost-per-click advantage versus Singapore with healthy commercial search volume. The recruitment and EOR segments are well-represented. Recommend scaling Buy keywords aggressively and monitoring headhunter terms in a controlled test phase.",
    test: "Malaysia presents a cost-efficient opportunity for a test-and-learn campaign. CPCs are significantly lower than Singapore — use this market to gather conversion data before committing full budget.",
    low:  "Minimal keyword opportunity surfaced for Malaysia given current targeting parameters. Consider expanding to Kuala Lumpur and Penang geo-qualifiers.",
  },
  Vietnam: {
    high: "Vietnam represents the strongest cost-efficiency in this portfolio — CPCs are a fraction of regional equivalents with growing market demand. Early market presence here offers significant first-mover advantage. Recommend treating Vietnam as a priority growth market for EOR and recruitment services.",
    test: "Vietnam is an emerging market with very low CPC and rising search demand. Test with a limited budget to qualify lead quality before scaling. Expected CPL is the lowest in the portfolio.",
    low:  "Vietnam keyword data is limited in scope. Recommend expanding research to Vietnamese-language terms to unlock the full opportunity in this market.",
  },
  Thailand: {
    high: "Thailand shows promising demand for executive search and EOR services, particularly in the Bangkok metro. MNC buyer intent is evident in the keyword patterns. Recommend prioritising exact match EOR and executive search terms and monitoring closely in the first 30 days.",
    test: "Thailand is suitable as a secondary test market. Payroll outsourcing terms show adjacent intent that may need qualifier landing pages. Set clear cost-per-lead thresholds before scaling.",
    low:  "Thailand keyword volume is moderate. Recommend starting with a small test budget focused on Employer of Record terms before broadening scope.",
  },
};

function getCountryNote(country: string, priority: PriorityLevel): string {
  const notes = COUNTRY_NOTES[country];
  if (!notes) return "Market recommendation data not yet available for this country.";
  return priority === "High Priority" ? notes.high : priority === "Test Market" ? notes.test : notes.low;
}

// ─── Executive summary generation ─────────────────────────────────────────────

function buildExecSummary(
  assumptions: ProjectAssumptions,
  totals: { leads: number; deals: number; revenue: number; clicks: number },
  countryForecasts: CountryForecast[],
  buyCount: number,
  testCount: number,
  inScopeCountries: string[],
): string {
  const roi = totals.revenue > 0 && assumptions.monthlyBudget > 0
    ? (totals.revenue / assumptions.monthlyBudget).toFixed(1) + "×"
    : "an estimated positive";
  const highPri = countryForecasts.filter((c) => c.priority === "High Priority").map((c) => c.country);
  const highPriStr = highPri.length > 0 ? highPri.join(" and ") : inScopeCountries[0] ?? "the target markets";
  const lowestCpcCountry = [...countryForecasts].sort((a, b) => (a.cpl || 9999) - (b.cpl || 9999))[0]?.country ?? "";
  const highestVolumeCountry = [...countryForecasts].sort((a, b) => b.clicks - a.clicks)[0]?.country ?? "";
  const projectLabel = assumptions.projectName ? `the "${assumptions.projectName}" campaign` : "this SEM programme";

  const para1 = `Based on a monthly SEM investment of $${assumptions.monthlyBudget.toLocaleString()}, ${projectLabel} recommends a ${inScopeCountries.length}-market paid search strategy targeting ${inScopeCountries.join(", ")}. Our keyword decision engine has identified ${buyCount} high-priority keywords recommended for immediate activation and ${testCount} candidates for controlled testing, spanning recruitment, staffing, executive search, employer of record (EOR), and HR consulting search intent.`;

  const para2 = `At a projected landing page conversion rate of ${assumptions.lpConversionRate}% and a ${assumptions.closeRate}% sales close rate against an average deal value of $${assumptions.avgDealSize.toLocaleString()}, this programme is forecast to generate approximately ${totals.leads} qualified leads, ${totals.deals} closed deals, and $${totals.revenue.toLocaleString()} in revenue pipeline within a single 30-day cycle — representing ${roi} return on monthly ad spend.`;

  const para3Parts: string[] = [];
  if (highPriStr) para3Parts.push(`${highPriStr} ${highPri.length === 1 ? "has been identified" : "have been identified"} as the highest-priority ${highPri.length === 1 ? "market" : "markets"} by revenue potential and opportunity score.`);
  if (lowestCpcCountry && lowestCpcCountry !== highestVolumeCountry) para3Parts.push(`${lowestCpcCountry} presents the strongest cost-per-lead efficiency in the portfolio.`);
  if (highestVolumeCountry) para3Parts.push(`${highestVolumeCountry} carries the highest click volume, offering maximum top-of-funnel reach.`);
  para3Parts.push(`We recommend a phased launch approach: activate Buy keywords in week one, review performance by day 14, and scale or pause Test keywords based on observed CPL.`);

  return [para1, para2, para3Parts.join(" ")].join("\n\n");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-slate-100 print:border-slate-200">
      <span className="mt-0.5 w-6 h-6 rounded-md bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 print:bg-slate-800">{number}</span>
      <div>
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function AssumptionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}

const PRIORITY_STYLES: Record<PriorityLevel, { badge: string; border: string }> = {
  "High Priority": { badge: "bg-emerald-50 text-emerald-700 border-emerald-100", border: "border-l-emerald-400" },
  "Test Market":   { badge: "bg-amber-50 text-amber-700 border-amber-100",       border: "border-l-amber-400"   },
  "Low Priority":  { badge: "bg-slate-50 text-slate-500 border-slate-100",        border: "border-l-slate-200"   },
};
const PRIORITY_ICON: Record<PriorityLevel, string> = { "High Priority": "▲", "Test Market": "◐", "Low Priority": "○" };

const INTENT_STYLES: Record<Intent, string> = {
  Commercial:    "bg-violet-50 text-violet-600 border-violet-100",
  Transactional: "bg-emerald-50 text-emerald-600 border-emerald-100",
  Informational: "bg-sky-50 text-sky-600 border-sky-100",
  Navigational:  "bg-amber-50 text-amber-600 border-amber-100",
};

const PRESSURE_STYLES: Record<CompetitorPressure, string> = {
  Low:    "bg-emerald-50 text-emerald-600 border-emerald-100",
  Medium: "bg-amber-50 text-amber-600 border-amber-100",
  High:   "bg-rose-50 text-rose-600 border-rose-100",
};

const DIFFICULTY_STYLES: Record<CompetitiveDifficulty, string> = {
  Easy:     "bg-emerald-50 text-emerald-700 border-emerald-100",
  Moderate: "bg-amber-50  text-amber-700  border-amber-100",
  Hard:     "bg-rose-50   text-rose-700   border-rose-100",
};

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${className}`}>{label}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { activeProject, activeScenario, calibratedCvr } = useAppContext();
  const scenario     = activeScenario;
  const isProjectSet = activeProject !== null;
  const assumptions: ProjectAssumptions = useMemo(
    () => activeProject ? projectToAssumptions(activeProject) : PROJECT_DEFAULTS,
    [activeProject],
  );
  const [reportDate] = useState(() =>
    new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
  );
  const [snapSaved, setSnapSaved] = useState(false);
  const [fa, setFa] = useState<ForecastAssumptions>(DEFAULT_FORECAST_ASSUMPTIONS);
  useEffect(() => {
    const projectId = activeProject?.id ?? "default";
    setFa(getForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    ));
  }, [activeProject]);

  // Apply scenario multipliers to base assumptions
  const effectiveAssumptions = useMemo(
    () => scenario ? applyScenario(assumptions, scenario) : assumptions,
    [assumptions, scenario]
  );

  const inScopeCountries = useMemo(
    () => effectiveAssumptions.targetCountries.filter((c) => (KEYWORD_COUNTRIES as readonly string[]).includes(c)),
    [effectiveAssumptions.targetCountries]
  );


  // Apply CPC multiplier per keyword
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

  const enrichedKws = useMemo(
    () => inScopeKws.filter((k) => k.action !== "No").map((k) => enrichKeyword(k, budgetMap, effectiveAssumptions, {
      matchMods:               buildMatchTypeModifiers(fa),
      brandCvrUplift:          fa.brandCvrUplift,
      competitorCvrDiscount:   fa.competitorCvrDiscount,
      cpcMultiplier:           fa.cpcMultiplier,
      calibratedCvrByCategory: calibratedCvr ?? undefined,
    })),
    [inScopeKws, budgetMap, effectiveAssumptions, fa, calibratedCvr]
  );

  // Raw totals (first pass for priority scoring)
  const rawTotals = useMemo(() => {
    const leads   = enrichedKws.reduce((s, k) => s + k.estimatedLeads, 0);
    const revenue = enrichedKws.reduce((s, k) => s + k.revenuePotential, 0);
    return { leads, revenue };
  }, [enrichedKws]);

  const countryForecasts = useMemo(
    () => buildCountryForecasts(inScopeKws, budgetMap, effectiveAssumptions, rawTotals.revenue, rawTotals.leads, fa.sqlRate / 100)
          .sort((a, b) => b.revenue - a.revenue),
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

  // Keyword table: top 8 Buy + all Test, sorted by opportunity score
  const buyKws    = useMemo(() => enrichedKws.filter((k) => k.action === "Buy").sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 8), [enrichedKws]);
  const testKws   = useMemo(() => enrichedKws.filter((k) => k.action === "Test").sort((a, b) => b.opportunityScore - a.opportunityScore), [enrichedKws]);
  const reportKws = useMemo(() => [...buyKws, ...testKws], [buyKws, testKws]);

  const buyCount  = useMemo(() => inScopeKws.filter((k) => k.action === "Buy").length,  [inScopeKws]);
  const testCount = useMemo(() => inScopeKws.filter((k) => k.action === "Test").length, [inScopeKws]);

  const execSummary = useMemo(
    () => buildExecSummary(effectiveAssumptions, totals, countryForecasts, buyCount, testCount, inScopeCountries),
    [effectiveAssumptions, totals, countryForecasts, buyCount, testCount, inScopeCountries]
  );

  const roi = totals.revenue > 0 && totals.budget > 0
    ? (totals.revenue / totals.budget).toFixed(1)
    : "—";

  const totalBudgetPct = (v: number) => totals.budget > 0 ? Math.round((v / totals.budget) * 100) : 0;

  // Competitor intelligence — derived from enriched keywords in scope
  const compIntel = useMemo(() => {
    const active = enrichedKws; // already filtered to action !== "No"
    const highPressureKws = [...active]
      .sort((a, b) => b.competitorPressureScore - a.competitorPressureScore)
      .slice(0, 5);
    const easyOpportunityKws = [...active]
      .filter((k) => k.competitiveDifficulty === "Easy")
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 5);
    const avgPressure = active.length > 0
      ? Math.round(active.reduce((s, k) => s + k.competitorPressureScore, 0) / active.length)
      : 0;
    const hardCount = active.filter((k) => k.competitiveDifficulty === "Hard").length;
    const easyCount = active.filter((k) => k.competitiveDifficulty === "Easy").length;
    return { highPressureKws, easyOpportunityKws, avgPressure, hardCount, easyCount };
  }, [enrichedKws]);

  const planningWarnings = useMemo(
    () => isProjectSet ? buildPlanningWarnings(effectiveAssumptions, enrichedKws, inScopeCountries) : [],
    [effectiveAssumptions, enrichedKws, inScopeCountries, isProjectSet]
  );

  const handleSaveSnapshot = useCallback(() => {
    const title = `${effectiveAssumptions.projectName || "Report"} — ${
      scenario?.name ?? "Default"
    } · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

    saveSnapshot({
      projectId:           activeProject?.id    ?? "",
      scenarioId:          scenario?.id         ?? null,
      scenarioName:        scenario?.name       ?? null,
      title,
      assumptions:         effectiveAssumptions,
      forecastAssumptions: fa,
      summary: {
        budget:     totals.budget,
        clicks:     totals.clicks,
        leads:      totals.leads,
        sql:        totals.sql,
        deals:      totals.deals,
        revenue:    totals.revenue,
        cpl:        totals.cpl,
        buyBudget:  totals.buyBudget,
        testBudget: totals.testBudget,
        roi,
      },
      topKeywords: reportKws.map((k) => ({
        id:                     k.id,
        keyword:                k.keyword,
        country:                k.country,
        action:                 k.action,
        intent:                 k.intent,
        opportunityScore:       k.opportunityScore,
        suggestedCpc:           k.suggestedCpc,
        suggestedMonthlyBudget: k.suggestedMonthlyBudget,
        estimatedClicks:        k.estimatedClicks,
        estimatedLeads:         k.estimatedLeads,
        estimatedCpl:           k.estimatedCpl,
        revenuePotential:       k.revenuePotential,
      })),
      forecastTable: countryForecasts,
    });

    setSnapSaved(true);
    setTimeout(() => setSnapSaved(false), 3000);
  }, [activeProject, scenario, effectiveAssumptions, totals, roi, reportKws, countryForecasts]);

  return (
    <>
      {/* Print styles — hides layout chrome, sets page margins */}
      <style>{`
        @media print {
          aside, header { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }
          body { background: white !important; }
          .print-hide { display: none !important; }
          @page { margin: 0.75in; size: A4; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto space-y-8">

        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SEM Campaign Report</h1>
            <p className="text-sm text-slate-400 mt-1">
              {assumptions.projectName
                ? <><span className="text-slate-600 font-medium">{assumptions.projectName}</span> · </>
                : null}
              {scenario ? <><span className="text-brand-600 font-semibold">⚗ {scenario.name}</span> · </> : null}
              Prepared by Elitez Digital{reportDate ? ` · ${reportDate}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 print-hide">
            <Link
              href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors"
            >
              <Settings2 size={12} /> Edit Project
            </Link>
            <button
              onClick={handleSaveSnapshot}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                snapSaved
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-500"
              }`}
            >
              {snapSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              {snapSaved ? "Saved!" : "Save Snapshot"}
            </button>
            <Link
              href="/reports/export"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors shadow-sm"
            >
              <FileText size={13} /> Export Proposal
            </Link>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors"
            >
              <Printer size={13} /> Print
            </button>
          </div>
        </div>

        {/* Nudges */}
        {!isProjectSet && (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 print-hide">
            <Info size={15} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              <span className="font-semibold">Using default assumptions.</span>{" "}
              <Link href="/projects/new" className="underline font-semibold hover:text-amber-900">Create a project →</Link> to personalise this report.
            </p>
          </div>
        )}
        {planningWarnings.length > 0 && (
          <div className="space-y-2 print-hide">
            {planningWarnings.map((w: PlanningWarning) => {
              const isError = w.level === "error";
              const isInfo  = w.level === "info";
              const colors  = isError
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : isInfo
                ? "bg-slate-50 border-slate-200 text-slate-600"
                : "bg-amber-50 border-amber-200 text-amber-700";
              const iconColor = isError ? "text-rose-400" : isInfo ? "text-slate-400" : "text-amber-400";
              return (
                <div key={w.id} className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 ${colors}`}>
                  <Info size={15} className={`mt-0.5 shrink-0 ${iconColor}`} />
                  <div>
                    <p className="text-xs font-semibold">{w.title}</p>
                    <p className="text-xs leading-relaxed mt-0.5 opacity-90">{w.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Section 1: Executive Summary ── */}
        <section className="space-y-4">
          <SectionHeader number="1" title="Executive Summary" />
          <div className="bg-slate-900 rounded-2xl overflow-hidden print:bg-white print:border print:border-slate-300">
            <div className="px-6 py-4 flex flex-wrap gap-x-8 gap-y-2 border-b border-slate-700 print:border-slate-200">
              {[
                { label: "Monthly Budget", value: `$${totals.budget.toLocaleString()}` },
                { label: "Proj. Leads",    value: String(totals.leads)                 },
                { label: "Proj. Deals",    value: String(totals.deals)                 },
                { label: "Proj. Revenue",  value: totals.revenue > 0 ? `$${totals.revenue.toLocaleString()}` : "—" },
                { label: "Est. ROI",       value: roi !== "—" ? `${roi}×` : "—"        },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-slate-400 print:text-slate-500">{label}</p>
                  <p className="text-sm font-bold text-white print:text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-5 space-y-4">
              {execSummary.split("\n\n").map((para, i) => (
                <p key={i} className="text-sm text-slate-300 leading-relaxed print:text-slate-700">{para}</p>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 2: Project Assumptions ── */}
        <section className="space-y-4">
          <SectionHeader number="2" title="Project Assumptions" subtitle="Inputs used to generate all projections in this report" />
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {scenario && (
              <div className="px-6 py-3 bg-brand-50 border-b border-brand-100 flex items-center gap-2">
                <span className="text-xs font-bold text-brand-700">⚗ Scenario: {scenario.name}</span>
                <span className="text-xs text-brand-500">
                  Budget ×{scenario.budgetMultiplier.toFixed(2)} · CVR ×{scenario.cvrMultiplier.toFixed(2)} · CPC ×{scenario.cpcMultiplier.toFixed(2)}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-50">
              <div className="px-6 py-4">
                <AssumptionRow label="Project Name"            value={effectiveAssumptions.projectName || "—"} />
                <AssumptionRow label="Monthly Budget"          value={`$${effectiveAssumptions.monthlyBudget.toLocaleString()}/mo`} />
                <AssumptionRow label="Landing Page CVR"        value={`${effectiveAssumptions.lpConversionRate.toFixed(2)}%`} />
                <AssumptionRow label="SQL Rate"                value={`${fa.sqlRate}% of leads`} />
              </div>
              <div className="px-6 py-4">
                <AssumptionRow label="Close Rate"              value={`${effectiveAssumptions.closeRate}%`} />
                <AssumptionRow label="Average Deal Size"       value={`$${effectiveAssumptions.avgDealSize.toLocaleString()}`} />
                <AssumptionRow label="Countries in Scope"      value={inScopeCountries.length > 0 ? inScopeCountries.join(", ") : "—"} />
                <AssumptionRow label="Budget Allocation Split" value="Buy 85% · Test 15%" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 3: Budget Allocation Summary ── */}
        <section className="space-y-4">
          <SectionHeader number="3" title="Budget Allocation Summary" subtitle="How the monthly budget is distributed across markets and campaign types" />

          {/* Buy vs Test split */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Buy vs Test Split</p>
            {totals.budget > 0 ? (
              <>
                <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${Math.round(totals.buyBudget / totals.budget * 100)}%` }} />
                  <div className="bg-amber-400 transition-all" style={{ width: `${Math.round(totals.testBudget / totals.budget * 100)}%` }} />
                </div>
                <div className="flex flex-wrap gap-6 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                    Buy — ${totals.buyBudget.toLocaleString()} ({Math.round(totals.buyBudget / totals.budget * 100)}%)
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 shrink-0" />
                    Test — ${totals.testBudget.toLocaleString()} ({Math.round(totals.testBudget / totals.budget * 100)}%)
                  </span>
                </div>
              </>
            ) : <p className="text-xs text-slate-400">No budget allocated yet.</p>}
          </div>

          {/* By country */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Country", "Buy Budget", "Test Budget", "Total Budget", "% of Total"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countryForecasts.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">No data for selected countries.</td></tr>
                ) : (
                  <>
                    {countryForecasts.map((c, i) => (
                      <tr key={c.country} className={`border-t border-slate-50 ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                        <td className="px-5 py-3 font-semibold text-slate-800">{c.country}</td>
                        <td className="px-5 py-3 tabular-nums text-slate-700">${c.buyBudget.toLocaleString()}</td>
                        <td className="px-5 py-3 tabular-nums text-slate-700">${c.testBudget.toLocaleString()}</td>
                        <td className="px-5 py-3 tabular-nums font-semibold text-slate-800">${c.budget.toLocaleString()}</td>
                        <td className="px-5 py-3 tabular-nums text-slate-500">{totalBudgetPct(c.budget)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Total</td>
                      <td className="px-5 py-3 tabular-nums text-xs font-bold text-slate-800">${totals.buyBudget.toLocaleString()}</td>
                      <td className="px-5 py-3 tabular-nums text-xs font-bold text-slate-800">${totals.testBudget.toLocaleString()}</td>
                      <td className="px-5 py-3 tabular-nums text-xs font-bold text-slate-800">${totals.budget.toLocaleString()}</td>
                      <td className="px-5 py-3 text-xs font-bold text-slate-800">100%</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 4: Top Recommended Keywords ── */}
        <section className="space-y-4">
          <SectionHeader number="4" title="Top Recommended Keywords" subtitle={`Showing top ${buyKws.length} Buy and ${testKws.length} Test keywords by opportunity score`} />
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {["Keyword", "Country", "Intent", "Sug. CPC", "Sug. Budget", "Est. Clicks", "Est. Leads", "Est. CPL", "Rev. Potential", "Pressure"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Buy section */}
                  {buyKws.length > 0 && (
                    <tr className="bg-emerald-50/60 border-t border-emerald-100">
                      <td colSpan={10} className="px-4 py-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                        ● Buy Keywords
                      </td>
                    </tr>
                  )}
                  {buyKws.map((kw: EnrichedKeyword, i) => (
                    <tr key={kw.id} className={`border-t border-slate-50 hover:bg-slate-50/60 border-l-2 border-l-emerald-400 ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[180px]">
                        <span className="block truncate text-xs" title={kw.keyword}>{kw.keyword}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{kw.country}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge label={kw.intent} className={INTENT_STYLES[kw.intent]} /></td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate-700 whitespace-nowrap">${kw.suggestedCpc.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums text-xs font-semibold text-slate-800 whitespace-nowrap">${kw.suggestedMonthlyBudget.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate-700 whitespace-nowrap">{kw.estimatedClicks > 0 ? kw.estimatedClicks : "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                        {kw.estimatedLeads > 0 ? <span className="font-semibold text-emerald-600">{kw.estimatedLeads}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate-700 whitespace-nowrap">{kw.estimatedCpl > 0 ? `$${kw.estimatedCpl}` : "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                        {kw.revenuePotential > 0 ? <span className="font-semibold text-brand-600">${kw.revenuePotential.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge label={kw.competitorPressure} className={PRESSURE_STYLES[kw.competitorPressure]} /></td>
                    </tr>
                  ))}

                  {/* Test section */}
                  {testKws.length > 0 && (
                    <tr className="bg-amber-50/60 border-t border-amber-100">
                      <td colSpan={10} className="px-4 py-1.5 text-xs font-bold text-amber-700 uppercase tracking-wider">
                        ◐ Test Keywords
                      </td>
                    </tr>
                  )}
                  {testKws.map((kw: EnrichedKeyword, i) => (
                    <tr key={kw.id} className={`border-t border-slate-50 hover:bg-slate-50/60 border-l-2 border-l-amber-400 ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[180px]">
                        <span className="block truncate text-xs" title={kw.keyword}>{kw.keyword}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{kw.country}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge label={kw.intent} className={INTENT_STYLES[kw.intent]} /></td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate-700 whitespace-nowrap">${kw.suggestedCpc.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums text-xs font-semibold text-slate-800 whitespace-nowrap">${kw.suggestedMonthlyBudget.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate-700 whitespace-nowrap">{kw.estimatedClicks > 0 ? kw.estimatedClicks : "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                        {kw.estimatedLeads > 0 ? <span className="font-semibold text-emerald-600">{kw.estimatedLeads}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs text-slate-700 whitespace-nowrap">{kw.estimatedCpl > 0 ? `$${kw.estimatedCpl}` : "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                        {kw.revenuePotential > 0 ? <span className="font-semibold text-brand-600">${kw.revenuePotential.toLocaleString()}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><Badge label={kw.competitorPressure} className={PRESSURE_STYLES[kw.competitorPressure]} /></td>
                    </tr>
                  ))}

                  {reportKws.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">No keywords available for selected countries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Section 5: Competitor Intelligence ── */}
        <section className="space-y-4">
          <SectionHeader
            number="5"
            title="Competitor Intelligence"
            subtitle="Competitive pressure analysis across active keywords — identifies where to push hard and where to take easy wins"
          />

          {/* Overview stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Avg Pressure Score", value: String(compIntel.avgPressure), sub: "/ 100 across active keywords", accent: false },
              { label: "Hard-Difficulty Keywords", value: String(compIntel.hardCount), sub: "High competition — requires aggressive bidding", accent: false },
              { label: "Easy Opportunity Keywords", value: String(compIntel.easyCount), sub: "Low competition — first-mover advantage available", accent: false },
              { label: "Easy vs Hard Ratio", value: compIntel.hardCount > 0 ? `${(compIntel.easyCount / compIntel.hardCount).toFixed(1)}×` : "—", sub: "More easy wins = lower avg CPL", accent: false },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-400 leading-snug">{sub}</p>
              </div>
            ))}
          </div>

          {/* High-pressure keywords */}
          {compIntel.highPressureKws.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-rose-50/50">
                <p className="text-xs font-bold uppercase tracking-wider text-rose-600">⚠ High-Pressure Keywords — Require Defensive Strategy</p>
                <p className="text-xs text-slate-400 mt-0.5">Top {compIntel.highPressureKws.length} keywords by competitor pressure score. These face the most active competitor bidding.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {["Keyword", "Country", "Pressure Score", "Difficulty", "Competitors", "Strategy"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compIntel.highPressureKws.map((kw: EnrichedKeyword, i) => (
                      <tr key={kw.id} className={`border-t border-slate-50 border-l-2 border-l-rose-400 ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                        <td className="px-4 py-3 text-xs font-medium text-slate-800 max-w-[180px]">
                          <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{kw.country}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-bold tabular-nums ${kw.competitorPressureScore >= 70 ? "text-rose-600" : "text-amber-600"}`}>
                            {kw.competitorPressureScore}
                          </span>
                          <span className="text-xs text-slate-300"> / 100</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge label={kw.competitiveDifficulty} className={DIFFICULTY_STYLES[kw.competitiveDifficulty]} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {kw.competitorExamples.slice(0, 2).map((c) => (
                              <span key={c} className="text-xs bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded whitespace-nowrap">{c}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-500 leading-relaxed max-w-[260px]">{kw.strategyNote}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Easy opportunity keywords */}
          {compIntel.easyOpportunityKws.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-emerald-50/50">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">✓ Easy Opportunity Keywords — First-Mover Advantage Available</p>
                <p className="text-xs text-slate-400 mt-0.5">Low competitive difficulty with active Buy or Test recommendation. Capture these now before competitors scale into the space.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {["Keyword", "Country", "Pressure Score", "Action", "Sug. Budget", "Est. Leads", "Strategy"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compIntel.easyOpportunityKws.map((kw: EnrichedKeyword, i) => (
                      <tr key={kw.id} className={`border-t border-slate-50 border-l-2 border-l-emerald-400 ${i % 2 !== 0 ? "bg-slate-50/30" : ""}`}>
                        <td className="px-4 py-3 text-xs font-medium text-slate-800 max-w-[180px]">
                          <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{kw.country}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs font-bold tabular-nums text-emerald-600">{kw.competitorPressureScore}</span>
                          <span className="text-xs text-slate-300"> / 100</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${kw.action === "Buy" ? "bg-emerald-500 text-white border-emerald-500" : "bg-amber-400 text-white border-amber-400"}`}>
                            {kw.action === "Buy" ? "● Buy" : "◐ Test"}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {kw.suggestedMonthlyBudget > 0 ? `$${kw.suggestedMonthlyBudget.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                          {kw.estimatedLeads > 0 ? <span className="font-semibold text-emerald-600">{kw.estimatedLeads}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-500 leading-relaxed max-w-[260px]">{kw.strategyNote}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {compIntel.highPressureKws.length === 0 && compIntel.easyOpportunityKws.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 px-6 py-8 text-center text-sm text-slate-400">
              No keyword data available for selected countries.
            </div>
          )}
        </section>

        {/* ── Section 6: Market Recommendations ── */}
        <section className="space-y-4">
          <SectionHeader number="6" title="Market Recommendations" subtitle="Strategic recommendation per target market based on opportunity scoring and revenue potential" />
          <div className="space-y-3">
            {countryForecasts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 px-6 py-8 text-center text-sm text-slate-400">
                No countries in scope. Add Singapore, Malaysia, Vietnam, or Thailand to your project.
              </div>
            ) : (
              countryForecasts.map((c) => {
                const { badge, border } = PRIORITY_STYLES[c.priority];
                return (
                  <div key={c.country} className={`bg-white rounded-2xl border border-slate-100 border-l-4 ${border} p-5`}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-800">{c.country}</h3>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${badge}`}>
                              {PRIORITY_ICON[c.priority]} {c.priority}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-2xl">
                            {getCountryNote(c.country, c.priority)}
                          </p>
                        </div>
                      </div>
                      {/* Mini metrics */}
                      <div className="flex gap-6 shrink-0 sm:text-right">
                        {[
                          { label: "Budget",  value: `$${c.budget.toLocaleString()}` },
                          { label: "Leads",   value: String(c.leads)                 },
                          { label: "Revenue", value: c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—" },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-xs text-slate-400">{label}</p>
                            <p className="text-sm font-bold text-slate-800">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ── Section 6: Risks / Forecast Notes ── */}
        <section className="space-y-4">
          <SectionHeader number="6" title="Risks & Forecast Notes" subtitle="Important caveats that apply to all projected figures in this report" />
          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
            {[
              {
                title: "All figures are forecast estimates",
                body:  `Projected clicks, leads, deals, and revenue are modelled outputs based on assumed CTRs derived from match type (Exact 5% · Phrase 4% · Broad 3%) and the landing page conversion rate of ${assumptions.lpConversionRate}% entered in project assumptions. They represent a planning benchmark, not a performance guarantee.`,
              },
              {
                title: "Competitor activity may shift CPC",
                body:  "Suggested CPCs are based on observed market benchmarks at the time of research. High-competition keywords — particularly in the Singapore recruitment segment — are subject to auction volatility. CPCs may increase by 15–30% during peak hiring seasons (Q1 and Q3). Budget buffers of 10–15% are recommended.",
              },
              {
                title: "Lead quality depends on landing page alignment",
                body:  "Conversion rate assumptions are modelled on industry benchmarks for B2B HR and recruitment services. Actual CPL will be significantly influenced by landing page relevance, offer clarity, and form length. A/B testing landing pages during the first 30 days is strongly recommended before scaling.",
              },
              {
                title: "Test keywords require active monitoring",
                body:  `The ${testCount} keywords classified as Test carry higher uncertainty. They should be activated with daily spend caps and reviewed at the 14-day mark. Pause criteria: CPL exceeding 2× the projected figure, or CTR below 2%.`,
              },
            ].map(({ title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-800">{title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Report footer */}
        <div className="flex items-center justify-between pt-2 pb-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Prepared by <span className="font-semibold text-slate-600">Elitez Digital</span> · SEM Planner v1
          </p>
          <p className="text-xs text-slate-400">
            {reportDate} · Confidential
          </p>
        </div>

      </div>
    </>
  );
}
