"use client";

/**
 * Pestanas — un tablist de verdad para los bloques de Saldos.
 *
 * Saldos tenía tres grupos de pestañas y sólo el de arriba era un tablist
 * completo; los dos de «Disponible» usaban `role="tab"` sin foco itinerante,
 * sin flechas, sin `aria-controls` y sin `type="button"`. Acá vive la regla una
 * sola vez: flechas, Inicio y Fin mueven y el foco las sigue; Tab entra y sale
 * del grupo de una (tabIndex itinerante), como en AdminTabBar.
 *
 * `aria-controls` va SÓLO en la pestaña activa: los paneles inactivos no se
 * montan, y apuntar a un id que no existe es un error de accesibilidad.
 */

import type { KeyboardEvent, ReactNode } from "react";

export interface Pestana<T extends string> {
  id: T;
  contenido: ReactNode;
}

const TECLAS = ["ArrowLeft", "ArrowRight", "Home", "End"];

export default function Pestanas<T extends string>({
  items,
  activa,
  onCambiar,
  etiqueta,
  idTab,
  idPanel,
  className,
  claseBoton,
}: {
  items: readonly Pestana<T>[];
  activa: T;
  onCambiar: (id: T) => void;
  /** El nombre del grupo para el lector de pantalla. */
  etiqueta: string;
  idTab: (id: T) => string;
  idPanel: (id: T) => string;
  className?: string;
  claseBoton: (seleccionada: boolean) => string;
}) {
  const ids = items.map((i) => i.id);

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!TECLAS.includes(e.key)) return;
    e.preventDefault();
    const i = ids.indexOf(activa);
    const destino =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? ids.length - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
    onCambiar(ids[destino]);
    (
      e.currentTarget.parentElement?.querySelector(
        `#${CSS.escape(idTab(ids[destino]))}`,
      ) as HTMLElement | null
    )?.focus();
  };

  return (
    <div role="tablist" aria-label={etiqueta} className={className}>
      {items.map((p) => {
        const sel = p.id === activa;
        return (
          <button
            key={p.id}
            id={idTab(p.id)}
            type="button"
            role="tab"
            aria-selected={sel}
            aria-controls={sel ? idPanel(p.id) : undefined}
            tabIndex={sel ? 0 : -1}
            onClick={() => onCambiar(p.id)}
            onKeyDown={alTeclear}
            className={claseBoton(sel)}
          >
            {p.contenido}
          </button>
        );
      })}
    </div>
  );
}
