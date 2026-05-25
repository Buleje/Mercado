"use client";

/**
 * OfertasDelDiaHero — Seccion hero con ProductCardHero (DS Ola 7).
 *
 * 2 productos destacados grandes, visualmente dominantes, con el primitivo
 * canonico del DS (mismo token set que tienda/admin).
 *
 * Data REAL desde /api/marketplace/catalog/sections (campo `featured`).
 * Antes usaba un array FEATURED mock hardcodeado (violaba "solo data real").
 * Si no hay destacados publicados, la seccion se oculta sola (early-return).
 *
 * Container: max-w-[1600px] para desktops grandes; en < 1600px no cambia nada.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ProductCardHero,
  type ProductCardProduct,
  Kicker,
  SectionTitle,
} from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { useCartWithUndo } from "@/hooks/use-cart-with-undo";

/** Shape del producto que devuelve /api/marketplace/catalog/sections.featured */
interface FeaturedProduct {
  storeProductId: string;
  productId: number;
  name: string;
  // El endpoint serializa Decimal de Prisma como string ("15") — coercionar.
  price: number | string;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  storeRating: number;
  discountPercent?: number;
}

/**
 * Renderer de imagen con Next/Image para optimizacion. Se inyecta via
 * `renderImage` slot del primitivo DS (que por default usa `<img>` lazy).
 */
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
      sizes="(max-width: 768px) 100vw, 60vw"
      priority
    />
  );
}

function toCardProduct(p: FeaturedProduct): ProductCardProduct {
  const price = Number(p.price);
  // Si hay % de descuento, reconstruir el precio original para el tachado.
  const originalPrice =
    p.discountPercent && p.discountPercent > 0
      ? Math.round((price / (1 - p.discountPercent / 100)) * 100) / 100
      : undefined;
  return {
    id: p.productId,
    name: p.name,
    category: p.category ?? undefined,
    price,
    originalPrice,
    image: p.image,
    stock: p.stock,
    rating: p.storeRating || undefined,
    storeSlug: p.storeSlug,
    storeName: p.storeName,
    unit: p.unit ?? undefined,
    badge: originalPrice ? "oferta" : undefined,
  };
}

export default function OfertasDelDiaHero() {
  const { addItemWithUndo } = useCartWithUndo();
  const [featured, setFeatured] = useState<FeaturedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // Mapa productId → raw para resolver storeId/storeProductId al agregar.
  const rawById = useRef(new Map<number, FeaturedProduct>());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/catalog/sections")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const list = (d?.data?.featured ?? []) as FeaturedProduct[];
        const top2 = list.slice(0, 2);
        rawById.current = new Map(top2.map((p) => [p.productId, p]));
        setFeatured(top2);
      })
      .catch(() => {
        /* sección no crítica: si el fetch falla, se oculta sola (early-return) */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => featured.map(toCardProduct), [featured]);

  const handleAdd = (p: ProductCardProduct) => {
    const raw = rawById.current.get(Number(p.id));
    addItemWithUndo({
      storeId: raw?.storeId ?? p.storeSlug ?? "",
      storeName: raw?.storeName ?? p.storeName ?? "",
      storeSlug: raw?.storeSlug ?? p.storeSlug ?? "",
      storeProductId: raw?.storeProductId ?? String(p.id),
      productId: typeof p.id === "number" ? p.id : Number(p.id) || 0,
      name: p.name,
      price: p.price,
      image: p.image ?? null,
      unit: p.unit ?? null,
      stock: raw?.stock ?? null,
    });
  };

  // Sin destacados reales → no render (consistente con el resto de strips).
  if (loading || cards.length === 0) return null;

  return (
    <section aria-labelledby="ofertas-del-dia-title" className="py-8 sm:py-10">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <Kicker className="text-[var(--text-tertiary)]">
              Ofertas del dia
            </Kicker>
            <SectionTitle
              id="ofertas-del-dia-title"
              className="mt-1 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
            >
              Productos destacados
            </SectionTitle>
          </div>
          <Link
            href="/marketplace/ofertas"
            className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            Ver todas
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cards.map((p) => (
            <ProductCardHero
              key={p.id}
              product={p}
              variant="oferta"
              priority
              onAddToCart={handleAdd}
              renderImage={p.image ? nextImage : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
