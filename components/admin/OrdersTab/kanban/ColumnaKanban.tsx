"use client";

/**
 * Una columna del tablero: su cabecera (estado · cuántos · cuánto suman) y sus
 * tarjetas, el que más espera primero. Recibe los pedidos ya ordenados.
 *
 * Ley de Brandon (2026-10-01): se ven las primeras tarjetas y el resto a un
 * toque — nada se esconde, la cabecera sigue diciendo cuántos hay.
 * En el celular la cabecera no se repite: la barra de secciones de arriba ya
 * nombra la columna (`conCabecera={false}`); queda la línea de qué pasa ahí.
 */
import { memo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { PEDIDOS_POR_COLUMNA, type Columna } from "./columnas";
import { TarjetaArrastrable } from "./TarjetaArrastrable";

export interface ColumnaKanbanProps {
  columna: Columna;
  orders: DbOrder[];
  conCabecera: boolean;
  storeLat: number | null;
  storeLon: number | null;
  nowMs: number;
  driverColor: (name: string) => string;
  rejectedId?: string | null;
  /** Se está arrastrando una tarjeta de OTRA columna: esta se marca como destino. */
  isActiveTarget?: boolean;
  onSelectOrder: (o: DbOrder) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
  onManualDelivery?: (id: string, reason: string) => void;
}

export const ColumnaKanban = memo(function ColumnaKanban({
  columna,
  orders,
  conCabecera,
  storeLat,
  storeLon,
  nowMs,
  driverColor,
  rejectedId,
  isActiveTarget,
  onSelectOrder,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
  onManualDelivery,
}: ColumnaKanbanProps) {
  const { id, label, description, accentVar, Icon, iconColor, emptyMessage } = columna;
  /* Suma de los totales que manda el servidor: lo que hay en la columna, no un cobro. */
  const total = orders.reduce((s, o) => s + Number(o.total), 0);
  const { setNodeRef, isOver } = useDroppable({ id });
  const [verTodos, setVerTodos] = useState(false);
  /* Con una tarjeta de más no vale el botón: «Ver los 3» para mostrar una sola. */
  const plegable = orders.length > PEDIDOS_POR_COLUMNA + 1;
  const visibles = verTodos || !plegable ? orders : orders.slice(0, PEDIDOS_POR_COLUMNA);

  return (
    <section
      ref={setNodeRef}
      aria-label={conCabecera ? undefined : label}
      style={
        isOver || isActiveTarget
          ? {
              borderColor: accentVar,
              backgroundColor: `color-mix(in oklab, ${accentVar} 6%, var(--surface-canvas))`,
            }
          : undefined
      }
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-2xl border p-2 transition-all",
        isOver
          ? "ring-2 ring-offset-0 shadow-[var(--shadow-md)]"
          : isActiveTarget
            ? "border-dashed"
            : "border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
      )}
    >
      {conCabecera ? (
        <header
          className="mb-2 flex items-center gap-2 border-b border-[var(--rule-soft)] px-1 pb-2"
          title={description}
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentVar }}
          />
          <CardTitle as="h2" className="truncate text-sm font-bold">
            {label}
          </CardTitle>
          <span
            className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]"
            aria-label={`${orders.length} pedidos`}
          >
            {orders.length}
          </span>
          <span className="ml-auto shrink-0 text-sm tabular-nums text-[var(--text-secondary)]">
            {formatCurrency(total)}
          </span>
        </header>
      ) : (
        <p className="mb-2 px-1 text-sm text-[var(--text-secondary)]">
          {description} · <span className="tabular-nums">{formatCurrency(total)}</span>
        </p>
      )}

      <div className="flex-1 space-y-2">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)]/60 px-4 py-8 text-center">
            <Icon className={cn("h-8 w-8 opacity-50", iconColor)} strokeWidth={1.5} aria-hidden />
            <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
              {emptyMessage}
            </p>
          </div>
        ) : (
          visibles.map((o) => (
            <TarjetaArrastrable
              key={o.id}
              order={o}
              storeLat={storeLat}
              storeLon={storeLon}
              nowMs={nowMs}
              driverColor={driverColor}
              shake={o.id === rejectedId}
              onSelect={() => onSelectOrder(o)}
              onUpdateStatus={(s) => onUpdateStatus(o.id, s)}
              onVerifyYape={() => onVerifyYape(o.id)}
              onRejectYape={() => onRejectYape(o.id)}
              onMarkDeudaPaid={() => onMarkDeudaPaid(o.id)}
              onManualDelivery={
                onManualDelivery ? (reason) => onManualDelivery(o.id, reason) : undefined
              }
            />
          ))
        )}
        {plegable && (
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            aria-expanded={verTodos}
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", verTodos && "rotate-180")}
              aria-hidden
            />
            {verTodos ? "Ver menos" : `Ver los ${orders.length}`}
          </button>
        )}
      </div>
    </section>
  );
});
