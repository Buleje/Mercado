"use client";

/**
 * Ir de apartado en apartado dentro de una vista del libro (ADR-343).
 *
 * Una pestaña del CTP puede tener dos o tres cosas largas apiladas —el patio y
 * el cuadro oficial, por ejemplo— y apilarlas obliga a scrollear una entera para
 * llegar a la otra. Acá se turnan en el MISMO lugar: se elige por su número o se
 * avanza con las flechas.
 *
 * El apartado activo se recuerda por vista: el operador que trabaja todo el día
 * en el patio no tiene que volver a elegirlo cada vez que entra.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";

export interface Apartado {
  id: string;
  label: string;
  /** Qué se hace ahí, en una línea (va al tooltip). */
  hint?: string;
  /** Contador a la derecha del rótulo: filas, piezas, pendientes… */
  contador?: number | string;
}

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
      try { localStorage.setItem(`ctp-apartado:${claveMemoria}`, id); } catch { /* quota */ }
    },
    [claveMemoria],
  );

  return { activo, ir };
}

export default function CtpApartados({
  apartados,
  activo,
  onIr,
}: {
  apartados: readonly Apartado[];
  activo: string;
  onIr: (id: string) => void;
}) {
  const i = Math.max(0, apartados.findIndex((a) => a.id === activo));
  const anterior = apartados[i - 1];
  const siguiente = apartados[i + 1];

  return (
    <nav
      aria-label="Apartados de la vista"
      className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2"
    >
      <button
        type="button"
        onClick={() => anterior && onIr(anterior.id)}
        disabled={!anterior}
        aria-label={anterior ? `Ir a ${anterior.label}` : "No hay apartado anterior"}
        title={anterior ? anterior.label : undefined}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {apartados.map((a, n) => {
          const esActivo = a.id === activo;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onIr(a.id)}
                aria-current={esActivo ? "step" : undefined}
                title={a.hint}
                className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                  esActivo
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="font-mono text-[length:var(--ts-2xs)] opacity-70">{String(n + 1).padStart(2, "0")}</span>
                {a.label}
                {a.contador != null && (
                  <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] tabular-nums">
                    {a.contador}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() => siguiente && onIr(siguiente.id)}
        disabled={!siguiente}
        aria-label={siguiente ? `Ir a ${siguiente.label}` : "No hay apartado siguiente"}
        title={siguiente ? siguiente.label : undefined}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
