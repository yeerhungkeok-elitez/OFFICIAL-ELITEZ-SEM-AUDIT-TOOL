// ─── Keyword Library ──────────────────────────────────────────────────────────
// localStorage store for user-added keywords (custom + preset packs) and
// per-keyword overrides (exclude / force-buy / force-test) for system keywords.

import type {
  Action, Intent, MatchType, Competition,
  CompetitorPressure, AdCrowdingLevel, CompetitiveDifficulty,
  Keyword,
} from "@/lib/keywordEngine";
import type { ProjectAssumptions } from "@/lib/projectStore";

// ─── Primitive types ──────────────────────────────────────────────────────────

export type KeywordSource = "system" | "custom" | "preset" | "generated" | "recommended" | "imported";

/** Universal intent / strategic category — used for classification and relevance scoring. */
export type KeywordCategory =
  | "brand"
  | "commercial"
  | "purchase"
  | "problem-aware"
  | "comparison"
  | "competitor"
  | "informational"
  | "local"
  | "urgent";

// ─── Project context (for relevance scoring) ──────────────────────────────────

export interface ProjectContext {
  industry:       string;
  businessType:   string;   // "B2B" | "B2C" | "B2B2C" | ...
  offerType:      string;   // "SaaS" | "Professional Service" | ...
  targetAudience: string;   // "SMBs" | "Enterprise" | ...
  geoFocus:       string;   // "Local" | "National" | "Regional" | "Global"
}

// ─── Stored types ─────────────────────────────────────────────────────────────

/** A user-created or preset-pack keyword stored in localStorage. */
export interface LibraryKeyword {
  id:                     number;    // unique, starts at 10000
  source:                 "custom" | "preset" | "generated" | "recommended" | "imported";
  packName:               string;    // preset pack name, or "" for custom
  category:               KeywordCategory;
  note:                   string;
  createdAt:              string;

  // Campaign / Ad Group assignment (optional — undefined means unassigned)
  campaignId?:            string;
  adGroupId?:             string;
  // Simplified bucket tag set by the recommend workflow (brand|generic|highIntent|competitor|pricing|local).
  // Used by forecast grouping when no real campaignId is assigned.
  campaignGroup?:         string;

  // All base Keyword fields (country is wider than the 4-value Country enum)
  keyword:                string;
  country:                string;
  intent:                 Intent;
  matchType:              MatchType;
  // When set, overrides campaign/ad-group default for this keyword.
  // undefined = auto-resolve from parent (adGroup → campaign → own matchType).
  matchTypeStrategy?:     MatchType;
  monthlySearches:        number;
  competition:            Competition;
  estimatedCpc:           number;
  suggestedCpc:           number;
  opportunityScore:       number;
  action:                 Action;
  competitorPressure:     CompetitorPressure;
  competitorPressureScore: number;
  adCrowdingLevel:        AdCrowdingLevel;
  competitiveDifficulty:  CompetitiveDifficulty;
  competitorExamples:     string[];
  strategyNote:           string;
  recommendationNote:     string;

  // Override state
  exclude:   boolean;
  forceBuy:  boolean;
  forceTest: boolean;
}

/** Row-level override for a system keyword. */
export interface SystemOverride {
  id:        number;
  exclude:   boolean;
  forceBuy:  boolean;
  forceTest: boolean;
}

// ─── Merged workspace keyword ─────────────────────────────────────────────────

/** All keyword fields + source/category metadata + override state. Used by /keywords page. */
export interface WorkspaceKeyword {
  id:                     number;
  source:                 KeywordSource;
  category:               KeywordCategory;
  note:                   string;
  packName:               string;
  isLibrary:              boolean;

  campaignId?:            string;
  adGroupId?:             string;
  campaignGroup?:         string;

  exclude:                boolean;
  forceBuy:               boolean;
  forceTest:              boolean;
  effectiveAction:        Action;

  // Resolved match type after applying campaign/adGroup/keyword-level hierarchy.
  effectiveMatchType:     MatchType;
  matchTypeInherited:     boolean; // true when effectiveMatchType came from adGroup or campaign

  keyword:                string;
  country:                string;
  intent:                 Intent;
  matchType:              MatchType;
  monthlySearches:        number;
  competition:            Competition;
  estimatedCpc:           number;
  suggestedCpc:           number;
  opportunityScore:       number;
  action:                 Action;
  competitorPressure:     CompetitorPressure;
  competitorPressureScore: number;
  adCrowdingLevel:        AdCrowdingLevel;
  competitiveDifficulty:  CompetitiveDifficulty;
  competitorExamples:     string[];
  strategyNote:           string;
  recommendationNote:     string;
}

/** WorkspaceKeyword with forecast + relevance fields added. */
export interface EnrichedWorkspaceKeyword extends WorkspaceKeyword {
  suggestedMonthlyBudget: number;
  estimatedClicks:        number;
  estimatedLeads:         number;
  estimatedCpl:           number;
  revenuePotential:       number;
  roas:                   number;
  businessRelevanceScore: number;
  // Debug / transparency fields from the forecast engine
  estimatedImpressions?:  number;
  estimatedCtr?:          number;
  estimatedCvr?:          number;
}

// ─── Countries list (for dropdowns) ──────────────────────────────────────────

export const LIBRARY_COUNTRIES = [
  "Singapore", "Malaysia", "Vietnam", "Thailand", "Indonesia",
  "Australia", "Canada", "Germany", "India",
  "New Zealand", "Philippines", "United Arab Emirates",
  "United Kingdom", "United States",
] as const;

// ─── Business relevance scoring ───────────────────────────────────────────────

/**
 * Scores how relevant a keyword is to a specific business context (0–100).
 * Higher = more strategically aligned. Does not affect budget allocation math.
 */
export function computeBusinessRelevance(
  category:    KeywordCategory,
  kwIntent:    Intent,
  competition: Competition,
  ctx:         ProjectContext,
): number {
  let score = 50; // neutral baseline

  const offer  = ctx.offerType.toLowerCase();
  const biz    = ctx.businessType.toLowerCase();
  const geo    = ctx.geoFocus.toLowerCase();
  const aud    = ctx.targetAudience.toLowerCase();

  // ── Search intent alignment ───────────────────────────────────────────────
  if      (kwIntent === "Transactional") score += 15;
  else if (kwIntent === "Commercial")    score += 8;
  else if (kwIntent === "Navigational")  score += 5;
  // Informational: neutral

  // ── Category × business context ───────────────────────────────────────────
  if (category === "brand") {
    score += 8; // brand defence is always valuable
  }

  if (category === "commercial") {
    if (biz.includes("b2b"))                                          score += 12;
    if (offer.includes("service") || offer.includes("consulting"))    score += 8;
    if (offer.includes("saas"))                                       score += 6;
  }

  if (category === "purchase") {
    if (offer.includes("e-commerce") || offer.includes("product"))   score += 18;
    else if (biz.includes("b2c"))                                     score += 12;
    else if (offer.includes("saas"))                                  score += 8;
    else                                                              score += 4;
  }

  if (category === "problem-aware") {
    if (biz.includes("b2b"))  score += 10;
    else                       score += 5;
  }

  if (category === "comparison") {
    score += 5; // generally useful
    if (competition === "High") score += 6;
  }

  if (category === "competitor") {
    score += 5;
    if (competition === "High") score += 8;
    if (biz.includes("b2b"))    score += 4;
  }

  if (category === "informational") {
    if (biz.includes("b2b")) score += 6; // content marketing / pipeline value
    else                      score -= 5; // lower direct conversion value for B2C
  }

  if (category === "local") {
    if      (geo === "local")    score += 22;
    else if (geo === "national") score += 4;
    else if (geo === "global")   score -= 14;
  }

  if (category === "urgent") {
    if (offer.includes("service") || offer.includes("consulting")) score += 14;
    else if (biz.includes("b2c"))                                   score += 8;
    else                                                            score += 4;
  }

  // ── Audience alignment ────────────────────────────────────────────────────
  if (aud.includes("consumer") && category === "purchase")    score += 8;
  if (aud.includes("enterprise") && category === "commercial") score += 5;
  if (aud.includes("smb") && category === "commercial")        score += 4;

  return Math.max(10, Math.min(100, Math.round(score)));
}

// ─── Derived field helpers ────────────────────────────────────────────────────

