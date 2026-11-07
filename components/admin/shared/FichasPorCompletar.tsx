"use client";

/**
 * FichasPorCompletar — la franja «10 fichas sin DNI» y su lista por persona.
 *
 * Una ficha se carga apurada y se completa «después». Esta franja es ese
 * después: dice cuántas están a medias y qué les falta, y cada fila lleva con
 * «Completar» al formulario de esa ficha, parado en lo primero que falta. Sirve
 * a RRHH › Personal y al Directorio forestal: quien la usa pone los datos.
 *
 * Cerrada por defecto: son pendientes, no un aviso que tape la tabla.
 */

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, ListChecks, Pencil } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";

export interface FichaPorCompletar {
  id: string;
  nombre: string;
  /** Texto chico al lado del nombre (el papel: «Transportista»). */
  detalle?: string;
  faltan: { clave: string; label: string }[];
}

interface Props {
  items: readonly FichaPorCompletar[];
  /** «10 sin DNI» · «10 sin celular»…, ya ordenadas. */
  resumen: readonly { clave: string; n: number; texto: string }[];
  onCompletar: (id: string) => void;
  className?: string;
}

export default function FichasPorCompletar({ items, resumen, onCompletar, className }: Props) {
  const [abierta, setAbierta] = useState(false);
  const idLista = useId();
  if (items.length === 0) return null;

  return (
    <section aria-label="Fichas por completar" className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]", className)}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-controls={idLista}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2 text-left"
      >
        <ListChecks className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-bold text-[var(--text-primary)]">
            {items.length} {items.length === 1 ? "ficha por completar" : "fichas por completar"}
          </span>
          <span className="text-[var(--text-secondary)]"> · {resumen.slice(0, 3).map((r) => r.texto).join(" · ")}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          {abierta ? "Ocultar" : "Ver lista"}
          {abierta ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </button>

      {abierta && (
        <ul id={idLista} className="max-h-80 divide-y divide-[var(--rule-soft)] overflow-y-auto border-t border-[var(--rule-soft)]">
          {items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {it.nombre}
                  {it.detalle && <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">{it.detalle}</span>}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {it.faltan.map((f) => (
                    <span key={f.clave} className="rounded-md bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] ring-1 ring-[var(--rule-base)]">
                      {f.label}
                    </span>
                  ))}
                </p>
              </div>
              <button type="button" onClick={() => onCompletar(it.id)} className={button({ variant: "secondary", className: "h-12 rounded-xl" })} aria-label={`Completar la ficha de ${it.nombre}`}>
                <Pencil className="h-4 w-4" aria-hidden /> Completar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
