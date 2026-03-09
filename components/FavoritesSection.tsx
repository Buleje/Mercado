"use client";

import { useRef } from "react";
import { useFavorites } from "@/contexts/favorites-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { products } from "@/data/products";
import Image from "next/image";
import { Heart, ShoppingCart, Plus, Package, Trash2 } from "lucide-react";

export default function FavoritesSection() {
  const { favorites, toggle } = useFavorites();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const sectionRef = useRef<HTMLElement>(null);

  const favProducts = products.filter((p) => favorites.has(String(p.id)));
  if (favProducts.length === 0) return null;

  const addAll = () => {
    favProducts.forEach((p) => {
      addItem(p);
      showToast(p.name, p.image);
    });
  };

  return (
    <section ref={sectionRef} className="py-12 sm:py-16 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Heart className="h-6 w-6 text-red-500 fill-red-500" />
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
              Mis Favoritos
            </h2>
            <span className="bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold px-2.5 py-1 rounded-full">
              {favProducts.length}
            </span>
          </div>
          <button
            onClick={addAll}
            className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-primary-dark active:scale-95 transition-all shadow-md"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Agregar todos</span>
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {favProducts.map((product) => (
            <div
              key={product.id}
              className="group relative bg-white dark:bg-card rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-card-border hover:shadow-lg transition-all duration-300 flex flex-col"
            >
              <button
                onClick={() => toggle(String(product.id))}
                aria-label="Quitar de favoritos"
                className="absolute top-2 right-2 z-10 flex items-center justify-center h-7 w-7 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="relative aspect-square bg-gray-50 dark:bg-surface shrink-0">
                {product.image ? (
                  <Image src={product.image} alt={product.name} fill loading="lazy" className="object-cover" sizes="(max-width: 640px) 50vw, 20vw" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-8 w-8" /></div>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1.5 flex-1">
                <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 flex-1">{product.name}</h3>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-base font-extrabold text-primary">S/{product.price.toFixed(2)}</span>
                  <button
                    onClick={() => { addItem(product); showToast(product.name, product.image); }}
                    className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary text-white shadow-md hover:bg-primary-dark active:scale-95 transition-all"
                    aria-label={`Agregar ${product.name}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
