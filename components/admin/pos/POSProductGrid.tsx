"use client";

import { Package, Star, ShoppingCart, AlertTriangle } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import POSProductImage from "@/components/admin/pos/POSProductImage";
import { estaAgotado } from "@/lib/pos/stock-vendible";
import { fmt, type Product, type CartItem } from "@/components/admin/pos/pos-shared";

interface POSProductGridProps {
  products: Product[];
  filtered: Product[];
  expanded: boolean;
  cart: CartItem[];
  favorites: number[];
  addToCart: (p: Product) => void;
  toggleFavorite: (productId: number) => void;
}

/** Grilla de productos del POS: un toque agrega al carrito. */
export default function POSProductGrid({ products, filtered, expanded, cart, favorites, addToCart, toggleFavorite }: POSProductGridProps) {
  return (
          <div className="flex-1 overflow-y-auto p-3">
            {products.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Sin productos"
                description="Agrega productos desde el módulo de Productos & Precios para empezar a vender."
              />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-[var(--text-tertiary)] dark:text-muted">
                <Package className="h-6 w-6 mb-2" />
                <p className="text-sm">No se encontraron productos</p>
              </div>
            ) : (
              <div className={cn(
                "grid gap-1.5",
                expanded
                  ? "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8"
                  : // En phone 2 columnas: con 3 las cards quedaban a ~106px y los
                    // nombres se apretaban a 2 líneas con clamp. 2-col = más legible.
                    "grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-5"
              )}>
                {filtered.map(p => {
                  const inCart = cart.find(i => i.product.id === p.id);
                  const outOfStock = estaAgotado(p);
                  const isFav = favorites.includes(p.id);
                  return (
                    <div key={p.id} className="relative">
                    <button
                      onClick={() => !outOfStock && addToCart(p)}
                      disabled={outOfStock}
                      className={cn(
                        "block w-full h-full bg-[var(--surface-raised)] rounded-xl border p-1.5 text-left transition-all hover:shadow-[var(--shadow-sm)] relative",
                        inCart ? "border-primary ring-1 ring-primary/20" : "border-[var(--rule-soft)] hover:border-[var(--rule-base)]",
                        outOfStock && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="aspect-[16/10] sm:aspect-[5/4] rounded-md overflow-hidden bg-[var(--surface-sunken)] mb-1 relative">
                        <POSProductImage src={p.image} name={p.name} />
                        {inCart && (
                          <div className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-primary text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center">
                            {inCart.quantity}
                          </div>
                        )}
                        {/* Feature 2: Badge stock bajo — punto de advertencia sutil */}
                        {!inCart && !outOfStock && p.stock != null && p.stock > 0 && p.stock <= 5 && (
                          <div
                            className="absolute top-1 right-1 z-10 group"
                            role="img"
                            aria-label={`Stock bajo: ${p.stock} unidad${p.stock !== 1 ? "es" : ""}`}
                          >
                            <AlertTriangle
                              className="h-4 w-4 text-[var(--data-warning-500)] drop-shadow-sm"
                              fill="var(--data-warning-100)"
                              strokeWidth={2}
                            />
                            {/* Tooltip */}
                            <span className="pointer-events-none absolute right-0 top-5 z-20 hidden group-hover:flex whitespace-nowrap bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning-500)] shadow-[var(--shadow-sm)]">
                              Stock bajo ({p.stock})
                            </span>
                          </div>
                        )}
                        {outOfStock && (
                          <div className="absolute inset-0 bg-[var(--surface-raised)]/60 flex items-center justify-center">
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] px-1.5 py-0.5 rounded">Agotado</span>
                          </div>
                        )}
                        {p.type === "service" && (
                          <span className="absolute bottom-0.5 left-0.5 z-10 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-white shadow-sm">
                            Servicio
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold leading-tight text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2 min-h-[2.2em]">{p.name}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs font-extrabold text-primary tabular-nums">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn("text-[length:var(--ts-2xs)] tabular-nums", p.stock <= (p.stockMin || 5) ? "text-[var(--data-warning-500)] font-semibold" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {p.stock}
                          </span>
                        )}
                      </div>
                    </button>
                    {/* Hermano del tile, no descendiente: un <button> adentro de
                        otro <button> es "nested-interactive" para axe (56 nodos
                        medidos). Misma posición visual de siempre (9px = borde
                        1px + padding 6px del tile + 2px que tenía adentro). */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
                      aria-label={isFav ? `Quitar ${p.name} de favoritos` : `Agregar ${p.name} a favoritos`}
                      aria-pressed={isFav}
                      className="absolute top-[9px] left-[9px] h-5 w-5 rounded-full bg-white/90 dark:bg-[var(--surface-raised)]/90 backdrop-blur-sm flex items-center justify-center hover:bg-[var(--surface-raised)] dark:hover:bg-[var(--surface-raised)] transition-colors z-10 cursor-pointer"
                    >
                      <Star className={cn("h-3 w-3", isFav ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)] dark:text-muted")} />
                    </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
  );
}
