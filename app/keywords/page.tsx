"use client";

import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import Link from "next/link";
import {
  Search, Globe, Info, Settings2, Plus, Trash2, Ban,
  ShoppingCart, FlaskConical, Pencil, X, Package, Wand2, CheckCheck,
  Layers, FolderKanban, ChevronDown, ChevronRight, EyeOff, Eye, MinusCircle,
  Download, ChevronUp, Shield,
} from "lucide-react";
import {
  projectToAssumptions,
  PROJECT_DEFAULTS,
  type ProjectAssumptions,
} from "@/lib/projectStore";
import {
  KEYWORDS,
  KEYWORD_COUNTRIES,
  type Intent,
  type MatchType,
  type Competition,
  type AdCrowdingLevel,
  type CompetitiveDifficulty,
  type Action,
  type EnrichedKeyword,
  type Keyword,
} from "@/lib/keywordEngine";
import { allocateBudgets, enrich } from "@/lib/forecastEngine";
import { applyScenario } from "@/lib/scenarioStore";
import { useAppContext } from "@/context/AppContext";
import {
  getForecastAssumptions,
  buildMatchTypeModifiers,
  DEFAULT_FORECAST_ASSUMPTIONS,
  type ForecastAssumptions,
} from "@/lib/forecastAssumptionsStore";
import { buildPlanningWarnings, type PlanningWarning } from "@/lib/planningWarnings";
import {
  type LibraryKeyword,
  type SystemOverride,
  type EnrichedWorkspaceKeyword,
  type KeywordSource,
  type KeywordCategory,
  type ProjectContext,
  type ProjectProfile,
  type UserKeywordInputs,
  buildWorkspaceKeywords,
  getLibraryKeywords,
  saveLibraryKeywords,
  getSystemOverrides,
  saveSystemOverrides,
  nextKwId,
  deriveKeywordFields,
  computeBusinessRelevance,
  generateKeywords,
  PRESET_PACKS,
  buildPresetPackKeywords,
  buildDynamicCampaignKeywords,
  generateStarterKeywordsForProject,
  addedPackNames,
  LIBRARY_COUNTRIES,
} from "@/lib/keywordLibrary";
import {
  type Campaign,
  type AdGroup,
  type AdGroupType,
  type CampaignType,
  AD_GROUP_TYPE_LABELS,
  AD_GROUP_TYPES,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPE_STYLES,
  CAMPAIGN_TYPE_DESCRIPTIONS,
  CAMPAIGN_TYPE_AD_GROUP_SUGGESTIONS,
  getCampaigns,
  saveCampaigns,
  getAdGroups,
  saveAdGroups,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  createAdGroup,
  updateAdGroup,
  deleteAdGroup,
} from "@/lib/campaignStore";
import {
  type NegativeKeyword,
  type NegLevel,
  type NegMatchType,
  getNegativeKeywords,
  addNegativeKeyword,
  updateNegativeKeyword,
  deleteNegativeKeyword,
  isKeywordSuppressed,
  NEGATIVE_PACKS,
} from "@/lib/negativeKeywordStore";
import { exportKeywordsCsv } from "@/lib/csvExport";

// ─── Badge style maps ─────────────────────────────────────────────────────────

const INTENT_STYLES: Record<Intent, string> = {
  Informational: "bg-sky-50 text-sky-600 border-sky-100",
  Commercial:    "bg-violet-50 text-violet-600 border-violet-100",
  Transactional: "bg-emerald-50 text-emerald-600 border-emerald-100",
  Navigational:  "bg-amber-50 text-amber-600 border-amber-100",
};

const PRESSURE_STYLES: Record<Competition, string> = {
  Low:    "bg-emerald-50 text-emerald-600 border-emerald-100",
  Medium: "bg-amber-50 text-amber-600 border-amber-100",
  High:   "bg-rose-50 text-rose-600 border-rose-100",
};

const CROWDING_STYLES: Record<AdCrowdingLevel, string> = {
  Low:    "bg-emerald-50 text-emerald-600 border-emerald-100",
  Medium: "bg-amber-50 text-amber-600 border-amber-100",
  High:   "bg-rose-50 text-rose-600 border-rose-100",
};

const DIFFICULTY_STYLES: Record<CompetitiveDifficulty, string> = {
  Easy:     "bg-emerald-50 text-emerald-700 border-emerald-100",
  Moderate: "bg-amber-50  text-amber-700  border-amber-100",
  Hard:     "bg-rose-50   text-rose-700   border-rose-100",
};

const ACTION_STYLES: Record<Action, string> = {
  Buy:  "bg-emerald-500 text-white border-emerald-500",
  Test: "bg-amber-400 text-white border-amber-400",
  No:   "bg-slate-200 text-slate-500 border-slate-200",
};

const ACTION_LABELS: Record<Action, string> = {
  Buy: "● Buy", Test: "◐ Test", No: "○ No",
};

const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  "brand":         "Brand",
  "commercial":    "Commercial Intent",
  "purchase":      "Purchase Intent",
  "problem-aware": "Problem-Aware",
  "comparison":    "Comparison",
  "competitor":    "Competitor",
  "informational": "Informational",
  "local":         "Local / Geo",
  "urgent":        "Urgent / Action",
};

const CATEGORY_STYLES: Record<KeywordCategory, string> = {
  "brand":         "bg-purple-50 text-purple-600 border-purple-100",
  "commercial":    "bg-violet-50 text-violet-600 border-violet-100",
  "purchase":      "bg-emerald-50 text-emerald-700 border-emerald-100",
  "problem-aware": "bg-amber-50 text-amber-700 border-amber-100",
  "comparison":    "bg-sky-50 text-sky-600 border-sky-100",
  "competitor":    "bg-rose-50 text-rose-600 border-rose-100",
  "informational": "bg-slate-100 text-slate-600 border-slate-200",
  "local":         "bg-teal-50 text-teal-600 border-teal-100",
  "urgent":        "bg-orange-50 text-orange-600 border-orange-100",
};

const SOURCE_STYLES: Record<KeywordSource, string> = {
  system:      "bg-brand-50 text-brand-600 border-brand-100",
  custom:      "bg-violet-50 text-violet-600 border-violet-100",
  preset:      "bg-amber-50 text-amber-600 border-amber-100",
  generated:   "bg-emerald-50 text-emerald-600 border-emerald-100",
  recommended: "bg-sky-50 text-sky-600 border-sky-100",
  imported:    "bg-rose-50 text-rose-600 border-rose-100",
};

const SOURCE_LABELS: Record<KeywordSource, string> = {
  system:      "System",
  custom:      "Custom",
  preset:      "Preset",
  generated:   "Generated",
  recommended: "Recommended",
  imported:    "Imported",
};

// ─── Keyword bucket definitions ───────────────────────────────────────────────

type BucketColor = "violet" | "blue" | "emerald" | "orange";

interface BucketDef {
  id:            string;
  label:         string;
  description:   string;
  categories:    KeywordCategory[];
  campaignTypes: CampaignType[];
  color:         BucketColor;
}

const BUCKETS: BucketDef[] = [
  { id: "brand",      label: "Brand",            description: "Protect your brand and capture existing demand.",      categories: ["brand"],                                        campaignTypes: ["brand"],                       color: "violet"  },
  { id: "generic",    label: "Generic / Service", description: "Core service discovery — buyers comparing options.",   categories: ["commercial","problem-aware","comparison","local"], campaignTypes: ["generic","niche","pricing","local"], color: "blue"    },
  { id: "highIntent", label: "High Intent",       description: "Ready-to-act searches from bottom-funnel buyers.",     categories: ["purchase","urgent"],                             campaignTypes: ["high-intent"],                 color: "emerald" },
  { id: "competitor", label: "Competitor",        description: "Comparison and conquesting — displace rival traffic.", categories: ["competitor"],                                    campaignTypes: ["competitor"],                  color: "orange"  },
];

const BUCKET_HEADER_CLS: Record<BucketColor, string> = {
  violet:  "bg-violet-50 border-violet-200",
  blue:    "bg-blue-50 border-blue-200",
  emerald: "bg-emerald-50 border-emerald-200",
  orange:  "bg-orange-50 border-orange-200",
};
const BUCKET_BADGE_CLS: Record<BucketColor, string> = {
  violet:  "bg-violet-100 text-violet-700",
  blue:    "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  orange:  "bg-orange-100 text-orange-700",
};
const BUCKET_DOT_CLS: Record<BucketColor, string> = {
  violet:  "bg-violet-400",
  blue:    "bg-blue-400",
  emerald: "bg-emerald-400",
  orange:  "bg-orange-400",
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

function ActionBadge({ action, overridden }: { action: Action; overridden?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${ACTION_STYLES[action]}`}>
      {ACTION_LABELS[action]}
      {overridden && <span className="text-[9px] opacity-70 ml-0.5">✎</span>}
    </span>
  );
}

function OpportunityBar({ score }: { score: number }) {
  const bar  = score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-400" : "bg-slate-300";
  const text = score >= 85 ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-slate-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-7 text-right ${text}`}>{score}</span>
    </div>
  );
}

function RelevanceBar({ score }: { score: number }) {
  const bar  = score >= 75 ? "bg-brand-500" : score >= 55 ? "bg-brand-300" : "bg-slate-200";
  const text = score >= 75 ? "text-brand-600" : score >= 55 ? "text-brand-400" : "text-slate-400";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-7 text-right ${text}`}>{score}</span>
    </div>
  );
}

function EffMatchBadge({ matchType, inherited }: { matchType: MatchType; inherited: boolean }) {
  const color =
    matchType === "Broad"  ? "bg-amber-50 text-amber-700 border-amber-100"   :
    matchType === "Exact"  ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                             "bg-sky-50 text-sky-700 border-sky-100";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${color}`}>
      {matchType}
      {inherited && (
        <span title="Inherited from campaign or ad group" className="opacity-50 text-[9px] leading-none">↑</span>
      )}
    </span>
  );
}

function PressureScoreBar({ score }: { score: number }) {
  const bar  = score >= 70 ? "bg-rose-500" : score >= 45 ? "bg-amber-400" : "bg-emerald-400";
  const text = score >= 70 ? "text-rose-600" : score >= 45 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-7 text-right ${text}`}>{score}</span>
    </div>
  );
}

function FilterSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[] | { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 cursor-pointer transition"
      >
        <option value="">{label}: All</option>
        {options.map((o) =>
          typeof o === "string"
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▾</span>
    </div>
  );
}

function StatCard({
  label, value, sub, highlight,
}: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${highlight ? "bg-brand-500 border-brand-500" : "bg-white border-slate-100"}`}>
      <span className={`text-xs font-semibold uppercase tracking-widest ${highlight ? "text-blue-100" : "text-slate-400"}`}>{label}</span>
      <span className={`text-xl font-bold tracking-tight ${highlight ? "text-white" : "text-slate-900"}`}>{value}</span>
      {sub && <span className={`text-xs ${highlight ? "text-blue-100" : "text-slate-400"}`}>{sub}</span>}
    </div>
  );
}

// ─── Custom keyword form (add + edit) ─────────────────────────────────────────

interface KeywordDraft {
  keyword:                 string;
  country:                 string;
  intent:                  Intent;
  matchType:               MatchType;
  matchTypeStrategy?:      MatchType; // keyword-level override; undefined = auto-resolve from group
  monthlySearches:         number;
  competition:             Competition;
  estimatedCpc:            number;
  competitorPressureScore: number;
  category:                KeywordCategory;
  note:                    string;
}

const ALL_CATEGORIES_FOR_SELECT = Object.entries(CATEGORY_LABELS).map(
  ([k, v]) => ({ value: k, label: v })
);

