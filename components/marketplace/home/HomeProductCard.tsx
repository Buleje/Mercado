"use client";

/**
 * HomeProductCard — la tarjeta de producto de la home «Dosel» (2026-10-10).
 *
 * Densa y apetitosa: pozo de imagen con el «+» que se vuelve contador, precio
 * partido ARRIBA del nombre, nombre en 2 líneas y la unidad. Se fue lo que no
 * ayuda a decidir: «Stock: 999» (centinela de los restaurantes), la descripción,
 * el nombre de la tienda en texto (54 % es la misma pollería → avatar de 24 px)
 * y «comparar». La lógica de carrito es la MISMA de UnifiedProductCard
 * (hooks/use-agregar-producto). Toda la tarjeta enlaza al detalle con un <Link>
 * hermano a todo el tamaño; el «+» va encima (nunca un button dentro de un a).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";
import { ProductPhotoFallback } from "@/components/marketplace/ProductPhotoFallback";
import { StoreAvatar } from "@/components/marketplace/StoreAvatar";
import AgregarControl from "@/components/marketplace/home/AgregarControl";
import PrecioPartes from "@/components/marketplace/home/PrecioPartes";
import { useAgregarProducto } from "@/hooks/use-agregar-producto";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { cn } from "@/lib/utils";

// El modal «Arma tu pedido» solo se descarga si alguien lo abre.
const ProductModifierModal = dynamic(() => import("@/components/marketplace/ProductModifierModal"));

export interface HomeProductCardProps {
  product: UnifiedProductCardProduct;
  href?: string;
  index?: number;
  aboveFold?: boolean;
  /** Oculta el avatar de la tienda (carril de una sola tienda). */
  ocultarTienda?: boolean;
  /** Puesto de ranking 1-6 («Lo más pedido»): numeral grande sobre la foto. */
  puesto?: number;
  /** "denso" = carriles y grilla (default) · "fila" = ticket horizontal (urgencia). */
  forma?: "denso" | "fila";
}

const UNIDADES: Record<string, string> = { und: "unidad", unid: "unidad", u: "unidad" };

/** «porción» → «por porción»; sin unidad, nada. */
function metaDeUnidad(unit?: string | null): string | null {
  const u = unit?.trim().toLowerCase();
  if (!u) return null;
  return `por ${UNIDADES[u] ?? u}`;
}

type Insignia = { texto: string; aria?: string; clase: string } | null;