export function deriveCompetitorPressure(score: number): CompetitorPressure {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function deriveAdCrowding(competition: Competition): AdCrowdingLevel {
  return competition;
}

function deriveCompetitiveDifficulty(
  competition: Competition,
  pressureScore: number
): CompetitiveDifficulty {
  if (competition === "High" || pressureScore >= 70) return "Hard";
  if (competition === "Low" && pressureScore < 40)   return "Easy";
  return "Moderate";
}

function deriveOpportunityScore(
  intent: Intent,
  competition: Competition,
  pressureScore: number
): number {
  let base = 60;
  if (intent === "Transactional") base += 20;
  else if (intent === "Commercial") base += 10;
  else if (intent === "Informational") base -= 10;
  if (competition === "Low") base += 10;
  else if (competition === "High") base -= 15;
  if (pressureScore < 40) base += 5;
  else if (pressureScore >= 70) base -= 10;
  return Math.max(10, Math.min(100, base));
}

function deriveAction(opportunityScore: number): Action {
  if (opportunityScore >= 75) return "Buy";
  if (opportunityScore >= 55) return "Test";
  return "No";
}

/** Compute all derived fields from user-supplied inputs. */
export function deriveKeywordFields(input: {
  intent: Intent;
  competition: Competition;
  competitorPressureScore: number;
  estimatedCpc: number;
}): {
  suggestedCpc:           number;
  opportunityScore:       number;
  action:                 Action;
  competitorPressure:     CompetitorPressure;
  adCrowdingLevel:        AdCrowdingLevel;
  competitiveDifficulty:  CompetitiveDifficulty;
} {
  const opportunityScore      = deriveOpportunityScore(input.intent, input.competition, input.competitorPressureScore);
  const competitorPressure    = deriveCompetitorPressure(input.competitorPressureScore);
  const adCrowdingLevel       = deriveAdCrowding(input.competition);
  const competitiveDifficulty = deriveCompetitiveDifficulty(input.competition, input.competitorPressureScore);
  return {
    suggestedCpc:          Number((input.estimatedCpc * 1.1).toFixed(2)),
    opportunityScore,
    action:                deriveAction(opportunityScore),
    competitorPressure,
    adCrowdingLevel,
    competitiveDifficulty,
  };
}

// ─── Intent → Category mapping (for system keywords) ─────────────────────────

function intentToCategory(intent: Intent): KeywordCategory {
  switch (intent) {
    case "Navigational":  return "brand";
    case "Commercial":    return "commercial";
    case "Transactional": return "purchase";
    default:              return "informational";
  }
}

// ─── Generic preset packs ─────────────────────────────────────────────────────
// Keywords use {} placeholders to indicate text that should be customised.
// The numeric data (CPC, competition, etc.) reflects realistic SEM benchmarks
// for the intent category. Edit keyword text after adding a pack.

interface PresetKeywordTemplate {
  keyword:                string;
  country:                string;
  intent:                 Intent;
  matchType:              MatchType;
  monthlySearches:        number;
  competition:            Competition;
  estimatedCpc:           number;
  competitorPressureScore: number;
  strategyNote:           string;
}

interface PresetPack {
  name:        string;
  category:    KeywordCategory;
  description: string;
  keywords:    PresetKeywordTemplate[];
}

export const PRESET_PACKS: PresetPack[] = [
  {
    name:        "Brand Defense",
    category:    "brand",
    description: "Protect your brand SERP. Captures bottom-funnel searchers already aware of you. Edit {} placeholders to match your brand name.",
    keywords: [
      { keyword: "{brand-name}",                country: "Singapore", intent: "Navigational",  matchType: "Exact",  monthlySearches: 320,  competition: "Low",    estimatedCpc: 1.50, competitorPressureScore: 8,  strategyNote: "Replace {brand-name}. Core brand defence — exact match, always-on, low CPC." },
      { keyword: "{brand-name} reviews",        country: "Singapore", intent: "Navigational",  matchType: "Phrase", monthlySearches: 180,  competition: "Low",    estimatedCpc: 1.80, competitorPressureScore: 12, strategyNote: "Capture review searchers in decision stage. Route to testimonials / case studies page." },
      { keyword: "{brand-name} pricing",        country: "Singapore", intent: "Commercial",    matchType: "Exact",  monthlySearches: 140,  competition: "Low",    estimatedCpc: 2.50, competitorPressureScore: 18, strategyNote: "High-intent pricing query. Route to pricing page with clear CTA." },
      { keyword: "{brand-name} vs competitors", country: "Singapore", intent: "Commercial",    matchType: "Phrase", monthlySearches: 90,   competition: "Medium", estimatedCpc: 3.50, competitorPressureScore: 30, strategyNote: "Comparison query. Lead with your strongest differentiators." },
      { keyword: "{brand-name} alternatives",   country: "Singapore", intent: "Commercial",    matchType: "Phrase", monthlySearches: 70,   competition: "Medium", estimatedCpc: 4.00, competitorPressureScore: 35, strategyNote: "Capture searchers evaluating options. Route to competitive comparison page." },
    ],
  },
  {
    name:        "Commercial Intent",
    category:    "commercial",
    description: "Mid-funnel evaluation queries. Searchers comparing options and vendors. High purchase intent. Replace {} with your service or product category.",
    keywords: [
      { keyword: "best {service} for {audience}",  country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 720,  competition: "High",   estimatedCpc: 6.50, competitorPressureScore: 70, strategyNote: "Top commercial intent query. Lead with social proof, case studies, and response SLA." },
      { keyword: "top {service} companies",         country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 580,  competition: "High",   estimatedCpc: 5.50, competitorPressureScore: 65, strategyNote: "Evaluation-stage search. Differentiate on specialisation and track record." },
      { keyword: "{service} solutions",             country: "Malaysia",  intent: "Commercial", matchType: "Phrase", monthlySearches: 480,  competition: "Medium", estimatedCpc: 4.20, competitorPressureScore: 50, strategyNote: "Broad commercial query. Route to solutions overview page." },
      { keyword: "{service} providers",             country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 620,  competition: "High",   estimatedCpc: 5.00, competitorPressureScore: 62, strategyNote: "High-volume provider search. Emphasise trust signals and past clients." },
      { keyword: "leading {service} {country}",    country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 290,  competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 48, strategyNote: "Geo-modified commercial query. Highlight local presence and in-market experience." },
    ],
  },
  {
    name:        "Purchase Intent",
    category:    "purchase",
    description: "Bottom-funnel, ready-to-buy queries. High CPC but high conversion probability. Replace {} with your specific offer.",
    keywords: [
      { keyword: "buy {product/service}",           country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 390,  competition: "High",   estimatedCpc: 7.00, competitorPressureScore: 72, strategyNote: "Direct purchase intent. Route to offer/pricing page with frictionless CTA." },
      { keyword: "{service} quote",                 country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 520,  competition: "High",   estimatedCpc: 8.00, competitorPressureScore: 76, strategyNote: "Bottom-funnel quote request. Use form with pre-fill to reduce friction." },
      { keyword: "get {service} now",               country: "Malaysia",  intent: "Transactional", matchType: "Phrase", monthlySearches: 280,  competition: "Medium", estimatedCpc: 5.50, competitorPressureScore: 52, strategyNote: "Urgency-driven buyer. Highlight fast onboarding and quick start." },
      { keyword: "{service} cost",                  country: "Singapore", intent: "Transactional", matchType: "Phrase", monthlySearches: 680,  competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 50, strategyNote: "Pricing research with purchase intent. Route to transparent pricing page." },
      { keyword: "hire {service/person}",           country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 440,  competition: "High",   estimatedCpc: 8.50, competitorPressureScore: 80, strategyNote: "Strong transactional intent. Lead with availability, speed, and proof of results." },
    ],
  },
  {
    name:        "Problem-Aware",
    category:    "problem-aware",
    description: "TOFU-to-MOFU queries from searchers who know their pain but haven't decided on a solution type. Good for pipeline building. Replace {} with the problem your offer solves.",
    keywords: [
      { keyword: "how to {solve problem}",          country: "Singapore", intent: "Informational", matchType: "Phrase", monthlySearches: 880,  competition: "Low",    estimatedCpc: 1.80, competitorPressureScore: 18, strategyNote: "TOFU education. Route to pillar content page. Add remarketing pixel." },
      { keyword: "{problem} solution",              country: "Singapore", intent: "Commercial",    matchType: "Phrase", monthlySearches: 460,  competition: "Medium", estimatedCpc: 3.50, competitorPressureScore: 40, strategyNote: "MOFU intent — searcher aware of the problem, open to solutions." },
      { keyword: "struggling with {problem}",       country: "Malaysia",  intent: "Informational", matchType: "Phrase", monthlySearches: 220,  competition: "Low",    estimatedCpc: 1.40, competitorPressureScore: 15, strategyNote: "Pain-point search. Route to empathy-led landing page or guide." },
      { keyword: "{problem} help",                  country: "Singapore", intent: "Commercial",    matchType: "Phrase", monthlySearches: 340,  competition: "Low",    estimatedCpc: 2.60, competitorPressureScore: 24, strategyNote: "Solution-seeking query. Short-form content with soft CTA works well." },
      { keyword: "reduce {problem}",                country: "Singapore", intent: "Commercial",    matchType: "Phrase", monthlySearches: 290,  competition: "Medium", estimatedCpc: 3.20, competitorPressureScore: 32, strategyNote: "Outcome-focused search. Lead with measurable results and benchmarks." },
    ],
  },
  {
    name:        "Comparison / Best-of",
    category:    "comparison",
    description: "Decision-stage queries comparing vendors, tools, or approaches. High commercial value. Replace {} with your service category.",
    keywords: [
      { keyword: "{service} vs {alternative}",     country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 340,  competition: "Medium", estimatedCpc: 5.20, competitorPressureScore: 55, strategyNote: "Comparison query — searcher is narrowing down. Dedicated comparison landing page works best." },
      { keyword: "best {service} {city/region}",   country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 720,  competition: "High",   estimatedCpc: 6.00, competitorPressureScore: 68, strategyNote: "High-intent 'best-of' query. Lead with awards, reviews, and client logos." },
      { keyword: "{service} comparison",           country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 260,  competition: "Medium", estimatedCpc: 4.50, competitorPressureScore: 48, strategyNote: "Side-by-side comparison intent. Feature matrix or comparison table converts well." },
      { keyword: "top {service} tools/companies",  country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 480,  competition: "Medium", estimatedCpc: 4.00, competitorPressureScore: 44, strategyNote: "List-style query. Include on 'top alternatives' page." },
      { keyword: "{service} review",               country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 390,  competition: "Medium", estimatedCpc: 4.20, competitorPressureScore: 46, strategyNote: "Review-stage search. Route to G2 / Trustpilot-linked landing page." },
    ],
  },
  {
    name:        "Competitor Displacement",
    category:    "competitor",
    description: "Capture searchers already using or evaluating a competitor. High purchase intent. Replace {} with specific competitor names.",
    keywords: [
      { keyword: "{competitor} alternative",        country: "Singapore", intent: "Commercial", matchType: "Exact",  monthlySearches: 210,  competition: "Medium", estimatedCpc: 7.20, competitorPressureScore: 62, strategyNote: "Displacement intent. Dedicated '[Competitor] alternative' landing page with clear comparison table." },
      { keyword: "alternatives to {competitor}",   country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 180,  competition: "Medium", estimatedCpc: 6.80, competitorPressureScore: 58, strategyNote: "Phrase variation of competitor displacement. Route to same page as Exact match." },
      { keyword: "{competitor} vs {your-brand}",   country: "Singapore", intent: "Commercial", matchType: "Exact",  monthlySearches: 90,   competition: "Low",    estimatedCpc: 5.00, competitorPressureScore: 38, strategyNote: "Direct comparison query. Lead with strengths your brand has over the competitor." },
      { keyword: "switch from {competitor}",       country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 140,  competition: "Medium", estimatedCpc: 6.20, competitorPressureScore: 52, strategyNote: "Migration intent. Offer migration support, free onboarding, or trial to reduce switch friction." },
      { keyword: "{competitor} pricing",           country: "Singapore", intent: "Commercial", matchType: "Phrase", monthlySearches: 160,  competition: "Medium", estimatedCpc: 5.80, competitorPressureScore: 48, strategyNote: "Price-sensitive comparison. Route to your pricing page and highlight value differences." },
    ],
  },
  {
    name:        "Informational / Educational",
    category:    "informational",
    description: "Top-of-funnel educational queries. Lower CPL, longer sales cycle — but builds pipeline, SEO authority, and remarketing audiences.",
    keywords: [
      { keyword: "what is {concept/service}",       country: "Singapore", intent: "Informational", matchType: "Phrase", monthlySearches: 720,  competition: "Low",  estimatedCpc: 1.80, competitorPressureScore: 12, strategyNote: "TOFU definition query. Route to pillar content. Add remarketing pixel for nurture sequence." },
      { keyword: "how does {service} work",         country: "Singapore", intent: "Informational", matchType: "Phrase", monthlySearches: 480,  competition: "Low",  estimatedCpc: 2.00, competitorPressureScore: 14, strategyNote: "Process explanation intent. Use to build audience segment for bottom-funnel retargeting." },
      { keyword: "{service} guide",                 country: "Malaysia",  intent: "Informational", matchType: "Phrase", monthlySearches: 380,  competition: "Low",  estimatedCpc: 1.50, competitorPressureScore: 10, strategyNote: "Guide/resource intent. Route to downloadable guide gated with email capture." },
      { keyword: "{service} benefits",             country: "Singapore", intent: "Informational", matchType: "Phrase", monthlySearches: 320,  competition: "Low",  estimatedCpc: 2.10, competitorPressureScore: 18, strategyNote: "Benefit-awareness query. Use to build mid-funnel audience." },
      { keyword: "{service} best practices",       country: "Singapore", intent: "Informational", matchType: "Phrase", monthlySearches: 280,  competition: "Low",  estimatedCpc: 1.90, competitorPressureScore: 16, strategyNote: "Professional audience looking to improve. Strong signal for B2B content nurture." },
    ],
  },
  {
    name:        "Local / Geo Intent",
    category:    "local",
    description: "Location-specific queries with high local purchase intent. Best for businesses with physical presence or geo-limited service areas. Replace {} with your city or market.",
    keywords: [
      { keyword: "{service} {city}",               country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 540,  competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 46, strategyNote: "Replace {city} with your target city. Highest local intent query. Route to location-specific landing page." },
      { keyword: "{service} near me",              country: "Singapore", intent: "Transactional", matchType: "Phrase", monthlySearches: 680,  competition: "Medium", estimatedCpc: 4.20, competitorPressureScore: 42, strategyNote: "Mobile-heavy local search. Ensure Google Business Profile is claimed and optimised." },
      { keyword: "local {service}",               country: "Malaysia",  intent: "Transactional", matchType: "Phrase", monthlySearches: 320,  competition: "Low",    estimatedCpc: 2.80, competitorPressureScore: 28, strategyNote: "Broad local intent. Use ad extensions to highlight address and click-to-call." },
      { keyword: "{service} in {city/region}",    country: "Vietnam",   intent: "Transactional", matchType: "Phrase", monthlySearches: 280,  competition: "Low",    estimatedCpc: 1.80, competitorPressureScore: 22, strategyNote: "Regional intent. Emerging markets often have low CPC with growing demand." },
      { keyword: "best {service} in {city}",      country: "Singapore", intent: "Commercial",    matchType: "Phrase", monthlySearches: 440,  competition: "High",   estimatedCpc: 5.50, competitorPressureScore: 60, strategyNote: "Local best-of query. Lead with local awards, reviews, and proximity." },
    ],
  },
  {
    name:        "Urgent / Action Intent",
    category:    "urgent",
    description: "Time-sensitive queries from buyers who need a solution now. High CPC but very high conversion rate. Best for service businesses.",
    keywords: [
      { keyword: "{service} urgent",               country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 180,  competition: "Low",    estimatedCpc: 5.20, competitorPressureScore: 38, strategyNote: "Urgency-driven query. Highlight fast response time and same-day availability." },
      { keyword: "same day {service}",             country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 140,  competition: "Medium", estimatedCpc: 6.00, competitorPressureScore: 50, strategyNote: "Speed-first search. Use countdown timers or 'available today' messaging if applicable." },
      { keyword: "emergency {service}",            country: "Singapore", intent: "Transactional", matchType: "Exact",  monthlySearches: 160,  competition: "Medium", estimatedCpc: 5.80, competitorPressureScore: 46, strategyNote: "Crisis-mode buyer. 24/7 availability messaging and direct phone CTA perform well." },
      { keyword: "{service} immediately",          country: "Malaysia",  intent: "Transactional", matchType: "Phrase", monthlySearches: 120,  competition: "Low",    estimatedCpc: 4.50, competitorPressureScore: 34, strategyNote: "Immediate-need search. Low competition in many markets — high ROI opportunity." },
      { keyword: "fast {service} {city}",          country: "Singapore", intent: "Transactional", matchType: "Phrase", monthlySearches: 200,  competition: "Medium", estimatedCpc: 5.00, competitorPressureScore: 42, strategyNote: "Speed + location modifier. Route to geo-specific fast-turnaround landing page." },
    ],
  },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LIBRARY_KEY   = "elitez_kw_library";
const OVERRIDES_KEY = "elitez_kw_overrides";
const COUNTER_KEY   = "elitez_kw_counter";

export function getLibraryKeywords(): LibraryKeyword[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]") as LibraryKeyword[];
  } catch { return []; }
}

