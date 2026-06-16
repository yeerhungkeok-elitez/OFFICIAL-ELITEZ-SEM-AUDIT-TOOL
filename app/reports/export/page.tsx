"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, FileText } from "lucide-react";
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
import { applyScenario } from "@/lib/scenarioStore";
import {
  getForecastAssumptions,
  buildMatchTypeModifiers,
  DEFAULT_FORECAST_ASSUMPTIONS,
  type ForecastAssumptions,
} from "@/lib/forecastAssumptionsStore";
import { useAppContext } from "@/context/AppContext";

// ─── Market notes (same as reports page) ─────────────────────────────────────

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

// ─── Exec summary builder ─────────────────────────────────────────────────────

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
  const para2 = `At a projected landing page conversion rate of ${assumptions.lpConversionRate.toFixed(2)}% and a ${assumptions.closeRate}% sales close rate against an average deal value of $${assumptions.avgDealSize.toLocaleString()}, this programme is forecast to generate approximately ${totals.leads} qualified leads, ${totals.deals} closed deals, and $${totals.revenue.toLocaleString()} in revenue pipeline within a single 30-day cycle — representing ${roi} return on monthly ad spend.`;
  const para3Parts: string[] = [];
  if (highPriStr) para3Parts.push(`${highPriStr} ${highPri.length === 1 ? "has been identified" : "have been identified"} as the highest-priority ${highPri.length === 1 ? "market" : "markets"} by revenue potential and opportunity score.`);
  if (lowestCpcCountry && lowestCpcCountry !== highestVolumeCountry) para3Parts.push(`${lowestCpcCountry} presents the strongest cost-per-lead efficiency in the portfolio.`);
  if (highestVolumeCountry) para3Parts.push(`${highestVolumeCountry} carries the highest click volume, offering maximum top-of-funnel reach.`);
  para3Parts.push("We recommend a phased launch approach: activate Buy keywords in week one, review performance by day 14, and scale or pause Test keywords based on observed CPL.");
  return [para1, para2, para3Parts.join(" ")].join("\n\n");
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<PriorityLevel, { badge: string; border: string }> = {
  "High Priority": { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", border: "border-l-emerald-500" },
  "Test Market":   { badge: "bg-amber-50 text-amber-700 border-amber-200",       border: "border-l-amber-400"   },
  "Low Priority":  { badge: "bg-slate-50 text-slate-500 border-slate-200",        border: "border-l-slate-300"   },
};
const PRIORITY_ICON: Record<PriorityLevel, string> = { "High Priority": "▲", "Test Market": "◐", "Low Priority": "○" };

const INTENT_STYLES: Record<Intent, string> = {
  Commercial:    "bg-violet-50 text-violet-700 border-violet-200",
  Transactional: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Informational: "bg-sky-50 text-sky-700 border-sky-200",
  Navigational:  "bg-amber-50 text-amber-700 border-amber-200",
};

const PRESSURE_STYLES: Record<CompetitorPressure, string> = {
  Low:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  High:   "bg-rose-50 text-rose-700 border-rose-200",
};

const DIFFICULTY_STYLES: Record<CompetitiveDifficulty, string> = {
  Easy:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  Moderate: "bg-amber-50 text-amber-700 border-amber-200",
  Hard:     "bg-rose-50 text-rose-700 border-rose-200",
};

// ─── Proposal sub-components ──────────────────────────────────────────────────

function ProposalSectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b-2 border-slate-800 mb-5">
      <span className="mt-0.5 w-7 h-7 rounded bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {number}
      </span>
      <div>
        <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function ProposalSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`avoid-break space-y-4 ${className}`}>
      {children}
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportProposalPage() {
  const { activeProject, activeScenario, calibratedCvr } = useAppContext();
  const scenario     = activeScenario;
  const isProjectSet = activeProject !== null;
  const assumptions: ProjectAssumptions = useMemo(
    () => activeProject ? projectToAssumptions(activeProject) : PROJECT_DEFAULTS,
    [activeProject],
  );
  const projectName = activeProject?.projectName ?? "";
  const [reportDate] = useState(() =>
    new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const [fa, setFa] = useState<ForecastAssumptions>(DEFAULT_FORECAST_ASSUMPTIONS);
  useEffect(() => {
    const projectId = activeProject?.id ?? "default";
    setFa(getForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    ));
  }, [activeProject]);

  const effectiveAssumptions = useMemo(
    () => scenario ? applyScenario(assumptions, scenario) : assumptions,
    [assumptions, scenario]
  );

  const inScopeCountries = useMemo(
    () => effectiveAssumptions.targetCountries.filter((c) => (KEYWORD_COUNTRIES as readonly string[]).includes(c)),
    [effectiveAssumptions.targetCountries]
  );

  const scenarioKws = useMemo(() => {
    const mult = scenario?.cpcMultiplier ?? 1.0;
    return KEYWORDS.map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * mult }));
  }, [scenario]);

  const inScopeKws = useMemo(
    () => scenarioKws.filter((k) => inScopeCountries.includes(k.country)),
    [scenarioKws, inScopeCountries]
  );

  const budgetMap = useMemo(
    () => allocateBudgets(inScopeKws, effectiveAssumptions.monthlyBudget, calibratedCvr ?? undefined),
    [inScopeKws, effectiveAssumptions.monthlyBudget, calibratedCvr]
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

  const rawTotals = useMemo(() => ({
    leads:   enrichedKws.reduce((s, k) => s + k.estimatedLeads,    0),
    revenue: enrichedKws.reduce((s, k) => s + k.revenuePotential,  0),
  }), [enrichedKws]);

  const countryForecasts = useMemo(
    () => buildCountryForecasts(inScopeKws, budgetMap, effectiveAssumptions, rawTotals.revenue, rawTotals.leads, fa.sqlRate / 100, calibratedCvr ?? undefined)
          .sort((a, b) => b.revenue - a.revenue),
    [inScopeKws, budgetMap, effectiveAssumptions, rawTotals, fa.sqlRate]
  );

  const totals = useMemo(() => {
    const budget     = countryForecasts.reduce((s, c) => s + c.budget,     0);
    const clicks     = countryForecasts.reduce((s, c) => s + c.clicks,     0);
    const leads      = countryForecasts.reduce((s, c) => s + c.leads,      0);
    const sql        = countryForecasts.reduce((s, c) => s + c.sql,        0);
    const deals      = countryForecasts.reduce((s, c) => s + c.deals,      0);
    const revenue    = countryForecasts.reduce((s, c) => s + c.revenue,    0);
    const cpl        = leads > 0 ? Math.round(budget / leads) : 0;
    const buyBudget  = countryForecasts.reduce((s, c) => s + c.buyBudget,  0);
    const testBudget = countryForecasts.reduce((s, c) => s + c.testBudget, 0);
    return { budget, clicks, leads, sql, deals, revenue, cpl, buyBudget, testBudget };
  }, [countryForecasts]);

  const buyKws    = useMemo(() => enrichedKws.filter((k) => k.action === "Buy").sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 8), [enrichedKws]);
  const testKws   = useMemo(() => enrichedKws.filter((k) => k.action === "Test").sort((a, b) => b.opportunityScore - a.opportunityScore), [enrichedKws]);
  const buyCount  = useMemo(() => inScopeKws.filter((k) => k.action === "Buy").length,  [inScopeKws]);
  const testCount = useMemo(() => inScopeKws.filter((k) => k.action === "Test").length, [inScopeKws]);

  const execSummary = useMemo(
    () => buildExecSummary(effectiveAssumptions, totals, countryForecasts, buyCount, testCount, inScopeCountries),
    [effectiveAssumptions, totals, countryForecasts, buyCount, testCount, inScopeCountries]
  );

  const roi = totals.budget > 0 && totals.revenue > 0
    ? (totals.revenue / totals.budget).toFixed(1)
    : "—";

  const totalBudgetPct = (v: number) => totals.budget > 0 ? Math.round((v / totals.budget) * 100) : 0;

  const compIntel = useMemo(() => {
    const active = enrichedKws;
    return {
      highPressureKws:    [...active].sort((a, b) => b.competitorPressureScore - a.competitorPressureScore).slice(0, 5),
      easyOpportunityKws: [...active].filter((k) => k.competitiveDifficulty === "Easy").sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 5),
      avgPressure:        active.length > 0 ? Math.round(active.reduce((s, k) => s + k.competitorPressureScore, 0) / active.length) : 0,
      hardCount:          active.filter((k) => k.competitiveDifficulty === "Hard").length,
      easyCount:          active.filter((k) => k.competitiveDifficulty === "Easy").length,
    };
  }, [enrichedKws]);

  const generatedAt = `${reportDate} · Generated by SEM Planner`;

  return (
    <>
      {/* ── Global print + overlay styles ─────────────────────────────────── */}
      <style>{`
        /* Force color printing */
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

        /* Screen: fixed overlay covers sidebar + header */
        .export-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: #f8fafc;
          overflow-y: auto;
        }

        /* Print: un-fix the overlay so it becomes a normal document flow */
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          aside, header, nav { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }

          .export-overlay {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            background: white !important;
            z-index: auto !important;
          }
          .screen-only { display: none !important; }
          .print-only  { display: block !important; }

          /* Page settings */
          @page { margin: 15mm 18mm 20mm 18mm; size: A4; }
          @page :first { margin-top: 0; margin-bottom: 0; margin-left: 0; margin-right: 0; }

          /* Page break helpers */
          .page-break  { page-break-before: always; break-before: page; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }

          /* Footer via CSS counter on each page (except cover) */
          @page :not(:first) {
            @bottom-center {
              content: "Generated by SEM Planner  ·  Confidential";
              font-size: 8pt;
              color: #94a3b8;
            }
            @bottom-right {
              content: counter(page);
              font-size: 8pt;
              color: #94a3b8;
            }
          }

          /* Table print safety */
          table { border-collapse: collapse; width: 100%; }
          thead { display: table-header-group; }
          tr    { page-break-inside: avoid; break-inside: avoid; }
        }

        .print-only { display: none; }
      `}</style>

      <div className="export-overlay">

        {/* ── Screen-only top controls bar ─────────────────────────────────── */}
        <div className="screen-only sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/reports"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft size={13} /> Back to Report
              </Link>
              <span className="text-slate-200 text-sm">|</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <FileText size={13} className="text-brand-400" />
                Export Preview — {projectName || "No project selected"}
                {scenario && <span className="text-brand-500 font-medium"> · {scenario.name}</span>}
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors shadow-sm"
            >
              <Printer size={13} />
              Print / Save as PDF
            </button>
          </div>
        </div>

        {/* ── Document wrapper ─────────────────────────────────────────────── */}
        <div
          ref={contentRef}
          className="screen-only:max-w-4xl screen-only:mx-auto screen-only:px-6 screen-only:pb-16 screen-only:pt-6"
          style={{ maxWidth: "820px", margin: "0 auto", padding: "24px 24px 64px" }}
        >

          {/* ════════════════════════════════════════════════════════════════
              COVER PAGE
          ════════════════════════════════════════════════════════════════ */}
          <div
            className="avoid-break bg-white rounded-2xl overflow-hidden mb-8 shadow-sm border border-slate-200"
            style={{ minHeight: "600px", display: "flex", flexDirection: "column" }}
          >
            {/* Brand header bar */}
            <div
              className="px-8 py-5 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)" }}
            >
              <div>
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-slate-400">Elitez Digital</p>
                <p className="text-[10px] text-slate-500 mt-0.5 tracking-wide">Performance Marketing · SEM Planning</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Prepared</p>
                <p className="text-xs text-slate-400 font-medium">{reportDate}</p>
              </div>
            </div>

            {/* Cover body */}
            <div className="flex-1 px-8 py-10 flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-full px-3 py-1 mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-600">SEM Campaign Proposal</span>
                </div>

                <h1
                  className="font-bold text-slate-900 leading-tight tracking-tight"
                  style={{ fontSize: "clamp(24px, 3vw, 36px)" }}
                >
                  {projectName || "SEM Strategy Proposal"}
                </h1>

                {scenario && (
                  <p className="mt-2 text-sm font-medium text-brand-600">
                    Scenario: {scenario.name}
                    <span className="text-slate-400 font-normal ml-2">
                      Budget ×{scenario.budgetMultiplier.toFixed(2)} · CVR ×{scenario.cvrMultiplier.toFixed(2)} · CPC ×{scenario.cpcMultiplier.toFixed(2)}
                    </span>
                  </p>
                )}

                <p className="mt-3 text-sm text-slate-500">
                  {inScopeCountries.length > 0
                    ? `${inScopeCountries.length}-market strategy · ${inScopeCountries.join(" · ")}`
                    : "Target markets to be configured in project settings."}
                </p>
              </div>

              {/* Key metrics grid */}
              {isProjectSet && totals.budget > 0 && (
                <div className="mt-8">
                  <div
                    className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-xl border border-slate-200"
                    style={{ background: "#f8fafc" }}
                  >
                    {[
                      { label: "Monthly Investment", value: `$${totals.budget.toLocaleString()}` },
                      { label: "Projected Leads",    value: String(totals.leads)                 },
                      { label: "Projected Revenue",  value: totals.revenue > 0 ? `$${totals.revenue.toLocaleString()}` : "—" },
                      { label: "Est. Budget ROI",    value: roi !== "—" ? `${roi}×` : "—"        },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                        <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isProjectSet && (
                <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                  No project configured. Create a project in SEM Planner to generate personalised projections.
                </div>
              )}

              {/* Cover footer */}
              <div className="mt-10 pt-5 border-t border-slate-100 flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Prepared by</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">Elitez Digital</p>
                  <p className="text-xs text-slate-400">elitez.com</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Confidential</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{generatedAt}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 1 — EXECUTIVE SUMMARY
          ════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="1" title="Executive Summary" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              {[
                { label: "Monthly Budget",  value: `$${totals.budget.toLocaleString()}`                               },
                { label: "Proj. Leads",     value: String(totals.leads)                                                },
                { label: "Proj. Deals",     value: String(totals.deals)                                                },
                { label: "Proj. Revenue",   value: totals.revenue > 0 ? `$${totals.revenue.toLocaleString()}` : "—"   },
                { label: "ROI",             value: roi !== "—" ? `${roi}×` : "—"                                      },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-slate-200 p-3 text-center avoid-break">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {execSummary.split("\n\n").map((para, i) => (
                <p key={i} className="text-sm text-slate-600 leading-relaxed">{para}</p>
              ))}
            </div>
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 2 — PROJECT ASSUMPTIONS
          ════════════════════════════════════════════════════════════════ */}
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="2" title="Project Assumptions" subtitle="Inputs used to generate all projections in this report" />
            {scenario && (
              <div className="mb-4 flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2.5">
                <span className="text-xs font-bold text-brand-700">⚗ Scenario: {scenario.name}</span>
                <span className="text-xs text-brand-500">
                  Budget ×{scenario.budgetMultiplier.toFixed(2)} · CVR ×{scenario.cvrMultiplier.toFixed(2)} · CPC ×{scenario.cpcMultiplier.toFixed(2)}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12">
              <div>
                <MetricRow label="Project Name"       value={effectiveAssumptions.projectName || "—"} />
                <MetricRow label="Monthly Budget"     value={`$${effectiveAssumptions.monthlyBudget.toLocaleString()}/mo`} />
                <MetricRow label="Landing Page CVR"   value={`${effectiveAssumptions.lpConversionRate.toFixed(2)}%`} />
                <MetricRow label="SQL Rate"           value={`${fa.sqlRate}% of leads`} />
              </div>
              <div>
                <MetricRow label="Close Rate"         value={`${effectiveAssumptions.closeRate}%`} />
                <MetricRow label="Average Deal Size"  value={`$${effectiveAssumptions.avgDealSize.toLocaleString()}`} />
                <MetricRow label="Countries in Scope" value={inScopeCountries.length > 0 ? inScopeCountries.join(", ") : "—"} />
                <MetricRow label="Budget Allocation"  value="Buy 85% · Test 15%" />
              </div>
            </div>
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 3 — BUDGET ALLOCATION
          ════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="3" title="Budget Allocation" subtitle="Monthly budget distribution across markets and campaign types" />

            {totals.budget > 0 && (
              <div className="mb-5 avoid-break">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Buy vs Test Split</p>
                <div className="flex h-4 rounded overflow-hidden gap-px">
                  <div className="bg-emerald-500" style={{ width: `${Math.round(totals.buyBudget / totals.budget * 100)}%` }} />
                  <div className="bg-amber-400"   style={{ width: `${Math.round(totals.testBudget / totals.budget * 100)}%` }} />
                </div>
                <div className="flex gap-6 mt-2 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shrink-0" /> Buy — ${totals.buyBudget.toLocaleString()} ({Math.round(totals.buyBudget / totals.budget * 100)}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block shrink-0" /> Test — ${totals.testBudget.toLocaleString()} ({Math.round(totals.testBudget / totals.budget * 100)}%)</span>
                </div>
              </div>
            )}

            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Country", "Buy Budget", "Test Budget", "Total", "% of Total"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countryForecasts.map((c, i) => (
                  <tr key={c.country} className={i % 2 !== 0 ? "bg-slate-50" : ""}>
                    <td className="px-4 py-2.5 text-xs font-semibold text-slate-800 border-b border-slate-100">{c.country}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">${c.buyBudget.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">${c.testBudget.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums font-bold text-slate-800 border-b border-slate-100">${c.budget.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500 border-b border-slate-100">{totalBudgetPct(c.budget)}%</td>
                  </tr>
                ))}
                <tr style={{ background: "#f1f5f9" }}>
                  <td className="px-4 py-2.5 text-xs font-bold text-slate-600">Total</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-bold text-slate-800">${totals.buyBudget.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-bold text-slate-800">${totals.testBudget.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums font-bold text-slate-800">${totals.budget.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs font-bold text-slate-800">100%</td>
                </tr>
              </tbody>
            </table>
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 4 — FORECAST SUMMARY
          ════════════════════════════════════════════════════════════════ */}
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="4" title="Forecast Summary" subtitle="Country-level projections — clicks, leads, pipeline revenue, and estimated ROI" />

            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden mb-5">
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Country", "Budget", "Clicks", "Leads", "CPL", "SQL", "Deals", "Revenue", "Priority"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countryForecasts.map((c, i) => {
                  const { badge } = PRIORITY_STYLES[c.priority];
                  return (
                    <tr key={c.country} className={`avoid-break ${i % 2 !== 0 ? "bg-slate-50" : ""}`}>
                      <td className="px-3 py-2.5 text-xs font-semibold text-slate-800 border-b border-slate-100 whitespace-nowrap">{c.country}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">${c.budget.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">{c.clicks.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-emerald-700 border-b border-slate-100">{c.leads}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">{c.cpl > 0 ? `$${c.cpl.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">{c.sql > 0 ? c.sql : "—"}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600 border-b border-slate-100">{c.deals > 0 ? c.deals : "—"}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums font-semibold text-slate-800 border-b border-slate-100">{c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2.5 border-b border-slate-100 whitespace-nowrap">
                        <Badge label={`${PRIORITY_ICON[c.priority]} ${c.priority}`} className={badge} />
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#f1f5f9" }}>
                  <td className="px-3 py-2.5 text-xs font-bold text-slate-600">Total</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-slate-800">${totals.budget.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-slate-800">{totals.clicks.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-emerald-700">{totals.leads}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-slate-800">{totals.cpl > 0 ? `$${totals.cpl.toLocaleString()}` : "—"}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-slate-800">{totals.sql}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-slate-800">{totals.deals}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums font-bold text-slate-800">{totals.revenue > 0 ? `$${totals.revenue.toLocaleString()}` : "—"}</td>
                  <td />
                </tr>
              </tbody>
            </table>

            {/* ROI callout */}
            {roi !== "—" && (
              <div className="flex items-center gap-4 p-4 rounded-lg border border-brand-200 bg-brand-50 avoid-break">
                <div className="text-center px-4 border-r border-brand-200">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">Est. ROI</p>
                  <p className="text-2xl font-bold text-brand-700">{roi}×</p>
                </div>
                <p className="text-xs text-brand-700 leading-relaxed">
                  For every $1 invested in this SEM programme, the model projects ${roi} in revenue pipeline. This assumes a {effectiveAssumptions.closeRate}% close rate on {totals.leads} estimated leads at an average deal value of ${effectiveAssumptions.avgDealSize.toLocaleString()}.
                </p>
              </div>
            )}
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 5 — TOP RECOMMENDED KEYWORDS
          ════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="5" title="Top Recommended Keywords" subtitle={`Top ${buyKws.length} Buy keywords and ${testKws.length} Test keywords by opportunity score`} />

            {buyKws.length > 0 && (
              <div className="mb-5 avoid-break">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Buy Keywords — Immediate Activation</p>
                </div>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr style={{ background: "#f0fdf4" }}>
                      {["Keyword", "Country", "Intent", "Sug. CPC", "Budget", "Clicks", "Leads", "CPL", "Revenue"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-emerald-700 border-b border-emerald-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buyKws.map((kw: EnrichedKeyword, i) => (
                      <tr key={kw.id} className={`avoid-break ${i % 2 !== 0 ? "bg-slate-50" : ""}`}>
                        <td className="px-3 py-2 font-medium text-slate-800 border-b border-slate-100 max-w-[160px]">
                          <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-100 whitespace-nowrap">{kw.country}</td>
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap"><Badge label={kw.intent} className={INTENT_STYLES[kw.intent]} /></td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 border-b border-slate-100">${kw.suggestedCpc.toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-slate-800 border-b border-slate-100">${kw.suggestedMonthlyBudget.toLocaleString()}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 border-b border-slate-100">{kw.estimatedClicks > 0 ? kw.estimatedClicks : "—"}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-emerald-700 border-b border-slate-100">{kw.estimatedLeads > 0 ? kw.estimatedLeads : "—"}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 border-b border-slate-100">{kw.estimatedCpl > 0 ? `$${kw.estimatedCpl}` : "—"}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-slate-800 border-b border-slate-100">{kw.revenuePotential > 0 ? `$${kw.revenuePotential.toLocaleString()}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {testKws.length > 0 && (
              <div className="avoid-break">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Test Keywords — Controlled Evaluation</p>
                </div>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr style={{ background: "#fffbeb" }}>
                      {["Keyword", "Country", "Intent", "Sug. CPC", "Budget", "Clicks", "Leads", "CPL", "Revenue"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-amber-700 border-b border-amber-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {testKws.map((kw: EnrichedKeyword, i) => (
                      <tr key={kw.id} className={`avoid-break ${i % 2 !== 0 ? "bg-slate-50" : ""}`}>
                        <td className="px-3 py-2 font-medium text-slate-800 border-b border-slate-100 max-w-[160px]">
                          <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-100 whitespace-nowrap">{kw.country}</td>
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap"><Badge label={kw.intent} className={INTENT_STYLES[kw.intent]} /></td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 border-b border-slate-100">${kw.suggestedCpc.toFixed(2)}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-slate-800 border-b border-slate-100">${kw.suggestedMonthlyBudget.toLocaleString()}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 border-b border-slate-100">{kw.estimatedClicks > 0 ? kw.estimatedClicks : "—"}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-amber-700 border-b border-slate-100">{kw.estimatedLeads > 0 ? kw.estimatedLeads : "—"}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600 border-b border-slate-100">{kw.estimatedCpl > 0 ? `$${kw.estimatedCpl}` : "—"}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-slate-800 border-b border-slate-100">{kw.revenuePotential > 0 ? `$${kw.revenuePotential.toLocaleString()}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {buyKws.length === 0 && testKws.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">No keyword data available for selected countries.</p>
            )}
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 6 — COMPETITOR INTELLIGENCE
          ════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="6" title="Competitor Intelligence" subtitle="Competitive pressure analysis — where to defend, where to exploit" />

            {/* Overview stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Avg Pressure Score",       value: String(compIntel.avgPressure), sub: "/ 100" },
                { label: "Hard-Difficulty Keywords",  value: String(compIntel.hardCount),   sub: "require aggressive bidding" },
                { label: "Easy Opportunity Keywords", value: String(compIntel.easyCount),   sub: "first-mover advantage" },
                { label: "Easy vs Hard Ratio",        value: compIntel.hardCount > 0 ? `${(compIntel.easyCount / compIntel.hardCount).toFixed(1)}×` : "—", sub: "more easy wins" },
              ].map(({ label, value, sub }) => (
                <div key={label} className="rounded-lg border border-slate-200 p-3 text-center avoid-break">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* High-pressure keywords */}
            {compIntel.highPressureKws.length > 0 && (
              <div className="mb-5 avoid-break">
                <p className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">⚠ High-Pressure Keywords — Defensive Strategy Required</p>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr style={{ background: "#fff1f2" }}>
                      {["Keyword", "Country", "Score", "Difficulty", "Key Competitors", "Strategy Note"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-rose-700 border-b border-rose-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compIntel.highPressureKws.map((kw: EnrichedKeyword, i) => (
                      <tr key={kw.id} className={`avoid-break ${i % 2 !== 0 ? "bg-slate-50" : ""}`}>
                        <td className="px-3 py-2 font-medium text-slate-800 border-b border-slate-100 max-w-[140px]">
                          <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-100 whitespace-nowrap">{kw.country}</td>
                        <td className="px-3 py-2 tabular-nums font-bold text-rose-600 border-b border-slate-100">{kw.competitorPressureScore}</td>
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                          <Badge label={kw.competitiveDifficulty} className={DIFFICULTY_STYLES[kw.competitiveDifficulty]} />
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100">
                          <span className="text-slate-600">{kw.competitorExamples.slice(0, 2).join(", ")}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-100" style={{ maxWidth: "200px" }}>
                          <span className="line-clamp-2 leading-relaxed">{kw.strategyNote.split(".")[0]}.</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Easy opportunity keywords */}
            {compIntel.easyOpportunityKws.length > 0 && (
              <div className="avoid-break">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-2">✓ Easy Opportunity Keywords — First-Mover Advantage</p>
                <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr style={{ background: "#f0fdf4" }}>
                      {["Keyword", "Country", "Score", "Action", "Budget", "Est. Leads", "Strategy Note"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-emerald-700 border-b border-emerald-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compIntel.easyOpportunityKws.map((kw: EnrichedKeyword, i) => (
                      <tr key={kw.id} className={`avoid-break ${i % 2 !== 0 ? "bg-slate-50" : ""}`}>
                        <td className="px-3 py-2 font-medium text-slate-800 border-b border-slate-100 max-w-[140px]">
                          <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-100 whitespace-nowrap">{kw.country}</td>
                        <td className="px-3 py-2 tabular-nums font-bold text-emerald-600 border-b border-slate-100">{kw.competitorPressureScore}</td>
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${kw.action === "Buy" ? "bg-emerald-500 text-white border-emerald-500" : "bg-amber-400 text-white border-amber-400"}`}>
                            {kw.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-slate-800 border-b border-slate-100">{kw.suggestedMonthlyBudget > 0 ? `$${kw.suggestedMonthlyBudget.toLocaleString()}` : "—"}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-emerald-700 border-b border-slate-100">{kw.estimatedLeads > 0 ? kw.estimatedLeads : "—"}</td>
                        <td className="px-3 py-2 text-slate-500 border-b border-slate-100" style={{ maxWidth: "200px" }}>
                          <span className="leading-relaxed">{kw.strategyNote.split(".")[0]}.</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 7 — MARKET RECOMMENDATIONS
          ════════════════════════════════════════════════════════════════ */}
          <div className="page-break" />
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="7" title="Market Recommendations" subtitle="Strategic recommendation per target market based on opportunity scoring and revenue potential" />
            <div className="space-y-4">
              {countryForecasts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No countries in scope.</p>
              ) : (
                countryForecasts.map((c) => {
                  const { badge, border } = PRIORITY_STYLES[c.priority];
                  return (
                    <div key={c.country} className={`rounded-xl border border-slate-200 border-l-4 ${border} p-5 avoid-break`}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-sm font-bold text-slate-900">{c.country}</h3>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${badge}`}>
                              {PRIORITY_ICON[c.priority]} {c.priority}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">{getCountryNote(c.country, c.priority)}</p>
                        </div>
                        <div className="flex gap-5 shrink-0 sm:text-right">
                          {[
                            { label: "Budget",  value: `$${c.budget.toLocaleString()}` },
                            { label: "Leads",   value: String(c.leads)                 },
                            { label: "Revenue", value: c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—" },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
                              <p className="text-sm font-bold text-slate-900 mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 8 — RISKS & FORECAST NOTES
          ════════════════════════════════════════════════════════════════ */}
          <ProposalSection className="bg-white rounded-2xl border border-slate-200 p-8 mb-6 shadow-sm">
            <ProposalSectionHeader number="8" title="Risks & Forecast Notes" subtitle="Important caveats that apply to all projected figures in this report" />
            <div className="space-y-4">
              {[
                {
                  title: "All figures are forecast estimates",
                  body:  `Projected clicks, leads, deals, and revenue are modelled outputs based on assumed CTRs derived from match type (Exact 5% · Phrase 4% · Broad 3%) and the landing page conversion rate of ${effectiveAssumptions.lpConversionRate.toFixed(2)}% entered in project assumptions. They represent a planning benchmark, not a performance guarantee.`,
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
                {
                  title: "Competitor intelligence is point-in-time",
                  body:  "Competitor pressure scores and strategy notes are based on observed market conditions at the time of research. Paid search auction dynamics change with seasonal demand and competitor budget shifts. Review competitive pressure scores quarterly and adjust bids accordingly.",
                },
              ].map(({ title, body }) => (
                <div key={title} className="flex gap-3 avoid-break">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </ProposalSection>

          {/* ════════════════════════════════════════════════════════════════
              PROPOSAL FOOTER
          ════════════════════════════════════════════════════════════════ */}
          <div className="mt-2 pt-5 pb-8 border-t-2 border-slate-900 flex items-center justify-between avoid-break">
            <div>
              <p className="text-xs font-bold text-slate-900">Elitez Digital</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Performance Marketing · SEM Planning</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400">Generated by SEM Planner</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{generatedAt} · Confidential</p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
