"use client";

import { useState } from "react";
import Image from "next/image";
import { X as XIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { naturalezaDe } from "@/lib/compras/naturaleza";
import { computeEffectiveQty, esPromoDeUnidades, freeUnits, itemMatchesPromo } from "./promos";
import { FUENTES_COSTO, fuenteDelCosto, type CompraItem } from "./costo-compra";
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
  const { appliedPromo, priceHistory, costo, setCosto, updateQty, setQty, removeItem } = carrito;
  const { product } = item;
  // Servicio o alquiler (C01): se pide por su unidad de cobro («/ hora»), no por la de inventario.
  const nat = naturalezaDe(product);
  const unidad = nat.distintivo ? nat.unidad : product.unit;
  const c = costo(item);
  const falta = c == null;
  const fuente = fuenteDelCosto(item, priceHistory);
  // Mientras escribes la cantidad («2» camino a «21», o vacío) se muestra lo escrito; al salir, lo guardado.
  const [cantidadEscrita, setCantidadEscrita] = useState<string | null>(null);
  const valor = item.unitCost === null ? "" : (item.unitCost ?? c ?? "");
  const ultimo = priceHistory[product.id];
  const promo = esPromoDeUnidades(appliedPromo) && itemMatchesPromo(item, appliedPromo) && freeUnits(item.quantity, appliedPromo.tipo) > 0
    ? appliedPromo
    : null;

  // Dos filas (a 1280 la canasta mide ~330 px y en una sola fila el nombre y el «S/» se partían):
  // arriba qué es y cuánto suma; abajo el costo con su fuente y la cantidad.
  return (
    <div className="p-2 bg-[var(--surface-sunken)] rounded-xl animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]">
      <div className="flex items-center gap-2">
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
        <p className="flex-1 min-w-0 text-sm font-medium text-[var(--text-primary)] truncate" title={product.name}>{product.name}</p>
        {nat.distintivo && (
          <span className="shrink-0 text-xs text-[var(--text-tertiary)]" title={`${nat.distintivo}: no es mercadería del almacén`}>
            {nat.distintivo}
          </span>
        )}

        {/* Subtotal ítem */}
        <div className="shrink-0 text-sm font-mono font-bold text-[var(--text-primary)] text-right whitespace-nowrap">
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
          className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-10">
      {/* Costo con su fuente */}
      <div className="min-w-0">
        <div className="flex items-center gap-1 flex-wrap text-xs text-[var(--text-tertiary)]">
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
          <span>/ {unidad}</span>
          {fuente !== "falta" && (
            <span title={FUENTES_COSTO[fuente].ayuda} className="text-[var(--text-tertiary)]">
              · {FUENTES_COSTO[fuente].corto}
            </span>
          )}
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

      {/* Cantidad: −/+ o escrita (C02: 21 unidades sin 20 clics). Flechas ↑/↓ suman o restan 1. */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => updateQty(product.id, -1)}
          disabled={processing}
          aria-label={`Reducir cantidad de ${product.name}`}
          className="h-8 w-8 shrink-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] flex items-center justify-center text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={cantidadEscrita ?? String(item.quantity)}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.,]/g, "").slice(0, 7);
            setCantidadEscrita(v);
            const n = Number(v.replace(",", "."));
            if (v !== "" && n > 0) setQty(product.id, n);
          }}
          onBlur={() => setCantidadEscrita(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              setCantidadEscrita(null);
              updateQty(product.id, e.key === "ArrowUp" ? 1 : -1);
            }
          }}
          disabled={processing}
          aria-label={`Cantidad de ${product.name} (${unidad})`}
          className="h-8 w-11 rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)] text-center font-mono text-xs font-bold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => updateQty(product.id, 1)}
          disabled={processing}
          aria-label={`Aumentar cantidad de ${product.name}`}
          className="h-8 w-8 shrink-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] flex items-center justify-center text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
      </div>
    </div>
  );
}