function AddCustomPanel({
  initial,
  onSave,
  onClose,
}: {
  initial?: LibraryKeyword;
  onSave: (draft: KeywordDraft) => void;
  onClose: () => void;
}) {
  const [keyword,       setKeyword]       = useState(initial?.keyword                        ?? "");
  const [country,       setCountry]       = useState(initial?.country                        ?? LIBRARY_COUNTRIES[0]);
  const [intent,        setIntent]        = useState<Intent>(initial?.intent                 ?? "Commercial");
  const [matchType,     setMatchType]     = useState<MatchType>(initial?.matchType           ?? "Phrase");
  const [searches,      setSearches]      = useState(String(initial?.monthlySearches         ?? 100));
  const [competition,   setCompetition]   = useState<Competition>(initial?.competition       ?? "Medium");
  const [estCpc,        setEstCpc]        = useState(String(initial?.estimatedCpc            ?? 3.00));
  const [pressureScore, setPressureScore] = useState(String(initial?.competitorPressureScore ?? 50));
  const [category,      setCategory]      = useState<KeywordCategory>(initial?.category      ?? "commercial");
  const [note,              setNote]              = useState(initial?.note                ?? "");
  const [matchTypeStrategy, setMatchTypeStrategy] = useState<MatchType | "">(initial?.matchTypeStrategy ?? "");

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    onSave({
      keyword:                 keyword.trim(),
      country,
      intent,
      matchType,
      matchTypeStrategy:       matchTypeStrategy || undefined,
      monthlySearches:         Math.max(0, parseInt(searches, 10) || 0),
      competition,
      estimatedCpc:            Math.max(0, parseFloat(estCpc) || 0),
      competitorPressureScore: Math.max(0, Math.min(100, parseInt(pressureScore, 10) || 50)),
      category,
      note:                    note.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Keyword *</label>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className={inputCls} placeholder="e.g. cloud accounting software" required />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
            {LIBRARY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Search Intent</label>
          <select value={intent} onChange={(e) => setIntent(e.target.value as Intent)} className={inputCls}>
            {["Informational", "Commercial", "Transactional", "Navigational"].map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Base Match Type</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)} className={inputCls}>
            {["Broad", "Phrase", "Exact"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Match Type Strategy</label>
          <select value={matchTypeStrategy} onChange={(e) => setMatchTypeStrategy(e.target.value as MatchType | "")} className={inputCls}>
            <option value="">Auto (inherit from campaign/ad group)</option>
            <option value="Broad">Force: Broad</option>
            <option value="Phrase">Force: Phrase</option>
            <option value="Exact">Force: Exact</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-400">Override beats campaign/ad group defaults.</p>
        </div>
        <div>
          <label className={labelCls}>Monthly Searches</label>
          <input type="number" min="0" value={searches} onChange={(e) => setSearches(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Competition</label>
          <select value={competition} onChange={(e) => setCompetition(e.target.value as Competition)} className={inputCls}>
            {["Low", "Medium", "High"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Est. CPC ($)</label>
          <input type="number" min="0" step="0.01" value={estCpc} onChange={(e) => setEstCpc(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Competitor Pressure (0–100)</label>
          <input type="number" min="0" max="100" value={pressureScore} onChange={(e) => setPressureScore(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as KeywordCategory)} className={inputCls}>
            {ALL_CATEGORIES_FOR_SELECT.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Strategy or context note" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors">
          {initial ? "Update Keyword" : "Add Keyword"}
        </button>
      </div>
    </form>
  );
}

// ─── Bulk paste panel ─────────────────────────────────────────────────────────

function BulkPastePanel({
  defaultCountry,
  onAdd,
  onClose,
}: {
  defaultCountry: string;
  onAdd: (kws: LibraryKeyword[]) => void;
  onClose: () => void;
}) {
  const [text,     setText]     = useState("");
  const [country,  setCountry]  = useState(defaultCountry || LIBRARY_COUNTRIES[0]);
  const [intent,   setIntent]   = useState<Intent>("Commercial");
  const [matchType, setMatchType] = useState<MatchType>("Phrase");
  const [category, setCategory] = useState<KeywordCategory>("commercial");

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

  function handleAdd() {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const kws: LibraryKeyword[] = lines.map((kw) => {
      const derived = deriveKeywordFields({
        intent,
        competition:             "Medium",
        competitorPressureScore: 50,
        estimatedCpc:            3,
      });
      return {
        id:                      nextKwId(),
        source:                  "custom" as const,
        packName:                "",
        category,
        note:                    "",
        createdAt:               new Date().toISOString(),
        keyword:                 kw,
        country,
        intent,
        matchType,
        monthlySearches:         100,
        competition:             "Medium" as Competition,
        estimatedCpc:            3,
        competitorPressureScore: 50,
        competitorExamples:      [],
        strategyNote:            "",
        recommendationNote:      "",
        exclude:                 false,
        forceBuy:                false,
        forceTest:               false,
        ...derived,
      };
    });
    onAdd(kws);
    setText("");
  }

  const count = text.split("\n").map((l) => l.trim()).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Paste Keywords (one per line)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className={`${inputCls} resize-none font-mono text-xs`}
          placeholder={"cloud accounting software\nbest payroll solution\nhr software for smbs"}
        />
        {count > 0 && <p className="text-xs text-slate-400 mt-1">{count} keyword{count !== 1 ? "s" : ""} detected</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Country</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
            {LIBRARY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Intent</label>
          <select value={intent} onChange={(e) => setIntent(e.target.value as Intent)} className={inputCls}>
            {["Informational", "Commercial", "Transactional", "Navigational"].map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Match Type</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)} className={inputCls}>
            {["Broad", "Phrase", "Exact"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as KeywordCategory)} className={inputCls}>
            {ALL_CATEGORIES_FOR_SELECT.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Defaults applied: Est. CPC $3.00 · Medium competition · pressure score 50. Edit individual rows after adding.
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={count === 0}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add {count > 0 ? count : ""} Keyword{count !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

// ─── Preset packs panel ───────────────────────────────────────────────────────

function PresetPacksPanel({
  addedPacks,
  onAdd,
  onClose,
}: {
  addedPacks: Set<string>;
  onAdd: (packName: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Packs use <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">&#123;placeholder&#125;</code> text — edit keyword names after adding to match your specific offer.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PRESET_PACKS.map((pack) => {
          const isAdded = addedPacks.has(pack.name);
          return (
            <div
              key={pack.name}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${isAdded ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200 hover:border-brand-200 transition-colors"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{pack.name}</p>
                  <Badge label={CATEGORY_LABELS[pack.category]} className={`mt-1 ${CATEGORY_STYLES[pack.category]}`} />
                </div>
                <span className="text-xs text-slate-400 shrink-0">{pack.keywords.length} kws</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed flex-1">{pack.description}</p>
              <button
                onClick={() => !isAdded && onAdd(pack.name)}
                disabled={isAdded}
                className={`mt-1 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isAdded
                    ? "bg-slate-100 text-slate-400 cursor-default"
                    : "bg-brand-500 text-white hover:bg-brand-600"
                }`}
              >
                {isAdded ? "Already Added" : "Add Pack"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Generator panel ─────────────────────────────────────────────────────────

const GENERATOR_CATEGORY_ORDER: KeywordCategory[] = [
  "brand", "commercial", "purchase", "problem-aware",
  "comparison", "competitor", "informational", "local", "urgent",
];

/** Checkbox that supports the indeterminate state (some-but-not-all selected). */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={className ?? "rounded"}
    />
  );
}

function GeneratorPanel({
  targetCountries,
  onAdd,
  onClose,
  defaultBrand = "",
  defaultOffer = "",
}: {
  targetCountries: string[];
  onAdd: (kws: LibraryKeyword[]) => void;
  onClose: () => void;
  defaultBrand?: string;
  defaultOffer?: string;
}) {
  const [step,            setStep]           = useState<"form" | "results">("form");
  const [brandName,       setBrandName]      = useState(defaultBrand);
  const [primaryOffer,    setPrimaryOffer]   = useState(defaultOffer);
  const [secondaryOffer,  setSecondaryOffer] = useState("");
  const [competitors,     setCompetitors]    = useState("");
  const [problemsSolved,  setProblems]       = useState("");
  const [locationTerms,   setLocations]      = useState("");
  const [generatedKws,    setGeneratedKws]   = useState<LibraryKeyword[]>([]);
  const [selectedIds,     setSelectedIds]    = useState<Set<number>>(new Set());
  const [addedIds,        setAddedIds]       = useState<Set<number>>(new Set());

  const byCategory = useMemo<Map<KeywordCategory, LibraryKeyword[]>>(() => {
    const map = new Map<KeywordCategory, LibraryKeyword[]>();
    for (const kw of generatedKws) {
      if (!map.has(kw.category)) map.set(kw.category, []);
      map.get(kw.category)!.push(kw);
    }
    return map;
  }, [generatedKws]);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const kws = generateKeywords({
      brandName, primaryOffer, secondaryOffer,
      competitors, problemsSolved, locationTerms,
      targetCountries,
    });
    setGeneratedKws(kws);
    setSelectedIds(new Set(kws.map((k) => k.id)));
    setAddedIds(new Set());
    setStep("results");
  }

  function toggleId(id: number) {
    if (addedIds.has(id)) return; // already added — can't re-select
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCategory(cat: KeywordCategory) {
    const kws = (byCategory.get(cat) ?? []).filter((k) => !addedIds.has(k.id));
    const ids  = kws.map((k) => k.id);
    if (ids.length === 0) return;
    const allSel = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      allSel ? ids.forEach((id) => next.delete(id)) : ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function doAdd(kws: LibraryKeyword[]) {
    if (kws.length === 0) return;
    onAdd(kws);
    const ids = new Set(kws.map((k) => k.id));
    setAddedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

  // ── Results view ─────────────────────────────────────────────────────────────
  if (step === "results") {
    const availableKws = generatedKws.filter((k) => !addedIds.has(k.id));
    const selectedList = availableKws.filter((k) => selectedIds.has(k.id));
    const allAdded     = availableKws.length === 0 && generatedKws.length > 0;

    return (
      <div className="space-y-4">

        {/* Results header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-700">
              {generatedKws.length} keywords generated
            </span>
            {!allAdded && (
              <>
                <button
                  onClick={() => setSelectedIds(new Set(availableKws.map((k) => k.id)))}
                  className="text-xs font-medium text-brand-500 hover:text-brand-700"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Deselect all
                </button>
                <span className="text-xs text-slate-400">{selectedList.length} selected</span>
              </>
            )}
            {addedIds.size > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <CheckCheck size={12} /> {addedIds.size} added to workspace
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStep("form")}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 transition-colors"
            >
              ← Edit Inputs
            </button>
            {!allAdded && (
              <>
                <button
                  onClick={() => doAdd(selectedList)}
                  disabled={selectedList.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
                >
                  Add Selected ({selectedList.length})
                </button>
                <button
                  onClick={() => doAdd(availableKws)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                >
                  Add All ({availableKws.length})
                </button>
              </>
            )}
            {allAdded && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                Done ✓
              </button>
            )}
          </div>
        </div>

        {/* Category groups */}
        <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {GENERATOR_CATEGORY_ORDER.map((cat) => {
            const kws = byCategory.get(cat);
            if (!kws || kws.length === 0) return null;

            const available  = kws.filter((k) => !addedIds.has(k.id));
            const allCatSel  = available.length > 0 && available.every((k) => selectedIds.has(k.id));
            const someCatSel = available.some((k) => selectedIds.has(k.id));
            const allCatDone = available.length === 0;

            return (
              <div key={cat} className="rounded-xl border border-slate-200 overflow-hidden">
                {/* Category header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    {!allCatDone && (
                      <IndeterminateCheckbox
                        checked={allCatSel}
                        indeterminate={!allCatSel && someCatSel}
                        onChange={() => toggleCategory(cat)}
                      />
                    )}
                    <Badge label={CATEGORY_LABELS[cat]} className={CATEGORY_STYLES[cat]} />
                    <span className="text-xs text-slate-400">
                      {allCatDone
                        ? `${kws.length} added`
                        : `${available.length} of ${kws.length}`}
                    </span>
                  </div>
                  {!allCatDone && (
                    <button
                      onClick={() => doAdd(available)}
                      className="text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors"
                    >
                      Add Category →
                    </button>
                  )}
                  {allCatDone && (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCheck size={11} /> Added
                    </span>
                  )}
                </div>

                {/* Keyword rows */}
                <div className="divide-y divide-slate-50">
                  {kws.map((kw) => {
                    const isAdded = addedIds.has(kw.id);
                    return (
                      <label
                        key={kw.id}
                        className={`flex items-center gap-3 px-4 py-2 transition-colors ${
                          isAdded ? "opacity-40 cursor-default" : "hover:bg-slate-50 cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isAdded || selectedIds.has(kw.id)}
                          disabled={isAdded}
                          onChange={() => toggleId(kw.id)}
                          className="rounded shrink-0"
                        />
                        <span
                          className="flex-1 text-sm text-slate-800 font-medium truncate"
                          title={kw.keyword}
                        >
                          {kw.keyword}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0 hidden sm:block">
                          {kw.country}
                        </span>
                        <Badge label={kw.intent} className={INTENT_STYLES[kw.intent]} />
                        <ActionBadge action={kw.action} />
                        <span className="text-xs tabular-nums text-slate-500 shrink-0">
                          ${kw.estimatedCpc.toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Form view ─────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleGenerate} className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed">
        Describe your business and we'll generate keyword suggestions across all 9 strategic categories.
        Generated keywords are added to your workspace — edit, override, or delete them anytime.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Brand Name</label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Elitez"
          />
          <p className="text-[11px] text-slate-400 mt-1">Used to build brand defence + competitor comparison keywords.</p>
        </div>

        <div>
          <label className={labelCls}>Primary Offer / Service *</label>
          <input
            value={primaryOffer}
            onChange={(e) => setPrimaryOffer(e.target.value)}
            className={inputCls}
            placeholder="e.g. executive search"
            required
          />
          <p className="text-[11px] text-slate-400 mt-1">The core product or service you're advertising.</p>
        </div>

        <div>
          <label className={labelCls}>Secondary Offer <span className="font-normal text-slate-400">(optional)</span></label>
          <input
            value={secondaryOffer}
            onChange={(e) => setSecondaryOffer(e.target.value)}
            className={inputCls}
            placeholder="e.g. employer of record"
          />
          <p className="text-[11px] text-slate-400 mt-1">A second service line — adds comparison + purchase keywords.</p>
        </div>

        <div>
          <label className={labelCls}>Competitor Names <span className="font-normal text-slate-400">(one per line)</span></label>
          <textarea
            value={competitors}
            onChange={(e) => setCompetitors(e.target.value)}
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder={"Michael Page\nHays\nRobert Walters"}
          />
        </div>

        <div>
          <label className={labelCls}>Key Problems Solved <span className="font-normal text-slate-400">(one per line)</span></label>
          <textarea
            value={problemsSolved}
            onChange={(e) => setProblems(e.target.value)}
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder={"finding senior talent quickly\nmanaging overseas employees\nreducing hiring costs"}
          />
        </div>

        <div>
          <label className={labelCls}>Location / City Terms <span className="font-normal text-slate-400">(one per line)</span></label>
          <textarea
            value={locationTerms}
            onChange={(e) => setLocations(e.target.value)}
            className={`${inputCls} resize-none`}
            rows={3}
            placeholder={"Singapore\nKuala Lumpur\nBangkok"}
          />
          <p className="text-[11px] text-slate-400 mt-1">Generates local/geo keywords. Countries are auto-matched from your project.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!primaryOffer.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
        >
          <Wand2 size={14} />
          Generate Keywords
        </button>
      </div>
    </form>
  );
}

// ─── Campaign Manager Panel ───────────────────────────────────────────────────

function CampaignManagerPanel({
  campaigns,
  adGroups,
  totalBudget,
  onClose,
  onCampaignsChange,
  onAdGroupsChange,
}: {
  campaigns:         Campaign[];
  adGroups:          AdGroup[];
  totalBudget:       number;
  onClose:           () => void;
  onCampaignsChange: (list: Campaign[]) => void;
  onAdGroupsChange:  (list: AdGroup[]) => void;
}) {
  const [newCampaignName,  setNewCampaignName]  = useState("");
  const [renameCampaignId, setRenameCampaignId] = useState<string | null>(null);
  const [renameCampaignVal, setRenameCampaignVal] = useState("");
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);

  const [newAgCampaignId, setNewAgCampaignId]  = useState<string | null>(null);
  const [newAgName,        setNewAgName]        = useState("");
  const [newAgType,        setNewAgType]        = useState<AdGroupType>("generic");
  const [renameAgId,       setRenameAgId]       = useState<string | null>(null);
  const [renameAgVal,      setRenameAgVal]       = useState("");

  const inputCls = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent";

  function handleCreateCampaign() {
    if (!newCampaignName.trim()) return;
    const c = createCampaign(newCampaignName);
    onCampaignsChange([...campaigns, c]);
    setNewCampaignName("");
    setExpandedCampaignId(c.id);
  }

  function handleRenameCampaign(id: string) {
    if (!renameCampaignVal.trim()) return;
    updateCampaign(id, { name: renameCampaignVal.trim() });
    onCampaignsChange(campaigns.map((c) => c.id === id ? { ...c, name: renameCampaignVal.trim() } : c));
    setRenameCampaignId(null);
  }

  function handleDeleteCampaign(id: string) {
    deleteCampaign(id);
    onCampaignsChange(campaigns.filter((c) => c.id !== id));
    onAdGroupsChange(adGroups.filter((g) => g.campaignId !== id));
  }

  function handleToggleCampaignExclude(c: Campaign) {
    updateCampaign(c.id, { excludeFromForecast: !c.excludeFromForecast });
    onCampaignsChange(campaigns.map((x) => x.id === c.id ? { ...x, excludeFromForecast: !x.excludeFromForecast } : x));
  }

  function handleSetBudgetMode(id: string, mode: "auto" | "manual") {
    updateCampaign(id, { budgetMode: mode });
    onCampaignsChange(campaigns.map((c) => c.id === id ? { ...c, budgetMode: mode } : c));
  }

  function handleSetBudgetAmount(id: string, amount: number) {
    updateCampaign(id, { budgetAmount: amount });
    onCampaignsChange(campaigns.map((c) => c.id === id ? { ...c, budgetAmount: amount } : c));
  }

  function handleSetCampaignMatchType(id: string, mt: MatchType | undefined) {
    updateCampaign(id, { defaultMatchType: mt });
    onCampaignsChange(campaigns.map((c) => c.id === id ? { ...c, defaultMatchType: mt } : c));
  }

  function handleSetAdGroupMatchType(id: string, mt: MatchType | "inherit" | undefined) {
    updateAdGroup(id, { defaultMatchType: mt });
    onAdGroupsChange(adGroups.map((g) => g.id === id ? { ...g, defaultMatchType: mt } : g));
  }

  function handleCreateAdGroup() {
    if (!newAgCampaignId || !newAgName.trim()) return;
    const g = createAdGroup(newAgCampaignId, newAgName, newAgType);
    onAdGroupsChange([...adGroups, g]);
    setNewAgName("");
    setNewAgType("generic");
    setNewAgCampaignId(null);
  }

  function handleRenameAdGroup(id: string) {
    if (!renameAgVal.trim()) return;
    updateAdGroup(id, { name: renameAgVal.trim() });
    onAdGroupsChange(adGroups.map((g) => g.id === id ? { ...g, name: renameAgVal.trim() } : g));
    setRenameAgId(null);
  }

  function handleDeleteAdGroup(id: string) {
    deleteAdGroup(id);
    onAdGroupsChange(adGroups.filter((g) => g.id !== id));
  }

  function handleToggleAdGroupExclude(g: AdGroup) {
    updateAdGroup(g.id, { excludeFromForecast: !g.excludeFromForecast });
    onAdGroupsChange(adGroups.map((x) => x.id === g.id ? { ...x, excludeFromForecast: !x.excludeFromForecast } : x));
  }

  return (
    <div className="space-y-4">
      {/* Create campaign */}
      <div className="flex items-center gap-2">
        <input
          value={newCampaignName}
          onChange={(e) => setNewCampaignName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateCampaign()}
          placeholder="New campaign name…"
          className={`${inputCls} flex-1`}
        />
        <button
          onClick={handleCreateCampaign}
          disabled={!newCampaignName.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
        >
          <Plus size={12} /> Add Campaign
        </button>
      </div>

      {campaigns.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-4">No campaigns yet. Create one above to start organising your keywords.</p>
      )}

      {/* Campaign list */}
      <div className="space-y-2">
        {campaigns.map((c) => {
          const campaignAdGroups = adGroups.filter((g) => g.campaignId === c.id);
          const isExpanded = expandedCampaignId === c.id;
          const isRenaming = renameCampaignId === c.id;
          const isAddingAg = newAgCampaignId === c.id;

          return (
            <div key={c.id} className={`rounded-xl border ${c.excludeFromForecast ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"} overflow-hidden`}>
              {/* Campaign row */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => setExpandedCampaignId(isExpanded ? null : c.id)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {isRenaming ? (
                  <input
                    value={renameCampaignVal}
                    onChange={(e) => setRenameCampaignVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameCampaign(c.id); if (e.key === "Escape") setRenameCampaignId(null); }}
                    autoFocus
                    className={`${inputCls} flex-1 text-xs`}
                  />
                ) : (
                  <span className={`flex-1 text-sm font-semibold ${c.excludeFromForecast ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {c.name}
                  </span>
                )}

                <span className="text-xs text-slate-400 shrink-0">{campaignAdGroups.length} ad group{campaignAdGroups.length !== 1 ? "s" : ""}</span>

                <button
                  onClick={() => handleToggleCampaignExclude(c)}
                  title={c.excludeFromForecast ? "Include in forecast" : "Exclude from forecast"}
                  className={`p-1 rounded transition-colors ${c.excludeFromForecast ? "text-rose-400 hover:text-rose-600" : "text-slate-300 hover:text-slate-500"}`}
                >
                  {c.excludeFromForecast ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                {isRenaming ? (
                  <>
                    <button onClick={() => handleRenameCampaign(c.id)} className="text-xs font-semibold text-brand-500 hover:text-brand-700">Save</button>
                    <button onClick={() => setRenameCampaignId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setRenameCampaignId(c.id); setRenameCampaignVal(c.name); }}
                    className="p-1 rounded text-slate-300 hover:text-slate-600 transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteCampaign(c.id)}
                  className="p-1 rounded text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Budget row */}
              <div className="flex items-center gap-2 px-3 pb-2.5 pl-8">
                <span className="text-[11px] text-slate-400 font-medium shrink-0">Budget:</span>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0">
                  <button
                    onClick={() => handleSetBudgetMode(c.id, "auto")}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                      (c.budgetMode ?? "auto") === "auto" ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => handleSetBudgetMode(c.id, "manual")}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                      (c.budgetMode ?? "auto") === "manual" ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Manual
                  </button>
                </div>
                {(c.budgetMode ?? "auto") === "manual" && (
                  <>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]">$</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={c.budgetAmount ?? ""}
                        onChange={(e) => handleSetBudgetAmount(c.id, parseFloat(e.target.value) || 0)}
                        className="pl-4 pr-2 py-0.5 w-24 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:ring-1 focus:ring-brand-400"
                        placeholder="0"
                      />
                    </div>
                    {totalBudget > 0 && (c.budgetAmount ?? 0) > 0 && (
                      <span className={`text-[11px] font-semibold ${(c.budgetAmount ?? 0) > totalBudget ? "text-rose-500" : "text-slate-500"}`}>
                        {Math.round(((c.budgetAmount ?? 0) / totalBudget) * 100)}% of ${totalBudget.toLocaleString()}
                      </span>
                    )}
                  </>
                )}
                {(c.budgetMode ?? "auto") === "auto" && (
                  <span className="text-[11px] text-slate-400">Distributed by opportunity score</span>
                )}
              </div>

              {/* Default match type row */}
              <div className="flex items-center gap-2 px-3 pb-2.5 pl-8">
                <span className="text-[11px] text-slate-400 font-medium shrink-0">Default Match:</span>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0">
                  {(["None", "Broad", "Phrase", "Exact"] as const).map((mt) => {
                    const isActive = mt === "None" ? !c.defaultMatchType : c.defaultMatchType === mt;
                    return (
                      <button
                        key={mt}
                        onClick={() => handleSetCampaignMatchType(c.id, mt === "None" ? undefined : mt as MatchType)}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                          isActive ? "bg-white text-brand-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {mt}
                      </button>
                    );
                  })}
                </div>
                {c.defaultMatchType && (
                  <span className="text-[11px] text-slate-400">
                    Applied to all keywords without a keyword or ad group override
                  </span>
                )}
              </div>

              {/* Ad groups (when expanded) */}
              {isExpanded && (
                <div className="border-t border-slate-100 pl-8 pr-3 py-2 space-y-1.5">
                  {campaignAdGroups.map((g) => {
                    const isRenamingAg = renameAgId === g.id;
                    return (
                      <div key={g.id} className="flex items-center gap-2 py-1">
                        {isRenamingAg ? (
                          <input
                            value={renameAgVal}
                            onChange={(e) => setRenameAgVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRenameAdGroup(g.id); if (e.key === "Escape") setRenameAgId(null); }}
                            autoFocus
                            className={`${inputCls} flex-1 text-xs`}
                          />
                        ) : (
                          <span className={`flex-1 text-xs font-medium ${g.excludeFromForecast ? "text-slate-400 line-through" : "text-slate-700"}`}>
                            {g.name}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          {AD_GROUP_TYPE_LABELS[g.groupType]}
                        </span>
                        <select
                          value={g.defaultMatchType ?? "inherit"}
                          onChange={(e) => {
                            const v = e.target.value;
                            handleSetAdGroupMatchType(g.id, v === "inherit" ? "inherit" : v as MatchType);
                          }}
                          title="Default match type for this ad group"
                          className="text-[10px] rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 bg-white outline-none focus:ring-1 focus:ring-brand-400 shrink-0"
                        >
                          <option value="inherit">Inherit</option>
                          <option value="Broad">Broad</option>
                          <option value="Phrase">Phrase</option>
                          <option value="Exact">Exact</option>
                        </select>
                        <button
                          onClick={() => handleToggleAdGroupExclude(g)}
                          title={g.excludeFromForecast ? "Include in forecast" : "Exclude from forecast"}
                          className={`p-1 rounded transition-colors ${g.excludeFromForecast ? "text-rose-400 hover:text-rose-600" : "text-slate-300 hover:text-slate-500"}`}
                        >
                          {g.excludeFromForecast ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        {isRenamingAg ? (
                          <>
                            <button onClick={() => handleRenameAdGroup(g.id)} className="text-xs font-semibold text-brand-500 hover:text-brand-700">Save</button>
                            <button onClick={() => setRenameAgId(null)} className="text-xs text-slate-400">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => { setRenameAgId(g.id); setRenameAgVal(g.name); }} className="p-1 rounded text-slate-300 hover:text-slate-600 transition-colors">
                            <Pencil size={11} />
                          </button>
                        )}
                        <button onClick={() => handleDeleteAdGroup(g.id)} className="p-1 rounded text-slate-300 hover:text-rose-500 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add ad group */}
                  {isAddingAg ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        value={newAgName}
                        onChange={(e) => setNewAgName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateAdGroup()}
                        placeholder="Ad group name…"
                        autoFocus
                        className={`${inputCls} flex-1 text-xs`}
                      />
                      <select
                        value={newAgType}
                        onChange={(e) => setNewAgType(e.target.value as AdGroupType)}
                        className={`${inputCls} text-xs`}
                      >
                        {AD_GROUP_TYPES.map((t) => (
                          <option key={t} value={t}>{AD_GROUP_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <button onClick={handleCreateAdGroup} disabled={!newAgName.trim()} className="text-xs font-semibold text-brand-500 hover:text-brand-700 disabled:opacity-40">Add</button>
                      <button onClick={() => { setNewAgCampaignId(null); setNewAgName(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setNewAgCampaignId(c.id)}
                      className="text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors"
                    >
                      + Add Ad Group
                    </button>
                  )}

                  {/* Keyword generation inputs (editable after creation) */}
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Keyword Generation Inputs</p>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Services / Keyword Base</label>
                      <input
                        type="text"
                        defaultValue={c.keywordBase ?? ""}
                        onBlur={(e) => updateCampaign(c.id, { keywordBase: e.target.value.trim() || undefined })}
                        placeholder="e.g. EOR, Headhunting, Payroll"
                        className={`${inputCls} text-xs w-full`}
                      />
                    </div>
                    {(c.campaignType === "high-intent") && (
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Target Actions</label>
                        <input
                          type="text"
                          defaultValue={c.targetActions ?? ""}
                          onBlur={(e) => updateCampaign(c.id, { targetActions: e.target.value.trim() || undefined })}
                          placeholder="e.g. hire, find, need, get"
                          className={`${inputCls} text-xs w-full`}
                        />
                      </div>
                    )}
                    {(c.campaignType === "competitor") && (
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Competitors</label>
                        <input
                          type="text"
                          defaultValue={c.competitors ?? ""}
                          onBlur={(e) => updateCampaign(c.id, { competitors: e.target.value.trim() || undefined })}
                          placeholder="e.g. Competitor A, Competitor B"
                          className={`${inputCls} text-xs w-full`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Group summary card ───────────────────────────────────────────────────────

interface GroupRollup {
  kwCount:   number;
  buyCount:  number;
  testCount: number;
  budget:    number;
  clicks:    number;
  convs:     number;
  cpa:       number;
  revenue:   number;
  roas:      number;
}

function computeRollup(kws: EnrichedWorkspaceKeyword[]): GroupRollup {
  const buy  = kws.filter((k) => k.effectiveAction === "Buy");
  const test = kws.filter((k) => k.effectiveAction === "Test");
  const budget  = kws.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
  const clicks  = kws.reduce((s, k) => s + k.estimatedClicks, 0);
  const convs   = kws.reduce((s, k) => s + k.estimatedLeads, 0);
  const revenue = kws.reduce((s, k) => s + k.revenuePotential, 0);
  const roas    = budget > 0 ? +(revenue / budget).toFixed(2) : 0;
  return {
    kwCount: kws.length, buyCount: buy.length, testCount: test.length,
    budget, clicks, convs, cpa: convs > 0 ? Math.round(budget / convs) : 0, revenue, roas,
  };
}

function RollupBadge({
  r,
  budgetMode,
  manualBudget: _manualBudget,
  totalBudget,
}: {
  r:             GroupRollup;
  budgetMode?:   "auto" | "manual";
  manualBudget?: number;
  totalBudget?:  number;
}) {
  const pct = totalBudget && totalBudget > 0 && r.budget > 0
    ? Math.round((r.budget / totalBudget) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span><span className="font-semibold text-slate-700">{r.kwCount}</span> kw{r.kwCount !== 1 ? "s" : ""}</span>
      <span className="text-emerald-600 font-semibold">● {r.buyCount} Buy</span>
      <span className="text-amber-600 font-semibold">◐ {r.testCount} Test</span>
      {r.budget > 0 && (
        <span className="flex items-center gap-1">
          <span className="font-semibold text-slate-700">${r.budget.toLocaleString()}</span>
          {pct > 0 && <span className="text-slate-400">({pct}%)</span>}
          {budgetMode === "manual" && (
            <span className="bg-amber-50 text-amber-600 border border-amber-100 rounded px-1.5 py-0.5 text-[10px] font-bold">Manual</span>
          )}
          {budgetMode === "auto" && (
            <span className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 text-[10px]">Auto</span>
          )}
        </span>
      )}
      {r.clicks > 0 && <span><span className="font-semibold text-slate-700">{r.clicks.toLocaleString()}</span> clicks</span>}
      {r.convs > 0  && <span><span className="font-semibold text-emerald-600">{r.convs}</span> conv</span>}
      {r.cpa > 0    && <span>CPA <span className="font-semibold text-slate-700">${r.cpa.toLocaleString()}</span></span>}
      {r.revenue > 0 && <span>Rev <span className="font-semibold text-brand-600">${r.revenue.toLocaleString()}</span></span>}
      {r.roas > 0   && <span>ROAS <span className="font-semibold text-violet-600">{r.roas.toFixed(1)}×</span></span>}
    </div>
  );
}

// ─── Table columns ────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: "keyword",                  label: "Keyword",             width: "min-w-[200px]" },
  { key: "campaign",                 label: "Campaign",            width: "min-w-[160px]" },
  { key: "adGroup",                  label: "Ad Group",            width: "min-w-[160px]" },
  { key: "source",                   label: "Source",              width: "min-w-[90px]"  },
  { key: "country",                  label: "Country",             width: "min-w-[120px]" },
  { key: "intent",                   label: "Intent",              width: "min-w-[130px]" },
  { key: "monthlySearches",          label: "Mo. Searches",        width: "min-w-[110px]" },
  { key: "competition",              label: "Competition",         width: "min-w-[110px]" },
  { key: "estimatedCpc",             label: "Est. CPC",            width: "min-w-[80px]"  },
  { key: "matchType",                label: "Base Match",          width: "min-w-[100px]" },
  { key: "effectiveMatchType",       label: "Eff. Match",          width: "min-w-[100px]" },
  { key: "opportunityScore",         label: "Opportunity",         width: "min-w-[120px]" },
  { key: "action",                   label: "Action",              width: "min-w-[100px]" },
  { key: "businessRelevance",        label: "Biz Relevance",       width: "min-w-[120px]" },
  { key: "category",                 label: "Category",            width: "min-w-[140px]" },
  { key: "suggestedCpc",             label: "Sug. CPC",            width: "min-w-[80px]"  },
  { key: "suggestedMonthlyBudget",   label: "Sug. Budget",         width: "min-w-[100px]" },
  { key: "estimatedClicks",          label: "Est. Clicks",         width: "min-w-[90px]"  },
  { key: "estimatedLeads",           label: "Est. Conversions",    width: "min-w-[110px]" },
  { key: "estimatedCpl",             label: "Est. CPA",            width: "min-w-[80px]"  },
  { key: "revenuePotential",         label: "Revenue Potential",   width: "min-w-[140px]" },
  { key: "competitorPressure",       label: "Comp. Pressure",      width: "min-w-[120px]" },
  { key: "competitorPressureScore",  label: "Pressure Score",      width: "min-w-[130px]" },
  { key: "adCrowdingLevel",          label: "Ad Crowding",         width: "min-w-[110px]" },
  { key: "competitiveDifficulty",    label: "Difficulty",          width: "min-w-[110px]" },
  { key: "competitorExamples",       label: "Competitors",         width: "min-w-[200px]" },
  { key: "strategyNote",             label: "Strategy Note",       width: "min-w-[300px]" },
  { key: "recommendationNote",       label: "Rec. Note",           width: "min-w-[250px]" },
  { key: "controls",                 label: "",                    width: "min-w-[110px]" },
];

// ─── Compact keyword row (used in grouped views) ─────────────────────────────

function CompactKeywordRow({
  kw,
  isProjectSet,
  indent,
  toggleOverride,
  deleteLibraryKw,
  startEdit,
  adGroupOptions,
  onAssignAdGroup,
}: {
  kw:               EnrichedWorkspaceKeyword;
  isProjectSet:     boolean;
  indent:           number;
  toggleOverride:   (kw: EnrichedWorkspaceKeyword, f: "exclude" | "forceBuy" | "forceTest") => void;
  deleteLibraryKw:  (id: number) => void;
  startEdit:        (kw: EnrichedWorkspaceKeyword) => void;
  adGroupOptions?:  Array<{ id: string; name: string }>;
  onAssignAdGroup?: (kwId: number, adGroupId: string | undefined) => void;
}) {
  const isOverridden = kw.effectiveAction !== kw.action;
  const pl = indent === 3 ? "pl-16" : indent === 2 ? "pl-12" : "pl-8";
  return (
    <div className={`flex flex-wrap items-center gap-3 px-5 py-2 border-t border-slate-50 hover:bg-slate-50/60 transition-colors ${pl} ${kw.exclude ? "opacity-50" : ""}`}>
      {/* Action badge */}
      <ActionBadge action={kw.effectiveAction} overridden={isOverridden} />

      {/* Keyword */}
      <span className="text-sm font-medium text-slate-800 min-w-[140px] flex-1 truncate" title={kw.keyword}>
        {kw.keyword}
      </span>

      {/* Ad group assignment (library keywords only, when inside a campaign) */}
      {adGroupOptions && onAssignAdGroup && kw.isLibrary && (
        <select
          value={kw.adGroupId ?? ""}
          onChange={(e) => onAssignAdGroup(kw.id, e.target.value || undefined)}
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] rounded border border-slate-200 px-1.5 py-0.5 text-slate-500 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 max-w-[130px] shrink-0"
        >
          <option value="">— No group —</option>
          {adGroupOptions.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}

      {/* Category */}
      <Badge label={CATEGORY_LABELS[kw.category]} className={`${CATEGORY_STYLES[kw.category]} hidden sm:inline-flex`} />

      {/* Country */}
      <span className="text-xs text-slate-400 hidden md:block">{kw.country}</span>

      {/* Forecast metrics */}
      {kw.suggestedMonthlyBudget > 0 && (
        <span className="text-xs tabular-nums text-slate-600 font-medium">${kw.suggestedMonthlyBudget.toLocaleString()}</span>
      )}
      {kw.estimatedClicks > 0 && (
        <span className="text-xs tabular-nums text-slate-500">{kw.estimatedClicks.toLocaleString()} clicks</span>
      )}
      {kw.estimatedLeads > 0 && (
        <span className="text-xs tabular-nums font-semibold text-emerald-600">{kw.estimatedLeads} conv</span>
      )}
      {isProjectSet && kw.businessRelevanceScore > 0 && (
        <RelevanceBar score={kw.businessRelevanceScore} />
      )}

      {/* Controls */}
      <div className="flex items-center gap-0.5 ml-auto shrink-0">
        <button onClick={() => toggleOverride(kw, "exclude")} title={kw.exclude ? "Remove exclusion" : "Exclude"}
          className={`p-1.5 rounded-lg transition-colors ${kw.exclude ? "text-rose-500 bg-rose-50" : "text-slate-300 hover:text-rose-400 hover:bg-rose-50"}`}>
          <Ban size={12} />
        </button>
        <button onClick={() => toggleOverride(kw, "forceBuy")} title={kw.forceBuy ? "Clear force buy" : "Force Buy"}
          className={`p-1.5 rounded-lg transition-colors ${kw.forceBuy ? "text-emerald-600 bg-emerald-50" : "text-slate-300 hover:text-emerald-500 hover:bg-emerald-50"}`}>
          <ShoppingCart size={12} />
        </button>
        <button onClick={() => toggleOverride(kw, "forceTest")} title={kw.forceTest ? "Clear force test" : "Force Test"}
          className={`p-1.5 rounded-lg transition-colors ${kw.forceTest ? "text-amber-600 bg-amber-50" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50"}`}>
          <FlaskConical size={12} />
        </button>
        {kw.isLibrary && (
          <button onClick={() => startEdit(kw)} title="Edit"
            className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <Pencil size={12} />
          </button>
        )}
        {kw.isLibrary && (
          <button onClick={() => deleteLibraryKw(kw.id)} title="Delete"
            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Group-aware budget allocation ───────────────────────────────────────────
// When at least one campaign has budgetMode === "manual", distribute budget per
// campaign first, then use the standard opportunity-score split within each group.
// Keywords with no campaign are treated as an implicit "auto" pool.

function groupedBudgetAllocate(
  forecastKws:              Keyword[],
  kwCampaignMap:            Map<number, string | undefined>,
  campaigns:                Campaign[],
  totalBudget:              number,
  calibratedCvrByCategory?: Record<string, number>,
): Map<number, number> {
  const manualCampaigns = campaigns.filter(
    (c) => (c.budgetMode ?? "auto") === "manual" && (c.budgetAmount ?? 0) > 0 && !c.excludeFromForecast
  );

  if (manualCampaigns.length === 0) {
    return allocateBudgets(forecastKws, totalBudget, calibratedCvrByCategory);
  }

  const rawManualTotal = manualCampaigns.reduce((s, c) => s + (c.budgetAmount ?? 0), 0);
  // Cap manual total at project budget, preserving proportions if over
  const scale        = rawManualTotal > totalBudget ? totalBudget / rawManualTotal : 1;
  const manualIds    = new Set(manualCampaigns.map((c) => c.id));
  const remainingAuto = Math.max(0, totalBudget - rawManualTotal * scale);

  // Partition keywords
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

  // Auto pool
  allocateBudgets(autoKws, remainingAuto, calibratedCvrByCategory).forEach((budget, id) => resultMap.set(id, budget));

  // Manual campaigns — each gets its capped amount
  for (const c of manualCampaigns) {
    const kwList  = manualKwsByCampaign.get(c.id) ?? [];
    const cBudget = Math.round((c.budgetAmount ?? 0) * scale);
    allocateBudgets(kwList, cBudget, calibratedCvrByCategory).forEach((budget, id) => resultMap.set(id, budget));
  }

  return resultMap;
}

// ─── Negative Keywords Panel ──────────────────────────────────────────────────

const NEG_LEVEL_LABELS: Record<NegLevel, string> = {
  project:  "Project (all campaigns)",
  campaign: "Campaign",
  adGroup:  "Ad Group",
};

const NEG_MATCH_LABELS: Record<NegMatchType, string> = {
  exact:  "Exact",
  phrase: "Phrase",
  broad:  "Broad",
};

function NegativeKeywordsPanel({
  negatives,
  campaigns,
  adGroups,
  initialText,
  onClose: _onClose,
  onChange,
}: {
  negatives:    NegativeKeyword[];
  campaigns:    { id: string; name: string }[];
  adGroups:     { id: string; campaignId: string; name: string }[];
  initialText?: string;
  onClose:      () => void;
  onChange:     (list: NegativeKeyword[]) => void;
}) {
  const [tab,           setTab]           = useState<"add" | "bulk" | "packs" | "list">("add");
  const [addText,       setAddText]       = useState(initialText ?? "");
  const [addLevel,      setAddLevel]      = useState<NegLevel>("project");
  const [addCampaignId, setAddCampaignId] = useState("");
  const [addAdGroupId,  setAddAdGroupId]  = useState("");
  const [addMatchType,  setAddMatchType]  = useState<NegMatchType>("phrase");
  const [addNote,       setAddNote]       = useState("");
  const [bulkText,      setBulkText]      = useState("");
  const [bulkLevel,     setBulkLevel]     = useState<NegLevel>("project");
  const [bulkMatchType, setBulkMatchType] = useState<NegMatchType>("broad");
  const [filterLevel,   setFilterLevel]   = useState("");
  const [filterMatch,   setFilterMatch]   = useState("");
  const [editingNegId,  setEditingNegId]  = useState<string | null>(null);
  const [editText,      setEditText]      = useState("");
  const [editNote,      setEditNote]      = useState("");

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent";
  const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

  function reload() {
    onChange(getNegativeKeywords());
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addText.trim()) return;
    addNegativeKeyword({
      text:       addText.trim(),
      level:      addLevel,
      campaignId: addLevel === "campaign" ? (addCampaignId || undefined) : undefined,
      adGroupId:  addLevel === "adGroup"  ? (addAdGroupId  || undefined) : undefined,
      matchType:  addMatchType,
      source:     "manual",
      note:       addNote.trim() || undefined,
    });
    reload();
    setAddText(""); setAddNote("");
  }

  function handleBulkAdd(e: React.FormEvent) {
    e.preventDefault();
    const terms = bulkText.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
    if (terms.length === 0) return;
    for (const term of terms) {
      addNegativeKeyword({ text: term, level: bulkLevel, matchType: bulkMatchType, source: "manual" });
    }
    reload();
    setBulkText("");
  }

  function handleAddPack(packIdx: number) {
    const pack = NEGATIVE_PACKS[packIdx];
    for (const term of pack.terms) {
      addNegativeKeyword({ text: term, level: "project", matchType: pack.matchType, source: "suggested" });
    }
    reload();
  }

  function handleDelete(id: string) {
    deleteNegativeKeyword(id);
    reload();
  }

  function startEditNeg(neg: NegativeKeyword) {
    setEditingNegId(neg.id);
    setEditText(neg.text);
    setEditNote(neg.note ?? "");
  }

  function handleSaveEdit(id: string) {
    updateNegativeKeyword(id, { text: editText.trim(), note: editNote.trim() || undefined });
    setEditingNegId(null);
    reload();
  }

  const filteredNegs = negatives.filter((n) => {
    if (filterLevel && n.level !== filterLevel) return false;
    if (filterMatch && n.matchType !== filterMatch) return false;
    return true;
  });

  const tabCls = (t: string) =>
    `px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
      tab === t ? "bg-brand-500 text-white" : "text-slate-500 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1">
        <button onClick={() => setTab("add")}   className={tabCls("add")}>Add Single</button>
        <button onClick={() => setTab("bulk")}  className={tabCls("bulk")}>Bulk Paste</button>
        <button onClick={() => setTab("packs")} className={tabCls("packs")}>Suggested Packs</button>
        <button onClick={() => setTab("list")}  className={tabCls("list")}>
          List
          {negatives.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/30 text-[10px] font-bold">
              {negatives.length}
            </span>
          )}
        </button>
      </div>

      {/* Add Single */}
      {tab === "add" && (
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className={labelCls}>Negative Keyword *</label>
            <input value={addText} onChange={(e) => setAddText(e.target.value)} className={inputCls} placeholder="e.g. free jobs salary" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Level</label>
              <select value={addLevel} onChange={(e) => setAddLevel(e.target.value as NegLevel)} className={inputCls}>
                {(Object.entries(NEG_LEVEL_LABELS) as [NegLevel, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Match Type</label>
              <select value={addMatchType} onChange={(e) => setAddMatchType(e.target.value as NegMatchType)} className={inputCls}>
                {(Object.entries(NEG_MATCH_LABELS) as [NegMatchType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {addLevel === "campaign" && (
              <div className="col-span-2">
                <label className={labelCls}>Campaign</label>
                <select value={addCampaignId} onChange={(e) => setAddCampaignId(e.target.value)} className={inputCls}>
                  <option value="">— Select campaign —</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {addLevel === "adGroup" && (
              <>
                <div>
                  <label className={labelCls}>Campaign</label>
                  <select value={addCampaignId} onChange={(e) => { setAddCampaignId(e.target.value); setAddAdGroupId(""); }} className={inputCls}>
                    <option value="">— Select campaign —</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Ad Group</label>
                  <select value={addAdGroupId} onChange={(e) => setAddAdGroupId(e.target.value)} className={inputCls} disabled={!addCampaignId}>
                    <option value="">— Select ad group —</option>
                    {adGroups.filter((g) => g.campaignId === addCampaignId).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          <div>
            <label className={labelCls}>Note (optional)</label>
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} className={inputCls} placeholder="Why this term is excluded" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors">
              Add Negative
            </button>
          </div>
        </form>
      )}

      {/* Bulk Paste */}
      {tab === "bulk" && (
        <form onSubmit={handleBulkAdd} className="space-y-3">
          <div>
            <label className={labelCls}>Paste terms (one per line or comma-separated)</label>
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} className={`${inputCls} resize-none`} placeholder={"free\njobs\nsalary\ntemplate"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Level (applied to all)</label>
              <select value={bulkLevel} onChange={(e) => setBulkLevel(e.target.value as NegLevel)} className={inputCls}>
                {(Object.entries(NEG_LEVEL_LABELS) as [NegLevel, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Match Type (applied to all)</label>
              <select value={bulkMatchType} onChange={(e) => setBulkMatchType(e.target.value as NegMatchType)} className={inputCls}>
                {(Object.entries(NEG_MATCH_LABELS) as [NegMatchType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors">
              Add All
            </button>
          </div>
        </form>
      )}

      {/* Suggested Packs */}
      {tab === "packs" && (
        <div className="space-y-3">
          {NEGATIVE_PACKS.map((pack, idx) => {
            const alreadyAdded = pack.terms.every((t) =>
              negatives.some((n) => n.text === t && n.source === "suggested")
            );
            return (
              <div key={pack.name} className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{pack.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{pack.description}</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {pack.terms.length} terms · {NEG_MATCH_LABELS[pack.matchType]} match
                  </p>
                </div>
                <button
                  onClick={() => !alreadyAdded && handleAddPack(idx)}
                  disabled={alreadyAdded}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    alreadyAdded
                      ? "bg-slate-100 text-slate-400 cursor-default"
                      : "bg-brand-500 text-white hover:bg-brand-600"
                  }`}
                >
                  {alreadyAdded ? "Added" : "Add Pack"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {tab === "list" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">Level: All</option>
              {(Object.entries(NEG_LEVEL_LABELS) as [NegLevel, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={filterMatch} onChange={(e) => setFilterMatch(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">Match: All</option>
              {(Object.entries(NEG_MATCH_LABELS) as [NegMatchType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          {filteredNegs.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">
              {negatives.length === 0 ? "No negative keywords yet." : "No results for selected filters."}
            </p>
          )}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {filteredNegs.map((neg) => {
              const isEditing = editingNegId === neg.id;
              const campaignName = neg.campaignId ? campaigns.find((c) => c.id === neg.campaignId)?.name : undefined;
              const adGroupName  = neg.adGroupId  ? adGroups.find((g)  => g.id === neg.adGroupId)?.name  : undefined;
              return (
                <div key={neg.id} className="px-4 py-3 bg-white hover:bg-slate-50 transition-colors">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input value={editText} onChange={(e) => setEditText(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                      <input value={editNote} onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Note (optional)"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingNegId(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
                        <button onClick={() => handleSaveEdit(neg.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{neg.text}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {NEG_LEVEL_LABELS[neg.level]}
                            {campaignName && ` · ${campaignName}`}
                            {adGroupName  && ` › ${adGroupName}`}
                          </span>
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {NEG_MATCH_LABELS[neg.matchType]}
                          </span>
                          {neg.source === "suggested" && (
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">Suggested</span>
                          )}
                        </div>
                        {neg.note && <p className="text-xs text-slate-400 mt-1">{neg.note}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => startEditNeg(neg)} title="Edit"
                          className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(neg.id)} title="Delete"
                          className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Campaign Modal ────────────────────────────────────────────────────

const CAMPAIGN_TYPES: CampaignType[] = ["brand", "generic", "high-intent", "competitor", "pricing", "local", "niche", "custom"];

type AdGroupDef = { name: string; groupType: AdGroupType; checked: boolean };

function CreateCampaignModal({
  onConfirm,
  onClose,
  targetCountries,
  profile,
}: {
  onConfirm: (
    name:     string,
    type:     CampaignType,
    kws:      LibraryKeyword[],
    adGroups: Array<{ name: string; groupType: AdGroupType }>,
    extras:   { keywordBase?: string; targetActions?: string; competitors?: string },
  ) => void;
  onClose: () => void;
  targetCountries: string[];
  profile: ProjectProfile;
}) {
  const [step,          setStep]         = useState<1 | 2 | 3>(1);
  const [selectedType,  setSelectedType] = useState<CampaignType | null>(null);
  const [name,          setName]         = useState("");
  const [starterKws,    setStarterKws]   = useState<LibraryKeyword[]>([]);
  const [agDefs,        setAgDefs]       = useState<AdGroupDef[]>([]);
  // User-controlled keyword inputs
  const [keywordBase,   setKeywordBase]  = useState("");   // comma-separated services
  const [targetActions, setTargetActions] = useState("");  // comma-separated actions (high-intent)
  const [competitors,   setCompetitors]  = useState("");   // comma-separated competitors

  function parseCommaList(raw: string): string[] {
    return raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  }

  function buildUserInputs(): UserKeywordInputs {
    return {
      services:    parseCommaList(keywordBase),
      actions:     parseCommaList(targetActions),
      competitors: parseCommaList(competitors),
    };
  }

  function regenerateKeywords(type: CampaignType, overrideBase?: string, overrideActions?: string, overrideComps?: string) {
    const tempId   = "preview-" + Date.now();
    const countries = targetCountries.length > 0 ? targetCountries : ["Singapore"];
    const ui: UserKeywordInputs = {
      services:    parseCommaList(overrideBase    ?? keywordBase),
      actions:     parseCommaList(overrideActions ?? targetActions),
      competitors: parseCommaList(overrideComps   ?? competitors),
    };
    setStarterKws(buildDynamicCampaignKeywords(type, tempId, profile, countries, ui));
  }

  function handleTypeSelect(type: CampaignType) {
    setSelectedType(type);
    const tempId    = "preview-" + Date.now();
    const countries = targetCountries.length > 0 ? targetCountries : ["Singapore"];
    // Initial generation uses profile fallback; user refines via the inputs
    setStarterKws(buildDynamicCampaignKeywords(type, tempId, profile, countries));
    setName(CAMPAIGN_TYPE_LABELS[type] + " Campaign");
    const suggestions = CAMPAIGN_TYPE_AD_GROUP_SUGGESTIONS[type] ?? [];
    setAgDefs(suggestions.map((s) => ({ ...s, checked: true })));
    setStep(2);
  }

  function removeKw(id: number) {
    setStarterKws((prev) => prev.filter((k) => k.id !== id));
  }

  function toggleAg(i: number) {
    setAgDefs((prev) => prev.map((d, idx) => idx === i ? { ...d, checked: !d.checked } : d));
  }

  function handleConfirm() {
    if (!selectedType || !name.trim()) return;
    const selectedAgs = agDefs.filter((d) => d.checked).map(({ name: n, groupType }) => ({ name: n, groupType }));
    const ui = buildUserInputs();
    onConfirm(name.trim(), selectedType, starterKws, selectedAgs, {
      keywordBase:   ui.services?.join(", ")   || undefined,
      targetActions: ui.actions?.join(", ")    || undefined,
      competitors:   ui.competitors?.join(", ") || undefined,
    });
  }

  const stepLabels = ["Campaign type", "Keywords", "Ad groups"];
  const showActions     = selectedType === "high-intent";
  const showCompetitors = selectedType === "competitor";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Create Campaign</h2>
            {step > 1 && (
              <div className="flex items-center gap-1.5 mt-1">
                {stepLabels.map((label, i) => (
                  <span key={label} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-slate-300 text-xs">›</span>}
                    <span className={`text-xs ${i + 1 === step ? "text-brand-600 font-semibold" : i + 1 < step ? "text-slate-400 line-through" : "text-slate-300"}`}>
                      {label}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {step === 1 && <p className="text-xs text-slate-400 mt-0.5">Choose a campaign type to get started</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">

          {/* Step 1 — Type selection */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPAIGN_TYPES.map((type) => {
                const style = CAMPAIGN_TYPE_STYLES[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleTypeSelect(type)}
                    className="text-left p-4 rounded-xl border-2 border-slate-200 hover:border-brand-400 hover:bg-brand-50/30 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${style.badge}`}>
                        {CAMPAIGN_TYPE_LABELS[type]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{CAMPAIGN_TYPE_DESCRIPTIONS[type]}</p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2 — Name + starter keywords */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Campaign Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  autoFocus
                />
              </div>
              {/* Keyword generation inputs */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600">Keyword Generation</p>

                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">
                    Services / Keyword Base
                    <span className="text-slate-400 font-normal ml-1">(comma-separated — e.g. EOR, Headhunting, Payroll)</span>
                  </label>
                  <input
                    type="text"
                    value={keywordBase}
                    onChange={(e) => setKeywordBase(e.target.value)}
                    placeholder={profile.offer || profile.brand || "Your services…"}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>

                {showActions && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">
                      Target Actions
                      <span className="text-slate-400 font-normal ml-1">(e.g. hire, find, need, get)</span>
                    </label>
                    <input
                      type="text"
                      value={targetActions}
                      onChange={(e) => setTargetActions(e.target.value)}
                      placeholder="hire, find, need, get…"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                )}

                {showCompetitors && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">
                      Competitors
                      <span className="text-slate-400 font-normal ml-1">(comma-separated competitor names)</span>
                    </label>
                    <input
                      type="text"
                      value={competitors}
                      onChange={(e) => setCompetitors(e.target.value)}
                      placeholder="Competitor A, Competitor B…"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                )}

                <button
                  onClick={() => selectedType && regenerateKeywords(selectedType)}
                  disabled={!selectedType}
                  className="w-full px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  ↻ Regenerate Keywords
                </button>
              </div>

              {starterKws.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Starter Keywords{" "}
                    <span className="font-normal text-slate-400">({starterKws.length} recommended — remove any you don't need)</span>
                  </p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {starterKws.map((kw) => (
                      <div key={kw.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 group">
                        <span className="flex-1 text-sm text-slate-700 font-medium truncate">{kw.keyword}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">{kw.matchType}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">{kw.intent}</span>
                        <button onClick={() => removeKw(kw.id)}
                          className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove">
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">
                  {selectedType === "custom"
                    ? "Custom campaigns start empty — add keywords after creation."
                    : "All starter keywords removed. You can add keywords after creation."}
                </p>
              )}
            </div>
          )}

          {/* Step 3 — Ad groups */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Pre-selected ad groups are based on your campaign type. Uncheck any you don't need, or add more after creation.
              </p>
              {agDefs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  No suggested ad groups for Custom campaigns — you can add them from the campaign card.
                </p>
              ) : (
                <div className="space-y-2">
                  {agDefs.map((ag, i) => (
                    <label key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all ${
                      ag.checked ? "border-brand-300 bg-brand-50/40" : "border-slate-200 bg-white opacity-60"
                    }`}>
                      <input
                        type="checkbox"
                        checked={ag.checked}
                        onChange={() => toggleAg(i)}
                        className="w-4 h-4 rounded accent-brand-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{ag.name}</p>
                        <p className="text-xs text-slate-400">{AD_GROUP_TYPE_LABELS[ag.groupType]}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
          {step === 1 ? (
            <button onClick={onClose} className="ml-auto px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:text-slate-700 transition-colors">
              Cancel
            </button>
          ) : (
            <>
              <button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                ← Back
              </button>
              {step === 2 ? (
                <button
                  onClick={() => setStep(3)}
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
                >
                  Next: Ad Groups →
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
                >
                  Create Campaign
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Card ─────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  adGroups,
  campaignKws,
  isExpanded,
  onToggle,
  onEdit,
  isProjectSet,
  toggleOverride,
  deleteLibraryKw,
  startEdit,
  assignKeyword,
  onAdGroupsChange,
}: {
  campaign:         Campaign;
  adGroups:         AdGroup[];
  campaignKws:      EnrichedWorkspaceKeyword[];
  isExpanded:       boolean;
  onToggle:         () => void;
  onEdit:           () => void;
  isProjectSet:     boolean;
  toggleOverride:   (kw: EnrichedWorkspaceKeyword, field: "exclude" | "forceBuy" | "forceTest") => void;
  deleteLibraryKw:  (id: number) => void;
  startEdit:        (kw: EnrichedWorkspaceKeyword) => void;
  assignKeyword:    (id: number, campaignId: string | undefined, adGroupId: string | undefined) => void;
  onAdGroupsChange: (list: AdGroup[]) => void;
}) {
  const [expandedAgs,    setExpandedAgs]    = useState<Set<string>>(new Set());
  const [showAddAg,      setShowAddAg]      = useState(false);
  const [newAgName,      setNewAgName]      = useState("");
  const [newAgType,      setNewAgType]      = useState<AdGroupType>("custom");
  const [editingAgId,    setEditingAgId]    = useState<string | null>(null);
  const [editingAgName,  setEditingAgName]  = useState("");

  const style           = CAMPAIGN_TYPE_STYLES[campaign.campaignType ?? "custom"];
  const typeLabel       = campaign.campaignType ? CAMPAIGN_TYPE_LABELS[campaign.campaignType] : "Custom";
  const campaignAgs     = adGroups.filter((g) => g.campaignId === campaign.id);
  const isExcluded      = campaign.excludeFromForecast;
  const rollupTotal     = computeRollup(campaignKws);
  const adGroupOptions  = campaignAgs.map((g) => ({ id: g.id, name: g.name }));

  function toggleAg(id: string) {
    setExpandedAgs((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function handleCreateAg() {
    if (!newAgName.trim()) return;
    const ag = createAdGroup(campaign.id, newAgName.trim(), newAgType);
    const updated = [...adGroups, ag];
    onAdGroupsChange(updated);
    setNewAgName("");
    setShowAddAg(false);
    setExpandedAgs((prev) => { const s = new Set(prev); s.add(ag.id); return s; });
  }

  function handleRenameAg(id: string) {
    if (!editingAgName.trim()) return;
    updateAdGroup(id, { name: editingAgName.trim() });
    onAdGroupsChange(adGroups.map((g) => g.id === id ? { ...g, name: editingAgName.trim() } : g));
    setEditingAgId(null);
  }

  function handleDeleteAg(id: string) {
    deleteAdGroup(id);
    onAdGroupsChange(adGroups.filter((g) => g.id !== id));
  }

  const unassignedKws = campaignKws.filter((k) => !k.adGroupId);
  const unassignedKey = `__unassigned__${campaign.id}`;

  return (
    <div className={`bg-white rounded-xl border transition-all ${isExcluded ? "border-rose-200 opacity-70" : "border-slate-200"}`}>

      {/* Campaign header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 rounded-xl transition-colors"
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${isExcluded ? "line-through text-slate-400" : "text-slate-900"}`}>{campaign.name}</span>
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${style.badge}`}>{typeLabel}</span>
            {isExcluded && <span className="text-[11px] text-rose-500 font-medium">excluded</span>}
          </div>
          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <span className="text-xs text-slate-400">{campaignAgs.length} ad group{campaignAgs.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-slate-400">{campaignKws.length} kw</span>
            {rollupTotal.buyCount > 0 && <span className="text-xs text-slate-400">{rollupTotal.buyCount} Buy</span>}
            {rollupTotal.budget > 0 && <span className="text-xs text-slate-500 font-medium">${rollupTotal.budget.toLocaleString()}/mo</span>}
            {rollupTotal.convs > 0 && <span className="text-xs text-emerald-600 font-medium">{rollupTotal.convs} conv</span>}
            {rollupTotal.revenue > 0 && <span className="text-xs text-brand-600 font-medium">${rollupTotal.revenue.toLocaleString()} rev</span>}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          title="Campaign settings"
        >
          <Settings2 size={14} />
        </button>
        {isExpanded
          ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
          : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
      </button>

      {/* Expanded content: Ad Groups → Keywords */}
      {isExpanded && (
        <div className="border-t border-slate-100">

          {/* Ad group rows */}
          {campaignAgs.map((ag) => {
            const agKws    = campaignKws.filter((k) => k.adGroupId === ag.id);
            const agRollup = computeRollup(agKws);
            const agExpanded  = expandedAgs.has(ag.id);
            const isRenaming  = editingAgId === ag.id;

            return (
              <div key={ag.id} className="border-b border-slate-50 last:border-0">
                {/* Ad group header */}
                <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-50/70 hover:bg-slate-100/60 transition-colors group">
                  <button
                    onClick={() => toggleAg(ag.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                  >
                    <span className="text-slate-400 shrink-0">
                      {agExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    {isRenaming ? (
                      <input
                        value={editingAgName}
                        onChange={(e) => setEditingAgName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameAg(ag.id);
                          if (e.key === "Escape") setEditingAgId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold bg-white border border-brand-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400 min-w-[130px]"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-slate-600 truncate">{ag.name}</span>
                    )}
                    <span className="text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                      {AD_GROUP_TYPE_LABELS[ag.groupType]}
                    </span>
                  </button>

                  {/* Ad group rollup */}
                  <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0 hidden sm:flex">
                    <span>{agRollup.kwCount} kw</span>
                    {agRollup.budget > 0 && <span className="text-slate-600 font-medium">${agRollup.budget.toLocaleString()}</span>}
                    {agRollup.convs > 0  && <span className="text-emerald-600 font-semibold">{agRollup.convs} conv</span>}
                    {agRollup.cpa > 0    && <span>CPA ${agRollup.cpa.toLocaleString()}</span>}
                    {agRollup.revenue > 0 && <span className="text-brand-600 font-semibold">${agRollup.revenue.toLocaleString()}</span>}
                  </div>

                  {/* Rename / delete */}
                  {isRenaming ? (
                    <>
                      <button onClick={() => handleRenameAg(ag.id)} title="Save"
                        className="p-1 rounded text-emerald-500 hover:bg-emerald-50 transition-colors shrink-0">
                        <CheckCheck size={11} />
                      </button>
                      <button onClick={() => setEditingAgId(null)} title="Cancel"
                        className="p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors shrink-0">
                        <X size={11} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingAgId(ag.id); setEditingAgName(ag.name); }}
                        title="Rename ad group"
                        className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-white transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteAg(ag.id)}
                        title="Delete ad group"
                        className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                </div>

                {/* Keywords in ad group */}
                {agExpanded && (
                  agKws.length === 0
                    ? <p className="pl-10 py-3 text-xs text-slate-400 italic">No keywords in this ad group yet.</p>
                    : agKws.map((kw) => (
                        <CompactKeywordRow
                          key={kw.id} kw={kw} isProjectSet={isProjectSet} indent={2}
                          toggleOverride={toggleOverride} deleteLibraryKw={deleteLibraryKw} startEdit={startEdit}
                          adGroupOptions={adGroupOptions}
                          onAssignAdGroup={(id, agId) => assignKeyword(id, campaign.id, agId)}
                        />
                      ))
                )}
              </div>
            );
          })}

          {/* Unassigned keywords within campaign */}
          {(unassignedKws.length > 0 || campaignAgs.length === 0) && (
            <div className="border-b border-slate-50 last:border-0">
              <div
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => toggleAg(unassignedKey)}
              >
                <span className="text-slate-300 shrink-0">
                  {expandedAgs.has(unassignedKey) ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
                <span className="text-xs text-slate-400 italic flex-1">Unassigned</span>
                <span className="text-xs text-slate-400">{unassignedKws.length} kw</span>
              </div>
              {expandedAgs.has(unassignedKey) && (
                unassignedKws.length === 0
                  ? <p className="pl-10 py-3 text-xs text-slate-400 italic">All keywords are assigned to ad groups.</p>
                  : unassignedKws.map((kw) => (
                      <CompactKeywordRow
                        key={kw.id} kw={kw} isProjectSet={isProjectSet} indent={2}
                        toggleOverride={toggleOverride} deleteLibraryKw={deleteLibraryKw} startEdit={startEdit}
                        adGroupOptions={adGroupOptions}
                        onAssignAdGroup={(id, agId) => assignKeyword(id, campaign.id, agId)}
                      />
                    ))
              )}
            </div>
          )}

          {/* Empty campaign */}
          {campaignKws.length === 0 && campaignAgs.length === 0 && (
            <p className="px-5 py-4 text-sm text-slate-400 text-center">
              No keywords yet — add keywords and assign them to this campaign.
            </p>
          )}

          {/* Add ad group form */}
          {showAddAg ? (
            <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
              <input
                value={newAgName}
                onChange={(e) => setNewAgName(e.target.value)}
                placeholder="Ad group name…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateAg();
                  if (e.key === "Escape") setShowAddAg(false);
                }}
                autoFocus
                className="flex-1 text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <select
                value={newAgType}
                onChange={(e) => setNewAgType(e.target.value as AdGroupType)}
                className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 text-slate-600 bg-white focus:outline-none shrink-0"
              >
                {AD_GROUP_TYPES.map((t) => (
                  <option key={t} value={t}>{AD_GROUP_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <button onClick={handleCreateAg}
                className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors shrink-0">
                Add
              </button>
              <button onClick={() => setShowAddAg(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors shrink-0">
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddAg(true)}
                className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 font-semibold transition-colors"
              >
                <Plus size={12} /> Add Ad Group
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter option lists ──────────────────────────────────────────────────────

const ALL_INTENTS  = ["Informational", "Commercial", "Transactional", "Navigational"] as const;
const ALL_MATCH    = ["Broad", "Phrase", "Exact"] as const;
const ALL_ACTIONS  = ["Buy", "Test", "No"] as const;
const ALL_SOURCES  = ["System", "Custom", "Preset", "Generated", "Recommended", "Imported"] as const;
const ALL_CATEGORIES = Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }));

// ─── Competitor Intelligence helpers ─────────────────────────────────────────

function deriveCompetitivenessScore(kw: EnrichedWorkspaceKeyword): number {
  if (kw.competitorPressureScore > 0) return Math.round(kw.competitorPressureScore);
  let score = 0;
  score += kw.competition === "High" ? 40 : kw.competition === "Medium" ? 25 : 10;
  score += kw.suggestedCpc >= 10 ? 30 : kw.suggestedCpc >= 5 ? 20 : kw.suggestedCpc >= 2 ? 10 : 4;
  score += (kw.intent === "Transactional") ? 20
         : (kw.intent === "Commercial") ? 15
         : (kw.intent === "Navigational") ? 10
         : 5;
  return Math.min(score, 100);
}

const BUCKET_STRATEGIES: Record<string, string> = {
  brand:      "Defend with Exact match. Add sitelinks and structured snippets. Keep bids efficient — protect without overpaying.",
  generic:    "Phrase + Exact match with benefit-led landing pages. Lead with your strongest differentiator.",
  highIntent: "Bid aggressively. Use direct CTA copy (Get Quote, Start Today). Maximise Quality Score on conversion pages.",
  competitor: "Comparison landing page. Focus ad copy on your advantages, not their brand name. Use RLSA to recapture defectors.",
  pricing:    "Be transparent. Use a free quote or consultation CTA. Target buyers who compare on cost.",
  local:      "Location-specific landing pages. Include city or region in ad copy. Enable location extensions.",
};

const PRESSURE_BADGE_CLS: Record<string, string> = {
  High:   "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low:    "bg-emerald-100 text-emerald-700",
};

// Confidence badge colours
const CONFIDENCE_CLS: Record<"High" | "Medium" | "Low", string> = {
  High:   "bg-red-50 text-red-600 border border-red-200",
  Medium: "bg-amber-50 text-amber-600 border border-amber-200",
  Low:    "bg-slate-100 text-slate-400 border border-slate-200",
};

interface CompetitorData {
  names:      string[];       // competitor names to render as pills
  overflow:   number;         // count hidden by "+N more"
  confidence: "High" | "Medium" | "Low";
  brandNote:  string | null;  // extra note for brand keywords
}

function buildCompetitorData(
  kw:        EnrichedWorkspaceKeyword,
  userComps: string[],
  bucketId:  string,
): CompetitorData {
  const pressureScore = kw.competitorPressureScore ?? 50;
  // More competitors shown when pressure is higher — more crowded auction
  const maxShown = pressureScore >= 70 ? 4 : pressureScore >= 40 ? 3 : 2;

  const fromKw = kw.competitorExamples.filter(Boolean);

  if (bucketId === "competitor") {
    // Try to detect competitor name inside the keyword text itself
    const kwLower   = kw.keyword.toLowerCase();
    const detected  = userComps.filter((c) => kwLower.includes(c.toLowerCase()));
    const pool      = Array.from(new Set([...detected, ...fromKw, ...userComps]));
    const shown     = pool.slice(0, maxShown);
    return {
      names:      shown,
      overflow:   Math.max(0, pool.length - maxShown),
      confidence: detected.length > 0 || fromKw.length > 0 ? "High" : userComps.length > 0 ? "Medium" : "Low",
      brandNote:  null,
    };
  }

  if (bucketId === "brand") {
    const pool  = Array.from(new Set([...fromKw, ...userComps])).filter(Boolean);
    const shown = pool.slice(0, 2);
    if (pool.length === 0) {
      return { names: [], overflow: 0, confidence: "Low", brandNote: "Low external competition — brand-protected" };
    }
    return {
      names:      shown,
      overflow:   Math.max(0, pool.length - 2),
      confidence: "Medium",
      brandNote:  "may bid on brand",
    };
  }

  // Generic / High Intent / Pricing / Local
  const pool  = Array.from(new Set([...fromKw, ...userComps])).filter(Boolean);
  const shown = pool.slice(0, maxShown);
  return {
    names:      shown,
    overflow:   Math.max(0, pool.length - maxShown),
    confidence: fromKw.length > 0 ? "High" : userComps.length > 0 ? "Medium" : "Low",
    brandNote:  null,
  };
}

// ─── CompetitorIntelligencePanel ─────────────────────────────────────────────

function CompetitorIntelligencePanel({
  allKws, buckets, userCompetitors,
}: {
  allKws:          EnrichedWorkspaceKeyword[];
  buckets:         BucketDef[];
  userCompetitors: string[];
}) {
  const lib = allKws.filter((k) => k.isLibrary);
  if (lib.length === 0) return null;

  const highPressureCount = lib.filter((k) => k.competitorPressure === "High").length;
  const avgScore = Math.round(lib.reduce((s, k) => s + deriveCompetitivenessScore(k), 0) / lib.length);

  let mostContestedLabel = "—";
  let maxAvg = 0;
  for (const bucket of buckets) {
    const bKws = lib.filter((k) => (bucket.categories as string[]).includes(k.category));
    if (bKws.length === 0) continue;
    const avg = bKws.reduce((s, k) => s + deriveCompetitivenessScore(k), 0) / bKws.length;
    if (avg > maxAvg) { maxAvg = avg; mostContestedLabel = bucket.label; }
  }

  const compSet = new Set<string>();
  lib.forEach((k) => k.competitorExamples.forEach((c) => c && compSet.add(c)));
  userCompetitors.forEach((c) => c && compSet.add(c));
  const competitors = Array.from(compSet).slice(0, 8);

  const scoreColor = avgScore >= 70 ? "text-red-600" : avgScore >= 40 ? "text-amber-600" : "text-emerald-600";
  const highColor  = highPressureCount > 0 ? "text-red-600" : "text-slate-500";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={13} className="text-slate-400 shrink-0" />
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Competitor Intelligence</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">High Pressure</p>
          <p className={`text-2xl font-bold tabular-nums ${highColor}`}>{highPressureCount}</p>
          <p className="text-[10px] text-slate-400">of {lib.length} keywords</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg Competitiveness</p>
          <p className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{avgScore}</p>
          <p className="text-[10px] text-slate-400">/ 100</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Most Contested</p>
          <p className="text-sm font-bold text-slate-800 mt-1">{mostContestedLabel}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Competitors Detected</p>
          {competitors.length > 0 ? (
            <p className="text-xs text-slate-700 leading-relaxed mt-1">{competitors.join(" · ")}</p>
          ) : (
            <p className="text-xs text-slate-400 italic mt-1">Add competitors above to estimate</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BucketSection component ──────────────────────────────────────────────────

function BucketSection({
  bucket, keywords, defaultCountry, userCompetitors,
  onToggleExclude, onSelectAll, onDelete, onEditKeyword, onAddKeyword, onBulkAdd,
}: {
  bucket:          BucketDef;
  keywords:        EnrichedWorkspaceKeyword[];
  defaultCountry:  string;
  userCompetitors: string[];
  onToggleExclude: (id: number) => void;
  onSelectAll:     (ids: number[], include: boolean) => void;
  onDelete:        (id: number) => void;
  onEditKeyword:   (id: number, text: string) => void;
  onAddKeyword:    (text: string, country: string) => void;
  onBulkAdd:       (texts: string[], country: string) => void;
}) {
  const [showAdd,     setShowAdd]     = useState(false);
  const [addText,     setAddText]     = useState("");
  const [addCountry,  setAddCountry]  = useState(defaultCountry || LIBRARY_COUNTRIES[0]);
  const [showBulk,    setShowBulk]    = useState(false);
  const [bulkText,    setBulkText]    = useState("");
  const [bulkCountry, setBulkCountry] = useState(defaultCountry || LIBRARY_COUNTRIES[0]);
  const [editId,      setEditId]      = useState<number | null>(null);
  const [editText,    setEditText]    = useState("");

  const bucketStrategy = BUCKET_STRATEGIES[bucket.id] ?? "Use targeted ad copy and a highly relevant landing page.";

  const activeKws    = keywords.filter((k) => !k.exclude);
  const headerCls    = BUCKET_HEADER_CLS[bucket.color];
  const badgeCls     = BUCKET_BADGE_CLS[bucket.color];
  const dotCls       = BUCKET_DOT_CLS[bucket.color];
  const inCls        = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400";

  // Bucket totals (selected keywords only)
  const totalBudget  = activeKws.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
  const totalClicks  = activeKws.reduce((s, k) => s + k.estimatedClicks, 0);
  const totalLeads   = activeKws.reduce((s, k) => s + k.estimatedLeads, 0);
  const totalSearch  = activeKws.reduce((s, k) => s + k.monthlySearches, 0);
  const avgCpa       = totalLeads > 0 ? Math.round(totalBudget / totalLeads) : 0;

  function handleAdd() {
    if (!addText.trim()) return;
    onAddKeyword(addText.trim(), addCountry);
    setAddText(""); setShowAdd(false);
  }

  function handleBulkAdd() {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    onBulkAdd(lines, bulkCountry);
    setBulkText(""); setShowBulk(false);
  }

  function startEdit(kw: EnrichedWorkspaceKeyword) {
    setEditId(kw.id); setEditText(kw.keyword);
  }

  function saveEdit() {
    if (editId != null && editText.trim()) onEditKeyword(editId, editText.trim());
    setEditId(null);
  }

  const allSelected  = keywords.length > 0 && keywords.every((k) => !k.exclude);
  const noneSelected = keywords.every((k) => k.exclude);
  const kwIds        = keywords.map((k) => k.id);

  const thCls = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap";
  const thRCls = `${thCls} text-right`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

      {/* ── Bucket header ───────────────────────────────────────────────────── */}
      <div className={`px-4 py-3 border-b ${headerCls}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
            <span className="font-bold text-sm text-slate-800 shrink-0">{bucket.label}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeCls}`}>
              {activeKws.length} / {keywords.length}
            </span>
            <span className="text-xs text-slate-500 hidden md:inline truncate">{bucket.description}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {keywords.length > 0 && (
              <button
                onClick={() => onSelectAll(kwIds, noneSelected)}
                className="text-xs font-semibold text-slate-400 hover:text-brand-600 transition-colors whitespace-nowrap"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            )}
            <button onClick={() => { setShowAdd(!showAdd); setShowBulk(false); }}
              className="text-xs font-semibold text-slate-500 hover:text-brand-600 transition-colors">
              + Add
            </button>
            <button onClick={() => { setShowBulk(!showBulk); setShowAdd(false); }}
              className="text-xs font-semibold text-slate-500 hover:text-brand-600 transition-colors">
              Bulk paste
            </button>
          </div>
        </div>
      </div>

      {/* ── Keyword table ────────────────────────────────────────────────────── */}
      {keywords.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[680px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className={thCls}>Keyword</th>
                <th className={thCls + " hidden sm:table-cell"}>Country</th>
                <th className={thCls + " hidden md:table-cell"}>Match</th>
                <th className={thRCls + " hidden md:table-cell"}>Searches</th>
                <th className={thRCls}>CPC</th>
                <th className={thRCls}>Budget</th>
                <th className={thRCls + " hidden lg:table-cell"}>Clicks</th>
                <th className={thRCls + " hidden lg:table-cell"}>Leads</th>
                <th className={thRCls + " hidden lg:table-cell"}>CPA</th>
                <th className={thCls + " text-center"}>Action</th>
                <th className="px-3 py-2 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {keywords.map((kw) => (
                <Fragment key={kw.id}>
                <tr className={`group hover:bg-slate-50/70 transition-colors ${kw.exclude ? "opacity-40" : ""}`}>

                  {/* Checkbox */}
                  <td className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={!kw.exclude}
                      onChange={() => onToggleExclude(kw.id)}
                      className="w-3.5 h-3.5 rounded accent-brand-500 cursor-pointer"
                    />
                  </td>

                  {/* Keyword (editable) */}
                  <td className="px-3 py-2.5 max-w-[220px]">
                    {editId === kw.id ? (
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }}
                        onBlur={saveEdit}
                        autoFocus
                        className="w-full rounded border border-brand-300 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                    ) : (
                      <span className={`font-medium text-xs leading-tight ${kw.exclude ? "line-through text-slate-400" : "text-slate-800"}`}>
                        {kw.keyword}
                      </span>
                    )}
                  </td>

                  {/* Country */}
                  <td className="px-3 py-2.5 hidden sm:table-cell whitespace-nowrap text-slate-500">
                    {kw.country}
                  </td>

                  {/* Match type */}
                  <td className="px-3 py-2.5 hidden md:table-cell whitespace-nowrap">
                    <EffMatchBadge matchType={kw.effectiveMatchType} inherited={kw.matchTypeInherited} />
                  </td>

                  {/* Monthly searches */}
                  <td className="px-3 py-2.5 hidden md:table-cell text-right tabular-nums text-slate-500">
                    {kw.monthlySearches > 0 ? kw.monthlySearches.toLocaleString() : "—"}
                  </td>

                  {/* CPC */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">
                    ${kw.suggestedCpc.toFixed(2)}
                  </td>

                  {/* Budget */}
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap">
                    {kw.suggestedMonthlyBudget > 0
                      ? <span className="text-slate-800">${kw.suggestedMonthlyBudget.toLocaleString()}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>

                  {/* Clicks */}
                  <td className="px-3 py-2.5 hidden lg:table-cell text-right tabular-nums text-slate-600">
                    {kw.estimatedClicks > 0 ? kw.estimatedClicks.toLocaleString() : <span className="text-slate-300">—</span>}
                  </td>

                  {/* Leads */}
                  <td className="px-3 py-2.5 hidden lg:table-cell text-right tabular-nums">
                    {kw.estimatedLeads > 0
                      ? <span className="font-bold text-emerald-600">{kw.estimatedLeads}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>

                  {/* CPA */}
                  <td className="px-3 py-2.5 hidden lg:table-cell text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {kw.estimatedCpl > 0 ? `$${kw.estimatedCpl.toLocaleString()}` : <span className="text-slate-300">—</span>}
                  </td>

                  {/* Action badge */}
                  <td className="px-3 py-2.5 text-center">
                    <ActionBadge action={kw.effectiveAction} />
                  </td>

                  {/* Edit / delete */}
                  <td className="px-3 py-2.5 w-14">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(kw)} title="Edit"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <Pencil size={11} />
                      </button>
                      {kw.isLibrary && (
                        <button onClick={() => onDelete(kw.id)} title="Delete"
                          className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* ── Competitor intel strip — always visible ────────── */}
                {(() => {
                  const score       = deriveCompetitivenessScore(kw);
                  const compData    = buildCompetitorData(kw, userCompetitors, bucket.id);
                  const scoreBar    = score >= 70 ? "bg-red-500"     : score >= 40 ? "bg-amber-400"   : "bg-emerald-500";
                  const scoreText   = score >= 70 ? "text-red-600"   : score >= 40 ? "text-amber-600" : "text-emerald-600";
                  const pressureCls = PRESSURE_BADGE_CLS[kw.competitorPressure] ?? "bg-slate-100 text-slate-600";

                  return (
                    <tr className={`border-b border-slate-100 bg-slate-50/40 ${kw.exclude ? "opacity-40" : ""}`}>
                      <td className="w-8" />
                      <td colSpan={11} className="px-3 pb-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-2 text-[11px]">

                          {/* Competitiveness Score */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 w-12">Score</span>
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${scoreBar}`} style={{ width: `${score}%` }} />
                            </div>
                            <span className={`font-bold tabular-nums shrink-0 ${scoreText}`}>{score}/100</span>
                          </div>

                          {/* Competitor Pressure */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 w-12">Pressure</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pressureCls}`}>
                              {kw.competitorPressure}
                            </span>
                          </div>

                          {/* Likely Competitors Bidding — pills + confidence */}
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 font-medium shrink-0">Likely Bidding</span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_CLS[compData.confidence]}`}
                                title={
                                  compData.confidence === "High"
                                    ? "High confidence — sourced from keyword data"
                                    : compData.confidence === "Medium"
                                    ? "Medium confidence — based on your competitor inputs"
                                    : "Low confidence — no competitor data available"
                                }
                              >
                                {compData.confidence}
                              </span>
                            </div>
                            <div
                              className="flex flex-wrap gap-1"
                              title="Likely competitors bidding on this keyword — estimate only, not actual ad data"
                            >
                              {compData.names.map((name) => (
                                <span
                                  key={name}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full bg-white text-slate-700 text-[10px] font-medium border border-slate-200 shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                              {compData.overflow > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 text-[10px] border border-slate-200">
                                  +{compData.overflow} more
                                </span>
                              )}
                              {compData.brandNote && compData.names.length > 0 && (
                                <span className="text-[10px] text-slate-400 italic self-center">· {compData.brandNote}</span>
                              )}
                              {compData.names.length === 0 && compData.brandNote && (
                                <span className="text-[10px] text-slate-400 italic">{compData.brandNote}</span>
                              )}
                              {compData.names.length === 0 && !compData.brandNote && (
                                <span className="text-[10px] text-slate-400 italic">Add competitors to estimate</span>
                              )}
                            </div>
                          </div>

                          {/* Strategy to Win */}
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 w-12">Win</span>
                            <span className="text-slate-500 italic truncate" title={bucketStrategy}>
                              {bucketStrategy.length > 55 ? bucketStrategy.slice(0, 55) + "…" : bucketStrategy}
                            </span>
                          </div>

                          {/* Forecast Debug */}
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Forecast Debug</span>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
                              <span className="text-slate-500">
                                <span className="text-slate-400">Imp </span>
                                <span className="font-medium">{kw.estimatedImpressions?.toLocaleString() ?? "—"}</span>
                              </span>
                              <span className="text-slate-500">
                                <span className="text-slate-400">CTR </span>
                                <span className="font-medium">{kw.estimatedCtr != null ? `${(kw.estimatedCtr * 100).toFixed(1)}%` : "—"}</span>
                              </span>
                              <span className="text-slate-500">
                                <span className="text-slate-400">Clicks </span>
                                <span className="font-medium">{kw.estimatedClicks > 0 ? kw.estimatedClicks.toLocaleString() : "0"}</span>
                              </span>
                              <span className="text-slate-500">
                                <span className="text-slate-400">CVR </span>
                                <span className="font-medium text-indigo-600">{kw.estimatedCvr != null ? `${(kw.estimatedCvr * 100).toFixed(1)}%` : "—"}</span>
                              </span>
                              <span className={kw.estimatedLeads > 0 ? "text-emerald-600 font-semibold" : "text-slate-400"}>
                                <span className="font-normal">{kw.estimatedLeads > 0 ? "" : ""}</span>
                                {kw.estimatedLeads > 0 ? `${kw.estimatedLeads} leads` : "0 leads"}
                              </span>
                            </div>
                          </div>

                        </div>
                      </td>
                    </tr>
                  );
                })()}
              </Fragment>
            ))}

            </tbody>

            {/* ── Bucket totals footer ─────────────────────────────────────── */}
            {activeKws.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {activeKws.length} selected
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="hidden md:table-cell px-3 py-2 text-right text-[10px] font-bold text-slate-500 tabular-nums">
                    {totalSearch > 0 ? totalSearch.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] text-slate-400">—</td>
                  <td className="px-3 py-2 text-right text-[10px] font-bold text-slate-800 tabular-nums whitespace-nowrap">
                    {totalBudget > 0 ? `$${totalBudget.toLocaleString()}` : "—"}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-2 text-right text-[10px] font-bold text-slate-700 tabular-nums">
                    {totalClicks > 0 ? totalClicks.toLocaleString() : "—"}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-2 text-right text-[10px] font-bold text-emerald-600 tabular-nums">
                    {totalLeads > 0 ? totalLeads : "—"}
                  </td>
                  <td className="hidden lg:table-cell px-3 py-2 text-right text-[10px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
                    {avgCpa > 0 ? `$${avgCpa.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-center text-sm text-slate-400">
          No keywords in this bucket yet.{" "}
          <button onClick={() => setShowAdd(true)} className="text-brand-500 font-semibold hover:underline">Add one</button>
          {" "}or use{" "}
          <button onClick={() => setShowBulk(true)} className="text-brand-500 font-semibold hover:underline">Bulk Paste</button>.
        </div>
      )}

      {/* ── Inline add form ──────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-2">
          <input
            type="text" value={addText} onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
            placeholder="Type a keyword…" autoFocus className={`${inCls} flex-1 min-w-0`}
          />
          <select value={addCountry} onChange={(e) => setAddCountry(e.target.value)} className={`${inCls} shrink-0`}>
            {LIBRARY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={handleAdd} disabled={!addText.trim()}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0">
            Add
          </button>
          <button onClick={() => { setShowAdd(false); setAddText(""); }}
            className="px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors shrink-0">
            Cancel
          </button>
        </div>
      )}

      {/* ── Bulk paste ───────────────────────────────────────────────────────── */}
      {showBulk && (
        <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/60 space-y-3">
          <div className="flex gap-3">
            <textarea
              value={bulkText} onChange={(e) => setBulkText(e.target.value)}
              rows={4} placeholder={"keyword one\nkeyword two\nkeyword three"}
              className={`${inCls} flex-1 resize-none font-mono text-xs`}
            />
            <div className="flex flex-col gap-2 shrink-0">
              <select value={bulkCountry} onChange={(e) => setBulkCountry(e.target.value)} className={inCls}>
                {LIBRARY_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={handleBulkAdd} disabled={!bulkText.trim()}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors">
                Add {bulkText.split("\n").filter((l) => l.trim()).length} Keywords
              </button>
              <button onClick={() => { setShowBulk(false); setBulkText(""); }}
                className="px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 text-center transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KeywordsPage() {
  const { activeProject, activeScenario, calibratedCvr } = useAppContext();
  const scenario     = activeScenario;
  const isProjectSet = activeProject !== null;

  const assumptions: ProjectAssumptions = useMemo(
    () => activeProject ? projectToAssumptions(activeProject) : PROJECT_DEFAULTS,
    [activeProject],
  );

  const [fa, setFa] = useState<ForecastAssumptions>(DEFAULT_FORECAST_ASSUMPTIONS);

  // ── Keyword library state ──────────────────────────────────────────────────
  const [libraryKws,   setLibraryKws]   = useState<LibraryKeyword[]>([]);
  const [sysOverrides, setSysOverrides] = useState<SystemOverride[]>([]);
  const [activePanel,   setActivePanel]   = useState<null | "custom" | "bulk" | "presets" | "generator" | "campaigns" | "negatives">(null);
  const [editingKwId,   setEditingKwId]   = useState<number | null>(null);
  const [campaigns,     setCampaigns]     = useState<Campaign[]>([]);
  const [adGroups,      setAdGroups]      = useState<AdGroup[]>([]);
  const [view,          setView]          = useState<"flat" | "campaign" | "adgroup">("flat");
  const [negativeKws,   setNegativeKws]   = useState<NegativeKeyword[]>([]);
  const [pendingNegText, setPendingNegText] = useState<string | undefined>(undefined);
  const [mainTab,       setMainTab]       = useState<"campaigns" | "keywords" | "negatives">("campaigns");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLibraryKws(getLibraryKeywords());
    setSysOverrides(getSystemOverrides());
    setCampaigns(getCampaigns());
    setAdGroups(getAdGroups());
    setNegativeKws(getNegativeKeywords());
  }, []);

  useEffect(() => {
    const projectId = activeProject?.id ?? "default";
    setFa(getForecastAssumptions(projectId, activeProject
      ? { lpConversionRate: activeProject.lpConversionRate, closeRate: activeProject.closeRate, avgDealSize: activeProject.avgDealSize }
      : undefined
    ));
  }, [activeProject]);

  // Pre-fill simplified inputs from project (only on first load / project change, never overwrite user edits)
  useEffect(() => {
    if (activeProject) {
      setServiceInput((prev) => prev || activeProject.serviceType || "");
      setBrandInput((prev)   => prev || activeProject.projectName || "");
    }
  }, [activeProject?.id]);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [search,          setSearch]          = useState("");
  const [filterCountry,   setFilterCountry]   = useState("");
  const [filterIntent,    setFilterIntent]     = useState("");
  const [filterMatchType, setFilterMatchType] = useState("");
  const [filterAction,    setFilterAction]    = useState("");
  const [filterSource,    setFilterSource]    = useState("");
  const [filterCategory,   setFilterCategory]   = useState("");
  const [showAllCountries,  setShowAllCountries]  = useState(false);
  const [starterGenerated,  setStarterGenerated]  = useState(false);

  // ── Simplified input state ─────────────────────────────────────────────────
  const [serviceInput,  setServiceInput]  = useState("");
  const [brandInput,    setBrandInput]    = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [showAdvanced,  setShowAdvanced]  = useState(false);

  // ── Effective assumptions (with scenario applied) ──────────────────────────
  const effectiveAssumptions = useMemo(
    () => scenario ? applyScenario(assumptions, scenario) : assumptions,
    [assumptions, scenario]
  );

  // ── Project context for relevance scoring ──────────────────────────────────
  const projectContext = useMemo<ProjectContext>(() => ({
    industry:       activeProject?.industry       ?? "",
    businessType:   activeProject?.businessType   ?? "",
    offerType:      activeProject?.offerType      ?? "",
    targetAudience: activeProject?.targetAudience ?? "",
    geoFocus:       activeProject?.geoFocus       ?? "",
  }), [activeProject]);

  // ── Profile for dynamic campaign keyword generation ─────────────────────────
  const campaignProfile = useMemo<ProjectProfile>(() => ({
    brand: brandInput.trim() || activeProject?.projectName || "",
    offer: serviceInput.trim() || activeProject?.serviceType || "",
  }), [brandInput, serviceInput, activeProject]);

  // System keywords in scope = KEYWORD_COUNTRIES ∩ targetCountries
  const inScopeCountries = useMemo(
    () => effectiveAssumptions.targetCountries.filter(
      (c) => (KEYWORD_COUNTRIES as readonly string[]).includes(c)
    ),
    [effectiveAssumptions.targetCountries]
  );

  // ── useMemo chain ──────────────────────────────────────────────────────────

  // 1. System keywords with CPC multiplier
  const scenarioKws = useMemo(() => {
    const mult = scenario?.cpcMultiplier ?? 1.0;
    return KEYWORDS.map((k) => ({ ...k, suggestedCpc: k.suggestedCpc * mult }));
  }, [scenario]);

  // 2. Full workspace = system + library, overrides applied
  const workspaceKws = useMemo(
    () => buildWorkspaceKeywords(scenarioKws, sysOverrides, libraryKws, scenario?.cpcMultiplier ?? 1.0, campaigns, adGroups),
    [scenarioKws, sysOverrides, libraryKws, scenario, campaigns, adGroups]
  );

  // 2b. Country-filtered workspace keywords (drives all display, KPIs, rollups)
  const activeCountries = effectiveAssumptions.targetCountries;
  const countryFilteredKws = useMemo(() => {
    if (showAllCountries || activeCountries.length === 0) return workspaceKws;
    const activeSet = new Set(activeCountries);
    return workspaceKws.filter((kw) =>
      kw.source === "system"
        ? inScopeCountries.includes(kw.country)
        : activeSet.has(kw.country)
    );
  }, [workspaceKws, activeCountries, inScopeCountries, showAllCountries]);

  const hiddenKwCount = useMemo(() => {
    if (showAllCountries || activeCountries.length === 0) return 0;
    const activeSet = new Set(activeCountries);
    return libraryKws.filter((k) => !activeSet.has(k.country)).length;
  }, [libraryKws, activeCountries, showAllCountries]);

  // 3. Forecast-ready: non-excluded, in-scope, effectiveAction applied
  const forecastReadyKws = useMemo(() => {
    const excludedCampaignIds = new Set(campaigns.filter((c) => c.excludeFromForecast).map((c) => c.id));
    const excludedAdGroupIds  = new Set(adGroups.filter((g) => g.excludeFromForecast).map((g) => g.id));
    return countryFilteredKws
      .filter((kw) => {
        if (kw.effectiveAction === "No") return false;
        if (kw.campaignId && excludedCampaignIds.has(kw.campaignId)) return false;
        if (kw.adGroupId  && excludedAdGroupIds.has(kw.adGroupId))   return false;
        if (isKeywordSuppressed(kw.keyword, kw.campaignId, kw.adGroupId, negativeKws)) return false;
        return true;
      })
      .map((kw) => ({ ...kw, action: kw.effectiveAction })) as unknown as Keyword[];
  }, [countryFilteredKws, campaigns, adGroups, negativeKws]);

  // 4a. kwId → campaignId lookup (built from countryFilteredKws before the Keyword cast)
  const kwCampaignMap = useMemo(() => {
    const map = new Map<number, string | undefined>();
    for (const kw of countryFilteredKws) map.set(kw.id, kw.campaignId);
    return map;
  }, [countryFilteredKws]);

  // 4b. Budget allocation (group-aware when manual campaign budgets exist)
  const budgetMap = useMemo(
    () => groupedBudgetAllocate(forecastReadyKws, kwCampaignMap, campaigns, effectiveAssumptions.monthlyBudget, calibratedCvr ?? undefined),
    [forecastReadyKws, kwCampaignMap, campaigns, effectiveAssumptions.monthlyBudget, calibratedCvr]
  );

  // 5. Enriched forecast data
  const enrichedForecast = useMemo(
    () => enrich(forecastReadyKws, budgetMap, effectiveAssumptions, {
      matchMods:               buildMatchTypeModifiers(fa),
      brandCvrUplift:          fa.brandCvrUplift,
      competitorCvrDiscount:   fa.competitorCvrDiscount,
      cpcMultiplier:           fa.cpcMultiplier,
      calibratedCvrByCategory: calibratedCvr ?? undefined,
    }),
    [forecastReadyKws, budgetMap, effectiveAssumptions, fa, calibratedCvr]
  );

  // 6. Merge forecast + relevance back onto country-filtered workspace keywords
  const enrichedAll = useMemo<EnrichedWorkspaceKeyword[]>(() => {
    const forecastMap = new Map<number, EnrichedKeyword>(enrichedForecast.map((k) => [k.id, k]));
    return countryFilteredKws.map((kw) => {
      const e         = forecastMap.get(kw.id);
      const relevance = computeBusinessRelevance(kw.category, kw.intent, kw.competition, projectContext);
      return {
        ...kw,
        businessRelevanceScore: relevance,
        suggestedMonthlyBudget: e?.suggestedMonthlyBudget ?? 0,
        estimatedClicks:        e?.estimatedClicks        ?? 0,
        estimatedLeads:         e?.estimatedLeads         ?? 0,
        estimatedCpl:           e?.estimatedCpl           ?? 0,
        revenuePotential:       e?.revenuePotential       ?? 0,
        roas:                   e?.roas                   ?? 0,
        estimatedImpressions:   e?.estimatedImpressions,
        estimatedCtr:           e?.estimatedCtr,
        estimatedCvr:           e?.estimatedCvr,
      };
    });
  }, [countryFilteredKws, enrichedForecast, projectContext]);

  // 7. UI filters
  const filtered = useMemo(() => {
    return enrichedAll.filter((kw) => {
      if (filterCountry  && kw.country         !== filterCountry)                          return false;
      if (filterIntent   && kw.intent          !== filterIntent)                           return false;
      if (filterMatchType && kw.matchType      !== filterMatchType)                        return false;
      if (filterAction   && kw.effectiveAction !== filterAction)                           return false;
      if (filterSource   && kw.source          !== filterSource.toLowerCase())             return false;
      if (filterCategory && kw.category        !== filterCategory)                         return false;
      if (search         && !kw.keyword.toLowerCase().includes(search.toLowerCase()))      return false;
      return true;
    });
  }, [enrichedAll, filterCountry, filterIntent, filterMatchType, filterAction, filterSource, filterCategory, search]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const buyKws        = useMemo(() => enrichedAll.filter((k) => k.effectiveAction === "Buy"), [enrichedAll]);
  const totalBuyCount = buyKws.length;
  const totalBudget   = buyKws.reduce((s, k) => s + k.suggestedMonthlyBudget, 0);
  const totalLeads    = buyKws.reduce((s, k) => s + k.estimatedLeads, 0);
  const totalRevenue  = buyKws.reduce((s, k) => s + k.revenuePotential, 0);
  const avgCpl        = totalLeads > 0 ? Math.round(totalBudget / totalLeads) : 0;

  // ── Planning warnings ──────────────────────────────────────────────────────
  const planningWarnings = useMemo(
    () => isProjectSet
      ? buildPlanningWarnings(
          effectiveAssumptions,
          enrichedAll.filter((k) => k.effectiveAction !== "No") as unknown as EnrichedKeyword[],
          inScopeCountries,
        )
      : [],
    [effectiveAssumptions, enrichedAll, inScopeCountries, isProjectSet]
  );

  // ── Match type warnings ────────────────────────────────────────────────────
  const matchTypeWarnings = useMemo<PlanningWarning[]>(() => {
    const activeKws = enrichedAll.filter((k) => k.effectiveAction !== "No");
    if (activeKws.length === 0) return [];
    const warnings: PlanningWarning[] = [];

    // 1. Brand terms not on Exact
    const brandNotExact = activeKws.filter(
      (k) => k.category === "brand" && k.effectiveMatchType !== "Exact"
    );
    if (brandNotExact.length > 0) {
      warnings.push({
        id:      "mt-brand-not-exact",
        level:   "warn",
        title:   `${brandNotExact.length} brand keyword${brandNotExact.length !== 1 ? "s" : ""} not on Exact match`,
        message: "Brand terms on Broad or Phrase match risk appearing on competitor searches and waste budget. Use Exact match for brand defence.",
      });
    }

    // 2. Competitor terms on Broad
    const compOnBroad = activeKws.filter(
      (k) => k.category === "competitor" && k.effectiveMatchType === "Broad"
    );
    if (compOnBroad.length > 0) {
      warnings.push({
        id:      "mt-competitor-broad",
        level:   "warn",
        title:   `${compOnBroad.length} competitor keyword${compOnBroad.length !== 1 ? "s" : ""} on Broad match`,
        message: "Competitor keywords on Broad match frequently trigger on unrelated queries, inflating CPA. Phrase or Exact match is safer.",
      });
    }

    // 3. Broad-heavy Buy keyword mix (>40%)
    const buyKwsMt    = activeKws.filter((k) => k.effectiveAction === "Buy");
    const broadBuyKws = buyKwsMt.filter((k) => k.effectiveMatchType === "Broad");
    if (buyKwsMt.length > 0 && broadBuyKws.length / buyKwsMt.length > 0.4) {
      warnings.push({
        id:      "mt-broad-heavy",
        level:   "info",
        title:   `${Math.round((broadBuyKws.length / buyKwsMt.length) * 100)}% of Buy keywords on Broad match`,
        message: `${broadBuyKws.length} of ${buyKwsMt.length} Buy keywords use Broad match. Broad match lowers intent precision and can raise CPA (${fa.broadCvrFactor * 100}% CVR vs Phrase baseline). Consider shifting high-value keywords to Phrase or Exact.`,
      });
    }

    return warnings;
  }, [enrichedAll, fa.broadCvrFactor]);

  // ── Suppressed keywords (active but blocked by negatives) ─────────────────
  const suppressedKws = useMemo(
    () => workspaceKws.filter(
      (kw) => kw.effectiveAction !== "No" &&
        isKeywordSuppressed(kw.keyword, kw.campaignId, kw.adGroupId, negativeKws)
    ),
    [workspaceKws, negativeKws]
  );

  // ── Negative keyword warnings ──────────────────────────────────────────────
  const negativeWarnings = useMemo<PlanningWarning[]>(() => {
    if (negativeKws.length === 0) return [];
    const warnings: PlanningWarning[] = [];
    if (suppressedKws.length > 0) {
      warnings.push({
        id:      "neg-suppressed",
        level:   "info",
        title:   `${suppressedKws.length} keyword${suppressedKws.length !== 1 ? "s" : ""} suppressed by negatives`,
        message: `These keywords match your negative keyword rules and are excluded from forecast totals. Review the Negatives panel to check for over-blocking.`,
      });
      const buyKwsTotal = workspaceKws.filter((k) => k.effectiveAction === "Buy").length;
      const suppressedBuy = suppressedKws.filter((k) => k.effectiveAction === "Buy").length;
      if (buyKwsTotal > 0 && suppressedBuy / buyKwsTotal > 0.2) {
        warnings.push({
          id:      "neg-overblocking",
          level:   "warn",
          title:   "Possible over-blocking detected",
          message: `${suppressedBuy} of your ${buyKwsTotal} Buy keywords (${Math.round((suppressedBuy / buyKwsTotal) * 100)}%) are suppressed by negatives. This may significantly reduce forecast coverage — review your negative keyword rules.`,
        });
      }
    }
    return warnings;
  }, [negativeKws, suppressedKws, workspaceKws]);

  // ── Campaign budget warnings ───────────────────────────────────────────────
  const campaignBudgetWarnings = useMemo<PlanningWarning[]>(() => {
    const manualCampaigns = campaigns.filter(
      (c) => (c.budgetMode ?? "auto") === "manual" && !c.excludeFromForecast
    );
    if (manualCampaigns.length === 0) return [];

    const totalManual  = manualCampaigns.reduce((s, c) => s + (c.budgetAmount ?? 0), 0);
    const projectTotal = effectiveAssumptions.monthlyBudget;
    const warnings: PlanningWarning[] = [];

    if (totalManual > projectTotal) {
      warnings.push({
        id:      "campaign-budget-over",
        level:   "error",
        title:   "Manual campaign budgets exceed project budget",
        message: `You've allocated $${totalManual.toLocaleString()} across manual campaigns, but the project budget is $${projectTotal.toLocaleString()}. Each manual campaign budget is scaled down proportionally.`,
      });
    } else {
      const unallocated = projectTotal - totalManual;
      if (unallocated > 0 && manualCampaigns.length > 0) {
        warnings.push({
          id:      "campaign-budget-remainder",
          level:   "info",
          title:   "Remaining budget auto-distributed",
          message: `$${unallocated.toLocaleString()} (${Math.round((unallocated / projectTotal) * 100)}% of budget) is auto-distributed across unassigned and auto-mode keywords by opportunity score.`,
        });
      }
    }

    return warnings;
  }, [campaigns, effectiveAssumptions.monthlyBudget]);

  // ── Competitor intelligence ────────────────────────────────────────────────
  const compIntel = useMemo(() => {
    const active      = enrichedAll.filter((k) => k.effectiveAction !== "No");
    const highComp    = active.filter((k) => k.competitiveDifficulty === "Hard").length;
    const easyOpps    = active.filter((k) => k.competitiveDifficulty === "Easy").length;
    const avgPressure = active.length > 0
      ? Math.round(active.reduce((s, k) => s + k.competitorPressureScore, 0) / active.length)
      : 0;
    const byCountry = inScopeCountries.map((c) => {
      const kws = active.filter((k) => k.country === c);
      const avg = kws.length > 0
        ? Math.round(kws.reduce((s, k) => s + k.competitorPressureScore, 0) / kws.length)
        : 0;
      return { country: c, avg };
    });
    const mostCrowded = byCountry.sort((a, b) => b.avg - a.avg)[0];
    return { highComp, easyOpps, avgPressure, mostCrowded };
  }, [enrichedAll, inScopeCountries]);

  // ── Override handlers ──────────────────────────────────────────────────────

  const toggleSysOverride = useCallback((
    id: number,
    field: "exclude" | "forceBuy" | "forceTest",
    currentVal: boolean,
  ) => {
    setSysOverrides((prev) => {
      const list = [...prev];
      const idx  = list.findIndex((o) => o.id === id);
      const base = idx >= 0 ? list[idx] : { id, exclude: false, forceBuy: false, forceTest: false };
      const next = { ...base, [field]: !currentVal };
      if (!currentVal) {
        if (field === "exclude")   { next.forceBuy = false; next.forceTest = false; }
        if (field === "forceBuy")  { next.exclude  = false; next.forceTest = false; }
        if (field === "forceTest") { next.exclude  = false; next.forceBuy  = false; }
      }
      if (idx >= 0) list[idx] = next; else list.push(next);
      saveSystemOverrides(list);
      return list;
    });
  }, []);

  const toggleLibraryOverride = useCallback((
    id: number,
    field: "exclude" | "forceBuy" | "forceTest",
    currentVal: boolean,
  ) => {
    setLibraryKws((prev) => {
      const updated = prev.map((k) => {
        if (k.id !== id) return k;
        const next = { ...k, [field]: !currentVal };
        if (!currentVal) {
          if (field === "exclude")   { next.forceBuy = false; next.forceTest = false; }
          if (field === "forceBuy")  { next.exclude  = false; next.forceTest = false; }
          if (field === "forceTest") { next.exclude  = false; next.forceBuy  = false; }
        }
        return next;
      });
      saveLibraryKeywords(updated);
      return updated;
    });
  }, []);

  function toggleOverride(kw: EnrichedWorkspaceKeyword, field: "exclude" | "forceBuy" | "forceTest") {
    if (kw.source === "system") toggleSysOverride(kw.id, field, kw[field]);
    else toggleLibraryOverride(kw.id, field, kw[field]);
  }

  function deleteLibraryKw(id: number) {
    setLibraryKws((prev) => {
      const updated = prev.filter((k) => k.id !== id);
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  // ── Library add / update ───────────────────────────────────────────────────

  function handleSaveKeyword(draft: KeywordDraft) {
    const derived = deriveKeywordFields({
      intent:                  draft.intent,
      competition:             draft.competition,
      competitorPressureScore: draft.competitorPressureScore,
      estimatedCpc:            draft.estimatedCpc,
    });

    if (editingKwId != null) {
      setLibraryKws((prev) => {
        const updated = prev.map((k) => k.id === editingKwId ? { ...k, ...draft, ...derived, matchTypeStrategy: draft.matchTypeStrategy } : k);
        saveLibraryKeywords(updated);
        return updated;
      });
      setEditingKwId(null);
    } else {
      const kw: LibraryKeyword = {
        id:                      nextKwId(),
        source:                  "custom",
        packName:                "",
        createdAt:               new Date().toISOString(),
        competitorExamples:      [],
        strategyNote:            "",
        recommendationNote:      "",
        exclude:                 false,
        forceBuy:                false,
        forceTest:               false,
        ...draft,
        ...derived,
      };
      setLibraryKws((prev) => {
        const updated = [...prev, kw];
        saveLibraryKeywords(updated);
        return updated;
      });
    }
    setActivePanel(null);
  }

  function handleBulkAdd(kws: LibraryKeyword[]) {
    const imported = kws.map((k) => ({ ...k, source: "imported" as const }));
    setLibraryKws((prev) => {
      const updated = [...prev, ...imported];
      saveLibraryKeywords(updated);
      return updated;
    });
    setActivePanel(null);
  }

  function handleCreateCampaign(
    name: string,
    type: CampaignType,
    starterKws: LibraryKeyword[],
    agDefs: Array<{ name: string; groupType: AdGroupType }>,
    extras: { keywordBase?: string; targetActions?: string; competitors?: string } = {},
  ) {
    const campaign = createCampaign(name, type, extras);
    // Create ad groups
    agDefs.forEach((def) => createAdGroup(campaign.id, def.name, def.groupType));
    setCampaigns(getCampaigns());
    setAdGroups(getAdGroups());
    if (starterKws.length > 0) {
      const withCampaign = starterKws.map((k) => ({ ...k, campaignId: campaign.id }));
      setLibraryKws((prev) => {
        const updated = [...prev, ...withCampaign];
        saveLibraryKeywords(updated);
        return updated;
      });
    }
    setShowCreateModal(false);
    setExpandedCampaigns((prev) => { const s = new Set(prev); s.add(campaign.id); return s; });
  }

  function toggleCampaignExpanded(id: string) {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddPack(packName: string) {
    const countries = effectiveAssumptions.targetCountries.length > 0
      ? effectiveAssumptions.targetCountries
      : undefined;
    const kws = buildPresetPackKeywords(packName, countries, campaignProfile);
    setLibraryKws((prev) => {
      const updated = [...prev, ...kws];
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  function assignKeyword(id: number, campaignId: string | undefined, adGroupId: string | undefined) {
    setLibraryKws((prev) => {
      const updated = prev.map((k) => k.id === id ? { ...k, campaignId, adGroupId } : k);
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  /** Add generated keywords without closing the panel (user manages lifecycle). */
  function handleAddGenerated(kws: LibraryKeyword[]) {
    setLibraryKws((prev) => {
      const updated = [...prev, ...kws];
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  function handleGenerateStarters() {
    if (!activeProject) return;
    const kws = generateStarterKeywordsForProject(
      {
        projectName: activeProject.projectName,
        serviceType: activeProject.serviceType,
        offerType:   activeProject.offerType,
        industry:    activeProject.industry,
      },
      effectiveAssumptions.targetCountries,
    );
    if (kws.length === 0) return;
    setLibraryKws((prev) => {
      const updated = [...prev, ...kws];
      saveLibraryKeywords(updated);
      return updated;
    });
    setStarterGenerated(true);
  }

  // ── Simplified keyword bucket actions ─────────────────────────────────────

  // Terms that are business-objective classifications, never keyword bases.
  // Only blocked when the user did NOT explicitly type them in the services field.
  const BAD_KEYWORD_TERMS = [
    "lead generation", "professional service", "professional services",
    "saas", "software as a service", "b2b", "b2c", "b2b2c",
    "ecommerce", "e-commerce", "marketplace",
  ];

  function handleRecommendKeywords() {
    const services = serviceInput.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    const comps    = competitorInput.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    const brand    = brandInput.trim() || activeProject?.projectName || "";
    if (services.length === 0 && !brand) return;

    const countries = effectiveAssumptions.targetCountries.length > 0
      ? effectiveAssumptions.targetCountries
      : ["Singapore"];

    // Build set of terms the user explicitly typed — these are never blocked
    const userTerms = new Set(services.map((s) => s.toLowerCase().trim()));

    const profile: ProjectProfile = { brand, offer: services[0] || brand };
    const userInputs: UserKeywordInputs = {
      services:    services.length > 0 ? services : undefined,
      competitors: comps.length    > 0 ? comps    : undefined,
    };

    const allKws: LibraryKeyword[] = [];
    for (const bucket of BUCKETS) {
      for (const type of bucket.campaignTypes) {
        const batch = buildDynamicCampaignKeywords(type, "", profile, countries, userInputs);
        allKws.push(...batch.map((k) => ({ ...k, campaignGroup: bucket.id })));
      }
    }

    // Safety filter: drop any keyword containing a bad classification term
    // that the user didn't explicitly enter as a service.
    const filtered = allKws
      .filter((k) => {
        const kwL = k.keyword.toLowerCase();
        for (const bad of BAD_KEYWORD_TERMS) {
          if (kwL.includes(bad) && !userTerms.has(bad)) return false;
        }
        return true;
      })
      .map((k) => ({ ...k, campaignId: undefined, adGroupId: undefined }));

    // Replace all non-custom keywords so stale/wrong recommendations are cleared.
    setLibraryKws((prev) => {
      const customOnly = prev.filter((k) => k.source === "custom");
      const updated    = [...customOnly, ...filtered];
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  function toggleBucketExclude(kwId: number) {
    setLibraryKws((prev) => {
      const updated = prev.map((k) => k.id === kwId ? { ...k, exclude: !k.exclude } : k);
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  function handleBucketEditKeyword(kwId: number, newText: string) {
    setLibraryKws((prev) => {
      const updated = prev.map((k) => k.id === kwId ? { ...k, keyword: newText } : k);
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  function makeBucketKw(text: string, country: string, category: KeywordCategory): LibraryKeyword {
    const derived = deriveKeywordFields({ intent: "Commercial", competition: "Medium", competitorPressureScore: 50, estimatedCpc: 3 });
    return {
      id:                      nextKwId(),
      keyword:                 text,
      country,
      category,
      source:                  "custom",
      packName:                "",
      note:                    "",
      intent:                  "Commercial",
      matchType:               "Phrase",
      monthlySearches:         100,
      competition:             "Medium",
      estimatedCpc:            3,
      competitorPressureScore: 50,
      competitorExamples:      [],
      strategyNote:            "",
      recommendationNote:      "",
      exclude:                 false,
      forceBuy:                false,
      forceTest:               false,
      createdAt:               new Date().toISOString(),
      ...derived,
    };
  }

  function handleBucketAddKeyword(text: string, country: string, category: KeywordCategory) {
    const kw = makeBucketKw(text, country, category);
    setLibraryKws((prev) => { const u = [...prev, kw]; saveLibraryKeywords(u); return u; });
  }

  function handleBucketBulkAdd(texts: string[], country: string, category: KeywordCategory) {
    const kws = texts.map((t) => makeBucketKw(t, country, category));
    setLibraryKws((prev) => { const u = [...prev, ...kws]; saveLibraryKeywords(u); return u; });
  }

  function handleBucketSelectAll(ids: number[], include: boolean) {
    setLibraryKws((prev) => {
      const idSet = new Set(ids);
      const updated = prev.map((k) => idSet.has(k.id) ? { ...k, exclude: !include } : k);
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  function handleClearRecommendations() {
    setLibraryKws((prev) => {
      const updated = prev.filter((k) => k.source === "custom");
      saveLibraryKeywords(updated);
      return updated;
    });
  }

  // ── Misc ───────────────────────────────────────────────────────────────────

  const addedPacks = useMemo(() => addedPackNames(libraryKws), [libraryKws]);
  const editingKw  = editingKwId != null ? libraryKws.find((k) => k.id === editingKwId) : undefined;
  const anyFilter  = filterCountry || filterIntent || filterMatchType || filterAction || filterSource || filterCategory || search;

  function openCustomPanel() {
    setEditingKwId(null);
    setActivePanel(activePanel === "custom" ? null : "custom");
  }

  function startEdit(kw: EnrichedWorkspaceKeyword) {
    setEditingKwId(kw.id);
    setActivePanel("custom");
  }

  // Context completeness hint
  const missingContext = !activeProject?.businessType || !activeProject?.offerType;

  // ── Render ─────────────────────────────────────────────────────────────────

  const defaultCountry  = effectiveAssumptions.targetCountries[0] || LIBRARY_COUNTRIES[0];
  const libraryKwsExist = enrichedAll.some((k) => k.isLibrary);
  const canRecommend    = serviceInput.trim().length > 0 || brandInput.trim().length > 0;

  // Derive current step for the progress header
  const currentStep = !libraryKwsExist ? 1 : totalBuyCount === 0 ? 2 : 3;

  const STEPS = [
    { n: 1, label: "Enter keyword inputs" },
    { n: 2, label: "Review recommendations" },
    { n: 3, label: "Generate forecast" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Keyword Planner</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {isProjectSet ? activeProject!.projectName : "No project — using defaults"}
            {effectiveAssumptions.targetCountries.length > 0 && (
              <span className="ml-1.5 text-slate-300">·</span>
            )}
            {effectiveAssumptions.targetCountries.length > 0 && (
              <span className="ml-1.5">{effectiveAssumptions.targetCountries.join(", ")}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 self-start shrink-0">
          <button
            onClick={() => exportKeywordsCsv(enrichedAll, campaigns, adGroups, negativeKws, assumptions.projectName)}
            title="Export all keywords to CSV"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
          <Link
            href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors"
          >
            <Settings2 size={13} />
            {isProjectSet ? "Edit Project" : "Set Up Project"}
          </Link>
        </div>
      </div>

      {/* ── 3-step progress ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done    = step.n < currentStep;
          const active  = step.n === currentStep;
          return (
            <div key={step.n} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  done   ? "bg-brand-500 border-brand-500 text-white" :
                  active ? "bg-white border-brand-500 text-brand-600" :
                           "bg-white border-slate-200 text-slate-400"
                }`}>
                  {done ? "✓" : step.n}
                </div>
                <span className={`text-xs font-semibold whitespace-nowrap hidden sm:inline ${
                  active ? "text-brand-600" : done ? "text-slate-500" : "text-slate-400"
                }`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 rounded-full transition-colors ${done ? "bg-brand-400" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* No-project nudge */}
      {!isProjectSet && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <Info size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">No project yet.</span>{" "}
            Forecasts use default assumptions ($5,000/mo, 3.5% CVR, $10,000 deal).{" "}
            <Link href="/projects/new" className="underline font-semibold hover:text-amber-900">Create a project →</Link>
          </p>
        </div>
      )}

      {/* ── Step 1: Input card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">Step 1</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">What are you advertising?</h2>
            <p className="text-sm text-slate-400 mt-0.5">Enter your services and brand — we&apos;ll build keyword recommendations grouped by intent.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Services / Keyword Base <span className="text-brand-500">*</span>
            </label>
            <input
              type="text"
              value={serviceInput}
              onChange={(e) => setServiceInput(e.target.value)}
              placeholder="Employer of Record, EOR, Headhunting"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <p className="text-xs text-slate-400 mt-1">Comma-separated — each service generates its own keyword variations</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Brand Name</label>
            <input
              type="text"
              value={brandInput}
              onChange={(e) => setBrandInput(e.target.value)}
              placeholder="Elitez"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Competitors <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              type="text"
              value={competitorInput}
              onChange={(e) => setCompetitorInput(e.target.value)}
              placeholder="Randstad, Michael Page, Adecco"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Markets</label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 min-h-[42px] flex items-center">
              {effectiveAssumptions.targetCountries.length > 0
                ? effectiveAssumptions.targetCountries.join(", ")
                : <span className="text-slate-400">Not set</span>}
            </div>
            <Link
              href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"}
              className="text-xs text-brand-500 font-semibold hover:underline mt-1 inline-block"
            >
              Edit in project settings →
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRecommendKeywords}
            disabled={!canRecommend}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 size={15} />
            {libraryKwsExist ? "Regenerate Keywords" : "Recommend Keywords"}
          </button>
          {libraryKwsExist && (
            <button
              onClick={handleClearRecommendations}
              className="text-xs font-semibold text-slate-400 hover:text-rose-500 transition-colors"
            >
              Clear recommendations
            </button>
          )}
          {libraryKwsExist && (
            <span className="text-xs text-slate-400">
              {libraryKws.filter((k) => !k.exclude).length} of {libraryKws.length} keyword{libraryKws.length !== 1 ? "s" : ""} selected
            </span>
          )}
        </div>
      </div>

      {/* ── Step 2: Keyword buckets ─────────────────────────────────────────── */}
      {libraryKwsExist ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-brand-600 uppercase tracking-wider">Step 2</span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">Review Your Keywords</h2>
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">Check to include · uncheck to exclude from forecast</span>
          </div>

          {/* Competitor Intelligence summary */}
          <CompetitorIntelligencePanel
            allKws={enrichedAll}
            buckets={BUCKETS}
            userCompetitors={competitorInput.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)}
          />

          {BUCKETS.map((bucket) => {
            const bucketKws = enrichedAll.filter(
              (k) => k.isLibrary && (bucket.categories as string[]).includes(k.category)
            );
            return (
              <BucketSection
                key={bucket.id}
                bucket={bucket}
                keywords={bucketKws}
                defaultCountry={defaultCountry}
                userCompetitors={competitorInput.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean)}
                onToggleExclude={toggleBucketExclude}
                onSelectAll={handleBucketSelectAll}
                onDelete={deleteLibraryKw}
                onEditKeyword={handleBucketEditKeyword}
                onAddKeyword={(text, country) => handleBucketAddKeyword(text, country, bucket.categories[0])}
                onBulkAdd={(texts, country) => handleBucketBulkAdd(texts, country, bucket.categories[0])}
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <Wand2 size={36} className="text-slate-300 mx-auto" />
          <div>
            <p className="text-sm font-semibold text-slate-700">No keywords yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Fill in your services above and click &ldquo;Recommend Keywords&rdquo; to get started.
            </p>
          </div>
        </div>
      )}

      {/* ── Step 3: Summary + Generate Forecast ────────────────────────────── */}
      {libraryKwsExist && (
        <div className={`rounded-2xl border p-6 transition-colors ${totalBuyCount > 0 ? "bg-brand-500 border-brand-500" : "bg-white border-slate-200"}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className={`text-xs font-bold uppercase tracking-wider ${totalBuyCount > 0 ? "text-blue-200" : "text-brand-600"}`}>Step 3</span>
              {totalBuyCount > 0 ? (
                <>
                  <p className="text-lg font-bold text-white mt-0.5">
                    {totalBuyCount} keyword{totalBuyCount !== 1 ? "s" : ""} ready for forecast
                  </p>
                  <p className="text-sm text-blue-100 mt-0.5">
                    Est. ${totalBudget.toLocaleString()}/mo
                    {totalLeads > 0 && <> · {totalLeads} est. conversions</>}
                    {totalRevenue > 0 && <> · ${totalRevenue.toLocaleString()} revenue</>}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-bold text-slate-900 mt-0.5">Generate Forecast</p>
                  <p className="text-sm text-slate-400 mt-0.5">Select at least one keyword above to enable the forecast.</p>
                </>
              )}
            </div>
            <Link
              href="/forecast"
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-colors shrink-0 ${
                totalBuyCount > 0
                  ? "bg-white text-brand-600 hover:bg-blue-50"
                  : "bg-slate-100 text-slate-400 pointer-events-none"
              }`}
            >
              Generate Forecast →
            </Link>
          </div>
        </div>
      )}

      {/* ── Advanced Campaign Structure ─────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
        >
          {showAdvanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          Advanced Campaign Structure
          {(campaigns.length > 0 || negativeKws.length > 0) && (
            <span className="text-xs font-normal text-slate-400 ml-1">
              ({campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
              {negativeKws.length > 0 ? ` · ${negativeKws.length} negative${negativeKws.length !== 1 ? "s" : ""}` : ""})
            </span>
          )}
        </button>

        {showAdvanced && (
          <div className="mt-6 space-y-6">

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <CreateCampaignModal
          onConfirm={handleCreateCampaign}
          onClose={() => setShowCreateModal(false)}
          targetCountries={effectiveAssumptions.targetCountries}
          profile={campaignProfile}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campaigns & Keywords</h1>
          <p className="text-sm text-slate-400 mt-1">
            Build your SEM structure — campaigns first, then ad groups and keywords.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors"
          >
            <Plus size={13} /> Create Campaign
          </button>
          <button
            onClick={openCustomPanel}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              activePanel === "custom"
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-500"
            }`}
          >
            <Plus size={13} /> Add Keyword
          </button>
          <button
            onClick={() => setActivePanel(activePanel === "bulk" ? null : "bulk")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              activePanel === "bulk"
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-500"
            }`}
          >
            <CheckCheck size={13} /> Bulk Paste
          </button>
          <button
            onClick={() => setActivePanel(activePanel === "presets" ? null : "presets")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              activePanel === "presets"
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-500"
            }`}
          >
            <Package size={13} /> Preset Packs
          </button>
          <button
            onClick={() => setActivePanel(activePanel === "generator" ? null : "generator")}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              activePanel === "generator"
                ? "bg-brand-500 border-brand-500 text-white"
                : "border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-500"
            }`}
          >
            <Wand2 size={13} /> Generate
          </button>
          <button
            onClick={() => exportKeywordsCsv(filtered, campaigns, adGroups, negativeKws, assumptions.projectName)}
            title={`Export ${filtered.length} keyword${filtered.length !== 1 ? "s" : ""} to CSV`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
          <Link
            href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-brand-500 hover:text-brand-500 transition-colors"
          >
            <Settings2 size={13} />
            {isProjectSet ? "Edit Project" : "Set Up Project"}
          </Link>
        </div>
      </div>

      {/* Keyword panel */}
      {activePanel === "custom" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {editingKwId != null ? "Edit Keyword" : "Add Custom Keyword"}
            </p>
            <button onClick={() => { setActivePanel(null); setEditingKwId(null); }} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <AddCustomPanel
            key={editingKwId ?? "new"}
            initial={editingKw}
            onSave={handleSaveKeyword}
            onClose={() => { setActivePanel(null); setEditingKwId(null); }}
          />
        </div>
      )}

      {/* Bulk paste panel */}
      {activePanel === "bulk" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Bulk Paste Keywords</p>
            <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <BulkPastePanel
            defaultCountry={inScopeCountries[0] ?? LIBRARY_COUNTRIES[0]}
            onAdd={handleBulkAdd}
            onClose={() => setActivePanel(null)}
          />
        </div>
      )}

      {/* Preset packs panel */}
      {activePanel === "presets" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Preset Keyword Packs</p>
            <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <PresetPacksPanel addedPacks={addedPacks} onAdd={handleAddPack} onClose={() => setActivePanel(null)} />
        </div>
      )}

      {/* Keyword generator panel */}
      {activePanel === "generator" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 size={15} className="text-brand-500" />
              <p className="text-sm font-semibold text-slate-700">Keyword Generator</p>
            </div>
            <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <GeneratorPanel
            targetCountries={effectiveAssumptions.targetCountries}
            onAdd={handleAddGenerated}
            onClose={() => setActivePanel(null)}
            defaultBrand={campaignProfile.brand}
            defaultOffer={campaignProfile.offer}
          />
        </div>
      )}

      {/* Campaigns panel */}
      {activePanel === "campaigns" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-brand-500" />
              <p className="text-sm font-semibold text-slate-700">Campaign Manager</p>
            </div>
            <button onClick={() => setActivePanel(null)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <CampaignManagerPanel
            campaigns={campaigns}
            adGroups={adGroups}
            totalBudget={effectiveAssumptions.monthlyBudget}
            onClose={() => setActivePanel(null)}
            onCampaignsChange={(list) => { setCampaigns(list); saveCampaigns(list); }}
            onAdGroupsChange={(list) => { setAdGroups(list); saveAdGroups(list); }}
          />
        </div>
      )}

      {/* No-project nudge */}
      {!isProjectSet && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <Info size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <span className="font-semibold">Using default assumptions.</span>{" "}
            No project has been configured yet. Forecasts use $5,000/mo budget, 3.5% conversion rate, 20% close rate, and $10,000 avg deal size.{" "}
            <Link href="/projects/new" className="underline font-semibold hover:text-amber-900">Create a project →</Link>
          </p>
        </div>
      )}

      {/* Missing business context nudge */}
      {isProjectSet && missingContext && (
        <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <Info size={15} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold">Business Relevance scores are generic.</span>{" "}
            Add your Business Type and Offer Type in project settings to get tailored keyword relevance scores.{" "}
            <Link href={`/projects/${activeProject?.id}/edit`} className="underline font-semibold hover:text-slate-900">
              Complete setup →
            </Link>
          </p>
        </div>
      )}

      {/* Planning warnings + campaign budget warnings + negative warnings + match type warnings */}
      {(planningWarnings.length > 0 || campaignBudgetWarnings.length > 0 || negativeWarnings.length > 0 || matchTypeWarnings.length > 0) && (
        <div className="space-y-2">
          {[...matchTypeWarnings, ...negativeWarnings, ...campaignBudgetWarnings, ...planningWarnings].map((w: PlanningWarning) => {
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
          {activeProject?.businessType && (
            <span className="text-xs text-slate-700 font-medium">
              <span className="text-slate-400">Type: </span>{activeProject.businessType}
            </span>
          )}
          {activeProject?.offerType && (
            <span className="text-xs text-slate-700 font-medium">
              <span className="text-slate-400">Offer: </span>{activeProject.offerType}
            </span>
          )}
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">Budget: </span>${effectiveAssumptions.monthlyBudget.toLocaleString()}/mo
          </span>
          <span className="text-xs text-slate-700 font-medium">
            <span className="text-slate-400">LP CVR: </span>{effectiveAssumptions.lpConversionRate.toFixed(2)}%
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
          <Link
            href={activeProject ? `/projects/${activeProject.id}/edit` : "/projects/new"}
            className="ml-auto text-xs font-semibold text-brand-500 hover:text-brand-700 transition-colors shrink-0"
          >
            Edit →
          </Link>
        </div>
      </div>

      {/* Forecast disclaimer */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <Info size={15} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-600 leading-relaxed">
          <span className="font-semibold">Forecast estimates only.</span>{" "}
          Campaigns set to <span className="font-medium">Manual</span> budget receive their fixed allocation first; the remainder goes to Auto campaigns and unassigned keywords by Opportunity Score (85% Buy · 15% Test).
          Clicks = budget ÷ (CPC × match type factor). Conversions = clicks × LP CVR × match type CVR factor.{" "}
          Match type modifiers —{" "}
          Broad: CPC ×{fa.broadCpcFactor}, CVR ×{fa.broadCvrFactor} ·{" "}
          Phrase: baseline ·{" "}
          Exact: CPC ×{fa.exactCpcFactor}, CVR ×{fa.exactCvrFactor}.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-200 -mb-2">
        {([
          { id: "campaigns",  label: "Campaigns",    count: campaigns.length },
          { id: "keywords",   label: "All Keywords",  count: enrichedAll.length },
          { id: "negatives",  label: "Negatives",     count: negativeKws.length },
        ] as const).map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setMainTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              mainTab === id
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                mainTab === id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Country filter warning */}
      {hiddenKwCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <Globe size={15} className="shrink-0 text-amber-500" />
          <span className="flex-1">
            <span className="font-semibold">{hiddenKwCount} keyword{hiddenKwCount !== 1 ? "s" : ""} hidden</span>
            {" "}— outside this project&apos;s selected markets ({activeCountries.join(", ")}).
          </span>
          <button
            onClick={() => setShowAllCountries((v) => !v)}
            className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:text-amber-900 transition-colors"
          >
            Show all countries
          </button>
        </div>
      )}
      {showAllCountries && activeCountries.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-600">
          <Eye size={15} className="shrink-0 text-slate-400" />
          <span className="flex-1">Showing keywords from all countries.</span>
          <button
            onClick={() => setShowAllCountries(false)}
            className="shrink-0 text-xs font-semibold underline underline-offset-2 hover:text-slate-800 transition-colors"
          >
            Hide other countries
          </button>
        </div>
      )}

      {/* ── Campaigns tab ────────────────────────────────────────────────────── */}
      {mainTab === "campaigns" && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <Layers size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-600 mb-1">No campaigns yet</p>
              <p className="text-xs text-slate-400 mb-4">Create your first campaign to organise keywords by type and get starter recommendations.</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors"
              >
                <Plus size={13} /> Create Campaign
              </button>
            </div>
          ) : (
            <>
              {campaigns.map((campaign) => {
                const campaignKws = enrichedAll.filter((k) => k.campaignId === campaign.id);
                return (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    adGroups={adGroups}
                    campaignKws={campaignKws}
                    isExpanded={expandedCampaigns.has(campaign.id)}
                    onToggle={() => toggleCampaignExpanded(campaign.id)}
                    onEdit={() => setActivePanel("campaigns")}
                    isProjectSet={isProjectSet}
                    toggleOverride={toggleOverride}
                    deleteLibraryKw={deleteLibraryKw}
                    startEdit={startEdit}
                    assignKeyword={assignKeyword}
                    onAdGroupsChange={(list) => { setAdGroups(list); saveAdGroups(list); }}
                  />
                );
              })}
              {/* Unassigned keywords */}
              {(() => {
                const unassigned = enrichedAll.filter((k) => !k.campaignId);
                if (unassigned.length === 0) return null;
                return (
                  <div className="bg-white rounded-xl border border-slate-200">
                    <button
                      onClick={() => toggleCampaignExpanded("__unassigned__")}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 rounded-xl transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                      <div className="flex-1">
                        <span className="font-bold text-sm text-slate-500">Unassigned Keywords</span>
                        <span className="text-xs text-slate-400 ml-3">{unassigned.length} keyword{unassigned.length !== 1 ? "s" : ""}</span>
                      </div>
                      {expandedCampaigns.has("__unassigned__")
                        ? <ChevronDown size={14} className="text-slate-400" />
                        : <ChevronRight size={14} className="text-slate-400" />}
                    </button>
                    {expandedCampaigns.has("__unassigned__") && (
                      <div className="border-t border-slate-100 divide-y divide-slate-50">
                        {unassigned.map((kw) => (
                          <CompactKeywordRow key={kw.id} kw={kw} isProjectSet={isProjectSet} indent={1}
                            toggleOverride={toggleOverride} deleteLibraryKw={deleteLibraryKw} startEdit={startEdit} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Negatives tab ─────────────────────────────────────────────────────── */}
      {mainTab === "negatives" && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <NegativeKeywordsPanel
            negatives={negativeKws}
            campaigns={campaigns}
            adGroups={adGroups}
            initialText={pendingNegText}
            onClose={() => {}}
            onChange={(list) => setNegativeKws(list)}
          />
        </div>
      )}

      {/* ── All Keywords tab ──────────────────────────────────────────────────── */}
      {mainTab === "keywords" && <>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Keywords to Buy" value={String(totalBuyCount)} sub={`of ${enrichedAll.length} total`} highlight />
        <StatCard label="Total Keyword Budget" value={`$${totalBudget.toLocaleString()}`} sub="Buy keywords only" />
        <StatCard label="Est. Total Conversions" value={String(totalLeads)} sub="from Buy keywords" />
        <StatCard
          label="Avg. Est. CPA"
          value={avgCpl > 0 ? `$${avgCpl.toLocaleString()}` : "—"}
          sub="blended across Buy keywords"
        />
        <StatCard
          label="Est. Revenue Potential"
          value={totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : "—"}
          sub={`at ${effectiveAssumptions.closeRate}% close · $${effectiveAssumptions.avgDealSize.toLocaleString()} deal`}
        />
      </div>

      {/* Empty state — no keywords for selected countries */}
      {enrichedAll.length === 0 && activeCountries.length > 0 && !starterGenerated && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-4">
          <Globe size={36} className="text-slate-300 mx-auto" />
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">
              No keywords yet for {activeCountries.join(", ")}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              The system dataset doesn&apos;t include {activeCountries.join(" / ")} rows.
              Generate starter keywords using your project context, or create a campaign to get recommendations.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleGenerateStarters}
              disabled={!activeProject}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wand2 size={15} />
              Generate starter keywords for {activeCountries.join(", ")}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
            >
              <Plus size={15} />
              Create a campaign
            </button>
          </div>
          {!activeProject && (
            <p className="text-xs text-slate-400">Set up a project first to enable keyword generation.</p>
          )}
        </div>
      )}

      {/* Competitor Intelligence */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-rose-400">High Competition</span>
          <span className="text-xl font-bold text-slate-900">{compIntel.highComp}</span>
          <span className="text-xs text-slate-400">Hard-difficulty keywords</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-emerald-500">Easy Opportunities</span>
          <span className="text-xl font-bold text-slate-900">{compIntel.easyOpps}</span>
          <span className="text-xs text-slate-400">Low-pressure Buy / Test keywords</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Avg Pressure Score</span>
          <span className={`text-xl font-bold ${compIntel.avgPressure >= 60 ? "text-rose-600" : compIntel.avgPressure >= 40 ? "text-amber-600" : "text-emerald-600"}`}>
            {compIntel.avgPressure}<span className="text-sm font-medium text-slate-400"> / 100</span>
          </span>
          <span className="text-xs text-slate-400">Across active keywords</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Most Contested Market</span>
          <span className="text-xl font-bold text-slate-900">{compIntel.mostCrowded?.country ?? "—"}</span>
          <span className="text-xs text-slate-400">Avg pressure {compIntel.mostCrowded?.avg ?? "—"}</span>
        </div>
      </div>

      {/* Filters + table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">

        {/* View toggle + filter bar */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-400 shrink-0">View</span>
          {(["flat", "campaign", "adgroup"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === v
                  ? "bg-brand-500 text-white"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {v === "flat" ? "Flat" : v === "campaign" ? "By Campaign" : "By Ad Group"}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search keywords…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-300 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              label="Country"
              value={filterCountry}
              options={inScopeCountries.length > 0 ? inScopeCountries : [...KEYWORD_COUNTRIES]}
              onChange={setFilterCountry}
            />
            <FilterSelect label="Source"    value={filterSource}    options={[...ALL_SOURCES]}     onChange={setFilterSource}    />
            <FilterSelect label="Intent"    value={filterIntent}    options={[...ALL_INTENTS]}     onChange={setFilterIntent}    />
            <FilterSelect label="Match"     value={filterMatchType} options={[...ALL_MATCH]}       onChange={setFilterMatchType} />
            <FilterSelect label="Action"    value={filterAction}    options={[...ALL_ACTIONS]}     onChange={setFilterAction}    />
            <FilterSelect label="Category"  value={filterCategory}  options={ALL_CATEGORIES}       onChange={setFilterCategory}  />
            {anyFilter && (
              <button
                onClick={() => {
                  setFilterCountry(""); setFilterIntent(""); setFilterMatchType("");
                  setFilterAction(""); setFilterSource(""); setFilterCategory(""); setSearch("");
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:text-rose-500 hover:border-rose-200 transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Result bar */}
        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            {filtered.length} keyword{filtered.length !== 1 ? "s" : ""} shown
          </span>
          <span className="text-xs text-slate-400">
            {filtered.filter((k) => k.effectiveAction === "Buy").length} Buy ·{" "}
            {filtered.filter((k) => k.effectiveAction === "Test").length} Test ·{" "}
            {filtered.filter((k) => k.effectiveAction === "No").length} No
          </span>
        </div>

        {/* Table */}
        {view === "flat" && <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap ${col.width}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-slate-400">
                    {enrichedAll.length === 0
                      ? activeCountries.length > 0
                        ? `No keywords found for ${activeCountries.join(", ")}. Use the button above to generate starters.`
                        : "No keyword data available. Add keywords, load a preset pack, or adjust your target countries."
                      : "No keywords match your current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((kw, i) => {
                  const isOverridden  = kw.effectiveAction !== kw.action;
                  const isSuppressed  = kw.effectiveAction !== "No" && isKeywordSuppressed(kw.keyword, kw.campaignId, kw.adGroupId, negativeKws);
                  return (
                    <tr
                      key={kw.id}
                      className={`border-t border-slate-50 hover:bg-slate-50/80 transition-colors ${
                        isSuppressed                  ? "border-l-2 border-l-rose-300 bg-rose-50/20" :
                        kw.effectiveAction === "Buy"  ? "border-l-2 border-l-emerald-400" :
                        kw.effectiveAction === "Test" ? "border-l-2 border-l-amber-400"   :
                                                        "border-l-2 border-l-slate-200"
                      } ${kw.exclude ? "opacity-50" : ""} ${i % 2 !== 0 && !isSuppressed ? "bg-slate-50/30" : ""}`}
                    >
                      {/* Keyword */}
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                        <span className={`block truncate ${isSuppressed ? "line-through text-slate-400" : ""}`} title={kw.keyword}>{kw.keyword}</span>
                        {isSuppressed && <span className="text-[10px] font-semibold text-rose-500">suppressed</span>}
                      </td>

                      {/* Campaign */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {kw.isLibrary ? (
                          <select
                            value={kw.campaignId ?? ""}
                            onChange={(e) => {
                              const cId = e.target.value || undefined;
                              assignKeyword(kw.id, cId, cId === kw.campaignId ? kw.adGroupId : undefined);
                            }}
                            className="text-xs rounded-lg border border-slate-200 px-2 py-1 text-slate-700 bg-white outline-none focus:ring-1 focus:ring-brand-400 max-w-[140px]"
                          >
                            <option value="">— None —</option>
                            {campaigns.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Ad Group */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {kw.isLibrary && kw.campaignId ? (
                          <select
                            value={kw.adGroupId ?? ""}
                            onChange={(e) => assignKeyword(kw.id, kw.campaignId, e.target.value || undefined)}
                            className="text-xs rounded-lg border border-slate-200 px-2 py-1 text-slate-700 bg-white outline-none focus:ring-1 focus:ring-brand-400 max-w-[140px]"
                          >
                            <option value="">— None —</option>
                            {adGroups.filter((g) => g.campaignId === kw.campaignId).map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={SOURCE_LABELS[kw.source]} className={SOURCE_STYLES[kw.source]} />
                      </td>

                      {/* Country */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                          <Globe size={11} className="text-slate-300 shrink-0" />
                          {kw.country}
                        </span>
                      </td>

                      {/* Intent */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={kw.intent} className={INTENT_STYLES[kw.intent]} />
                      </td>

                      {/* Monthly Searches */}
                      <td className="px-4 py-3 tabular-nums text-slate-700 whitespace-nowrap">
                        {kw.monthlySearches.toLocaleString()}
                      </td>

                      {/* Competition */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={kw.competition} className={PRESSURE_STYLES[kw.competition]} />
                      </td>

                      {/* Est. CPC */}
                      <td className="px-4 py-3 tabular-nums text-slate-500 whitespace-nowrap">
                        ${kw.estimatedCpc.toFixed(2)}
                      </td>

                      {/* Base Match Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {kw.matchType}
                        </span>
                      </td>

                      {/* Effective Match Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <EffMatchBadge matchType={kw.effectiveMatchType} inherited={kw.matchTypeInherited} />
                      </td>

                      {/* Opportunity */}
                      <td className="px-4 py-3">
                        <OpportunityBar score={kw.opportunityScore} />
                      </td>

                      {/* Action (effectiveAction) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ActionBadge action={kw.effectiveAction} overridden={isOverridden} />
                      </td>

                      {/* Business Relevance */}
                      <td className="px-4 py-3">
                        {isProjectSet
                          ? <RelevanceBar score={kw.businessRelevanceScore} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={CATEGORY_LABELS[kw.category]} className={CATEGORY_STYLES[kw.category]} />
                      </td>

                      {/* Suggested CPC */}
                      <td className="px-4 py-3 tabular-nums text-slate-800 font-medium whitespace-nowrap">
                        {kw.effectiveAction === "No"
                          ? <span className="text-slate-300">—</span>
                          : `$${kw.suggestedCpc.toFixed(2)}`}
                      </td>

                      {/* Suggested Budget */}
                      <td className="px-4 py-3 tabular-nums font-medium whitespace-nowrap">
                        {kw.suggestedMonthlyBudget === 0
                          ? <span className="text-slate-300">—</span>
                          : <span className="text-slate-800">${kw.suggestedMonthlyBudget.toLocaleString()}</span>}
                      </td>

                      {/* Est. Clicks */}
                      <td className="px-4 py-3 tabular-nums text-slate-700 whitespace-nowrap">
                        {kw.estimatedClicks === 0
                          ? <span className="text-slate-300">—</span>
                          : kw.estimatedClicks.toLocaleString()}
                      </td>

                      {/* Est. Conversions */}
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {kw.estimatedLeads === 0
                          ? <span className="text-slate-300">—</span>
                          : <span className="font-semibold text-emerald-600">{kw.estimatedLeads}</span>}
                      </td>

                      {/* Est. CPA */}
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {kw.estimatedCpl === 0
                          ? <span className="text-slate-300">—</span>
                          : <span className="text-slate-700">${kw.estimatedCpl.toLocaleString()}</span>}
                      </td>

                      {/* Revenue Potential */}
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {kw.revenuePotential === 0
                          ? <span className="text-slate-300">—</span>
                          : <span className="inline-flex items-center gap-1 font-semibold text-brand-600">
                              ${kw.revenuePotential.toLocaleString()}
                            </span>}
                      </td>

                      {/* Competitor Pressure */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={kw.competitorPressure} className={PRESSURE_STYLES[kw.competitorPressure]} />
                      </td>

                      {/* Pressure Score */}
                      <td className="px-4 py-3">
                        <PressureScoreBar score={kw.competitorPressureScore} />
                      </td>

                      {/* Ad Crowding */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={kw.adCrowdingLevel} className={CROWDING_STYLES[kw.adCrowdingLevel]} />
                      </td>

                      {/* Competitive Difficulty */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={kw.competitiveDifficulty} className={DIFFICULTY_STYLES[kw.competitiveDifficulty]} />
                      </td>

                      {/* Competitor Examples */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {kw.competitorExamples.map((c) => (
                            <span key={c} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded whitespace-nowrap">{c}</span>
                          ))}
                        </div>
                      </td>

                      {/* Strategy Note */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-600 leading-relaxed max-w-[300px]">
                          {kw.strategyNote || kw.note || ""}
                        </p>
                      </td>

                      {/* Rec. Note */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-500 leading-relaxed max-w-[250px]">
                          {kw.recommendationNote}
                        </p>
                      </td>

                      {/* Row controls */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => { setPendingNegText(kw.keyword); setMainTab("negatives"); }}
                            title="Add as negative keyword"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          >
                            <MinusCircle size={12} />
                          </button>
                          <button
                            onClick={() => toggleOverride(kw, "exclude")}
                            title={kw.exclude ? "Remove exclusion" : "Exclude"}
                            className={`p-1.5 rounded-lg transition-colors ${kw.exclude ? "text-rose-500 bg-rose-50 hover:bg-rose-100" : "text-slate-300 hover:text-rose-400 hover:bg-rose-50"}`}
                          >
                            <Ban size={12} />
                          </button>
                          <button
                            onClick={() => toggleOverride(kw, "forceBuy")}
                            title={kw.forceBuy ? "Clear force buy" : "Force Buy"}
                            className={`p-1.5 rounded-lg transition-colors ${kw.forceBuy ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-slate-300 hover:text-emerald-500 hover:bg-emerald-50"}`}
                          >
                            <ShoppingCart size={12} />
                          </button>
                          <button
                            onClick={() => toggleOverride(kw, "forceTest")}
                            title={kw.forceTest ? "Clear force test" : "Force Test"}
                            className={`p-1.5 rounded-lg transition-colors ${kw.forceTest ? "text-amber-600 bg-amber-50 hover:bg-amber-100" : "text-slate-300 hover:text-amber-500 hover:bg-amber-50"}`}
                          >
                            <FlaskConical size={12} />
                          </button>
                          {kw.isLibrary && (
                            <button
                              onClick={() => startEdit(kw)}
                              title="Edit keyword"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          {kw.isLibrary && (
                            <button
                              onClick={() => deleteLibraryKw(kw.id)}
                              title="Delete keyword"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        }

        {/* By Campaign view */}
        {view === "campaign" && (
          <div className="divide-y divide-slate-100">
            {campaigns.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No campaigns yet. Create campaigns in the <button onClick={() => setActivePanel("campaigns")} className="underline font-semibold text-brand-500">Campaign Manager</button>.
              </div>
            )}
            {[...campaigns, null].map((c) => {
              const campaignKws = c
                ? filtered.filter((k) => k.campaignId === c.id)
                : filtered.filter((k) => !k.campaignId);
              if (campaignKws.length === 0 && c !== null) return null;
              const rollup = computeRollup(campaignKws);
              const campaignAdGroups = c ? adGroups.filter((g) => g.campaignId === c.id) : [];
              const label = c ? c.name : "Unassigned";
              const isExcluded = c?.excludeFromForecast ?? false;

              return (
                <div key={c?.id ?? "unassigned"}>
                  {/* Campaign header */}
                  <div className={`px-5 py-3 flex flex-wrap items-center gap-3 ${isExcluded ? "bg-rose-50" : "bg-slate-50"}`}>
                    <FolderKanban size={14} className={isExcluded ? "text-rose-400" : "text-brand-400"} />
                    <span className={`font-bold text-sm ${isExcluded ? "text-rose-500 line-through" : "text-slate-800"}`}>{label}</span>
                    {isExcluded && <span className="text-xs text-rose-400 font-medium">Excluded from forecast</span>}
                    <RollupBadge
                      r={rollup}
                      budgetMode={c?.budgetMode ?? "auto"}
                      manualBudget={c?.budgetAmount}
                      totalBudget={effectiveAssumptions.monthlyBudget}
                    />
                  </div>

                  {/* Ad groups within campaign */}
                  {campaignAdGroups.map((g) => {
                    const groupKws = campaignKws.filter((k) => k.adGroupId === g.id);
                    if (groupKws.length === 0) return null;
                    const groupRollup = computeRollup(groupKws);
                    return (
                      <div key={g.id}>
                        <div className={`px-5 py-2 pl-12 flex flex-wrap items-center gap-2 border-t border-slate-50 ${g.excludeFromForecast ? "bg-rose-50/50" : "bg-white"}`}>
                          <span className={`text-xs font-semibold ${g.excludeFromForecast ? "text-rose-400 line-through" : "text-slate-600"}`}>{g.name}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{AD_GROUP_TYPE_LABELS[g.groupType]}</span>
                          <RollupBadge r={groupRollup} budgetMode={c?.budgetMode ?? "auto"} totalBudget={effectiveAssumptions.monthlyBudget} />
                        </div>
                        {groupKws.map((kw) => <CompactKeywordRow key={kw.id} kw={kw} isProjectSet={isProjectSet} indent={3} toggleOverride={toggleOverride} deleteLibraryKw={deleteLibraryKw} startEdit={startEdit} />)}
                      </div>
                    );
                  })}

                  {/* Unassigned within campaign */}
                  {(() => {
                    const unassigned = campaignKws.filter((k) => !k.adGroupId);
                    if (unassigned.length === 0) return null;
                    return unassigned.map((kw) => <CompactKeywordRow key={kw.id} kw={kw} isProjectSet={isProjectSet} indent={campaignAdGroups.length > 0 ? 2 : 1} toggleOverride={toggleOverride} deleteLibraryKw={deleteLibraryKw} startEdit={startEdit} />);
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* By Ad Group view */}
        {view === "adgroup" && (
          <div className="divide-y divide-slate-100">
            {adGroups.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No ad groups yet. Create campaigns and ad groups in the <button onClick={() => setActivePanel("campaigns")} className="underline font-semibold text-brand-500">Campaign Manager</button>.
              </div>
            )}
            {[...adGroups, null].map((g) => {
              const groupKws = g
                ? filtered.filter((k) => k.adGroupId === g.id)
                : filtered.filter((k) => !k.adGroupId);
              if (groupKws.length === 0 && g !== null) return null;
              const rollup   = computeRollup(groupKws);
              const campaign = g ? campaigns.find((c) => c.id === g.campaignId) : undefined;
              const isExcluded = g?.excludeFromForecast ?? false;

              return (
                <div key={g?.id ?? "unassigned"}>
                  <div className={`px-5 py-3 flex flex-wrap items-center gap-3 ${isExcluded ? "bg-rose-50" : "bg-slate-50"}`}>
                    <span className={`font-bold text-sm ${isExcluded ? "text-rose-500 line-through" : "text-slate-800"}`}>
                      {g ? g.name : "Unassigned"}
                    </span>
                    {g && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{AD_GROUP_TYPE_LABELS[g.groupType]}</span>}
                    {campaign && <span className="text-xs text-slate-400">in {campaign.name}</span>}
                    {isExcluded && <span className="text-xs text-rose-400 font-medium">Excluded from forecast</span>}
                    <RollupBadge
                      r={rollup}
                      budgetMode={campaign?.budgetMode ?? "auto"}
                      totalBudget={effectiveAssumptions.monthlyBudget}
                    />
                  </div>
                  {groupKws.map((kw) => <CompactKeywordRow key={kw.id} kw={kw} isProjectSet={isProjectSet} indent={1} toggleOverride={toggleOverride} deleteLibraryKw={deleteLibraryKw} startEdit={startEdit} />)}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-xs text-slate-400">
            Showing {filtered.length} of {enrichedAll.length} keywords
            {libraryKws.length > 0 && ` · ${libraryKws.length} custom/preset`}
          </span>
          <span className="text-xs text-slate-400">
            {scenario ? `Scenario: ${scenario.name} · ` : ""}Forecasts update when you edit project assumptions.
          </span>
        </div>
      </div>

      </> /* end mainTab === "keywords" */}

          </div>
        )}
      </div>

    </div>
  );
}
