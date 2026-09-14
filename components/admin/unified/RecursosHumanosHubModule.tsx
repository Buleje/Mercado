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

import { useMemo } from "react";
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

  // Sólo la PRIMERA carga tapa la pantalla. `recargar()` lo llaman la hoja
  // del día (tras «Todos presentes» o un alta) y antes volvía a pintar este
  // loader: desmontaba Asistencia y te devolvía a HOY aunque estuvieras
  // corrigiendo el 10/09 (memoria: guard `loading && !X`).
  if (loading && !resumen) return <LoadingState message="Cargando Recursos Humanos..." />;

  if (!resumen) {
    return (
      <ErrorAlert
        title="No se pudo abrir Recursos Humanos"
        description={error ?? "Intenta de nuevo en un momento."}
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

  return <HubConNivel nivel={resumen.nivel} initialTab={initialTab} onCambioPersonal={recargar} />;
}

/**
 * Las pestañas y la vista activa, montadas recién cuando el nivel ya se sabe.
 *
 * `useVistaModulo` valida la vista de la URL UNA vez, al montar. Llamado
 * mientras el resumen cargaba, sólo conocía «asistencia» (el nivel por
 * defecto): un link a `?vista=personal` se reescribía a `?vista=asistencia` y
 * la memoria de «donde quedaste» tampoco sobrevivía (medido 2026-09-14).
 */
function HubConNivel({ nivel, initialTab, onCambioPersonal }: { nivel: NivelRrhh; initialTab?: string; onCambioPersonal: () => void }) {
  const tabs = useMemo(() => TODAS_LAS_VISTAS.filter((v) => NIVEL_ORDEN[nivel] >= NIVEL_ORDEN[v.nivelMin]), [nivel]);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, tabIds, "asistencia", initialTab);

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{ title: "Recursos Humanos", description: "Personal, asistencia, lo ganado de referencia y contratos.", icon: Users }}
        tabs={tabs}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "asistencia" && <AsistenciaView nivel={nivel} onCambioPersonal={onCambioPersonal} />}
        {sub === "personal" && <PersonalView nivel={nivel} />}
        {sub === "ganado" && nivel === "completo" && <GanadoView />}
        {sub === "contratos" && <ContratosDelPersonalView />}
        {sub === "puestos" && <PuestosView nivel={nivel} />}
      </AdminTabBar>
    </div>
  );
}
