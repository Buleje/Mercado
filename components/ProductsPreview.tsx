"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShoppingCart, Sparkles, Package } from "lucide-react";
import type { Product, Category } from "@/data/products";
import { useInView } from "@/hooks/use-in-view";
import ProductSchema from "./ProductSchema";
import { trackProductView } from "@/lib/analytics";
import { useSettings } from "@/contexts/settings-context";
import { useStoreProducts } from "@/hooks/use-store-products";

function PreviewImage({ src, alt, eager }: { src: string; alt: string; eager: boolean }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-linear-to-br from-gray-100 to-gray-50 gap-2">
        <Package className="h-8 w-8 text-gray-300" />
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Sin imagen</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={200}
      height={200}
      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
      loading={eager ? "eager" : "lazy"}
      priority={eager}
      fetchPriority={eager ? "high" : "auto"}
      onError={() => setErr(true)}
    />
  );
}

export default function ProductsPreview() {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const { homepage: hp } = useSettings();
  const { products, categories, isLoading } = useStoreProducts();

  const featured = useMemo<Product[]>(() => [
    ...products.filter((p: Product) => p.badge),
    ...products.filter((p: Product) => !p.badge),
  ].slice(0, 8), [products]);

  const showcaseCategories = useMemo<Category[]>(() =>
    categories.filter((c: Category) => c.id !== "todos").slice(0, 4),
  [categories]);

  // Skeleton mientras carga
  if (isLoading) {
    return (
      <section className="py-20 sm:py-28 bg-surface relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-3 animate-pulse" />
            <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto mb-3 animate-pulse" />
            <div className="h-4 w-80 bg-gray-100 dark:bg-gray-800 rounded-lg mx-auto animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-12">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm animate-pulse">
                <div className="aspect-square bg-gray-200 dark:bg-gray-700" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Empty state — mostrar invitación a explorar en vez de blanco
  if (featured.length === 0) {
    return (
      <section className="py-20 sm:py-28 bg-surface relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Package className="h-16 w-16 text-primary/20 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Cargando productos...</h2>
          <p className="text-muted text-sm mb-6">Estamos preparando nuestro catálogo para ti</p>
          <Link href="/tienda" className="inline-flex items-center gap-2 bg-primary text-white font-bold text-sm rounded-xl px-6 py-3 hover:bg-primary-dark transition-colors">
            <ShoppingCart className="h-5 w-5" />
            Ir a la tienda
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="py-20 sm:py-28 bg-surface relative overflow-hidden">
      {/* SEO: Product schema for featured items */}
      <ProductSchema products={featured} />
      
      {/* Decorative */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[40vw] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className={`text-center mb-14 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {hp.previewBadge}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-foreground">
            {hp.previewTitle}{" "}
            <span className="text-primary relative">
              {hp.previewTitleAccent}
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-primary/30" viewBox="0 0 100 12" preserveAspectRatio="none">
                <path d="M0 8 Q25 0 50 6 Q75 12 100 4" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted max-w-2xl mx-auto">
            {hp.previewSubtitle}
          </p>
        </div>

        {/* Category pills */}
        <div className={`flex flex-wrap items-center justify-center gap-2.5 mb-10 transition-all duration-700 delay-100 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {showcaseCategories.map((cat) => (
            <Link
              key={cat.id}
              href="/tienda"
              className="group inline-flex items-center gap-2 bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-full px-4 py-2 text-sm font-semibold text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary transition-all shadow-sm hover:shadow-md"
            >
              <span className="text-base">{cat.emoji}</span>
              <span>{cat.label}</span>
            </Link>
          ))}
          <Link
            href="/tienda"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:text-primary-dark transition-colors"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Product grid — 8 items */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-12">
          {featured.map((product, i) => (
            <Link
              key={product.id}
              href="/tienda"
              onClick={() => trackProductView({ id: product.id, name: product.name, category: product.category, price: product.price })}
              className={`group relative bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${
                inView ? "animate-[fadeUp_0.5s_ease-out_both]" : "opacity-0"
              }`}
              style={inView ? { animationDelay: `${150 + i * 80}ms` } : undefined}
            >
              {/* Badge */}
              {product.badge && (
                <span className="absolute top-2 left-2 z-10 bg-primary text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                  {product.badge}
                </span>
              )}

              {/* Image */}
              <div className="aspect-square overflow-hidden bg-gray-50 relative">
                <PreviewImage src={product.image} alt={product.name} eager={i < 2} />
                {/* Hover overlay — "Ver en tienda" */}
                <div className="absolute inset-0 bg-primary/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-white text-sm font-bold flex items-center gap-1.5">
                    <ShoppingCart className="h-5 w-5" />
                    Ver en tienda
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="text-xs sm:text-sm font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {product.name}
                </h3>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[10px] text-muted">desde</span>
                  <span className="text-sm sm:text-base font-extrabold text-primary">
                    S/{product.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-muted">/{product.unit}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA — more prominent */}
        <div className={`text-center transition-all duration-700 delay-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <Link
            href="/tienda"
            className="group inline-flex items-center gap-3 bg-primary hover:bg-primary-dark text-white font-extrabold text-base rounded-2xl px-10 py-4.5 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5"
          >
            <ShoppingCart className="h-5 w-5" />
            {hp.previewCtaText}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="text-sm text-muted mt-3">
            +500 productos · Delivery gratis desde S/50
          </p>
        </div>
      </div>
    </section>
  );
}
