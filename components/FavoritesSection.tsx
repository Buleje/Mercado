"use client";

import { useRef, useState } from "react";
import { useFavorites } from "@/contexts/favorites-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useStoreProducts } from "@/hooks/use-store-products";
import Image from "next/image";
import { Heart, ShoppingCart, Plus, Minus, Package, Trash2, ClipboardList, MessageCircle, Share2 } from "@buleje/design-system/icons";

export default function FavoritesSection() {
  const { favorites, toggle } = useFavorites();
  const { addItem, items: cartItems, updateQty } = useCart();
  const { showToast } = useToast();
  const { products, isLoading } = useStoreProducts();

  const sectionRef = useRef<HTMLElement>(null);

  /* Y2: Export favorites as text list */
  const [copied, setCopied] = useState(false);

  if (isLoading) return null;
  const favProducts = products.filter((p) => favorites.has(String(p.id)));
  if (favProducts.length === 0) return null;

  const totalFavorites = favProducts.reduce((s, p) => s + p.price, 0);

  const buildListText = () => {
    const lines = favProducts.map((p, i) => `${i + 1}. ${p.name} — S/${p.price.toFixed(2)}`);
    return `🛒 Mi lista de compras (Buleje)\n${lines.join("\n")}\nTotal: S/${totalFavorites.toFixed(2)}`;
  };

  const buildShareText = () => {
    const lines = favProducts.map((p, i) => ` ${i + 1}. ${p.name} — S/${p.price.toFixed(2)}`);
    const storeUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `⭐ *Mis productos favoritos en Buleje*\n${lines.join("\n")}\n─────\n💰 Total: S/${totalFavorites.toFixed(2)}\n🛒 Compra aquí: ${storeUrl}`;
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(buildShareText())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareFavorites = async () => {
    const text = buildShareText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Mis favoritos — Buleje", text });
        return;
      } catch { /* user cancelled or not supported */ }
    }
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

  const exportFavorites = () => {
    navigator.clipboard.writeText(buildListText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  };

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
            <Heart className="h-6 w-6 text-[var(--data-error-500)] fill-[var(--data-error-500)]" />
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
              Mis Favoritos
            </h2>
            <span className="bg-red-100 dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-600)] dark:text-red-400 text-xs font-bold px-2.5 py-1 rounded-full">
              {favProducts.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Share via Web Share API or clipboard */}
            <button
              onClick={shareFavorites}
              className="flex items-center gap-2 bg-secondary text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
              aria-label="Compartir mis favoritos"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{copied ? "¡Copiado!" : "Compartir"}</span>
            </button>
            {/* Y2: Share via WhatsApp */}
            {/* TODO(#1): bg-[#25D366] is WhatsApp brand green — intentional, no token */}
            <button
              onClick={shareWhatsApp}
              className="flex items-center gap-2 bg-[#25D366] text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
              aria-label="Compartir lista por WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
            {/* Y2: Copy to clipboard */}
            <button
              onClick={exportFavorites}
              className="flex items-center gap-2 bg-gray-100 dark:bg-accent text-foreground rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-gray-200 dark:hover:bg-surface active:scale-95 transition-all"
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">{copied ? "¡Copiado!" : "Copiar lista"}</span>
            </button>
            <button
              onClick={addAll}
              className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-primary-dark active:scale-95 transition-all shadow-md"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="hidden sm:inline">Agregar todos</span>
            </button>
          </div>
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
                className="absolute top-2 right-2 z-10 flex items-center justify-center h-7 w-7 rounded-full bg-[var(--data-error-500)] text-white shadow-md hover:bg-[var(--data-error-600)] transition-colors"
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
                  {(() => { const qty = cartItems.find(i => i.id === product.id)?.quantity ?? 0; return qty > 0 ? (
                    <div className="flex items-center gap-0.5 bg-primary rounded-full px-1 py-1 shrink-0">
                      <button onClick={() => updateQty(product.id, qty - 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Disminuir">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-white font-extrabold text-sm min-w-5 text-center">{qty}</span>
                      <button onClick={() => updateQty(product.id, qty + 1)} className="h-7 w-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors" aria-label="Aumentar">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { addItem(product); showToast(product.name, product.image); }}
                      className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-primary text-white shadow-md hover:bg-primary-dark active:scale-95 transition-all"
                      aria-label={`Agregar ${product.name}`}
                    >
                      <ShoppingCart className="h-5 w-5" />
                    </button>
                  ); })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
