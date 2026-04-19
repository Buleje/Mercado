"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, ArrowLeft, Trash2, ShoppingBag, Store as StoreIcon } from "@buleje/design-system/icons";
import { useWishlist } from "@/hooks/use-wishlist";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import ShareWhatsAppButton from "@/components/marketplace/ShareWhatsAppButton";
import { cn } from "@/lib/utils";

export default function FavoritosClient() {
  const { items, remove, clear } = useWishlist();
  const { addItem } = useMarketplaceCart();

  const handleAddToCart = (item: (typeof items)[number]) => {
    addItem({
      storeId: item.storeSlug,
      storeName: item.storeName,
      storeSlug: item.storeSlug,
      storeProductId: `${item.storeSlug}-${item.productId}`,
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: 1,
      image: item.image,
      unit: null,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al marketplace
          </Link>

          {items.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Vaciar lista
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center">
            <Heart className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
              Mis favoritos
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {items.length === 0
                ? "Aún no guardaste ningún producto."
                : `${items.length} producto${items.length === 1 ? "" : "s"} guardado${items.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="mx-auto h-20 w-20 rounded-full bg-rose-50 flex items-center justify-center mb-4">
              <Heart className="h-10 w-10 text-rose-300" />
            </div>
            <h2 className="text-lg font-extrabold text-gray-800 dark:text-white">
              Tu lista está vacía
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
              Tocá el corazón en cualquier producto del marketplace para guardarlo acá
              y comprarlo después.
            </p>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
              Explorar productos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <article
                key={`${item.storeSlug}-${item.productId}`}
                className="group relative flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary/40 hover:shadow-lg transition-all"
              >
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => remove(item.productId, item.storeSlug)}
                  aria-label={`Quitar ${item.name} de favoritos`}
                  className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white/90 backdrop-blur border border-gray-200 text-rose-500 hover:bg-rose-50 transition-colors flex items-center justify-center"
                >
                  <Heart className="h-4 w-4 fill-current" />
                </button>

                {/* Share */}
                <div className="absolute top-2 left-2 z-10">
                  <ShareWhatsAppButton
                    size="sm"
                    storeSlug={item.storeSlug}
                    storeName={item.storeName}
                    productName={item.name}
                    productId={item.productId}
                    price={item.price}
                    className="h-8 w-8"
                  />
                </div>

                <Link
                  href={`/marketplace/${item.storeSlug}?p=${item.productId}`}
                  className="relative aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden"
                >
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-gray-300">
                      <ShoppingBag className="h-10 w-10" />
                    </div>
                  )}
                </Link>

                <div className="flex-1 flex flex-col p-3">
                  <p className="text-xs font-bold text-gray-900 dark:text-white line-clamp-2 min-h-[2.25rem]">
                    {item.name}
                  </p>
                  <Link
                    href={`/marketplace/${item.storeSlug}`}
                    className="text-[length:var(--ts-2xs)] text-gray-400 hover:text-primary inline-flex items-center gap-1 mt-1"
                  >
                    <StoreIcon className="h-2.5 w-2.5" />
                    {item.storeName}
                  </Link>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-base font-extrabold text-gray-900 dark:text-white">
                      S/{item.price.toFixed(2)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddToCart(item)}
                    className={cn(
                      "mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg",
                      "bg-primary text-white text-xs font-bold hover:bg-primary/90 active:scale-95 transition-all",
                    )}
                  >
                    <ShoppingBag className="h-3 w-3" />
                    Al carrito
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
