"use client";

import Image from "next/image";
import { X as XIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { computeEffectiveQty, esPromoDeUnidades, freeUnits, itemMatchesPromo } from "./promos";
import type { CompraItem } from "./costo-compra";
import type { CompraCarrito } from "./use-compra-carrito";

interface Props {
  item: CompraItem;
  carrito: CompraCarrito;
  processing: boolean;
}

/**
 * Un renglón de la canasta con su COSTO editable: precargado con el de la
 * última compra (o el del producto); si no hay ninguno queda vacío y la orden
 * no sale hasta escribirlo. Nunca toma el precio de venta.
 */
export default function CompraCanastaItem({ item, carrito, processing }: Props) {
  const { appliedPromo, priceHistory, costo, setCosto, updateQty, removeItem } = carrito;
  const { product } = item;
  const c = costo(item);
  const falta = c == null;
  const valor = item.unitCost === null ? "" : (item.unitCost ?? c ?? "");
  const ultimo = priceHistory[product.id];
  const promo = esPromoDeUnidades(appliedPromo) && itemMatchesPromo(item, appliedPromo) && freeUnits(item.quantity, appliedPromo.tipo) > 0
    ? appliedPromo
    : null;

  return (
    <div className="flex items-center gap-2 p-2 bg-[var(--surface-sunken)] rounded-xl animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]">
      {/* Miniatura */}
      <div
        aria-hidden="true"
        className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold text-sm overflow-hidden relative"
      >
        <span className="absolute inset-0 flex items-center justify-center">
          {(product.name || "?")[0].toUpperCase()}
        </span>
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover rounded-lg z-10"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            unoptimized
          />
        ) : null}
      </div>

      {/* Info + costo */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[var(--text-primary)] truncate">{product.name}</p>
        <div className="mt-0.5 flex items-center gap-1 flex-wrap text-xs text-[var(--text-tertiary)]">
          <span aria-hidden>S/</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => {
              const v = e.target.value;
              setCosto(product.id, v === "" ? null : Math.max(0, Number(v)));
            }}
            disabled={processing}
            placeholder="costo"
            aria-label={`Costo unitario de ${product.name}`}
            aria-invalid={falta}
            // `dark:bg-` en la clase: sin eso globals.css pisa el borde rojo en oscuro.
            className={cn(
              "h-7 w-16 rounded-md border px-1.5 text-right font-mono text-xs bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50",
              falta ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]",
            )}
          />
          <span>/ {product.unit}</span>
          {c != null && ultimo !== undefined && ultimo !== c && (
            <span
              title={`Última compra: ${formatCurrency(ultimo)}`}
              className={cn(
                "text-xs font-bold px-1 rounded",
                c > ultimo
                  ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                  : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
              )}
            >
              {c > ultimo ? "↑" : "↓"}
              {Math.abs(((c - ultimo) / ultimo) * 100).toFixed(0)}%
            </span>
          )}
          {promo && (
            <span className="text-xs bg-[var(--data-warning-100)] text-[var(--data-warning-500)] px-1 rounded font-bold uppercase tracking-wider">
              +{freeUnits(item.quantity, promo.tipo)} gratis
            </span>
          )}
        </div>
        {falta && (
          <p className="mt-0.5 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            Falta el costo
          </p>
        )}
      </div>

      {/* Controles cantidad */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => updateQty(product.id, -1)}
          disabled={processing}
          aria-label={`Reducir cantidad de ${product.name}`}
          className="h-6 w-6 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center text-xs hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          -
        </button>
        <span aria-live="polite" className="text-xs font-bold w-6 text-center text-[var(--text-primary)]">
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={() => updateQty(product.id, 1)}
          disabled={processing}
          aria-label={`Aumentar cantidad de ${product.name}`}
          className="h-6 w-6 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center text-xs hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>

      {/* Subtotal ítem */}
      <div className="text-xs font-mono font-bold text-[var(--text-primary)] w-16 text-right">
        {falta ? (
          <span className="text-[var(--text-tertiary)]">—</span>
        ) : promo ? (
          <span className="flex flex-col items-end">
            <span className="line-through text-[var(--text-tertiary)] text-xs font-normal">
              {formatCurrency(c * item.quantity)}
            </span>
            <span className="text-[var(--data-warning-500)]">
              {formatCurrency(c * computeEffectiveQty(item.quantity, promo.tipo))}
            </span>
          </span>
        ) : (
          <>{formatCurrency(c * item.quantity)}</>
        )}
      </div>

      {/* Eliminar */}
      <button
        type="button"
        onClick={() => removeItem(product.id)}
        disabled={processing}
        aria-label={`Eliminar ${product.name} de la canasta`}
        className="h-5 w-5 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <XIcon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
