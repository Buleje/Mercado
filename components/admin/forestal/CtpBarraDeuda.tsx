"use client";

/**
 * La deuda del libro, en una línea.
 *
 * Antes esto vivía en dos sitios a la vez: tres tarjetas de KPI («Sin declarar»,
 * «A medio declarar», «Sin materia prima») mezcladas entre las cifras de la
 * física del proceso, y ADEMÁS un cartel ámbar debajo que volvía a listar
 * exactamente las mismas corridas sin materia prima. Un contador de trabajo
 * pendiente no es un indicador: no describe el período, pide que hagas algo.
 * Por eso sale de la grilla de KPIs y se convierte en una barra de pastillas
 * accionables, y el cartel ámbar pasa a ser el DETALLE de su pastilla.
 *
 * Regla que la mantiene honesta: cero no se muestra como pastilla de alarma.
 * Sin deuda, la barra dice que no hay deuda y ocupa una línea.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ChevronDown, PackageCheck } from "@buleje/design-system/icons";

export interface DeudaItem {
  key: string;
  /** Qué falta hacer, en palabras del aserradero. */
  label: string;
  /** El número que duele. */
  valor: number | string;
  /** La cola de contexto: m³ colgando, plazo, etc. */
  hint?: string;
  tono: "warning" | "error";
  /** Acción directa (abrir el menú que lo resuelve). Excluyente con `contenido`. */
  onClick?: () => void;
  /** Detalle que se despliega debajo de la barra al tocar la pastilla. */
  contenido?: ReactNode;
  title?: string;
}

const TONOS = {
  warning: {
    chip: "border-[var(--data-warning-500)]/45 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    activo: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/18",
  },
  error: {
    chip: "border-[var(--data-error-500)]/45 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    activo: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/18",
  },
} as const;

export default function CtpBarraDeuda({
  items,
  /** Qué decir cuando no hay nada pendiente. */
  vacio = "El libro está al día: nada pendiente de declarar ni de atribuir.",
}: {
  items: DeudaItem[];
  vacio?: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  /* Si la pastilla abierta desaparece —se resolvió esa deuda— el panel de abajo
     no puede quedar mostrando el detalle de algo que ya no existe. */
  useEffect(() => {
    if (abierto && !items.some((i) => i.key === abierto)) setAbierto(null);
  }, [items, abierto]);

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-1.5 px-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-500)]" aria-hidden />
        {vacio}
      </p>
    );
  }

  const abiertoItem = items.find((i) => i.key === abierto);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          Pendiente
        </span>
        {items.map((i) => {
          const t = TONOS[i.tono];
          const expandible = Boolean(i.contenido);
          const activo = abierto === i.key;
          return (
            <button
              key={i.key}
              type="button"
              title={i.title}
              aria-expanded={expandible ? activo : undefined}
              onClick={() => {
                if (expandible) setAbierto((v) => (v === i.key ? null : i.key));
                else i.onClick?.();
              }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-sm font-bold transition ${t.chip} ${
                activo ? t.activo : ""
              } ${expandible || i.onClick ? "hover:brightness-95" : "cursor-default"}`}
            >
              <span className="tabular-nums">{i.valor}</span>
              <span className="font-semibold">{i.label}</span>
              {i.hint && <span className="hidden font-normal opacity-75 sm:inline">· {i.hint}</span>}
              {expandible && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${activo ? "rotate-180" : ""}`} aria-hidden />}
            </button>
          );
        })}
      </div>
      {abiertoItem?.contenido && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">{abiertoItem.contenido}</div>
      )}
    </div>
  );
}
