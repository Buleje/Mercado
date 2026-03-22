"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProjectsTab = dynamic(() => import("@/components/admin/ProjectsTab"), { loading: S });
const TasksTab = dynamic(() => import("@/components/admin/TasksTab"), { loading: S });
const KanbanBoardTab = dynamic(() => import("@/components/admin/KanbanBoardTab"), { loading: S });
const GoalsTab = dynamic(() => import("@/components/admin/GoalsTab"), { loading: S });
const GoalTrackerTab = dynamic(() => import("@/components/admin/GoalTrackerTab"), { loading: S });

const TABS = [
  { id: "proyectos" as const, label: "Proyectos" },
  { id: "tareas" as const, label: "Tareas" },
  { id: "kanban" as const, label: "Kanban" },
  { id: "metas" as const, label: "Metas & KPIs" },
  { id: "tablero" as const, label: "Tablero Metas" },
];

export default function ProyectosTareasModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none border-b border-gray-200 dark:border-card-border -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`shrink-0 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
              sub === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "proyectos" && <ProjectsTab />}
      {sub === "tareas" && <TasksTab />}
      {sub === "kanban" && <KanbanBoardTab />}
      {sub === "metas" && <GoalsTab />}
      {sub === "tablero" && <GoalTrackerTab />}
    </div>
  );
}
