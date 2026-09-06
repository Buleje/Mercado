"use client";

import dynamic from "next/dynamic";
import { CheckSquare, StickyNote } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
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

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

export default function EquipoHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Equipo · Operación"
        title="Equipo"
        description="Tareas del día y notas de turno."
        icon={CheckSquare}
      />
      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "tareas" && <TasksTab />}
        {sub === "notas" && <QuickNotesTab />}
      </AdminTabBar>
    </div>
  );
}
