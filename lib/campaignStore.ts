// ─── Campaign / Ad Group Store ────────────────────────────────────────────────
// localStorage store for campaign and ad group definitions.
// Keywords reference campaignId / adGroupId by ID (optional — undefined = unassigned).

import type { MatchType } from "@/lib/keywordEngine";

// ─── Campaign type ────────────────────────────────────────────────────────────

export type CampaignType = "brand" | "generic" | "high-intent" | "competitor" | "pricing" | "local" | "niche" | "custom";

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  brand:         "Brand",
  generic:       "Generic",
  "high-intent": "High Intent",
  competitor:    "Competitor",
  pricing:       "Pricing / Cost",
  local:         "Local / Near Me",
  niche:         "Niche / Service",
  custom:        "Custom",
};

export const CAMPAIGN_TYPE_DESCRIPTIONS: Record<CampaignType, string> = {
  brand:         "Protect your brand SERP and capture bottom-funnel branded searches.",
  generic:       "Mid-funnel category keywords for buyers comparing solutions.",
  "high-intent": "Bottom-funnel buyers ready to act — high CPC, high conversion.",
  competitor:    "Displace competitor traffic and capture comparison searches.",
  pricing:       "Capture cost-conscious buyers searching for pricing, rates, and value.",
  local:         "Geo-qualified buyers with city or 'near me' purchase intent.",
  niche:         "Vertically focused searchers by service type, industry, or use case.",
  custom:        "Build your own keyword set from scratch.",
};

export const CAMPAIGN_TYPE_STYLES: Record<CampaignType, { badge: string; dot: string }> = {
  brand:         { badge: "bg-violet-900/60 text-violet-300 border-violet-700",   dot: "bg-violet-400" },
  generic:       { badge: "bg-blue-900/60 text-blue-300 border-blue-700",         dot: "bg-blue-400" },
  "high-intent": { badge: "bg-emerald-900/60 text-emerald-300 border-emerald-700", dot: "bg-emerald-400" },
  competitor:    { badge: "bg-orange-900/60 text-orange-300 border-orange-700",   dot: "bg-orange-400" },
  pricing:       { badge: "bg-yellow-900/60 text-yellow-300 border-yellow-700",   dot: "bg-yellow-400" },
  local:         { badge: "bg-teal-900/60 text-teal-300 border-teal-700",         dot: "bg-teal-400" },
  niche:         { badge: "bg-pink-900/60 text-pink-300 border-pink-700",         dot: "bg-pink-400" },
  custom:        { badge: "bg-slate-800 text-slate-300 border-slate-600",         dot: "bg-slate-400" },
};

export type AdGroupType =
  | "brand"
  | "generic"
  | "competitor"
  | "problem"
  | "pricing"
  | "local"
  | "service"
  | "industry"
  | "custom";

export const AD_GROUP_TYPE_LABELS: Record<AdGroupType, string> = {
  brand:      "Brand",
  generic:    "Generic / Commercial",
  competitor: "Competitor",
  problem:    "Problem / Need-State",
  pricing:    "Pricing / Cost",
  local:      "Local / Near Me",
  service:    "Service / Use Case",
  industry:   "Industry / Niche",
  custom:     "Custom",
};

export const AD_GROUP_TYPES = Object.keys(AD_GROUP_TYPE_LABELS) as AdGroupType[];

/** Suggested starter ad groups per campaign type. */
export const CAMPAIGN_TYPE_AD_GROUP_SUGGESTIONS: Record<CampaignType, Array<{ name: string; groupType: AdGroupType }>> = {
  brand: [
    { name: "Brand Exact",       groupType: "brand" },
    { name: "Brand + Modifier",  groupType: "brand" },
  ],
  generic: [
    { name: "Core Service",         groupType: "service" },
    { name: "Features & Benefits",  groupType: "generic" },
    { name: "Problem / Need-State", groupType: "problem" },
  ],
  "high-intent": [
    { name: "Buy Now",        groupType: "generic" },
    { name: "Quote & Pricing", groupType: "pricing" },
    { name: "Urgent",          groupType: "custom" },
  ],
  competitor: [
    { name: "Competitor Names",    groupType: "competitor" },
    { name: "Competitor vs. Brand", groupType: "competitor" },
  ],
  pricing: [
    { name: "Pricing & Rates",  groupType: "pricing" },
    { name: "Budget / Value",   groupType: "generic" },
  ],
  local: [
    { name: "City Geo",  groupType: "local" },
    { name: "Near Me",   groupType: "local" },
  ],
  niche: [
    { name: "Service Type",      groupType: "service" },
    { name: "Industry Vertical", groupType: "industry" },
  ],
  custom: [],
};

