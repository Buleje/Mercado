"use client";

import ChipsVencimiento from "../ChipsVencimiento";
import { VISTAS_CON_CONTENIDO_PROPIO } from "./compartido";
import { STATUS_ORDER, STATUS_META } from "./estado-doc";
import { cn } from "@/lib/utils";
import ChipsEntendi from "../ChipsEntendi";
import { TerminosIA } from "../PorQueAparecio";
import type { ModeloArchivo } from "./use-archivo";
export default function AvisosDeLista({ arch }: { arch: ModeloArchivo }) {
  const { filterMode, vencidosDocs, expiringDocs, soloVencimiento, setSoloVencimiento, statusFilter,
    statusCounts, setStatusFilter, avisoIA, searchDebounced, folders, setSearch, semantic, semanticTerms } = arch;
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

          {/* «N sin descripción · Ver cuáles · Describirlos con IA» subió a los
              avisos de la cabecera de Documentos (31-10, `use-avisos-archivo`).
              Acá queda sólo lo que la IA no pudo hacer (sin cupo por hoy, sin
              credencial, sin modelo que MIRE las fotos), con lo que hay que
              hacer: no se esconde en un menú. */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && avisoIA && (
            <p className="text-sm font-semibold text-[var(--data-warning-ink)]" role="status">{avisoIA}</p>
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