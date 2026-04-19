"use client";

/**
 * OfertasDelDiaHero — Seccion hero con ProductCardHero (DS Ola 7).
 *
 * Se monta inmediatamente despues del hero principal del marketplace para
 * capturar el primer pantallazo del usuario con 2 ofertas grandes y
 * visualmente dominantes. Usa el primitivo canonico del DS que garantiza
 * consistencia visual con tienda/admin (mismo token set, mismas proporciones).
 *
 * Data: mock local hoy. Cuando exista endpoint `/api/marketplace/featured`
 * que devuelva productos destacados con stock + originalPrice se reemplaza
 * el array `FEATURED` por fetch + fallback al mock.
 *
 * Container: max-w-[1600px] para aprovechar desktops grandes segun pedido
 * del user ("las secciones seran mas amplias, abarcan todo el ancho").
 * En viewports < 1600px el max-w no cambia nada.
 */

import Link from "next/link";
import Image from "next/image";
import {
  ProductCardHero,
  type ProductCardProduct,
  Kicker,
  SectionTitle,
} from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

// Mock de 2 productos destacados. Estructura lista para reemplazar por fetch.
const FEATURED: ProductCardProduct[] = [
  {
    id: "feat-arroz-5kg",
    name: "Arroz Costeno extra 5 kg",
    category: "Abarrotes",
    price: 20.9,
    originalPrice: 24.9,
    image: null,
    stock: 40,
    rating: 4.7,
    reviewCount: 120,
    storeSlug: "bodega-don-pepe",
    storeName: "Bodega Don Pepe",
    unit: "x 5 kg",
    badge: "oferta",
  },
  {
    id: "feat-aceite-primor-1l",
    name: "Aceite Primor 1 L",
    category: "Abarrotes",
    price: 7.5,
    originalPrice: 9.5,
    image: null,
    stock: 68,
    rating: 4.8,
    reviewCount: 210,
    storeSlug: "frutas-selva",
    storeName: "Frutas de la Selva",
    unit: "x 1 L",
    badge: "oferta",
  },
];

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

export default function OfertasDelDiaHero() {
  const { addItem } = useMarketplaceCart();

  const handleAdd = (p: ProductCardProduct) => {
    addItem({
      storeId: p.storeSlug ?? "",
      storeName: p.storeName ?? "",
      storeSlug: p.storeSlug ?? "",
      storeProductId: String(p.id),
      productId: typeof p.id === "number" ? p.id : Number(p.id) || 0,
      name: p.name,
      price: p.price,
      image: p.image ?? null,
      unit: p.unit ?? null,
    });
  };

  return (
    <section
      aria-labelledby="ofertas-del-dia-title"
      className="py-8 sm:py-10"
    >
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
          {FEATURED.slice(0, 2).map((p) => (
            /* ProductCardHero (Ola 7) — destacar oferta del dia */
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