export function saveLibraryKeywords(kws: LibraryKeyword[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(kws));
}

export function getSystemOverrides(): SystemOverride[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? "[]") as SystemOverride[];
  } catch { return []; }
}

export function saveSystemOverrides(overrides: SystemOverride[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
}

export function nextKwId(): number {
  if (typeof window === "undefined") return 10000;
  const current = parseInt(localStorage.getItem(COUNTER_KEY) ?? "10000", 10);
  localStorage.setItem(COUNTER_KEY, String(current + 1));
  return current;
}

// ─── Workspace builder ────────────────────────────────────────────────────────

function effectiveAction(
  baseAction: Action,
  exclude:    boolean,
  forceBuy:   boolean,
  forceTest:  boolean,
): Action {
  if (exclude)   return "No";
  if (forceBuy)  return "Buy";
  if (forceTest) return "Test";
  return baseAction;
}

// ─── Match type resolution ────────────────────────────────────────────────────
// Priority: keyword strategy → ad group default → campaign default → base matchType.
// "inherit" on an ad group means: defer to the campaign default.

interface MatchTypeParent {
  id:               string;
  defaultMatchType?: MatchType | "inherit";
}
interface CampaignParent {
  id:               string;
  defaultMatchType?: MatchType;
}

function resolveMatchType(
  baseMatchType:  MatchType,
  strategy:       MatchType | undefined,
  campaignId:     string | undefined,
  adGroupId:      string | undefined,
  campaigns:      CampaignParent[],
  adGroups:       MatchTypeParent[],
): { type: MatchType; inherited: boolean } {
  // 1. Keyword-level override takes priority
  if (strategy) return { type: strategy, inherited: false };

  // 2. Ad group default (skip if "inherit" — that means defer to campaign)
  if (adGroupId) {
    const ag = adGroups.find((g) => g.id === adGroupId);
    if (ag?.defaultMatchType && ag.defaultMatchType !== "inherit") {
      return { type: ag.defaultMatchType as MatchType, inherited: true };
    }
  }

  // 3. Campaign default
  const cId = campaignId ?? adGroups.find((g) => g.id === adGroupId)?.id;
  if (cId) {
    const camp = campaigns.find((c) => c.id === cId);
    if (camp?.defaultMatchType) return { type: camp.defaultMatchType, inherited: true };
  }

  // 4. Fallback: keyword's own base match type
  return { type: baseMatchType, inherited: false };
}

/**
 * Merges system keywords + library keywords with override state applied.
 * systemKws should already have the scenario CPC multiplier applied.
 * campaigns / adGroups are used to resolve effectiveMatchType via the hierarchy.
 */
export function buildWorkspaceKeywords(
  systemKws:    Keyword[],
  sysOverrides: SystemOverride[],
  libraryKws:   LibraryKeyword[],
  cpcMultiplier: number,
  campaigns:    CampaignParent[] = [],
  adGroups:     MatchTypeParent[] = [],
): WorkspaceKeyword[] {
  const overrideMap = new Map(sysOverrides.map((o) => [o.id, o]));
  const result: WorkspaceKeyword[] = [];

  for (const kw of systemKws) {
    const ov  = overrideMap.get(kw.id);
    const exc = ov?.exclude   ?? false;
    const fb  = ov?.forceBuy  ?? false;
    const ft  = ov?.forceTest ?? false;
    result.push({
      ...kw,
      country:              kw.country as string,
      source:               "system",
      category:             intentToCategory(kw.intent),
      note:                 "",
      packName:             "",
      isLibrary:            false,
      exclude:              exc,
      forceBuy:             fb,
      forceTest:            ft,
      effectiveAction:      effectiveAction(kw.action, exc, fb, ft),
      effectiveMatchType:   kw.matchType,
      matchTypeInherited:   false,
    });
  }

  for (const kw of libraryKws) {
    const { type: effectiveMatchType, inherited: matchTypeInherited } = resolveMatchType(
      kw.matchType, kw.matchTypeStrategy, kw.campaignId, kw.adGroupId, campaigns, adGroups
    );
    result.push({
      ...kw,
      suggestedCpc:         Number((kw.suggestedCpc * cpcMultiplier).toFixed(2)),
      estimatedCpc:         Number((kw.estimatedCpc * cpcMultiplier).toFixed(2)),
      isLibrary:            true,
      effectiveAction:      effectiveAction(kw.action, kw.exclude, kw.forceBuy, kw.forceTest),
      campaignId:           kw.campaignId,
      adGroupId:            kw.adGroupId,
      effectiveMatchType,
      matchTypeInherited,
    });
  }

  return result;
}

// ─── Placeholder resolution ───────────────────────────────────────────────────

/**
 * Replaces all {placeholder} tokens in a keyword template string.
 * Any remaining unreachable token (no real value to substitute) gets the
 * curly-brace syntax stripped so the keyword stays human-readable.
 */
export function resolvePlaceholders(
  keyword: string,
  vars: { brand: string; service: string; country: string },
): string {
  const { brand, service, country } = vars;
  const b = brand.trim().toLowerCase();
  const s = service.trim().toLowerCase();
  const c = country.trim();

  let result = keyword
    // Brand tokens
    .replace(/\{brand-name\}/gi,     b || "your brand")
    .replace(/\{your-brand\}/gi,     b || "your brand")
    // Service / product tokens (all variants)
    .replace(/\{product\/service\}/gi, s || "service")
    .replace(/\{service\/person\}/gi,  s || "service")
    .replace(/\{concept\/service\}/gi, s || "service")
    .replace(/\{service\}/gi,          s || "service")
    // Geo tokens — fall back to country when no city data
    .replace(/\{city\/region\}/gi,   c)
    .replace(/\{city\}/gi,           c)
    .replace(/\{country\}/gi,        c)
    // Audience token
    .replace(/\{audience\}/gi,       "businesses")
    // Problem-aware tokens — approximate with the service term
    .replace(/\{solve problem\}/gi,  s ? `handle ${s}` : "solve this problem")
    .replace(/\{problem\}/gi,        s ? `${s} challenges` : "business challenges")
    // Competitor tokens — strip braces, keep as editable placeholder
    .replace(/\{competitor\}/gi,     "competitor")
    .replace(/\{alternative\}/gi,    "alternative")
    // Catch-all: strip any remaining {tokens} so no curly braces survive
    .replace(/\{[^}]+\}/g,           "");

  // Collapse multiple spaces that may appear after removal
  return result.replace(/\s{2,}/g, " ").trim();
}

