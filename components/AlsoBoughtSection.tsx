"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Plus, ShoppingCart, TrendingUp, Loader2 } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SuggestedProduct {
  id: number;
  name: string;
  price: number;
  unit?: string;
  image?: string;
  reason?: string;
}

interface AlsoBoughtSectionProps {
  productId: number;
  productName: string;
  className?: string;
}

// ── Local heuristics (fallback when no API data) ──────────────────────────────

const PAIRINGS: Record<string, string[]> = {
  arroz: ["aceite", "sal", "frejoles", "azucar"],
  aceite: ["arroz", "sal", "vinagre"],
  leche: ["azucar", "café", "avena"],
  pan: ["mantequilla", "mermelada", "leche"],
  pollo: ["arroz", "aceite", "sal", "limon"],
  carne: ["sal", "aceite", "papa"],
  papa: ["aceite", "sal", "cebolla"],
  azucar: ["leche", "café", "harina"],
  fideos: ["aceite", "sal", "tomate"],
  café: ["azucar", "leche"],
  cerveza: ["hielo", "galletas"],
  gaseosa: ["galletas", "pan"],
  huevos: ["aceite", "pan", "sal"],
  atun: ["arroz", "mayonesa", "limon"],
  harina: ["azucar", "huevos", "leche"],
};

function getLocalSuggestions(productName: string): string[] {
  const name = productName.toLowerCase();
  for (const [key, pairs] of Object.entries(PAIRINGS)) {
    if (name.includes(key)) return pairs.slice(0, 4);
  }
  return [];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AlsoBoughtSection({
  productId,
  productName,
  className,
}: AlsoBoughtSectionProps) {
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [suggestions, setSuggestions] = useState<SuggestedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchSuggestions = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);

    try {
      // Try API first
      const res = await fetch(`/api/products/co-purchased?ids=${productId}`);
      if (res.ok) {
        const data = await res.json();
        const fetched: SuggestedProduct[] = Array.isArray(data)
          ? data
          : data.suggestions ?? [];
        if (fetched.length > 0) {
          setSuggestions(fetched.filter((s) => s.id !== productId).slice(0, 4));
          setLoading(false);
          return;
        }
      }
    } catch {
      // fall through to local heuristics
    }

    // Local fallback
    const localNames = getLocalSuggestions(productName);
    if (localNames.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.all(
        localNames.map(async (name) => {
          const res = await fetch(
            `/api/products?search=${encodeURIComponent(name)}&limit=1`,
          );
          if (!res.ok) return null;
          const data = await res.json();
          const list = Array.isArray(data)
            ? data
            : data.data ?? data.products ?? [];
          if (!list[0] || list[0].id === productId) return null;
          return {
            ...list[0],
            reason: `Lo llevan con ${productName}`,
          } as SuggestedProduct;
        }),
      );
      setSuggestions(
        (results.filter(Boolean) as SuggestedProduct[]).slice(0, 4),
      );
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [productId, productName]);

  useEffect(() => {
    fetchedRef.current = false;
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAdd = (product: SuggestedProduct) => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image ?? "",
      unit: product.unit ?? "und",
      category: "",
    });
    showToast(product.name, product.image ?? "");
  };

  if (loading) {
    return (
      <div className={cn("mt-12 lg:mt-16", className)}>
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            Compran juntos
          </h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className={cn("mt-12 lg:mt-16", className)}>
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
          Compran juntos
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {suggestions.map((product) => (
          <div
            key={product.id}
            className="group bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden hover:shadow-[var(--shadow-lg)] transition-all"
          >
            <div className="relative aspect-square bg-gray-50 dark:bg-surface">
              {product.image && (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-base)]"
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-primary transition-colors">
                {product.name}
              </p>
              {product.reason && (
                <p className="text-[length:var(--ts-2xs)] text-muted mt-0.5 line-clamp-1">
                  {product.reason}
                </p>
              )}
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-extrabold text-primary text-sm">
                  S/{Number(product.price).toFixed(2)}
                </span>
                <button
                  onClick={() => handleAdd(product)}
                  className="flex items-center gap-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-xs font-semibold transition-colors"
                  aria-label={`Agregar ${product.name} al carrito`}
                >
                  <Plus className="h-3 w-3" />
                  <ShoppingCart className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
