"use client";

import { cn } from "@/lib/utils";

interface Variant {
  id: string;
  name: string;
  sku?: string | null;
  priceModifier: number;
  stock?: number | null;
  attributesJson?: string | null;
}

interface ProductVariantSelectorProps {
  variants: Variant[];
  basePrice: number;
  selectedVariantId?: string;
  onSelect: (variantId: string, finalPrice: number) => void;
}

function parseAttributes(json?: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProductVariantSelector({
  variants,
  basePrice,
  selectedVariantId,
  onSelect,
}: ProductVariantSelectorProps) {
  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === selectedVariantId);
  const finalPrice = selected ? basePrice + selected.priceModifier : null;

  // Detectar tipo de render por atributos de la primera variante con datos
  const firstAttrs = parseAttributes(variants.find((v) => v.attributesJson)?.attributesJson);
  const renderMode: "color" | "size" | "pill" =
    "color" in firstAttrs ? "color" : "size" in firstAttrs ? "size" : "pill";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const attrs = parseAttributes(variant.attributesJson);
          const isSelected = variant.id === selectedVariantId;
          const isOutOfStock = variant.stock !== undefined && variant.stock !== null && variant.stock <= 0;
          const finalVariantPrice = basePrice + variant.priceModifier;

          if (renderMode === "color" && attrs.color) {
            return (
              <button
                key={variant.id}
                disabled={isOutOfStock}
                onClick={() => !isOutOfStock && onSelect(variant.id, finalVariantPrice)}
                title={isOutOfStock ? `${variant.name} — Agotado` : variant.name}
                aria-label={`${variant.name}${isOutOfStock ? " — Agotado" : ""}`}
                className={cn(
                  "relative h-8 w-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95",
                  isSelected
                    ? "border-[#00B4A6] scale-110 shadow-md shadow-[#00B4A6]/30"
                    : "border-gray-300 dark:border-gray-600",
                  isOutOfStock && "opacity-40 cursor-not-allowed"
                )}
                style={{ backgroundColor: attrs.color }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-white shadow" />
                  </span>
                )}
              </button>
            );
          }

          if (renderMode === "size" && attrs.size) {
            return (
              <button
                key={variant.id}
                disabled={isOutOfStock}
                onClick={() => !isOutOfStock && onSelect(variant.id, finalVariantPrice)}
                aria-label={`Talla ${attrs.size}${isOutOfStock ? " — Agotado" : ""}`}
                className={cn(
                  "relative flex h-11 min-w-11 items-center justify-center rounded-lg border-2 px-2 text-sm font-bold transition-all",
                  isSelected
                    ? "border-[#00B4A6] bg-[#00B4A6]/10 text-[#00B4A6]"
                    : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#00B4A6]/50",
                  isOutOfStock && "opacity-50 cursor-not-allowed line-through"
                )}
              >
                {attrs.size}
                {isOutOfStock && (
                  <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold bg-red-500 text-white px-1 rounded-full leading-4">
                    X
                  </span>
                )}
              </button>
            );
          }

          // Default: pill
          return (
            <button
              key={variant.id}
              disabled={isOutOfStock}
              onClick={() => !isOutOfStock && onSelect(variant.id, finalVariantPrice)}
              aria-label={`${variant.name}${isOutOfStock ? " — Agotado" : ""}`}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-all min-h-[44px]",
                isSelected
                  ? "border-[#00B4A6] bg-[#00B4A6]/10 text-[#00B4A6]"
                  : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#00B4A6]/50",
                isOutOfStock && "opacity-50 cursor-not-allowed"
              )}
            >
              {variant.name}
              {isOutOfStock && (
                <span className="ml-1 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                  Agotado
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Precio final de la variante seleccionada */}
      {selected && finalPrice !== null && (
        <p className="text-sm font-semibold text-[#00B4A6]">
          Precio:{" "}
          <span className="text-lg font-black">{fmt(finalPrice)}</span>
          {selected.priceModifier !== 0 && (
            <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400 font-normal">
              ({selected.priceModifier > 0 ? "+" : ""}
              {fmt(selected.priceModifier)} vs. base)
            </span>
          )}
        </p>
      )}
    </div>
  );
}
