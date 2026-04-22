-- ─────────────────────────────────────────────────────────────────────────────
-- Elitez SEM Planner — Supabase Schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Projects ──────────────────────────────────────────────────────────────────

create table if not exists projects (
  id                 uuid        primary key default gen_random_uuid(),
  project_name       text        not null,
  website            text        not null default '',
  industry           text        not null default '',
  service_type       text        not null default '',
  objective          text        not null default '',
  monthly_budget     numeric     not null default 5000,
  target_countries   text[]      not null default '{}',
  avg_deal_size      numeric     not null default 10000,
  close_rate         numeric     not null default 20,
  lp_conversion_rate numeric     not null default 3.5,
  sql_rate           numeric     not null default 50,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Scenarios ─────────────────────────────────────────────────────────────────

create table if not exists scenarios (
  id                uuid        primary key default gen_random_uuid(),
  project_id        uuid        not null references projects(id) on delete cascade,
  name              text        not null,
  budget_multiplier numeric     not null default 1.0,
  cvr_multiplier    numeric     not null default 1.0,
  cpc_multiplier    numeric     not null default 1.0,
  notes             text        not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists scenarios_project_id_idx on scenarios(project_id);

-- ── Snapshots ─────────────────────────────────────────────────────────────────

create table if not exists snapshots (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references projects(id) on delete cascade,
  scenario_id   uuid        references scenarios(id) on delete set null,
  scenario_name text,
  title         text        not null,
  assumptions   jsonb       not null,
  summary       jsonb       not null,
  top_keywords  jsonb       not null default '[]',
  forecast_table jsonb      not null default '[]',
  created_at    timestamptz not null default now()
);

create index if not exists snapshots_project_id_idx  on snapshots(project_id);
create index if not exists snapshots_created_at_idx  on snapshots(created_at desc);

-- ── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_updated_at  on projects;
drop trigger if exists scenarios_updated_at on scenarios;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger scenarios_updated_at
  before update on scenarios
  for each row execute function update_updated_at();
