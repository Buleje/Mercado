"use client";

/**
 * Un modal que se abre y se cierra SIN redibujar a quien lo contiene.
 *
 * Medido el 23-09 en «Producir sin lote» (Brandon: *«optimiza el llamado de
 * los modales… tarda mucho en aparecer y quitar»*): abrir Dueños tardaba
 * 1,4 s y cerrarlo 0,9 s, igual con 60 que con 400 piezas. El perfil dio 911 ms
 * en redibujar `CubicadorMadera` entero —tabla, panel, precio— sólo porque su
 * `useState` de «modal abierto» cambiaba; el resto era el estilo y el foco que
 * el navegador recalculaba sobre todo ese DOM recién tocado.
 *
 * Acá el «qué modal está abierto» vive en un almacén chico que sólo escucha el
 * `AnfitrionDeModales` (con `useSyncExternalStore`): abrir y cerrar redibujan
 * al anfitrión y al modal, nada más. El contenido del modal lo sigue armando el
 * padre en su render —el anfitrión recibe la función—, así que lee siempre los
 * valores al día: cuando cambian, el padre se redibuja por su cuenta.
 */

import { useState, useSyncExternalStore, type ReactNode } from "react";

export interface ModalAislado<N extends string> {
  abrir: (nombre: N) => void;
  /** Cierra ESE modal: otro abierto (fijado, ADR-420) sigue en pie. */
  cerrar: (nombre: N) => void;
  /** Los abiertos. Un conjunto NUEVO en cada cambio (`useSyncExternalStore` compara por identidad). */
  actual: () => ReadonlySet<N>;
  suscribir: (oyente: () => void) => () => void;
}

const NINGUNO: ReadonlySet<never> = new Set();

/**
 * Varios a la vez, como cuando eran un `useState` por modal (revisión 23-09):
 * un modal fijado deja tocar lo de atrás, así que «Dueños» fijado y abrir
 * «Importar» encima tiene que dejar los DOS abiertos. Un solo lugar para el
 * modal abierto cerraba el primero sin que nadie lo pidiera.
 */
export function crearModalAislado<N extends string>(): ModalAislado<N> {
  let abiertos: ReadonlySet<N> = NINGUNO;
  const oyentes = new Set<() => void>();
  const avisar = () => oyentes.forEach((o) => o());
  return {
    abrir: (nombre) => {
      if (abiertos.has(nombre)) return;
      abiertos = new Set([...abiertos, nombre]);
      avisar();
    },
    cerrar: (nombre) => {
      if (!abiertos.has(nombre)) return;
      const next = new Set(abiertos);
      next.delete(nombre);
      abiertos = next.size === 0 ? NINGUNO : next;
      avisar();
    },
    actual: () => abiertos,
    suscribir: (oyente) => {
      oyentes.add(oyente);
      return () => {
        oyentes.delete(oyente);
      };
    },
  };
}

/** Un almacén por componente, estable entre renders. */
export function useModalAislado<N extends string>(): ModalAislado<N> {
  const [modal] = useState(() => crearModalAislado<N>());
  return modal;
}

/** Lo único que se redibuja al abrir o cerrar un modal del almacén. */
export function AnfitrionDeModales<N extends string>({
  modales,
  children,
}: {
  modales: ModalAislado<N>;
  children: (abiertos: ReadonlySet<N>, cerrar: (nombre: N) => void) => ReactNode;
}) {
  const abiertos = useSyncExternalStore(modales.suscribir, modales.actual, () => NINGUNO as ReadonlySet<N>);
  return <>{children(abiertos, modales.cerrar)}</>;
}
