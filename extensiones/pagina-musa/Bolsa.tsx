"use client";

/**
 * La bolsa de Musa: el cajón, la píldora «Ver bolsa» del celular y la ficha rápida.
 * (El botón del encabezado con el sello contador y el globo «Agregaste…» viven en
 * `EncabezadoVivo.tsx`.)
 *
 * Usa el CARRITO DE LA TIENDA (`useCart`): mismo guardado en el navegador y
 * mismo canal entre pestañas que el resto de la tienda. Dos formas de montarla:
 * · `ProveedorBolsa` — la portada (`/t/<negocio>`), que vive fuera del layout
 *   de la tienda: trae su propio `CartProvider`.
 * · `PartesBolsa` — el marco del resto de la tienda (ADR-460): usa el
 *   `CartProvider` del layout (NUNCA un segundo: el carrito ya pelea entre
 *   pestañas).
 * En las dos, el pie del cajón es «Pedir por WhatsApp» (sin checkout): el
 * subtotal es una vista previa y Drucila confirma envío y pago.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ShoppingBag } from "@buleje/design-system/icons";
import { CartProvider, useCart } from "@/contexts/cart-context";
import { Cajon } from "./Cajon";
import type { CodigosProductos } from "./PedirPorWhatsapp";
import { FichaRapida } from "./FichaRapida";
import { solesPedido } from "./pedido-whatsapp";
import { SelloContador } from "./Sello";
import { abrirBolsa, useBolsaAbierta } from "./estado-bolsa";

export function ProveedorBolsa({
  slug,
  codigos,
  children,
}: {
  slug: string;
  codigos: CodigosProductos;
  children: ReactNode;
}) {
  return (
    <CartProvider tenantSlug={slug}>
      {children}
      <PartesBolsa codigos={codigos} />
    </CartProvider>
  );
}

/**
 * El cajón, la píldora del celular y la ficha rápida (el modal que abren las
 * tarjetas). `codigos`: lo que el servidor sabe de cada producto, para el pedido.
 */
export function PartesBolsa({ codigos }: { codigos: CodigosProductos }) {
  return (
    <>
      <Cajon codigos={codigos} />
      <AvisoFlotante />
      <FichaRapida />
    </>
  );
}

/**
 * En el celular, abajo a la derecha mientras la bolsa tiene algo y está cerrada (y
 * el checkout no está abierto): «Ver bolsa», el sello contador y el subtotal. Cede su
 * lugar a la barra fija de la ficha (`BarraCompra` marca `<html data-mu-barra-compra>`)
 * y se corre hacia abajo mientras un `[data-mu-despejar]` pasa por detrás.
 * En la computadora no hace falta: la bolsa del encabezado queda pegada arriba.
 */
/** Alto (px) de la franja de abajo donde flota la píldora: 56 de alto + 16 de margen + aire. */
const FRANJA_PILDORA = 96;

/**
 * ¿Algún `[data-mu-despejar]` (los botones del héroe y del diagnóstico, la columna de
 * compra de la ficha) pasa por la franja de abajo? Entonces la píldora se corre: nunca
 * tapa un llamado a la acción ni lo que se lee antes de comprar.
 * Se mide al desplazar (una vez por cuadro) y no con IntersectionObserver porque la
 * portada llega por partes y las marcas pueden aparecer después de montar.
 */
function useFranjaOcupada(activa: boolean): boolean {
  const [ocupada, setOcupada] = useState(false);
  useEffect(() => {
    if (!activa) return;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const borde = window.innerHeight - FRANJA_PILDORA;
      const choca = [...document.querySelectorAll("[data-mu-despejar]")].some((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.bottom > borde && r.top < window.innerHeight;
      });
      setOcupada(choca);
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    const tarde = window.setTimeout(medir, 1500);
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(tarde);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, [activa]);
  return ocupada;
}

function AvisoFlotante() {
  const { count, total, checkoutOpen } = useCart();
  const abierta = useBolsaAbierta();
  const visible = count > 0 && !abierta && !checkoutOpen;
  const ocupada = useFranjaOcupada(visible);
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={abrirBolsa}
      inert={ocupada}
      data-mu-corrida={ocupada ? "si" : "no"}
      aria-label={`Ver tu bolsa: ${count} ${count === 1 ? "unidad" : "unidades"}, ${solesPedido(total)}`}
      className={`mu-foco mu-sombra-flotante fixed bottom-4 right-4 z-40 inline-flex h-14 items-center gap-3 rounded-full bg-[var(--mu-boton-fondo)] pl-5 pr-4 text-base font-semibold text-[var(--mu-boton-texto)] transition-[transform,opacity] duration-[var(--mu-dur-corto)] ease-[var(--mu-ease)] active:scale-[.97] sm:hidden [[data-mu-barra-compra]_&]:hidden ${
        ocupada ? "pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0" : ""
      }`}
    >
      <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>Ver bolsa</span>
      <span className="tabular-nums opacity-85">{solesPedido(total)}</span>
      <SelloContador n={count} tamano={22} />
    </button>
  );
}
