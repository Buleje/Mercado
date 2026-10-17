"use client";

/**
 * Pedidos y reparto › Lista: los mismos pedidos en marcha que el tablero, para
 * BUSCAR, ORDENAR, ELEGIR VARIOS e IMPRIMIRLOS (`?vista=lista`). Moverlos de a
 * uno es tarea del Tablero (10-10, Brandon: «cada pestaña cumple su tarea»).
 *
 * Cada cabeza ordena (la de «Sin avanzar» pone primero al que más espera); la
 * casilla de la cabeza elige todos los que se ven y las acciones en bloque van
 * en la fila de la barra. «Sin avanzar» es nuevo: cuánto lleva cada pedido en
 * su paso, en rojo desde las 2 h. Repartidor sólo sale si alguno tiene.
 * 17-10 (P03/M49): «Plata» dice qué falta cobrar o verificar con su monto
 * (`siguiente-paso.ts`, la misma regla que la tarjeta) y el repartidor sale
 * de `riderName` (antes `deliveryDriver`, que nunca se guardó).
 *
 * En el celular la tabla se vuelve tarjetas sola (`useMobileTableCards`).
 */
import { useEffect, useState, type ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import type { DbOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import {
  ORDEN_INICIAL,
  ordenarPedidos,
  siguienteOrden,
  type ColumnaOrden,
  type Orden,
} from "./orden-pedidos";
import { msEnEstado, nivelDeEspera, textoDeEspera } from "./tiempo-en-estado";
import { TINTA_COBRO, cobroDe, responsableDe } from "./siguiente-paso";
import { STATUS_COLORS, STATUS_LABELS } from "./types";

const TH = "px-3 text-left text-sm font-semibold text-[var(--text-secondary)]";
const TD = "px-3 py-2.5";

interface ListaPedidosProps {
  pedidos: readonly DbOrder[];
  loading: boolean;
  /** Lo que se ve sin pedidos (`VacioPedidos`: dice si es por los filtros y qué hacer). */
  vacio: ReactNode;
  elegidos: ReadonlySet<string>;
  onElegir: (id: string) => void;
  onElegirTodos: (ids: string[]) => void;
  onSelectOrder: (order: DbOrder) => void;
}

function CabezaOrden({
  columna,
  orden,
  onOrdenar,
  children,
  derecha = false,
}: {
  columna: ColumnaOrden;
  orden: Orden;
  onOrdenar: (c: ColumnaOrden) => void;
  children: string;
  derecha?: boolean;
}) {
  const activa = orden.columna === columna;
  const Flecha = !activa ? ArrowUpDown : orden.sentido === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      /* `py-0!`: el botón ya mide 48 px; con el py-2.5 del DataTable la cabeza medía 68. */
      className={cn(TH, "py-0!", derecha && "text-right")}
      aria-sort={activa ? (orden.sentido === "asc" ? "ascending" : "descending") : "none"}
      data-label={children}
    >
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={cn(
          /* Mismo aspecto que las cabezas del DataTable (mayúsculas): el botón no hereda text-transform. */
          "inline-flex h-12 items-center gap-1 rounded-lg hover:text-[var(--text-primary)]",
          derecha && "flex-row-reverse",
          activa && "text-[var(--text-primary)]",
        )}
      >
        {children}
        <Flecha className={cn("h-3.5 w-3.5 shrink-0", !activa && "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

const ESPERA = {
  "al-dia": "text-[var(--text-secondary)]",
  aviso: "text-[var(--data-warning-ink)]",
  tarde: "text-[var(--data-error-ink)]",
} as const;

export function ListaPedidos({
  pedidos,
  loading,
  vacio,
  elegidos,
  onElegir,
  onElegirTodos,
  onSelectOrder,
}: ListaPedidosProps) {
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  /* El reloj de «Sin avanzar»: un minuto, como las tarjetas del tablero. */
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <TableSkeleton rows={6} cols={7} />;
  if (pedidos.length === 0) return vacio;

  const filas = ordenarPedidos(pedidos, orden);
  const conRepartidor = pedidos.some((o) => responsableDe(o));
  const todos = pedidos.every((o) => elegidos.has(o.id));
  const algunos = !todos && pedidos.some((o) => elegidos.has(o.id));
  const ordenar = (c: ColumnaOrden) => setOrden((o) => siguienteOrden(o, c));

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] dark:border-card-border">
      <DataTable className="w-full">
        <thead className="dark:border-card-border">
          <tr>
            <th className="w-12 py-0!" data-label="Elegir">
              <label className="flex h-12 w-12 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  checked={todos}
                  ref={(el) => {
                    if (el) el.indeterminate = algunos;
                  }}
                  onChange={() => onElegirTodos(todos ? [] : pedidos.map((o) => o.id))}
                  aria-label={
                    todos
                      ? "Quitar la selección"
                      : `Elegir los ${pedidos.length} pedidos que se ven`
                  }
                  className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--accent)]"
                />
              </label>
            </th>
            <CabezaOrden columna="cliente" orden={orden} onOrdenar={ordenar}>
              Cliente
            </CabezaOrden>
            <CabezaOrden columna="estado" orden={orden} onOrdenar={ordenar}>
              Estado
            </CabezaOrden>
            <CabezaOrden columna="espera" orden={orden} onOrdenar={ordenar}>
              Sin avanzar
            </CabezaOrden>
            <th className={TH}>Plata</th>
            {conRepartidor && <th className={TH}>Repartidor</th>}
            <CabezaOrden columna="fecha" orden={orden} onOrdenar={ordenar}>
              Pedido el
            </CabezaOrden>
            <CabezaOrden columna="total" orden={orden} onOrdenar={ordenar} derecha>
              Total
            </CabezaOrden>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {filas.map((o) => {
            const repartidor = responsableDe(o);
            const cobro = cobroDe(o);
            const ms = msEnEstado(o, ahora);
            const nivel = nivelDeEspera(ms);
            const elegido = elegidos.has(o.id);
            return (
              <tr
                key={o.id}
                className={cn("cursor-pointer", elegido && "bg-[var(--accent-soft)]")}
                onClick={() => onSelectOrder(o)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectOrder(o);
                  }
                }}
                aria-label={`Ver pedido de ${o.customer.name}`}
              >
                <td className="w-12 py-0!" onClick={(e) => e.stopPropagation()}>
                  <label className="flex h-12 w-12 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={elegido}
                      onChange={() => onElegir(o.id)}
                      aria-label={`Elegir el pedido de ${o.customer.name}`}
                      className="h-4 w-4 rounded border-[var(--rule-base)] text-[var(--accent)]"
                    />
                  </label>
                </td>
                <td className={TD}>
                  <div className="min-w-0">
                    <span className="block font-semibold text-[var(--text-primary)]">
                      <EnlacePanel cosa="cliente" id={o.customer.phone}>
                        {o.customer.name}
                      </EnlacePanel>
                    </span>
                    <span className="block text-sm text-[var(--text-secondary)]">
                      <span className="font-mono">#{o.id.slice(-6)}</span>
                      {o.customer.phone && <span className="font-mono"> · {o.customer.phone}</span>}
                    </span>
                  </div>
                </td>
                <td className={TD}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-sm font-bold",
                        STATUS_COLORS[o.status],
                      )}
                    >
                      {STATUS_LABELS[o.status]}
                    </span>
                    {/* En el celular la plata va acá: su columna se esconde para que la tarjeta no pase de 5 renglones. */}
                    <span
                      className={cn("text-sm font-semibold sm:hidden", TINTA_COBRO[cobro.tono])}
                    >
                      {cobro.texto}
                    </span>
                  </div>
                </td>
                <td
                  className={cn(TD, "whitespace-nowrap tabular-nums font-semibold", ESPERA[nivel])}
                >
                  <span className="inline-flex items-center gap-1">
                    {nivel !== "al-dia" && (
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {textoDeEspera(ms)}
                  </span>
                </td>
                <td className={cn(TD, "font-semibold max-sm:hidden!", TINTA_COBRO[cobro.tono])}>
                  {cobro.texto}
                </td>
                {conRepartidor && (
                  <td className={cn(TD, "text-[var(--text-secondary)]")}>{repartidor || "—"}</td>
                )}
                <td
                  className={cn(
                    TD,
                    "whitespace-nowrap text-[var(--text-secondary)] max-sm:hidden!",
                  )}
                >
                  {formatDateTimeShort(o.createdAt)}
                </td>
                <td
                  className={cn(
                    TD,
                    "whitespace-nowrap text-right font-semibold tabular-nums text-[var(--text-primary)]",
                  )}
                >
                  {formatCurrency(Number(o.total))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
