"use client";

/**
 * El balance de la Distribución de rolliza: lo distribuido y lo que falta,
 * en las tres unidades con las que se declara (m³ · PT · piezas).
 *
 * Salió de `ResumenReparto.tsx` (2026-10-20, Brandon: «más compacto como las otras
 * pestañas»): antes cada tarjeta ocupaba dos renglones —el rótulo arriba, las
 * cifras abajo— y ahora va en UNO cuando entra; si no entra (400 px, cifras
 * grandes) las cifras bajan solas por el `flex-wrap`, sin perder ninguna.
 */

import type { ReactNode } from "react";
import { Info } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import CifraExplicada, { type FilaDeCuenta } from "./cifra-explicada";

/**
 * Una mitad del balance. Los tres números juntos y no sólo el m³ porque el
 * que va a cubrir el faltante necesita saber CUÁNTAS piezas le faltan, no sólo
 * cuánto volumen.
 */
export function CifraBalance({ titulo, ayuda, m3, pt, piezas, tono, cuenta, etiqueta }: {
  titulo: string;
  /** El chip del cuadre de esta cifra (2026-10-03). */
  etiqueta?: ReactNode;
  ayuda: string;
  m3: number;
  pt: number;
  piezas: number;
  tono: "ok" | "falta";
  /** De qué está hecho este número — el «¿por qué dice esto?» (2026-09-09). */
  cuenta?: { formula: string; filas: FilaDeCuenta[]; vacio?: string };
}) {
  const alerta = tono === "falta";
  const unidad = "text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 ${alerta
      ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/8"
      : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"}`}
    >
      <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {titulo}
        <AdminTooltip content={ayuda} className="max-w-[280px] text-sm font-normal normal-case leading-relaxed tracking-normal">
          <button type="button" aria-label={`Qué es «${titulo}»`} className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] print:hidden">
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </AdminTooltip>
        {/* El ⓘ dice QUÉ es; la calculadora dice DE QUÉ ESTÁ HECHO. */}
        {cuenta && (
          <CifraExplicada
            titulo={titulo}
            formula={cuenta.formula}
            filas={cuenta.filas}
            total={`${fmtM3(m3)} m³`}
            vacio={cuenta.vacio}
          />
        )}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 font-mono tabular-nums">
        <span className={`flex items-baseline gap-1 text-lg font-extrabold leading-none ${alerta
          ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          : "text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
        >
          {fmtM3(m3)}<span className={unidad}>m³</span>
        </span>
        <span className="flex items-baseline gap-1 text-sm font-bold leading-none text-[var(--text-secondary)]">
          {fmtPt(pt)}<span className={unidad}>PT</span>
        </span>
        <span className="flex items-baseline gap-1 text-sm font-bold leading-none text-[var(--text-secondary)]">
          {fmtPiezas(piezas)}<span className={unidad}>pzas</span>
        </span>
      </span>
      {etiqueta && <span className="ml-auto">{etiqueta}</span>}
    </div>
  );
}