export interface Campaign {
  id:                  string;
  name:                string;
  campaignType?:       CampaignType;
  budgetMode:          "auto" | "manual";  // "auto" = proportional by opp score; "manual" = fixed amount
  budgetAmount?:       number;             // only meaningful when budgetMode === "manual"
  defaultMatchType?:   MatchType;          // default match type for all keywords in this campaign
  excludeFromForecast: boolean;
  createdAt:           string;
  // User-controlled keyword generation inputs (stored so they can be edited later)
  keywordBase?:        string;             // comma-separated services, e.g. "EOR, Headhunting"
  targetActions?:      string;             // comma-separated intents, e.g. "hire, need, find"
  competitors?:        string;             // comma-separated competitor names
}

export interface AdGroup {
  id:                  string;
  campaignId:          string;
  name:                string;
  groupType:           AdGroupType;
  defaultMatchType?:   MatchType | "inherit"; // "inherit" = use campaign default
  excludeFromForecast: boolean;
  createdAt:           string;
}

// ─── localStorage keys ────────────────────────────────────────────────────────

const CAMPAIGNS_KEY  = "elitez_campaigns";
const AD_GROUPS_KEY  = "elitez_ad_groups";

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Campaign CRUD ────────────────────────────────────────────────────────────

export function getCampaigns(): Campaign[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) ?? "[]"); } catch { return []; }
}

export function saveCampaigns(list: Campaign[]): void {
  if (typeof window !== "undefined") localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(list));
}

export function createCampaign(
  name:          string,
  campaignType?: CampaignType,
  extras?:       { keywordBase?: string; targetActions?: string; competitors?: string },
): Campaign {
  const c: Campaign = {
    id:                  uid(),
    name:                name.trim(),
    campaignType,
    budgetMode:          "auto",
    excludeFromForecast: false,
    createdAt:           new Date().toISOString(),
    ...extras,
  };
  const list = getCampaigns();
  list.push(c);
  saveCampaigns(list);
  return c;
}

export function updateCampaign(id: string, patch: Partial<Pick<Campaign, "name" | "campaignType" | "budgetMode" | "budgetAmount" | "defaultMatchType" | "excludeFromForecast" | "keywordBase" | "targetActions" | "competitors">>): void {
  saveCampaigns(getCampaigns().map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function deleteCampaign(id: string): void {
  saveCampaigns(getCampaigns().filter((c) => c.id !== id));
  saveAdGroups(getAdGroups().filter((g) => g.campaignId !== id));
}

// ─── Ad Group CRUD ────────────────────────────────────────────────────────────

export function getAdGroups(): AdGroup[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(AD_GROUPS_KEY) ?? "[]"); } catch { return []; }
}

export function saveAdGroups(list: AdGroup[]): void {
  if (typeof window !== "undefined") localStorage.setItem(AD_GROUPS_KEY, JSON.stringify(list));
}

export function createAdGroup(campaignId: string, name: string, groupType: AdGroupType): AdGroup {
  const g: AdGroup = {
    id: uid(),
    campaignId,
    name:                name.trim(),
    groupType,
    excludeFromForecast: false,
    createdAt:           new Date().toISOString(),
  };
  const list = getAdGroups();
  list.push(g);
  saveAdGroups(list);
  return g;
}

export function updateAdGroup(id: string, patch: Partial<Pick<AdGroup, "name" | "groupType" | "defaultMatchType" | "excludeFromForecast">>): void {
  saveAdGroups(getAdGroups().map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export function deleteAdGroup(id: string): void {
  saveAdGroups(getAdGroups().filter((g) => g.id !== id));
}
