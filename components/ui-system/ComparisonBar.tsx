"use client";

/**
 * ComparisonBar — Barra flotante para comparar 2-4 productos.
 *
 * Al click en "Comparar" en un ProductCard, el item se agrega a esta barra.
 * Cuando hay 2+ items, el user puede abrir la tabla comparativa.
 *
 * Sticky abajo en desktop, slide-up en mobile. Se oculta si no hay items.
 *
 * Uso:
 *   const [items, setItems] = useState<CompareItem[]>([]);
 *   <ComparisonBar
 *     items={items}
 *     onRemove={(id) => setItems(items.filter(i => i.id !== id))}
 *     onCompare={() => router.push(`/comparar?ids=${ids}`)}
 *     onClear={() => setItems([])}
 *   />
 */

import Image from "next/image";
import { X, BarChart3, ShoppingCart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface CompareItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  storeName: string;
}

interface Props {
  items: CompareItem[];
  onRemove: (id: string) => void;
  onCompare: () => void;
  onClear: () => void;
  maxItems?: number;
  className?: string;
}

export default function ComparisonBar({
  items,
  onRemove,
  onCompare,
  onClear,
  maxItems = 4,
  className,
}: Props) {
  if (items.length === 0) return null;

  const canCompare = items.length >= 2;
  const slots = Array.from({ length: maxItems }).map((_, i) => items[i] ?? null);

  return (
    <div
      role="region"
      aria-label="Comparador de productos"
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-3xl",
        "rounded-2xl bg-[var(--surface-raised)] shadow-2xl border border-[var(--rule-base)]",
        "motion-safe:animate-[slideUp_0.3s_cubic-bezier(0.32,0.72,0,1)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 p-3">
        {/* Slots */}
        <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
          {slots.map((item, i) => (
            <CompareSlot
              key={item?.id ?? `empty-${i}`}
              item={item}
              onRemove={item ? () => onRemove(item.id) : undefined}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onClear}
            aria-label="Vaciar comparador"
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onCompare}
            disabled={!canCompare}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold transition-all",
              canCompare
                ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Comparar ({items.length})
          </button>
        </div>
      </div>
    </div>
  );
}

function CompareSlot({ item, onRemove }: { item: CompareItem | null; onRemove?: () => void }) {
  if (!item) {
    return (
      <div
        aria-hidden
        className="shrink-0 h-14 w-14 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-tertiary)]"
      >
        <ShoppingCart className="h-4 w-4 opacity-40" strokeWidth={1.5} aria-hidden />
      </div>
    );
  }
  return (
    <div className="shrink-0 relative group">
      <div className="h-14 w-14 rounded-xl bg-[var(--surface-sunken)] overflow-hidden border border-[var(--rule-base)]">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
            <ShoppingCart className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${item.name}`}
        className={cn(
          "absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[var(--data-error,_#e11d48)] text-white",
          "inline-flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity",
          "focus:opacity-100",
        )}
      >
        <X className="h-3 w-3" strokeWidth={3} aria-hidden />
      </button>
      <p className="sr-only">
        {item.name} — S/{Number(item.price).toFixed(2)} · {item.storeName}
      </p>
    </div>
  );
}
