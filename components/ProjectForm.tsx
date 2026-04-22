"use client";

import { useState, useMemo } from "react";
import type { Project, ProjectDraft } from "@/lib/projectStore";
import { validateFormInputs, type FormFieldIssue } from "@/lib/planningWarnings";

// ─── Option lists ─────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Education",
  "Finance & Insurance",
  "Healthcare",
  "Legal",
  "Logistics & Supply Chain",
  "Real Estate",
  "Recruitment & HR",
  "Retail & E-commerce",
  "SaaS / Technology",
  "Travel & Hospitality",
  "Other",
];

const SERVICE_TYPES = [
  "Brand Awareness",
  "Lead Generation",
  "Local Services",
  "Product Sales",
  "Retargeting",
];

const OBJECTIVES = [
  "Increase qualified leads",
  "Grow market share",
  "Launch new product / service",
  "Reduce cost per acquisition",
  "Scale existing campaigns",
];

const BUSINESS_TYPES = ["B2B", "B2C", "B2B2C", "Marketplace", "Other"];

const OFFER_TYPES = [
  "Professional Service",
  "SaaS / Software",
  "Physical Product",
  "Consulting",
  "E-commerce",
  "Digital Product",
  "Other",
];

const AUDIENCE_TYPES = [
  "SMBs",
  "Mid-Market",
  "Enterprise",
  "Consumers",
  "Professionals",
  "Government",
  "Other",
];

const GEO_FOCUS_OPTIONS = ["Local", "National", "Regional", "Global"];

const COUNTRIES = [
  "Australia",
  "Canada",
  "Germany",
  "India",
  "Malaysia",
  "New Zealand",
  "Philippines",
  "Singapore",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
  "Thailand",
];

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  projectName: string;
  website: string;
  industry: string;
  serviceType: string;
  objective: string;
  monthlyBudget: string;
  targetCountries: string[];
  avgDealSize: string;
  closeRate: string;
  lpConversionRate: string;
  sqlRate: string;
  businessType:   string;
  offerType:      string;
  targetAudience: string;
  geoFocus:       string;
}

