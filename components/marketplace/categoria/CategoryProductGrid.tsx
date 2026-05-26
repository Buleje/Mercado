"use client";

/**
 * CategoryProductGrid — grid de productos de la categoria.
 *
 * Ola 7: migrado al primitivo ProductCardGrid del DS. El primitivo
 * garantiza consistencia visual (border, hover, badge, precio) con el
 * resto del marketplace. Container expandido a max-w-[1600px] por pedido
 * del user ("las secciones seran mas amplias abarcando todo el ancho").
 *
 * Cards ahora tienen botón "Agregar al carrito" que usa `useMarketplaceCart`
 * (click directo en la card sin abrir drawer — mismo UX que Explorar).
 *
 * Grid responsivo: 2 col mobile / 3 tablet / 4 desktop / 5 xl.
 * Cuando no hay resultados: EmptyState con CanastaVacia + CTA reset.
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ProductCardGrid } from "@buleje/design-system";
import { toProductCardShape } from "@/lib/marketplace/product-adapter";
import type {
  CatalogProduct,
  CategoriaDef,
} from "@/lib/constants/marketplace-categories";
import { CanastaVacia } from "@/components/ui-system/illustrations";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCartQuantityMap } from "@/hooks/use-cart-quantity-map";
import { useAddedToCartDrawer } from "@/components/marketplace/AddedToCartDrawer";
import ProductQuickView from "@/components/marketplace/ProductQuickView";

interface CategoryProductGridProps {
  products: CatalogProduct[];
  categoria: CategoriaDef;
}

// Renderer Next/Image inyectado al primitivo del DS para optimizacion.
function nextImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
      unoptimized={src.startsWith("data:")}
    />
  );
}

function EmptyState({ categoria }: { categoria: CategoriaDef }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
      <div className="text-gray-400 dark:text-gray-600 mb-6">
        <CanastaVacia size={140} strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-white">
        Sin productos en {categoria.label}
      </h3>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        Prueba quitando algun filtro o cambia a otra sub-categoria. Las
        bodegas suben productos nuevos todos los dias.
      </p>
      <Link
        href="/marketplace/explorar"
        className="mt-6 inline-flex items-center rounded-full bg-primary px-5 py-2 text-xs font-bold text-white hover:bg-primary/90 transition-colors"
      >
        Volver a explorar
      </Link>
    </div>
  );
}

export default function CategoryProductGrid({
  products,
  categoria,
}: CategoryProductGridProps) {
  const { addItem } = useMarketplaceCart();
  const { open: openAddedModal } = useAddedToCartDrawer();
  const cartQty = useCartQuantityMap();
  const [quickView, setQuickView] = useState<CatalogProduct | null>(null);

  if (products.length === 0) {
    return <EmptyState categoria={categoria} />;
  }

  return (
    <>
    {/* ProductCardGrid (Ola 7) — grid catalogo principal de categoria */}
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
      {products.map((p) => (
        <ProductCardGrid
          key={p.storeProductId}
          product={toProductCardShape({
            ...p,
            href: `/marketplace/${p.storeSlug}/producto/${p.productId}`,
          })}
          renderImage={p.image ? nextImage : undefined}
          quantityInCart={cartQty.get(p.storeProductId) ?? 0}
          onQuickView={() => setQuickView(p)}
          onAddToCart={() => {
            // Mismo flujo que en la página de bodegas: agrega 1 al carrito +
            // dispara el MODAL CENTRAL (no un drawer lateral) con resumen.
            addItem({
              storeId: p.storeId,
              storeName: p.storeName,
              storeSlug: p.storeSlug,
              storeProductId: p.storeProductId,
              productId: p.productId,
              name: p.name,
              price: p.price,
              image: p.image ?? null,
              unit: p.unit ?? null,
            });
            openAddedModal({
              storeId: p.storeId,
              storeName: p.storeName,
              storeSlug: p.storeSlug,
              productId: p.productId,
              storeProductId: p.storeProductId,
              name: p.name,
              price: p.price,
              image: p.image,
              unit: p.unit,
            });
          }}
        />
      ))}
    </div>

    {/* Modal de vista rápida — abierto desde el hover de cada card. */}
    <ProductQuickView
      product={quickView ? { ...quickView, stock: quickView.stock ?? 0 } : null}
      onClose={() => setQuickView(null)}
    />
    </>
  );
}
