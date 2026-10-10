"use client";

/**
 * RecursosHumanosHubModule — «Equipo» (`?tab=rrhh`): el hub de Recursos
 * Humanos (ADR-414 §7) más Tareas y Notas, que vivían en su propia pestaña
 * (plan «panel unificado», ola 2; `?tab=tareas` y `?tab=notas` llegan acá).
 *
 * Personal, asistencia del día y del mes, lo ganado de referencia y contratos
 * vinculados, en un solo lugar. El hub NO deduce el rol en el cliente: filtra
 * las sub-pestañas con el `nivel` que devuelve `GET /api/rrhh/resumen` — el
 * servidor vuelve a chequear en cada ruta, esto es sólo para no ofrecer un
 * botón que 403 al tocarlo. Encima, cada vista pasa por el `origen` que declara
 * en `lib/admin/subvistas-modulos.ts` (regla R2): Tareas y Notas declaran
 * `tareas`, así que se ofrecen sólo a quien antes veía esa pestaña. Lo cuida
 * `__tests__/equipo-vistas-origen.test.ts`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, CheckSquare, StickyNote, Users, Wallet, FileSignature, Briefcase } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useRrhhResumen } from "@/hooks/use-rrhh-resumen";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import EncabezadoDeVista from "@/components/admin/rrhh/EncabezadoDeVista";
import { LoadingState, ErrorAlert } from "@buleje/design-system";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { button } from "@/components/ui-system/button-variants";
import type { NivelRrhh } from "@/lib/rrhh/tipos";

const AsistenciaView = dynamic(() => import("@/components/admin/rrhh/asistencia/AsistenciaView"), { loading: S });
const PersonalView = dynamic(() => import("@/components/admin/rrhh/personal/PersonalView"), { loading: S });
const GanadoView = dynamic(() => import("@/components/admin/rrhh/ganado/GanadoView"), { loading: S });
const ContratosDelPersonalView = dynamic(() => import("@/components/admin/rrhh/contratos/ContratosDelPersonalView"), { loading: S });
const PuestosView = dynamic(() => import("@/components/admin/rrhh/puestos/PuestosView"), { loading: S });
const TasksTab = dynamic(() => import("@/components/admin/TasksTab"), { loading: S });
const QuickNotesTab = dynamic(() => import("@/components/admin/QuickNotesTab"), { loading: S });

const MODULE_ID = "rrhh-hub";

/**
 * `ninguno` = la vista no pide nivel de RRHH: Tareas y Notas tienen su propia
 * API (`/api/tasks`, `/api/notes`) y antes se abrían sin pasar por
 * `/api/rrhh/resumen`. Si ese resumen falla, siguen a mano.
 */
type NivelDeVista = NivelRrhh | "ninguno";

const NIVEL_ORDEN: Record<NivelDeVista, number> = { ninguno: -1, marcar: 0, gestion: 1, completo: 2 };

const TODAS_LAS_VISTAS = [
  { id: "asistencia", label: "Asistencia", icon: CalendarDays, nivelMin: "marcar" as NivelDeVista },
  { id: "personal", label: "Personal", icon: Users, nivelMin: "gestion" as NivelDeVista },
  { id: "ganado", label: "Lo ganado", icon: Wallet, nivelMin: "completo" as NivelDeVista },
  { id: "contratos", label: "Contratos", icon: FileSignature, nivelMin: "gestion" as NivelDeVista },
  { id: "puestos", label: "Puestos", icon: Briefcase, nivelMin: "gestion" as NivelDeVista },
  { id: "tareas", label: "Tareas", icon: CheckSquare, nivelMin: "ninguno" as NivelDeVista },
  { id: "notas", label: "Notas", icon: StickyNote, nivelMin: "ninguno" as NivelDeVista },
];

/** Lo que dice la ⓘ del título: para qué es el lugar, sin repetir las pestañas que se ven al lado. */
const AYUDA_DEL_HUB = "Todo lo de las personas que trabajan contigo, en un solo lugar. Cada vista explica lo suyo en su ⓘ.";

/** Cuánto se espera al rol antes de abrir igual (sin las vistas que dependen de él). */
const ESPERA_DEL_ROL_MS = 4000;

export default function RecursosHumanosHubModule({ initialTab }: { initialTab?: string } = {}) {
  const { resumen, loading, error, recargar } = useRrhhResumen();
  /* Las vistas que llegaron de otra pestaña dependen del rol (R2) y
     `useVistaModulo` valida la vista de la URL UNA vez, al montar: sin esperar
     al rol, `?tab=tareas` caía en Asistencia. */
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);

  // Sólo la PRIMERA carga tapa la pantalla. `recargar()` lo llaman la hoja
  // del día (tras «Todos presentes» o un alta) y antes volvía a pintar este
  // loader: desmontaba Asistencia y te devolvía a HOY aunque estuvieras
  // corrigiendo el 10/09 (memoria: guard `loading && !X`).
  if ((loading && !resumen) || (!rolListo && !rolTarde)) return <LoadingState message="Cargando Equipo..." />;

  const aviso = resumen ? null : (
    <ErrorAlert
      title="No se pudo abrir la asistencia ni el personal"
      description={error ?? "Intenta de nuevo en un momento."}
      action={
        <button type="button" onClick={recargar} className={button({ variant: "secondary" })}>
          Reintentar
        </button>
      }
    />
  );

  return (
    <HubConNivel
      key={resumen?.nivel ?? "ninguno"}
      nivel={resumen?.nivel ?? "ninguno"}
      initialTab={initialTab}
      onCambioPersonal={recargar}
      aviso={aviso}
    />
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

/**
 * Las pestañas y la vista activa, montadas recién cuando el nivel ya se sabe.
 *
 * `useVistaModulo` valida la vista de la URL UNA vez, al montar. Llamado
 * mientras el resumen cargaba, sólo conocía «asistencia» (el nivel por
 * defecto): un link a `?vista=personal` se reescribía a `?vista=asistencia` y
 * la memoria de «donde quedaste» tampoco sobrevivía (medido 2026-09-14).
 */
function HubConNivel({
  nivel,
  initialTab,
  onCambioPersonal,
  aviso,
}: {
  nivel: NivelDeVista;
  initialTab?: string;
  onCambioPersonal: () => void;
  aviso: ReactNode;
}) {
  const porNivel = useMemo(() => TODAS_LAS_VISTAS.filter((v) => NIVEL_ORDEN[nivel] >= NIVEL_ORDEN[v.nivelMin]), [nivel]);
  const tabs = useVistasPermitidas("rrhh", porNivel);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, tabIds, tabIds[0] ?? "asistencia", initialTab);
  const n = nivel === "ninguno" ? null : nivel;

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{ title: "Equipo", description: AYUDA_DEL_HUB, icon: Users }}
        tabs={tabs}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        <div className="space-y-4">
          {aviso}
          {n && <EncabezadoDeVista vista={sub} />}
          {n && sub === "asistencia" && <AsistenciaView nivel={n} onCambioPersonal={onCambioPersonal} />}
          {n && sub === "personal" && <PersonalView nivel={n} />}
          {n === "completo" && sub === "ganado" && <GanadoView />}
          {n && sub === "contratos" && <ContratosDelPersonalView />}
          {n && sub === "puestos" && <PuestosView nivel={n} />}
          {sub === "tareas" && <TasksTab />}
          {sub === "notas" && <QuickNotesTab />}
        </div>
      </AdminTabBar>
    </div>
  );
}
