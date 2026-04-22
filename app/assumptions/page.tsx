"use client";

import { useState, useEffect, useCallback } from "react";
import { SlidersHorizontal, RotateCcw, Save, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import {
  getForecastAssumptions,
  saveForecastAssumptions,
  resetForecastAssumptions,
  validateForecastAssumptions,
  DEFAULT_FORECAST_ASSUMPTIONS,
  type ForecastAssumptions,
  type ForecastAssumptionWarning,
} from "@/lib/forecastAssumptionsStore";

// ─── Field row component ──────────────────────────────────────────────────────

function FieldRow({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  prefix,
  suffix,
}: {
  label:       string;
  description: string;
  value:       number;
  onChange:    (v: number) => void;
  min?:        number;
  max?:        number;
  step?:       number;
  prefix?:     string;
  suffix?:     string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-800 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {prefix && <span className="text-slate-400 text-sm">{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white text-right focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
        />
        {suffix && <span className="text-slate-400 text-sm w-4">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Warning banner ───────────────────────────────────────────────────────────

function WarningBanner({ warning }: { warning: ForecastAssumptionWarning }) {
  const config = {
    error: { icon: AlertCircle,   bg: "bg-red-950/50",    border: "border-red-800",    text: "text-red-400",    title: "text-red-300"    },
    warn:  { icon: AlertTriangle, bg: "bg-amber-950/50",  border: "border-amber-800",  text: "text-amber-400",  title: "text-amber-300"  },
    info:  { icon: Info,          bg: "bg-blue-950/50",   border: "border-blue-800",   text: "text-blue-400",   title: "text-blue-300"   },
  }[warning.level];
  const Icon = config.icon;
  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${config.bg} ${config.border}`}>
      <Icon size={15} className={`${config.text} shrink-0 mt-0.5`} />
      <div>
        <p className={`text-xs font-semibold ${config.title}`}>{warning.title}</p>
        <p className={`text-xs ${config.text} mt-0.5`}>{warning.message}</p>
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-3 pb-2 border-b border-slate-800">{title}</h3>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssumptionsPage() {
  const { activeProject } = useAppContext();
  const projectId = activeProject?.id ?? "default";

  const [fa, setFa] = useState<ForecastAssumptions>(DEFAULT_FORECAST_ASSUMPTIONS);
  const [saved, setSaved] = useState(false);
  const [warnings, setWarnings] = useState<ForecastAssumptionWarning[]>([]);

  useEffect(() => {
    const loaded = getForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    );
    setFa(loaded);
    setWarnings(validateForecastAssumptions(loaded));
  }, [projectId, activeProject]);

  const update = useCallback((field: keyof ForecastAssumptions, value: number) => {
    setFa((prev) => {
      const next = { ...prev, [field]: value };
      setWarnings(validateForecastAssumptions(next));
      return next;
    });
    setSaved(false);
  }, []);

  function handleSave() {
    saveForecastAssumptions(projectId, fa);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    const defaults = resetForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    );
    setFa(defaults);
    setWarnings(validateForecastAssumptions(defaults));
    setSaved(false);
  }

  const errorCount = warnings.filter((w) => w.level === "error").length;
  const warnCount  = warnings.filter((w) => w.level === "warn").length;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal size={20} className="text-brand-400" />
            <h1 className="text-xl font-bold text-white">Forecast Assumptions</h1>
          </div>
          <p className="text-sm text-slate-400">
            Override the model defaults used to calculate clicks, leads, SQL, and revenue across all forecast pages.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm transition-colors"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? "bg-green-700 text-white"
                : "bg-brand-500 hover:bg-brand-600 text-white"
            }`}
          >
            <Save size={14} />
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : ""}
            {errorCount > 0 && warnCount > 0 ? " · " : ""}
            {warnCount > 0 ? `${warnCount} warning${warnCount > 1 ? "s" : ""}` : ""}
            {errorCount === 0 && warnCount === 0 ? `${warnings.length} notice${warnings.length > 1 ? "s" : ""}` : ""}
          </p>
          {warnings.map((w) => (
            <WarningBanner key={w.id} warning={w} />
          ))}
        </div>
      )}

      {/* Conversion Funnel */}
      <Section title="Conversion Funnel">
        <FieldRow
          label="Landing Page CVR"
          description="% of ad clicks that become form fills or leads"
          value={fa.lpConversionRate}
          onChange={(v) => update("lpConversionRate", v)}
          min={0} max={100} step={0.1} suffix="%"
        />
        <FieldRow
          label="SQL Rate"
          description="% of leads that qualify as sales-qualified"
          value={fa.sqlRate}
          onChange={(v) => update("sqlRate", v)}
          min={0} max={100} step={1} suffix="%"
        />
        <FieldRow
          label="Close Rate"
          description="% of SQLs that close as won deals"
          value={fa.closeRate}
          onChange={(v) => update("closeRate", v)}
          min={0} max={100} step={1} suffix="%"
        />
        <FieldRow
          label="Avg Deal Size"
          description="Average contract value per closed deal"
          value={fa.avgDealSize}
          onChange={(v) => update("avgDealSize", v)}
          min={0} step={100} prefix="$"
        />
      </Section>

      {/* Bid Modifier */}
      <Section title="Bid Modifier">
        <FieldRow
          label="Global CPC Multiplier"
          description="Scales all CPCs up or down. 1.0 = no change, 1.2 = +20% CPC → fewer clicks"
          value={fa.cpcMultiplier}
          onChange={(v) => update("cpcMultiplier", v)}
          min={0.1} max={10} step={0.05} prefix="×"
        />
      </Section>

      {/* Intent Modifiers */}
      <Section title="Intent Modifiers">
        <FieldRow
          label="Brand CVR Uplift"
          description="Multiplier on CVR for branded keywords (e.g. 1.5 = 50% higher CVR)"
          value={fa.brandCvrUplift}
          onChange={(v) => update("brandCvrUplift", v)}
          min={0.1} max={10} step={0.1} prefix="×"
        />
        <FieldRow
          label="Competitor CVR Discount"
          description="Multiplier on CVR for competitor keywords (e.g. 0.7 = 30% lower CVR)"
          value={fa.competitorCvrDiscount}
          onChange={(v) => update("competitorCvrDiscount", v)}
          min={0.1} max={2} step={0.05} prefix="×"
        />
      </Section>

      {/* Match Type Factors */}
      <Section title="Match Type Factors">
        <div className="grid grid-cols-3 gap-x-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide col-span-1"></p>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right pr-1">CPC factor</p>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right pr-1">CVR factor</p>
        </div>
        {(["Broad", "Phrase", "Exact"] as const).map((mt) => {
          const key = mt.toLowerCase() as "broad" | "phrase" | "exact";
          return (
            <div key={mt} className="grid grid-cols-3 gap-x-6 items-center py-3 border-b border-slate-800 last:border-0">
              <p className="text-sm font-medium text-white">{mt}</p>
              <div className="flex items-center justify-end gap-1">
                <span className="text-slate-400 text-sm">×</span>
                <input
                  type="number"
                  value={fa[`${key}CpcFactor`]}
                  min={0.1} max={5} step={0.05}
                  onChange={(e) => update(`${key}CpcFactor`, parseFloat(e.target.value) || 0)}
                  className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              <div className="flex items-center justify-end gap-1">
                <span className="text-slate-400 text-sm">×</span>
                <input
                  type="number"
                  value={fa[`${key}CvrFactor`]}
                  min={0.1} max={5} step={0.05}
                  onChange={(e) => update(`${key}CvrFactor`, parseFloat(e.target.value) || 0)}
                  className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>
          );
        })}
        <p className="text-xs text-slate-500 mt-3">Phrase match is always the baseline (factors = 1.00). Broad and Exact are relative to Phrase.</p>
      </Section>
    </div>
  );
}
