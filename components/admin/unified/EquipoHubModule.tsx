"use client";

import dynamic from "next/dynamic";
import { CheckSquare, StickyNote } from "@buleje/design-system/icons";
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
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla. Recupera ~90px verticales,
          que en una laptop de 677px útiles es la diferencia entre ver los
          datos o sólo los encabezados.
          El `eyebrow` se fue con el header: decía la categoría del sidebar
          («Abastecimiento · Compras» sobre un título «Compras») — el mismo
          dato tres veces contando el ítem marcado en el sidebar. */}
      <AdminTabBar
        heading={{ title: "Equipo", description: "Tareas del día y notas de turno.", icon: CheckSquare }} tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "tareas" && <TasksTab />}
        {sub === "notas" && <QuickNotesTab />}
      </AdminTabBar>
    </div>
  );
}
