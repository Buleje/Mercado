"use client";

import { useOrdenDeVista, useSoltarSeleccionOculta } from "@/components/admin/marketplace/orden-de-vista";
import { DataTable } from "@buleje/design-system";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import type { MarketplaceOrder, OrderTargetStatus } from "@/components/admin/marketplace/hooks/use-marketplace-orders";
import type { OrdenesVista } from "@/components/admin/marketplace/hooks/use-ordenes-vista";
import { ORDER_STATUS_CONFIG } from "@/components/admin/marketplace/shared";
import { OrdenesAccionesFila } from "@/components/admin/marketplace/ordenes/OrdenesAccionesFila";
import { idCorto } from "@/components/admin/marketplace/ordenes/ordenes-util";
import { diaConNombre } from "@/components/admin/inventario/movimientos/tipos";
import { formatCurrency, formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { Casilla } from "@/components/ui-system/Casilla";

const TH = "px-3 py-3 text-sm font-semibold text-[var(--text-secondary)]";
const NO_ABRE = "button, input, a, [data-no-row-click]";

/* Filtros de columna: Total y Fecha. Cliente, #, dirección y estado ya los cubren el buscador y los chips de arriba. */
const COLUMNAS: readonly ColumnaFiltro<MarketplaceOrder>[] = [
  { id: "total", label: "Total", tipo: "rango", numero: (o) => o.total, unidad: "S/", paso: 0.01 },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (o) => limaDateKey(o.createdAt) || null },
];

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
  const f = useFiltrosTabla(v.filtradas, COLUMNAS);
  const filas = f.filtradas;
  const todas = filas.length > 0 && v.seleccion.size === filas.length;
  const orden = useOrdenDeVista(v.sortKey, v.sortDir, v.ordenarPor);
  const { seleccion, setSeleccion } = v;
  useSoltarSeleccionOculta(f.activos > 0, filas, seleccion, setSeleccion);
  return (
    <>
    <BarraFiltrosTabla vistas="marketplace-ordenes" f={f} />
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="max-h-[calc(100vh-20rem)] overflow-x-auto">
        <DataTable className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-12" data-label="Elegir">
                <Casilla
                  checked={todas}
                  indeterminada={v.seleccion.size > 0 && !todas}
                  onChange={() => v.setSeleccion(todas ? new Set() : new Set(filas.map((o) => o.id)))}
                  aria-label="Elegir todas las órdenes de la lista"
                />
              </th>
              <th className={cn(TH, "text-left")}>Orden</th>
              <th className={cn(TH, "text-left")}>Cliente</th>
              <th className={cn(TH, "hidden text-left 2xl:table-cell")}>Dirección</th>
              <ThColumna label="Total" ids={["total"]} f={f} derecha orden={orden} ordenId="total" />
              <ThColumna label="Estado" orden={orden} ordenId="status" />
              <ThColumna label="Fecha" ids={["fecha"]} f={f} derecha orden={orden} ordenId="createdAt" />
              <th className={cn(TH, "text-right")}>Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.length === 0 && <SinCoincidenciasFila colSpan={8} />}
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
                    <Casilla
                      checked={elegida}
                      onChange={() => v.alternar(o.id)}
                      aria-label={`Elegir el pedido #${idCorto(o.id)}`} />
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
    </>
  );
}
