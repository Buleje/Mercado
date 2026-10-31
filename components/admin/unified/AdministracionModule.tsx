"use client";

/**
 * AdministracionModule — «Administración» (`?tab=administracion`, ADR-501): la
 * agenda del negocio. Lo que te toca hoy y lo atrasado, el calendario del mes
 * y de la semana, las actividades que se repiten (asistencia, aserrío, gastos
 * e ingresos, adelantos, cuentas de terceros, facturas), las tareas y notas
 * del equipo (antes en Equipo; `?tab=tareas|notas` y `?tab=rrhh&vista=tareas`
 * llegan acá por alias) y cómo verla en Google Calendar o el celular.
 *
 * Todo lo que cuenta lo calcula el servidor (`/api/admin/agenda/*`); acá sólo
 * se pinta. Las vistas cargan aparte (`next/dynamic`) y comparten la agenda
 * por `AgendaProvider`: marcar algo en Hoy ya se ve en el calendario.
 */
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, ClipboardCheck, Link2, ListChecks, Repeat, StickyNote, Sun } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { AgendaProvider, useAgenda } from "@/hooks/use-agenda";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";

const HoyVista = dynamic(() => import("@/components/admin/administracion/hoy/HoyVista"), { loading: S });
const CalendarioVista = dynamic(() => import("@/components/admin/administracion/calendario/CalendarioVista"), { loading: S });
const ActividadesVista = dynamic(() => import("@/components/admin/administracion/actividades/ActividadesVista"), { loading: S });
const ConectarVista = dynamic(() => import("@/components/admin/administracion/conectar/ConectarVista"), { loading: S });
const TasksTab = dynamic(() => import("@/components/admin/TasksTab"), { loading: S });
const QuickNotesTab = dynamic(() => import("@/components/admin/QuickNotesTab"), { loading: S });

const MODULE_ID = "administracion";

type Vista = "hoy" | "calendario" | "actividades" | "tareas" | "notas" | "conectar";

const TABS = [
  { id: "hoy", label: "Hoy", icon: Sun },
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "actividades", label: "Actividades", icon: Repeat },
  { id: "tareas", label: "Tareas", icon: ListChecks },
  { id: "notas", label: "Notas", icon: StickyNote },
  { id: "conectar", label: "Conectar", icon: Link2 },
];

/** El calendario recuerda mes/semana en `?sub=`: se borra al salir de él. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { calendario: ["sub"] };

const AYUDA = "Lo que tienes que hacer en tu negocio y cuándo: la asistencia, las facturas, el aserrío del día, registrar gastos e ingresos, revisar adelantos y cuentas de terceros. Cada vista explica lo suyo en su ⓘ.";

/** Cuánto se espera al rol antes de abrir igual (sin las vistas que dependen de él). */
const ESPERA_DEL_ROL_MS = 4000;

export default function AdministracionModule({ initialTab }: { initialTab?: string } = {}) {
  /* `useVistaModulo` valida la vista de la URL una vez, al montar: se espera
     al rol para que `?tab=tareas` (vista con `origen`) no caiga en Hoy. */
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <LoadingState message="Cargando Administración..." />;

  return (
    <AgendaProvider>
      <Administracion initialTab={initialTab} />
    </AgendaProvider>
  );
}

/** `true` cuando `esperando` lleva `ms` sin resolverse. */
function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function Administracion({ initialTab }: { initialTab?: string }) {
  const { hoy } = useAgenda();
  const permitidas = useVistasPermitidas("administracion", TABS);
  const ids = useMemo(() => permitidas.map((t) => t.id as Vista), [permitidas]);
  const { vista, irA } = useVistaModulo<Vista>(MODULE_ID, ids, ids[0] ?? "hoy", initialTab, { paramsDeVista: PARAMS_DE_VISTA });

  const porHacer = hoy.cuenta.pendientes + hoy.cuenta.atrasadas;
  const tabs = useMemo(
    () => permitidas.map((t) => (t.id === "hoy" && porHacer > 0 ? { ...t, badge: porHacer } : t)),
    [permitidas, porHacer],
  );

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{ title: "Administración", description: AYUDA, icon: ClipboardCheck }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={(v) => irA(v as Vista)}
        moduleId={MODULE_ID}
      >
        {vista === "hoy" && <HoyVista irA={(v) => irA(v as Vista)} />}
        {vista === "calendario" && <CalendarioVista />}
        {vista === "actividades" && <ActividadesVista />}
        {vista === "tareas" && <TasksTab />}
        {vista === "notas" && <QuickNotesTab />}
        {vista === "conectar" && <ConectarVista />}
      </AdminTabBar>
    </div>
  );
}
