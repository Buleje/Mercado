"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { RotateCw, TrendingUp, Package } from "lucide-react";

interface FrequentItem {
  productId: number;
  name: string;
  frequency: number;
  avgQuantity: number;
  avgCost: number;
}

interface Props {
  onAddToCart: (productId: number, quantity: number) => void;
}

export default function PuntoCompraFrequentItems({ onAddToCart }: Props) {
  const [items, setItems] = useState<FrequentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchFrequent() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/purchases/frequent-items");
        if (!res.ok) throw new Error("fetch failed");
        const data: FrequentItem[] = await res.json();
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFrequent();
    return () => { cancelled = true; };
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-6 text-gray-400 text-xs">
        <RotateCw className="h-5 w-5 mx-auto mb-2 opacity-40" />
        <p>Error al cargar frecuentes</p>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs">No hay historial de compras aun</p>
        <p className="text-[10px] mt-1 text-gray-300 dark:text-gray-600">
          Los productos frecuentes apareceran despues de crear ordenes de compra
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-1 max-h-72 overflow-y-auto">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp className="h-3 w-3 text-[#00B4A6]" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Top {items.length} productos (90 dias)
        </span>
      </div>

      {items.map((item) => (
        <button
          key={item.productId}
          type="button"
          onClick={() => onAddToCart(item.productId, item.avgQuantity)}
          className={cn(
            "w-full flex items-center gap-2 p-2 rounded-xl text-left transition-colors",
            "bg-gray-50 dark:bg-white/5 hover:bg-[#00B4A6]/10 dark:hover:bg-[#00B4A6]/20",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
          )}
        >
          {/* Frequency badge */}
          <span className="shrink-0 h-7 w-7 rounded-lg bg-[#00B4A6]/10 text-[#00B4A6] flex items-center justify-center text-[10px] font-bold">
            {item.frequency}x
          </span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
              {item.name}
            </p>
            <p className="text-[10px] text-gray-400">
              ~{item.avgQuantity} uds · S/{item.avgCost.toFixed(2)} c/u
            </p>
          </div>

          {/* Add hint */}
          <span className="shrink-0 text-[10px] text-[#00B4A6] font-medium opacity-0 group-hover:opacity-100">
            + {item.avgQuantity}
          </span>
        </button>
      ))}
    </div>
  );
}
