"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getProjectById,
  updateProject,
  type Project,
  type ProjectDraft,
} from "@/lib/projectStore";
import { useAppContext } from "@/context/AppContext";
import ProjectForm from "@/components/ProjectForm";

export default function EditProjectPage() {
  const { id }    = useParams<{ id: string }>();
  const router    = useRouter();
  const { refreshProjects } = useAppContext();
  const [project, setProject] = useState<Project | null | "loading">("loading");

  useEffect(() => {
    setProject(getProjectById(id));
  }, [id]);

  const handleSubmit = (draft: ProjectDraft) => {
    updateProject(id, draft);
    refreshProjects();
    router.push("/projects");
  };

  if (project === "loading") {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <p className="text-sm text-slate-500">Project not found.</p>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:text-brand-700"
        >
          <ArrowLeft size={13} /> Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-brand-500 transition-colors"
      >
        <ArrowLeft size={13} /> All projects
      </Link>

      <ProjectForm
        title="Edit Project"
        subtitle="Update your campaign assumptions — Keywords, Forecast, and Reports will recalculate automatically."
        submitLabel="Save Changes"
        initialValues={project}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
