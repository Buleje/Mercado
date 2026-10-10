"use client";

/**
 * ForestalHerramientas — «Herramientas y trámites» (especializaciones
 * `spec:forestal:herramientas` y `spec:forestal:tramites`, ADR-124/308).
 *
 * Una cabina, dos fases (plan «panel unificado», F30, ola 2 — 2026-10-10):
 *   · Herramientas: cubicador de madera (aserrada) y de trozas (Smalian u
 *     Oxapampina), resúmenes y fotos de especies;
 *   · Trámites: formatos, expediente y plantaciones (antes, la pestaña
 *     «Trámites y Oficios», `forestal-tramites`, hoy alias de `?vista=catalogo`).
 * Cada fase se ve sólo si su especialización está prendida (permiso por
 * ORIGEN, regla R2). El Rendimiento del aserradero se mudó a Libro CTP ›
 * Tablero; la cabina deja el acceso en su menú.
 *
 * La vista vive en la URL (`?vista=`), como en los libros: un enlace a
 * «Expediente» abre el Expediente.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Gauge, Stamp, Wrench } from "@buleje/design-system/icons";
import { EmptyState } from "@buleje/design-system";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import LibroChrome, { type LibroAction, type LibroGroup } from "@/components/admin/shared/libro-chrome";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import ContratoActivoChip from "@/components/admin/forestal/ContratoActivoChip";
import { TOOL_ONCE_STORAGE_KEY } from "@/lib/forestal/sembrar-reparto";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, usePermisoDe } from "@/hooks/use-vistas-permitidas";
import {
  GRUPO_HERRAMIENTAS,
  GRUPO_TRAMITES,
  HERRAMIENTAS_MODULE_ID,
  HREF_RENDIMIENTO,
  VISTAS_HERRAMIENTAS,
  esHerramienta,
  esVistaDeTramites,
  type VistaHerramientas,
} from "./herramientas-grupos";
import type { Vista as VistaTramite } from "./tramites-grupos";
import { useForestTramites } from "@/hooks/use-forest-tramites";
import { tramitesSinRespuesta } from "@/lib/forestal/tramites-registro";

/**
 * El punto de «Expediente» antes de la primera visita a Trámites: lee sólo la
 * lista (sin montar formularios ni avisos). Al entrar a Trámites lo sigue
 * contando `TramitesCuerpo`.
 */
function ConteoExpediente({ onAlertas }: { onAlertas: (sinRespuesta: number) => void }) {
  const { tramites } = useForestTramites();
  const n = useMemo(() => tramitesSinRespuesta(tramites, new Date()).length, [tramites]);
  useEffect(() => {
    onAlertas(n);
  }, [n, onAlertas]);
  return null;
}

/* El cargador del DS (el mismo de las pestañas del Tablero del CTP). */
const cargando = (
  <div className="flex h-64 items-center justify-center" role="status" aria-label="Cargando herramienta">
    <LoadingSpinner size={32} />
  </div>
);
const CubicadorMadera = dynamic(() => import("./CubicadorMadera"), { ssr: false, loading: () => cargando });
const CubicadorTrozas = dynamic(() => import("./CubicadorTrozas"), { ssr: false, loading: () => cargando });
const CubicacionResumenes = dynamic(() => import("./CubicacionResumenes"), { ssr: false, loading: () => cargando });
const EspeciesFotosBiblioteca = dynamic(() => import("./EspeciesFotosBiblioteca"), { ssr: false, loading: () => cargando });
const TramitesCuerpo = dynamic(() => import("./TramitesCuerpo"), { ssr: false, loading: () => cargando });

/** Salto de una sola vez desde otro módulo (ej. «Resumen por permiso» en
 *  Consumo o «Llevar al cubicador» en Capacidad de la planta, que siembran
 *  bloques de rolliza y quieren abrir directo en Resúmenes). Se lee y se
 *  borra: no es la pestaña que se recuerda de ahí en más, sólo la de ESTA
 *  visita. La escribe `abrirResumenesDelCubicador()`. */
export const TOOL_ONCE_KEY = TOOL_ONCE_STORAGE_KEY;