function toFormState(p?: Partial<Project>): FormState {
  return {
    projectName:      p?.projectName      ?? "",
    website:          p?.website          ?? "",
    industry:         p?.industry         ?? "",
    serviceType:      p?.serviceType      ?? "",
    objective:        p?.objective        ?? "",
    monthlyBudget:    p?.monthlyBudget    != null ? String(p.monthlyBudget)    : "",
    targetCountries:  p?.targetCountries  ?? [],
    avgDealSize:      p?.avgDealSize      != null ? String(p.avgDealSize)      : "",
    closeRate:        p?.closeRate        != null ? String(p.closeRate)        : "",
    lpConversionRate: p?.lpConversionRate != null ? String(p.lpConversionRate) : "",
    sqlRate:          p?.sqlRate          != null ? String(p.sqlRate)          : "50",
    businessType:     p?.businessType     ?? "",
    offerType:        p?.offerType        ?? "",
    targetAudience:   p?.targetAudience   ?? "",
    geoFocus:         p?.geoFocus         ?? "",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
      {children}
      {required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
  );
}

function Input({
  type = "text", placeholder, value, onChange, prefix, suffix,
}: {
  type?: string; placeholder?: string; value: string;
  onChange: (v: string) => void; prefix?: string; suffix?: string;
}) {
  return (
    <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 transition">
      {prefix && (
        <span className="px-3 text-sm text-slate-400 bg-slate-50 border-r border-slate-200 h-full flex items-center py-2.5 select-none">
          {prefix}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 bg-transparent outline-none"
      />
      {suffix && (
        <span className="px-3 text-sm text-slate-400 bg-slate-50 border-l border-slate-200 h-full flex items-center py-2.5 select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Select({ options, placeholder, value, onChange }: {
  options: string[]; placeholder?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition appearance-none cursor-pointer"
    >
      <option value="" disabled>{placeholder ?? "Select…"}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function CountryPills({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (c: string) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  return (
    <div className="flex flex-wrap gap-2">
      {COUNTRIES.map((c) => {
        const active = selected.includes(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => toggle(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              active
                ? "bg-brand-500 border-brand-500 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-brand-500 hover:text-brand-500"
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function FieldHint({ issue }: { issue: FormFieldIssue | undefined }) {
  if (!issue) return null;
  const isError = issue.level === "error";
  return (
    <p className={`mt-1.5 text-xs leading-relaxed flex items-start gap-1.5 ${isError ? "text-rose-600" : "text-amber-600"}`}>
      <span className="shrink-0 mt-px">{isError ? "✕" : "⚠"}</span>
      {issue.message}
    </p>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">{children}</div>
    </div>
  );
}

function FullWidth({ children }: { children: React.ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProjectFormProps {
  /** Pre-fill values (pass the existing Project when editing). */
  initialValues?: Partial<Project>;
  /** Called when the form is submitted with validated data. */
  onSubmit: (draft: ProjectDraft) => void;
  /** Label shown on the submit buttons. */
  submitLabel: string;
  /** Page-level title. */
  title: string;
  /** Page-level subtitle. */
  subtitle: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjectForm({
  initialValues,
  onSubmit,
  submitLabel,
  title,
  subtitle,
}: ProjectFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues));
  const [saved, setSaved] = useState(false);

  const set = (key: keyof FormState) => (value: string | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isValid = form.projectName.trim() !== "" && form.targetCountries.length > 0;

  const fieldIssues = useMemo(() => validateFormInputs({
    monthlyBudget:    parseFloat(form.monthlyBudget)    || 0,
    lpConversionRate: parseFloat(form.lpConversionRate) || 0,
    closeRate:        parseFloat(form.closeRate)        || 0,
    avgDealSize:      parseFloat(form.avgDealSize)      || 0,
    sqlRate:          parseFloat(form.sqlRate)          || 0,
    targetCountries:  form.targetCountries,
  }), [form.monthlyBudget, form.lpConversionRate, form.closeRate, form.avgDealSize, form.sqlRate, form.targetCountries]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const draft: ProjectDraft = {
      projectName:      form.projectName.trim(),
      website:          form.website.trim(),
      industry:         form.industry,
      serviceType:      form.serviceType,
      objective:        form.objective,
      monthlyBudget:    parseFloat(form.monthlyBudget)    || 5000,
      targetCountries:  form.targetCountries,
      avgDealSize:      parseFloat(form.avgDealSize)      || 10000,
      closeRate:        parseFloat(form.closeRate)        || 20,
      lpConversionRate: parseFloat(form.lpConversionRate) || 3.5,
      sqlRate:          parseFloat(form.sqlRate)          || 50,
      businessType:     form.businessType,
      offerType:        form.offerType,
      targetAudience:   form.targetAudience,
      geoFocus:         form.geoFocus,
    };

    onSubmit(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
            <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
          </div>
          <button
            type="submit"
            disabled={!isValid}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm self-start sm:self-auto"
          >
            {saved ? "✓ Saved!" : submitLabel}
          </button>
        </div>

        {/* Section 1 — Project basics */}
        <SectionCard title="Project Details">
          <FullWidth>
            <Label required>Project Name</Label>
            <Input
              placeholder="e.g. Q3 Singapore Lead Gen"
              value={form.projectName}
              onChange={set("projectName")}
            />
          </FullWidth>

          <div>
            <Label>Website</Label>
            <Input
              placeholder="https://yoursite.com"
              value={form.website}
              onChange={set("website")}
              prefix="🌐"
            />
          </div>

          <div>
            <Label>Industry</Label>
            <Select
              options={INDUSTRIES}
              placeholder="Select industry"
              value={form.industry}
              onChange={set("industry")}
            />
          </div>

          <div>
            <Label>Service Type</Label>
            <Select
              options={SERVICE_TYPES}
              placeholder="Select service type"
              value={form.serviceType}
              onChange={set("serviceType")}
            />
          </div>

          <div>
            <Label>Campaign Objective</Label>
            <Select
              options={OBJECTIVES}
              placeholder="Select objective"
              value={form.objective}
              onChange={set("objective")}
            />
          </div>
        </SectionCard>

        {/* Section 2 — Business classification */}
        <SectionCard title="Business Classification">
          <div>
            <Label>Business Type</Label>
            <Select
              options={BUSINESS_TYPES}
              placeholder="Select business type"
              value={form.businessType}
              onChange={set("businessType")}
            />
            <p className="text-xs text-slate-400 mt-1.5">Used to score keyword relevance for your business model.</p>
          </div>

          <div>
            <Label>Offer Type</Label>
            <Select
              options={OFFER_TYPES}
              placeholder="Select offer type"
              value={form.offerType}
              onChange={set("offerType")}
            />
          </div>

          <div>
            <Label>Target Audience</Label>
            <Select
              options={AUDIENCE_TYPES}
              placeholder="Select target audience"
              value={form.targetAudience}
              onChange={set("targetAudience")}
            />
          </div>

          <div>
            <Label>Geo Focus</Label>
            <Select
              options={GEO_FOCUS_OPTIONS}
              placeholder="Select geographic focus"
              value={form.geoFocus}
              onChange={set("geoFocus")}
            />
            <p className="text-xs text-slate-400 mt-1.5">Local boosts geo-intent keywords; Global dampens them.</p>
          </div>
        </SectionCard>

        {/* Section 3 — Budget & markets */}
        <SectionCard title="Budget & Markets">
          <div>
            <Label required>Monthly Budget</Label>
            <Input
              type="number"
              placeholder="5000"
              value={form.monthlyBudget}
              onChange={set("monthlyBudget")}
              prefix="$"
              suffix="/ mo"
            />
            <FieldHint issue={fieldIssues.monthlyBudget} />
          </div>

          <FullWidth>
            <Label required>Target Countries</Label>
            <CountryPills
              selected={form.targetCountries}
              onChange={set("targetCountries") as (v: string[]) => void}
            />
            {form.targetCountries.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">Select at least one country.</p>
            )}
          </FullWidth>
        </SectionCard>

        {/* Section 4 — Performance assumptions */}
        <SectionCard title="Performance Assumptions">
          <div>
            <Label>Average Deal Size</Label>
            <Input
              type="number"
              placeholder="10000"
              value={form.avgDealSize}
              onChange={set("avgDealSize")}
              prefix="$"
            />
            <FieldHint issue={fieldIssues.avgDealSize} />
          </div>

          <div>
            <Label>Close Rate</Label>
            <Input
              type="number"
              placeholder="20"
              value={form.closeRate}
              onChange={set("closeRate")}
              suffix="%"
            />
            <FieldHint issue={fieldIssues.closeRate} />
          </div>

          <div>
            <Label>Landing Page Conversion Rate</Label>
            <Input
              type="number"
              placeholder="3.5"
              value={form.lpConversionRate}
              onChange={set("lpConversionRate")}
              suffix="%"
            />
            <FieldHint issue={fieldIssues.lpConversionRate} />
          </div>

          <div>
            <Label>SQL Rate</Label>
            <Input
              type="number"
              placeholder="50"
              value={form.sqlRate}
              onChange={set("sqlRate")}
              suffix="% of leads"
            />
            <FieldHint issue={fieldIssues.sqlRate} />
          </div>
        </SectionCard>

        {/* Footer save */}
        <div className="flex justify-end pb-4">
          <button
            type="submit"
            disabled={!isValid}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {saved ? "✓ Saved!" : submitLabel}
          </button>
        </div>

      </div>
    </form>
  );
}
