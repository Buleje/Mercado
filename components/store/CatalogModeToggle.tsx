"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * Toggle to show/hide prices in the store (catalog mode).
 * Useful for wholesale clients who prefer "Consultar precio".
 * Stores preference in localStorage.
 */
export function useCatalogMode() {
  const [hidePrices, setHidePrices] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("catalog-mode");
    if (stored === "true") setHidePrices(true);
  }, []);

  const toggle = () => {
    const next = !hidePrices;
    setHidePrices(next);
    localStorage.setItem("catalog-mode", String(next));
  };

  return { hidePrices, toggle };
}

interface CatalogModeToggleProps {
  hidePrices: boolean;
  onToggle: () => void;
  className?: string;
}

export function CatalogModeToggle({ hidePrices, onToggle, className }: CatalogModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
        hidePrices
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-gray-100 text-gray-600 dark:bg-surface dark:text-muted hover:bg-gray-200",
        className
      )}
      title={hidePrices ? "Mostrar precios" : "Ocultar precios (modo catálogo)"}
    >
      {hidePrices ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {hidePrices ? "Precios ocultos" : "Modo catalogo"}
    </button>
  );
}

interface PriceDisplayProps {
  price: number;
  hidePrices: boolean;
  className?: string;
}

export function PriceDisplay({ price, hidePrices, className }: PriceDisplayProps) {
  if (hidePrices) {
    return (
      <span className={cn("text-sm font-bold text-primary", className)}>
        Consultar precio
      </span>
    );
  }
  return (
    <span className={cn("text-sm font-extrabold text-primary", className)}>
      S/{price.toFixed(2)}
    </span>
  );
}
