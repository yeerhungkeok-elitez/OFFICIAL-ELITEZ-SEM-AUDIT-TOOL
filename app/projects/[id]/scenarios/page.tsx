"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Check,
  FlaskConical,
  X,
} from "lucide-react";
import {
  getScenariosByProject,
  getActiveScenarioId,
  setActiveScenarioId,
  saveScenario,
  updateScenario,
  deleteScenario,
  ensureDefaultScenarios,
  type Scenario,
  type ScenarioDraft,
} from "@/lib/scenarioStore";
import { getProjectById } from "@/lib/projectStore";
import { useAppContext } from "@/context/AppContext";

// ─── Sub-components ───────────────────────────────────────────────────────────

function MultiplierBadge({ label, value }: { label: string; value: number }) {
  const isNeutral  = value === 1.0;
  const isPositive = value > 1.0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        isNeutral
          ? "bg-slate-100 text-slate-500"
          : isPositive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-amber-50 text-amber-700"
      }`}
    >
      {label} ×{value.toFixed(2)}
    </span>
  );
}

interface ScenarioFormProps {
  initial?: Partial<ScenarioDraft>;
  onSave:   (draft: ScenarioDraft) => void;
  onCancel: () => void;
}

function ScenarioForm({ initial, onSave, onCancel }: ScenarioFormProps) {
  const [name,   setName]   = useState(initial?.name             ?? "");
  const [budget, setBudget] = useState(String(initial?.budgetMultiplier ?? 1.0));
  const [cvr,    setCvr]    = useState(String(initial?.cvrMultiplier    ?? 1.0));
  const [cpc,    setCpc]    = useState(String(initial?.cpcMultiplier    ?? 1.0));
  const [notes,  setNotes]  = useState(initial?.notes            ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name:             name.trim(),
      budgetMultiplier: parseFloat(budget) || 1.0,
      cvrMultiplier:    parseFloat(cvr)    || 1.0,
      cpcMultiplier:    parseFloat(cpc)    || 1.0,
      notes:            notes.trim(),
    });
  };

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Scenario Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          placeholder="e.g. Q3 Push"
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Budget Multiplier</label>
          <input type="number" step="0.05" min="0.1" max="5" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} />
          <p className="mt-1 text-[11px] text-slate-400">e.g. 1.3 = +30% budget</p>
        </div>
        <div>
          <label className={labelCls}>CVR Multiplier</label>
          <input type="number" step="0.05" min="0.1" max="5" value={cvr} onChange={(e) => setCvr(e.target.value)} className={inputCls} />
          <p className="mt-1 text-[11px] text-slate-400">e.g. 0.9 = −10% CVR</p>
        </div>
        <div>
          <label className={labelCls}>CPC Multiplier</label>
          <input type="number" step="0.05" min="0.1" max="5" value={cpc} onChange={(e) => setCpc(e.target.value)} className={inputCls} />
          <p className="mt-1 text-[11px] text-slate-400">e.g. 1.1 = +10% CPCs</p>
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${inputCls} resize-none`}
          placeholder="What conditions does this scenario model?"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          Save Scenario
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScenariosPage() {
  const { id } = useParams<{ id: string }>();
  const { refreshScenarios } = useAppContext();
  const [projectName,     setProjectName]     = useState<string>("");
  const [scenarios,       setScenarios]       = useState<Scenario[]>([]);
  const [activeId,        setActiveId]        = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [showNew,         setShowNew]         = useState(false);

  const reload = () => {
    ensureDefaultScenarios(id);
    const list = getScenariosByProject(id);
    setScenarios(list);
    setActiveId(getActiveScenarioId(id));
    refreshScenarios(); // keep header ScenarioSwitcher in sync
  };

  useEffect(() => {
    const proj = getProjectById(id);
    setProjectName(proj?.projectName ?? "Project");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSetActive = (scenarioId: string) => {
    setActiveScenarioId(id, scenarioId);
    setActiveId(scenarioId);
  };

  const handleDelete = (scenarioId: string) => {
    if (confirmDeleteId !== scenarioId) {
      setConfirmDeleteId(scenarioId);
      return;
    }
    deleteScenario(id, scenarioId);
    setConfirmDeleteId(null);
    reload();
  };

  const handleSaveNew = (draft: ScenarioDraft) => {
    const s = saveScenario(id, draft);
    setShowNew(false);
    reload();
    handleSetActive(s.id);
  };

  const handleSaveEdit = (draft: ScenarioDraft) => {
    if (!editingId) return;
    updateScenario(id, editingId, draft);
    setEditingId(null);
    reload();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-brand-500 transition-colors">
          <ArrowLeft size={13} /> All projects
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Scenarios</h1>
            <p className="text-sm text-slate-500 mt-0.5">{projectName}</p>
          </div>
          <button
            onClick={() => { setShowNew(true); setEditingId(null); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors"
          >
            <Plus size={13} /> New Scenario
          </button>
        </div>
      </div>

      {/* New scenario form */}
      {showNew && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New Scenario</p>
          <ScenarioForm onSave={handleSaveNew} onCancel={() => setShowNew(false)} />
        </div>
      )}

      {/* Scenario cards */}
      <div className="space-y-3">
        {scenarios.map((s) => {
          const isActive        = s.id === activeId;
          const isEditing       = editingId === s.id;
          const isConfirmDelete = confirmDeleteId === s.id;

          return (
            <div
              key={s.id}
              className={`rounded-xl border bg-white p-5 transition-all ${
                isActive ? "border-brand-300 shadow-sm shadow-brand-100" : "border-slate-200"
              }`}
            >
              {isEditing ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Edit Scenario</p>
                  <ScenarioForm initial={s} onSave={handleSaveEdit} onCancel={() => setEditingId(null)} />
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FlaskConical size={15} className={isActive ? "text-brand-500" : "text-slate-400"} />
                      <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                      {isActive && (
                        <span className="rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold px-2 py-0.5">Active</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isActive && (
                        <button onClick={() => handleSetActive(s.id)} title="Set as active"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                          <Check size={14} />
                        </button>
                      )}
                      <button onClick={() => { setEditingId(s.id); setShowNew(false); }} title="Edit"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                        <Pencil size={14} />
                      </button>
                      {isConfirmDelete ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-red-500 font-medium">Delete?</span>
                          <button onClick={() => handleDelete(s.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleDelete(s.id)} title="Delete"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <MultiplierBadge label="Budget" value={s.budgetMultiplier} />
                    <MultiplierBadge label="CVR"    value={s.cvrMultiplier} />
                    <MultiplierBadge label="CPC"    value={s.cpcMultiplier} />
                  </div>

                  {s.notes && (
                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">{s.notes}</p>
                  )}
                </>
              )}
            </div>
          );
        })}

        {scenarios.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
            <FlaskConical size={24} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No scenarios yet.</p>
            <button onClick={() => setShowNew(true)}
              className="mt-3 text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors">
              + Create your first scenario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
