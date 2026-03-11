"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Star, ShoppingCart, Zap, Timer } from "lucide-react";
import { products } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useInView } from "@/hooks/use-in-view";

/* Pick a different product each day using day-of-year */
function getDailyProduct() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);
  const idx = dayOfYear % products.length;
  return products[idx];
}

export default function DailySpecial() {
  const { addItem, items } = useCart();
  const [ref, inView] = useInView({ threshold: 0.15 });
  const product = useMemo(() => getDailyProduct(), []);

  const inCart = items.find((i) => i.id === product.id);
  const qty = inCart?.quantity ?? 0;

  // Simulated original price (20% higher)
  const originalPrice = +(product.price * 1.2).toFixed(2);
  const savings = +(originalPrice - product.price).toFixed(2);
  const pct = Math.round((savings / originalPrice) * 100);

  return (
    <section ref={ref} className="py-6 sm:py-10 bg-surface overflow-hidden">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className={`relative rounded-3xl overflow-hidden shadow-lg transition-all duration-700 ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          style={{ background: "linear-gradient(135deg, rgba(45,106,79,0.05), rgba(45,106,79,0.1), rgba(244,162,97,0.12))" }}
        >
          {/* Badge */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-amber-500 text-white text-xs font-extrabold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg">
            <Star className="w-3.5 h-3.5 fill-white" />
            Producto del día
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 sm:p-8 lg:p-10">
            {/* Image */}
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 lg:w-64 lg:h-64 rounded-2xl overflow-hidden bg-white dark:bg-white/10 shadow-xl shrink-0">
              {product.image && (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="256px"
                  className="object-cover"
                />
              )}
              {/* Discount badge */}
              <div className="absolute bottom-3 right-3 bg-red-500 text-white font-extrabold text-lg px-3 py-1.5 rounded-xl shadow-lg">
                -{pct}%
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left space-y-4">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                  Oferta especial de hoy
                </p>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground leading-tight">
                  {product.name}
                </h3>
                <p className="text-sm text-muted mt-1 capitalize">
                  {product.category.replace("-", " ")} · {product.unit}
                </p>
              </div>

              {/* Price */}
              <div className="flex items-end gap-3 justify-center sm:justify-start">
                <span className="text-4xl sm:text-5xl font-extrabold text-primary">
                  S/{product.price.toFixed(2)}
                </span>
                <span className="text-lg text-muted line-through mb-1">
                  S/{originalPrice.toFixed(2)}
                </span>
              </div>

              {/* Savings chip */}
              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  <Zap className="w-3 h-3" />
                  Ahorras S/{savings.toFixed(2)}
                </span>
                <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  <Timer className="w-3 h-3" />
                  Solo por hoy
                </span>
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={() => addItem(product)}
                className="inline-flex items-center gap-2 bg-primary text-white font-bold text-sm px-6 py-3.5 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all shadow-lg shadow-primary/25"
              >
                <ShoppingCart className="w-5 h-5" />
                {qty > 0 ? `En el carrito (${qty})` : "Agregar al carrito"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
