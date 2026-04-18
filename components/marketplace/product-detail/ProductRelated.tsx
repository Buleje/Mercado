"use client";

/**
 * ProductRelated — "También te puede interesar".
 * Grid de 4 productos relacionados usando UnifiedProductCard.
 * Recibe productos del Server Component (misma categoría o tienda).
 */

import Link from "next/link";
import { Kicker, SectionTitle } from "@buleje/design-system";
import UnifiedProductCard, { type UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface RelatedProduct {
  id: number;
  name: string;
  price: number;
  originalPrice?: number;
  image?: string | null;
  storeName?: string;
  storeSlug?: string;
  storeId?: string;
  storeProductId?: string;
  unit?: string | null;
  category?: string;
  stock?: number;
}

export interface ProductRelatedProps {
  products: RelatedProduct[];
  storeSlug: string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function ProductRelated({ products, storeSlug }: ProductRelatedProps) {
  if (products.length === 0) return null;

  return (
    <section aria-label="Productos relacionados" className="space-y-4">
      <div>
        <Kicker as="p">Clientes también compraron</Kicker>
        <SectionTitle as="h2">También te puede interesar</SectionTitle>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {products.map((product, index) => {
          const cardProduct: UnifiedProductCardProduct = {
            id: product.id,
            name: product.name,
            price: product.price,
            originalPrice: product.originalPrice,
            image: product.image,
            storeName: product.storeName,
            storeSlug: product.storeSlug,
            storeId: product.storeId,
            storeProductId: product.storeProductId,
            unit: product.unit,
            category: product.category,
            stock: product.stock,
          };
          return (
            <UnifiedProductCard
              key={product.id}
              product={cardProduct}
              index={index}
              href={
                product.storeSlug
                  ? `/marketplace/${product.storeSlug}/producto/${product.id}`
                  : `/marketplace/${storeSlug}/producto/${product.id}`
              }
            />
          );
        })}
      </div>
    </section>
  );
}
