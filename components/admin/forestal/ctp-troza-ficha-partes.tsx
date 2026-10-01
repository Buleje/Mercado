"use client";

/**
 * Piezas de la ficha de una troza (`CtpTrozaFichaModal`): el dato grande, el
 * hito de la línea de tiempo y la línea «campo: valor». Salen del modal para
 * que el bloque «Del bosque» (ADR-450) use el mismo hito que el resto de la
 * historia.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";

export function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-1.5">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">{label}</p>
      <p className={`font-mono tabular-nums text-[var(--text-primary)] ${fuerte ? "text-base font-bold" : "text-sm"}`}>{valor}</p>
    </div>
  );
}

/** Un hito de la historia. Los que no ocurrieron se muestran apagados, no se esconden. */
export function Hito({ icono: Icono, ocurrio, tono = "ok", titulo, cuando, children }: {
  icono: LucideIcon; ocurrio: boolean; tono?: "ok" | "warn"; titulo: string;
  cuando?: string | null; children?: ReactNode;
}) {
  const color = !ocurrio ? "var(--rule-strong)" : tono === "warn" ? "var(--data-warning-500)" : "var(--data-success-500)";
  return (
    <li className={`flex gap-2.5 rounded-xl border p-3 ${ocurrio ? "border-[var(--rule-base)] bg-[var(--surface-raised)]" : "border-dashed border-[var(--rule-base)]"}`}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)` }}>
        <Icono className="h-4 w-4" style={{ color }} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
          {cuando && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{cuando}</span>}
        </p>
        <div className="mt-0.5 space-y-0.5 text-xs text-[var(--text-secondary)]">{children}</div>
      </div>
    </li>
  );
}

/** Una línea «campo: valor» que desaparece si no hay valor: un «—» por fila es ruido. */
export function Linea({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <p>
      <span className="text-[var(--text-secondary)]">{k}: </span>
      <span className={`font-medium text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>{v}</span>
    </p>
  );
}
