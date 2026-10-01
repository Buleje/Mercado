"use client";

/**
 * Los apartados de una vista del libro, como PESTAÑAS de verdad (ADR-343 → 431).
 *
 * Una pestaña del CTP puede tener dos cosas largas —el patio y el cuadro
 * oficial— que se turnan en el MISMO lugar. Eso es un `tablist`: hasta el 24-09
 * era un `<nav>` con `aria-current="step"`, así que un lector de pantalla no
 * sabía que el botón cambiaba el contenido de abajo, ni cuál estaba elegido.
 *
 * Ahora: `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, `aria-controls`
 * sólo en la pestaña activa (el otro panel no está montado), foco itinerante y
 * ←/→/Inicio/Fin. El contador dice su unidad («46 trozas»), la pista va en
 * texto para lectores (antes en `title`, que no llega por teclado ni en táctil).
 *
 * El apartado activo se recuerda por vista: quien trabaja todo el día en el
 * patio no tiene que volver a elegirlo cada vez que entra.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatNumber } from "@/lib/format";

export interface Apartado {
  id: string;
  label: string;
  /** Qué se hace ahí, en una línea (texto para lectores de pantalla). */
  hint?: string;
  /** Contador a la derecha del rótulo: filas, piezas, pendientes… */
  contador?: number | string;
  /** La unidad del contador, que entra al nombre accesible: «46 trozas». */
  unidad?: string;
}

/** Ids de la pestaña y de su panel, atados entre sí. */
export const idTab = (base: string, id: string) => `${base}-tab-${id}`;
export const idPanel = (base: string, id: string) => `${base}-panel-${id}`;
const idPista = (base: string, id: string) => `${base}-pista-${id}`;

/** Estado del apartado activo, persistido por vista. */
export function useApartado(claveMemoria: string, apartados: readonly Apartado[]) {
  const [activo, setActivo] = useState<string>(() => apartados[0]?.id ?? "");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(`ctp-apartado:${claveMemoria}`);
      if (guardado && apartados.some((a) => a.id === guardado)) setActivo(guardado);
    } catch {
      // localStorage puede fallar (modo privado): sin memoria, sin bug.
    }
    // Sólo al montar: después manda lo que el operador elija.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ir = useCallback(
    (id: string) => {
      setActivo(id);
      try {
        localStorage.setItem(`ctp-apartado:${claveMemoria}`, id);
      } catch {
        /* quota */
      }
    },
    [claveMemoria],
  );

  return { activo, ir };
}

const contadorConUnidad = (a: Apartado) => {
  if (a.contador == null) return null;
  const n = typeof a.contador === "number" ? formatNumber(a.contador) : a.contador;
  return a.unidad ? `${n} ${a.unidad}` : n;
};

export default function CtpApartados({
  apartados,
  activo,
  onIr,
  idBase,
  etiqueta,
}: {
  apartados: readonly Apartado[];
  activo: string;
  onIr: (id: string) => void;
  /** Prefijo de los ids de pestañas y paneles (`useId()` de la vista). */
  idBase: string;
  /** Nombre del grupo de pestañas, para el lector de pantalla. */
  etiqueta: string;
}) {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());

  /* Flechas, Inicio y Fin mueven el foco Y eligen (activación automática: con
     dos o tres pestañas no hay costo en mostrar el panel al llegar). */
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = apartados.length;
    const destino =
      e.key === "ArrowRight" ? (i + 1) % n
        : e.key === "ArrowLeft" ? (i - 1 + n) % n
          : e.key === "Home" ? 0
            : e.key === "End" ? n - 1
              : null;
    if (destino == null) return;
    e.preventDefault();
    const a = apartados[destino];
    onIr(a.id);
    refs.current.get(a.id)?.focus();
  };

  return (
    <>
    {/* A 400 px las pestañas van en dos columnas y el texto envuelve: con
        `whitespace-nowrap` la segunda se salía de la pantalla (medido: borde
        derecho en 450 px). */}
    <div role="tablist" aria-label={etiqueta} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
      {apartados.map((a, i) => {
        const esActivo = a.id === activo;
        const cuenta = contadorConUnidad(a);
        return (
          <button
            key={a.id}
            ref={(el) => {
              if (el) refs.current.set(a.id, el);
              else refs.current.delete(a.id);
            }}
            type="button"
            role="tab"
            id={idTab(idBase, a.id)}
            aria-selected={esActivo}
            aria-controls={esActivo ? idPanel(idBase, a.id) : undefined}
            aria-describedby={a.hint ? idPista(idBase, a.id) : undefined}
            tabIndex={esActivo ? 0 : -1}
            onClick={() => onIr(a.id)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={`flex min-h-12 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border-2 px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
              esActivo
                ? "border-[var(--accent)] bg-primary/10 font-bold text-[var(--text-primary)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span className="min-w-0">{a.label}</span>
            {cuenta != null && <span className="sr-only">,</span>}{" "}
            {cuenta != null && (
              <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                {cuenta}
              </span>
            )}
          </button>
        );
      })}
    </div>
    {/* La pista de cada pestaña, como DESCRIPCIÓN (no como parte del nombre). */}
    <div hidden>
      {apartados.map((a) => a.hint && <span key={a.id} id={idPista(idBase, a.id)}>{a.hint}</span>)}
    </div>
    </>
  );
}

/** El panel de una pestaña: nombrado por ella y alcanzable con Tab. */
export function CtpApartadoPanel({
  idBase,
  id,
  children,
  className = "",
}: {
  idBase: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={idPanel(idBase, id)}
      aria-labelledby={idTab(idBase, id)}
      tabIndex={0}
      className={`rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className}`}
    >
      {children}
    </div>
  );
}
