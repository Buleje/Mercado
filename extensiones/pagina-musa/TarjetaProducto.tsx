"use client";

/**
 * Tarjeta de un producto de la página del salón: foto, marca, nombre, precio
 * (con el «antes» del historial cuando hubo rebaja) y «Agregar» al carrito de
 * la tienda. La foto y el nombre abren la ficha rápida (`EnlaceFicha`); con
 * ctrl/cmd + clic o el clic del medio, la ficha del catálogo en otra pestaña.
 * Es de cliente para que `p` viaje UNA vez al navegador (no una por enlace).
 */
import Image from "next/image";
import { BotonAgregar } from "./BotonAgregar";
import { EnlaceFicha } from "./EnlaceFicha";
import type { ProductoSalon } from "./datos";
import { soles } from "./destinos";
import { Sello } from "./Sello";

const POCAS = 5;

export function TarjetaProducto({ p, prioridad = false }: { p: ProductoSalon; prioridad?: boolean }) {
  const pocas = p.stock !== null && p.stock > 0 && p.stock <= POCAS;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]">
      <EnlaceFicha p={p} data-mu-foto className="relative block aspect-square overflow-hidden bg-[var(--mu-nude-claro)]" tabIndex={-1} aria-hidden="true">
        {!p.imagen && (
          // Sin foto todavía: el sello de Musa y el código para pedir por WhatsApp.
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Sello id={`tarjeta-${p.id}`} className="h-[42%] w-[42%] opacity-90" />
            {p.codigo && <span className="text-sm font-semibold tracking-[0.12em] text-[var(--mu-acento-tinta)]">{p.codigo}</span>}
          </span>
        )}
        {p.imagen && (
          <Image
            src={p.imagen}
            alt=""
            fill
            priority={prioridad}
            sizes="(min-width: 1280px) 240px, (min-width: 1024px) 22vw, (min-width: 640px) 31vw, 46vw"
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {p.descuento && (
            <span className="rounded-full bg-[var(--mu-acento-tinta)] px-3 py-1 text-sm font-bold text-[var(--surface-canvas)]">-{p.descuento} %</span>
          )}
          {p.etiqueta && (
            <span className="rounded-full bg-[var(--surface-raised)]/90 px-3 py-1 text-sm font-semibold text-[var(--text-primary)] backdrop-blur">
              {p.etiqueta}
            </span>
          )}
        </span>
      </EnlaceFicha>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {p.marca && <p className="text-xs font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--mu-acento-tinta)]">{p.marca}</p>}
        <h3 className="line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-[var(--text-primary)]">
          <EnlaceFicha p={p} className="hover:underline focus-visible:underline">
            {p.nombre}
          </EnlaceFicha>
        </h3>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{soles(p.precio)}</span>
          {p.antes && (
            <span className="text-sm tabular-nums text-[var(--text-tertiary)] line-through">
              <span className="sr-only">Antes </span>
              {soles(p.antes)}
            </span>
          )}
        </div>
        {pocas && <p className="text-sm font-semibold text-[var(--mu-acento-tinta)]">¡Quedan {p.stock}!</p>}
        <div className="pt-2">
          <BotonAgregar
            producto={{
              id: p.id,
              name: p.nombre,
              category: p.categoria,
              price: p.precio,
              image: p.imagen,
              unit: p.unidad,
              ...(p.stock !== null ? { stock: p.stock } : {}),
            }}
          />
        </div>
      </div>
    </article>
  );
}
