"use client";

/**
 * libro-acciones-vista — las acciones de cada vista, en la fila de vistas del libro.
 *
 * Brandon, 2026-10-17: «los botones que están en la página como filtros,
 * opciones, nuevo ingreso y demás se pondrán al lado de las pestañas en la
 * esquina para ocupar menos espacio». Cada vista del libro abría con su propia
 * barra (Indicadores · Buscar · Filtros · Opciones · Nuevo…) debajo del riel de
 * vistas: una fila entera de botones donde el riel tenía media fila libre.
 *
 * ── API ──────────────────────────────────────────────────────────────────────
 *
 *   <AccionesDeLaVista orden? fueraDelLibro? className?>{botones}</AccionesDeLaVista>
 *     · dentro de un libro (`LibroChrome` con riel de vistas): se pinta en el
 *       riel, a la derecha de las vistas (portal al hueco del riel);
 *     · fuera de un libro (otra pestaña del panel, un test) o dentro de una
 *       ventana (`role="dialog"`) abierta desde la vista: se pinta EN SU LUGAR;
 *     · el libro todavía no montó su riel: no pinta nada (dura un render).
 *     `orden` — lugar en el riel cuando varias piezas lo comparten (CSS
 *       `order`): `ORDEN_ACCION.info` < `.indicadores` < `.normal` (default)
 *       < `.principal` («+ Nuevo …» va último, en la esquina).
 *     `fueraDelLibro` — lo que se pinta en su lugar cuando NO va al riel. Sin
 *       él: los `children` en una fila flex alineada a la derecha. `null` = nada.
 *
 *   <TextoDeAccion corto?>Nuevo ingreso</TextoDeAccion>
 *     El rótulo de un botón que va al riel. Con el riel de 80rem o más se ve
 *     entero; debajo, el botón queda en sólo ícono (el texto sigue para el
 *     lector de pantalla) o muestra la palabra `corto` («Nuevo»). Fuera del
 *     libro se ve siempre entero: las clases son consultas al contenedor
 *     `riel`, que sólo existe en la fila de vistas.
 *
 *   useEnElLibro(): `true` si la vista está dentro de un libro con riel.
 *   CLASE_TEXTO_ACCION / CLASE_SOLO_ANCHO: las mismas reglas, como clases.
 *
 * Ejemplo (la raíz de una vista):
 *   <AccionesDeLaVista>
 *     <Btn onClick={exportar}><Download className="h-4 w-4" /><TextoDeAccion>Descargar</TextoDeAccion></Btn>
 *     <ActionMenu label="Opciones" actions={opciones} soloIcono />
 *   </AccionesDeLaVista>
 *   <AccionesDeLaVista orden={ORDEN_ACCION.principal}>
 *     <Btn variant="primary"><Plus className="h-4 w-4" /><TextoDeAccion corto="Nuevo">Nuevo ingreso</TextoDeAccion></Btn>
 *   </AccionesDeLaVista>
 *
 * Reglas:
 *   · Sólo en la RAÍZ de la vista: lo de una sub-sección o de una fila no va al
 *     riel (dos «Opciones» en la esquina no dicen de qué es cada una).
 *   · Botones a 48 px (`h-12`), como las vistas del riel: la fila mide 56.
 *   · `VistaHeader` (module-primitives) y `useKpisPlegables` (kpis-plegables)
 *     ya lo usan solos: su ⓘ, su cuenta y su botón «Indicadores» van al riel.
 *   · Una ventana abierta desde la vista NO manda nada al riel aunque use estas
 *     piezas: se detecta el `role="dialog"` y se pinta en su lugar.
 */

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * El hueco del riel. `undefined` = no hay libro (se pinta en su lugar); `null`
 * = hay libro pero su riel todavía no montó; el elemento = adónde va el portal.
 */
const HuecoDelRiel = createContext<HTMLElement | null | undefined>(undefined);

/** Lo pone `LibroChrome` alrededor de las vistas. Nadie más lo necesita. */
export const ProveedorAccionesDeLaVista = HuecoDelRiel.Provider;

/** Orden en el riel (CSS `order`): lo que informa, las cifras, las acciones, «+ Nuevo». */
export const ORDEN_ACCION = { info: -30, indicadores: -20, normal: 0, principal: 20 } as const;

/** Rótulo que se pliega a sólo ícono cuando el riel mide menos de 80rem. */
export const CLASE_TEXTO_ACCION = "@max-[80rem]/riel:sr-only";

/** Lo que sólo se ve en un riel ancho (80rem o más) y fuera del libro. */
export const CLASE_SOLO_ANCHO = "@max-[80rem]/riel:hidden";

const FILA_EN_SU_LUGAR = "flex flex-wrap items-center justify-end gap-2";
const GRUPO_EN_RIEL = "flex flex-wrap items-center justify-end gap-2";

export function useEnElLibro(): boolean {
  return useContext(HuecoDelRiel) !== undefined;
}

type Donde = { hueco: HTMLElement; donde: "riel" | "aqui" };

export function AccionesDeLaVista({
  children,
  orden = ORDEN_ACCION.normal,
  fueraDelLibro,
  className,
}: {
  children?: ReactNode;
  orden?: number;
  /** Lo que se pinta en su lugar cuando no va al riel. `null` = nada. */
  fueraDelLibro?: ReactNode;
  className?: string;
}) {
  const hueco = useContext(HuecoDelRiel);
  const marcaRef = useRef<HTMLSpanElement>(null);
  /* Se decide UNA vez por hueco, antes de pintar: los hijos montan una sola
     vez y ya en su lugar (un botón que pide datos al montar no lo hace dos). */
  const [decision, setDecision] = useState<Donde | null>(null);
  const donde = hueco && decision?.hueco === hueco ? decision.donde : null;

  useLayoutEffect(() => {
    if (!hueco || donde) return;
    /* Una ventana abierta desde la vista va en un portal al `body`, pero el
       contexto de React la sigue: sin esto, sus botones saltarían al riel de
       atrás. El libro entero dentro de una ventana sí usa su riel. */
    const ventana = marcaRef.current?.closest<HTMLElement>('[role="dialog"]');
    setDecision({ hueco, donde: ventana && !ventana.contains(hueco) ? "aqui" : "riel" });
  }, [hueco, donde]);

  if (hueco === undefined || donde === "aqui") {
    if (fueraDelLibro !== undefined) return <>{fueraDelLibro}</>;
    return children ? <div className={cn(FILA_EN_SU_LUGAR, className)}>{children}</div> : null;
  }
  if (!hueco || !donde) return <span ref={marcaRef} hidden />;
  if (!children) return null;
  return createPortal(
    <div data-acciones-vista="" className={cn(GRUPO_EN_RIEL, className)} style={{ order: orden }}>
      {children}
    </div>,
    hueco,
  );
}

/**
 * El rótulo de un botón del riel: entero con 80rem o más; debajo, sólo ícono
 * (el texto queda para el lector de pantalla) o la palabra `corto`.
 */
export function TextoDeAccion({ children, corto }: { children: ReactNode; corto?: ReactNode }) {
  return (
    <>
      <span className={CLASE_TEXTO_ACCION}>{children}</span>
      {corto != null && (
        <span aria-hidden="true" className="hidden @max-[80rem]/riel:inline">
          {corto}
        </span>
      )}
    </>
  );
}
