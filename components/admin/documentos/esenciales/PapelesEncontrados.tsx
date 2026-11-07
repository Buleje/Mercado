"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { TOPE_BUSQUEDA, palabrasDe, partirResaltado, type ResultadoBusqueda } from "@/lib/documentos/esenciales-buscar";
import { getFileIcon } from "../archivo-visual";
import { ExpiryBadge } from "../archivo/piezas-sueltas";

/** La palabra buscada, resaltada con tokens del DS (sirve en claro y en oscuro). */
function Resaltado({ texto, palabras }: { texto: string; palabras: readonly string[] }) {
  return (
    <>
      {partirResaltado(texto, palabras).map((p, i) =>
        p.marca ? (
          <mark key={i} className="rounded-sm bg-[var(--accent-soft)] px-0.5 font-bold text-[var(--accent-ink)] dark:text-[var(--text-primary)]">
            {p.texto}
          </mark>
        ) : (
          <Fragment key={i}>{p.texto}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Papeles de todas las esenciales que dicen lo que escribió Brandon, cada uno
 * con su camino («CCNN Santa Rosa › 19-SEC»). Un clic abre el papel; un clic
 * en el camino lleva a esa carpeta.
 */
export default function PapelesEncontrados<D extends DbDocument>({ q, resultados, onAbrir, onIrACarpeta, menuDe }: {
  q: string;
  resultados: ResultadoBusqueda<D>[];
  /** Abre la vista previa con las flechas por los resultados. */
  onAbrir: (doc: D, lista: readonly D[]) => void;
  onIrACarpeta: (esencialId: string, carpetaId: string) => void;
  /** El «⋯» de cada papel. */
  menuDe?: (doc: D) => ReactNode;
}) {
  const palabras = useMemo(() => palabrasDe(q), [q]);
  const lista = useMemo(() => resultados.map((r) => r.doc), [resultados]);
  const texto = q.trim();
  if (texto.length < 2) return null;

  return (
    <section aria-label="Papeles encontrados" data-qa="esenciales-resultados" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardTitle className="min-w-0 break-words">Papeles con «{texto}»</CardTitle>
        {resultados.length > 0 && (
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]" role="status">
            {resultados.length === 1 ? "1 papel" : `${resultados.length} papeles`}
          </span>
        )}
      </div>

      {resultados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-6 text-center text-sm text-[var(--text-secondary)]" role="status">
          Ningún papel de tus esenciales dice «{texto}».
        </p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-soft)]">
          {resultados.map((r) => {
            const { doc } = r;
            const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
            return (
              <li key={doc.id} className="flex min-h-12 items-center gap-2 pr-2 hover:bg-[var(--surface-sunken)]" data-qa="esenciales-resultado">
                <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2">
                  <button type="button" onClick={() => onAbrir(doc, lista)} aria-label={`Abrir ${doc.name}`} className="mt-0.5 shrink-0">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", bg)}>
                      <Icon className={cn("h-5 w-5", tint)} />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => onAbrir(doc, lista)} className="block max-w-full truncate text-left text-sm font-bold text-[var(--text-primary)]">
                      <Resaltado texto={doc.name} palabras={palabras} />
                    </button>
                    <nav aria-label="Dónde está" className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-[var(--text-secondary)]">
                      <button
                        type="button"
                        onClick={() => onIrACarpeta(r.esencialId, r.carpetaId)}
                        className="flex min-w-0 flex-wrap items-center gap-x-1 text-left hover:text-[var(--accent-ink)] hover:underline dark:hover:text-[var(--accent)]"
                      >
                        {r.ruta.map((n, i) => (
                          <Fragment key={i}>
                            {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" />}
                            <span className="max-w-[12rem] truncate">{n}</span>
                          </Fragment>
                        ))}
                      </button>
                    </nav>
                    {r.coincideEn === "etiqueta" && <p className="text-xs text-[var(--text-tertiary)]">en las etiquetas</p>}
                    {r.coincideEn === "texto" && (
                      <p className="line-clamp-2 break-words text-xs text-[var(--text-tertiary)]">
                        en el texto:{" "}
                        {r.fragmento ? <Resaltado texto={r.fragmento} palabras={palabras} /> : "…"}
                      </p>
                    )}
                  </div>
                  {doc.expiresAt && <ExpiryBadge expiresAt={doc.expiresAt} className="shrink-0" />}
                </div>
                {menuDe?.(doc)}
              </li>
            );
          })}
        </ul>
      )}

      {resultados.length >= TOPE_BUSQUEDA && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">Mostrando {TOPE_BUSQUEDA}; escribe más para afinar</p>
      )}
    </section>
  );
}
