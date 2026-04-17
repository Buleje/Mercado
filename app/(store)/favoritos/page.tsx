"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, ShoppingCart, Trash2, ArrowLeft } from "lucide-react";
import { useWishlist } from "@/contexts/wishlist-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";
import { products } from "@/data/products";
import { CanastaVacia, IllustrationCard } from "@/components/ui-system/illustrations";

/**
 * #17 Wishlist — pagina de favoritos del cliente.
 * Lee de wishlist-context (localStorage, cross-store).
 * Degrada si no hay cliente autenticado.
 */
export default function FavoritosPage() {
  const { items, removeFromWishlist, count } = useWishlist();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const wishlistProducts = useMemo(() => {
    const ids = new Set(items.map((i) => i.productId));
    return products.filter((p) => ids.has(String(p.id)));
  }, [items]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header simple */}
      <div
        className="pt-24 pb-8"
        style={{ background: "linear-gradient(135deg, #2d6a4f 0%, #40916c 100%)" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white/80 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
                <Heart className="h-6 w-6 fill-white" />
                Mis Favoritos
              </h1>
              <p className="text-xs text-white/70 mt-0.5">
                {count === 0 ? "Aun no tienes favoritos" : `${count} producto${count !== 1 ? "s" : ""} guardado${count !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Estado vacío — ADR-065 Ola F · IllustrationCard con CanastaVacia */}
        {count === 0 && (
          <IllustrationCard
            illustration={<CanastaVacia size={180} />}
            kicker="Favoritos"
            title="Guardá tus favoritos"
            description="Tocá el corazón en cualquier producto para verlos acá cuando vuelvas."
            primaryAction={
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                Explorar tienda
              </Link>
            }
          />
        )}

        {/* Grid de favoritos */}
        {count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {wishlistProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Imagen */}
                <div className="relative aspect-square bg-gray-50 dark:bg-gray-800">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 50vw, 25vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-300">
                      <ShoppingCart className="h-8 w-8" />
                    </div>
                  )}
                  {/* Quitar de wishlist */}
                  <button
                    onClick={() => removeFromWishlist(String(product.id))}
                    aria-label="Quitar de favoritos"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col gap-2">
                  <Link href={`/tienda/${product.id}`}>
                    <h3 className="text-xs font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                  </Link>
                  <span className="text-base font-extrabold text-primary">
                    S/{product.price.toFixed(2)}
                  </span>
                  <button
                    onClick={() => {
                      addItem(product);
                      showToast(product.name, product.image ?? "");
                    }}
                    className={cn(
                      "flex items-center justify-center gap-1.5 w-full min-h-[44px] rounded-xl bg-primary text-white text-xs font-bold",
                      "hover:bg-primary/90 active:scale-95 transition-all"
                    )}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Agregar
                  </button>
                </div>
              </div>
            ))}

            {/* Productos en wishlist sin datos locales (ID sin match) */}
            {items
              .filter((i) => !wishlistProducts.some((p) => String(p.id) === i.productId))
              .map((i) => (
                <div
                  key={i.productId}
                  className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4 flex flex-col items-center justify-center gap-2 opacity-60"
                >
                  <ShoppingCart className="h-8 w-8 text-gray-300" />
                  <p className="text-[10px] text-muted text-center">Producto no disponible</p>
                  <button
                    onClick={() => removeFromWishlist(i.productId)}
                    className="text-[10px] text-red-500 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
