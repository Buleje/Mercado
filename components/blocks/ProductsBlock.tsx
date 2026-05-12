// ═══════════════════════════════════════════════════════
// PRODUCTS BLOCK - Editable Products Grid
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import { useMemo } from "react";
import Image from "next/image";
import { ShoppingCart, Star } from "@buleje/design-system/icons";
import { products, categories } from "@/data/products";
import { useCart } from "@/contexts/cart-context";

// ─── Schema & Types ─────────────────────────────────────
export const ProductsBlockSchema = z.object({
  badge: z.string().default("Nuestros Productos"),
  title: z.string().default("Productos Frescos del Día"),
  titleAccent: z.string().default("Frescos"),
  subtitle: z.string().default("Seleccionamos lo mejor del mercado cada mañana para que llegue fresco a tu mesa."),
  categoryFilter: z.string().default("todos"), // "todos" | category id
  maxProducts: z.number().min(1).max(50).default(8),
  gridCols: z.enum(["2", "3", "4", "6"]).default("4"),
  showBadges: z.boolean().default(true),
  showRatings: z.boolean().default(false),
  showAddToCart: z.boolean().default(true),
  ctaText: z.string().default("Ver Tienda"),
  ctaLink: z.string().default("/tienda"),
  showCTA: z.boolean().default(true),
});

export type ProductsBlockProps = z.infer<typeof ProductsBlockSchema>;

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-gray-300 text-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────
export default function ProductsBlock(props: Partial<ProductsBlockProps>) {
  const {
    badge = "Nuestros Productos",
    title = "Productos Frescos del Día",
    titleAccent = "Frescos",
    subtitle,
    categoryFilter = "todos",
    maxProducts = 8,
    gridCols = "4",
    showBadges = true,
    showRatings = false,
    showAddToCart = true,
    ctaText = "Ver Tienda",
    ctaLink = "/tienda",
    showCTA = true,
  } = props;

  const { addItem } = useCart();

  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    if (categoryFilter !== "todos") {
      filtered = products.filter((p) => p.category === categoryFilter);
    }
    
    return filtered.slice(0, maxProducts);
  }, [categoryFilter, maxProducts]);

  // Don't render the block if there are no products
  if (filteredProducts.length === 0) return null;

  const gridColsClass = {
    "2": "grid-cols-2",
    "3": "grid-cols-2 lg:grid-cols-3",
    "4": "grid-cols-2 lg:grid-cols-4",
    "6": "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  }[gridCols];

  const titleParts = title.split(titleAccent);

  return (
    <section id="productos" className="py-20 sm:py-28 bg-muted">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-14">
          <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary mb-4">
            {badge}
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] mb-4">
            {titleParts[0]}
            {titleAccent && <span className="text-primary">{titleAccent}</span>}
            {titleParts[1]}
          </h2>
          {subtitle && (
            <p className="mx-auto max-w-xl text-lg text-[var(--text-primary)]/60">
              {subtitle}
            </p>
          )}
        </div>

        {/* Products Grid */}
        <div className={`grid ${gridColsClass} gap-4 sm:gap-5`}>
          {filteredProducts.map((product) => {
            // Generate rating (deterministic based on id)
            const rating = 4 + ((product.id % 2 === 0) ? 1 : 0);

            return (
              <div
                key={product.id}
                className="group bg-[var(--surface-raised)] rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-[var(--dur-base)] hover:-translate-y-1.5"
              >
                {/* Image */}
                <div className="relative overflow-hidden aspect-4/3">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes={`(max-width: 640px) 50vw, (max-width: 1024px) ${gridCols === "2" ? "50vw" : "33vw"}, ${100 / parseInt(gridCols)}vw`}
                    className="object-cover group-hover:scale-108 transition-transform duration-[var(--dur-slow)]"
                    loading="lazy"
                  />
                  
                  {showBadges && product.badge && (
                    <span className="absolute top-2.5 left-2.5 bg-primary text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">
                      {product.badge}
                    </span>
                  )}
                  
                  {showAddToCart && (
                    <button
                      onClick={() => addItem({
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        unit: product.unit,
                        category: product.category,
                        badge: product.badge,
                      })}
                      className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--dur-fast)] h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-white shadow-md flex items-center justify-center hover:bg-primary hover:text-white"
                      aria-label={`Agregar ${product.name} al carrito`}
                    >
                      <ShoppingCart className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Content */}
                <div className="p-3 sm:p-4">
                  <span className="text-xs font-semibold text-primary/60 uppercase tracking-wider">
                    {categories.find((c) => c.id === product.category)?.label || product.category}
                  </span>
                  <h3 className="font-bold text-[var(--text-primary)] mt-0.5 mb-2 text-sm sm:text-base leading-tight">
                    {product.name}
                  </h3>
                  
                  {showRatings && <StarRating rating={rating} />}
                  
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-base sm:text-lg font-bold text-primary">
                      S/ {Number(product.price).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted">
                      /{product.unit}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        {showCTA && (
          <div className="text-center mt-12">
            <a
              href={ctaLink}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-white font-bold rounded-full hover:bg-primary-dark transition-colors shadow-lg hover:shadow-xl"
            >
              {ctaText}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const ProductsBlockMetadata = {
  type: "products",
  name: "Catálogo de Productos",
  description: "Grid de productos con filtros y carrito",
  category: "producto" as const,
  icon: "ShoppingBag",
  defaultProps: (() => { const parsed = ProductsBlockSchema.safeParse({}); return parsed.success ? parsed.data : { badge: "Nuestros Productos", title: "Productos Frescos del Día", titleAccent: "Frescos", subtitle: "", categoryFilter: "todos", maxProducts: 8, gridCols: "4" as const, showBadges: true, showRatings: false, showAddToCart: true, ctaText: "Ver Tienda", ctaLink: "/tienda", showCTA: true }; })(),
  propsSchema: ProductsBlockSchema,
};
