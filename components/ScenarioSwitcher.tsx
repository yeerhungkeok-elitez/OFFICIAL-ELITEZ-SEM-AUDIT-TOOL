"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, FlaskConical, Settings } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

export default function ScenarioSwitcher() {
  const { activeProject, scenarios, activeScenario, setActiveScenario } = useAppContext();
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const switchTo = (id: string) => {
    setActiveScenario(id);
    setOpen(false);
  };

  if (!activeProject || scenarios.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
      >
        <FlaskConical size={13} className="text-brand-500 shrink-0" />
        <span className="max-w-[96px] truncate">{activeScenario?.name ?? "Scenario"}</span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl bg-white border border-slate-200 shadow-lg shadow-slate-200/60 py-1 overflow-hidden">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Scenarios
          </p>

          {scenarios.map((s) => {
            const isActive = s.id === activeScenario?.id;
            return (
              <button
                key={s.id}
                onClick={() => switchTo(s.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-brand-500" : "bg-slate-300"}`} />
                {s.name}
              </button>
            );
          })}

          <div className="mt-1 border-t border-slate-100 pt-1">
            <Link
              href={`/projects/${activeProject.id}/scenarios`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <Settings size={12} />
              Manage scenarios
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
