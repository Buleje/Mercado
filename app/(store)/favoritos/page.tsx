"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Heart,
  ShoppingCart,
  X,
  Share2,
  ChevronRight,
  SortAsc,
  Store,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Kicker } from "@/components/ui-system/Kicker";
import { EmptyState } from "@/components/ui-system/EmptyState";
import { CanastaVacia, CorazonLatiendo } from "@/components/ui-system/illustrations";
import {
  MOCK_WISHLIST_PRODUCTS,
  MOCK_SUGGESTIONS,
  type WishlistProduct,
} from "@/lib/mock-wishlist";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

// ── Types ──────────────────────────────────────────────────────────

type SortKey = "reciente" | "antiguo" | "precio_asc" | "disponibilidad";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "reciente", label: "Más reciente" },
  { value: "antiguo", label: "Más antiguo" },
  { value: "precio_asc", label: "Precio: menor a mayor" },
  { value: "disponibilidad", label: "Disponibilidad" },
];

// ── Helpers ────────────────────────────────────────────────────────

function sortProducts(
  products: WishlistProduct[],
  sort: SortKey,
  onlyInStock: boolean
): WishlistProduct[] {
  let filtered = onlyInStock ? products.filter((p) => p.inStock) : products;
  return [...filtered].sort((a, b) => {
    if (sort === "reciente") return b.addedAt - a.addedAt;
    if (sort === "antiguo") return a.addedAt - b.addedAt;
    if (sort === "precio_asc") return a.price - b.price;
    if (sort === "disponibilidad") {
      return (b.inStock ? 1 : 0) - (a.inStock ? 1 : 0);
    }
    return 0;
  });
}

// ── WishlistProductCard ────────────────────────────────────────────

function WishlistProductCard({
  product,
  onRemove,
  onAddToCart,
}: {
  product: WishlistProduct;
  onRemove: (id: string) => void;
  onAddToCart: (product: WishlistProduct) => void;
}) {
  return (
    <div
      className={cn(
        "relative bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl overflow-hidden",
        "hover:shadow-md transition-shadow duration-200",
        !product.inStock && "opacity-75"
      )}
    >
      {/* Imagen placeholder */}
      <div className="relative aspect-square bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Package className="h-10 w-10 text-gray-200 dark:text-gray-700" strokeWidth={1} />

        {/* Badge sin stock */}
        {!product.inStock && (
          <div className="absolute bottom-2 left-2 right-2">
            <span className="w-full flex justify-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-md">
              Sin stock
            </span>
          </div>
        )}

        {/* Botón quitar */}
        <button
          onClick={() => onRemove(product.id)}
          aria-label={`Quitar ${product.name} de favoritos`}
          className={cn(
            "absolute top-2 right-2 h-7 w-7 rounded-full flex items-center justify-center",
            "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
            "text-gray-400 hover:text-red-500 dark:hover:text-red-400",
            "hover:border-red-200 dark:hover:border-red-800 transition-colors shadow-sm"
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Heart filled indicador */}
        <div className="absolute top-2 left-2 h-5 w-5 flex items-center justify-center">
          <Heart className="h-3.5 w-3.5 fill-rose-400 text-rose-400" />
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-2">
        {/* Tienda */}
        <div className="flex items-center gap-1">
          <Store className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{product.storeName}</span>
        </div>

        <Link href={`/tienda/${product.id}`}>
          <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 hover:text-[var(--brand-primary)] transition-colors leading-snug">
            {product.name}
          </p>
        </Link>

        <span className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
          S/{product.price.toFixed(2)}
          <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)] ml-1">/{product.unit}</span>
        </span>

        <button
          onClick={() => product.inStock && onAddToCart(product)}
          disabled={!product.inStock}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full min-h-[36px] rounded-lg text-xs font-bold transition-all",
            product.inStock
              ? "bg-[var(--brand-primary)] text-white hover:opacity-90 active:scale-95"
              : "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
          )}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {product.inStock ? "Agregar" : "No disponible"}
        </button>
      </div>
    </div>
  );
}

// ── SuggestionCard ─────────────────────────────────────────────────

