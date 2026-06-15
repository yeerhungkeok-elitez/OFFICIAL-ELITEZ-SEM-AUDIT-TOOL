// ─── POST /api/calibration/upload ─────────────────────────────────────────────
// Accepts a Google Ads "Search keyword" CSV export (multipart/form-data) plus a
// projectId, parses it, upserts rows into historical_keyword_performance
// (append-with-overwrite via the unique constraint), then recomputes
// calibration_benchmarks for the project.
//
// Phase 1 loader. Phases 2/3 (n8n / live API) write the same table and reuse
// recomputeBenchmarks — no change needed here.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseGoogleAdsCsv } from "@/lib/googleAdsCsv";
import { recomputeBenchmarks } from "@/lib/historicalCalibration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = form.get("projectId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded (field 'file')." }, { status: 400 });
    }
    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const { rows, snapshotDate, skipped } = parseGoogleAdsCsv(buf);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No keyword rows parsed. Is this a Google Ads 'Search keyword' export?" },
        { status: 422 },
      );
    }

    // Upsert raw rows. onConflict matches the table's unique constraint so a
    // re-uploaded export overwrites duplicates instead of stacking them.
    const records = rows.map((r) => ({
      project_id:    projectId,
      snapshot_date: snapshotDate,
      source:        "csv",
      keyword:       r.keyword,
      category:      r.category,
      campaign:      r.campaign,
      ad_group:      r.adGroup,
      match_type:    r.matchType,
      clicks:        r.clicks,
      impressions:   r.impressions,
      cost:          r.cost,
      conversions:   r.conversions,
    }));

    // Deduplicate within the batch — Postgres rejects ON CONFLICT DO UPDATE when
    // two source rows target the same unique key in one statement.
    const dedupMap = new Map<string, typeof records[number]>();
    for (const rec of records) {
      dedupMap.set(`${rec.snapshot_date}|${rec.keyword}|${rec.campaign}|${rec.match_type}`, rec);
    }
    const deduped = Array.from(dedupMap.values());

    // Chunk to stay clear of payload limits on large exports.
    const CHUNK = 500;
    for (let i = 0; i < deduped.length; i += CHUNK) {
      const { error } = await supabase
        .from("semaudit_historical_keyword_performance")
        .upsert(deduped.slice(i, i + CHUNK), {
          onConflict: "project_id,snapshot_date,keyword,campaign,match_type",
        });
      if (error) {
        return NextResponse.json({ error: `Write failed: ${error.message}` }, { status: 500 });
      }
    }

    const benchmarks = await recomputeBenchmarks(projectId);

    return NextResponse.json({
      ok: true,
      snapshotDate,
      rowsIngested: rows.length,
      skipped,
      benchmarks: benchmarks
        .map((b) => ({
          category:   b.category,
          actualCvr:  +(b.actualCvr * 100).toFixed(1),
          blendedCvr: +(b.blendedCvr * 100).toFixed(1),
          clicks:     b.clicks,
          confidence: +b.confidence.toFixed(2),
        }))
        .sort((a, b) => b.actualCvr - a.actualCvr),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
