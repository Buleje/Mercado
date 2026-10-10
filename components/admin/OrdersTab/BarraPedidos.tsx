"use client";

/**
 * La barra de filtros de Pedidos y reparto — UNA, pegada al tablero o a la
 * lista que filtra (ley de la vista, regla 5).
 *
 * Antes los filtros vivían en cuatro lugares: el botón «Filtros» de la
 * cabecera, el buscador suelto, la fila de chips (estado, Yape, Efectivo,
 * deuda) y el repartidor y la fecha al final de esa fila. Ahora: buscador ·
 * Estado · Pago · Repartidor · Fecha · Con deuda · Filtros (el formulario
 * completo: origen, montos y notas) · Limpiar. Estado y método de pago
 * siguen como chips (con su cuenta) en esa misma fila: son los filtros de
 * todos los días y no merecen abrir un desplegable.
 *
 * Todo escribe el MISMO estado (`useOrdersFilters` + el repartidor elegido).
 * En el celular quedan el buscador y «Filtros»; lo demás vive en el modal.
 */
import { DollarSign, Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { FiltroColumna, FiltroColumnaRango } from "@/components/admin/shared/filtros-columna";
import type { Rango } from "@/lib/admin/filtros-columna";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { type FiltersAction, type OrderFilters } from "./types";
import { cuantosPorEstado, esArchivado, filtrosPuestos, repartidoresConPedidos } from "./filtrar-pedidos";

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

/** Chip de la barra: mismo alto que los desplegables (48 px), pulsado = acento. */
function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={button({ variant: activo ? "accent" : "secondary", className: "rounded-xl px-4" })}
    >
      {children}
    </button>
  );
}

function Cuenta({ n }: { n: number }) {
  return <span className="text-xs font-bold tabular-nums opacity-80">{n}</span>;
}

/**
 * Los desplegables de `filtros-columna` nacieron para la cabeza de una tabla
 * (h-9 con margen arriba); en esta barra van a la altura del panel (48 px,
 * decisión de Brandon 09-10) y sin margen. Cuando el primitivo crezca a h-12
 * (ola 5 del plan), esto sobra.
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
  /** Una línea de estado a la derecha («18 en marcha · 2 entregados hoy»). */
  resumen?: string;
}

export function BarraPedidos({ orders, filters, dispatch, repartidor, onRepartidor, onAbrirFiltros, resumen }: BarraPedidosProps) {
  const repartidores = repartidoresConPedidos(orders);
  const puestos = filtrosPuestos(filters, repartidor);
  const hayDeuda = orders.some((o) => o.deuda === true);
  const limpiar = () => {
    dispatch({ type: "CLEAR" });
    onRepartidor("");
  };

  return (
    <div role="search" aria-label="Filtrar pedidos" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          value={filters.customerSearch}
          onChange={(e) => dispatch({ type: "SET_CUSTOMER_SEARCH", value: e.target.value })}
          placeholder="Buscar cliente, teléfono o #pedido…"
          aria-label="Buscar pedidos por cliente, teléfono o número"
          className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />
      </div>

      <div className={cn("flex flex-wrap items-center gap-2 max-sm:hidden", DESPLEGABLES_A_LA_ALTURA)}>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap items-center gap-2">
          <Chip activo={filters.statuses.size === 0} onClick={() => dispatch({ type: "SET_STATUSES", statuses: new Set() })}>
            Todos
            <Cuenta n={orders.filter((o) => !esArchivado(o)).length} />
          </Chip>
          {cuantosPorEstado(orders).map(({ value, count }) => (
            <Chip
              key={value}
              activo={filters.statuses.size === 1 && filters.statuses.has(value as OrderStatus)}
              onClick={() => dispatch({ type: "SET_STATUSES", statuses: new Set([value as OrderStatus]) })}
            >
              {ESTADOS[value] ?? value}
              <Cuenta n={count} />
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Filtrar por método de pago" className="flex flex-wrap items-center gap-2">
          {PAGOS.map((p) => {
            const activo = filters.paymentMethod === p.value;
            return (
              <Chip key={p.value} activo={activo} onClick={() => dispatch({ type: "SET_PAYMENT_METHOD", value: activo ? "" : p.value })}>
                {p.label}
              </Chip>
            );
          })}
        </div>
        {repartidores.length > 0 && (
          <FiltroColumna
            label="Repartidor"
            placeholder="Repartidor"
            value={repartidor || undefined}
            options={repartidores}
            onChange={(v) => onRepartidor(v ?? "")}
          />
        )}
        <FiltroColumnaRango
          label="Fecha"
          esFecha
          placeholder="Fecha"
          valor={{ min: filters.dateFrom || null, max: filters.dateTo || null } as Rango<string>}
          onChange={(r) => {
            dispatch({ type: "SET_DATE_FROM", value: (r.min as string | null) ?? "" });
            dispatch({ type: "SET_DATE_TO", value: (r.max as string | null) ?? "" });
          }}
        />
      </div>

      {hayDeuda && (
        <button
          type="button"
          onClick={() => dispatch({ type: "SET_HAS_DEBT", value: !filters.hasDebt })}
          aria-pressed={filters.hasDebt}
          className={button({ variant: filters.hasDebt ? "accent" : "secondary", className: "rounded-xl px-4" })}
        >
          <DollarSign className="h-4 w-4" aria-hidden />
          Con deuda
        </button>
      )}

      <button
        type="button"
        onClick={onAbrirFiltros}
        aria-haspopup="dialog"
        className={button({ variant: "secondary", className: "relative rounded-xl px-4" })}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtros
        {puestos > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-dark)] px-1 text-xs font-bold text-white tabular-nums">
            {puestos}
          </span>
        )}
      </button>

      {puestos > 0 && (
        <button type="button" onClick={limpiar} className={button({ variant: "ghost", className: "rounded-xl px-3" })}>
          <X className="h-4 w-4" aria-hidden />
          Limpiar
        </button>
      )}

      {resumen && (
        <p className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]" aria-live="polite">
          {resumen}
        </p>
      )}
    </div>
  );
}
