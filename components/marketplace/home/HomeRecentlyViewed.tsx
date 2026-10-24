"use client";

import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import HomeProductCard from "@/components/marketplace/home/HomeProductCard";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import { useRecentViewed } from "@/hooks/use-recent-viewed";

/**
 * HomeRecentlyViewed — «Visto recientemente» (Brandon 2026-06-08; home
 * «Dosel» 2026-10-10: título y tarjeta de la home). Ayuda a RETOMAR lo que el
 * vecino estaba mirando. Datos reales por usuario (localStorage
 * marketplace:recent-viewed:v1, guarda el producto completo → sin fetch).
 * Se oculta sola si no vio nada.
 */

/** 2,3 tarjetas a 400 px (168 px, como el carril de «Descubre»). */
const ANCHO_ITEM = "w-[168px] shrink-0 snap-start sm:w-[184px] sm:scroll-ml-2 lg:w-[200px] lg:scroll-ml-4";

export default function HomeRecentlyViewed() {
  const { items, count, clear } = useRecentViewed();

  if (count === 0) return null;

  return (
    <section
      aria-labelledby="recientes-titulo"
      className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8"
    >
      <HomeSeccionTitulo
        id="recientes-titulo"
        titulo="Visto recientemente"
        extra={
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-11 items-center rounded-full px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            Limpiar
          </button>
        }
      />
      <HorizontalCarousel ariaLabel="Visto recientemente" itemWidthClass={ANCHO_ITEM}>
        {items.map((item, i) => (
          <HomeProductCard
            key={`${item.storeSlug}-${item.productId}`}
            product={{
              id: item.productId,
              name: item.name,
              price: item.price,
              image: item.image,
              storeName: item.storeName,
              storeSlug: item.storeSlug,
            }}
            href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
            index={i}
          />
        ))}
      </HorizontalCarousel>
    </section>
  );
}
