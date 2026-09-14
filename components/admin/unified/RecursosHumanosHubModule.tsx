"use client";

/**
 * RecursosHumanosHubModule — el hub de Recursos Humanos (ADR-414 §7).
 *
 * Personal, asistencia del día y del mes, lo ganado de referencia y contratos
 * vinculados, en un solo lugar. El hub NO deduce el rol en el cliente: filtra
 * las sub-pestañas con el `nivel` que devuelve `GET /api/rrhh/resumen` — el
 * servidor vuelve a chequear en cada ruta, esto es sólo para no ofrecer un
 * botón que 403 al tocarlo.
 */

import dynamic from "next/dynamic";
import { CalendarDays, Users, Wallet, FileSignature, Briefcase } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useRrhhResumen } from "@/hooks/use-rrhh-resumen";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { LoadingState, ErrorAlert } from "@buleje/design-system";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

const AsistenciaView = dynamic(() => import("@/components/admin/rrhh/asistencia/AsistenciaView"), { loading: S });
const PersonalView = dynamic(() => import("@/components/admin/rrhh/personal/PersonalView"), { loading: S });
const GanadoView = dynamic(() => import("@/components/admin/rrhh/ganado/GanadoView"), { loading: S });
const ContratosDelPersonalView = dynamic(() => import("@/components/admin/rrhh/contratos/ContratosDelPersonalView"), { loading: S });
const PuestosView = dynamic(() => import("@/components/admin/rrhh/puestos/PuestosView"), { loading: S });

const MODULE_ID = "rrhh-hub";

const NIVEL_ORDEN: Record<NivelRrhh, number> = { marcar: 0, gestion: 1, completo: 2 };

const TODAS_LAS_VISTAS = [
  { id: "asistencia", label: "Asistencia", icon: CalendarDays, nivelMin: "marcar" as NivelRrhh },
  { id: "personal", label: "Personal", icon: Users, nivelMin: "gestion" as NivelRrhh },
  { id: "ganado", label: "Lo ganado", icon: Wallet, nivelMin: "completo" as NivelRrhh },
  { id: "contratos", label: "Contratos", icon: FileSignature, nivelMin: "gestion" as NivelRrhh },
  { id: "puestos", label: "Puestos", icon: Briefcase, nivelMin: "gestion" as NivelRrhh },
];

export default function RecursosHumanosHubModule({ initialTab }: { initialTab?: string } = {}) {
  const { resumen, loading, error, recargar } = useRrhhResumen();

  // Mientras no sabemos el nivel, sólo se ofrece Asistencia (la que ve todo
  // el mundo) — ofrecer las 5 y recortar de golpe cuando llega la respuesta
  // se ve como que el menú "parpadea".
  const nivel: NivelRrhh = resumen?.nivel ?? "marcar";
  const tabs = TODAS_LAS_VISTAS.filter((v) => NIVEL_ORDEN[nivel] >= NIVEL_ORDEN[v.nivelMin]);
  const tabIds = tabs.map((t) => t.id);

  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, tabIds, "asistencia", initialTab);

  if (loading) return <LoadingState message="Cargando Recursos Humanos..." />;

  if (error) {
    return (
      <ErrorAlert
        title="No se pudo abrir Recursos Humanos"
        description={error}
        action={
          <button
            type="button"
            onClick={recargar}
            className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            Reintentar
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{ title: "Recursos Humanos", description: "Personal, asistencia, lo ganado de referencia y contratos.", icon: Users }}
        tabs={tabs}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "asistencia" && <AsistenciaView nivel={nivel} onCambioPersonal={recargar} />}
        {sub === "personal" && <PersonalView nivel={nivel} />}
        {sub === "ganado" && nivel === "completo" && <GanadoView />}
        {sub === "contratos" && <ContratosDelPersonalView />}
        {sub === "puestos" && <PuestosView nivel={nivel} />}
      </AdminTabBar>
    </div>
  );
}
