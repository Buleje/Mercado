"use client";

import { DataTable } from "@buleje/design-system";
import type { MarketplaceOrder, OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import type { ClaveOrden, OrdenesVista } from "@/components/admin/marketplace/hooks/use-ordenes-vista";
import { ORDER_STATUS_CONFIG, SortIcon } from "@/components/admin/marketplace/shared";
import { OrdenesAccionesFila } from "@/components/admin/marketplace/ordenes/OrdenesAccionesFila";
import { idCorto } from "@/components/admin/marketplace/ordenes/ordenes-util";
import { diaConNombre } from "@/components/admin/inventario/movimientos/tipos";
import { formatCurrency, formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";

const TH = "px-3 py-3 text-sm font-semibold text-[var(--text-secondary)]";
const NO_ABRE = "button, input, a, [data-no-row-click]";

function Encabezado({ clave, rotulo, v, alinear = "left" }: { clave: ClaveOrden; rotulo: string; v: OrdenesVista; alinear?: "left" | "right" | "center" }) {
  return (
    <th className={cn(TH, alinear === "right" ? "text-right" : alinear === "center" ? "text-center" : "text-left")} data-label={rotulo}>
      <button
        type="button"
        onClick={() => v.ordenarPor(clave)}
        className={cn("inline-flex min-h-12 items-center gap-1 transition-colors hover:text-[var(--text-primary)]", alinear === "right" && "ml-auto", alinear === "center" && "mx-auto")}
      >
        {rotulo} <SortIcon k={clave} currentKey={v.sortKey} currentDir={v.sortDir} />
      </button>
    </th>
  );
}

/**
 * Una orden = una fila: #, cliente, dirección (pantallas anchas), total, estado,
 * fecha y las acciones (el paso siguiente + «⋯»). Clic en la fila abre el
 * detalle. En el celular la tabla pasa a tarjetas (`useMobileTableCards`).
 */
export function OrdenesTabla({
  v,
  actualizandoId,
  onEstado,
  onDetalle,
  onWhatsApp,
}: {
  v: OrdenesVista;
  actualizandoId: string | null;
  onEstado: (id: string, estado: OrderTargetStatus) => void;
  onDetalle: (id: string) => void;
  onWhatsApp: (o: MarketplaceOrder) => void;
}) {
  const filas = v.filtradas;
  const todas = filas.length > 0 && v.seleccion.size === filas.length;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="max-h-[calc(100vh-20rem)] overflow-x-auto">
        <DataTable className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12" data-label="Elegir">
                <input
                  type="checkbox"
                  checked={todas}
                  ref={(el) => {
                    if (el) el.indeterminate = v.seleccion.size > 0 && !todas;
                  }}
                  onChange={v.alternarTodas}
                  aria-label="Elegir todas las órdenes de la lista"
                  className="h-5 w-5 cursor-pointer rounded border border-[var(--rule-base)] accent-[var(--accent)]"
                />
              </th>
              <th className={cn(TH, "text-left")}>Orden</th>
              <th className={cn(TH, "text-left")}>Cliente</th>
              <th className={cn(TH, "hidden text-left 2xl:table-cell")}>Dirección</th>
              <Encabezado clave="total" rotulo="Total" v={v} alinear="right" />
              <Encabezado clave="status" rotulo="Estado" v={v} alinear="center" />
              <Encabezado clave="createdAt" rotulo="Fecha" v={v} alinear="right" />
              <th className={cn(TH, "text-right")}>Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.map((o) => {
              const estado = ORDER_STATUS_CONFIG[o.status] ?? { label: o.status, className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" };
              const creada = new Date(o.createdAt);
              const elegida = v.seleccion.has(o.id);
              return (
                <tr
                  key={o.id}
                  tabIndex={0}
                  aria-label={`Ver el pedido #${idCorto(o.id)} de ${o.customerName}`}
                  className={cn(
                    "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]",
                    elegida ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]/50",
                  )}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest(NO_ABRE)) return;
                    onDetalle(o.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || (e.target as HTMLElement).closest(NO_ABRE)) return;
                    e.preventDefault();
                    onDetalle(o.id);
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={elegida}
                      onChange={() => v.alternar(o.id)}
                      aria-label={`Elegir el pedido #${idCorto(o.id)}`}
                      className="h-5 w-5 cursor-pointer rounded border border-[var(--rule-base)] accent-[var(--accent)]"
                    />
                  </td>
                  <td>
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-[var(--text-primary)]">#{idCorto(o.id)}</p>
                      <p className="whitespace-nowrap text-sm text-[var(--text-tertiary)]">
                        {o.itemsCount} producto{o.itemsCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </td>
                  <td>
                    <div className="min-w-0">
                      <p className="max-w-[12rem] truncate font-semibold text-[var(--text-primary)]" title={o.customerName}>{o.customerName}</p>
                      {o.customerPhone && <p className="font-mono text-sm text-[var(--text-tertiary)]">{o.customerPhone}</p>}
                    </div>
                  </td>
                  <td className="hidden 2xl:table-cell">
                    <p className="max-w-[15rem] truncate text-sm text-[var(--text-secondary)]" title={o.customerLocation ?? undefined}>
                      {o.customerLocation || <span className="italic text-[var(--text-tertiary)]">Sin dirección</span>}
                    </p>
                  </td>
                  <td className="whitespace-nowrap text-right font-bold tabular-nums">{formatCurrency(o.total)}</td>
                  <td className="text-center">
                    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-sm font-semibold", estado.className)}>{estado.label}</span>
                  </td>
                  <td className="text-right">
                    <div className="min-w-0">
                      <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--text-primary)]">{diaConNombre(limaDateKey(creada))}</p>
                      <p className="text-sm tabular-nums text-[var(--text-tertiary)]">{formatTime(creada)}</p>
                    </div>
                  </td>
                  <td>
                    <OrdenesAccionesFila
                      orden={o}
                      actualizando={actualizandoId === o.id}
                      onEstado={(s) => onEstado(o.id, s)}
                      onDetalle={() => onDetalle(o.id)}
                      onWhatsApp={() => onWhatsApp(o)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
