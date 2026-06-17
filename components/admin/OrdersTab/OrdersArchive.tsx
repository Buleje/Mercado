"use client";

import { useState } from "react";
import { Search, MapPin, Trash2 } from "@buleje/design-system/icons";
import { activateProps } from "@/components/admin/shared/a11y";
import AdminModal from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
import { formatDate } from "@/lib/admin-helpers";
import { googleMapsUrl } from "@/lib/order-utils";
import { STATUS_COLORS, STATUS_LABELS } from "./types";

interface OrdersArchiveProps {
  archivedOrders: DbOrder[];
  onSelectOrder: (order: DbOrder) => void;
  onDeleteOrder: (id: string) => void;
  onClose: () => void;
}

export function OrdersArchive({
  archivedOrders,
  onSelectOrder,
  onDeleteOrder,
  onClose,
}: OrdersArchiveProps) {
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");

  const filteredArchive = archivedOrders.filter(o => {
    const q = archiveSearch.toLowerCase();
    const matchSearch = !q || o.customer.name.toLowerCase().includes(q) || (o.customer.phone ?? "").includes(q);
    const date = o.createdAt.slice(0, 10);
    const matchFrom = !archiveDateFrom || date >= archiveDateFrom;
    const matchTo = !archiveDateTo || date <= archiveDateTo;
    return matchSearch && matchFrom && matchTo;
  });

  return (
    <AdminModal open={true} onClose={onClose} title="Cancelados y Entregados" variant="wide">
        {/* Filters */}
        <div className="px-5 py-3 border-b border-[var(--rule-soft)] dark:border-card-border flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar cliente o teléfono…"
              value={archiveSearch}
              onChange={e => setArchiveSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary"
            />
          </div>
          <input
            type="date"
            value={archiveDateFrom}
            onChange={e => setArchiveDateFrom(e.target.value)}
            title="Desde"
            className="text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border px-3 py-2 outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted"
          />
          <input
            type="date"
            value={archiveDateTo}
            onChange={e => setArchiveDateTo(e.target.value)}
            title="Hasta"
            className="text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border px-3 py-2 outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted"
          />
        </div>

        <div className="p-5">
          {filteredArchive.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted text-sm">
              No se encontraron pedidos
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted">Cliente</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted">Total</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredArchive.map(o => (
                      <tr
                        key={o.id}
                        className="hover:bg-gray-50 dark:hover:bg-surface cursor-pointer"
                        onClick={() => { onSelectOrder(o); onClose(); }}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[var(--text-primary)] dark:text-foreground">{o.customer.name}</p>
                          {o.customer.phone && (
                            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{o.customer.phone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                            {STATUS_LABELS[o.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-primary">S/{Number(o.total).toFixed(2)}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted">{formatDate(o.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <a
                              href={googleMapsUrl(o.customer.location)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] transition-colors"
                              title="Ver en Maps"
                            >
                              <MapPin className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => onDeleteOrder(o.id)}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {filteredArchive.map(o => (
                  <div
                    key={o.id}
                    className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4  cursor-pointer hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                    {...activateProps(() => { onSelectOrder(o); onClose(); })}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{o.customer.name}</p>
                        {o.customer.phone && (
                          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{o.customer.phone}</p>
                        )}
                        <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5 truncate">{o.customer.location}</p>
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">{formatDate(o.createdAt)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                          {STATUS_LABELS[o.status]}
                        </span>
                        <p className="text-sm font-bold text-primary mt-1">S/{Number(o.total).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--rule-soft)] dark:border-card-border" onClick={e => e.stopPropagation()}>
                      <a
                        href={googleMapsUrl(o.customer.location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-[var(--data-success-500)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors"
                      >
                        <MapPin className="h-4 w-4" /> Maps
                      </a>
                      <button
                        onClick={() => onDeleteOrder(o.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-[var(--data-error-500)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] transition-colors"
                      >
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
    </AdminModal>
  );
}
