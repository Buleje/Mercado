"use client";

/**
 * Pedidos y reparto › Archivados (`?vista=archivados`): los entregados y los
 * cancelados. Antes era un modal que se abría desde el menú «Más»; ahora es
 * una vista con link propio (plan «panel unificado», 2026-10-09).
 *
 * Sus filtros (cliente y fechas) van pegados a la tabla, con el MISMO
 * desplegable de fecha que la barra del tablero (un solo filtro de fecha en
 * el panel, contrato de diseño); qué pedidos pasan lo decide
 * `archivadosQuePasan` (día de Lima, con prueba). En el celular la tabla se
 * vuelve tarjetas sola (`useMobileTableCards`), sin tarjetas a mano.
 */
import { useState } from "react";
import { Search, MapPin, Trash2, Archive } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { EmptyState } from "@/components/admin/EmptyState";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import type { Rango } from "@/lib/admin/filtros-columna";
import { cn } from "@/lib/utils";
import type { DbOrder } from "@/lib/jsondb";
import { formatDate } from "@/lib/admin-helpers";
import { googleMapsUrl } from "@/lib/order-utils";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import { formatCurrency } from "@/lib/format";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { DESPLEGABLES_A_LA_ALTURA } from "./BarraPedidos";
import { archivadosQuePasan } from "./filtrar-pedidos";

interface OrdersArchiveProps {
  archivedOrders: DbOrder[];
  onSelectOrder: (order: DbOrder) => void;
  onDeleteOrder: (id: string) => void;
}

const CAMPO =
  "h-12 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:border-primary";
const TH = "text-left px-4 py-2.5 font-semibold text-[var(--text-secondary)] dark:text-muted";

export function OrdersArchive({ archivedOrders, onSelectOrder, onDeleteOrder }: OrdersArchiveProps) {
  const [archiveSearch, setArchiveSearch] = useState("");
  const [rango, setRango] = useState<Rango<string>>({ min: null, max: null });

  const filteredArchive = archivadosQuePasan(archivedOrders, { texto: archiveSearch, desde: rango.min, hasta: rango.max });

  return (
    <div className="space-y-3">
      <div role="search" aria-label="Filtrar archivados" className={cn("flex flex-wrap items-center gap-2", DESPLEGABLES_A_LA_ALTURA)}>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            placeholder="Buscar cliente o teléfono…"
            aria-label="Buscar archivados por cliente o teléfono"
            value={archiveSearch}
            onChange={e => setArchiveSearch(e.target.value)}
            className={cn(CAMPO, "w-full pl-9 pr-3")}
          />
        </div>
        <FiltroColumnaRango
          label="Fecha"
          esFecha
          placeholder="Fecha"
          valor={rango}
          onChange={(r) => setRango({ min: (r.min as string | null) ?? null, max: (r.max as string | null) ?? null })}
        />
        <p className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
          {filteredArchive.length === archivedOrders.length
            ? `${archivedOrders.length} ${archivedOrders.length === 1 ? "pedido" : "pedidos"}`
            : `${filteredArchive.length} de ${archivedOrders.length}`}
        </p>
      </div>

      {filteredArchive.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-10 w-10 text-[var(--text-tertiary)]" />}
          title={archivedOrders.length === 0 ? "Todavía no hay pedidos entregados ni cancelados" : "No encontramos pedidos con esa búsqueda"}
          actions={[]}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] dark:border-card-border">
          <DataTable className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)] dark:border-card-border">
              <tr>
                <th className={TH}>Cliente</th>
                <th className={TH}>Estado</th>
                <th className={cn(TH, "text-right")}>Total</th>
                <th className={TH}>Fecha</th>
                <th className="px-4 py-2.5" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filteredArchive.map(o => (
                <tr
                  key={o.id}
                  className="hover:bg-[var(--surface-sunken)] cursor-pointer"
                  onClick={() => onSelectOrder(o)}
                  tabIndex={0}
                  onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectOrder(o); } }}
                  aria-label={`Ver pedido de ${o.customer.name}`}
                >
                  <td className="px-4 py-3">
                    {/* Un solo hijo: en el celular la celda es flex y los <span> se montaban uno sobre otro. */}
                    <div className="min-w-0">
                    <span className="block font-semibold text-[var(--text-primary)]"><EnlacePanel cosa="cliente" id={o.customer.phone}>{o.customer.name}</EnlacePanel></span>
                    {o.customer.phone && (
                      <span className="block text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{o.customer.phone}</span>
                    )}
                    {/* La dirección: antes sólo salía en la tarjeta del celular del modal. */}
                    {o.customer.location && (
                      <span className="block max-w-xs truncate text-xs text-[var(--text-secondary)]" title={o.customer.location}>
                        {o.customer.location}
                      </span>
                    )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLORS[o.status])}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrency(Number(o.total))}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--text-secondary)] dark:text-muted">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <a
                        href={googleMapsUrl(o.customer.location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid h-9 w-9 place-items-center rounded-xl text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--accent-ink)] hover:bg-primary/10 transition-colors"
                        title="Ver en Maps"
                        aria-label={`Ver en Maps la dirección de ${o.customer.name}`}
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                      <IconAction icon={Trash2} label={`Eliminar el pedido de ${o.customer.name}`} tone="danger" onClick={() => onDeleteOrder(o.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
