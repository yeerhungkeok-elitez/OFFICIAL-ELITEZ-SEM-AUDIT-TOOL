"use client";

// ─── App Context ──────────────────────────────────────────────────────────────
// Single source of truth for active project and active scenario.
// Eliminates page reloads on switch — consumers re-render reactively.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  getAllProjects,
  getActiveProject,
  getProjectById,
  setActiveProjectId,
  type Project,
} from "@/lib/projectStore";
import {
  getScenariosByProject,
  getActiveScenario,
  getActiveScenarioId,
  setActiveScenarioId,
  ensureDefaultScenarios,
  type Scenario,
} from "@/lib/scenarioStore";
import { loadBlendedBenchmarks, type CalibrationMap } from "@/lib/historicalCalibration";
import { forecastNextMonth, type CategoryForecast } from "@/lib/monthlyBenchmarks";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppContextValue {
  // Data
  projects:       Project[];
  activeProject:  Project | null;
  scenarios:      Scenario[];        // scenarios for the active project
  activeScenario: Scenario | null;

  // Mutators — write to localStorage and update state reactively
  setActiveProject:  (id: string) => void;
  setActiveScenario: (id: string) => void;

  // Refresh helpers — call after external mutations (create/edit/delete)
  refreshProjects:    () => void;
  refreshScenarios:   () => void;
  refreshCalibration: () => void;

  // Calibration — full CalibrationMap + monthly forecast loaded from Supabase
  calibration:     CalibrationMap | null;
  monthlyForecast: CategoryForecast[] | null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside <AppProvider>");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  const [projects,       setProjects]            = useState<Project[]>([]);
  const [activeProject,  setActiveProjectState]  = useState<Project | null>(null);
  const [scenarios,      setScenarios]           = useState<Scenario[]>([]);
  const [activeScenario, setActiveScenarioState] = useState<Scenario | null>(null);
  const [calibration,     setCalibration]     = useState<CalibrationMap | null>(null);
  const [monthlyForecast, setMonthlyForecast] = useState<CategoryForecast[] | null>(null);

  // ─── Internal: load scenarios for a project ───────────────────────────────

  const loadScenarios = useCallback((projectId: string) => {
    ensureDefaultScenarios(projectId);
    const list = getScenariosByProject(projectId);
    setScenarios(list);
    setActiveScenarioState(getActiveScenario(projectId));
  }, []);

  // ─── Bootstrap on mount ───────────────────────────────────────────────────

  useEffect(() => {
    const allProjects = getAllProjects();
    const proj        = getActiveProject();   // auto-selects first if none set
    setProjects(allProjects);
    setActiveProjectState(proj);
    if (proj) loadScenarios(proj.id);
  }, [loadScenarios]);

  // ─── Calibration: reload blended CVR map when active project changes ─────

  useEffect(() => {
    if (!activeProject) { setCalibration(null); setMonthlyForecast(null); return; }
    loadBlendedBenchmarks(activeProject.id).then(setCalibration);
    forecastNextMonth(activeProject.id).then(setMonthlyForecast);
  }, [activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Public mutators ──────────────────────────────────────────────────────

  const setActiveProject = useCallback((id: string) => {
    setActiveProjectId(id);
    const proj = getProjectById(id) ?? null;
    setActiveProjectState(proj);
    if (proj) {
      loadScenarios(proj.id);
    } else {
      setScenarios([]);
      setActiveScenarioState(null);
    }
  }, [loadScenarios]);

  const setActiveScenario = useCallback((id: string) => {
    if (!activeProject) return;
    setActiveScenarioId(activeProject.id, id);
    const scenario = scenarios.find((s) => s.id === id) ?? null;
    setActiveScenarioState(scenario);
  }, [activeProject, scenarios]);

  // ─── Refresh helpers (call after external create/edit/delete) ────────────

  const refreshProjects = useCallback(() => {
    const allProjects = getAllProjects();
    const proj        = getActiveProject();
    setProjects(allProjects);
    setActiveProjectState(proj);
    if (proj) loadScenarios(proj.id);
    else { setScenarios([]); setActiveScenarioState(null); }
  }, [loadScenarios]);

  const refreshScenarios = useCallback(() => {
    if (!activeProject) return;
    const list = getScenariosByProject(activeProject.id);
    setScenarios(list);
    const activeId = getActiveScenarioId(activeProject.id);
    const match    = list.find((s) => s.id === activeId)
      ?? list.find((s) => s.name === "Balanced")
      ?? list[0]
      ?? null;
    setActiveScenarioState(match);
  }, [activeProject]);

  const refreshCalibration = useCallback(() => {
    if (!activeProject) return;
    loadBlendedBenchmarks(activeProject.id).then(setCalibration);
    forecastNextMonth(activeProject.id).then(setMonthlyForecast);
  }, [activeProject]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const value: AppContextValue = {
    projects,
    activeProject,
    scenarios,
    activeScenario,
    setActiveProject,
    setActiveScenario,
    refreshProjects,
    refreshScenarios,
    refreshCalibration,
    calibration,
    monthlyForecast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
