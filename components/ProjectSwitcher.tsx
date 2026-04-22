"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, FolderOpen, Plus, Check } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

export default function ProjectSwitcher() {
  const { projects, activeProject, setActiveProject } = useAppContext();
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const switchTo = (id: string) => {
    setActiveProject(id);
    setOpen(false);
  };

  if (projects.length === 0) {
    return (
      <Link
        href="/projects/new"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-400 hover:border-brand-500 hover:text-brand-500 transition-colors"
      >
        <Plus size={12} />
        Create a project
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand-500 hover:text-brand-500 transition-colors max-w-[220px]"
      >
        <FolderOpen size={13} className="text-brand-500 shrink-0" />
        <span className="truncate">{activeProject?.projectName ?? "Select project"}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl border border-slate-100 shadow-xl z-50 overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {projects.map((p) => {
              const isActive = p.id === activeProject?.id;
              return (
                <button
                  key={p.id}
                  onClick={() => switchTo(p.id)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 ${
                    isActive ? "text-brand-600 font-semibold" : "text-slate-700"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight">{p.projectName}</p>
                    {p.industry && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{p.industry}</p>
                    )}
                  </div>
                  {isActive && <Check size={13} className="text-brand-500 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 px-3 py-2 flex gap-2">
            <Link
              href="/projects"
              onClick={() => setOpen(false)}
              className="flex-1 text-center text-xs font-semibold text-slate-500 hover:text-brand-500 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              All projects
            </Link>
            <Link
              href="/projects/new"
              onClick={() => setOpen(false)}
              className="flex-1 text-center text-xs font-semibold text-brand-500 hover:text-brand-700 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
            >
              + New project
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
