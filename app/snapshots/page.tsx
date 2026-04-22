"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BookmarkCheck, ChevronRight, Trash2, Clock, TrendingUp, Users, DollarSign } from "lucide-react";
import {
  getAllSnapshots,
  deleteSnapshot,
  type Snapshot,
} from "@/lib/snapshotStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SnapshotsPage() {
  const [snapshots,       setSnapshots]       = useState<Snapshot[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setSnapshots(getAllSnapshots());
  }, []);

  function handleDelete(id: string) {
    deleteSnapshot(id);
    setSnapshots(getAllSnapshots());
    setConfirmDeleteId(null);
  }

  // Group snapshots by date label
  const grouped = snapshots.reduce<Record<string, Snapshot[]>>((acc, s) => {
    const label = fmtDate(s.createdAt);
    if (!acc[label]) acc[label] = [];
    acc[label].push(s);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Saved Snapshots</h1>
          <p className="text-sm text-slate-400 mt-1">
            Point-in-time captures of report data — read-only, never re-computed.
          </p>
        </div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors self-start sm:self-auto"
        >
          ← Back to Report
        </Link>
      </div>

      {/* Empty state */}
      {snapshots.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 bg-white rounded-2xl border border-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <BookmarkCheck size={22} className="text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">No snapshots yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Click <span className="font-semibold">Save Snapshot</span> on the Reports page to capture the current state.
            </p>
          </div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors shadow-sm"
          >
            Go to Reports →
          </Link>
        </div>
      )}

      {/* Snapshot groups */}
      {Object.entries(grouped).map(([dateLabel, group]) => (
        <div key={dateLabel} className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{dateLabel}</span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">{group.length} {group.length === 1 ? "snapshot" : "snapshots"}</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {group.map((snap) => {
              const roi = snap.summary.roi !== "—"
                ? `${snap.summary.roi}× ROI`
                : null;

              return (
                <div key={snap.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group">

                  <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                    <BookmarkCheck size={15} className="text-brand-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{snap.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      <span className="text-xs text-slate-400">{fmtTime(snap.createdAt)}</span>
                      {snap.scenarioName && (
                        <span className="text-xs font-medium text-brand-600">⚗ {snap.scenarioName}</span>
                      )}
                      {snap.assumptions.targetCountries.length > 0 && (
                        <span className="text-xs text-slate-400">
                          {snap.assumptions.targetCountries.join(" · ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-5 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <DollarSign size={11} className="text-slate-400" />
                      <span className="tabular-nums font-medium text-slate-700">${snap.summary.budget.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Users size={11} className="text-slate-400" />
                      <span className="tabular-nums font-medium text-slate-700">{snap.summary.leads} leads</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <TrendingUp size={11} className="text-slate-400" />
                      <span className="tabular-nums font-medium text-slate-700">
                        {snap.summary.revenue > 0 ? `$${snap.summary.revenue.toLocaleString()}` : "—"}
                      </span>
                    </div>
                    {roi && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                        {roi}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDeleteId === snap.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(snap.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:border-slate-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmDeleteId(snap.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-rose-400 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete snapshot"
                        >
                          <Trash2 size={14} />
                        </button>
                        <Link
                          href={`/snapshots/${snap.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors"
                        >
                          Open <ChevronRight size={12} />
                        </Link>
                      </>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      ))}

    </div>
  );
}
