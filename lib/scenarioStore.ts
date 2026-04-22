import type { ProjectAssumptions } from "@/lib/projectStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  projectId: string;
  name: string;
  budgetMultiplier: number;
  cvrMultiplier: number;
  cpcMultiplier: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ScenarioDraft = Omit<Scenario, "id" | "projectId" | "createdAt" | "updatedAt">;

// ─── Constants ────────────────────────────────────────────────────────────────

const SCENARIOS_KEY = "elitez_scenarios";
const ACTIVE_SCENARIO_KEY = (projectId: string) =>
  `elitez_active_scenario_${projectId}`;

export const DEFAULT_SCENARIO_TEMPLATES: ScenarioDraft[] = [
  {
    name:             "Conservative",
    budgetMultiplier: 0.7,
    cvrMultiplier:    0.9,
    cpcMultiplier:    1.0,
    notes:            "Lower budget, slightly reduced conversion rate. Good for risk-averse planning.",
  },
  {
    name:             "Balanced",
    budgetMultiplier: 1.0,
    cvrMultiplier:    1.0,
    cpcMultiplier:    1.0,
    notes:            "Baseline assumptions from project settings. No adjustments applied.",
  },
  {
    name:             "Aggressive",
    budgetMultiplier: 1.3,
    cvrMultiplier:    1.05,
    cpcMultiplier:    1.1,
    notes:            "Higher budget and bids, with a modest CVR improvement. Best-case growth scenario.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readAll(): Scenario[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SCENARIOS_KEY) ?? "[]") as Scenario[];
  } catch {
    return [];
  }
}

function writeAll(scenarios: Scenario[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function getScenariosByProject(projectId: string): Scenario[] {
  return readAll().filter((s) => s.projectId === projectId);
}

export function getScenarioById(
  projectId: string,
  scenarioId: string
): Scenario | null {
  return (
    readAll().find((s) => s.projectId === projectId && s.id === scenarioId) ??
    null
  );
}

export function saveScenario(projectId: string, draft: ScenarioDraft): Scenario {
  const now = new Date().toISOString();
  const scenario: Scenario = {
    ...draft,
    id: genId(),
    projectId,
    createdAt: now,
    updatedAt: now,
  };
  writeAll([...readAll(), scenario]);
  return scenario;
}

export function updateScenario(
  projectId: string,
  scenarioId: string,
  patch: Partial<ScenarioDraft>
): Scenario | null {
  const all = readAll();
  const idx = all.findIndex(
    (s) => s.projectId === projectId && s.id === scenarioId
  );
  if (idx === -1) return null;
  const updated: Scenario = {
    ...all[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeAll(all);
  return updated;
}

export function deleteScenario(projectId: string, scenarioId: string): void {
  writeAll(readAll().filter((s) => !(s.projectId === projectId && s.id === scenarioId)));
  if (typeof window !== "undefined") {
    const activeKey = ACTIVE_SCENARIO_KEY(projectId);
    if (localStorage.getItem(activeKey) === scenarioId) {
      localStorage.removeItem(activeKey);
    }
  }
}

// ─── Active scenario ──────────────────────────────────────────────────────────

export function getActiveScenarioId(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_SCENARIO_KEY(projectId));
}

export function setActiveScenarioId(projectId: string, scenarioId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_SCENARIO_KEY(projectId), scenarioId);
}

/**
 * Returns the active scenario for a project.
 * Falls back to "Balanced", then the first available scenario.
 */
export function getActiveScenario(projectId: string): Scenario | null {
  const scenarios = getScenariosByProject(projectId);
  if (scenarios.length === 0) return null;

  const activeId = getActiveScenarioId(projectId);
  if (activeId) {
    const match = scenarios.find((s) => s.id === activeId);
    if (match) return match;
  }

  const balanced = scenarios.find((s) => s.name === "Balanced");
  if (balanced) {
    setActiveScenarioId(projectId, balanced.id);
    return balanced;
  }

  setActiveScenarioId(projectId, scenarios[0].id);
  return scenarios[0];
}

// ─── Bootstrap defaults ───────────────────────────────────────────────────────

/**
 * Creates the 3 default scenarios for a project if none exist yet.
 * Safe to call multiple times (idempotent).
 */
export function ensureDefaultScenarios(projectId: string): void {
  const existing = getScenariosByProject(projectId);
  if (existing.length > 0) return;
  for (const template of DEFAULT_SCENARIO_TEMPLATES) {
    saveScenario(projectId, template);
  }
}

// ─── Apply scenario to assumptions ────────────────────────────────────────────

/**
 * Returns a modified copy of ProjectAssumptions with scenario multipliers applied.
 * budgetMultiplier → monthlyBudget
 * cvrMultiplier    → lpConversionRate
 * (cpcMultiplier is applied per-keyword at call sites, not here)
 */
export function applyScenario(
  assumptions: ProjectAssumptions,
  scenario: Scenario
): ProjectAssumptions {
  return {
    ...assumptions,
    monthlyBudget:    assumptions.monthlyBudget    * scenario.budgetMultiplier,
    lpConversionRate: assumptions.lpConversionRate * scenario.cvrMultiplier,
  };
}
