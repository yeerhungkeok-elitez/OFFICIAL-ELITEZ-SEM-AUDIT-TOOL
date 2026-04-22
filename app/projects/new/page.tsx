"use client";

import { useRouter } from "next/navigation";
import { saveProject, setActiveProjectId, type ProjectDraft } from "@/lib/projectStore";
import { ensureDefaultScenarios } from "@/lib/scenarioStore";
import { useAppContext } from "@/context/AppContext";
import ProjectForm from "@/components/ProjectForm";

export default function NewProjectPage() {
  const router = useRouter();
  const { refreshProjects } = useAppContext();

  const handleSubmit = (draft: ProjectDraft) => {
    const project = saveProject(draft);
    setActiveProjectId(project.id);
    ensureDefaultScenarios(project.id);
    refreshProjects();
    router.push("/projects");
  };

  return (
    <ProjectForm
      title="New Project"
      subtitle="Define your campaign goals, budget, and target markets."
      submitLabel="Create Project"
      onSubmit={handleSubmit}
    />
  );
}
