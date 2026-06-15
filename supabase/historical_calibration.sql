-- ─────────────────────────────────────────────────────────────────────────────
-- Elitez SEM Planner — Historical Performance & Calibration
-- Run once in Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Architecture: this is the "storage of truth". The CSV upload (Phase 1),
-- n8n scheduled pull (Phase 2), and live Google Ads API (Phase 3) all write
-- into semaudit_historical_keyword_performance. The forecast engine reads ONLY
-- from semaudit_calibration_benchmarks. The loader is swappable; the engine
-- never changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Raw historical rows ───────────────────────────────────────────────────────
-- One row per keyword × campaign × snapshot. `source` distinguishes CSV from
-- API rows so later phases coexist with MVP data.

create table if not exists semaudit_historical_keyword_performance (
  id              uuid        primary key default gen_random_uuid(),
  project_id      uuid        not null,
  snapshot_date   date        not null,
  source          text        not null default 'csv',   -- 'csv' | 'n8n' | 'google_ads_api'
  keyword         text        not null,
  category        text        not null,                  -- 'brand' | 'service' | 'competitor' | 'other'
  campaign        text        not null default '',
  ad_group        text        not null default '',
  match_type      text        not null default '',
  country         text        not null default '',       -- reserved for Phase grain upgrade
  clicks          numeric     not null default 0,
  impressions     numeric     not null default 0,
  cost            numeric     not null default 0,
  conversions     numeric     not null default 0,
  created_at      timestamptz not null default now(),

  -- Append-with-overwrite: a re-uploaded export overwrites the same logical row
  -- (same keyword+campaign+date for a project) instead of duplicating it.
  unique (project_id, snapshot_date, keyword, campaign, match_type)
);

create index if not exists semaudit_hkp_project_idx  on semaudit_historical_keyword_performance(project_id);
create index if not exists semaudit_hkp_category_idx on semaudit_historical_keyword_performance(category);
create index if not exists semaudit_hkp_snapshot_idx on semaudit_historical_keyword_performance(snapshot_date desc);

-- ── Calibration benchmarks (category grain, MVP) ──────────────────────────────
-- Rolled-up actuals the forecast engine reads. One row per project × category.
-- Recomputed on every upload. cvr = conversions/clicks, cpa = cost/conversions.

create table if not exists semaudit_calibration_benchmarks (
  id              uuid        primary key default gen_random_uuid(),
  project_id      uuid        not null,
  category        text        not null,
  total_clicks    numeric     not null default 0,
  total_conv      numeric     not null default 0,
  total_cost      numeric     not null default 0,
  actual_cvr      numeric     not null default 0,        -- conversions / clicks
  actual_cpa      numeric     not null default 0,        -- cost / conversions
  confidence      numeric     not null default 0,        -- min(1, clicks/200)
  last_snapshot   date,
  updated_at      timestamptz not null default now(),

  unique (project_id, category)
);

create index if not exists semaudit_cb_project_idx on semaudit_calibration_benchmarks(project_id);

-- ── RLS: disabled on both tables (internal tool — anon key writes) ────────────
-- The upload API route uses the anon key from lib/supabase.ts. If RLS were on
-- without explicit insert/update policies for anon, upserts would fail silently.

alter table semaudit_historical_keyword_performance disable row level security;
alter table semaudit_calibration_benchmarks         disable row level security;
