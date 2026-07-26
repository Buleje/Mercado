"use client";

import { useEffect, useMemo } from "react";
import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Dictionary ────────────────────────────────────────────────────────────────

type Category = {
  name:     string;
  keywords: string[];
  color:    string;
};

const CATEGORIES: Category[] = [
  {
    name:     "Abarrotes",
    keywords: ["arroz", "fideos", "azucar", "azúcar", "harina", "sal", "sopa", "pasta", "lenteja", "menestra", "frijol", "garbanzo", "maiz", "maíz", "avena", "quinua", "trigo"],
    color:    "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
  },
  {
    name:     "Aceites y grasas",
    keywords: ["aceite", "mantequilla", "margarina", "manteca", "grasa", "vegetal"],
    color:    "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
  },
  {
    name:     "Limpieza",
    keywords: ["jabon", "jabón", "detergente", "lejia", "lejía", "cloro", "suavizante", "desinfectante", "limpiador", "escoba", "trapeador", "esponja", "guante", "bolsa basura"],
    color:    "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]",
  },
  {
    name:     "Bebidas",
    keywords: ["gaseosa", "agua", "jugo", "cerveza", "refresco", "néctar", "nectar", "te", "té", "café", "cafe", "cocoa", "milo", "chicha", "bebida", "soda"],
    color:    "bg-[var(--data-info-100)] text-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/30 dark:text-[var(--data-info-500)]",
  },
  {
    name:     "Lacteos",
    keywords: ["leche", "yogurt", "queso", "mantequilla", "lacteo", "lácteo", "yogur", "manjar", "crema"],
    color:    "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  {
    name:     "Golosinas",
    keywords: ["galleta", "chocolate", "caramelo", "chicle", "chupete", "caramelos", "dulce", "bombom", "chifle", "snack", "chips", "wafer"],
    color:    "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function suggest(productName: string): Category | null {
  if (!productName.trim()) return null;
  const normalized = normalize(productName);
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (normalized.includes(normalize(kw))) return cat;
    }
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AutoCategorizerProps {
  productName: string;
  onSuggest:   (category: string) => void;
}

export default function AutoCategorizer({ productName, onSuggest }: AutoCategorizerProps) {
  const match = useMemo(() => suggest(productName), [productName]);

  // Auto-notify parent whenever the suggestion changes
  useEffect(() => {
    if (match) {
      onSuggest(match.name);
    }
    // onSuggest intentionally excluded: stable callbacks only — parent should memoize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  if (!match) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--text-tertiary)]">Categoria sugerida:</span>

      <span
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold",
          match.color
        )}
      >
        {match.name}
      </span>

      <button
        type="button"
        onClick={() => onSuggest(match.name)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-dark transition-colors"
      >
        <Check className="w-3 h-3" />
        Usar
      </button>
    </div>
  );
}