/** UNA sola insignia, por prioridad: Agotado › −X % › Quedan N (≤ 5). */
function insigniaDe(p: UnifiedProductCardProduct): Insignia {
  if (p.stock === 0) {
    return { texto: "Agotado", clase: "bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-1 ring-[var(--rule-base)]" };
  }
  const precio = Number(p.price);
  const antes = p.originalPrice != null ? Number(p.originalPrice) : NaN;
  const pct =
    p.discount && p.discount > 0
      ? Math.round(p.discount)
      : antes > precio
        ? Math.round((1 - precio / antes) * 100)
        : 0;
  if (pct > 0) return { texto: `−${pct} %`, aria: `${pct} % de descuento`, clase: "bg-[var(--data-warning-700)] text-white" };
  if (p.stock != null && p.stock > 0 && p.stock <= 5) {
    return { texto: `Quedan ${p.stock}`, clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" };
  }
  return null;
}

export default function HomeProductCard({
  product,
  href,
  index = 0,
  aboveFold = false,
  ocultarTienda = false,
  puesto,
  forma = "denso",
}: HomeProductCardProps) {
  const carrito = useAgregarProducto(product);
  const [modalMontado, setModalMontado] = useState(false);
  if (carrito.modalProps.open && !modalMontado) setModalMontado(true);

  const productHref =
    href ?? (product.storeSlug ? `/marketplace/${product.storeSlug}/producto/${product.id}` : "/marketplace");
  const { onMouseEnter, onMouseLeave } = useHoverPrefetch(productHref);
  const insignia = insigniaDe(product);
  const meta = metaDeUnidad(product.unit);
  const fila = forma === "fila";
  const conTienda = !ocultarTienda && !!product.storeName && !fila;

  const pozo = (
    <div
      ref={carrito.imgWrapRef}
      className={cn(
        "relative overflow-hidden bg-[var(--plato)]",
        fila ? "aspect-square w-[72px] rounded-lg" : "aspect-square rounded-xl",
      )}
    >
      {product.image ? (
        <Image
          src={product.image}
          alt=""
          fill
          priority={aboveFold && index < 4}
          sizes={fila ? "72px" : "(max-width: 640px) 46vw, (max-width: 1024px) 24vw, 200px"}
          className={cn(
            "object-cover mix-blend-multiply transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.04] motion-reduce:transform-none dark:mix-blend-normal",
            carrito.isOutOfStock && "grayscale-[60%]",
          )}
        />
      ) : (
        <ProductPhotoFallback name={product.name} category={product.category} forma={fila ? "mini" : "tile"} />
      )}
      {!fila && insignia && (
        <span
          aria-label={insignia.aria}
          className={cn(
            "absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums shadow-[var(--shadow-sm)]",
            insignia.clase,
          )}
        >
          {insignia.texto}
        </span>
      )}
      {!fila && (puesto || conTienda) && (
        <div className="pointer-events-none absolute bottom-1.5 left-2 flex items-end gap-1.5">
          {puesto ? (
            <span
              aria-label={`Puesto ${puesto}`}
              className="text-[length:var(--ts-3xl)] font-black leading-[0.8] tracking-[-0.06em] text-[var(--dosel-950)] [-webkit-text-stroke:5px_white] [paint-order:stroke_fill]"
            >
              {puesto}
            </span>
          ) : null}
          {conTienda && (
            <span role="img" aria-label={`de ${product.storeName}`} title={`de ${product.storeName}`} className="mb-0.5 inline-flex">
              <StoreAvatar
                name={product.storeName ?? ""}
                logo={product.storeLogo}
                size={24}
                rounded="rounded-full"
                className="ring-2 ring-[var(--surface-raised)]"
              />
            </span>
          )}
        </div>
      )}
    </div>
  );

  const control = (
    <AgregarControl
      nombre={product.name}
      cantidad={carrito.inCartQty}
      agotado={carrito.isOutOfStock}
      enTope={carrito.atStockCap}
      pendiente={carrito.pendiente}
      avisarHref={carrito.notifyWaHref}
      onAgregar={() => void carrito.agregarRapido(carrito.inCartQty > 0 ? { festejar: false } : undefined)}
      onQuitar={carrito.quitarUno}
      onPreparar={carrito.prepararGrupos}
      className={fila ? "relative" : "absolute bottom-1.5 right-1.5"}
    />
  );

  const textos = (
    <>
      <PrecioPartes precio={product.price} anterior={product.originalPrice} tamano={fila ? "lg" : "auto"} />
      <h3
        className={cn(
          "mt-1 line-clamp-2 text-sm font-medium leading-5 text-[var(--text-primary)]",
          !fila && "min-h-[2.5rem]",
        )}
      >
        {product.name}
      </h3>
      {fila && insignia ? (
        <span aria-label={insignia.aria} className={cn("mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", insignia.clase)}>
          {insignia.texto}
        </span>
      ) : (
        meta && <p className="mt-0.5 truncate text-xs font-medium text-[var(--text-tertiary)]">{meta}</p>
      )}
    </>
  );

  return (
    <article
      className={cn(
        "group relative @container rounded-xl transition-colors duration-[var(--dur-fast)]",
        fila
          ? "grid grid-cols-[72px_1fr_auto] items-center gap-3 bg-[var(--surface-raised)] p-2 hover:bg-[var(--surface-sunken)]"
          : "flex flex-col p-1.5 hover:bg-[var(--surface-sunken)]",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* El enlace cubre la tarjeta entera; lo interactivo va encima con z-10. */}
      <Link
        href={productHref}
        aria-label={product.name}
        className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
      {fila ? (
        <>
          {pozo}
          <div className="min-w-0">{textos}</div>
          <div className="relative z-10">{control}</div>
        </>
      ) : (
        <>
          <div className="relative">
            {pozo}
            <div className="absolute inset-0 z-10 pointer-events-none [&>*]:pointer-events-auto">{control}</div>
          </div>
          <div className="px-1 pb-1 pt-2">{textos}</div>
        </>
      )}
      {modalMontado && <ProductModifierModal {...carrito.modalProps} />}
    </article>
  );
}
