"use client";

/**
 * Lo que flota alrededor de la bolsa (ADR-511):
 *
 * · `AvisoFlotante` — en el celular, abajo a la derecha mientras la bolsa
 *   tiene algo y está cerrada (y el checkout no está abierto): «Ver bolsa»,
 *   el subtotal y el contador. Cede su lugar a la barra fija de la ficha
 *   (`<html data-ti-barra-compra>`) y se corre hacia abajo mientras un
 *   `[data-ti-despejar]` (la columna de compra de la ficha) pasa por detrás.
 *   En la computadora no hace falta: la bolsa del encabezado queda arriba.
 * · `AvisoNoAgregado` — «No pudimos agregar X: ya no está en la tienda». El
 *   carrito lo avisa con `CARRITO_NO_AGREGADO`; sale 6 s (con el puntero o el
 *   foco encima, espera) y ofrece preguntarle al negocio por WhatsApp.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, MessageCircle, ShoppingBag, X } from "@buleje/design-system/icons";
import { CARRITO_NO_AGREGADO, useCart, type CarritoNoAgregadoDetalle } from "@/contexts/cart-context";
import { abrirBolsa, useBolsaAbierta } from "./estado-bolsa";
import { solesPedido } from "./pedido-whatsapp";
import { SelloContador } from "./Sello";
import { enlaceWhatsapp, EXTERNO, unidades } from "./ui";

/** Alto (px) de la franja de abajo donde flota la píldora: 56 de alto + 16 de margen + aire. */
const FRANJA_PILDORA = 96;
const DURA_MS = 6000;

/**
 * ¿Algún `[data-ti-despejar]` pasa por la franja de abajo? Entonces la píldora se
 * corre: nunca tapa el botón de comprar. Se mide al desplazar (una vez por cuadro):
 * las marcas pueden aparecer después de montar (la página llega por partes).
 */
function useFranjaOcupada(activa: boolean): boolean {
  const [ocupada, setOcupada] = useState(false);
  useEffect(() => {
    if (!activa) return;
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const borde = window.innerHeight - FRANJA_PILDORA;
      const choca = [...document.querySelectorAll("[data-ti-despejar]")].some((el) => {
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

export function AvisoFlotante() {
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
      data-ti-pildora-bolsa
      data-ti-corrida={ocupada ? "si" : "no"}
      aria-label={`Ver tu bolsa: ${unidades(count)}, ${solesPedido(total)}`}
      className={`ti-foco ti-sombra-flotante fixed bottom-4 right-4 z-40 inline-flex h-14 items-center gap-3 rounded-full bg-[var(--ti-texto)] pl-5 pr-4 text-base font-semibold text-[var(--ti-fondo)] transition-[transform,opacity] duration-[var(--ti-dur-corto)] ease-[var(--ti-ease)] active:scale-[.97] sm:hidden [[data-ti-barra-compra]_&]:hidden ${
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

export function AvisoNoAgregado({ negocio, whatsapp }: { negocio: string; whatsapp: string | null }) {
  const [nombre, setNombre] = useState<string | null>(null);
  const [vez, setVez] = useState(0);
  const quieto = useRef(false);

  useEffect(() => {
    const alRechazar = (e: Event) => {
      const d = (e as CustomEvent<CarritoNoAgregadoDetalle>).detail;
      setNombre(d?.nombre || "ese producto");
      setVez((v) => v + 1);
    };
    window.addEventListener(CARRITO_NO_AGREGADO, alRechazar);
    return () => window.removeEventListener(CARRITO_NO_AGREGADO, alRechazar);
  }, []);

  // Cada rechazo nuevo (`vez`) reinicia la cuenta; con el puntero o el foco encima, espera.
  useEffect(() => {
    if (!nombre) return;
    const t = setInterval(() => {
      if (!quieto.current) setNombre(null);
    }, DURA_MS);
    return () => clearInterval(t);
  }, [nombre, vez]);

  if (!nombre) return null;
  const mensaje = `Hola ${negocio}, quise agregar «${nombre}» en la tienda y me dice que ya no está. ¿Lo tienen?`;
  return (
    <div
      role="alert"
      data-ti-aviso-no-agregado
      onPointerEnter={() => (quieto.current = true)}
      onPointerLeave={() => (quieto.current = false)}
      onFocus={() => (quieto.current = true)}
      onBlur={() => (quieto.current = false)}
      className="ti-entrar ti-sombra-flotante fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[28rem] rounded-[var(--ti-radio-tarjeta)] border border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] py-3 pl-4 pr-2 md:bottom-6"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ti-texto)]" strokeWidth={1.8} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug text-[var(--ti-texto)]">
            No pudimos agregar <strong className="font-semibold">{nombre}</strong>: ya no está en la tienda.
          </p>
          {whatsapp && (
            <a
              href={enlaceWhatsapp(whatsapp, mensaje)}
              {...EXTERNO}
              className="ti-foco ti-subrayado mt-1 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-[var(--ti-texto)]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Pregunta por WhatsApp
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={() => setNombre(null)}
          aria-label="Cerrar el aviso"
          className="ti-foco inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--ti-texto-2)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)] hover:text-[var(--ti-texto)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
