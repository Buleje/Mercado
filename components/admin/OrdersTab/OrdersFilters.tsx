"use client";

/**
 * El formulario completo de filtros de Pedidos y reparto: lo que no entra en
 * la barra (origen, montos, notas internas) y, en el celular, todo. Se abre
 * desde el botón «Filtros» de la barra (`BarraPedidos`) y escribe el MISMO
 * estado que ella. Antes era un modal hecho a mano; ahora es `AdminModal`.
 */
import { useId } from "react";
import { Field } from "@/components/admin/shared/Field";
import { Search } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { Button } from "@/components/ui-system/Button";
import { button } from "@/components/ui-system/button-variants";
import { Casilla } from "@/components/ui-system/Casilla";
import { cn } from "@/lib/utils";
import type { OrderFilters, FiltersAction, OrderSource } from "./types";
import { STATUS_LABELS } from "./types";
import type { OrderStatus } from "@/lib/jsondb";

interface OrdersFiltersProps {
  filters: OrderFilters;
  dispatch: React.Dispatch<FiltersAction>;
  /** Repartidores con pedidos hoy: el modal es donde este filtro vive en el
   *  celular (<640px la barra no lo muestra). Mismo estado que la barra. */
  repartidores: string[];
  repartidor: string;
  onRepartidor: (v: string) => void;
  onClose: () => void;
}

/** Opción elegida o no de los grupos «Origen» y «Método de pago». */
const opcion = (activa: boolean) =>
  button({
    variant: "secondary",
    className: cn(
      "flex-1 rounded-xl px-3",
      activa && "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
    ),
  });

export function OrdersFilters({ filters, dispatch, repartidores, repartidor, onRepartidor, onClose }: OrdersFiltersProps) {
  const handleClearAndClose = () => {
    dispatch({ type: "CLEAR" });
    onRepartidor("");
    onClose();
  };

  const dateFromId = useId();
  const dateToId = useId();
  const repartidorId = useId();

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Filtros de pedidos"
      description="Afina qué pedidos ves en el tablero y en la lista"
      variant="wide"
      claveVentana="pedidos-filtros"
      footer={
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={handleClearAndClose}>
            Limpiar filtros
          </Button>
          <Button type="button" variant="accent" onClick={onClose}>
            Aplicar filtros
          </Button>
        </ModalFooter>
      }
    >
        <div className={cn(MODAL_BODY, "space-y-4")}>
          {/* Status multi-select */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Estado</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(status => (
                <label
                  key={status}
                  className={cn(
                    "flex h-12 items-center gap-2 px-3 rounded-xl border cursor-pointer transition-colors",
                    filters.statuses.has(status)
                      ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] "
                  )}
                >
                  <Casilla
                    checked={filters.statuses.has(status)}
                    onChange={(e) => {
                      const next = new Set(filters.statuses);
                      if (e.target.checked) next.add(status);
                      else next.delete(status);
                      dispatch({ type: "SET_STATUSES", statuses: next });
                    }}
                  />
                  <span className="text-sm font-semibold">{STATUS_LABELS[status]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Origen */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Origen</p>
            <div className="flex gap-2">
              {(["", "direct", "marketplace"] as OrderSource[]).map(src => (
                <button
                  key={src || "all"}
                  type="button"
                  aria-pressed={filters.source === src}
                  onClick={() => dispatch({ type: "SET_SOURCE", value: src })}
                  className={opcion(filters.source === src)}
                >
                  {src === "" ? "Todos" : src === "direct" ? "Tienda personal" : "Marketplace"}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Método de pago</p>
            <div className="flex gap-2">
              {(["yape", "efectivo"] as const).map(method => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={filters.paymentMethod === method}
                  onClick={() => dispatch({
                    type: "SET_PAYMENT_METHOD",
                    value: filters.paymentMethod === method ? "" : method,
                  })}
                  className={opcion(filters.paymentMethod === method)}
                >
                  {method === "yape" ? "Yape" : "Efectivo"}
                </button>
              ))}
            </div>
          </div>

          {/* Repartidor — la barra lo muestra ≥640px; acá es su casa en el celular. */}
          {repartidores.length > 0 && (
            <div className="space-y-2">
              <label htmlFor={repartidorId} className="block text-sm font-bold text-[var(--text-primary)]">Repartidor</label>
              <select
                id={repartidorId}
                value={repartidor}
                onChange={(e) => onRepartidor(e.target.value)}
                className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm outline-none focus:border-primary"
              >
                <option value="">Todos los repartidores</option>
                {repartidores.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor={dateFromId} className="block text-sm font-bold text-[var(--text-primary)]">Fecha desde</label>
              <input
                id={dateFromId}
                type="date"
                value={filters.dateFrom}
                onChange={(e) => dispatch({ type: "SET_DATE_FROM", value: e.target.value })}
                className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={dateToId} className="block text-sm font-bold text-[var(--text-primary)]">Fecha hasta</label>
              <input
                id={dateToId}
                type="date"
                value={filters.dateTo}
                onChange={(e) => dispatch({ type: "SET_DATE_TO", value: e.target.value })}
                className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Amount range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-sm font-bold text-[var(--text-primary)]">Monto mínimo</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm">S/</span>
                <input
                  type="number"
                  value={filters.amountMin}
                  onChange={(e) => dispatch({ type: "SET_AMOUNT_MIN", value: e.target.value })}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-[var(--text-primary)]">Monto máximo</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm">S/</span>
                <input
                  type="number"
                  value={filters.amountMax}
                  onChange={(e) => dispatch({ type: "SET_AMOUNT_MAX", value: e.target.value })}
                  placeholder="999.99"
                  className="w-full pl-8 pr-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Customer search */}
          <div className="space-y-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Buscar cliente</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <input
                type="text"
                value={filters.customerSearch}
                onChange={(e) => dispatch({ type: "SET_CUSTOMER_SEARCH", value: e.target.value })}
                placeholder="Nombre o teléfono…"
                className="w-full pl-9 pr-3 h-12 rounded-xl border border-[var(--rule-base)] text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <Field label="Tiene deuda pendiente" className="flex min-h-12 items-center gap-3 px-3 py-2 rounded-xl border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] cursor-pointer" labelClassName="sr-only">
              {(id) => (
                <>
                  <Casilla
                    id={id}
                    checked={filters.hasDebt}
                    onChange={(e) => dispatch({ type: "SET_HAS_DEBT", value: e.target.checked })}
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tiene deuda pendiente</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Solo pedidos con deuda sin cobrar</p>
                  </div>
                </>
              )}
            </Field>
            <Field label="Tiene notas internas" className="flex min-h-12 items-center gap-3 px-3 py-2 rounded-xl border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] cursor-pointer" labelClassName="sr-only">
              {(id) => (
                <>
                  <Casilla
                    id={id}
                    checked={filters.hasAdminNotes}
                    onChange={(e) => dispatch({ type: "SET_HAS_ADMIN_NOTES", value: e.target.checked })}
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tiene notas internas</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Solo pedidos con comentarios del equipo</p>
                  </div>
                </>
              )}
            </Field>
          </div>
        </div>

    </AdminModal>
  );
}
