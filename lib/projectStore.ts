// ─── Multi-Project Store ──────────────────────────────────────────────────────
// localStorage-based multi-project storage for the SEM Planner.
// All functions are SSR-safe (guarded by typeof window checks).

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  projectName: string;
  website: string;
  industry: string;
  serviceType: string;
  objective: string;
  monthlyBudget: number;
  targetCountries: string[];
  avgDealSize: number;
  closeRate: number;        // percentage, e.g. 20 = 20%
  lpConversionRate: number; // percentage, e.g. 3.5 = 3.5%
  sqlRate: number;          // percentage, e.g. 50 = 50%
  // Business classification — used for keyword relevance scoring
  businessType:   string;   // e.g. "B2B", "B2C"
  offerType:      string;   // e.g. "SaaS", "Professional Service"
  targetAudience: string;   // e.g. "SMBs", "Enterprise"
  geoFocus:       string;   // e.g. "Local", "Global"
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
}

/** Input when creating or updating — id and timestamps are managed internally. */
export type ProjectDraft = Omit<Project, "id" | "createdAt" | "updatedAt">;

/** Minimal fields consumed by the forecast and keyword engines. */
export interface ProjectAssumptions {
  projectName: string;
  monthlyBudget: number;
  targetCountries: string[];
  avgDealSize: number;
  closeRate: number;
  lpConversionRate: number;
}

export const PROJECT_DEFAULTS: ProjectAssumptions = {
  projectName:      "",
  monthlyBudget:    5000,
  targetCountries:  ["Singapore", "Malaysia", "Vietnam", "Thailand"],
  avgDealSize:      10000,
  closeRate:        20,
  lpConversionRate: 3.5,
};

/** Convert a stored Project to the slim ProjectAssumptions used by engines. */
export function projectToAssumptions(project: Project): ProjectAssumptions {
  return {
    projectName:      project.projectName,
    monthlyBudget:    project.monthlyBudget,
    targetCountries:  project.targetCountries,
    avgDealSize:      project.avgDealSize,
    closeRate:        project.closeRate,
    lpConversionRate: project.lpConversionRate,
  };
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const PROJECTS_KEY = "elitez_projects";
const ACTIVE_KEY   = "elitez_active_project_id";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readAll(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function writeAll(projects: Project[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return all stored projects. */
export function getAllProjects(): Project[] {
  return readAll();
}

/** Return a single project by id, or null if not found. */
export function getProjectById(id: string): Project | null {
  return readAll().find((p) => p.id === id) ?? null;
}

/** Create and persist a new project. Returns the created project (with id + timestamps). */
export function saveProject(draft: ProjectDraft): Project {
  const now = new Date().toISOString();
  const project: Project = { ...draft, id: makeId(), createdAt: now, updatedAt: now };
  const all = readAll();
  all.push(project);
  writeAll(all);
  return project;
}

/** Update an existing project by id. Returns the updated project, or null if not found. */
export function updateProject(id: string, patch: Partial<ProjectDraft>): Project | null {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[idx];
}

/** Delete a project by id. Auto-selects first remaining project as active. */
export function deleteProject(id: string): void {
  const remaining = readAll().filter((p) => p.id !== id);
  writeAll(remaining);
  if (getActiveProjectId() === id) {
    if (remaining.length > 0) {
      setActiveProjectId(remaining[0].id);
    } else {
      if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_KEY);
    }
  }
}

/** Return the currently active project id, or null. */
export function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

/** Set the active project id. */
export function setActiveProjectId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, id);
}

/**
 * Return the currently active project.
 * If no active id is set but projects exist, auto-selects the first one.
 */
export function getActiveProject(): Project | null {
  const id = getActiveProjectId();
  if (id) return getProjectById(id);
  // Auto-select first available project
  const all = readAll();
  if (all.length > 0) {
    setActiveProjectId(all[0].id);
    return all[0];
  }
  return null;
}
