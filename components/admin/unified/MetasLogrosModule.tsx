"use client";

/**
 * MetasLogrosModule — `?tab=metas-logros` (ADR-488).
 *
 * Un solo sistema de metas (`AdminGoal`, en la base) que leen las cuatro
 * vistas: Metas (por área, con su avance derivado de los datos), Hoy (la meta
 * del día hora a hora), Calendario (cada día del mes contra la meta diaria) y
 * Logros (lo ganado, derivado en el servidor).
 *
 * Antes eran cuatro sistemas sueltos: metas en la base con el avance tipeado,
 * una meta diaria y otra mensual en localStorage (distintas en cada navegador),
 * y logros y racha también en localStorage. Esas piezas se fueron con sus
 * vistas a `components/admin/metas/**`.
 *
 * La sub-vista vive en `?vista=` (useVistaModulo): link compartible y «atrás»
 * del navegador. Los ids viejos (`mis-metas`, `semana-mes`) siguen llegando.
 */
import dynamic from "next/dynamic";
import { CalendarDays, Sun, Target, Trophy } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { useVistaModulo, type AliasDeVista } from "@/hooks/use-vista-modulo";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import MetasVista from "@/components/admin/metas/MetasVista";

function Cargando() {
  return (
    <div role="status" aria-label="Cargando" className="flex justify-center py-12">
      <LoadingSpinner size={32} />
    </div>
  );
}

const DailyGoalTracker = dynamic(() => import("@/components/admin/DailyGoalTracker"), { ssr: false, loading: Cargando });
const CalendarioMes = dynamic(
  () => import("@/components/admin/metas/calendario/CalendarioMes").then((m) => m.CalendarioMes),
  { ssr: false, loading: Cargando },
);
const LogrosVista = dynamic(() => import("@/components/admin/metas/logros/LogrosVista").then((m) => m.LogrosVista), {
  ssr: false,
  loading: Cargando,
});

const MODULE_ID = "metas-logros";

type VistaId = "metas" | "hoy" | "calendario" | "logros";
const VISTAS: readonly VistaId[] = ["metas", "hoy", "calendario", "logros"];
/** Links y memoria de antes del 09-10. */
const ALIAS: AliasDeVista<VistaId> = { "mis-metas": "metas", "semana-mes": "calendario" };

const TABS = [
  { id: "metas", label: "Metas", icon: Target },
  { id: "hoy", label: "Hoy", icon: Sun },
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "logros", label: "Logros", icon: Trophy },
];

export default function MetasLogrosModule() {
  const { vista, irA } = useVistaModulo<VistaId>(MODULE_ID, VISTAS, "metas", undefined, { alias: ALIAS });

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{
          title: "Metas y logros",
          icon: Target,
          description: (
            <span>
              Cada meta pertenece a un área del negocio (Ventas, Compras, Marketplace, Aserradero, Bosque…) y su avance sale
              solo de tus datos del período. Hoy: tu meta del día hora a hora. Calendario: cada día del mes contra tu meta
              diaria. Logros: lo que ya ganaste.
            </span>
          ),
        }}
        tabs={TABS}
        activeTab={vista}
        onTabChange={(id) => irA(id)}
        moduleId={MODULE_ID}
      >
        <div>
          {vista === "metas" && <MetasVista />}
          {vista === "hoy" && <DailyGoalTracker />}
          {vista === "calendario" && <CalendarioMes />}
          {vista === "logros" && <LogrosVista />}
        </div>
      </AdminTabBar>
    </div>
  );
}
