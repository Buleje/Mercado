"use client";

/**
 * MiListaDelMes — Widget que predice la lista de compras recurrente del
 * cliente basado en su historial. IA simple: productos comprados 2+ veces
 * en los ultimos 60 dias = candidatos a "lista del mes".
 *
 * Flow:
 *   1. Al mount, fetch /api/marketplace/me/recurring-products
 *   2. Muestra chips con cantidad sugerida (basada en promedio historico)
 *   3. Usuario toca para incluir/excluir
 *   4. Un boton "Agregar todo al carrito" hace bulk-add
 *
 * Impacto esperado: +30% retention mensual, +25% AOV cliente recurrente.
 * Inspiracion: Amazon "Subscribe & Save" + Rappi "repite tu compra".
 *
 * Si el endpoint aun no existe o no hay historia, muestra empty state
 * informativo y no rompe.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Calendar,
  Plus,
  Check,
  ShoppingCart,
  Package,
  TrendingUp,
  Loader2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface RecurringProduct {
  id: number;
  storeProductId: string;
  storeId: string;
  storeName: string;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
  /** Cantidad promedio historica que suele pedir el cliente */
  suggestedQty: number;
  /** Cuantas veces lo ha comprado en la ventana (60d) */
  timesPurchased: number;
  /** Dias promedio entre compras */
  avgDaysBetween: number | null;
}

interface Props {
  customerPhone: string | null;
  onAddToCart?: (items: Array<{ storeProductId: string; qty: number }>) => Promise<void> | void;
  /** Endpoint fetch — default /api/marketplace/me/recurring-products */
  endpoint?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function MiListaDelMes({
  customerPhone,
  onAddToCart,
  endpoint = "/api/marketplace/me/recurring-products",
}: Props) {
  const [products, setProducts] = useState<RecurringProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!customerPhone) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetch(`${endpoint}?phone=${encodeURIComponent(customerPhone)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        const items: RecurringProduct[] = data?.products ?? [];
        setProducts(items);
        // Pre-seleccionar todos los productos por default
        setSelected(new Set(items.map((p) => p.storeProductId)));
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError("No pudimos cargar tu lista");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [customerPhone, endpoint]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const selectedTotal = products
    .filter((p) => selected.has(p.storeProductId))
    .reduce((sum, p) => sum + p.price * p.suggestedQty, 0);

  const handleAddAll = useCallback(async () => {
    if (selectedCount === 0) return;
    setAdding(true);
    try {
      const items = products
        .filter((p) => selected.has(p.storeProductId))
        .map((p) => ({ storeProductId: p.storeProductId, qty: p.suggestedQty }));
      await onAddToCart?.(items);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } finally {
      setAdding(false);
    }
  }, [products, selected, selectedCount, onAddToCart]);

  // Early returns
  if (!customerPhone) {
    return (
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 text-center">
        <Calendar
          className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3"
          strokeWidth={1.25}
          aria-hidden
        />
        <p className="text-sm font-bold text-[var(--text-primary)]">Tu lista del mes</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1 mb-4">
          Iniciá sesión para ver lo que solés pedir cada mes
        </p>
        <Link
          href="/ingresar"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2 text-sm font-bold hover:bg-[var(--accent)] transition-colors"
        >
          Iniciá sesión
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 animate-pulse space-y-3">
        <div className="h-5 w-40 bg-[var(--surface-sunken)] rounded" />
        <div className="h-3 w-56 bg-[var(--surface-sunken)] rounded" />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="h-16 bg-[var(--surface-sunken)] rounded-xl" />
          <div className="h-16 bg-[var(--surface-sunken)] rounded-xl" />
          <div className="h-16 bg-[var(--surface-sunken)] rounded-xl" />
          <div className="h-16 bg-[var(--surface-sunken)] rounded-xl" />
        </div>
      </section>
    );
  }

  if (error || products.length === 0) {
    return (
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 text-center">
        <Package
          className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3"
          strokeWidth={1.25}
          aria-hidden
        />
        <p className="text-sm font-bold text-[var(--text-primary)]">Tu lista del mes</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          {error
            ? error
            : "Necesitas 2-3 compras más para que armemos tu lista personalizada"}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Mi lista del mes"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header editorial */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Calendar className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Tu lista del mes
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              {products.length} productos que solés pedir
            </p>
          </div>
        </div>
      </div>

      {/* Grid de productos */}
      <div className="px-5 grid grid-cols-1 sm:grid-cols-2 gap-2 pb-4">
        {products.map((p) => {
          const isSelected = selected.has(p.storeProductId);
          return (
            <button
              key={p.storeProductId}
              type="button"
              onClick={() => toggle(p.storeProductId)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] hover:border-[var(--accent)]/40",
              )}
            >
              <div className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-raised)] border border-[var(--rule-soft)]">
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--text-tertiary)]">
                    <Package className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold tracking-tight text-[var(--text-primary)] line-clamp-1">
                  {p.name}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                  {p.timesPurchased}x · {fmt(p.price)} · {p.suggestedQty} {p.unit ?? "un"}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border shrink-0 transition-colors",
                  isSelected
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-tertiary)]",
                )}
                aria-hidden
              >
                {isSelected ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {selectedCount} de {products.length} seleccionados
          </p>
          <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
            {fmt(selectedTotal)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddAll}
          disabled={selectedCount === 0 || adding}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition-all active:scale-[0.98]",
            selectedCount > 0 && !adding
              ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]"
              : "bg-[var(--surface-raised)] text-[var(--text-tertiary)] cursor-not-allowed",
          )}
        >
          {adding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
              Agregando…
            </>
          ) : added ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              ¡Listo! Ya en tu carrito
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Agregar {selectedCount} al carrito
            </>
          )}
        </button>
      </div>
    </section>
  );
}
