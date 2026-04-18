"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { X, Search, Plus, Loader2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompareProduct } from "@/contexts/compare-context";

type SearchItem = {
  id: string;
  retailPrice: number;
  minOrderQty: number;
  product: {
    id: number;
    name: string;
    image: string | null;
    category: string;
    unit: string | null;
    stock: number | null;
  };
  store: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    zone: string | null;
    rating: number;
  };
};

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (p: CompareProduct) => void;
  excludeIds: number[];
  disabled: boolean; // true cuando ya se alcanzó MAX
}

export default function ProductPickerModal({
  open,
  onClose,
  onPick,
  excludeIds,
  disabled,
}: ProductPickerModalProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/marketplace/search?q=${encodeURIComponent(q)}`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((json) => {
          const arr: SearchItem[] = Array.isArray(json?.data) ? json.data : [];
          setItems(arr.slice(0, 24));
        })
        .catch(() => {
          /* cancel or error */
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  const handlePick = useCallback(
    (it: SearchItem) => {
      const p: CompareProduct = {
        id: it.product.id,
        name: it.product.name,
        category: it.product.category,
        price: it.retailPrice,
        image: it.product.image ?? "",
        unit: it.product.unit ?? "",
        stock: it.product.stock ?? undefined,
        storeSlug: it.store.slug,
        storeName: it.store.name,
      };
      onPick(p);
    },
    [onPick],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2
            id="picker-title"
            className="text-lg font-bold text-gray-900 dark:text-white"
          >
            Agregar producto a comparar
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {disabled && (
          <div className="px-5 py-3 text-sm bg-warning/10 text-warning border-b border-warning/20">
            Ya llegaste al máximo. Quita uno para agregar otro.
          </div>
        )}

        {/* Search input */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Buscar por nombre, marca, categoría..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={disabled}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition disabled:opacity-50"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Escribe al menos 1 letra para ver resultados del marketplace.
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {query.trim().length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Escribe para buscar productos disponibles en el marketplace.
            </div>
          ) : items.length === 0 && !loading ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No encontramos productos para &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map((it) => {
                const already = excludeIds.includes(it.product.id);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => !already && handlePick(it)}
                      disabled={already || disabled}
                      className={cn(
                        "w-full flex items-center gap-3 px-5 py-3 text-left transition-colors",
                        already || disabled
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800",
                      )}
                    >
                      <div className="relative h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                        {it.product.image ? (
                          <Image
                            src={it.product.image}
                            alt={it.product.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-gray-400">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
                          {it.product.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                          {it.store.name} · {it.product.category}
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-primary">
                          S/ {it.retailPrice.toFixed(2)}
                          {it.product.unit && (
                            <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                              / {it.product.unit}
                            </span>
                          )}
                        </p>
                      </div>
                      {already ? (
                        <span className="text-xs font-medium text-gray-400 shrink-0">
                          Ya agregado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
                          <Plus className="h-3.5 w-3.5" />
                          Agregar
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
