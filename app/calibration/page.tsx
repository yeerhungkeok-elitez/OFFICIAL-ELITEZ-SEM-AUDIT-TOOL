"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, Info, RotateCcw } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { KEYWORDS } from "@/lib/keywordEngine";
import {
  getLibraryKeywords,
  saveLibraryKeywords,
  getSystemOverrides,
  saveSystemOverrides,
  buildWorkspaceKeywords,
  type WorkspaceKeyword,
  type KeywordCategory,
} from "@/lib/keywordLibrary";
import {
  toPerfCategory,
  type CategoryCalibration,
} from "@/lib/historicalCalibration";
import { loadHistoricalKeywords } from "@/lib/historicalKeywords";

// ─── Types ────────────────────────────────────────────────────────────────────

type PerfCategory = "brand" | "generic" | "highIntent" | "competitor";

// ─── Constants ────────────────────────────────────────────────────────────────

const PERF_CATS: PerfCategory[] = ["brand", "generic", "highIntent", "competitor"];

const PERF_CAT_LABELS: Record<PerfCategory, string> = {
  brand:      "Brand",
  generic:    "Generic / Service",
  highIntent: "High Intent",
  competitor: "Competitor",
};

// Fallback prior CVR when no calibration data exists (mirrors historicalCalibration.ts PRIOR_CVR)
const PRIOR_CVR: Record<PerfCategory, number> = {
  brand:      0.03,
  generic:    0.02,
  highIntent: 0.06,
  competitor: 0.06,
};