// ─── Preset pack helpers ──────────────────────────────────────────────────────

/** Build LibraryKeyword entries for a named preset pack.
 *  If targetCountries is provided, country is assigned from that list instead
 *  of the hardcoded template value. Single country → all keywords use it.
 *  Multiple countries → one copy of every keyword per country.
 *  If profile is provided, all {placeholder} tokens are resolved with real values. */
export function buildPresetPackKeywords(
  packName:        string,
  targetCountries?: string[],
  profile?:        ProjectProfile,
): LibraryKeyword[] {
  const pack = PRESET_PACKS.find((p) => p.name === packName);
  if (!pack) return [];

  const countries = targetCountries && targetCountries.length > 0 ? targetCountries : null;
  const now = new Date().toISOString();

  function makeKw(t: PresetKeywordTemplate, country: string): LibraryKeyword {
    const derived = deriveKeywordFields({
      intent:                  t.intent,
      competition:             t.competition,
      competitorPressureScore: t.competitorPressureScore,
      estimatedCpc:            t.estimatedCpc,
    });
    const resolvedKeyword = profile
      ? resolvePlaceholders(t.keyword, { brand: profile.brand, service: profile.offer, country })
      : t.keyword;
    return {
      id:                      nextKwId(),
      source:                  "preset" as const,
      packName,
      category:                pack!.category,
      note:                    "",
      createdAt:               now,
      keyword:                 resolvedKeyword,
      country,
      intent:                  t.intent,
      matchType:               t.matchType,
      monthlySearches:         t.monthlySearches,
      competition:             t.competition,
      estimatedCpc:            t.estimatedCpc,
      competitorPressureScore: t.competitorPressureScore,
      strategyNote:            t.strategyNote,
      recommendationNote:      "",
      competitorExamples:      [],
      ...derived,
      exclude:                 false,
      forceBuy:                false,
      forceTest:               false,
    };
  }

  const results: LibraryKeyword[] = [];
  for (const t of pack.keywords) {
    if (!countries) {
      results.push(makeKw(t, t.country));
    } else if (countries.length === 1) {
      results.push(makeKw(t, countries[0]));
    } else {
      for (const country of countries) {
        results.push(makeKw(t, country));
      }
    }
  }
  return results;
}

