"use client";

import ChipsVencimiento from "../ChipsVencimiento";
import { VISTAS_CON_CONTENIDO_PROPIO } from "./compartido";
import { STATUS_ORDER, STATUS_META } from "./estado-doc";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ChipsEntendi from "../ChipsEntendi";
import { TerminosIA } from "../PorQueAparecio";
import type { ModeloArchivo } from "./use-archivo";
export default function AvisosDeLista({ arch }: { arch: ModeloArchivo }) {
  const { filterMode, vencidosDocs, expiringDocs, soloVencimiento, setSoloVencimiento, statusFilter,
    statusCounts, setStatusFilter, indexableDocs, soloSinDescribir, setSoloSinDescribir, describirFaltantes,
    progresoDesc, avisoIA, searchDebounced, folders, setSearch, semantic, semanticTerms } = arch;
  return (
    <>
          {/* «Vencimientos»: lo ya vencido y lo que vence en 30 días, por separado. */}
          {filterMode === "expiring" && (vencidosDocs.length > 0 || expiringDocs.length > 0) && (
            <ChipsVencimiento
              valor={soloVencimiento}
              onCambiar={setSoloVencimiento}
              cuentas={{ todos: vencidosDocs.length + expiringDocs.length, vencidos: vencidosDocs.length, porVencer: expiringDocs.length }}
            />
          )}

          {/* Filtro por estado (workflow) */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && (statusFilter !== null || STATUS_ORDER.some((k) => statusCounts[k] > 0)) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-tertiary)]">Estado</span>
              <button
                onClick={() => setStatusFilter(null)}
                aria-pressed={statusFilter === null}
                className={cn("min-h-10 rounded-xl px-3 text-sm font-bold transition-colors", statusFilter === null ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-primary")}
              >
                Todos
              </button>
              {STATUS_ORDER.map((k) => {
                const m = STATUS_META[k];
                const n = statusCounts[k] ?? 0;
                const active = statusFilter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(active ? null : k)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-colors",
                      active ? cn(m.bg, m.text, "ring-2 ring-primary") : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-primary"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", m.dot)} /> {m.label}{n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Lo que todavía no se puede buscar por lo que dice. Es la deuda
              real del drive: un archivo sin descripción sólo aparece si te
              acuerdas de su nombre. */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && (indexableDocs.length > 0 || soloSinDescribir) && (
            <div className="flex flex-wrap items-center gap-x-2 rounded-xl border border-dashed border-[var(--accent)]/35 bg-[var(--accent)]/5 pl-3">
              <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
              <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-secondary)]">
                {indexableDocs.length > 0 ? (
                  <>
                    <span className="tabular-nums font-bold text-[var(--text-primary)]">{indexableDocs.length}</span>{" "}
                    sin descripción
                    <InfoTip
                      className="ml-1.5 align-middle"
                      title="Sin descripción"
                      what={<span>No aparecen cuando buscas por lo que dicen adentro.</span>}
                      affects={<span>Se leen solos cada noche; con el botón se apura la fila.</span>}
                    />
                  </>
                ) : (
                  "Ya está todo descrito."
                )}
              </p>
              <button
                onClick={() => setSoloSinDescribir((v) => !v)}
                aria-pressed={soloSinDescribir}
                className={cn(
                  "h-12 shrink-0 px-3 text-sm font-bold transition-colors",
                  soloSinDescribir
                    ? "bg-[var(--accent)]/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--accent)]/10",
                )}
              >
                {soloSinDescribir ? "Ver todos" : "Ver cuáles"}
              </button>
              {indexableDocs.length > 0 && (
                <button
                  onClick={describirFaltantes}
                  disabled={!!progresoDesc}
                  title="La IA lee cada uno y escribe de qué se trata (tarda unos segundos por documento)"
                  className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-r-xl px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60 dark:text-[var(--accent)]"
                >
                  {progresoDesc ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span className="tabular-nums">{progresoDesc.hechos}/{progresoDesc.total}</span>
                    </>
                  ) : (
                    <><Wand2 className="h-4 w-4" aria-hidden /> Describirlos con IA</>
                  )}
                </button>
              )}
              {/* Cuando la IA no puede (sin cupo por hoy, sin credencial, o
                  sin modelo que MIRE las fotos) se dice acá, con lo que hay que
                  hacer, en vez de dejar el contador clavado sin explicación. */}
              {avisoIA && (
                <p className="w-full pb-2 text-sm font-semibold text-[var(--data-warning-ink)]">
                  {avisoIA}
                </p>
              )}
            </div>
          )}

          {/* «Buscar como hablas»: cómo se leyó la búsqueda, cada parte con su ✕. */}
          {searchDebounced.trim() && !VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "expiring" && (
            <ChipsEntendi busqueda={searchDebounced} carpetas={folders} onCambiar={setSearch} />
          )}

          {/* En modo IA: con qué sinónimos se amplió la búsqueda. */}
          {semantic && semanticTerms.length > 0 && !VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && (
            <TerminosIA terminos={semanticTerms} />
          )}
    </>
  );
}