const PERF_CAT_COLORS: Record<PerfCategory, { card: string; badge: string; dot: string }> = {
  brand:      { card: "border-violet-200 bg-violet-50",  badge: "bg-violet-100 text-violet-700",  dot: "bg-violet-400"  },
  generic:    { card: "border-blue-200 bg-blue-50",      badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-400"    },
  highIntent: { card: "border-emerald-200 bg-emerald-50", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  competitor: { card: "border-orange-200 bg-orange-50",  badge: "bg-orange-100 text-orange-700",  dot: "bg-orange-400"  },
};

const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  brand:           "Brand",
  commercial:      "Commercial",
  purchase:        "Purchase",
  "problem-aware": "Problem-Aware",
  comparison:      "Comparison",
  competitor:      "Competitor",
  informational:   "Informational",
  local:           "Local / Geo",
  urgent:          "Urgent",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveCategory(kw: WorkspaceKeyword): PerfCategory {
  const raw = kw.campaignGroup ?? kw.category ?? "";
  return toPerfCategory(raw, kw.intent) as PerfCategory;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct   = Math.round(confidence * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalibrationPage() {
  const { calibration, activeProject } = useAppContext();

  const [mounted,       setMounted]       = useState(false);
  const [libraryKws,    setLibraryKws]    = useState(() => getLibraryKeywords());
  const [sysOverrides,  setSysOverrides]  = useState(() => getSystemOverrides());

  const [filterCat,     setFilterCat]     = useState<PerfCategory | "">("");
  const [filterCountry, setFilterCountry] = useState("");

  const [historicalKws, setHistoricalKws] = useState<WorkspaceKeyword[]>([]);
  const [kwsLoading,    setKwsLoading]    = useState(false);

  useEffect(() => setMounted(true), []);

  // Sync from localStorage on mount in case another page mutated state
  useEffect(() => {
    setLibraryKws(getLibraryKeywords());
    setSysOverrides(getSystemOverrides());
  }, []);

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

  const allKws = useMemo<WorkspaceKeyword[]>(() => {
    if (activeProject?.keywordSource === "historical") return historicalKws;
    return buildWorkspaceKeywords(KEYWORDS, sysOverrides, libraryKws, 1.0, [], []);
  }, [activeProject?.keywordSource, historicalKws, libraryKws, sysOverrides]);

  const countries = useMemo(() => {
    const seen = new Set<string>();
    for (const kw of allKws) seen.add(kw.country);
    return Array.from(seen).sort();
  }, [allKws]);

  const visibleKws = useMemo(() =>
    allKws.filter((kw) => {
      if (filterCountry && kw.country !== filterCountry) return false;
      if (filterCat     && resolveCategory(kw) !== filterCat) return false;
      return true;
    }),
    [allKws, filterCat, filterCountry],
  );

  const countByCat = useMemo(() => {
    const m: Record<PerfCategory, number> = { brand: 0, generic: 0, highIntent: 0, competitor: 0 };
    for (const kw of allKws) m[resolveCategory(kw)]++;
    return m;
  }, [allKws]);

  // ─── Override save ───────────────────────────────────────────────────────────

  function applyOverride(kw: WorkspaceKeyword, value: PerfCategory | "") {
    const campaignGroup = value || undefined;

    if (kw.isLibrary) {
      const next = libraryKws.map((lk) =>
        lk.id === kw.id ? { ...lk, campaignGroup } : lk,
      );
      setLibraryKws(next);
      saveLibraryKeywords(next);
    } else {
      const existing = sysOverrides.find((o) => o.id === kw.id);
      const next = existing
        ? sysOverrides.map((o) => o.id === kw.id ? { ...o, campaignGroup } : o)
        : [...sysOverrides, { id: kw.id, exclude: false, forceBuy: false, forceTest: false, campaignGroup }];
      setSysOverrides(next);
      saveSystemOverrides(next);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!mounted || kwsLoading) return null;

  return (
    <div className="space-y-8 max-w-6xl">

      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/keywords"
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
          >
            <ChevronLeft size={14} /> Keywords
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Category Inspector</h1>
        <p className="text-sm text-slate-500 mt-1">
          See how keywords map to forecast perf categories and override assignments to fine-tune CVR calibration.
        </p>
      </div>

      {/* Summary cards — click to filter table */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PERF_CATS.map((cat) => {
          const calib: CategoryCalibration | undefined = calibration?.[cat];
          const colors     = PERF_CAT_COLORS[cat];
          const count      = countByCat[cat];
          const blendedCvr = calib?.blendedCvr ?? PRIOR_CVR[cat];
          const hasData    = !!calib && calib.clicks > 0;

          return (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? "" : cat)}
              className={`rounded-2xl border p-5 text-left transition-all hover:shadow-sm ${colors.card} ${
                filterCat === cat ? "ring-2 ring-offset-1 ring-brand-500" : ""
              }`}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                  <span className="text-sm font-semibold text-slate-800">{PERF_CAT_LABELS[cat]}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {count} kw{count !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Metrics */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-500">Blended CVR</span>
                  <span className="text-lg font-bold text-slate-900">{(blendedCvr * 100).toFixed(1)}%</span>
                </div>

                {hasData ? (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Actual CVR</span>
                      <span className="font-medium text-slate-700">{(calib!.actualCvr * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Actual CPC</span>
                      <span className="font-medium text-slate-700">${calib!.actualCpc.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Actual CTR</span>
                      <span className="font-medium text-slate-700">{(calib!.actualCtr * 100).toFixed(1)}%</span>
                    </div>
                    <div className="pt-1">
                      <p className="text-[10px] text-slate-400 mb-1.5">CVR confidence ({calib!.clicks} clicks)</p>
                      <ConfidenceBar confidence={calib!.cvrConfidence} />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 italic">No historical data — using prior CVR</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Explainer */}
      <div className="flex gap-3 rounded-xl bg-sky-50 border border-sky-100 p-4">
        <Info size={16} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-sm text-sky-700 space-y-1">
          <p className="font-semibold">How perf categories affect forecasts</p>
          <p className="text-sky-600 leading-relaxed">
            Each keyword's <em>UI category</em> is mapped to one of 4 perf buckets for calibration lookup.
            {" "}<strong>Generic and High Intent keywords both resolve to "Service"</strong> and share the same blended CVR.
            Override a keyword's bucket below to route it to a different calibration profile — the forecast engine picks it up immediately.
          </p>
        </div>
      </div>

      {/* Keyword assignment table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

        {/* Table controls */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800 shrink-0">
            Keyword Assignments
            {visibleKws.length !== allKws.length && (
              <span className="ml-1.5 text-slate-400 font-normal">
                ({visibleKws.length} of {allKws.length})
              </span>
            )}
          </h2>

          {/* Perf category filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {PERF_CATS.map((cat) => {
              const colors = PERF_CAT_COLORS[cat];
              const active = filterCat === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setFilterCat(active ? "" : cat)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? `${colors.badge} border-current`
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                  {PERF_CAT_LABELS[cat]}
                  <span className="opacity-60">{countByCat[cat]}</span>
                </button>
              );
            })}
          </div>

          {/* Country filter */}
          <div className="ml-auto">
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">All Countries</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Keyword</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Country</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">UI Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">→ Perf Bucket</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">CVR Applied</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visibleKws.map((kw) => {
                const perfCat    = resolveCategory(kw);
                const colors     = PERF_CAT_COLORS[perfCat];
                const calib      = calibration?.[perfCat];
                const blendedCvr = calib?.blendedCvr ?? PRIOR_CVR[perfCat];
                const isOverridden   = !!kw.campaignGroup;
                const currentOverride = (isOverridden ? (kw.campaignGroup as PerfCategory) : "") as PerfCategory | "";

                return (
                  <tr key={kw.id} className="hover:bg-slate-50/60 transition-colors">

                    {/* Keyword */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 max-w-[260px]">
                        <span className="text-slate-800 font-medium truncate" title={kw.keyword}>
                          {kw.keyword}
                        </span>
                        {isOverridden && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                            overridden
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Country */}
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{kw.country}</td>

                    {/* UI category */}
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border bg-slate-50 text-slate-600 border-slate-200">
                        {CATEGORY_LABELS[kw.category] ?? kw.category}
                      </span>
                    </td>

                    {/* Resolved perf bucket */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${colors.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {PERF_CAT_LABELS[perfCat]}
                      </span>
                    </td>

                    {/* CVR applied */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="text-xs font-bold tabular-nums text-slate-800">
                        {(blendedCvr * 100).toFixed(1)}%
                      </span>
                      {!calib && (
                        <span className="ml-1 text-[10px] text-slate-400">(prior)</span>
                      )}
                    </td>

                    {/* Override control */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={currentOverride}
                          onChange={(e) => applyOverride(kw, e.target.value as PerfCategory | "")}
                          className="appearance-none pl-2.5 pr-6 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors hover:border-slate-300"
                        >
                          <option value="">Auto</option>
                          <option value="brand">Brand</option>
                          <option value="generic">Generic / Service</option>
                          <option value="highIntent">High Intent</option>
                          <option value="competitor">Competitor</option>
                        </select>
                        {isOverridden && (
                          <button
                            onClick={() => applyOverride(kw, "")}
                            title="Reset to auto"
                            className="text-slate-300 hover:text-rose-400 transition-colors"
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {visibleKws.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">
                    No keywords match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