/** Maps a campaign type to preset pack names and builds recommended starter keywords. */
const CAMPAIGN_TYPE_PACKS: Record<string, string[]> = {
  brand:         ["Brand Defense"],
  generic:       ["Commercial Intent", "Problem-Aware"],
  "high-intent": ["Purchase Intent", "Urgent / Action Intent"],
  competitor:    ["Competitor Displacement", "Comparison / Best-of"],
  pricing:       ["Purchase Intent"],
  local:         ["Local / Geo Intent"],
  niche:         ["Commercial Intent", "Problem-Aware"],
  custom:        [],
};

/** Maps a campaign type to starter keywords from the matching preset packs.
 *  targetCountries behaves the same as in buildPresetPackKeywords:
 *  single → all use that country, multiple → one copy per country, absent → template default.
 *  If profile is provided, all {placeholder} tokens are resolved with real values. */
export function buildCampaignTypeKeywords(
  campaignType:    string,
  campaignId:      string,
  targetCountries?: string[],
  profile?:        ProjectProfile,
): LibraryKeyword[] {
  const packNames = CAMPAIGN_TYPE_PACKS[campaignType] ?? [];
  const countries = targetCountries && targetCountries.length > 0 ? targetCountries : null;
  const now = new Date().toISOString();
  const results: LibraryKeyword[] = [];

  for (const packName of packNames) {
    const pack = PRESET_PACKS.find((p) => p.name === packName);
    if (!pack) continue;

    const makeKw = (t: PresetKeywordTemplate, country: string): LibraryKeyword => {
      const derived = deriveKeywordFields({
        intent:                  t.intent,
        competition:             t.competition,
        competitorPressureScore: t.competitorPressureScore,
        estimatedCpc:            t.estimatedCpc,
      });
      const resolvedKeyword = profile
        ? resolvePlaceholders(t.keyword, { brand: profile.brand, service: profile.offer, country })
        : t.keyword;
      return {
        id:                      nextKwId(),
        source:                  "recommended" as const,
        packName,
        category:                pack!.category,
        note:                    "",
        createdAt:               now,
        campaignId,
        keyword:                 resolvedKeyword,
        country,
        intent:                  t.intent,
        matchType:               t.matchType,
        monthlySearches:         t.monthlySearches,
        competition:             t.competition,
        estimatedCpc:            t.estimatedCpc,
        competitorPressureScore: t.competitorPressureScore,
        strategyNote:            t.strategyNote,
        recommendationNote:      "",
        competitorExamples:      [],
        ...derived,
        exclude:                 false,
        forceBuy:                false,
        forceTest:               false,
      };
    };

    for (const t of pack.keywords) {
      if (!countries) {
        results.push(makeKw(t, t.country));
      } else if (countries.length === 1) {
        results.push(makeKw(t, countries[0]));
      } else {
        for (const country of countries) {
          results.push(makeKw(t, country));
        }
      }
    }
  }
  return results;
}

/** Check which pack names are already in the library. */
export function addedPackNames(libraryKws: LibraryKeyword[]): Set<string> {
  return new Set(libraryKws.filter((k) => k.source === "preset").map((k) => k.packName));
}

// ─── Dynamic campaign keyword generator ──────────────────────────────────────
// Generates project-aware, country-specific starter keywords for any country,
// including markets not covered by the static system keyword dataset (e.g. Indonesia).

export interface ProjectProfile {
  brand: string;  // project name / brand
  offer: string;  // primary offer (serviceType → offerType → industry as fallback)
}

function countryCpcScale(country: string): number {
  const s: Record<string, number> = {
    "Singapore":            1.00, "Australia":            1.05,
    "United States":        1.15, "United Kingdom":       1.05,
    "Canada":               0.92, "New Zealand":          0.90,
    "Germany":              0.85, "United Arab Emirates": 0.88,
    "Malaysia":             0.65, "Thailand":             0.55,
    "Philippines":          0.42, "Indonesia":            0.45,
    "Vietnam":              0.40, "India":                0.35,
  };
  return s[country] ?? 0.60;
}

function countrySearchScale(country: string): number {
  const s: Record<string, number> = {
    "Singapore":            1.00, "Australia":            2.20,
    "United States":        8.00, "United Kingdom":       3.50,
    "Canada":               1.80, "New Zealand":          0.80,
    "Germany":              2.50, "United Arab Emirates": 1.20,
    "Malaysia":             1.80, "Thailand":             2.00,
    "Philippines":          1.50, "Indonesia":            2.80,
    "Vietnam":              1.60, "India":                5.00,
  };
  return s[country] ?? 1.00;
}

interface DynTemplate {
  keyword:                 string;
  category:                KeywordCategory;
  intent:                  Intent;
  matchType:               MatchType;
  competition:             Competition;
  baseCpc:                 number;
  competitorPressureScore: number;
  baseSearches:            number;
}

/** User-controlled inputs that override profile-derived values during generation. */
export interface UserKeywordInputs {
  services?:    string[];   // e.g. ["Employer of Record", "EOR", "Headhunting"]
  actions?:     string[];   // e.g. ["hire", "need", "find", "outsource"]  — used by high-intent
  competitors?: string[];   // e.g. ["Manpower", "Adecco"]               — used by competitor
}

