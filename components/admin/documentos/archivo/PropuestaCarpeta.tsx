"use client";

import { ChevronDown, ChevronUp, FolderInput, FolderOpen, Loader2, X } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { PropuestaCarpetaModelo } from "./use-propuesta-carpeta";

/**
 * «¿Va a "CCNN Santa Rosa de Chivis"? · Mover · Otra · No» (Brandon 24-10).
 * La pastilla va en la fila de avisos del Archivo; «Otra» abre debajo la
 * lista con todas las candidatas de cada papel suelto. Nada se mueve solo.
 */

const SEGMENTO =
  "inline-flex h-12 shrink-0 items-center gap-1.5 border-l border-[var(--accent)]/30 px-3 text-sm font-bold transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60 max-sm:flex-1 max-sm:justify-center max-sm:border-t max-sm:first-of-type:border-l-0";
const ACENTO = "text-[var(--accent-ink)] dark:text-[var(--accent)]";

const papeles = (n: number) => (n === 1 ? "1 papel" : `${n} papeles`);

interface PastillaProps {
  modelo: PropuestaCarpetaModelo;
  abierta: boolean;
  onAbrir: () => void;
}

export function PastillaPropuesta({ modelo, abierta, onAbrir }: PastillaProps) {
  const { items, leyendo, moviendo, mover, descartar } = modelo;
  if (items.length === 0) {
    if (leyendo.length === 0) return null;
    return (
      <span
        role="status"
        className="inline-flex h-12 max-w-full items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-secondary)]"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        <span className="truncate">Leyendo {papeles(leyendo.length)} para proponerte carpeta…</span>
      </span>
    );
  }
  const { doc, candidatas } = items[0];
  const c = candidatas[0];
  const ocupado = moviendo === doc.id;
  return (
    <div
      role="status"
      className={cn("inline-flex max-w-full items-stretch overflow-hidden rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 max-sm:w-full max-sm:flex-wrap", ACENTO)}
    >
      {/* En el celular la pregunta va entera en su fila y los botones debajo: el nombre de la carpeta es el dato. */}
      <span className="inline-flex min-w-0 items-center gap-2 pl-3 pr-2 max-sm:basis-full max-sm:py-2">
        <FolderInput className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold" title={c.nombre}>¿Va a «{c.nombre}»?</span>
          <span className="block truncate text-xs text-[var(--text-secondary)]" title={doc.name}>
            {doc.name}{items.length > 1 ? ` y ${papeles(items.length - 1)} más` : ""}
          </span>
        </span>
        <InfoTip
          title="Por qué esta carpeta"
          what={<span>{c.motivos.join(" · ")}</span>}
          affects={<span>«Mover» lo lleva ahí y te deja deshacerlo. Nada se mueve solo.</span>}
          example={<span>Una foto que dice «CCNN Santa Rosa de Chivis» o su RUC se propone para la carpeta de esa comunidad.</span>}
        />
      </span>
      <button type="button" onClick={() => void mover(doc, c.folderId)} disabled={ocupado} className={SEGMENTO}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Mover
      </button>
      <button type="button" onClick={onAbrir} aria-expanded={abierta} className={SEGMENTO}>
        Otra {abierta ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => descartar(doc.id)}
        aria-label={`No va ahí: ${doc.name}`}
        title="No va ahí (no te lo vuelvo a proponer)"
        className={cn(SEGMENTO, "w-12 justify-center px-0 max-sm:flex-none")}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

interface ListaProps {
  modelo: PropuestaCarpetaModelo;
  /** «Otra carpeta…»: la ventana de mover de siempre, con todo el árbol. */
  onOtraCarpeta: (doc: DbDocument) => void;
}

export function ListaPropuestas({ modelo, onOtraCarpeta }: ListaProps) {
  const { items, moviendo, mover, descartar } = modelo;
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--accent)]/30 bg-[var(--surface-raised)]">
      {items.map(({ doc, candidatas }) => (
        <li key={doc.id} className="flex flex-wrap items-center gap-2 py-1.5 pl-3">
          <div className="min-w-0 flex-1 basis-48">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]" title={doc.name}>{doc.name}</span>
            <span className="block truncate text-sm text-[var(--text-secondary)]">{candidatas[0].motivos.join(" · ")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pr-1">
            {candidatas.map((c) => (
              <button
                key={c.folderId}
                type="button"
                onClick={() => void mover(doc, c.folderId)}
                disabled={moviendo === doc.id}
                title={c.motivos.join(" · ")}
                className={cn(
                  "inline-flex h-12 max-w-64 items-center gap-1.5 rounded-xl max-sm:max-w-full border border-[var(--accent)]/40 px-3 text-sm font-bold transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60",
                  ACENTO,
                )}
              >
                <FolderInput className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{c.nombre}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => onOtraCarpeta(doc)}
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <FolderOpen className="h-4 w-4 shrink-0" aria-hidden /> Otra carpeta…
            </button>
            <button
              type="button"
              onClick={() => descartar(doc.id)}
              aria-label={`No proponer carpeta para ${doc.name}`}
              title="No va en ninguna de estas"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
