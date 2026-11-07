"use client";

/**
 * Piezas que comparten `PreviaDoc` (el panel del Archivo, con su «⋯» del drive) y
 * `PreviaDocSuelta` (el mismo panel para pantallas que no tienen el drive montado,
 * como los papeles de una GTF en Forestal): cabecera con ‹ ›, «Qué es» y la fila de datos.
 */

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { DbDocument } from "@/lib/types/documents";
import IconoArchivo from "../explorador/IconoArchivo";

export type Entidades = { people?: string[]; orgs?: string[]; places?: string[]; dates?: string[]; amounts?: string[] };
export type Meta = { description?: string; summary?: string; descripcionUsuario?: string; entities?: Entidades };

/**
 * Cómo se navega el panel. El Archivo usa su panel de vista previa (Alt+P); Esenciales,
 * Terceros y Forestal lo muestran al costado de su lista, con ‹ › por los papeles y
 * «‹ Volver» a la lista (ver `use-doc-al-costado`).
 */
export interface NavPrevia {
  anterior?: () => void;
  siguiente?: () => void;
  posicion: { actual: number; total: number } | null;
  onCerrar: () => void;
  cerrarTitulo: string;
  /** «Volver a Juana Pérez»: un botón arriba que vuelve a la lista. */
  volver?: string;
}

export const ACCION = button({ variant: "secondary", className: "flex-1 gap-1.5 px-3" });
const ICONO = button({ variant: "ghost", size: "icon", className: "shrink-0" });
const VOLVER = button({ variant: "ghost", className: "gap-1 px-2 text-[var(--accent-ink)] dark:text-[var(--accent)]" });

/** Los datos que la IA sacó del papel, en una sola fila de chips (hasta 8). */
export function chipsDe(e: Entidades | undefined): string[] {
  if (!e) return [];
  const todos = [...(e.amounts ?? []), ...(e.dates ?? []), ...(e.people ?? []), ...(e.orgs ?? []), ...(e.places ?? [])];
  return [...new Set(todos.map((x) => x.trim()).filter(Boolean))].slice(0, 8);
}

export function descripcionDe(meta: Meta): string {
  return (meta.descripcionUsuario || meta.description || meta.summary || "").trim();
}

export function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-[var(--text-tertiary)]">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

/** «‹ Volver a …», el nombre, «3 de 75», ‹ › y cerrar. */
export function CabeceraPrevia({ doc, nav: n }: { doc: DbDocument; nav: NavPrevia }) {
  return (
    <>
      {n.volver && (
        <button type="button" onClick={n.onCerrar} className={VOLVER}>
          <ChevronLeft className="h-4 w-4" /> {n.volver}
        </button>
      )}
      <div className="flex items-start gap-2">
        <IconoArchivo doc={doc} tam="chico" />
        <div className="min-w-0 flex-1">
          <CardTitle className="line-clamp-2 break-words text-sm font-bold">{doc.name}</CardTitle>
          {n.posicion && <p className="text-xs tabular-nums text-[var(--text-tertiary)]">{n.posicion.actual} de {n.posicion.total}</p>}
        </div>
        <button type="button" onClick={n.anterior} disabled={!n.anterior} className={ICONO} aria-label="Archivo anterior" title="Anterior">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={n.siguiente} disabled={!n.siguiente} className={ICONO} aria-label="Archivo siguiente" title="Siguiente">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button type="button" onClick={n.onCerrar} className={ICONO} aria-label={n.cerrarTitulo} title={n.cerrarTitulo}>
          <X className="h-5 w-5" />
        </button>
      </div>
    </>
  );
}

/** Qué es: lo que leyó la IA (o lo que escribiste tú, que pesa más). */
export function QueEs({ cargando, descripcion, chips }: { cargando: boolean; descripcion: string; chips: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
        <Sparkles className="h-4 w-4 text-primary" /> Qué es
      </p>
      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo…</p>
      ) : descripcion ? (
        <p className="line-clamp-6 whitespace-pre-line text-sm text-[var(--text-primary)]">{descripcion}</p>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Todavía sin describir: ábrelo y usa «Analizar» para que la IA lo lea.</p>
      )}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}