function dynTemplates(
  type:        string,
  brand:       string,
  offer:       string,
  country:     string,
  actions?:    string[],
  comps?:      string[],
): DynTemplate[] {
  const b = brand.toLowerCase();
  const o = offer.toLowerCase();
  const c = country;

  switch (type) {
    case "brand":
      return [
        ...(b ? [
          { keyword: b,                   category: "brand" as KeywordCategory, intent: "Navigational" as Intent, matchType: "Exact"  as MatchType, competition: "Low" as Competition, baseCpc: 1.50, competitorPressureScore: 8,  baseSearches: 320 },
          { keyword: `${b} ${c}`,         category: "brand" as KeywordCategory, intent: "Navigational" as Intent, matchType: "Phrase" as MatchType, competition: "Low" as Competition, baseCpc: 1.80, competitorPressureScore: 12, baseSearches: 180 },
          { keyword: `${b} reviews`,      category: "brand" as KeywordCategory, intent: "Navigational" as Intent, matchType: "Phrase" as MatchType, competition: "Low" as Competition, baseCpc: 1.80, competitorPressureScore: 12, baseSearches: 200 },
          { keyword: `${b} pricing`,      category: "brand" as KeywordCategory, intent: "Commercial"   as Intent, matchType: "Exact"  as MatchType, competition: "Low" as Competition, baseCpc: 2.50, competitorPressureScore: 18, baseSearches: 140 },
          ...(o ? [{ keyword: `${b} ${o}`, category: "brand" as KeywordCategory, intent: "Commercial" as Intent, matchType: "Phrase" as MatchType, competition: "Low" as Competition, baseCpc: 2.20, competitorPressureScore: 15, baseSearches: 160 }] : []),
        ] : []),
      ];

    case "generic":
      return [
        { keyword: `${o} ${c}`,               category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   baseCpc: 6.00, competitorPressureScore: 68, baseSearches: 720 },
        { keyword: `${o} company ${c}`,       category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   baseCpc: 5.20, competitorPressureScore: 63, baseSearches: 540 },
        { keyword: `${o} services ${c}`,      category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 4.20, competitorPressureScore: 50, baseSearches: 480 },
        { keyword: `best ${o} ${c}`,          category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   baseCpc: 6.00, competitorPressureScore: 68, baseSearches: 720 },
        { keyword: `${o} agency ${c}`,        category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   baseCpc: 5.80, competitorPressureScore: 66, baseSearches: 680 },
        { keyword: `top ${o} companies ${c}`, category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   baseCpc: 5.50, competitorPressureScore: 65, baseSearches: 580 },
      ] as DynTemplate[];

    case "high-intent": {
      const acts = (actions && actions.length > 0)
        ? actions.map((a) => a.trim().toLowerCase()).filter(Boolean)
        : ["hire", "need", "get", "looking for"];
      const rows: DynTemplate[] = acts.map((a) => ({
        keyword:                 `${a} ${o} ${c}`,
        category:                "purchase" as KeywordCategory,
        intent:                  "Transactional" as Intent,
        matchType:               (a.includes(" ") ? "Phrase" : "Exact") as MatchType,
        competition:             "High" as Competition,
        baseCpc:                 8.00,
        competitorPressureScore: 76,
        baseSearches:            440,
      }));
      rows.push({ keyword: `${o} quote ${c}`,  category: "purchase", intent: "Transactional", matchType: "Exact",  competition: "High",   baseCpc: 8.50, competitorPressureScore: 80, baseSearches: 520 } as DynTemplate);
      rows.push({ keyword: `${o} near me`,     category: "urgent",   intent: "Transactional", matchType: "Phrase", competition: "Medium", baseCpc: 4.20, competitorPressureScore: 42, baseSearches: 680 } as DynTemplate);
      return rows;
    }

    case "competitor": {
      if (comps && comps.length > 0) {
        const rows: DynTemplate[] = [];
        for (const comp of comps) {
          const cl = comp.trim().toLowerCase();
          rows.push({ keyword: `${cl} ${c}`,                    category: "competitor",  intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 6.00, competitorPressureScore: 58, baseSearches: 200 } as DynTemplate);
          rows.push({ keyword: `${cl} alternative ${c}`,        category: "competitor",  intent: "Commercial", matchType: "Exact",  competition: "Medium", baseCpc: 7.20, competitorPressureScore: 62, baseSearches: 210 } as DynTemplate);
          rows.push({ keyword: `${cl} vs ${b || o}`,            category: "comparison",  intent: "Commercial", matchType: "Phrase", competition: "Low",    baseCpc: 5.00, competitorPressureScore: 38, baseSearches: 90  } as DynTemplate);
        }
        // Always append generic alternatives even with real competitors
        rows.push({ keyword: `best ${o} alternative ${c}`,  category: "competitor", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 6.80, competitorPressureScore: 58, baseSearches: 180 } as DynTemplate);
        rows.push({ keyword: `${o} comparison ${c}`,        category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 4.50, competitorPressureScore: 48, baseSearches: 260 } as DynTemplate);
        return rows;
      }
      return [
        { keyword: `${o} alternative ${c}`,      category: "competitor",  intent: "Commercial", matchType: "Exact",  competition: "Medium", baseCpc: 7.20, competitorPressureScore: 62, baseSearches: 210 },
        { keyword: `best ${o} alternative ${c}`, category: "competitor",  intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 6.80, competitorPressureScore: 58, baseSearches: 180 },
        { keyword: `${o} comparison ${c}`,       category: "comparison",  intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 4.50, competitorPressureScore: 48, baseSearches: 260 },
        { keyword: `switch from ${o} ${c}`,      category: "competitor",  intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 6.20, competitorPressureScore: 52, baseSearches: 140 },
        ...(b ? [{ keyword: `${o} vs ${b}`, category: "comparison" as KeywordCategory, intent: "Commercial" as Intent, matchType: "Phrase" as MatchType, competition: "Low" as Competition, baseCpc: 5.00, competitorPressureScore: 38, baseSearches: 90 }] : []),
      ] as DynTemplate[];
    }

    case "pricing":
      return [
        { keyword: `${o} cost ${c}`,        category: "purchase",   intent: "Transactional", matchType: "Phrase", competition: "Medium", baseCpc: 4.80, competitorPressureScore: 50, baseSearches: 680 },
        { keyword: `${o} pricing ${c}`,     category: "purchase",   intent: "Transactional", matchType: "Exact",  competition: "Medium", baseCpc: 5.20, competitorPressureScore: 48, baseSearches: 400 },
        { keyword: `${o} fees ${c}`,        category: "purchase",   intent: "Transactional", matchType: "Phrase", competition: "Low",    baseCpc: 3.80, competitorPressureScore: 34, baseSearches: 280 },
        { keyword: `affordable ${o} ${c}`,  category: "commercial", intent: "Commercial",    matchType: "Phrase", competition: "Medium", baseCpc: 4.00, competitorPressureScore: 42, baseSearches: 360 },
        { keyword: `${o} packages ${c}`,    category: "commercial", intent: "Commercial",    matchType: "Phrase", competition: "Low",    baseCpc: 3.50, competitorPressureScore: 30, baseSearches: 200 },
      ] as DynTemplate[];

    case "local":
      return [
        { keyword: `${o} near me`,      category: "local", intent: "Transactional", matchType: "Phrase", competition: "Medium", baseCpc: 4.20, competitorPressureScore: 42, baseSearches: 680 },
        { keyword: `${o} in ${c}`,      category: "local", intent: "Transactional", matchType: "Exact",  competition: "Medium", baseCpc: 4.80, competitorPressureScore: 46, baseSearches: 540 },
        { keyword: `${o} ${c}`,         category: "local", intent: "Transactional", matchType: "Exact",  competition: "Medium", baseCpc: 5.00, competitorPressureScore: 48, baseSearches: 560 },
        { keyword: `local ${o} ${c}`,   category: "local", intent: "Transactional", matchType: "Phrase", competition: "Low",    baseCpc: 2.80, competitorPressureScore: 28, baseSearches: 320 },
        { keyword: `best ${o} in ${c}`, category: "local", intent: "Commercial",    matchType: "Phrase", competition: "High",   baseCpc: 5.50, competitorPressureScore: 60, baseSearches: 440 },
      ] as DynTemplate[];

    case "niche":
      return [
        { keyword: `${o} for small business ${c}`, category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 5.00, competitorPressureScore: 50, baseSearches: 320 },
        { keyword: `professional ${o} ${c}`,       category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 4.80, competitorPressureScore: 46, baseSearches: 280 },
        { keyword: `${o} specialist ${c}`,         category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 5.20, competitorPressureScore: 52, baseSearches: 260 },
        { keyword: `enterprise ${o} ${c}`,         category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   baseCpc: 6.50, competitorPressureScore: 70, baseSearches: 380 },
        { keyword: `${o} solutions ${c}`,          category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", baseCpc: 4.20, competitorPressureScore: 50, baseSearches: 480 },
      ] as DynTemplate[];

    default:
      return [];
  }
}

/**
 * Generates project-aware starter keywords for a campaign type across all target countries.
 * Works for any country including markets absent from the static system dataset (e.g. Indonesia).
 * When userInputs is provided, user-supplied services / actions / competitors take full priority
 * over profile-derived values — no system guesses.
 */
export function buildDynamicCampaignKeywords(
  campaignType: string,
  campaignId:   string,
  profile:      ProjectProfile,
  countries:    string[],
  userInputs?:  UserKeywordInputs,
): LibraryKeyword[] {
  // Determine the list of services to generate keywords for.
  // User-supplied list wins; fall back to profile.offer → profile.brand.
  const userServices = (userInputs?.services ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const fallbackOffer = (profile.offer || profile.brand).toLowerCase().trim();
  const services = userServices.length > 0 ? userServices : (fallbackOffer ? [fallbackOffer] : []);
  if (services.length === 0) return [];

  const targetCountries = countries.length > 0 ? countries : ["Singapore"];
  const now     = new Date().toISOString();
  const results: LibraryKeyword[] = [];
  const seen    = new Set<string>();

  for (const country of targetCountries) {
    const cpcScale    = countryCpcScale(country);
    const searchScale = countrySearchScale(country);

    for (const svc of services) {
      const templates = dynTemplates(
        campaignType,
        profile.brand,
        svc,
        country,
        userInputs?.actions,
        userInputs?.competitors,
      );

      for (const t of templates) {
        const key = `${t.keyword}|${country}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const cpc      = Number((t.baseCpc * cpcScale).toFixed(2));
        const searches = Math.max(50, Math.round(t.baseSearches * searchScale));
        const derived  = deriveKeywordFields({
          intent:                  t.intent,
          competition:             t.competition,
          competitorPressureScore: t.competitorPressureScore,
          estimatedCpc:            cpc,
        });

        results.push({
          id:                      nextKwId(),
          source:                  "recommended" as const,
          packName:                "",
          category:                t.category,
          note:                    "",
          createdAt:               now,
          campaignId,
          keyword:                 t.keyword,
          country,
          intent:                  t.intent,
          matchType:               t.matchType,
          monthlySearches:         searches,
          competition:             t.competition,
          estimatedCpc:            cpc,
          competitorPressureScore: t.competitorPressureScore,
          competitorExamples:      [],
          strategyNote:            "",
          recommendationNote:      "",
          ...derived,
          exclude:                 false,
          forceBuy:                false,
          forceTest:               false,
        });
      }
    }
  }

  return results;
}

// ─── Project starter keyword generation ──────────────────────────────────────

/** Minimal project shape required by generateStarterKeywordsForProject. */
export interface StarterProjectContext {
  projectName: string;
  serviceType: string;
  offerType:   string;
  industry:    string;
}

/**
 * Generates a full set of starter keywords for a new project across all
 * selected countries, covering Brand, Generic, High-Intent, Competitor,
 * Pricing and Local campaign archetypes.
 *
 * Keywords are unassigned (no campaignId) so the user can create campaigns
 * and assign them freely. All placeholders are already resolved; no {tokens}.
 */
export function generateStarterKeywordsForProject(
  project:  StarterProjectContext,
  countries: string[],
): LibraryKeyword[] {
  const brand  = project.projectName.trim();
  const offer  = (project.serviceType || "").trim();
  if (!offer && !brand) return [];

  const profile: ProjectProfile = { brand, offer };
  const targetCountries = countries.length > 0 ? countries : ["Singapore"];

  const STARTER_TYPES = ["brand", "generic", "high-intent", "competitor", "pricing", "local"] as const;

  const results: LibraryKeyword[] = [];
  const seen = new Set<string>();

  for (const type of STARTER_TYPES) {
    const kws = buildDynamicCampaignKeywords(type, "", profile, targetCountries);
    for (const kw of kws) {
      const key = `${kw.keyword}|${kw.country}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ ...kw, campaignId: undefined, adGroupId: undefined });
      }
    }
  }

  return results;
}

