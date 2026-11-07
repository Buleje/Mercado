"use client";

/**
 * ParecidosDoc — "otros papeles de lo mismo", sin que tengas que buscarlos.
 *
 * Es distinto de "Documentos relacionados": aquellos los vinculás vos a mano.
 * Estos aparecen solos, deducidos de lo que ya se sabe de cada archivo (RUC,
 * empresa, importe, etiquetas). Cada uno viene con el motivo, porque una lista
 * de sugerencias sin explicación no se puede confiar —y con un clic se abre.
 */

import { useMemo } from "react";
import { Link2, FileText } from "@buleje/design-system/icons";
import { documentosParecidos } from "@/lib/documentos/parecidos";
import type { DbDocument } from "@/lib/types/documents";

interface Props {
  doc: DbDocument;
  todos: DbDocument[];
  onAbrir: (doc: DbDocument) => void;
}

export default function ParecidosDoc({ doc, todos, onAbrir }: Props) {
  const parecidos = useMemo(() => documentosParecidos(doc, todos, 5), [doc, todos]);
  if (parecidos.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Link2 className="h-4 w-4 text-[var(--accent)]" /> Parecidos a este
      </p>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        Otros documentos que hablan de lo mismo. Nadie los vinculó: se deducen de lo que dice cada uno.
      </p>
      <ul className="space-y-1">
        {parecidos.map(({ doc: p, motivos }) => (
          <li key={p.id}>
            <button
              onClick={() => onAbrir(p)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{p.name}</span>
                <span className="block truncate text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
                  {motivos.join(" · ")}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
