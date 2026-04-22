"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookmarkCheck, Lock, Download } from "lucide-react";
import { getSnapshotById, type Snapshot, type SnapshotKeyword, type SnapshotCountryForecast } from "@/lib/snapshotStore";
import { exportSnapshotKeywordsCsv, exportSnapshotForecastCsv } from "@/lib/csvExport";
import { type PriorityLevel } from "@/lib/keywordEngine";

// ─── Style maps ───────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<PriorityLevel, { badge: string; border: string }> = {
  "High Priority": { badge: "bg-emerald-50 text-emerald-700 border-emerald-100", border: "border-l-emerald-400" },
  "Test Market":   { badge: "bg-amber-50 text-amber-700 border-amber-100",       border: "border-l-amber-400"   },
  "Low Priority":  { badge: "bg-slate-50 text-slate-500 border-slate-100",        border: "border-l-slate-200"   },
};
const PRIORITY_ICON: Record<PriorityLevel, string> = {
  "High Priority": "▲",
  "Test Market":   "◐",
  "Low Priority":  "○",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 pb-3 border-b border-slate-100 mb-4">
      <span className="mt-0.5 w-6 h-6 rounded-md bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {number}
      </span>
      <div>
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-semibold text-slate-800">{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SnapshotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined);

  useEffect(() => {
    setSnap(getSnapshotById(id));
  }, [id]);

  if (snap === undefined) return null; // loading

  if (!snap) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <p className="text-slate-500 text-sm">Snapshot not found or was deleted.</p>
        <Link
          href="/snapshots"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:text-brand-700"
        >
          <ArrowLeft size={13} /> Back to Snapshots
        </Link>
      </div>
    );
  }

  const { assumptions, summary, topKeywords, forecastTable } = snap;

  const roi = summary.roi !== "—" ? `${summary.roi}×` : "—";
  const totalBudgetPct = (v: number) =>
    summary.budget > 0 ? Math.round((v / summary.budget) * 100) : 0;

  const buyKws  = topKeywords.filter((k) => k.action === "Buy");
  const testKws = topKeywords.filter((k) => k.action === "Test");

  const createdLabel = new Date(snap.createdAt).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const createdTime = new Date(snap.createdAt).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/snapshots"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft size={12} /> Snapshots
            </Link>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">{snap.title}</h1>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <BookmarkCheck size={12} className="text-brand-400" />
            Saved {createdLabel} at {createdTime}
            {snap.scenarioName && (
              <><span className="text-slate-300">·</span><span className="text-brand-600 font-medium">⚗ {snap.scenarioName}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => exportSnapshotKeywordsCsv(snap.topKeywords, snap.title, assumptions.projectName)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <Download size={12} /> Keywords CSV
          </button>
          <button
            onClick={() => exportSnapshotForecastCsv(snap.forecastTable, summary.budget, snap.title, assumptions.projectName)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <Download size={12} /> Forecast CSV
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            <Lock size={11} /> Read-only snapshot
          </div>
        </div>
      </div>

      {/* ── Section 1: Summary KPIs ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <SectionHeader number="1" title="Summary Metrics" subtitle="Totals captured at snapshot time — not recalculated" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Monthly Budget"  value={`$${summary.budget.toLocaleString()}`} />
          <StatCard label="Est. Leads"      value={String(summary.leads)} />
          <StatCard label="Est. Revenue"    value={summary.revenue > 0 ? `$${summary.revenue.toLocaleString()}` : "—"} />
          <StatCard label="Est. ROI"        value={roi} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Clicks"      value={summary.clicks.toLocaleString()} />
          <StatCard label="SQLs"        value={String(summary.sql)} />
          <StatCard label="Deals"       value={String(summary.deals)} />
          <StatCard label="CPL"         value={summary.cpl > 0 ? `$${summary.cpl.toLocaleString()}` : "—"} />
        </div>
      </div>

      {/* ── Section 2: Assumptions ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <SectionHeader number="2" title="Project Assumptions" subtitle="Inputs used when this snapshot was saved" />
        {snap.scenarioName && (
          <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2">
            <span className="text-xs font-bold text-brand-700">⚗ Scenario: {snap.scenarioName}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
          <div>
            <Row label="Project Name"      value={assumptions.projectName || "—"} />
            <Row label="Monthly Budget"    value={`$${assumptions.monthlyBudget.toLocaleString()}`} />
            <Row label="Landing Page CVR"  value={`${assumptions.lpConversionRate.toFixed(2)}%`} />
            <Row label="SQL Rate"          value={`${snap.forecastAssumptions?.sqlRate ?? 50}% of leads`} />
          </div>
          <div>
            <Row label="Close Rate"        value={`${assumptions.closeRate}%`} />
            <Row label="Avg Deal Size"     value={`$${assumptions.avgDealSize.toLocaleString()}`} />
            <Row label="Countries"         value={assumptions.targetCountries.join(", ") || "—"} />
            <Row label="Budget Split"      value="Buy 85% · Test 15%" />
          </div>
        </div>
      </div>

      {/* ── Section 3: Forecast Table ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <SectionHeader number="3" title="Forecast by Country" subtitle="Budget allocation and projected outcomes per market" />

        {/* Buy/Test split bar */}
        {summary.budget > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Buy vs Test Split</p>
            <div className="flex h-3 rounded overflow-hidden gap-px">
              <div className="bg-emerald-500" style={{ width: `${Math.round(summary.buyBudget / summary.budget * 100)}%` }} />
              <div className="bg-amber-400"   style={{ width: `${Math.round(summary.testBudget / summary.budget * 100)}%` }} />
            </div>
            <div className="flex gap-5 mt-1.5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />
                Buy — ${summary.buyBudget.toLocaleString()} ({Math.round(summary.buyBudget / summary.budget * 100)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />
                Test — ${summary.testBudget.toLocaleString()} ({Math.round(summary.testBudget / summary.budget * 100)}%)
              </span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                {["Country", "Budget", "% Total", "Clicks", "Leads", "CPL", "SQL", "Deals", "Revenue", "Priority"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap bg-slate-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecastTable.map((c: SnapshotCountryForecast, i) => {
                const { badge } = PRIORITY_STYLES[c.priority];
                return (
                  <tr key={c.country} className={`border-b border-slate-100 ${i % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{c.country}</td>
                    <td className="px-3 py-2.5 tabular-nums font-bold text-slate-800">${c.budget.toLocaleString()}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{totalBudgetPct(c.budget)}%</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{c.clicks.toLocaleString()}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-emerald-700">{c.leads}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{c.cpl > 0 ? `$${c.cpl.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{c.sql > 0 ? c.sql : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">{c.deals > 0 ? c.deals : "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums font-semibold text-slate-800">{c.revenue > 0 ? `$${c.revenue.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge}`}>
                        {PRIORITY_ICON[c.priority]} {c.priority}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="bg-slate-100 border-t-2 border-slate-200">
                <td className="px-3 py-2.5 font-bold text-slate-700">Total</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900">${summary.budget.toLocaleString()}</td>
                <td className="px-3 py-2.5 font-bold text-slate-700">100%</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900">{summary.clicks.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-emerald-700">{summary.leads}</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900">{summary.cpl > 0 ? `$${summary.cpl.toLocaleString()}` : "—"}</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900">{summary.sql}</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900">{summary.deals}</td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-slate-900">{summary.revenue > 0 ? `$${summary.revenue.toLocaleString()}` : "—"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* ROI callout */}
        {roi !== "—" && (
          <div className="flex items-center gap-4 p-4 rounded-xl border border-brand-200 bg-brand-50">
            <div className="text-center px-4 border-r border-brand-200 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">Est. ROI</p>
              <p className="text-2xl font-bold text-brand-700">{roi}</p>
            </div>
            <p className="text-xs text-brand-700 leading-relaxed">
              For every $1 invested, this programme projected ${summary.roi} in revenue pipeline — based on a {assumptions.closeRate}% close rate on {summary.leads} estimated leads at ${assumptions.avgDealSize.toLocaleString()} average deal size.
            </p>
          </div>
        )}
      </div>

      {/* ── Section 4: Top Keywords ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <SectionHeader
          number="4"
          title="Top Recommended Keywords"
          subtitle={`${buyKws.length} Buy · ${testKws.length} Test — sorted by opportunity score`}
        />

        {buyKws.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Buy — Immediate Activation
            </p>
            <KeywordTable kws={buyKws} accentClass="text-emerald-700" headerBg="bg-emerald-50" />
          </div>
        )}

        {testKws.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> Test — Controlled Evaluation
            </p>
            <KeywordTable kws={testKws} accentClass="text-amber-700" headerBg="bg-amber-50" />
          </div>
        )}

        {topKeywords.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">No keywords were captured in this snapshot.</p>
        )}
      </div>

    </div>
  );
}

// ─── Keyword table sub-component ──────────────────────────────────────────────

function KeywordTable({
  kws,
  accentClass,
  headerBg,
}: {
  kws: SnapshotKeyword[];
  accentClass: string;
  headerBg: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className={`border-b border-slate-200 ${headerBg}`}>
            {["Keyword", "Country", "Action", "CPC", "Budget", "Clicks", "Leads", "CPL", "Revenue", "Score"].map((h) => (
              <th key={h} className={`px-3 py-2 text-left font-semibold ${accentClass} whitespace-nowrap`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kws.map((kw: SnapshotKeyword, i) => (
            <tr key={kw.id} className={`border-b border-slate-100 last:border-0 ${i % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
              <td className="px-3 py-2 font-medium text-slate-800 max-w-[180px]">
                <span className="block truncate" title={kw.keyword}>{kw.keyword}</span>
              </td>
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{kw.country}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  kw.action === "Buy"
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-amber-400 text-white border-amber-400"
                }`}>
                  {kw.action}
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums text-slate-600">${kw.suggestedCpc.toFixed(2)}</td>
              <td className="px-3 py-2 tabular-nums font-semibold text-slate-800">{kw.suggestedMonthlyBudget > 0 ? `$${kw.suggestedMonthlyBudget.toLocaleString()}` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">{kw.estimatedClicks > 0 ? kw.estimatedClicks : "—"}</td>
              <td className={`px-3 py-2 tabular-nums font-semibold ${accentClass}`}>{kw.estimatedLeads > 0 ? kw.estimatedLeads : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">{kw.estimatedCpl > 0 ? `$${kw.estimatedCpl}` : "—"}</td>
              <td className="px-3 py-2 tabular-nums font-semibold text-slate-800">{kw.revenuePotential > 0 ? `$${kw.revenuePotential.toLocaleString()}` : "—"}</td>
              <td className="px-3 py-2 tabular-nums text-slate-500">{kw.opportunityScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