// ─── Keyword Generator ────────────────────────────────────────────────────────

/** Inputs collected from the generator form. */
export interface GeneratorInputs {
  brandName:       string;
  primaryOffer:    string;
  secondaryOffer:  string;
  competitors:     string;   // newline / comma separated
  problemsSolved:  string;   // newline / comma separated
  locationTerms:   string;   // newline / comma separated
  targetCountries: string[];
}

function parseList(text: string): string[] {
  return text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
}

/** Best-effort mapping of a city/region string to a target country. */
function inferCountry(term: string, candidates: string[]): string | undefined {
  const t = term.toLowerCase();
  const GEO: Record<string, string[]> = {
    "Singapore":            ["singapore", "sg", "jurong", "orchard", "bishan", "changi", "sentosa"],
    "Malaysia":             ["malaysia", "kuala lumpur", "kl", "penang", "johor", "ipoh", "kota kinabalu", "kuching", "sabah", "sarawak"],
    "Vietnam":              ["vietnam", "hanoi", "ho chi minh", "hcmc", "saigon", "da nang", "hoi an"],
    "Thailand":             ["thailand", "bangkok", "chiang mai", "phuket", "pattaya", "hua hin"],
    "Australia":            ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"],
    "United States":        ["united states", "usa", "new york", "los angeles", "chicago", "san francisco", "houston", "seattle", "boston"],
    "United Kingdom":       ["united kingdom", "uk", "london", "manchester", "birmingham", "edinburgh", "glasgow"],
    "India":                ["india", "mumbai", "delhi", "bangalore", "bengaluru", "chennai", "hyderabad", "pune"],
    "Indonesia":            ["indonesia", "jakarta", "bali", "surabaya", "bandung", "medan", "semarang", "yogyakarta"],
    "Philippines":          ["philippines", "manila", "cebu", "davao"],
    "United Arab Emirates": ["uae", "united arab emirates", "dubai", "abu dhabi", "sharjah"],
    "Germany":              ["germany", "berlin", "munich", "hamburg", "frankfurt", "cologne"],
    "Canada":               ["canada", "toronto", "vancouver", "montreal", "calgary"],
    "New Zealand":          ["new zealand", "auckland", "wellington", "christchurch"],
  };
  for (const [country, terms] of Object.entries(GEO)) {
    if (candidates.includes(country) && terms.some((k) => t.includes(k) || k.includes(t))) {
      return country;
    }
  }
  return undefined;
}

interface _KwRow {
  keyword:                 string;
  category:                KeywordCategory;
  intent:                  Intent;
  matchType:               MatchType;
  competition:             Competition;
  estimatedCpc:            number;
  competitorPressureScore: number;
  monthlySearches:         number;
  country:                 string;
}

/**
 * Generate keyword suggestions from business inputs.
 * Returns fully-formed LibraryKeyword entries ready to add to the workspace.
 */