function SuggestionCard({ product }: { product: WishlistProduct }) {
  return (
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className="aspect-square bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Package className="h-8 w-8 text-gray-200 dark:text-gray-700" strokeWidth={1} />
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Store className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{product.storeName}</span>
        </div>
        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-snug">
          {product.name}
        </p>
        <span className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
          S/{product.price.toFixed(2)}
        </span>
        <button className="flex items-center justify-center gap-1.5 w-full min-h-[34px] rounded-lg text-[length:var(--ts-2xs)] font-bold bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/20 transition-colors">
          <Heart className="h-3 w-3" />
          Guardar
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function FavoritosPage() {
  // MVP: los items vienen del mock (en production vendrían del contexto/API)
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("reciente");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  const allProducts = useMemo(
    () => MOCK_WISHLIST_PRODUCTS.filter((p) => !removedIds.has(p.id)),
    [removedIds]
  );

  const sortedProducts = useMemo(
    () => sortProducts(allProducts, sort, onlyInStock),
    [allProducts, sort, onlyInStock]
  );

  const hasInStock = allProducts.some((p) => p.inStock);
  const isEmpty = allProducts.length === 0;

  function handleRemove(id: string) {
    setRemovedIds((prev) => new Set([...prev, id]));
  }

  function handleClearAll() {
    setRemovedIds(new Set(MOCK_WISHLIST_PRODUCTS.map((p) => p.id)));
    setShowConfirmClear(false);
  }

  function handleAddToCart(product: WishlistProduct) {
    // Preview UI only — totales en backend (regla crítica #1)
    void product;
  }

  function handleAddAllToCart() {
    const inStockProducts = sortedProducts.filter((p) => p.inStock);
    void inStockProducts;
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/favoritos`;
    void navigator.clipboard.writeText(url).catch(() => {});
    setShareMessage("Enlace copiado");
    setTimeout(() => setShareMessage(""), 2000);
  }

  function handleWhatsApp() {
    const url = `${window.location.origin}/favoritos`;
    const text = `Mira mi lista de favoritos en Buleje: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Más reciente";

  return (
    <div className="min-h-screen bg-[var(--surface-bg)] dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Favoritos", url: "https://www.buleje.pe/favoritos" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        className="pt-32 sm:pt-36 pb-10 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "#060a0d" }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <nav
            aria-label="Migas de pan"
            className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 mb-6"
          >
            <Link href="/" className="hover:text-white/60 transition-colors">Inicio</Link>
            <span>/</span>
            <Link href="/cuenta" className="hover:text-white/60 transition-colors">Mi cuenta</Link>
            <span>/</span>
            <span className="text-white/55">Favoritos</span>
          </nav>

          <div className="flex items-end justify-between gap-6">
            <div className="flex-1">
              <Kicker className="text-white/40 mb-2">FAVORITOS</Kicker>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight tracking-[-0.02em]">
                Lo que quieres, guardado
              </h1>
              <p className="text-sm text-white/50 mt-2 max-w-sm leading-relaxed">
                Productos que apartaste para comprar después
              </p>
              <p className="text-xs text-white/30 mt-3 tabular-nums">
                {isEmpty
                  ? "Lista vacía"
                  : `${allProducts.length} producto${allProducts.length !== 1 ? "s" : ""} en tu lista`}
              </p>
            </div>

            {/* Ilustración contextual — corazón editorial */}
            <div className="hidden sm:flex items-center justify-center shrink-0">
              <div className="w-28 h-28 rounded-2xl bg-teal-900/30 border border-teal-700/30 flex items-center justify-center">
                <CorazonLatiendo size={88} className="text-teal-400/70" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8 pb-28">

        {/* ── Toolbar ───────────────────────────────────────────── */}
        {!isEmpty && (
          <section aria-label="Controles de la lista">
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortMenu((v) => !v)}
                  aria-expanded={showSortMenu}
                  aria-haspopup="listbox"
                  className={cn(
                    "flex items-center gap-2 h-9 px-3 rounded-lg border border-[var(--rule-soft)]",
                    "bg-[var(--surface-canvas)] text-xs font-medium text-[var(--text-secondary)]",
                    "hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  )}
                >
                  <SortAsc className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  {currentSortLabel}
                </button>

                {showSortMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSortMenu(false)}
                      aria-hidden="true"
                    />
                    <ul
                      role="listbox"
                      className={cn(
                        "absolute top-full mt-1 left-0 z-20 min-w-[200px]",
                        "bg-[var(--surface-canvas)] border border-[var(--rule-soft)]",
                        "rounded-xl shadow-md overflow-hidden py-1"
                      )}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <li key={opt.value}>
                          <button
                            role="option"
                            aria-selected={sort === opt.value}
                            onClick={() => {
                              setSort(opt.value);
                              setShowSortMenu(false);
                            }}
                            className={cn(
                              "w-full text-left px-4 py-2.5 text-xs transition-colors",
                              sort === opt.value
                                ? "bg-[var(--brand-primary)]/8 text-[var(--brand-primary)] font-bold"
                                : "text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-900 font-medium"
                            )}
                          >
                            {opt.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Solo en stock toggle */}
              <button
                role="switch"
                aria-checked={onlyInStock}
                onClick={() => setOnlyInStock((v) => !v)}
                className={cn(
                  "flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-medium transition-colors",
                  onlyInStock
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                <span
                  className={cn(
                    "w-7 h-4 rounded-full relative transition-colors",
                    onlyInStock ? "bg-[var(--brand-primary)]" : "bg-gray-200 dark:bg-gray-700"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                      onlyInStock ? "translate-x-3.5" : "translate-x-0.5"
                    )}
                  />
                </span>
                Solo en stock
              </button>

              <div className="flex-1" />

              {/* Vaciar lista */}
              {!showConfirmClear ? (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--rule-soft)]",
                    "text-xs font-medium text-[var(--text-tertiary)]",
                    "hover:border-red-300 hover:text-red-500 dark:hover:border-red-800 dark:hover:text-red-400",
                    "transition-colors"
                  )}
                >
                  Vaciar lista
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-lg px-3 py-1.5">
                  <span className="text-[length:var(--ts-2xs)] text-red-600 dark:text-red-400 font-medium">
                    Confirmar?
                  </span>
                  <button
                    onClick={handleClearAll}
                    className="text-[length:var(--ts-2xs)] font-bold text-red-600 dark:text-red-400 hover:underline"
                  >
                    Si, vaciar
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="text-[length:var(--ts-2xs)] font-medium text-gray-500 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Agregar todo */}
              {hasInStock && (
                <button
                  onClick={handleAddAllToCart}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-4 rounded-lg",
                    "bg-[var(--brand-primary)] text-white text-xs font-bold",
                    "hover:opacity-90 active:scale-95 transition-all"
                  )}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Agregar todo
                </button>
              )}
            </div>
          </section>
        )}

        {/* ── Grid de favoritos ─────────────────────────────────── */}
        <section aria-labelledby="wishlist-heading">
          <h2 id="wishlist-heading" className="sr-only">Tus productos favoritos</h2>

          {isEmpty ? (
            <div className="bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl">
              <EmptyState
                illustration={<CanastaVacia size={140} />}
                eyebrow="Favoritos"
                title="No tienes favoritos aún"
                description="Tocá el corazón en cualquier producto para guardarlo aquí y comprarlo después."
                action={
                  <Link
                    href="/tienda"
                    className={cn(
                      "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg",
                      "bg-[var(--brand-primary)] text-white text-sm font-bold",
                      "hover:opacity-90 transition-opacity"
                    )}
                  >
                    <ShoppingCart className="h-4 w-4" strokeWidth={1.75} />
                    Explorar productos
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              {sortedProducts.length === 0 ? (
                <div className="bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl">
                  <EmptyState
                    title="Ningún producto cumple el filtro"
                    description="Desactivá el filtro de stock para ver todos tus favoritos."
                    action={
                      <button
                        onClick={() => setOnlyInStock(false)}
                        className="px-4 py-2 rounded-lg border border-[var(--rule-soft)] text-sm font-semibold text-[var(--text-secondary)] hover:border-gray-300 transition-colors"
                      >
                        Mostrar todos
                      </button>
                    }
                    size="sm"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {sortedProducts.map((product) => (
                    <WishlistProductCard
                      key={product.id}
                      product={product}
                      onRemove={handleRemove}
                      onAddToCart={handleAddToCart}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Sugerencias ───────────────────────────────────────── */}
        {!isEmpty && (
          <section aria-labelledby="suggestions-heading">
            <div className="mb-4">
              <Kicker className="mb-1">TE PODRIA INTERESAR</Kicker>
              <h2
                id="suggestions-heading"
                className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight"
              >
                Basado en tus favoritos
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {MOCK_SUGGESTIONS.map((product) => (
                <SuggestionCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}

        {/* ── Compartir lista ───────────────────────────────────── */}
        {!isEmpty && (
          <section aria-labelledby="share-heading">
            <div
              className={cn(
                "bg-[var(--surface-canvas)] border border-[var(--rule-soft)] rounded-xl p-5",
                "flex flex-col sm:flex-row sm:items-center gap-4"
              )}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-900 flex items-center justify-center shrink-0">
                  <Share2 className="h-4.5 w-4.5 text-[var(--text-tertiary)]" />
                </div>
                <div className="min-w-0">
                  <p
                    id="share-heading"
                    className="text-sm font-semibold text-[var(--text-primary)]"
                  >
                    Comparte tu lista con amigos
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    Enviala por WhatsApp o copia el enlace
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleCopyLink}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--rule-soft)]",
                    "text-xs font-semibold text-[var(--text-secondary)] hover:border-gray-300 dark:hover:border-gray-600",
                    "transition-colors"
                  )}
                >
                  {shareMessage || "Copiar enlace"}
                </button>

                <button
                  onClick={handleWhatsApp}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-3 rounded-lg",
                    "bg-[#25D366] text-white text-xs font-bold hover:opacity-90 transition-opacity"
                  )}
                >
                  WhatsApp
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Link volver a cuenta ─────────────────────────────── */}
        <div className="flex items-center gap-1.5">
          <Link
            href="/cuenta"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Volver a mi cuenta
          </Link>
        </div>
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
