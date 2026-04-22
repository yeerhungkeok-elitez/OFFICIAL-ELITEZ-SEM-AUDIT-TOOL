// ─── CSV Export Utilities ─────────────────────────────────────────────────────
// Client-side CSV generation and download helpers.
// Import the specific export function you need in each page.

import type { EnrichedWorkspaceKeyword, KeywordCategory } from "@/lib/keywordLibrary";
import type { CountryForecast } from "@/lib/keywordEngine";
import type { Campaign, AdGroup } from "@/lib/campaignStore";
import type { NegativeKeyword } from "@/lib/negativeKeywordStore";
import { isKeywordSuppressed } from "@/lib/negativeKeywordStore";
import type { SnapshotKeyword, SnapshotCountryForecast } from "@/lib/snapshotStore";

// ─── Category labels (mirrors dashboard) ─────────────────────────────────────

const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  brand:           "Brand",
  commercial:      "Commercial",
  purchase:        "Purchase Intent",
  "problem-aware": "Problem-Aware",
  comparison:      "Comparison",
  competitor:      "Competitor",
  informational:   "Informational",
  local:           "Local",
  urgent:          "Urgent",
};

// ─── Core helpers ─────────────────────────────────────────────────────────────

function csvEscape(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const header = headers.map(csvEscape).join(",");
  const body   = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function buildFileName(projectName: string, suffix: string): string {
  const slug = (projectName || "export").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `elitez-${slug}-${suffix}-${date}.csv`;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Keyword export (used by /keywords) ──────────────────────────────────────
// Exports the currently filtered + enriched keyword list.

export function exportKeywordsCsv(
  keywords:    EnrichedWorkspaceKeyword[],
  campaigns:   Campaign[],
  adGroups:    AdGroup[],
  negativeKws: NegativeKeyword[],
  projectName: string,
): void {
  const campMap    = new Map(campaigns.map((c) => [c.id, c.name]));
  const adGrpMap   = new Map(adGroups.map((g) => [g.id, g.name]));

  const headers = [
    "Keyword",
    "Country",
    "Category",
    "Campaign",
    "Ad Group",
    "Base Match Type",
    "Effective Match Type",
    "Action",
    "Budget ($)",
    "Est. Clicks",
    "Est. Conversions",
    "CPA ($)",
    "Revenue ($)",
    "Opportunity Score",
    "Intent",
    "Competition",
    "Monthly Searches",
    "Suggested CPC ($)",
    "Suppressed",
    "Excluded",
    "Source",
  ];

  const rows = keywords.map((kw) => {
    const suppressed = negativeKws.length > 0
      ? isKeywordSuppressed(kw.keyword, kw.campaignId, kw.adGroupId, negativeKws)
      : false;

    return [
      kw.keyword,
      kw.country,
      CATEGORY_LABELS[kw.category] ?? kw.category,
      kw.campaignId  ? (campMap.get(kw.campaignId)  ?? kw.campaignId)  : "",
      kw.adGroupId   ? (adGrpMap.get(kw.adGroupId)  ?? kw.adGroupId)   : "",
      kw.matchType,
      kw.effectiveMatchType,
      kw.effectiveAction,
      kw.suggestedMonthlyBudget > 0 ? kw.suggestedMonthlyBudget : 0,
      kw.estimatedClicks  > 0 ? kw.estimatedClicks  : 0,
      kw.estimatedLeads   > 0 ? kw.estimatedLeads   : 0,
      kw.estimatedCpl     > 0 ? kw.estimatedCpl     : 0,
      kw.revenuePotential > 0 ? kw.revenuePotential : 0,
      kw.opportunityScore,
      kw.intent,
      kw.competition,
      kw.monthlySearches,
      kw.suggestedCpc.toFixed(2),
      suppressed ? "Yes" : "No",
      kw.exclude  ? "Yes" : "No",
      kw.source,
    ];
  });

  downloadCsv(
    buildFileName(projectName, "keywords"),
    buildCsv(headers, rows),
  );
}

// ─── Country forecast export (used by /forecast) ─────────────────────────────

export function exportForecastCsv(
  forecasts:   CountryForecast[],
  projectName: string,
  scenario:    string,
): void {
  const headers = [
    "Country",
    "Scenario",
    "Budget ($)",
    "Buy Budget ($)",
    "Test Budget ($)",
    "Est. Clicks",
    "Est. Leads",
    "CPL ($)",
    "SQL",
    "Est. Deals",
    "Revenue ($)",
    "Priority",
  ];

  const rows = forecasts.map((c) => [
    c.country,
    scenario,
    c.budget,
    c.buyBudget,
    c.testBudget,
    c.clicks,
    c.leads,
    c.cpl  > 0 ? c.cpl  : 0,
    c.sql,
    c.deals,
    c.revenue > 0 ? c.revenue : 0,
    c.priority,
  ]);

  downloadCsv(
    buildFileName(projectName, "forecast"),
    buildCsv(headers, rows),
  );
}

// ─── Campaign summary export (used by dashboard) ──────────────────────────────

export interface CampaignSummaryRow {
  name:     string;
  budget:   number;
  pctTotal: number;
  kwCount:  number;
  leads:    number;
  cpa:      number;
  revenue:  number;
}

export function exportCampaignSummaryCsv(
  rows:        CampaignSummaryRow[],
  projectName: string,
  scenario:    string,
): void {
  const headers = [
    "Campaign",
    "Scenario",
    "Budget ($)",
    "% of Total Budget",
    "Keywords",
    "Est. Conversions",
    "CPA ($)",
    "Revenue ($)",
  ];

  const csvRows = rows.map((r) => [
    r.name,
    scenario,
    r.budget,
    r.pctTotal,
    r.kwCount,
    r.leads,
    r.cpa    > 0 ? r.cpa    : 0,
    r.revenue > 0 ? r.revenue : 0,
  ]);

  downloadCsv(
    buildFileName(projectName, "campaign-summary"),
    buildCsv(headers, csvRows),
  );
}

// ─── Snapshot exports (used by /snapshots/[id]) ───────────────────────────────

export function exportSnapshotKeywordsCsv(
  keywords:     SnapshotKeyword[],
  snapshotTitle: string,
  projectName:  string,
): void {
  const headers = [
    "Keyword",
    "Country",
    "Action",
    "Intent",
    "Opportunity Score",
    "Suggested CPC ($)",
    "Budget ($)",
    "Est. Clicks",
    "Est. Conversions",
    "CPL ($)",
    "Revenue ($)",
  ];

  const rows = keywords.map((kw) => [
    kw.keyword,
    kw.country,
    kw.action,
    kw.intent,
    kw.opportunityScore,
    kw.suggestedCpc.toFixed(2),
    kw.suggestedMonthlyBudget > 0 ? kw.suggestedMonthlyBudget : 0,
    kw.estimatedClicks  > 0 ? kw.estimatedClicks  : 0,
    kw.estimatedLeads   > 0 ? kw.estimatedLeads   : 0,
    kw.estimatedCpl     > 0 ? kw.estimatedCpl     : 0,
    kw.revenuePotential > 0 ? kw.revenuePotential : 0,
  ]);

  const slug = snapshotTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 30);
  downloadCsv(
    buildFileName(projectName, `snapshot-${slug}-keywords`),
    buildCsv(headers, rows),
  );
}

export function exportSnapshotForecastCsv(
  forecasts:     SnapshotCountryForecast[],
  totalBudget:   number,
  snapshotTitle: string,
  projectName:   string,
): void {
  const headers = [
    "Country",
    "Budget ($)",
    "% of Total",
    "Buy Budget ($)",
    "Test Budget ($)",
    "Est. Clicks",
    "Est. Leads",
    "CPL ($)",
    "SQL",
    "Est. Deals",
    "Revenue ($)",
    "Priority",
  ];

  const rows = forecasts.map((c) => [
    c.country,
    c.budget,
    totalBudget > 0 ? Math.round((c.budget / totalBudget) * 100) : 0,
    c.buyBudget,
    c.testBudget,
    c.clicks,
    c.leads,
    c.cpl   > 0 ? c.cpl   : 0,
    c.sql,
    c.deals,
    c.revenue > 0 ? c.revenue : 0,
    c.priority,
  ]);

  const slug = snapshotTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 30);
  downloadCsv(
    buildFileName(projectName, `snapshot-${slug}-forecast`),
    buildCsv(headers, rows),
  );
}
