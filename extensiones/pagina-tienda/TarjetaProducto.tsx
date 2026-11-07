"use client";

/**
 * Tarjeta de un producto de la tienda de cualquier negocio (ADR-511; el
 * formato de Musa): la foto cuadrada sobre un panel gris claro redondeado, sin
 * borde ni sombra; arriba a la izquierda el «-N %» y la etiqueta del dueño;
 * debajo la marca (o la categoría) en gris, el nombre en 2 líneas, la
 * presentación y el precio con el «antes» tachado. «Agregar» se vuelve el
 * contador `[− n +]` (`BotonAgregar`) y pone «✓ En tu bolsa» sobre la foto.
 *
 * · Sin foto (`imagen: ""`, la mayoría de los negocios al empezar) o si la foto
 *   no carga: un ícono sobre el gris, nunca un `<img src="">`.
 * · Toda la tarjeta abre la ficha: el enlace del nombre se estira
 *   (`after:inset-0`); «Agregar» va encima (`relative z-[1]`).
 * · La fila precio + botón se acomoda al ancho de la TARJETA (`@container`):
 *   la misma tarjeta vive en la grilla del catálogo y en los carriles de la portada.
 * · Sin existencias cargadas (`stock: null`) nunca dice «agotado» ni «quedan».
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Package } from "@buleje/design-system/icons";
import { nombreDeCategoria } from "./armado";
import { BotonAgregar, useEnBolsa } from "./BotonAgregar";
import type { ProductoTienda } from "./contenido";
import { aProducto } from "./producto-carrito";
import { solesCortos } from "./ui";

/** Desde cuántas unidades se avisa «¡Quedan N!». */
export const POCAS = 5;

/**
 * La foto del producto (cubre su caja: `object-cover`), o el marcador con el
 * ícono si no hay o no carga. El error se escucha y, por si llegó antes de
 * hidratar (React no lo vio), se mira al montar.
 */
export function FotoProducto({
  src,
  alt = "",
  prioridad = false,
  tamanos = "(min-width:1280px) 300px, (min-width:768px) 33vw, 50vw",
  className = "",
  icono = "h-[28%] w-[28%]",
}: {
  src: string;
  alt?: string;
  prioridad?: boolean;
  tamanos?: string;
  className?: string;
  icono?: string;
}) {
  const [falla, setFalla] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFalla(false);
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFalla(true);
  }, [src]);

  if (!src.trim() || falla) {
    return (
      <span className="absolute inset-0 flex items-center justify-center text-[var(--ti-texto-3)]" {...(alt ? { role: "img", "aria-label": `${alt} (sin foto)` } : {})}>
        <Package className={icono} strokeWidth={1.25} aria-hidden="true" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fotos del negocio de cualquier host; con next/image no se ve el error para caer al marcador
    <img
      ref={img}
      src={src}
      alt={alt}
      sizes={tamanos}
      loading={prioridad ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={prioridad ? "high" : "auto"}
      onError={() => setFalla(true)}
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    />
  );
}

/** «-25 %» en el acento del negocio. */
export function Descuento({ n, grande = false }: { n: number; grande?: boolean }) {
  return (
    <span className={`rounded-[var(--ti-radio-pill)] bg-[var(--ti-acento)] font-bold tabular-nums text-[var(--ti-sobre-acento)] ${grande ? "px-3 py-1.5 text-[0.9375rem]" : "px-2.5 py-1 text-sm"}`}>
      <span className="sr-only">Descuento de </span>-{n} %
    </span>
  );
}

/** La etiqueta que puso el dueño («Nuevo», «Más vendido»): píldora clara con el punto del acento. */
export function Insignia({ texto, grande = false }: { texto: string; grande?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--ti-radio-pill)] bg-[var(--ti-fondo)] font-medium text-[var(--ti-texto)] ring-1 ring-[var(--ti-linea-suave)] ${
        grande ? "px-3 py-1.5 text-[0.9375rem]" : "px-2.5 py-1 text-sm"
      }`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--ti-acento)]" />
      {texto}
    </span>
  );
}

export function TarjetaProducto({ p, nombreCategoria, prioridad = false }: { p: ProductoTienda; nombreCategoria?: string; prioridad?: boolean }) {
  const n = useEnBolsa(p.id);
  const pocas = p.stock !== null && p.stock > 0 && p.stock <= POCAS;
  const kicker = p.marca?.trim() || nombreCategoria || nombreDeCategoria(p.categoria);

  return (
    <article data-ti-producto className="group @container relative flex h-full flex-col">
      <div className="relative">
        <span className="relative block aspect-square overflow-hidden rounded-[var(--ti-radio-tarjeta)] bg-[var(--ti-suave)]">
          <FotoProducto src={p.imagen} prioridad={prioridad} className="transition-transform duration-[var(--ti-dur-medio)] ease-[var(--ti-ease)] group-hover:scale-[1.03]" />
        </span>
        {(p.descuento || p.etiqueta) && (
          <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5 @min-[15.5rem]:left-3 @min-[15.5rem]:top-3">
            {p.descuento ? <Descuento n={p.descuento} /> : null}
            {p.etiqueta && <Insignia texto={p.etiqueta} />}
          </span>
        )}
        {n > 0 && (
          <span className="ti-entrar absolute bottom-2.5 left-2.5 [animation-duration:var(--ti-dur-medio)] @min-[15.5rem]:bottom-3 @min-[15.5rem]:left-3">
            <span className="inline-flex items-center gap-1 rounded-[var(--ti-radio-pill)] bg-[var(--ti-fondo)] px-2.5 py-1 text-sm font-semibold text-[var(--ti-texto)] shadow-[var(--ti-sombra-tarjeta)] ring-1 ring-[var(--ti-linea-suave)]">
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" /> En tu bolsa
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col pb-1 pt-3 @min-[15.5rem]:pt-4">
        <p className="ti-kicker truncate text-[var(--ti-texto-3)]">{kicker}</p>
        <h3 className="ti-nombre mt-1 line-clamp-2 text-[1rem] font-medium leading-[1.35] text-[var(--ti-texto)]">
          <Link
            href={p.href}
            prefetch={false}
            className="ti-foco rounded-sm after:absolute after:inset-0 after:rounded-[var(--ti-radio-tarjeta)] after:content-[''] hover:underline hover:underline-offset-4"
          >
            {p.nombre}
          </Link>
        </h3>
        {/* La línea de la presentación queda aunque falte: así, en una fila, los precios quedan a la misma altura. */}
        <p className="mt-1 min-h-[1.4em] truncate text-[length:var(--ti-t-chico)] leading-[1.4] text-[var(--ti-texto-2)]">
          {p.presentacion && (
            <>
              <span className="sr-only">Presentación: </span>
              {p.presentacion}
            </>
          )}
          {pocas && (
            <span className="font-semibold text-[var(--ti-acento)]">
              {p.presentacion ? " · " : ""}¡Quedan {p.stock}!
            </span>
          )}
        </p>

        <div className="mt-auto flex flex-col gap-2.5 pt-3 @min-[15.5rem]:flex-row @min-[15.5rem]:items-end @min-[15.5rem]:justify-between">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="ti-nombre text-[1.125rem] tabular-nums text-[var(--ti-texto)]">{solesCortos(p.precio)}</span>
            {p.antes && (
              <span className="text-sm tabular-nums text-[var(--ti-texto-3)] line-through">
                <span className="sr-only">Antes </span>
                {solesCortos(p.antes)}
              </span>
            )}
          </p>
          <div className="relative z-[1]">
            <BotonAgregar producto={aProducto(p)} />
          </div>
        </div>
      </div>
    </article>
  );
}
