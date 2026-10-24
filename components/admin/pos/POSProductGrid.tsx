"use client";

/**
 * Catálogo del POS: un toque agrega al carrito.
 *
 * H07/M09/M10 (17-10): las tarjetas eran de ~6,5 rem, con iniciales grandes que
 * peleaban con el nombre, el distintivo «Servicio» encima de la imagen y el
 * stock crudo («0» en un servicio). Ahora hay dos vistas que se recuerdan
 * (tarjetas amplias o lista), la foto es una franja baja y la disponibilidad
 * se lee según el tipo: «35 kg», «45 min», «Por hora», «Agotado».
 */
import { AlertTriangle, Package, ShoppingCart, Star } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import { cn } from "@/lib/utils";
import POSProductImage from "@/components/admin/pos/POSProductImage";
import { estaAgotado } from "@/lib/pos/stock-vendible";
import { disponibilidadPOS, type Disponibilidad } from "@/components/admin/pos/disponibilidad";
import { fmt, type Product, type CartItem } from "@/components/admin/pos/pos-shared";
import { useVistaCatalogo } from "@/components/admin/pos/vista-catalogo";

interface POSProductGridProps {
  products: Product[];
  filtered: Product[];
  expanded: boolean;
  cart: CartItem[];
  favorites: number[];
  addToCart: (p: Product) => void;
  toggleFavorite: (productId: number) => void;
}

interface ItemProps {
  p: Product;
  enCarrito: number | null;
  isFav: boolean;
  addToCart: (p: Product) => void;
  toggleFavorite: (productId: number) => void;
}

/** El alta de productos vive en Productos & Precios: el vacío del POS lleva ahí (evento que escucha el panel). */
const irAProductos = () => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "productos" } }));

const TONO_NIVEL: Record<Disponibilidad["nivel"], string> = {
  ok: "text-[var(--text-secondary)]",
  "sin-control": "text-[var(--text-secondary)]",
  bajo: "font-semibold text-[var(--data-warning-ink)]",
  agotado: "font-semibold text-[var(--data-error-ink)]",
};

function LineaDisponible({ d, className }: { d: Disponibilidad; className?: string }) {
  if (!d.texto) return null;
  // El triángulo de «stock bajo» que flotaba sobre la foto ahora va al lado de la cifra.
  const texto = d.nivel === "bajo" ? `Quedan ${d.texto}` : d.texto;
  return (
    <span className={cn("flex min-w-0 items-center gap-1 text-xs tabular-nums", TONO_NIVEL[d.nivel], className)}>
      {d.nivel === "bajo" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{texto}</span>
    </span>
  );
}

function Distintivo({ texto }: { texto: string }) {
  return (
    <span className="inline-flex shrink-0 items-center self-start rounded-md border border-[var(--rule-base)] px-1.5 text-xs font-semibold text-[var(--text-secondary)]">
      {texto}
    </span>
  );
}

function Precio({ p, d }: { p: Product; d: Disponibilidad }) {
  return (
    <span className="shrink-0 whitespace-nowrap tabular-nums">
      <span className="text-sm font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmt(p.price)}</span>
      {d.sufijoPrecio && <span className="ml-0.5 text-xs text-[var(--text-secondary)]">{d.sufijoPrecio}</span>}
    </span>
  );
}

function Cantidad({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("flex h-6 min-w-[1.5rem]! items-center justify-center rounded-full bg-[var(--text-primary)] px-1.5 text-xs font-bold tabular-nums text-[var(--surface-raised)]", className)}>
      {n}
    </span>
  );
}

/** Hermano del ítem, no descendiente: un <button> dentro de otro es «nested-interactive» para axe. */
function BotonFavorito({ p, isFav, toggleFavorite, className }: Pick<ItemProps, "p" | "isFav" | "toggleFavorite"> & { className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }}
      aria-label={isFav ? `Quitar ${p.name} de favoritos` : `Agregar ${p.name} a favoritos`}
      aria-pressed={isFav}
      className={cn("flex cursor-pointer items-center justify-center transition-colors", className)}
    >
      <Star className={cn("h-3.5 w-3.5", isFav ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)] dark:text-muted")} />
    </button>
  );
}

