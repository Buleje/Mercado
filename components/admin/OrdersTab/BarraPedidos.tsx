"use client";

/**
 * La barra de filtros de Pedidos y reparto — UNA fila, pegada al tablero o a la
 * lista que filtra (ley de la vista, regla 5).
 *
 * 10-10 (Brandon: «lo que ocupa filas completas va en la misma fila que
 * otros»): eran tres filas a 1280 px (buscador · chips · «Con deuda» y
 * «Filtros»). Ahora: buscador · Estado · Pago · Filtros · Limpiar, y a la
 * derecha lo que la vista ponga (`extremo`: las acciones en bloque de la
 * Lista). Repartidor, fecha y «con deuda» viven en el formulario de
 * «Filtros», que siempre los tuvo; «con deuda» también es la tarjeta de los
 * Indicadores. «Todos» se fue: tocar otra vez el estado elegido lo suelta,
 * igual que Yape y Efectivo.
 *
 * La cuenta de cada estado va sólo en la Lista: en el Tablero la dice la
 * cabecera de su columna (`conCuentas`). Un estado sin pedidos no tiene chip.
 *
 * Todo escribe el MISMO estado (`useOrdersFilters` + el repartidor elegido).
 * En el celular quedan el buscador y «Filtros»; lo demás vive en el modal.
 */
import type { ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { type FiltersAction, type OrderFilters } from "./types";
import { cuantosPorEstado, filtrosPuestos } from "./filtrar-pedidos";

const PAGOS = [
  { value: "yape", label: "Yape" },
  { value: "efectivo", label: "Efectivo" },
] as const;

const ESTADOS: Record<string, string> = {
  pendiente: "Pendientes",
  confirmado: "Confirmados",
  preparando: "Preparando",
  en_camino: "En camino",
};

/** Chip de la barra: 48 px como el buscador; pulsado = primario del DS (blanco sobre turquesa daba 3,2:1). */
function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={button({
        variant: activo ? "primary" : "secondary",
        className: "gap-1.5 rounded-xl px-3",
      })}
    >
      {children}
    </button>
  );
}

/**
 * Los desplegables de `filtros-columna` nacieron para la cabeza de una tabla
 * (h-9 con margen arriba); en una barra van a la altura del panel (48 px,
 * decisión de Brandon 09-10) y sin margen. Lo usa Archivados.
 */
export const DESPLEGABLES_A_LA_ALTURA =
  "[&_select]:mt-0 [&_select]:h-12 [&_select]:rounded-xl [&_details]:mt-0 [&_summary]:h-12 [&_summary]:rounded-xl";

interface BarraPedidosProps {
  orders: readonly DbOrder[];
  filters: OrderFilters;
  dispatch: React.Dispatch<FiltersAction>;
  repartidor: string;
  onRepartidor: (v: string) => void;
  onAbrirFiltros: () => void;
  /** La cuenta en cada chip de estado (Lista). En el Tablero la dice su columna. */
  conCuentas?: boolean;
  /** Lo que la vista pone a la derecha de la misma fila (acciones en bloque). */
  extremo?: ReactNode;
}

export function BarraPedidos({
  orders,
  filters,
  dispatch,
  repartidor,
  onRepartidor,
  onAbrirFiltros,
  conCuentas = false,
  extremo,
}: BarraPedidosProps) {
  const puestos = filtrosPuestos(filters, repartidor);
  const limpiar = () => {
    dispatch({ type: "CLEAR" });
    onRepartidor("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Base `auto` (no `flex-1`): si los filtros y el `extremo` no entran juntos,
          baja el `extremo` a su fila en vez de apretar los chips en cuatro. En el
          celular base 0: buscador, Filtros e Imprimir en una sola fila. */}
      <div
        role="search"
        aria-label="Filtrar pedidos"
        className="flex min-w-0 grow flex-wrap items-center gap-2 max-sm:basis-0"
      >
        <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            type="search"
            value={filters.customerSearch}
            onChange={(e) => dispatch({ type: "SET_CUSTOMER_SEARCH", value: e.target.value })}
            placeholder="Cliente, teléfono o #pedido"
            aria-label="Buscar pedidos por cliente, teléfono o número"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar por estado"
          className="flex flex-wrap items-center gap-2 max-sm:hidden"
        >
          {cuantosPorEstado(orders).map(({ value, count }) => {
            const activo =
              filters.statuses.size === 1 && filters.statuses.has(value as OrderStatus);
            /* Un estado sin pedidos no filtra nada: su chip se va (vuelve si está puesto). */
            if (count === 0 && !activo) return null;
            return (
              <Chip
                key={value}
                activo={activo}
                onClick={() =>
                  dispatch({
                    type: "SET_STATUSES",
                    statuses: activo ? new Set() : new Set([value as OrderStatus]),
                  })
                }
              >
                {ESTADOS[value] ?? value}
                {conCuentas && (
                  <span className="text-sm font-bold tabular-nums opacity-80">{count}</span>
                )}
              </Chip>
            );
          })}
        </div>
        <div
          role="group"
          aria-label="Filtrar por método de pago"
          className="flex flex-wrap items-center gap-2 max-sm:hidden"
        >
          {PAGOS.map((p) => {
            const activo = filters.paymentMethod === p.value;
            return (
              <Chip
                key={p.value}
                activo={activo}
                onClick={() =>
                  dispatch({ type: "SET_PAYMENT_METHOD", value: activo ? "" : p.value })
                }
              >
                {p.label}
              </Chip>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAbrirFiltros}
          aria-haspopup="dialog"
          title="Repartidor, fechas, montos, deuda y notas"
          className={button({
            variant: "secondary",
            className: "relative gap-1.5 rounded-xl px-3 max-sm:w-12 max-sm:px-0",
          })}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Filtros</span>
          {puestos > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-dark)] px-1 text-sm font-bold tabular-nums text-white max-sm:absolute max-sm:-right-1 max-sm:-top-1">
              {puestos}
            </span>
          )}
        </button>

        {puestos > 0 && (
          <button
            type="button"
            onClick={limpiar}
            className={button({
              variant: "ghost",
              className: "gap-1.5 rounded-xl px-3 max-sm:w-12 max-sm:px-0",
            })}
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Limpiar</span>
          </button>
        )}
      </div>

      {extremo}
    </div>
  );
}
