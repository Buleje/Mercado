"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { CheckSquare, StickyNote } from "@buleje/design-system/icons";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub de Equipo ─────────────────────────────────────────────────────────────
// Brandon 2026-06-20. Monta dos herramientas operativas que estaban huérfanas
// (0 imports) pero sanas (API real /api/tasks y /api/notes, CSRF, shape array):
//  • Tareas (TasksTab) — to-dos del equipo con prioridad/estado/asignación.
//  • Notas (QuickNotesTab) — notas de turno / recordatorios tipo sticky.
const TasksTab      = dynamic(() => import("@/components/admin/TasksTab"), { loading: S });
const QuickNotesTab = dynamic(() => import("@/components/admin/QuickNotesTab"), { loading: S });

const MODULE_ID = "equipo-hub";

const TABS = [
  { id: "tareas", label: "Tareas", icon: CheckSquare },
  { id: "notas",  label: "Notas",  icon: StickyNote },
];

export default function EquipoHubModule({ initialTab }: { initialTab?: string } = {}) {
  const [sub, setSub] = useState(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return TABS[0].id;
    return localStorage.getItem(`admin-last-tab-${MODULE_ID}`) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminBreadcrumb
        items={[
          { label: "Equipo", onClick: () => setSub(TABS[0].id) },
          { label: TABS.find((t) => t.id === sub)?.label ?? "" },
        ]}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "tareas" && <TasksTab />}
        {sub === "notas" && <QuickNotesTab />}
      </AdminTabBar>
    </div>
  );
}
