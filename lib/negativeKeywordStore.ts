// ─── Negative Keyword Store ───────────────────────────────────────────────────
// localStorage store for negative keyword planning at project, campaign, and
// ad group level. Negatives are informational — they suppress matching positive
// keywords from forecast totals to surface overblocking risks.

const NEGATIVES_KEY = "elitez_negative_keywords";

export type NegLevel     = "project" | "campaign" | "adGroup";
export type NegMatchType = "exact" | "phrase" | "broad";
export type NegSource    = "manual" | "suggested";

export interface NegativeKeyword {
  id:          string;
  text:        string;
  level:       NegLevel;
  campaignId?: string;   // required when level === "campaign"
  adGroupId?:  string;   // required when level === "adGroup"
  matchType:   NegMatchType;
  source:      NegSource;
  note?:       string;
  createdAt:   string;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getNegativeKeywords(): NegativeKeyword[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(NEGATIVES_KEY) ?? "[]"); } catch { return []; }
}

export function saveNegativeKeywords(list: NegativeKeyword[]): void {
  if (typeof window !== "undefined") localStorage.setItem(NEGATIVES_KEY, JSON.stringify(list));
}

export function addNegativeKeyword(
  draft: Omit<NegativeKeyword, "id" | "createdAt">,
): NegativeKeyword {
  const kw: NegativeKeyword = { ...draft, id: uid(), createdAt: new Date().toISOString() };
  const list = getNegativeKeywords();
  list.push(kw);
  saveNegativeKeywords(list);
  return kw;
}

export function updateNegativeKeyword(
  id:    string,
  patch: Partial<Omit<NegativeKeyword, "id" | "createdAt">>,
): void {
  saveNegativeKeywords(getNegativeKeywords().map((k) => k.id === id ? { ...k, ...patch } : k));
}

export function deleteNegativeKeyword(id: string): void {
  saveNegativeKeywords(getNegativeKeywords().filter((k) => k.id !== id));
}

// ─── Suppression logic ────────────────────────────────────────────────────────
//
// Match semantics (simplified from Google Ads negative match types):
//   exact  — keyword text must exactly equal the negative text (case-insensitive)
//   phrase — negative text must appear as a contiguous sequence in the keyword
//   broad  — every word in the negative must appear in the keyword (any order)
//
// Scoping: project-level negatives apply everywhere; campaign/adGroup-level
// negatives only apply to keywords assigned to that campaign/ad group.

export function isKeywordSuppressed(
  kwText:       string,
  kwCampaignId: string | undefined,
  kwAdGroupId:  string | undefined,
  negatives:    NegativeKeyword[],
): boolean {
  if (negatives.length === 0) return false;
  const text = kwText.toLowerCase().trim();

  for (const neg of negatives) {
    // Scope filter
    if (neg.level === "campaign" && neg.campaignId !== kwCampaignId) continue;
    if (neg.level === "adGroup"  && neg.adGroupId  !== kwAdGroupId)  continue;

    const n = neg.text.toLowerCase().trim();
    if (!n) continue;

    let hit = false;
    switch (neg.matchType) {
      case "exact":
        hit = text === n;
        break;
      case "phrase":
        hit = text.includes(n);
        break;
      case "broad":
        // All words in the negative must be present in the keyword (any order)
        hit = n.split(/\s+/).every((word) => text.includes(word));
        break;
    }
    if (hit) return true;
  }
  return false;
}

// ─── Suggested negative packs ─────────────────────────────────────────────────

export interface NegativePack {
  name:        string;
  description: string;
  matchType:   NegMatchType;
  terms:       string[];
}

export const NEGATIVE_PACKS: NegativePack[] = [
  {
    name:        "Job Seeker Terms",
    description: "Prevents ads from showing to people looking for employment rather than purchasing your service.",
    matchType:   "broad",
    terms: [
      "jobs", "job openings", "careers", "career opportunities",
      "hiring", "apply now", "vacancy", "vacancies",
      "internship", "apprenticeship", "part time", "full time",
    ],
  },
  {
    name:        "Salary & Compensation",
    description: "Excludes searches about wages or pay packages — people researching employment terms, not buying.",
    matchType:   "phrase",
    terms: [
      "salary", "salaries", "wage", "wages", "pay scale",
      "hourly rate", "annual pay", "compensation package", "bonus",
    ],
  },
  {
    name:        "Free / No Cost",
    description: "Filters out budget-sensitive searchers looking for free solutions rather than paid services.",
    matchType:   "broad",
    terms: [
      "free", "no cost", "gratis", "complimentary",
      "cheap", "low cost", "budget", "discount", "affordable",
    ],
  },
  {
    name:        "DIY / Template",
    description: "Removes people looking to do it themselves — they are unlikely to purchase your service.",
    matchType:   "phrase",
    terms: [
      "template", "diy", "do it yourself",
      "how to", "free software", "free tool", "tutorial",
    ],
  },
  {
    name:        "Informational Research",
    description: "Top-of-funnel educational queries with low purchase intent — reduces wasted impressions.",
    matchType:   "phrase",
    terms: [
      "what is", "what are", "definition", "meaning",
      "explained", "wikipedia", "overview", "introduction", "example",
    ],
  },
];
