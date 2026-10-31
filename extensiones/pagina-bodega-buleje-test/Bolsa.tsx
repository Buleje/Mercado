"use client";

/**
 * La bolsa de compras del salón: botón del encabezado, aviso flotante y cajón.
 *
 * Usa el CARRITO DE LA TIENDA (`useCart`): mismo guardado en el navegador y
 * mismo canal entre pestañas que el resto de la tienda. Dos formas de montarla:
 * · `ProveedorBolsa` — la portada (`/t/<negocio>`), que vive fuera del layout
 *   de la tienda: trae su propio `CartProvider` y «Finalizar compra» abre el
 *   checkout ahí mismo (`ProveedorTienda`, sólo en `main`; otro negocio sigue
 *   el enlace al catálogo con `?carrito=abrir`).
 * · `PartesBolsa` — el marco del resto de la tienda (ADR-460): usa el
 *   `CartProvider` del layout (NUNCA un segundo: el carrito ya pelea entre
 *   pestañas) y «Finalizar compra» abre el checkout de siempre ahí mismo.
 * El subtotal es una vista previa: el total lo calcula el servidor al confirmar.
 */
import { useEffect, type ReactNode } from "react";
import { ShoppingBag } from "@buleje/design-system/icons";
import { CartProvider, useCart } from "@/contexts/cart-context";
import { Cajon } from "./Cajon";
import { FichaRapida } from "./FichaRapida";
import { soles, unidades } from "./destinos";
import { abrirBolsa, useBolsaAbierta } from "./estado-bolsa";

export function ProveedorBolsa({ slug, pagar, children }: { slug: string; pagar: string; children: ReactNode }) {
  return (
    <CartProvider tenantSlug={slug}>
      {children}
      <PartesBolsa pagar={pagar} />
    </CartProvider>
  );
}

/**
 * El cajón, el aviso flotante y la ficha rápida (el modal que abren las
 * tarjetas). Sin `pagar`, «Finalizar compra» abre el checkout de la tienda.
 */
export function PartesBolsa({ pagar }: { pagar?: string }) {
  return (
    <>
      <Cajon pagar={pagar} />
      <AvisoFlotante />
      <FichaRapida />
    </>
  );
}

/**
 * Botón del encabezado: ícono + cuántos llevas. Llegar con `?carrito=abrir` abre la bolsa.
 * `data-bb-bolsa` / `data-bb-contador`: adonde vuela la foto al agregar y lo que salta
 * (`efecto-agregar.ts`). Si el botón se mueve, las marcas van con él.
 */
export function BotonBolsa() {
  const { count } = useCart();

  // El parámetro se borra ANTES de abrir: ni el doble montaje ni una recarga la vuelven a abrir.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("carrito") !== "abrir") return;
    params.delete("carrito");
    const resto = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${resto ? `?${resto}` : ""}${window.location.hash}`);
    abrirBolsa();
  }, []);

  return (
    <button
      type="button"
      onClick={abrirBolsa}
      data-bb-bolsa
      aria-label={`Abrir tu bolsa: ${unidades(count)}`}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-primary)] transition hover:bg-[var(--bb-rubor)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <ShoppingBag className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
      {count > 0 && (
        <span data-bb-contador className="absolute -right-0.5 -top-0.5 inline-flex h-5 items-center justify-center rounded-full bg-[var(--bb-vino)] px-1.5 text-xs font-bold tabular-nums text-[var(--surface-canvas)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/** Aviso abajo a la derecha cuando la bolsa tiene algo y está cerrada (y el checkout no está abierto). */
function AvisoFlotante() {
  const { count, total, checkoutOpen } = useCart();
  const abierta = useBolsaAbierta();
  if (count === 0 || abierta || checkoutOpen) return null;
  return (
    <button
      type="button"
      onClick={abrirBolsa}
      className="fixed bottom-4 right-4 z-40 inline-flex h-14 items-center gap-3 rounded-full bg-[var(--text-primary)] pl-5 pr-6 text-base font-semibold text-[var(--surface-canvas)] shadow-xl transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:bottom-6 sm:right-6"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      <span>Ver bolsa · {unidades(count)}</span>
      <span className="tabular-nums opacity-80">{soles(total)}</span>
    </button>
  );
}
