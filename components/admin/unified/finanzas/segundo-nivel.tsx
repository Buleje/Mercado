"use client";

/**
 * El segundo nivel de un módulo montado DENTRO de Mi Plata.
 *
 * Préstamos, Adelantos y Activos traen sus propias pestañas (`?sub=`). Hasta
 * la ola 3 del panel unificado (2026-10-10) cada uno dibujaba además su título
 * y su barra, debajo de la barra de Mi Plata: tres niveles de pestañas y dos
 * títulos para una sola pantalla. Ahora Mi Plata deja una RANURA en la fila
 * de su título —donde vive el segundo nivel de las demás pestañas— y el módulo
 * dibuja ahí sus pestañas y su acción principal, con un portal: la lógica de
 * cada módulo (contadores, «Nuevo adelanto») no se mudó ni se copió.
 *
 * Fuera de Mi Plata no hay contexto (`null`) y el módulo se dibuja como
 * siempre, con su barra y su título.
 *
 * 23-10: la ranura ya no está en la fila del título sino en la de ABAJO de la
 * banda (`segundoNivel` de AdminTabBar): las pestañas de Mi Plata arriba, las
 * del módulo y su acción debajo (antes, a 1280 px, quedaban al revés).
 */

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import SeccionesNav, { type ItemDeNivel } from "./SeccionesNav";

export interface RanuraDelHub {
  /** Dónde se dibuja; `null` mientras la fila del título todavía no se montó. */
  ranura: HTMLElement | null;
}

/** `null` = el módulo no está dentro de Mi Plata. */
export const RanuraDelSegundoNivel = createContext<RanuraDelHub | null>(null);

export function useRanuraDelSegundoNivel(): RanuraDelHub | null {
  return useContext(RanuraDelSegundoNivel);
}

interface Props {
  ranura: HTMLElement | null;
  items: readonly ItemDeNivel[];
  activa: string;
  onIr: (id: string) => void;
  /** Nombre accesible del grupo («Pestañas de Préstamos»). */
  etiqueta: string;
  /** La acción principal del módulo («Nuevo adelanto»), al lado de sus pestañas. */
  acciones?: ReactNode;
}

/** Las pestañas propias del módulo, en la fila de abajo de la banda de Mi Plata. */
export function SegundoNivelEnElHub({ ranura, items, activa, onIr, etiqueta, acciones }: Props) {
  if (!ranura) return null;
  return createPortal(
    /* Desde `sm`, pestañas y acción en UNA línea que llena la fila: la barra
       (7 pestañas en Adelantos, ~770 px) es la que cede y manda lo que no
       entra a su «Más»; los botones no, y van a la derecha. El «⋯» del hub
       quedó arriba, con el título. */
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-nowrap">
      <SeccionesNav secciones={items} activa={activa} onIr={onIr} etiqueta={etiqueta} />
      {acciones && <div className="ml-auto flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>,
    ranura,
  );
}