export function generateKeywords(inputs: GeneratorInputs): LibraryKeyword[] {
  const { brandName, primaryOffer, secondaryOffer, competitors: compsRaw,
          problemsSolved: probsRaw, locationTerms: locsRaw, targetCountries } = inputs;

  const brand  = brandName.trim().toLowerCase();
  const offer  = primaryOffer.trim().toLowerCase();
  const offer2 = secondaryOffer.trim().toLowerCase();
  const comps  = parseList(compsRaw).slice(0, 5).map((c) => c.toLowerCase());
  const probs  = parseList(probsRaw).slice(0, 6).map((p) => p.toLowerCase());
  const locs   = parseList(locsRaw).slice(0, 6);
  const main   = targetCountries[0] ?? "Singapore";

  if (!offer) return [];

  const rows: _KwRow[] = [];
  const seen  = new Set<string>();

  function push(t: Omit<_KwRow, "country">, country = main) {
    const key = `${t.keyword}|${country}`;
    if (!seen.has(key)) { seen.add(key); rows.push({ ...t, country }); }
  }

  // ── Brand ────────────────────────────────────────────────────────────────────
  if (brand) {
    push({ keyword: brand,                          category: "brand", intent: "Navigational", matchType: "Exact",  competition: "Low", estimatedCpc: 1.50, competitorPressureScore: 8,  monthlySearches: 320 });
    push({ keyword: `${brand} reviews`,             category: "brand", intent: "Navigational", matchType: "Phrase", competition: "Low", estimatedCpc: 1.80, competitorPressureScore: 12, monthlySearches: 180 });
    push({ keyword: `${brand} pricing`,             category: "brand", intent: "Commercial",   matchType: "Exact",  competition: "Low", estimatedCpc: 2.50, competitorPressureScore: 18, monthlySearches: 140 });
    push({ keyword: `${brand} ${offer}`,            category: "brand", intent: "Commercial",   matchType: "Phrase", competition: "Low", estimatedCpc: 2.20, competitorPressureScore: 15, monthlySearches: 160 });
    if (offer2) push({ keyword: `${brand} ${offer2}`, category: "brand", intent: "Commercial", matchType: "Phrase", competition: "Low", estimatedCpc: 2.20, competitorPressureScore: 15, monthlySearches: 120 });
    if (comps.length > 0) push({ keyword: `${brand} vs ${comps[0]}`, category: "brand", intent: "Commercial", matchType: "Exact", competition: "Low", estimatedCpc: 3.50, competitorPressureScore: 28, monthlySearches: 90 });
  }

  // ── Commercial ───────────────────────────────────────────────────────────────
  push({ keyword: `best ${offer}`,              category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   estimatedCpc: 6.00, competitorPressureScore: 68, monthlySearches: 720 });
  push({ keyword: `top ${offer} companies`,     category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   estimatedCpc: 5.50, competitorPressureScore: 65, monthlySearches: 580 });
  push({ keyword: `${offer} solutions`,         category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.20, competitorPressureScore: 50, monthlySearches: 480 });
  push({ keyword: `${offer} providers`,         category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   estimatedCpc: 5.00, competitorPressureScore: 62, monthlySearches: 620 });
  push({ keyword: `${offer} company`,           category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   estimatedCpc: 5.20, competitorPressureScore: 63, monthlySearches: 540 });
  push({ keyword: `${offer} agency`,            category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "High",   estimatedCpc: 5.80, competitorPressureScore: 66, monthlySearches: 680 });
  if (offer2) {
    push({ keyword: `best ${offer2}`,           category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 5.00, competitorPressureScore: 55, monthlySearches: 480 });
    push({ keyword: `${offer2} solutions`,      category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 3.80, competitorPressureScore: 46, monthlySearches: 380 });
    push({ keyword: `${offer2} providers`,      category: "commercial", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.50, competitorPressureScore: 52, monthlySearches: 320 });
  }

  // ── Purchase / Transactional ─────────────────────────────────────────────────
  push({ keyword: `${offer} quote`,             category: "purchase", intent: "Transactional", matchType: "Exact",  competition: "High",   estimatedCpc: 8.00, competitorPressureScore: 76, monthlySearches: 520 });
  push({ keyword: `hire ${offer}`,              category: "purchase", intent: "Transactional", matchType: "Exact",  competition: "High",   estimatedCpc: 8.50, competitorPressureScore: 80, monthlySearches: 440 });
  push({ keyword: `${offer} cost`,              category: "purchase", intent: "Transactional", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 50, monthlySearches: 680 });
  push({ keyword: `${offer} pricing`,           category: "purchase", intent: "Transactional", matchType: "Exact",  competition: "Medium", estimatedCpc: 5.20, competitorPressureScore: 48, monthlySearches: 400 });
  push({ keyword: `get ${offer} now`,           category: "purchase", intent: "Transactional", matchType: "Phrase", competition: "Medium", estimatedCpc: 5.50, competitorPressureScore: 52, monthlySearches: 280 });
  if (offer2) {
    push({ keyword: `${offer2} quote`,          category: "purchase", intent: "Transactional", matchType: "Exact",  competition: "Medium", estimatedCpc: 7.00, competitorPressureScore: 64, monthlySearches: 320 });
    push({ keyword: `${offer2} pricing`,        category: "purchase", intent: "Transactional", matchType: "Exact",  competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 50, monthlySearches: 300 });
  }

  // ── Problem-Aware ────────────────────────────────────────────────────────────
  for (const prob of probs.slice(0, 4)) {
    push({ keyword: `how to ${prob}`,           category: "problem-aware", intent: "Informational", matchType: "Phrase", competition: "Low",    estimatedCpc: 1.80, competitorPressureScore: 18, monthlySearches: 880 });
    push({ keyword: `${prob} solution`,         category: "problem-aware", intent: "Commercial",    matchType: "Phrase", competition: "Medium", estimatedCpc: 3.50, competitorPressureScore: 40, monthlySearches: 460 });
    push({ keyword: `${prob} help`,             category: "problem-aware", intent: "Commercial",    matchType: "Phrase", competition: "Low",    estimatedCpc: 2.60, competitorPressureScore: 24, monthlySearches: 340 });
    push({ keyword: `reduce ${prob}`,           category: "problem-aware", intent: "Commercial",    matchType: "Phrase", competition: "Low",    estimatedCpc: 2.80, competitorPressureScore: 26, monthlySearches: 260 });
  }

  // ── Comparison ───────────────────────────────────────────────────────────────
  if (offer2) push({ keyword: `${offer} vs ${offer2}`,    category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 5.20, competitorPressureScore: 55, monthlySearches: 340 });
  if (comps.length > 0) push({ keyword: `${offer} vs ${comps[0]}`, category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 5.50, competitorPressureScore: 58, monthlySearches: 300 });
  push({ keyword: `${offer} comparison`,                  category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.50, competitorPressureScore: 48, monthlySearches: 260 });
  push({ keyword: `${offer} review`,                      category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.20, competitorPressureScore: 46, monthlySearches: 390 });
  push({ keyword: `${offer} alternatives`,                category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 52, monthlySearches: 280 });
  push({ keyword: `best ${offer} for small business`,     category: "comparison", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 5.00, competitorPressureScore: 50, monthlySearches: 320 });

  // ── Competitor Displacement ──────────────────────────────────────────────────
  for (const comp of comps.slice(0, 3)) {
    push({ keyword: `${comp} alternative`,      category: "competitor", intent: "Commercial", matchType: "Exact",  competition: "Medium", estimatedCpc: 7.20, competitorPressureScore: 62, monthlySearches: 210 });
    push({ keyword: `alternatives to ${comp}`,  category: "competitor", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 6.80, competitorPressureScore: 58, monthlySearches: 180 });
    push({ keyword: `switch from ${comp}`,      category: "competitor", intent: "Commercial", matchType: "Phrase", competition: "Medium", estimatedCpc: 6.20, competitorPressureScore: 52, monthlySearches: 140 });
    if (brand) push({ keyword: `${comp} vs ${brand}`, category: "competitor", intent: "Commercial", matchType: "Exact", competition: "Low", estimatedCpc: 5.00, competitorPressureScore: 38, monthlySearches: 90 });
  }

  // ── Informational / Educational ──────────────────────────────────────────────
  push({ keyword: `what is ${offer}`,           category: "informational", intent: "Informational", matchType: "Phrase", competition: "Low", estimatedCpc: 1.80, competitorPressureScore: 12, monthlySearches: 720 });
  push({ keyword: `how does ${offer} work`,     category: "informational", intent: "Informational", matchType: "Phrase", competition: "Low", estimatedCpc: 2.00, competitorPressureScore: 14, monthlySearches: 480 });
  push({ keyword: `${offer} guide`,             category: "informational", intent: "Informational", matchType: "Phrase", competition: "Low", estimatedCpc: 1.50, competitorPressureScore: 10, monthlySearches: 380 });
  push({ keyword: `${offer} benefits`,          category: "informational", intent: "Informational", matchType: "Phrase", competition: "Low", estimatedCpc: 2.10, competitorPressureScore: 18, monthlySearches: 320 });
  push({ keyword: `${offer} best practices`,    category: "informational", intent: "Informational", matchType: "Phrase", competition: "Low", estimatedCpc: 1.90, competitorPressureScore: 16, monthlySearches: 280 });
  push({ keyword: `${offer} explained`,         category: "informational", intent: "Informational", matchType: "Phrase", competition: "Low", estimatedCpc: 1.70, competitorPressureScore: 12, monthlySearches: 240 });

  // ── Local / Geo ──────────────────────────────────────────────────────────────
  for (const loc of locs.slice(0, 4)) {
    const l          = loc.toLowerCase();
    const locCountry = inferCountry(loc, targetCountries) ?? main;
    push({ keyword: `${offer} ${l}`,            category: "local", intent: "Transactional", matchType: "Exact",  competition: "Medium", estimatedCpc: 4.80, competitorPressureScore: 46, monthlySearches: 540 }, locCountry);
    push({ keyword: `best ${offer} in ${l}`,    category: "local", intent: "Commercial",    matchType: "Phrase", competition: "High",   estimatedCpc: 5.50, competitorPressureScore: 60, monthlySearches: 440 }, locCountry);
    if (offer2) push({ keyword: `${offer2} ${l}`, category: "local", intent: "Transactional", matchType: "Exact", competition: "Low", estimatedCpc: 4.00, competitorPressureScore: 32, monthlySearches: 300 }, locCountry);
  }
  push({ keyword: `${offer} near me`,           category: "local", intent: "Transactional", matchType: "Phrase", competition: "Medium", estimatedCpc: 4.20, competitorPressureScore: 42, monthlySearches: 680 });

  // ── Urgent / Action ──────────────────────────────────────────────────────────
  push({ keyword: `${offer} urgent`,            category: "urgent", intent: "Transactional", matchType: "Exact",  competition: "Low",    estimatedCpc: 5.20, competitorPressureScore: 38, monthlySearches: 180 });
  push({ keyword: `same day ${offer}`,          category: "urgent", intent: "Transactional", matchType: "Exact",  competition: "Medium", estimatedCpc: 6.00, competitorPressureScore: 50, monthlySearches: 140 });
  push({ keyword: `emergency ${offer}`,         category: "urgent", intent: "Transactional", matchType: "Exact",  competition: "Medium", estimatedCpc: 5.80, competitorPressureScore: 46, monthlySearches: 160 });
  push({ keyword: `fast ${offer}`,              category: "urgent", intent: "Transactional", matchType: "Phrase", competition: "Low",    estimatedCpc: 5.00, competitorPressureScore: 38, monthlySearches: 200 });
  push({ keyword: `${offer} immediately`,       category: "urgent", intent: "Transactional", matchType: "Phrase", competition: "Low",    estimatedCpc: 4.50, competitorPressureScore: 34, monthlySearches: 120 });

  // ── Replicate non-geo keywords for each additional selected country ───────────
  if (targetCountries.length > 1) {
    const baseRows = rows.filter((r) => r.country === main);
    for (const country of targetCountries.slice(1)) {
      for (const r of baseRows) {
        const key = `${r.keyword}|${country}`;
        if (!seen.has(key)) { seen.add(key); rows.push({ ...r, country }); }
      }
    }
  }

  // ── Build LibraryKeyword[] ───────────────────────────────────────────────────
  const now = new Date().toISOString();
  return rows.map((t) => {
    const derived = deriveKeywordFields({
      intent:                  t.intent,
      competition:             t.competition,
      competitorPressureScore: t.competitorPressureScore,
      estimatedCpc:            t.estimatedCpc,
    });
    return {
      id:                      nextKwId(),
      source:                  "generated" as const,
      packName:                "",
      category:                t.category,
      note:                    "",
      createdAt:               now,
      keyword:                 t.keyword,
      country:                 t.country,
      intent:                  t.intent,
      matchType:               t.matchType,
      monthlySearches:         t.monthlySearches,
      competition:             t.competition,
      estimatedCpc:            t.estimatedCpc,
      competitorPressureScore: t.competitorPressureScore,
      competitorExamples:      [],
      strategyNote:            "",
      recommendationNote:      "",
      exclude:                 false,
      forceBuy:                false,
      forceTest:               false,
      ...derived,
    } satisfies LibraryKeyword;
  });
}

// ─── Re-export ────────────────────────────────────────────────────────────────
export type { ProjectAssumptions };
