"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import { ShoppingCart, Timer } from "@buleje/design-system/icons";
import { BLUR_DATA_URL } from "@/lib/image-placeholders";
import { ProductBadge, ProductPrice } from "@buleje/design-system";
import type { Product } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useQuickAddSafe } from "@/contexts/quick-add-context";
import { useInView } from "@/hooks/use-in-view";
import { useStoreProducts } from "@/hooks/use-store-products";
import SectionPlaceholder from "@/components/SectionPlaceholder";


const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=400&fit=crop&q=80";

/* Pick a different in-stock product each day using day-of-year */
function getDailyProduct(products: Product[]): Product | null {
  if (products.length === 0) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);

  // Try up to products.length offsets to skip products without images
  for (let i = 0; i < products.length; i++) {
    const idx = (dayOfYear + i) % products.length;
    const p = products[idx];
    if (p.image) return p;
  }
  return products[dayOfYear % products.length];
}

/* Live countdown to midnight */
function useCountdown() {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return remaining;
}

export default function DailySpecial({ serverProducts, showEmpty = false, emptyVariant = "admin", strictAdminOnly = false }: { serverProducts?: Product[]; showEmpty?: boolean; emptyVariant?: "admin" | "public"; strictAdminOnly?: boolean }) {
  const { items } = useCart();
  // En la tienda individual abrimos el QuickAddModal para que el cliente
  // confirme cantidad. Si no hay provider (e.g. marketplace), fallback a
  // agregar directo sin el modal.
  const quickAdd = useQuickAddSafe();
  const hook = useStoreProducts();
  const products = serverProducts && serverProducts.length > 0 ? serverProducts : hook.products;
  const isLoading = serverProducts ? false : hook.isLoading;
  const [ref, inView] = useInView({ threshold: 0.15 });
  const [imgError, setImgError] = useState(false);
  const product = useMemo(() => {
    // En modo estricto NO mostramos producto si el admin no lo asignó
    // explícitamente desde el panel "Mi Tienda Personal → Productos
    // destacados" (override con featured=true). Los badges que vienen del
    // seed/fixture de catálogo no cuentan como asignación admin.
    //
    // Como hoy no hay UI de "asignar producto a esta sección" granular, en
    // strict mode siempre devuelve null hasta que se construya la UI o se
    // pase una lista de featured separada por prop.
    if (strictAdminOnly) return null;
    return getDailyProduct(products);
  }, [products, strictAdminOnly]);
  const countdown = useCountdown();

  if (isLoading) return <SectionPlaceholder title="Oferta del Dia" hint="Cargando..." cols={4} />;
  if (!product) return showEmpty ? <SectionPlaceholder title="Oferta del Dia" hint="Agrega productos para activar la oferta diaria" cols={4} variant={emptyVariant} publicTitle="Producto del dia" /> : null;

  const inCart = items.find((i) => i.id === product.id);
  const qty = inCart?.quantity ?? 0;

  // Simulated original price (20% higher)
  const originalPrice = +(product.price * 1.2).toFixed(2);
  const savings = +(originalPrice - product.price).toFixed(2);

  return (
    <section ref={ref} className="py-6 sm:py-10 bg-surface overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className={`relative rounded-3xl overflow-hidden shadow-lg transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--accent) 8%, var(--surface-canvas)), color-mix(in oklch, var(--accent) 3%, var(--surface-canvas)))",
          }}
        >
          {/* Badge — premium ink (negro elegante) */}
          <div className="absolute top-4 left-4 z-10">
            <ProductBadge intent="premium">Producto del día</ProductBadge>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 sm:p-8 lg:p-10">
            {/* Image — sin discount badge rojo overlay; el ProductPrice comunica descuento */}
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-2xl overflow-hidden bg-white dark:bg-white/10 shadow-xl shrink-0">
              <Image
                src={imgError ? FALLBACK_IMAGE : (product.image || FALLBACK_IMAGE)}
                alt={product.name}
                fill
                sizes="256px"
                className="object-cover"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
                onError={() => setImgError(true)}
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left space-y-4">
              <div>
                <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider mb-1">
                  Oferta especial de hoy
                </p>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground leading-tight">
                  {product.name}
                </h3>
                <p className="text-sm text-muted mt-1 capitalize">
                  {product.category.replace("-", " ")} · {product.unit}
                </p>
              </div>

              {/* Price — canonical via DS con previousPrice tachado */}
              <ProductPrice
                price={product.price}
                previousPrice={originalPrice}
                size="lg"
                className="justify-center sm:justify-start"
              />

              {/* Ahorro + countdown — neutral sin amber/emerald */}
              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <span className="inline-flex items-center gap-1 bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-bold px-2.5 py-1 rounded-full">
                  Ahorras S/{savings.toFixed(2)}
                </span>
                <span
                  className="inline-flex items-center gap-1 bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)] text-xs font-semibold px-2.5 py-1 rounded-full"
                  aria-live="polite"
                  aria-label={countdown ? `Oferta termina en ${countdown}` : "Solo por hoy"}
                >
                  <Timer className="w-3 h-3" aria-hidden="true" />
                  {countdown ? `Termina en ${countdown}` : "Solo por hoy"}
                </span>
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={() => {
                  if (quickAdd) quickAdd.openQuickAdd(product);
                }}
                aria-label={qty > 0 ? `${product.name} en el carrito, cantidad ${qty}` : `Agregar ${product.name} al carrito`}
                className="inline-flex items-center gap-2 bg-primary text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all shadow-lg shadow-primary/25"
              >
                <ShoppingCart className="w-5 h-5" aria-hidden="true" />
                {qty > 0 ? `En el carrito (${qty})` : "Agregar al carrito"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