function Tarjeta({ p, enCarrito, isFav, addToCart, toggleFavorite }: ItemProps) {
  const d = disponibilidadPOS(p);
  const agotado = estaAgotado(p);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !agotado && addToCart(p)}
        disabled={agotado}
        className={cn(
          "flex h-full w-full flex-col gap-1 rounded-xl border bg-[var(--surface-raised)] p-2 text-left transition-all hover:shadow-[var(--shadow-sm)]",
          enCarrito ? "border-primary ring-1 ring-primary/20" : "border-[var(--rule-soft)] hover:border-[var(--rule-base)]",
          agotado && "cursor-not-allowed opacity-50",
        )}
      >
        {/* Franja baja: la foto se reconoce igual y, sin foto, las iniciales ya no ocupan media tarjeta. */}
        <span className="relative block aspect-[5/2] overflow-hidden rounded-md bg-[var(--surface-sunken)]">
          <POSProductImage src={p.image} name={p.name} />
          {enCarrito != null && <Cantidad n={enCarrito} className="absolute right-1 top-1" />}
        </span>
        {d.distintivo && <Distintivo texto={d.distintivo} />}
        <span className="line-clamp-2 text-sm font-semibold leading-tight text-[var(--text-primary)]">{p.name}</span>
        <span className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2">
          <Precio p={p} d={d} />
          <LineaDisponible d={d} />
        </span>
      </button>
      {/* 11 px = borde 1 + padding 8 + 2 adentro de la franja. */}
      <BotonFavorito p={p} isFav={isFav} toggleFavorite={toggleFavorite} className="absolute left-[11px] top-[11px] z-10 h-6 w-6 rounded-full bg-[var(--surface-raised)]/90 backdrop-blur-sm hover:bg-[var(--surface-raised)]" />
    </div>
  );
}

function Fila({ p, enCarrito, isFav, addToCart, toggleFavorite }: ItemProps) {
  const d = disponibilidadPOS(p);
  const agotado = estaAgotado(p);
  return (
    <li className="flex items-stretch">
      <button
        type="button"
        onClick={() => !agotado && addToCart(p)}
        disabled={agotado}
        className={cn(
          "flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 pl-3 text-left transition-colors hover:bg-[var(--surface-sunken)]",
          enCarrito != null && "bg-[var(--surface-sunken)]",
          agotado && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.name}</span>
            {d.distintivo && <Distintivo texto={d.distintivo} />}
          </span>
          <LineaDisponible d={d} />
        </span>
        {enCarrito != null && <Cantidad n={enCarrito} />}
        <Precio p={p} d={d} />
      </button>
      <BotonFavorito p={p} isFav={isFav} toggleFavorite={toggleFavorite} className="h-12 w-12 shrink-0 hover:bg-[var(--surface-sunken)]" />
    </li>
  );
}

export default function POSProductGrid({ products, filtered, expanded, cart, favorites, addToCart, toggleFavorite }: POSProductGridProps) {
  const [vista] = useVistaCatalogo();

  const item = (p: Product) => ({
    p,
    enCarrito: cart.find((i) => i.product.id === p.id)?.quantity ?? null,
    isFav: favorites.includes(p.id),
    addToCart,
    toggleFavorite,
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3" data-pos-grilla data-vista={vista}>
      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Sin productos"
          description="Agrega tus productos para empezar a vender."
          action={{ label: "Ir a Productos", onClick: irAProductos }}
        />
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center text-[var(--text-tertiary)] dark:text-muted">
          <Package className="mb-2 h-6 w-6" />
          <p className="text-sm">No se encontraron productos</p>
        </div>
      ) : vista === "lista" ? (
        <ul className="divide-y divide-[var(--rule-soft)] overflow-clip rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          {filtered.map((p) => <Fila key={p.id} {...item(p)} />)}
        </ul>
      ) : (
        <div
          className={cn(
            "grid gap-2",
            // Las columnas salen del ancho que queda (no del de la ventana). En celular, 2.
            expanded
              ? "grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]"
              : "grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]",
          )}
        >
          {filtered.map((p) => <Tarjeta key={p.id} {...item(p)} />)}
        </div>
      )}
    </div>
  );
}
