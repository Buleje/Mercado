"use client";

import { m } from "@/components/admin/providers";
import { formatCurrency, formatDate } from "@/lib/format";
import { Copy, Send } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type NCStatus, STATUS_META } from "@/components/admin/notas-credito/nc-compartido";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Vista kanban de Notas de crédito. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcKanban({ nc }: { nc: NotasCreditoVista }) {
  const {
    loading, error, setSelected, viewMode, filteredNotas, handleDuplicate, handleEmitSunat,
  } = nc;
  return (
    <>
      {/* ── Kanban View ────────────────────────────────────────────────── */}
      {!loading && !error && viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["BORRADOR", "EMITIDA", "ANULADA"] as NCStatus[]).map(status => {
            const col = filteredNotas.filter(nc => nc.status === status);
            const meta = STATUS_META[status];
            return (
              <div key={status} className="bg-[var(--surface-alt)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
                <div className={cn("px-4 py-3 flex items-center gap-2 border-b border-[var(--rule-base)]", meta.bg)}>
                  <span className={cn("w-2 h-2 rounded-full shrink-0", meta.dot)} />
                  <span className={cn("text-xs font-bold", meta.color)}>{meta.label}</span>
                  <span className={cn("ml-auto px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-white/60", meta.color)}>{col.length}</span>
                </div>
                <div className="p-2 space-y-2 max-h-130 overflow-y-auto">
                  {col.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-tertiary)]">
                      <p className="text-2xl mb-1">{"\u{1F4C4}"}</p>
                      <p className="text-[length:var(--ts-2xs)]">Sin NCs en {meta.label}</p>
                    </div>
                  ) : col.map(nc => (
                    <m.div key={nc.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelected(nc)}
                      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg p-3 cursor-pointer hover:shadow-[var(--shadow-sm)] hover:border-primary/40 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{nc.numero}</span>
                        <span className="text-sm font-extrabold text-[var(--text-primary)]">{formatCurrency(nc.total)}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate mb-1">[{nc.motivoCodigo}] {nc.motivoDesc}</p>
                      {nc.clienteNombre && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{nc.clienteNombre}</p>}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--rule-soft)]">
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{formatDate(nc.createdAt)}</span>
                        <div className="flex gap-1">
                          {nc.status === "BORRADOR" && (
                            <button onClick={(e) => { e.stopPropagation(); handleEmitSunat(nc); }}
                              className="p-1 rounded hover:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" title="Emitir">
                              <Send className="h-3 w-3" />
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleDuplicate(nc); }}
                            className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" title="Duplicar">
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </m.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
