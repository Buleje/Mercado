"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Package } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

interface POSSearchProduct {
  id: number;
  name: string;
  price: number;
  image?: string;
  barcode?: string;
  stock?: number;
  previousPrice?: number;
  updatedAt?: string;
}

interface POSSearchBarProps {
  products: POSSearchProduct[];
  onAddToCart: (productId: number) => void;
  recentProductIds: number[];
}

// ── Fuzzy match ────────────────────────────────────────────────────────

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Stock badge color ──────────────────────────────────────────────────

type Product = POSSearchProduct;

function stockBadge(stock: number | undefined) {
  if (stock == null) return null;
  if (stock <= 0)
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-muted">
        Sin stock
      </span>
    );
  if (stock <= 2)
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-500">
        {stock}
      </span>
    );
  if (stock <= 10)
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-500">
        {stock}
      </span>
    );
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500">
      {stock}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export default function POSSearchBar({
  products,
  onAddToCart,
  recentProductIds,
}: POSSearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [highlightFirst, setHighlightFirst] = useState(false);
  // Snapshot "now" once per mount — React Compiler rejects impure Date.now() during render
  const [nowTs] = useState(() => Date.now());
  const prevResultCountRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce 150ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Determine if barcode search (8+ digit number)
  const isBarcodeQuery = /^\d{8,}$/.test(debouncedQuery.trim());

  const results = debouncedQuery.trim()
    ? products
        .filter((p) => {
          if (isBarcodeQuery) return p.barcode === debouncedQuery.trim();
          return (
            p.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            fuzzyMatch(debouncedQuery, p.name) ||
            p.barcode?.includes(debouncedQuery)
          );
        })
        .slice(0, 8)
    : [];

  // Highlight first result for 1 second when new results appear
  useEffect(() => {
    if (results.length > 0 && prevResultCountRef.current === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate timed UI flash: highlightFirst is a transient visual effect (1s) driven by a transition (empty → populated results), not derivable during render
      setHighlightFirst(true);
      const timer = setTimeout(() => setHighlightFirst(false), 1000);
      return () => clearTimeout(timer);
    }
    if (results.length === 0) setHighlightFirst(false);
    prevResultCountRef.current = results.length;
  }, [results.length]);

  const handleAdd = useCallback(
    (product: Product) => {
      if (product.stock != null && product.stock <= 0) {
        // Toast-like warning via a simple alert substitute
        return;
      }
      onAddToCart(product.id);
      setQuery("");
      setShowResults(false);
    },
    [onAddToCart]
  );

  // Recent products chips
  const recentProducts = recentProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, 8) as Product[];

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-muted" />
        <input
          data-pos-search
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder="Buscar producto, código de barras..."
          aria-label="Buscar productos"
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-primary transition-colors"
          autoComplete="off"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-muted px-1.5 py-0.5 rounded font-mono">
          F1
        </kbd>
      </div>

      {/* Search results dropdown */}
      {showResults && debouncedQuery.trim() && (
        <div className="absolute z-30 left-0 right-0 mx-3 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-muted">
              <Package className="h-5 w-5 mb-1" />
              <p className="text-xs">No se encontraron productos</p>
            </div>
          ) : (
            results.map((p, idx) => {
              const outOfStock = p.stock != null && p.stock <= 0;
              const isFirstHighlight = idx === 0 && highlightFirst;
              return (
                <button
                  key={p.id}
                  onClick={() => handleAdd(p)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-surface transition-colors text-left border-b border-gray-50 dark:border-card-border last:border-0",
                    outOfStock && "opacity-50",
                    isFirstHighlight && "ring-2 ring-[#00B4A6] bg-[#00B4A6]/5"
                  )}
                >
                  <div className="h-10 w-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-surface shrink-0 relative">
                    {p.image ? (
                      <Image
                        src={p.image}
                        alt={p.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Package className="h-4 w-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-foreground truncate">
                      {p.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-primary">
                        S/ {p.price.toFixed(2)}
                      </p>
                      {p.previousPrice && p.previousPrice !== p.price && (
                        <span className="text-[10px] text-gray-400 line-through">
                          S/{p.previousPrice.toFixed(2)}
                        </span>
                      )}
                      {p.updatedAt && (nowTs - new Date(p.updatedAt).getTime()) < 7 * 86400000 && p.previousPrice && p.previousPrice !== p.price && (
                        <span className="text-[9px] font-bold text-white bg-[#f97316] px-1 py-0.5 rounded">
                          Nuevo precio
                        </span>
                      )}
                    </div>
                  </div>
                  {stockBadge(p.stock)}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Recent chips */}
      {recentProducts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recentProducts.map((p) => {
            const outOfStock = p.stock != null && p.stock <= 0;
            return (
              <button
                key={p.id}
                onClick={() => handleAdd(p)}
                disabled={outOfStock}
                className={cn(
                  "shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1",
                  outOfStock
                    ? "bg-gray-100 dark:bg-surface text-gray-400 cursor-not-allowed"
                    : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/30"
                )}
              >
                <span className="truncate max-w-20">{p.name}</span>
                <span className="font-bold text-primary">S/{p.price.toFixed(2)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
