// ─── Snapshot Store ───────────────────────────────────────────────────────────
// Captures and persists point-in-time report snapshots.
// All data is frozen at save time — engines are never re-run on load.

import type { ProjectAssumptions } from "@/lib/projectStore";
import type { PriorityLevel } from "@/lib/keywordEngine";
import type { ForecastAssumptions } from "@/lib/forecastAssumptionsStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapshotSummary {
  budget:     number;
  clicks:     number;
  leads:      number;
  sql:        number;
  deals:      number;
  revenue:    number;
  cpl:        number;
  buyBudget:  number;
  testBudget: number;
  roi:        string;   // e.g. "4.2" or "—"
}

export interface SnapshotKeyword {
  id:                    number;
  keyword:               string;
  country:               string;
  action:                string;
  intent:                string;
  opportunityScore:      number;
  suggestedCpc:          number;
  suggestedMonthlyBudget: number;
  estimatedClicks:       number;
  estimatedLeads:        number;
  estimatedCpl:          number;
  revenuePotential:      number;
}

export interface SnapshotCountryForecast {
  country:    string;
  budget:     number;
  buyBudget:  number;
  testBudget: number;
  clicks:     number;
  leads:      number;
  cpl:        number;
  sql:        number;
  deals:      number;
  revenue:    number;
  priority:   PriorityLevel;
}

export interface Snapshot {
  id:                  string;
  projectId:           string;
  scenarioId:          string | null;
  scenarioName:        string | null;
  title:               string;
  createdAt:           string;   // ISO 8601
  assumptions:         ProjectAssumptions;
  forecastAssumptions?: ForecastAssumptions;
  summary:             SnapshotSummary;
  topKeywords:         SnapshotKeyword[];
  forecastTable:       SnapshotCountryForecast[];
}

// ─── Storage key ──────────────────────────────────────────────────────────────

const SNAPSHOTS_KEY = "elitez_snapshots";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readAll(): Snapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    return raw ? (JSON.parse(raw) as Snapshot[]) : [];
  } catch {
    return [];
  }
}

function writeAll(snapshots: Snapshot[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return all snapshots, newest first. */
export function getAllSnapshots(): Snapshot[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Return snapshots for a specific project, newest first. */
export function getSnapshotsByProject(projectId: string): Snapshot[] {
  return readAll()
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Return a single snapshot by id, or null. */
export function getSnapshotById(id: string): Snapshot | null {
  return readAll().find((s) => s.id === id) ?? null;
}

/** Persist a pre-built snapshot object. Returns the saved snapshot. */
export function saveSnapshot(snapshot: Omit<Snapshot, "id" | "createdAt">): Snapshot {
  const full: Snapshot = {
    ...snapshot,
    id:        makeId(),
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(full);
  writeAll(all);
  return full;
}

/** Delete a snapshot by id. */
export function deleteSnapshot(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id));
}

/** Update only the title of a snapshot. */
export function renameSnapshot(id: string, title: string): void {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], title };
    writeAll(all);
  }
}
