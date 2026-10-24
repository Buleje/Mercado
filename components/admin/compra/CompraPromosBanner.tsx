"use client";

import { Check as CheckIcon, Tag } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { parsePromoCondicion } from "./promos";
import type { CompraCarrito } from "./use-compra-carrito";

/** Promociones activas hoy: elegir una aplica su descuento a esta orden. */
export default function CompraPromosBanner({ carrito }: { carrito: CompraCarrito }) {
  const { activePromos, appliedPromo, setAppliedPromo, setDiscount, promoActive, subtotal, baseSubtotal, promoQty } = carrito;
  if (activePromos.length === 0) return null;
  return (
    <div className="mb-3 p-3 bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <Tag className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" />
        <span className="text-xs font-semibold text-[var(--data-warning-500)]">
          {activePromos.length} promo{activePromos.length > 1 ? "s" : ""} activa{activePromos.length > 1 ? "s" : ""} hoy
        </span>
        {appliedPromo && (
          <button
            onClick={() => { setAppliedPromo(null); setDiscount(0); }}
            className="ml-auto text-xs text-[var(--data-warning-500)] hover:text-[var(--data-warning-500)] underline"
          >
            Quitar aplicada
          </button>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {activePromos.map(promo => (
          <button
            key={promo.id}
            onClick={() => {
              if (appliedPromo?.id === promo.id) {
                setAppliedPromo(null);
                setDiscount(0);
              } else {
                setAppliedPromo(promo);
                if (promo.tipo === "porcentaje") setDiscount(promo.valor);
              }
            }}
            className={cn(
              "text-xs px-2 py-1 rounded-lg font-medium border transition-all",
              appliedPromo?.id === promo.id
                ? "bg-[var(--data-warning-500)] text-white border-[var(--data-warning-500)]"
                : "bg-[var(--surface-raised)] text-[var(--data-warning-500)] border-[var(--data-warning-500)] hover:bg-[var(--data-warning-100)]",
            )}
          >
            {promo.tipo === "porcentaje" ? `${promo.valor}% OFF` :
             promo.tipo === "monto_fijo" ? `S/ ${promo.valor} OFF` :
             promo.tipo === "2x1" ? "2×1" :
             promo.tipo === "3x2" ? "3×2" :
             promo.tipo === "combo" ? `Combo S/ ${promo.valor}` : promo.nombre}
            <span className="ml-1 opacity-70 truncate max-w-[80px] inline-block align-bottom">
              {promo.nombre}
            </span>
          </button>
        ))}
      </div>
      {appliedPromo && promoActive && (
        <p className="flex items-center gap-1 text-xs text-[var(--data-warning-500)] mt-1.5">
          <CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> Aplicando: <strong>{appliedPromo.nombre}</strong>
          {appliedPromo.tipo === "porcentaje" && ` — ${appliedPromo.valor}% de descuento en esta OC`}
          {appliedPromo.tipo === "2x1" && " — compra 2, paga 1 (por cada 2 unidades, 1 es gratis)"}
          {appliedPromo.tipo === "3x2" && " — compra 3, paga 2 (por cada 3 unidades, 1 es gratis)"}
          {appliedPromo.tipo === "monto_fijo" && ` — S/ ${appliedPromo.valor} de descuento en esta OC`}
          {appliedPromo.tipo === "combo" && ` — precio combo S/ ${appliedPromo.valor} (ahorro ${formatCurrency(Math.max(0, subtotal - appliedPromo.valor))})`}
        </p>
      )}
      {appliedPromo && !promoActive && (() => {
        const { minMonto, minCantidad } = parsePromoCondicion(appliedPromo.condicion);
        const faltaMonto = minMonto > 0 && baseSubtotal < minMonto ? minMonto - baseSubtotal : 0;
        const faltaQty = minCantidad > 0 && promoQty < minCantidad ? minCantidad - promoQty : 0;
        return (
          <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
            <strong>{appliedPromo.nombre}</strong> requiere{" "}
            {faltaMonto > 0 && `${formatCurrency(faltaMonto)} más`}
            {faltaMonto > 0 && faltaQty > 0 && " y "}
            {faltaQty > 0 && `${faltaQty} unidad${faltaQty === 1 ? "" : "es"} más`}
            {" "}para activarse — aún no descuenta.
          </p>
        );
      })()}
    </div>
  );
}
