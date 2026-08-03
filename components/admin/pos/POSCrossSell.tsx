"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Lightbulb, Plus, X } from "@buleje/design-system/icons";

interface Suggestion {
  id: number;
  name: string;
  price: number;
  unit: string;
}

interface POSCrossSellProps {
  cartProductIds: number[];
  onAddToCart: (productId: number) => void;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

export default function POSCrossSell({
  cartProductIds,
  onAddToCart,
}: POSCrossSellProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissedIdsRef = useRef<Set<number>>(new Set());
  const lastFetchedIdsRef = useRef<string>("");

  const fetchSuggestion = useCallback(async () => {
    if (cartProductIds.length === 0) {
      setSuggestion(null);
      return;
    }

    const idsKey = cartProductIds.sort().join(",");
    if (idsKey === lastFetchedIdsRef.current) return;
    lastFetchedIdsRef.current = idsKey;

    try {
      const res = await fetch(
        `/api/products/co-purchased?ids=${idsKey}&limit=5`
      );
      const data: Suggestion[] = await res.json();
      if (!Array.isArray(data)) return;

      // Filter out already in cart + already dismissed this session
      const viable = data.find(
        (p) =>
          !cartProductIds.includes(p.id) && !dismissedIdsRef.current.has(p.id)
      );
      setSuggestion(viable || null);
      setDismissed(false);
    } catch {
      setSuggestion(null);
    }
  }, [cartProductIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchSuggestion();
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchSuggestion]);

  const handleDismiss = useCallback(() => {
    if (suggestion) {
      dismissedIdsRef.current.add(suggestion.id);
    }
    setDismissed(true);
    setSuggestion(null);
  }, [suggestion]);

  const handleAdd = useCallback(() => {
    if (!suggestion) return;
    onAddToCart(suggestion.id);
    dismissedIdsRef.current.add(suggestion.id);
    setSuggestion(null);
  }, [suggestion, onAddToCart]);

  if (!suggestion || dismissed) return null;

  return (
    <div className="mx-3 mb-1 flex items-center gap-2 p-2 bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-lg">
      <Lightbulb className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted">
          Clientes tambien llevan{" "}
          <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {suggestion.name}
          </span>{" "}
          ({fmt(suggestion.price)})
        </p>
      </div>
      <button
        onClick={handleAdd}
        className="shrink-0 flex items-center gap-0.5 text-[length:var(--ts-xs)] font-bold text-primary hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar
      </button>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
