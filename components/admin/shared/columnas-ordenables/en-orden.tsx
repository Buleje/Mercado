"use client";

/**
 * EnOrden — pinta las celdas de una fila (cabecera, cuerpo o pie) en el orden
 * que eligió el operador.
 *
 * `celdas` es un mapa id → celda. Una celda `false`/`null`/`undefined` es una
 * columna oculta y no se pinta: así una tabla que ya tenía
 * `{cols.x && <td>…</td>}` sólo cambia el `{` por `x: cols.x && <td>…</td>,`.
 * La cabecera, cada fila y el pie usan el MISMO `orden`: si uno pintara con el
 * suyo, el dato quedaría bajo el título de otra columna.
 */

import { Fragment, type ReactNode } from "react";
import { RotateCcw } from "@buleje/design-system/icons";

export function EnOrden({
  orden,
  celdas,
}: {
  orden: readonly string[];
  celdas: Partial<Record<string, ReactNode>>;
}) {
  /* `celdas` es un mapa de texto: un id mal escrito no lo ve el tipo y la
     celda desaparece sin ruido (lo advirtió la revisión, 2026-09-26). En
     desarrollo se avisa; en producción no cuesta nada. */
  if (process.env.NODE_ENV !== "production") {
    const perdidas = Object.keys(celdas).filter((id) => celdas[id] && !orden.includes(id));
    if (perdidas.length > 0) console.warn(`[EnOrden] celdas sin columna en el orden: ${perdidas.join(", ")}`);
  }
  return (
    <>
      {orden.map((id) => {
        const c = celdas[id];
        return c === undefined || c === null || c === false ? null : <Fragment key={id}>{c}</Fragment>;
      })}
    </>
  );
}

/**
 * «Restablecer columnas»: aparece sólo cuando el orden difiere del de fábrica.
 * Sin él, una columna arrastrada por error no tiene vuelta atrás a la vista.
 */
export function BotonRestablecerColumnas({
  cambiado,
  onRestablecer,
  className = "",
  soloIcono = false,
}: {
  cambiado: boolean;
  onRestablecer: () => void;
  className?: string;
  /** Sólo el ícono (el nombre va en el `title`): para pantallas con varias
   *  tablas que comparten el orden, donde el texto repetido sería ruido. */
  soloIcono?: boolean;
}) {
  if (!cambiado) return null;
  return (
    <button
      type="button"
      onClick={onRestablecer}
      title="Restablecer columnas: volver al orden original"
      aria-label={soloIcono ? "Restablecer columnas" : undefined}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg ${soloIcono ? "w-9 justify-center" : "px-2.5"} text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] ${className}`}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
      {!soloIcono && "Restablecer columnas"}
    </button>
  );
}
