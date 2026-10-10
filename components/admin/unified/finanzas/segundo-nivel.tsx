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

/** Las pestañas propias del módulo, en la fila del título de Mi Plata. */
export function SegundoNivelEnElHub({ ranura, items, activa, onIr, etiqueta, acciones }: Props) {
  if (!ranura) return null;
  return createPortal(
    <>
      <SeccionesNav secciones={items} activa={activa} onIr={onIr} etiqueta={etiqueta} />
      {acciones}
    </>,
    ranura,
  );
}
