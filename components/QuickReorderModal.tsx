"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { X, Minus, Plus, RotateCcw, ShoppingCart, Package, TrendingUp, TrendingDown, AlertCircle } from "@buleje/design-system/icons";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";

interface OrderItem {
  productId?: number;
  name: string;
  price?: number;
  quantity: number;
  unit: string;
  image: string;
}

interface QuickReorderModalProps {
  items: OrderItem[];
  orderId: string;
  orderDate: string;
  onClose: () => void;
  onConfirm: (selected: { product: { id: number; name: string; price: number; image: string; unit: string; category: string }; quantity: number }[]) => void;
}

export default function QuickReorderModal({
  items,
  orderId,
  orderDate,
  onClose,
  onConfirm,
}: QuickReorderModalProps) {
  const { products: allProducts, isLoading } = useStoreProducts();

  // Build selectable items with current catalog price comparison
  const selectableItems = useMemo(() => {
    return items.map((item) => {
      const catalogMatch = allProducts.find(
        (p) => p.id === item.productId || p.name.toLowerCase() === item.name.toLowerCase()
      );
      const currentPrice = catalogMatch?.price ?? item.price ?? 0;
      const oldPrice = item.price ?? currentPrice;
      const priceChanged = Math.abs(currentPrice - oldPrice) > 0.01;

      return {
        ...item,
        catalogMatch,
        currentPrice,
        oldPrice,
        priceChanged,
        priceDiff: currentPrice - oldPrice,
        available: !!catalogMatch,
      };
    });
  }, [items, allProducts]);

  // Selection state: { itemIndex → quantity }
  const [selected, setSelected] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    selectableItems.forEach((item, i) => {
      if (item.available) {
        initial[i] = item.quantity;
      }
    });
    return initial;
  });

  if (isLoading) return null;

  const toggleItem = (idx: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (idx in next) {
        delete next[idx];
      } else {
        next[idx] = selectableItems[idx].quantity;
      }
      return next;
    });
  };

  const updateQty = (idx: number, qty: number) => {
    if (qty < 1) return;
    if (qty > 99) return;
    setSelected((prev) => ({ ...prev, [idx]: qty }));
  };

  const selectedCount = Object.keys(selected).length;
  const estimatedTotal = Object.entries(selected).reduce((sum, [idx, qty]) => {
    return sum + selectableItems[Number(idx)].currentPrice * qty;
  }, 0);

  const handleConfirm = () => {
    const toAdd = Object.entries(selected)
      .map(([idx, qty]) => {
        const item = selectableItems[Number(idx)];
        if (!item.catalogMatch) return null;
        return {
          product: {
            id: item.catalogMatch.id,
            name: item.catalogMatch.name,
            price: item.catalogMatch.price,
            image: item.catalogMatch.image,
            unit: item.catalogMatch.unit,
            category: item.catalogMatch.category,
          },
          quantity: qty,
        };
      })
      .filter(Boolean) as { product: { id: number; name: string; price: number; image: string; unit: string; category: string }; quantity: number }[];

    onConfirm(toAdd);
    onClose();
  };

  const selectAll = () => {
    const next: Record<number, number> = {};
    selectableItems.forEach((item, i) => {
      if (item.available) next[i] = item.quantity;
    });
    setSelected(next);
  };

  const deselectAll = () => setSelected({});

  return (
    <div className="fixed inset-0 z-7000 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-2xl shadow-[var(--shadow-xl)] w-full sm:max-w-md max-h-[90svh] flex flex-col overflow-hidden animate-[scaleIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)]">
          <div>
            <h3 className="font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <RotateCcw className="h-4.5 w-4.5 text-primary" />
              Volver a pedir
            </h3>
            <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5">
              Pedido #{orderId.slice(-6).toUpperCase()} · {orderDate}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        {/* Select all / deselect */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)]">
          <span className="text-xs font-semibold text-muted">
            {selectedCount} de {selectableItems.filter((i) => i.available).length} seleccionados
          </span>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-[length:var(--ts-2xs)] font-semibold text-primary hover:underline"
            >
              Todos
            </button>
            <span className="text-gray-300">·</span>
            <button
              onClick={deselectAll}
              className="text-[length:var(--ts-2xs)] font-semibold text-muted hover:underline"
            >
              Ninguno
            </button>
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {selectableItems.map((item, idx) => {
            const isSelected = idx in selected;
            const qty = selected[idx] ?? item.quantity;

            return (
              <div
                key={`${item.name}-${idx}`}
                className={cn(
                  "rounded-xl border-2 p-3 transition-all",
                  !item.available
                    ? "border-gray-100 bg-gray-50 dark:bg-surface dark:border-[var(--rule-base)] opacity-60"
                    : isSelected
                    ? "border-primary/30 bg-primary/3"
                    : "border-[var(--rule-base)] hover:border-gray-200"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => item.available && toggleItem(idx)}
                    disabled={!item.available}
                    className={cn(
                      "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                      !item.available
                        ? "border-gray-200 bg-gray-100 cursor-not-allowed"
                        : isSelected
                        ? "border-primary bg-primary text-white"
                        : "border-gray-300 hover:border-primary"
                    )}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  {/* Image */}
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-surface shrink-0">
                    {item.image ? (
                      <Image src={item.image} alt={item.name} fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-semibold truncate",
                      item.available ? "text-[var(--text-primary)]" : "text-muted line-through"
                    )}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-bold text-primary">
                        S/{Number(item.currentPrice).toFixed(2)}
                      </span>
                      {item.priceChanged && (
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-semibold px-1.5 py-0.5 rounded-full",
                          item.priceDiff > 0
                            ? "text-[var(--data-error-600)] bg-red-50 dark:bg-red-950/30"
                            : "text-[var(--data-success-600)] bg-emerald-50 dark:bg-emerald-950/30"
                        )}>
                          {item.priceDiff > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {item.priceDiff > 0 ? "+" : ""}S/{Number(item.priceDiff).toFixed(2)}
                        </span>
                      )}
                      {!item.available && (
                        <span className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-semibold text-[var(--data-error-500)] bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                          <AlertCircle className="h-3 w-3" />
                          No disponible
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quantity stepper */}
                  {item.available && isSelected && (
                    <div className="flex items-center bg-gray-100 dark:bg-surface rounded-lg overflow-hidden shrink-0">
                      <button
                        onClick={() => updateQty(idx, qty - 1)}
                        className="h-8 w-7 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-[var(--surface-raised)] transition-colors"
                      >
                        <Minus className="h-3 w-3 text-muted" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-[var(--text-primary)]">{qty}</span>
                      <button
                        onClick={() => updateQty(idx, qty + 1)}
                        className="h-8 w-7 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-[var(--surface-raised)] transition-colors"
                      >
                        <Plus className="h-3 w-3 text-muted" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--rule-base)] px-5 py-4 space-y-3 bg-[var(--surface-raised)]">
          {/* Estimated total */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-medium">Total estimado</span>
            <span className="text-lg font-extrabold text-primary">S/{estimatedTotal.toFixed(2)}</span>
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-primary/20",
              selectedCount > 0
                ? "bg-primary text-white hover:bg-primary-dark active:scale-[0.98]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
            )}
          >
            <ShoppingCart className="h-4.5 w-4.5" />
            Agregar {selectedCount} producto{selectedCount !== 1 ? "s" : ""} al carrito
          </button>
        </div>
      </div>
    </div>
  );
}
