"use client";

import { useEffect, useMemo } from "react";
import { Check } from "lucide-react";
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
    color:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  {
    name:     "Aceites y grasas",
    keywords: ["aceite", "mantequilla", "margarina", "manteca", "grasa", "vegetal"],
    color:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  {
    name:     "Limpieza",
    keywords: ["jabon", "jabón", "detergente", "lejia", "lejía", "cloro", "suavizante", "desinfectante", "limpiador", "escoba", "trapeador", "esponja", "guante", "bolsa basura"],
    color:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  {
    name:     "Bebidas",
    keywords: ["gaseosa", "agua", "jugo", "cerveza", "refresco", "néctar", "nectar", "te", "té", "café", "cafe", "cocoa", "milo", "chicha", "bebida", "soda"],
    color:    "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  },
  {
    name:     "Lacteos",
    keywords: ["leche", "yogurt", "queso", "mantequilla", "lacteo", "lácteo", "yogur", "manjar", "crema"],
    color:    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  },
  {
    name:     "Golosinas",
    keywords: ["galleta", "chocolate", "caramelo", "chicle", "chupete", "caramelos", "dulce", "bombom", "chifle", "snack", "chips", "wafer"],
    color:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
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
      <span className="text-xs text-gray-500 dark:text-gray-400">Categoria sugerida:</span>

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
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#00B4A6] text-white hover:bg-[#245a41] transition-colors"
      >
        <Check className="w-3 h-3" />
        Usar
      </button>
    </div>
  );
}
