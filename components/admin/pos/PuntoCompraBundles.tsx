"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Package, Boxes, Plus } from "@buleje/design-system/icons";

interface BundleItemData {
  productId: number;
  name?: string;
  quantity: number;
  unitCost?: number;
}

interface BundleData {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
  active?: boolean;
  items: BundleItemData[];
}

interface Props {
  onAddBundle: (items: { productId: number; name: string; quantity: number; unitCost: number }[]) => void;
}

export default function PuntoCompraBundles({ onAddBundle }: Props) {
  const [bundles, setBundles] = useState<BundleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchBundles() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/bundles?active=true");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        const list: BundleData[] = Array.isArray(data) ? data : data.bundles ?? [];
        if (!cancelled) setBundles(list.filter((b) => b.active !== false));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBundles();
    return () => { cancelled = true; };
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-[var(--surface-sunken)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-6 text-[var(--text-tertiary)] text-xs">
        <Boxes className="h-5 w-5 mx-auto mb-2 opacity-40" />
        <p>Error al cargar paquetes</p>
      </div>
    );
  }

  // Empty state
  if (bundles.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-tertiary)]">
        <Boxes className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs">No hay paquetes activos</p>
        <p className="text-[length:var(--ts-2xs)] mt-1 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          Crea paquetes desde el modulo de Bundles
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-1 max-h-72 overflow-y-auto">
      <div className="flex items-center gap-1.5 mb-2">
        <Boxes className="h-3 w-3 text-[#f97316]" />
        <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
          {bundles.length} paquete{bundles.length !== 1 ? "s" : ""} disponible{bundles.length !== 1 ? "s" : ""}
        </span>
      </div>

      {bundles.map((bundle) => {
        const itemsTotal = bundle.items.reduce(
          (sum, item) => sum + (item.unitCost ?? 0) * item.quantity,
          0,
        );
        const savings = itemsTotal > 0 ? itemsTotal - bundle.price : 0;
        const savingsPct = itemsTotal > 0 ? ((savings / itemsTotal) * 100).toFixed(0) : "0";

        return (
          <div
            key={bundle.id}
            className="p-3 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-white/5 space-y-2"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {bundle.name}
                </p>
                {bundle.description && (
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                    {bundle.description}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold font-mono text-[#00B4A6]">
                  S/{bundle.price.toFixed(2)}
                </p>
                {savings > 0 && (
                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-success)] dark:text-[var(--data-success)] font-medium">
                    Ahorra {savingsPct}%
                  </p>
                )}
              </div>
            </div>

            {/* Items list */}
            <div className="flex flex-wrap gap-1">
              {bundle.items.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-md px-1.5 py-0.5 text-[var(--text-secondary)]"
                >
                  <Package className="h-2.5 w-2.5 shrink-0 opacity-50" />
                  {item.name ?? `#${item.productId}`}
                  {item.quantity > 1 && (
                    <span className="font-bold text-[var(--text-primary)]">
                      x{item.quantity}
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={() =>
                onAddBundle(
                  bundle.items.map((item) => ({
                    productId: item.productId,
                    name: item.name ?? `Producto #${item.productId}`,
                    quantity: item.quantity,
                    unitCost: item.unitCost ?? 0,
                  })),
                )
              }
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                "bg-[#f97316] hover:bg-[#e8954f] text-white",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316]",
              )}
            >
              <Plus className="h-3 w-3" />
              Agregar todo
            </button>
          </div>
        );
      })}
    </div>
  );
}
