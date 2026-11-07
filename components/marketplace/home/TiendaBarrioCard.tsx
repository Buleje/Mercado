import Image from "next/image";
import Link from "next/link";
import { CardTitle } from "@buleje/design-system";
import { MapPin, Star } from "@buleje/design-system/icons";
import { getStoreCategoryIcon, STORE_CATEGORY_ICONS } from "@/components/marketplace/_category-icons";
import { ProductPhotoFallback } from "@/components/marketplace/ProductPhotoFallback";
import { StoreAvatar } from "@/components/marketplace/StoreAvatar";
import type { FeaturedStoreWithProducts } from "@/lib/db/marketplace-featured.db";
import {
  etiquetaCategoria,
  familiaDe,
  familiaPorId,
  sinTildes,
} from "@/lib/marketplace/familias-categoria";

/**
 * Tarjeta de «Tiendas de tu barrio» (home «Dosel», server-safe): portada,
 * logo montado sobre el borde, nombre, rubro + reseñas y 3 productos reales.
 * Toda la tarjeta es UN enlace a la tienda (sin enlaces anidados).
 */

/** Rubro en singular y con tildes: «polleria» → «Pollería». */
const RUBRO: Record<string, string> = {
  restaurante: "Restaurante",
  polleria: "Pollería",
  pizzeria: "Pizzería",
  cevicheria: "Cevichería",
  panaderia: "Panadería",
  carniceria: "Carnicería",
  bodega: "Bodega",
  abarrotes: "Abarrotes",
  minimarket: "Minimarket",
  fruteria: "Frutería",
  mercado: "Mercado",
  licoreria: "Licorería",
  farmacia: "Farmacia",
  botica: "Botica",
  ferreteria: "Ferretería",
  madereria: "Maderería",
  tecnologia: "Tecnología",
};

/** Mínimo de reseñas para mostrar la estrella (con menos, la cifra no dice nada). */
const MIN_RESENAS = 3;

export function TiendaBarrioCard({ tienda }: { tienda: FeaturedStoreWithProducts }) {
  const clave = sinTildes(tienda.category ?? "").trim();
  const rubro = RUBRO[clave] ?? (clave ? etiquetaCategoria(tienda.category) : "Tienda");
  const familia = familiaDe(tienda.category, tienda.name);
  const Glifo = STORE_CATEGORY_ICONS[clave]
    ? getStoreCategoryIcon(clave)
    : familiaPorId(familia).icon;
  const productos = tienda.productosDestacados.slice(0, 3);
  const extra = Math.max(0, tienda.productsCount - productos.length);
  const conResenas = tienda.reviewCount >= MIN_RESENAS && tienda.rating > 0;

  return (
    <Link
      href={`/marketplace/${tienda.slug}`}
      className="group relative flex h-full flex-col overflow-clip rounded-[var(--radius-xl)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] outline-none transition-[transform,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-editorial)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:hover:translate-y-0"
    >
      {/* Portada: el banner real o el tinte de la familia del rubro. */}
      <div data-familia={familia} className="relative h-24 shrink-0 bg-[var(--tinte-bg)]">
        {tienda.banner ? (
          <Image
            src={tienda.banner}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, 72vw"
            className="object-cover transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
        ) : (
          <>
            <span className="patron-familia" aria-hidden />
            <Glifo
              aria-hidden
              strokeWidth={1.5}
              className="absolute -bottom-3 right-4 h-20 w-20 -rotate-6 text-[var(--tinte-ink)] opacity-30"
            />
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4">
        <StoreAvatar
          name={tienda.name}
          logo={tienda.logo}
          size={56}
          rounded="rounded-[var(--radius-xl)]"
          className="relative z-[1] -mt-7 ring-4 ring-[var(--surface-raised)]"
        />
        <CardTitle as="h3" className="mt-2 truncate text-base font-bold text-[var(--text-primary)]">
          {tienda.name}
        </CardTitle>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
          <span className="truncate">{rubro}</span>
          <span aria-hidden>·</span>
          {conResenas ? (
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
              <Star
                aria-hidden
                className="h-3.5 w-3.5 fill-current text-[var(--data-warning-500)]"
                strokeWidth={0}
              />
              <span className="font-bold text-[var(--text-primary)]">
                {tienda.rating.toFixed(1)}
              </span>
              <span>({tienda.reviewCount})</span>
              <span className="sr-only">reseñas</span>
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-bold text-[var(--accent-ink)]">
              Nueva en Buleje
            </span>
          )}
        </p>
        {tienda.zone && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-[var(--text-tertiary)]">
            <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">{tienda.zone}</span>
          </p>
        )}

        {productos.length > 0 && (
          <ul className="mt-auto flex gap-2 pt-3" aria-label={`Productos de ${tienda.name}`}>
            {productos.map((p) => (
              <li
                key={p.id}
                className="relative h-14 w-14 shrink-0 overflow-clip rounded-[var(--radius-md)] bg-[var(--plato)]"
              >
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    sizes="56px"
                    className="object-cover mix-blend-multiply dark:mix-blend-normal"
                  />
                ) : (
                  <ProductPhotoFallback name={p.name} size="sm" forma="mini" />
                )}
              </li>
            ))}
            {extra > 0 && (
              <li className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-2 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                +{extra}
                <span className="sr-only"> productos más</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </Link>
  );
}
