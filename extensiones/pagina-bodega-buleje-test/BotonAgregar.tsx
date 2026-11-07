"use client";

/**
 * «Agregar» de una tarjeta: el MISMO carrito de la tienda (`useCart`, guardado
 * por negocio en el navegador), así lo que agregas acá aparece en el catálogo
 * y se paga con el flujo de siempre. Confirma en el botón y por lector de
 * pantalla; la bolsa se abre desde el encabezado o el aviso flotante.
 * Al agregar, la foto de la tarjeta (`[data-bb-foto]`) vuela a la bolsa y su
 * número salta (`efecto-agregar.ts`); el «pop» lo toca `addItem` solo.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ShoppingBag } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import { volarABolsa } from "./efecto-agregar";

export function BotonAgregar({ producto }: { producto: Product }) {
  const { addItem, items } = useCart();
  const [hecho, setHecho] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reloj.current), []);

  const agotado = typeof producto.stock === "number" && producto.stock <= 0;
  const enBolsa = items.find((i) => i.id === producto.id)?.quantity ?? 0;

  return (
    <>
      <button
        type="button"
        disabled={agotado}
        onClick={(e) => {
          addItem(producto);
          const tarjeta = e.currentTarget.closest("article");
          volarABolsa(tarjeta?.querySelector("[data-bb-foto]") ?? e.currentTarget, producto.image);
          setHecho(true);
          clearTimeout(reloj.current);
          reloj.current = setTimeout(() => setHecho(false), 1800);
        }}
        aria-label={agotado ? `${producto.name}: agotado` : `Agregar ${producto.name} a la bolsa`}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--text-primary)] px-4 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--text-primary)] hover:text-[var(--surface-canvas)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:border-[var(--rule-base)] disabled:text-[var(--text-tertiary)] disabled:hover:bg-transparent"
      >
        {agotado ? (
          "Agotado"
        ) : hecho ? (
          <>
            <Check className="h-5 w-5" aria-hidden="true" /> Agregado
          </>
        ) : (
          <>
            <ShoppingBag className="h-5 w-5" aria-hidden="true" /> Agregar
          </>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {hecho ? `Agregaste ${producto.name}. Tienes ${enBolsa} en tu bolsa.` : ""}
      </span>
    </>
  );
}
