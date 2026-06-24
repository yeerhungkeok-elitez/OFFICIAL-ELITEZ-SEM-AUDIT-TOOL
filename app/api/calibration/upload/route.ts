// ─── POST /api/calibration/upload ─────────────────────────────────────────────
// Accepts a Google Ads "Search keyword report" CSV export (multipart/form-data)
// plus a projectId, parses it, upserts rows into historical_keyword_performance
// (append-with-overwrite via the unique constraint), then recomputes BOTH:
//   • calibration_benchmarks   — all-time blended CVR/CPA per category (unchanged)
//   • monthly_benchmarks       — per category × month series (new) + next-month
//                                forecast surfaced in the response.
//
// snapshot_date is month-first (e.g. 2026-04-01), so each monthly file is one
// snapshot and re-uploading a month overwrites it idempotently. Upload the three
// files (March/April/May) as three separate POSTs.
//
// Phase 1 loader. Phases 2/3 (n8n / live API) write the same tables and reuse
// these recompute fns — no change needed here.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseGoogleAdsCsv } from "@/lib/googleAdsCsv";
import { recomputeBenchmarks } from "@/lib/historicalCalibration";
import { recomputeMonthlyBenchmarks, forecastNextMonth } from "@/lib/monthlyBenchmarks";

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
    const { rows, snapshotDate, periodLabel, skipped } = parseGoogleAdsCsv(buf);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No keyword rows parsed. Is this a Google Ads 'Search keyword report' export?" },
        { status: 422 },
      );
    }

    // Upsert raw rows. onConflict matches the table's unique constraint so a
    // re-uploaded export overwrites duplicates instead of stacking them.
    const records = rows.map((r) => ({
      project_id:     projectId,
      snapshot_date:  snapshotDate,
      source:         "csv",
      keyword:        r.keyword,
      category:       r.category,
      campaign:       r.campaign,
      ad_group:       r.adGroup,
      match_type:     r.matchType,
      keyword_status: r.keywordStatus,
      status:         r.status,
      clicks:         r.clicks,
      impressions:    r.impressions,
      cost:           r.cost,
      conversions:    r.conversions,
      avg_cpc:        r.avgCpc,
      currency:       r.currency,
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

    // Recompute both rollups. All-time blend (existing engine input) + monthly
    // series (new). Then build the next-month forecast for the response.
    const benchmarks = await recomputeBenchmarks(projectId);
    await recomputeMonthlyBenchmarks(projectId);
    const forecast = await forecastNextMonth(projectId);

    return NextResponse.json({
      ok: true,
      snapshotDate,
      periodLabel,
      rowsIngested: rows.length,
      skipped,
      benchmarks: benchmarks
        .map((b) => ({
          category:    b.category,
          actualCtr:   +(b.actualCtr * 100).toFixed(1),
          actualCpc:   +b.actualCpc.toFixed(2),
          actualCvr:   +(b.actualCvr * 100).toFixed(1),
          blendedCvr:  +(b.blendedCvr * 100).toFixed(1),
          clicks:      b.clicks,
          impressions: b.impressions,
          confidence:  +b.confidence.toFixed(2),
        }))
        .sort((a, b) => b.actualCvr - a.actualCvr),
      forecast: forecast.map((f) => ({
        category:   f.category,
        trend:      f.trend,
        confidence: f.confidence,
        projected:  f.projected,
        months:     f.months.map((m) => ({
          month: m.periodMonth, clicks: m.clicks, cost: m.cost, conversions: m.conversions, cpc: +m.cpc.toFixed(2),
        })),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
