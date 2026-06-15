// ─── Google Ads CSV Parser ────────────────────────────────────────────────────
// Parses the Google Ads "Search keyword" export. That file is UTF-16LE,
// tab-delimited, with 2 metadata lines before the header. Quoted numbers
// ("2,573") and percentages ("14.81%") are normalised to plain floats.
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
  clicks:      number;
  impressions: number;
  cost:        number;
  conversions: number;
}

export interface ParseResult {
  rows:         ParsedPerfRow[];
  snapshotDate: string;   // ISO yyyy-mm-dd, parsed from the export's date-range line
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

/** Parse the date-range line (e.g. `"June 15, 2025 - June 15, 2026"`) → end date ISO. */
function parseSnapshotDate(line: string): string {
  const m = line.match(/-\s*([A-Za-z]+ \d{1,2}, \d{4})/);
  if (m) {
    const d = new Date(m[1]);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function parseGoogleAdsCsv(buf: ArrayBuffer): ParseResult {
  const text = decodeExport(buf);
  const allLines = text.split(/\r?\n/);

  // Locate the header row (starts with "Search keyword\t..."); metadata lines precede it.
  let headerIdx = allLines.findIndex(
    (l) => l.startsWith("Search keyword\t") && l.includes("Clicks"),
  );
  if (headerIdx === -1) headerIdx = 2; // fallback to known layout

  const dateLine = allLines.slice(0, headerIdx).find((l) => /\d{4}/.test(l)) ?? "";
  const snapshotDate = parseSnapshotDate(dateLine);

  const header = allLines[headerIdx].split("\t").map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);

  const idx = {
    keyword:     col("Search keyword"),
    matchType:   col("Search keyword match type"),
    campaign:    col("Campaign"),
    adGroup:     col("Ad group"),
    clicks:      col("Clicks"),
    impressions: col("Impr."),
    cost:        col("Cost"),
    conversions: col("Conversions"),
  };

  const rows: ParsedPerfRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (!line.trim()) continue;
    const c = line.split("\t");
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
    });
  }

  return { rows, snapshotDate, skipped };
}
