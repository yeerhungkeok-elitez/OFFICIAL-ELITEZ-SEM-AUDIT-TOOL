import { supabase } from "@/lib/supabase";
import type { WorkspaceKeyword } from "@/lib/keywordLibrary";

type DerivedCategory = "brand" | "competitor" | "highIntent" | "generic";

function deriveCategory(category: string): DerivedCategory {
  if (category === "brand" || category === "competitor" || category === "highIntent") {
    return category;
  }
  return "generic";
}

function mapMatchType(raw: string): "Exact" | "Phrase" | "Broad" {
  const upper = (raw ?? "").toUpperCase();
  if (upper === "EXACT") return "Exact";
  if (upper === "PHRASE") return "Phrase";
  return "Broad";
}

interface RowGroup {
  keyword:          string;
  matchType:        "Exact" | "Phrase" | "Broad";
  derivedCategory:  DerivedCategory;
  totalClicks:      number;
  totalImpressions: number;
  totalCost:        number;
  totalConversions: number;
  dates:            Set<string>;
  firstCountry:     string;
}

export async function loadHistoricalKeywords(projectId: string): Promise<WorkspaceKeyword[]> {
  const { data, error } = await supabase
    .from("semaudit_historical_keyword_performance")
    .select("keyword, match_type, category, country, clicks, impressions, cost, conversions, snapshot_date")
    .eq("project_id", projectId)
    .gt("impressions", 0);

  if (error || !data) return [];

  const groups = new Map<string, RowGroup>();

  for (const row of data) {
    const derivedCategory = deriveCategory(row.category ?? "");
    const matchType       = mapMatchType(row.match_type ?? "");
    const groupKey        = `${row.keyword ?? ""}||${matchType}||${derivedCategory}`;

    const existing = groups.get(groupKey);
    if (existing) {
      existing.totalClicks      += Number(row.clicks      ?? 0);
      existing.totalImpressions += Number(row.impressions ?? 0);
      existing.totalCost        += Number(row.cost        ?? 0);
      existing.totalConversions += Number(row.conversions ?? 0);
      if (row.snapshot_date) existing.dates.add(String(row.snapshot_date));
      if (!existing.firstCountry && row.country) existing.firstCountry = String(row.country);
    } else {
      groups.set(groupKey, {
        keyword:          String(row.keyword  ?? ""),
        matchType,
        derivedCategory,
        totalClicks:      Number(row.clicks      ?? 0),
        totalImpressions: Number(row.impressions ?? 0),
        totalCost:        Number(row.cost        ?? 0),
        totalConversions: Number(row.conversions ?? 0),
        dates:            new Set(row.snapshot_date ? [String(row.snapshot_date)] : []),
        firstCountry:     String(row.country ?? ""),
      });
    }
  }

  const results: WorkspaceKeyword[] = [];
  let idx = 0;

  for (const group of Array.from(groups.values())) {
    const distinctMonths = Math.max(1, group.dates.size);
    const avgCpc         = group.totalClicks > 0 ? group.totalCost / group.totalClicks : 1.0;

    const intent: WorkspaceKeyword["intent"] =
      group.derivedCategory === "brand"      ? "Navigational"  :
      group.derivedCategory === "highIntent" ? "Transactional" :
      "Commercial";

    const category: WorkspaceKeyword["category"] =
      group.derivedCategory === "brand"      ? "brand"      :
      group.derivedCategory === "competitor" ? "competitor" :
      "commercial";

    results.push({
      id:                      idx++,
      source:                  "imported",
      keyword:                 group.keyword,
      matchType:               group.matchType,
      effectiveMatchType:      group.matchType,
      matchTypeInherited:      false,
      monthlySearches:         Math.max(1, Math.round(group.totalImpressions / distinctMonths)),
      estimatedCpc:            avgCpc,
      suggestedCpc:            avgCpc,
      action:                  "Buy",
      effectiveAction:         "Buy",
      competitorPressureScore: 50,
      opportunityScore:        Math.min(100, Math.round((group.totalClicks / 500) * 100)),
      competition:             "Medium",
      competitorPressure:      "Medium",
      adCrowdingLevel:         "Medium",
      competitiveDifficulty:   "Moderate",
      intent,
      category,
      campaignGroup:           group.derivedCategory === "highIntent" ? "highIntent" :
                               group.derivedCategory === "generic"    ? "generic"    : undefined,
      country:                 group.firstCountry,
      isLibrary:               false,
      exclude:                 false,
      forceBuy:                false,
      forceTest:               false,
      note:                    "",
      packName:                "",
      strategyNote:            "",
      recommendationNote:      "",
      competitorExamples:      [],
    });
  }

  return results;
}