export default function ForestalHerramientas({ initialTab }: { initialTab?: string } = {}) {
  const { vista, irA } = useVistaModulo<VistaHerramientas>(
    HERRAMIENTAS_MODULE_ID,
    VISTAS_HERRAMIENTAS,
    "cubicador",
    /* `?tab=forestal-tramites` (alias) entra por acá con `catalogo`. */
    initialTab,
  );
  const ctx = useContextoPermiso();
  const verHerramientas = usePermisoDe(["forestal-herramientas"]);
  const verTramites = usePermisoDe(["forestal-tramites"]);
  const verCtp = usePermisoDe(["ctp-libro-operaciones"]);

  /**
   * El salto de una sola vez se consume en un EFECTO, no en el initializer del
   * `useState` (bug real, encontrado 2026-09-08 llevando madera desde Saldos).
   *
   * Leer-y-borrar dentro del initializer parece equivalente, pero en desarrollo
   * React lo invoca DOS veces: la primera lectura devolvía «resumenes» y
   * borraba la clave, y el estado que quedaba era el de la segunda —que ya no
   * encontraba nada— así que la herramienta abría en el cubicador y el salto se
   * perdía en silencio. Un initializer no puede tener efectos secundarios.
   */
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(TOOL_ONCE_KEY);
      if (!v) return;
      sessionStorage.removeItem(TOOL_ONCE_KEY);
      if (esHerramienta(v)) irA(v);
    } catch {
      /* sin sessionStorage se abre la herramienta por defecto */
    }
  }, [irA]);

  const grupos = useMemo<LibroGroup[]>(
    () => [...(verHerramientas ? [GRUPO_HERRAMIENTAS] : []), ...(verTramites ? [GRUPO_TRAMITES] : [])],
    [verHerramientas, verTramites],
  );
  /* Una vista de una fase apagada (enlace viejo, memoria) cae en la primera de las que se ven. */
  const permitida = (v: VistaHerramientas) => (esVistaDeTramites(v) ? verTramites : verHerramientas);
  const activa: VistaHerramientas =
    ctx === null || permitida(vista) ? vista : verHerramientas ? "cubicador" : verTramites ? "catalogo" : vista;
  const enTramites = esVistaDeTramites(activa);

  /* Trámites queda montado (oculto) después de la primera visita: cambiar a una
     herramienta no tira un formulario a medio llenar. */
  const [tramitesVisitado, setTramitesVisitado] = useState(false);
  const [ultimaTramite, setUltimaTramite] = useState<VistaTramite>("catalogo");
  if (enTramites && !tramitesVisitado) setTramitesVisitado(true);
  if (enTramites && ultimaTramite !== activa) setUltimaTramite(activa as VistaTramite);
  const [sinRespuesta, setSinRespuesta] = useState(0);
  const alIrTramite = useCallback((v: VistaTramite) => irA(v), [irA]);

  const acciones = useMemo<LibroAction[] | undefined>(
    () =>
      verHerramientas && verCtp
        ? [
            {
              id: "rendimiento",
              label: "Rendimiento del aserradero",
              hint: "Se mudó a Libro CTP › Tablero › Rendimiento: por especie y por corrida, la plata por PT y el simulador",
              icon: Gauge,
              onSelect: () => void irAEnlace(HREF_RENDIMIENTO),
            },
          ]
        : undefined,
    [verHerramientas, verCtp],
  );

  const soloTramites = verTramites && !verHerramientas;
  const soloHerramientas = verHerramientas && !verTramites;

  return (
    <LibroChrome
      moduleId={HERRAMIENTAS_MODULE_ID}
      eyebrow={soloTramites ? "Forestal · SERFOR · ARFFS · OSINFOR" : "Forestal"}
      title={soloTramites ? "Trámites y Oficios" : soloHerramientas ? "Herramientas Forestales" : "Herramientas y trámites"}
      icon={soloTramites ? Stamp : Wrench}
      /* El permiso de TRABAJO (Brandon 2026-09-19): el cubicador de trozas
         coteja contra la GTF de un título habilitante puntual y los trámites
         se presentan A NOMBRE de uno —saber cuál está fijado evita redactar un
         oficio bajo el permiso equivocado—. */
      contrato={<ContratoActivoChip />}
      groups={grupos}
      view={activa}
      onView={(v) => irA(v)}
      alerts={sinRespuesta > 0 ? { expediente: sinRespuesta } : undefined}
      actions={acciones}
      actionsLabel="Más"
    >
      {ctx === null ? (
        cargando
      ) : grupos.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Herramientas y trámites no está activo"
          description="Se prende con la especialización forestal de herramientas o la de trámites."
        />
      ) : (
        <div>
          {activa === "cubicador" && <CubicadorMadera />}
          {activa === "trozas" && <CubicadorTrozas />}
          {activa === "resumenes" && <CubicacionResumenes />}
          {activa === "especies" && <EspeciesFotosBiblioteca />}
          {verTramites && !tramitesVisitado && !enTramites && <ConteoExpediente onAlertas={setSinRespuesta} />}
          {verTramites && (tramitesVisitado || enTramites) && (
            <div hidden={!enTramites}>
              <TramitesCuerpo vista={enTramites ? (activa as VistaTramite) : ultimaTramite} onVista={alIrTramite} onAlertas={setSinRespuesta} />
            </div>
          )}
        </div>
      )}
    </LibroChrome>
  );
}
