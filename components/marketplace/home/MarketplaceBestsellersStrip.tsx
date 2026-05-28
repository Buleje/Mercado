"use client";

/**
 * MarketplaceBestsellersStrip — Top 10 más vendidos esta semana.
 *
 * Cards verticales (UnifiedProductCard layout="compact" variant="top") en un
 * HorizontalCarousel con drag + snap. Antes usaba un BestsellerCard propio
 * (duplicado, sin botón "Agregar") — migrado al card único del marketplace
 * para consistencia visual + add-to-cart funcional. Datos reales del endpoint
 * /api/marketplace/bestsellers; si la DB no tiene ventas aún, se oculta sola.
 *
 * SSR-ready: acepta `initialItems` para sembrar datos desde el servidor (SEO).
 * Si se reciben datos iniciales, el useEffect NO hace fetch (evita doble carga).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceSection from "@/components/marketplace/MarketplaceSection";
import { ArrowRight } from "@buleje/design-system/icons";

interface BestsellerProduct {
  id: number;
  storeProductId: string;
  productId: number;
  name: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  unit: string | null;
  category: string | null;
  stock: number;
  unitsSold: number;
}

export default function MarketplaceBestsellersStrip(
  { initialItems }: { initialItems?: BestsellerProduct[] } = {}
) {
  // Solo datos reales — si la DB no tiene bestsellers todavia, la seccion se oculta.
  // Sin FALLBACK hardcoded (Brandon: nada inventado).
  const [items, setItems] = useState<BestsellerProduct[]>(initialItems ?? []);
  const [loading, setLoading] = useState(!initialItems);
  // Ref estable para que el useEffect no se re-ejecute si el padre re-renderiza
  // con una nueva referencia de array (los datos SSR no cambian tras el montaje).
  const hasInitialItems = useRef(Boolean(initialItems && initialItems.length > 0));

  useEffect(() => {
    // Si ya tenemos datos sembrados desde el servidor, no hacer fetch.
    if (hasInitialItems.current) return;

    let cancelled = false;
    fetch("/api/marketplace/bestsellers?limit=10", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.items && Array.isArray(d.items)) {
          setItems(d.items);
        }
      })
      .catch(() => {
        /* strip no crítico — rechazo intencional: si el fetch falla, la sección se oculta sola */
        return;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sin data real → no render. Evita "decorar" la home con productos inventados.
  if (loading || items.length === 0) {
    return null;
  }

  return (
    <MarketplaceSection
      id="mas-vendidos"
      kicker="Esta semana"
      title="Más vendidos"
      subtitle="Lo que tus vecinos están comprando ahora"
      actions={
        <Link
          href="/marketplace?sort=bestsellers"
          className="inline-flex items-center gap-1 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap"
        >
          Ver todos
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      {/* Carrusel horizontal — card vertical compacto + ranking (variant top) */}
      <HorizontalCarousel ariaLabel="Más vendidos">
        {items.slice(0, 10).map((item, idx) => (
          <UnifiedProductCard
            key={item.storeProductId}
            product={{
              id: item.productId,
              name: item.name,
              price: item.price,
              originalPrice: item.originalPrice ?? undefined,
              image: item.image,
              storeName: item.storeName,
              storeSlug: item.storeSlug,
              storeId: item.storeId,
              storeProductId: item.storeProductId,
              unit: item.unit,
              category: item.category ?? undefined,
              stock: item.stock,
            }}
            variant="top"
            rank={idx + 1}
            layout="compact"
            index={idx}
            href={`/marketplace/${item.storeSlug}`}
          />
        ))}
      </HorizontalCarousel>
    </MarketplaceSection>
  );
}
