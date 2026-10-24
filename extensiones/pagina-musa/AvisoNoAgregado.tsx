"use client";

/**
 * «No pudimos agregar…» (16-10). El carrito confirma con la tienda cada producto
 * que no conoce y, si ya no está, lo rechaza con `CARRITO_NO_AGREGADO`
 * (`contexts/cart-context.tsx`): antes era sólo un `console.warn` y el botón
 * «Agregar» quedaba mudo. Acá el aviso sale abajo, en todos los anchos (en el
 * celular, por encima de la píldora «Ver bolsa»), 6 s; con el puntero o el foco
 * encima espera. Ofrece preguntarle a Drucila por WhatsApp.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, MessageCircle, X } from "@buleje/design-system/icons";
import { CARRITO_NO_AGREGADO, type CarritoNoAgregadoDetalle } from "@/contexts/cart-context";
import { enlaceWhatsapp } from "./destinos";
import { WHATSAPP_MUSA } from "./pedido-whatsapp";

const DURA_MS = 6000;

export function AvisoNoAgregado({ raiz }: { raiz: Element | null }) {
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

  if (!nombre || !raiz) return null;
  const mensaje = `Hola Drucila, quise agregar «${nombre}» en la tienda y me dice que ya no está. ¿Lo tienes?`;
  return createPortal(
    <div
      role="alert"
      data-mu-aviso-no-agregado
      onPointerEnter={() => (quieto.current = true)}
      onPointerLeave={() => (quieto.current = false)}
      onFocus={() => (quieto.current = true)}
      onBlur={() => (quieto.current = false)}
      className="mu-entrar mu-sombra-flotante fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[28rem] rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)] py-3 pl-4 pr-2 md:bottom-6"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-primary)]" strokeWidth={1.8} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug text-[var(--text-primary)]">
            No pudimos agregar <strong className="font-semibold">{nombre}</strong>: ya no está en la tienda.
          </p>
          <a
            href={enlaceWhatsapp(WHATSAPP_MUSA, mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className="mu-foco mu-subrayado mt-1 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-[var(--text-primary)]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Pregúntale a Drucila por WhatsApp
          </a>
        </div>
        <button
          type="button"
          onClick={() => setNombre(null)}
          aria-label="Cerrar el aviso"
          className="mu-foco inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>,
    raiz,
  );
}
