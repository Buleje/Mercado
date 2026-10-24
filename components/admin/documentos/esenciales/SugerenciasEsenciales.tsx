"use client";

import { Eye, Lightbulb, Star, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import type { SugerenciaEsencial } from "@/lib/documentos/esenciales";
import { FolderGlyph } from "../folder-visuals";
import { veces } from "./compartido";

/**
 * «Sumar a Esenciales» lo que más abres y todavía no está (Brandon 23-10: en
 * Blas había 1 esencial y otras carpetas abiertas seguido). Una fila; cada
 * sugerencia con su «Sumar» y su ✕ para que no vuelva a salir.
 */
export default function SugerenciasEsenciales({ sugerencias, onSumar, onDescartar }: {
  sugerencias: readonly SugerenciaEsencial<DbDocumentFolder>[];
  onSumar: (f: DbDocumentFolder) => void;
  onDescartar: (id: string) => void;
}) {
  if (sugerencias.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Carpetas que abres seguido" data-qa="esenciales-sugeridas">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        <Lightbulb className="h-4 w-4" /> <span className="max-2xl:sr-only">Sugeridas</span>
        <InfoTip
          title="Sugeridas"
          what={<span>Carpetas cuyos papeles abriste varias veces en los últimos 90 días y que no están en Esenciales.</span>}
          affects={<span>«Sumar» la lleva a Esenciales; la ✕ la deja de sugerir en este equipo.</span>}
        />
      </span>
      {sugerencias.map(({ carpeta, vistas, ruta }) => (
        <span
          key={carpeta.id}
          className="inline-flex h-12 items-stretch overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
          title={`${carpeta.name} · abierta ${veces(vistas)} en 90 días · ${ruta.length > 0 ? `en ${ruta.join(" › ")}` : "en la raíz del Archivo"}`}
        >
          <span className="inline-flex min-w-0 items-center gap-2 pl-3 pr-2 text-sm">
            <FolderGlyph folder={carpeta} className="h-5 w-5 shrink-0 text-lg" />
            {/* Una fila aun con 3 a 1280 (23-10): el nombre se acorta y las veces van al tooltip, con su número a la vista. */}
            <span className="max-w-[6.5rem] truncate font-bold text-[var(--text-primary)]">{carpeta.name}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-[var(--text-tertiary)]">
              <Eye className="h-4 w-4" aria-hidden /> {vistas}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onSumar(carpeta)}
            title="Sumar a Esenciales"
            aria-label={`Sumar «${carpeta.name}» a Esenciales`}
            className={cn(button({ variant: "ghost" }), "h-full w-12 rounded-none border-l border-[var(--rule-base)] px-0 text-[var(--accent-ink)] dark:text-[var(--accent)]")}
          >
            <Star className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDescartar(carpeta.id)}
            aria-label={`No sugerir «${carpeta.name}»`}
            title="No sugerir"
            className="inline-flex w-12 items-center justify-center border-l border-[var(--rule-base)] text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      ))}
    </div>
  );
}
