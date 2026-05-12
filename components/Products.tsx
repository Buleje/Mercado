"use client";

import Image from "next/image";
import { m } from "framer-motion";
import { useInView } from "@/hooks/use-in-view";
import { Star, ShoppingCart, Tag } from "@buleje/design-system/icons";

const products = [
  {
    name: "Tomates Frescos",
    category: "Verduras",
    image:
      "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400&h=280&fit=crop&q=80",
    price: "S/ 3.50",
    rating: 5,
    badge: "Oferta",
  },
  {
    name: "Platanos de Seda",
    category: "Frutas",
    image:
      "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=280&fit=crop&q=80",
    price: "S/ 3.00",
    rating: 5,
    badge: null,
  },
  {
    name: "Papas Nativas",
    category: "Verduras",
    image:
      "https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=400&h=280&fit=crop&q=80",
    price: "S/ 4.50",
    rating: 4,
    badge: null,
  },
  {
    name: "Aceite Vegetal 1L",
    category: "Abarrotes",
    image:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=280&fit=crop&q=80",
    price: "S/ 9.90",
    rating: 5,
    badge: "Oferta",
  },
  {
    name: "Mix de Verduras",
    category: "Verduras",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=280&fit=crop&q=80",
    price: "S/ 6.00",
    rating: 5,
    badge: "Fresco",
  },
  {
    name: "Cebollas Rojas",
    category: "Verduras",
    image:
      "https://images.unsplash.com/photo-1508747703725-719777637510?w=400&h=280&fit=crop&q=80",
    price: "S/ 2.80",
    rating: 4,
    badge: "Oferta",
  },
  {
    name: "Frutas del Mercado",
    category: "Frutas",
    image:
      "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400&h=280&fit=crop&q=80",
    price: "S/ 8.00",
    rating: 5,
    badge: null,
  },
  {
    name: "Limones Frescos",
    category: "Frutas",
    image:
      "https://images.unsplash.com/photo-1590502603987-94e8b1a37b35?w=400&h=280&fit=crop&q=80",
    price: "S/ 2.50",
    rating: 5,
    badge: null,
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-secondary text-secondary"
              : "fill-muted-dark text-muted-dark"
          }`}
        />
      ))}
    </div>
  );
}

const categoryTabs = [
  "Frutas y Verduras",
  "Abarrotes",
  "Carnes",
  "Lacteos",
  "Bebidas",
  "Limpieza",
];

export default function Products() {
  const [ref, isInView] = useInView<HTMLElement>();

  return (
    <section id="productos" className="py-24 bg-muted" ref={ref}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary mb-4">
            Nuestros Productos
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] mb-4">
            Productos{" "}
            <span className="text-primary">Frescos</span> del Dia
          </h2>
          <p className="mx-auto max-w-xl text-lg text-[var(--text-primary)]/60">
            Seleccionamos lo mejor del mercado cada manana para que llegue
            fresco a tu mesa.
          </p>
        </m.div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {products.map((product, i) => (
            <m.div
              key={product.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.4, delay: 0.06 * i }}
              className="group bg-[var(--surface-raised)] rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5"
            >
              {/* Image */}
              <div className="relative overflow-hidden aspect-4/3">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover group-hover:scale-108 transition-transform duration-500"
                  loading="lazy"
                />
                {product.badge && (
                  <span className="absolute top-2.5 left-2.5 bg-primary text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow">
                    {product.badge}
                  </span>
                )}
                <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-3 sm:p-4">
                <span className="text-xs font-semibold text-primary/60 uppercase tracking-wider">
                  {product.category}
                </span>
                <h3 className="font-bold text-[var(--text-primary)] mt-0.5 mb-2 text-sm sm:text-base leading-tight">
                  {product.name}
                </h3>
                <StarRating rating={product.rating} />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-base sm:text-lg font-bold text-primary">
                    {product.price}
                  </span>
                  <a
                    href="#contacto"
                    className="text-xs font-semibold text-white bg-primary rounded-full px-3 py-1.5 hover:bg-primary-dark transition-colors"
                  >
                    Pedir
                  </a>
                </div>
              </div>
            </m.div>
          ))}
        </div>

        {/* Category Filter Row */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex flex-wrap justify-center gap-3 mt-12"
        >
          {categoryTabs.map((cat) => (
            <a
              key={cat}
              href="#contacto"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-[var(--surface-raised)] px-5 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-primary hover:text-white hover:border-primary transition-all duration-200 shadow-sm"
            >
              <Tag className="h-3.5 w-3.5" />
              {cat}
            </a>
          ))}
        </m.div>

        {/* WhatsApp CTA */}
        <m.p
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="text-center text-sm text-[var(--text-primary)]/50 mt-5"
        >
          No encuentras lo que buscas?{" "}
          <a
            href="#contacto"
            className="text-primary font-semibold hover:underline"
          >
            Consultanos por WhatsApp
          </a>
        </m.p>
      </div>
    </section>
  );
}
