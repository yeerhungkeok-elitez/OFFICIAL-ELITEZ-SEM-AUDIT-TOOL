// ─── Google Ads CSV Parser ────────────────────────────────────────────────────
// Parses the Google Ads "Search keyword report" export. That file is UTF-16LE,
// tab-delimited, with 2 metadata lines before the header. Quoted numbers
// ("2,573") and percentages ("14.81%") are normalised to plain floats.
//
// SUPPORTS TWO EXPORT LAYOUTS (column names changed in the 2026 Ads UI):
//   NEW: Keyword status | Keyword | Match type | … | Impr. | Interactions | …
//        | Currency code | Avg. cost | Cost | Conv. rate | Conversions | …
//   OLD: Search keyword | Search keyword match type | … | Clicks | Impr. | Cost | …
// Column resolution is alias-based (`pick`), so both layouts parse correctly.
//
// MONTH HANDLING: the only month indicator is row 2's date-range line, e.g.
//   "April 1, 2026 - April 30, 2026"
// We take the START date and snap it to the first of the month so each monthly
// upload lands on a stable snapshot_date (2026-04-01) regardless of export day.
//
// Categorisation is campaign/ad-group driven (MVP grain = category only):
//   brand      → campaign or ad group contains "brand"
//   competitor → contains "competitor"
//   service    → contains "generic" or "recruitment search"
//   other      → everything else

export type PerfCategory = "brand" | "service" | "competitor" | "other";

export interface ParsedPerfRow {
  keyword:     string;
  category:    PerfCategory;
  campaign:    string;
  adGroup:     string;
  matchType:   string;
  clicks:      number;   // "Interactions" in the new export, "Clicks" in the old
  impressions: number;
  cost:        number;
  conversions: number;
  avgCpc:      number;   // "Avg. cost" — actual per-click cost for this row
  currency:    string;   // "Currency code", e.g. "MYR"
}

export interface ParseResult {
  rows:         ParsedPerfRow[];
  snapshotDate: string;   // ISO yyyy-mm-01, month-first, parsed from the date-range line
  periodLabel:  string;   // raw date-range string, for UI display / audit
  skipped:      number;
}

function num(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/["%,]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function categorize(campaign: string, adGroup: string): PerfCategory {
  const s = `${campaign} ${adGroup}`.toLowerCase();
  if (s.includes("brand")) return "brand";
  if (s.includes("competitor")) return "competitor";
  if (s.includes("generic") || s.includes("recruitment search")) return "service";
  return "other";
}

/**
 * Decode a Google Ads export to text. Handles UTF-16LE (with or without BOM),
 * which is what the Ads UI produces, falling back to UTF-8.
 */
export function decodeExport(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // UTF-16LE BOM = FF FE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  // Heuristic: many NUL bytes in even positions ⇒ UTF-16LE without BOM
  let nulls = 0;
  for (let i = 1; i < Math.min(bytes.length, 200); i += 2) {
    if (bytes[i] === 0x00) nulls++;
  }
  if (nulls > 30) return new TextDecoder("utf-16le").decode(buf);
  return new TextDecoder("utf-8").decode(buf);
}

/**
 * Parse the date-range line (e.g. `"April 1, 2026 - April 30, 2026"`) and return
 * the FIRST of that month as ISO yyyy-mm-01. Falls back to the current month.
 */
function parseSnapshotMonth(line: string): string {
  // Grab the first "Month D, YYYY" token (the period START).
  const m = line.match(/([A-Za-z]+\s+\d{1,2},\s*\d{4})/);
  const d = m ? new Date(m[1]) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  const y = safe.getFullYear();
  const mo = String(safe.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}-01`;
}

export function parseGoogleAdsCsv(buf: ArrayBuffer): ParseResult {
  const text = decodeExport(buf);
  const allLines = text.split(/\r?\n/);

  // Locate the header row: a tab-delimited line that has a Keyword column AND a
  // Cost column. Works for both the new ("Keyword status\t…") and old
  // ("Search keyword\t…") layouts. Metadata lines (title + date range) precede it.
  let headerIdx = allLines.findIndex(
    (l) =>
      /\t/.test(l) &&
      (l.startsWith("Keyword status\t") || l.startsWith("Search keyword\t")) &&
      l.includes("Cost"),
  );
  if (headerIdx === -1) headerIdx = 2; // fallback to known layout

  // Date-range line is the metadata line (above the header) that contains a year.
  const dateLine =
    allLines.slice(0, headerIdx).find((l) => /\d{4}/.test(l))?.replace(/"/g, "").trim() ?? "";
  const snapshotDate = parseSnapshotMonth(dateLine);

  const header = allLines[headerIdx].split("\t").map((h) => h.trim());

  // Alias-aware column resolver: first matching name wins.
  const pick = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const idx = {
    keyword:     pick("Keyword", "Search keyword"),
    matchType:   pick("Match type", "Search keyword match type"),
    campaign:    pick("Campaign"),
    adGroup:     pick("Ad group"),
    clicks:      pick("Interactions", "Clicks"), // Interactions is the new clicks column
    impressions: pick("Impr."),
    cost:        pick("Cost"),
    conversions: pick("Conversions"),
    avgCpc:      pick("Avg. cost"),
    currency:    pick("Currency code"),
  };

  const rows: ParsedPerfRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (!line.trim()) continue;
    const c = line.split("\t");

    const statusCell = (c[0] ?? "").trim();
    // Skip the "Total: …" summary block at the foot of the report.
    if (statusCell.startsWith("Total:")) { skipped++; continue; }

    const keyword = (c[idx.keyword] ?? "").trim();
    if (!keyword) { skipped++; continue; }

    const campaign = (c[idx.campaign] ?? "").trim();
    const adGroup  = (c[idx.adGroup]  ?? "").trim();

    rows.push({
      keyword,
      category:    categorize(campaign, adGroup),
      campaign,
      adGroup,
      matchType:   (c[idx.matchType] ?? "").trim(),
      clicks:      num(c[idx.clicks]),
      impressions: num(c[idx.impressions]),
      cost:        num(c[idx.cost]),
      conversions: num(c[idx.conversions]),
      avgCpc:      idx.avgCpc   !== -1 ? num(c[idx.avgCpc]) : 0,
      currency:    idx.currency !== -1 ? (c[idx.currency] ?? "").trim() : "",
    });
  }

  return { rows, snapshotDate, periodLabel: dateLine, skipped };
}
