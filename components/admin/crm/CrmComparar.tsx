"use client";

import { DataTable } from "@buleje/design-system";
import { BarChart3 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/components/admin/crm/crm-compartido";
import type { Crm } from "@/components/admin/crm/use-crm";

/** Barra y ventana para comparar clientes lado a lado. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmComparar({ crm }: { crm: Crm }) {
  const {
    compareMode, comparePhones, setComparePhones, showCompareModal, setShowCompareModal,
    compareCustomers, getSegmentLabel,
  } = crm;
  return (
    <>
      {/* Mejora 13: Compare sticky bar */}
      {compareMode && comparePhones.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {comparePhones.size} cliente{comparePhones.size !== 1 ? "s" : ""} seleccionado{comparePhones.size !== 1 ? "s" : ""} (max 3)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setComparePhones(new Set()); }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors"
              >
                Limpiar
              </button>
              <button
                onClick={() => setShowCompareModal(true)}
                disabled={comparePhones.size < 2}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--accent)] disabled:opacity-50 transition-colors"
              >
                Ver comparativa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mejora 13: Compare modal */}
      <AdminModal
        open={showCompareModal && compareCustomers.length >= 2}
        onClose={() => setShowCompareModal(false)}
        title="Comparativa de Clientes"
        icon={BarChart3}
        variant="wide"
      >
        <div className={MODAL_BODY}>
                <DataTable>
                    <thead>
                      <tr>
                        <th>Metrica</th>
                        {compareCustomers.map(c => (
                          <th key={c.phone} className="text-center text-[var(--text-primary)] dark:text-[var(--text-primary)]">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Total gastado */}
                      {(() => {
                        const values = compareCustomers.map(c => c.totalSpent ?? 0);
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="text-xs text-[var(--text-secondary)] font-semibold">Total gastado</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                                S/{(values[i]).toFixed(0)}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Frecuencia (pedidos) */}
                      {(() => {
                        const values = compareCustomers.map(c => c._orderCount ?? 0);
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="text-xs text-[var(--text-secondary)] font-semibold">Pedidos</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                                {values[i]}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Ticket promedio */}
                      {(() => {
                        const values = compareCustomers.map(c => {
                          const orders = c._orderCount ?? 0;
                          return orders > 0 ? (c.totalSpent ?? 0) / orders : 0;
                        });
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="text-xs text-[var(--text-secondary)] font-semibold">Ticket promedio</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                                S/{values[i].toFixed(0)}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Última compra */}
                      {(() => {
                        const values = compareCustomers.map(c => c._lastOrder ? new Date(c._lastOrder).getTime() : 0);
                        const best = Math.max(...values);
                        return (
                          <tr>
                            <td className="text-xs text-[var(--text-secondary)] font-semibold">Última compra</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("text-center text-sm font-bold", values[i] === best && best > 0 ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                                {c._lastOrder ? fmtRelative(c._lastOrder) : "--"}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Fiado pendiente */}
                      {(() => {
                        const values = compareCustomers.map(c => c.creditBalance ?? 0);
                        const best = Math.min(...values);
                        return (
                          <tr>
                            <td className="text-xs text-[var(--text-secondary)] font-semibold">Fiado pendiente</td>
                            {compareCustomers.map((c, i) => (
                              <td key={c.phone} className={cn("text-center text-sm font-bold", values[i] === best ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>
                                S/{values[i].toFixed(0)}
                              </td>
                            ))}
                          </tr>
                        );
                      })()}
                      {/* Segmento */}
                      <tr>
                        <td className="text-xs text-[var(--text-secondary)] font-semibold">Segmento</td>
                        {compareCustomers.map(c => (
                          <td key={c.phone} className="text-center">
                            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{getSegmentLabel(c)}</span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                </DataTable>
        </div>
      </AdminModal>
    </>
  );
}
