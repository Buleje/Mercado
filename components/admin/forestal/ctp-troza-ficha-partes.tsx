"use client";

/**
 * Piezas de la ficha de una troza (`CtpTrozaFichaModal`): el dato grande, el
 * hito de la línea de tiempo y la línea «campo: valor». Salen del modal para
 * que el bloque «Del bosque» (ADR-450) use el mismo hito que el resto de la
 * historia.
 *
 * El hito es un NODO de una línea vertical (05-10): un punto con su ícono, el
 * riel que lo une con el siguiente y, colgando, lo que tardó hasta ahí. Antes
 * eran tarjetas iguales apiladas: se leían como cuatro avisos y no como un
 * camino.
 */

import type { ReactNode } from "react";
import { Clock, type LucideIcon } from "@buleje/design-system/icons";
import { ESTADO_META, type EstadoTroza } from "@/lib/forestal/trozas-patio";
import { puntoDeTono } from "./ctp-trozas-ui";

export function Dato({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-1.5">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">{label}</p>
      <p className={`font-mono tabular-nums text-[var(--text-primary)] ${fuerte ? "text-base font-bold" : "text-sm"}`}>{valor}</p>
    </div>
  );
}

/**
 * Un hito de la historia. Los que no ocurrieron se muestran apagados (punto
 * punteado), no se esconden: que un paso no haya pasado es información.
 */
export function Hito({ icono: Icono, ocurrio, tono = "ok", titulo, cuando, nota, tramo, children }: {
  icono: LucideIcon; ocurrio: boolean; tono?: "ok" | "warn"; titulo: string;
  cuando?: string | null;
  /** De dónde sale la fecha si no es la de la pieza («fecha de la recepción de su guía»). */
  nota?: string | null;
  /** Lo que tardó hasta el paso siguiente, colgado sobre el riel. */
  tramo?: string | null;
  children?: ReactNode;
}) {
  const color = !ocurrio ? "var(--text-tertiary)" : tono === "warn" ? "var(--data-warning-500)" : "var(--data-success-500)";
  return (
    <li className="group/hito relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
      {/* El riel: del punto hacia abajo, hasta el próximo. El último no tiene. */}
      <span aria-hidden="true" className="absolute bottom-0 left-4 top-9 w-0.5 -translate-x-1/2 rounded-full bg-[var(--rule-base)] group-last/hito:hidden" />
      <span
        className={`relative grid h-8 w-8 place-items-center rounded-full ${ocurrio ? "" : "border border-dashed border-[var(--rule-strong)] bg-[var(--surface-raised)]"}`}
        style={ocurrio ? { background: `color-mix(in oklab, ${color} 18%, var(--surface-raised))` } : undefined}
      >
        <Icono className="h-4 w-4" style={{ color }} aria-hidden="true" />
      </span>
      <div className="min-w-0 pt-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className={`text-sm font-bold ${ocurrio ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{titulo}</span>
          {cuando && <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">{cuando}</span>}
        </p>
        {nota && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{nota}</p>}
        {children && <div className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">{children}</div>}
        {tramo && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)]">
            <Clock className="h-3 w-3" aria-hidden="true" /> {tramo}
          </p>
        )}
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

/**
 * El estado de la pieza, con el MISMO punto de color que la tabla del patio.
 * El color es una marca; el rótulo va en el token de texto (contraste AA).
 */
export function ChipEstado({ estado }: { estado: EstadoTroza }) {
  const m = ESTADO_META[estado];
  return (
    <span
      title={m.hint}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]"
    >
      <span className="h-2 w-2 rounded-full" style={{ background: puntoDeTono(m.tono) }} aria-hidden="true" />
      {m.label}
    </span>
  );
}
