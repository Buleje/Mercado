"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";

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

// Atributos parseados del JSON. Soporta:
//  - Schema legacy:  { color: "#fff", size: "M" }
//  - Schema admin:   { attr: "M", image: "data:..." }
function parseAttributes(json?: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

// Si el atributo parece un color hex/rgb → render swatch.
// Si parece talla corta o tamaño líquido → render size pill.
// Si no, render pill con el nombre.
function classifyAttr(value: string): "color" | "size" | "pill" {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v)) return "color";
  if (/^(xs|s|m|l|xl|xxl|3xl|4xl)$/i.test(v)) return "size";
  if (/^\d+(\.\d+)?\s*(ml|l|g|kg|oz|cm|mm|in)$/i.test(v)) return "size";
  if (/^[a-z]+$/i.test(v) && v.length <= 4) return "size";
  return "pill";
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
  const selectedAttrs = selected ? parseAttributes(selected.attributesJson) : {};
  const selectedImage = selectedAttrs.image ?? null;

  // Detect render mode usando la primera variante con atributos.
  const firstWithAttrs = variants.find((v) => v.attributesJson);
  const firstAttrs = parseAttributes(firstWithAttrs?.attributesJson);
  let renderMode: "color" | "size" | "pill" = "pill";
  if (firstAttrs.color) renderMode = "color";
  else if (firstAttrs.size) renderMode = "size";
  else if (firstAttrs.attr) renderMode = classifyAttr(firstAttrs.attr);

  // Detect si alguna variante tiene imagen — si sí, prepend thumbnails strip.
  const variantsWithImages = variants.filter((v) => parseAttributes(v.attributesJson).image);
  const showImageStrip = variantsWithImages.length >= 2;

  return (
    <div className="space-y-3">
      {/* Strip de thumbnails si hay imágenes en las variantes */}
      {showImageStrip && (
        <div className="flex flex-wrap gap-2 -mx-1 px-1 pb-1">
          {variants.map((variant) => {
            const attrs = parseAttributes(variant.attributesJson);
            if (!attrs.image) return null;
            const isSelected = variant.id === selectedVariantId;
            const isOutOfStock = variant.stock !== undefined && variant.stock !== null && variant.stock <= 0;
            return (
              <button
                key={`thumb-${variant.id}`}
                disabled={isOutOfStock}
                onClick={() => !isOutOfStock && onSelect(variant.id, basePrice + variant.priceModifier)}
                title={`${variant.name}${isOutOfStock ? " — Agotado" : ""}`}
                aria-label={variant.name}
                className={cn(
                  "relative h-16 w-16 rounded-xl overflow-hidden border-2 transition-all shrink-0",
                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40",
                  isOutOfStock && "opacity-40 cursor-not-allowed"
                )}
              >
                <Image
                  src={attrs.image}
                  alt={variant.name}
                  fill
                  unoptimized={attrs.image.startsWith("data:")}
                  className="object-cover"
                  sizes="64px"
                />
                {isOutOfStock && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-white text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider">Agotado</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const attrs = parseAttributes(variant.attributesJson);
          const isSelected = variant.id === selectedVariantId;
          const isOutOfStock = variant.stock !== undefined && variant.stock !== null && variant.stock <= 0;
          const finalVariantPrice = basePrice + variant.priceModifier;

          if (renderMode === "color" && (attrs.color || (attrs.attr && /^#[0-9a-f]{3,8}$/i.test(attrs.attr.trim())))) {
            const colorValue = attrs.color ?? attrs.attr;
            return (
              <button
                key={variant.id}
                disabled={isOutOfStock}
                onClick={() => !isOutOfStock && onSelect(variant.id, finalVariantPrice)}
                title={isOutOfStock ? `${variant.name} — Agotado` : variant.name}
                aria-label={`${variant.name}${isOutOfStock ? " — Agotado" : ""}`}
                className={cn(
                  "relative h-9 w-9 rounded-full border-2 transition-all hover:scale-110 active:scale-95",
                  isSelected ? "border-primary scale-110 shadow-md shadow-primary/30" : "border-gray-300 dark:border-gray-600",
                  isOutOfStock && "opacity-40 cursor-not-allowed"
                )}
                style={{ backgroundColor: colorValue }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-2 w-2 rounded-full bg-white shadow" />
                  </span>
                )}
              </button>
            );
          }

          if (renderMode === "size" && (attrs.size || attrs.attr)) {
            const sizeValue = attrs.size ?? attrs.attr ?? variant.name;
            return (
              <button
                key={variant.id}
                disabled={isOutOfStock}
                onClick={() => !isOutOfStock && onSelect(variant.id, finalVariantPrice)}
                aria-label={`${variant.name}${isOutOfStock ? " — Agotado" : ""}`}
                className={cn(
                  "relative flex h-11 min-w-12 items-center justify-center rounded-lg border-2 px-3 text-sm font-bold transition-all",
                  isSelected ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-primary/40",
                  isOutOfStock && "opacity-50 cursor-not-allowed line-through"
                )}
              >
                {sizeValue}
                {isOutOfStock && (
                  <span className="absolute -top-1.5 -right-1.5 text-[length:var(--ts-2xs)] font-bold bg-[var(--data-error-500)] text-white px-1 rounded-full leading-4">
                    X
                  </span>
                )}
              </button>
            );
          }

          // Default: pill con nombre. Si hay imagen, mostrar thumb a la izquierda.
          const pillImage = attrs.image;
          return (
            <button
              key={variant.id}
              disabled={isOutOfStock}
              onClick={() => !isOutOfStock && onSelect(variant.id, finalVariantPrice)}
              aria-label={`${variant.name}${isOutOfStock ? " — Agotado" : ""}`}
              className={cn(
                "relative inline-flex items-center gap-2 rounded-full border-2 pl-1 pr-3.5 py-1 text-sm font-semibold transition-all min-h-[44px]",
                !pillImage && "px-4 py-2",
                isSelected ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-primary/40",
                isOutOfStock && "opacity-50 cursor-not-allowed"
              )}
            >
              {pillImage && (
                <span className="relative h-8 w-8 rounded-full overflow-hidden bg-[var(--surface-sunken)] shrink-0">
                  <Image src={pillImage} alt="" fill unoptimized={pillImage.startsWith("data:")} className="object-cover" sizes="32px" />
                </span>
              )}
              <span>{variant.name}</span>
              {isOutOfStock && (
                <span className="ml-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30 px-1.5 py-0.5 rounded-full">
                  Agotado
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Imagen grande de la variante seleccionada (si tiene foto propia) */}
      {selectedImage && (
        <div className="relative w-full max-w-xs aspect-square rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] dark:bg-surface">
          <Image src={selectedImage} alt={selected?.name ?? ""} fill unoptimized={selectedImage.startsWith("data:")} className="object-cover" sizes="320px" />
        </div>
      )}

      {/* Precio final de la variante seleccionada */}
      {selected && finalPrice !== null && (
        <p className="text-sm font-semibold text-primary">
          Precio:{" "}
          <span className="text-lg font-extrabold">{fmt(finalPrice)}</span>
          {selected.priceModifier !== 0 && (
            <span className="ml-1.5 text-xs text-[var(--text-tertiary)] dark:text-muted font-normal">
              ({selected.priceModifier > 0 ? "+" : ""}
              {fmt(selected.priceModifier)} vs. base)
            </span>
          )}
        </p>
      )}
    </div>
  );
}
