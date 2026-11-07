"use client";

import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { fmt, type POSPaymentModalProps } from "@/components/admin/pos/pago/pago-shared";
import type { PagoModal } from "@/components/admin/pos/pago/usePagoModal";
import PagoPrecioCliente from "@/components/admin/pos/pago/PagoPrecioCliente";

type Articulo = NonNullable<POSPaymentModalProps["cartItems"]>[number];

/**
 * Redondeo de un total con céntimos, sólo HACIA ABAJO (se aplica como descuento
 * fijo). Hacia arriba sería un recargo: `/api/sales` sólo acepta descuentos, así
 * que «S/42» sobre S/ 41,60 se veía pero se registraba 41,60 (17-10).
 */
function opcionesDeRedondeo(total: number): number[] {
  const bajo = Math.floor(total);
  return total % 1 !== 0 && bajo > 0 ? [bajo] : [];
}

/**
 * «La venta», arriba: el total UNA vez y grande, lo que se descontó, los
 * artículos plegados y el redondeo. En celular queda pegado bajo la cabecera
 * mientras se baja a cliente y comprobante.
 */
export default function PagoTotal({ p, articulos, className }: { p: PagoModal; articulos?: Articulo[]; className?: string }) {
  const { total, subtotal, discountAmount, discountPercent, discountMode, cartCount, setDiscountValue, setDiscountMode, setShowDiscount } = p;
  const [verArticulos, setVerArticulos] = useState(false);
  const redondeos = opcionesDeRedondeo(total);
  const hayLista = !!articulos && articulos.length > 0;
  // «S/ 159.68» a 5xl no entra al lado de «N artículos» y se partía en dos renglones (20-10:
  // el pedido de una revendedora siempre pasa los S/ 100): desde 3 cifras enteras va a 4xl.
  const totalLargo = fmt(total).length > 8;
  return (
    <section aria-label="Total a cobrar" className={cn("px-4 py-3 sm:px-5 md:pt-4", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Kicker as="p">Total a cobrar</Kicker>
          <p data-pago-total className={cn("text-3xl font-extrabold leading-none tabular-nums text-[var(--text-primary)] md:text-4xl", !totalLargo && "lg:text-5xl")}>
            {fmt(total)}
          </p>
          {discountAmount > 0 && (
            <p className="mt-1 text-sm tabular-nums text-[var(--text-tertiary)]">
              <span className="line-through">{fmt(subtotal)}</span>
              <span className="font-semibold text-[var(--data-error-ink)]">
                {" "}−{fmt(discountAmount)} dto{discountMode === "percent" ? ` (${discountPercent.toFixed(0)} %)` : ""}
              </span>
            </p>
          )}
          <PagoPrecioCliente p={p} />
        </div>
        <button
          type="button"
          onClick={() => setVerArticulos((v) => !v)}
          disabled={!hayLista}
          aria-expanded={hayLista ? verArticulos : undefined}
          aria-controls={hayLista ? "pago-articulos" : undefined}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-default"
        >
          {cartCount} {cartCount === 1 ? "artículo" : "artículos"}
          {hayLista && <ChevronDown className={cn("h-4 w-4 transition-transform", verArticulos && "rotate-180")} aria-hidden />}
        </button>
      </div>

      {hayLista && verArticulos && (
        <ul id="pago-articulos" className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2 text-sm">
          {articulos.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[var(--text-primary)]">{a.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">
                {a.quantity} {a.unit}
              </span>
            </li>
          ))}
        </ul>
      )}

      {redondeos.length > 0 && (
        <div className="mt-3 hidden flex-wrap items-center gap-1.5 lg:flex">
          <span className="text-sm text-[var(--text-tertiary)]">Redondear a</span>
          {redondeos.map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                // Contra el subtotal: el descuento fijo REEMPLAZA al que hubiera (46,22 −10 % → «S/41» daba 45,62).
                setDiscountValue(String((subtotal - val).toFixed(2)));
                setDiscountMode("fixed");
                setShowDiscount(true);
              }}
              className="h-8 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold tabular-nums text-[var(--text-secondary)] transition-colors hover:border-primary/50 hover:text-[var(--accent-ink)]"
            >
              S/{val}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
