"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { FolderKanban, Briefcase, ClipboardList, LayoutGrid, Target, BarChart3 } from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

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

const MODULE_ID = "proyectos-tareas";

const TABS = [
  { id: "proyectos", label: "Proyectos", icon: Briefcase },
  { id: "tareas", label: "Tareas", icon: ClipboardList },
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
  { id: "metas", label: "Metas & KPIs", icon: Target },
  { id: "tablero", label: "Tablero Metas", icon: BarChart3 },
];

export default function ProyectosTareasModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Proyectos & Tareas"
        description="Gestión de proyectos, tareas, Kanban y metas del equipo"
        icon={FolderKanban}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      />

      {sub === "proyectos" && <ProjectsTab />}
      {sub === "tareas" && <TasksTab />}
      {sub === "kanban" && <KanbanBoardTab />}
      {sub === "metas" && <GoalsTab />}
      {sub === "tablero" && <GoalTrackerTab />}
    </div>
  );
}
