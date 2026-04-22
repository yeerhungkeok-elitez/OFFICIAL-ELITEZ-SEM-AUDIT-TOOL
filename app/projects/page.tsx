"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  Calendar,
  Globe,
  DollarSign,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";
import { deleteProject, type Project } from "@/lib/projectStore";
import { useAppContext } from "@/context/AppContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtBudget(n: number) {
  return `$${n.toLocaleString()}/mo`;
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isActive,
  confirmDelete,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project;
  isActive: boolean;
  confirmDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md ${
        isActive ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-100"
      }`}
    >
      {/* Active banner */}
      {isActive && (
        <div className="bg-brand-500 px-4 py-1.5 flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-white" />
          <span className="text-xs font-semibold text-white">Active project</span>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Name + industry */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 leading-tight truncate">
            {project.projectName}
          </h3>
          {project.industry && (
            <p className="text-xs text-slate-400 mt-0.5">{project.industry}</p>
          )}
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <DollarSign size={12} className="text-slate-300 shrink-0" />
            <span className="font-semibold text-slate-700">{fmtBudget(project.monthlyBudget)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Globe size={12} className="text-slate-300 shrink-0" />
            <span className="font-semibold text-slate-700">
              {project.targetCountries.length} countr{project.targetCountries.length !== 1 ? "ies" : "y"}
            </span>
          </div>

          {project.targetCountries.length > 0 && (
            <div className="col-span-2">
              <div className="flex flex-wrap gap-1">
                {project.targetCountries.slice(0, 4).map((c) => (
                  <span key={c} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                    {c}
                  </span>
                ))}
                {project.targetCountries.length > 4 && (
                  <span className="text-xs bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">
                    +{project.targetCountries.length - 4}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Updated date */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Calendar size={11} className="shrink-0" />
          Updated {fmtDate(project.updatedAt)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
          {!isActive && (
            <button
              onClick={onOpen}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors"
            >
              <FolderOpen size={12} />
              Open
            </button>
          )}
          <Link
            href={`/projects/${project.id}/edit`}
            onClick={onEdit}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-brand-500 hover:text-brand-500 transition-colors"
          >
            <Pencil size={12} />
            Edit
          </Link>
          <Link
            href={`/projects/${project.id}/scenarios`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-brand-500 hover:text-brand-500 transition-colors"
          >
            <FlaskConical size={12} />
            Scenarios
          </Link>
          <button
            onClick={onDelete}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              confirmDelete
                ? "bg-rose-500 text-white border-rose-500 hover:bg-rose-600"
                : "border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500"
            }`}
            title={confirmDelete ? "Click again to confirm delete" : "Delete project"}
          >
            <Trash2 size={12} />
            {confirmDelete ? "Confirm?" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
        <FolderOpen size={28} className="text-slate-300" />
      </div>
      <h2 className="text-base font-bold text-slate-700">No projects yet</h2>
      <p className="text-sm text-slate-400 mt-1 max-w-xs">
        Create your first project to start planning keywords, forecasts, and reports.
      </p>
      <Link
        href="/projects/new"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm"
      >
        <Plus size={15} />
        Create your first project
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { projects, activeProject, setActiveProject, refreshProjects } = useAppContext();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const activeId = activeProject?.id ?? null;

  const handleOpen = (id: string) => {
    setActiveProject(id);
  };

  const handleDelete = (id: string) => {
    if (confirmId === id) {
      deleteProject(id);
      refreshProjects();
      setConfirmId(null);
    } else {
      setConfirmId(id);
    }
  };

  const dismissConfirm = () => setConfirmId(null);

  return (
    <div className="max-w-5xl mx-auto space-y-6" onClick={(e) => {
      if (!(e.target as Element).closest("button")) dismissConfirm();
    }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Projects</h1>
          <p className="text-sm text-slate-400 mt-1">
            {projects.length === 0
              ? "No projects yet"
              : `${projects.length} project${projects.length !== 1 ? "s" : ""} · click Open to set the active project`}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus size={15} />
          New Project
        </Link>
      </div>

      {/* Content */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects
            .slice()
            .sort((a, b) => {
              if (a.id === activeId) return -1;
              if (b.id === activeId) return 1;
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            })
            .map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isActive={project.id === activeId}
                confirmDelete={confirmId === project.id}
                onOpen={() => handleOpen(project.id)}
                onEdit={() => {}}
                onDelete={() => handleDelete(project.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
