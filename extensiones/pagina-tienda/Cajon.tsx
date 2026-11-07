"use client";

/**
 * El cajón de la bolsa de la tienda (ADR-511; el de Musa sin su sello ni sus
 * sugerencias): 440 px a la derecha; en el celular, a pantalla entera. Lo abre
 * `abrirBolsa()` (la bolsa del encabezado, el aviso flotante, `?carrito=abrir`
 * o `?bolsa=1` al volver de Google), no el `isOpen` del carrito.
 *
 * Arriba «Tu bolsa» con su contador; al medio, cuánto falta para el envío
 * gratis y una fila por producto (− N +); abajo, pegado al fondo, el pie según
 * cómo pide el negocio: «Finalizar compra» (`PieCheckout`) o «Pedir por
 * WhatsApp» (`PedirPorWhatsapp`). Quitar algo deja 5 s para deshacerlo.
 *
 * Teclado: el foco entra a «Cerrar», Tab da la vuelta adentro, Escape cierra y
 * el foco vuelve adonde estaba. Capa `z-system`: por encima de los avisos de
 * la tienda (que en el celular tapaban el botón del pie).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Undo2, X } from "@buleje/design-system/icons";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { AvanceBolsa, BolsaVacia, LineaBolsa, reducirMovimiento } from "./BolsaPartes";
import { PieCheckout } from "./BolsaPie";
import { cerrarBolsa, useAbrirBolsaDelEnlace, useBolsaAbierta, usePedido } from "./estado-bolsa";
import { opcionesEntrega } from "./pedido-whatsapp";
import { PedirPorWhatsapp } from "./PedirPorWhatsapp";
import type { DatosBolsa } from "./producto-carrito";
import { SelloContador } from "./Sello";
import { unidades } from "./ui";

const ENTRA = { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const SALE = { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const DESHACER_MS = 5000;
const FOCOS = "a[href], button:not([disabled]), input:not([type=radio]), input[type=radio]:checked, select, summary";

/** Sigue a `abierta`, pero al cerrar espera a que el panel termine de salir (240 ms). */
function useMontado(abierta: boolean, panel: RefObject<HTMLDivElement | null>, fondo: RefObject<HTMLDivElement | null>) {
  const [montado, setMontado] = useState(abierta);
  if (abierta && !montado) setMontado(true);
  useEffect(() => {
    if (abierta || !montado) return;
    const el = panel.current;
    if (reducirMovimiento() || !el || typeof el.animate !== "function") {
      setMontado(false);
      return;
    }
    // Si la vuelven a abrir mientras sale, la salida se cancela y el panel se queda.
    let cancelada = false;
    const b = fondo.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...SALE, fill: "forwards" });
    const a = el.animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], { ...SALE, fill: "forwards" });
    const fin = () => !cancelada && setMontado(false);
    a.finished.then(fin, fin);
    return () => {
      cancelada = true;
      a.cancel();
      b?.cancel();
    };
  }, [abierta, montado, panel, fondo]);
  return montado;
}

export function Cajon({ bolsa, enPortada = false }: { bolsa: DatosBolsa; enPortada?: boolean }) {
  const { items, count, total, removeItem, addMultiple } = useCart();
  const abierta = useBolsaAbierta();
  const entregas = useMemo(() => opcionesEntrega(bolsa.envio.zonas, Boolean(bolsa.direccion)), [bolsa.envio.zonas, bolsa.direccion]);
  // Montado siempre (aunque la bolsa esté cerrada): el GPS del pedido sigue mirando.
  const pedido = usePedido(bolsa.slug, bolsa.pagos, entregas);
  useAbrirBolsaDelEnlace();
  const panel = useRef<HTMLDivElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const cerrarBtn = useRef<HTMLButtonElement>(null);
  const antes = useRef<HTMLElement | null>(null);
  const montado = useMontado(abierta, panel, fondo);
  const [quitado, setQuitado] = useState<CartItem | null>(null);
  const aviso = useRef<HTMLDivElement>(null);
  const reloj = useRef<HTMLSpanElement>(null);
  const deshacerBtn = useRef<HTMLButtonElement>(null);

  // Al abrir: guarda el foco, bloquea el scroll de atrás, entra deslizando y enfoca «Cerrar». Al cerrar: devuelve el foco.
  useEffect(() => {
    if (!abierta) return;
    antes.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const previo = html.style.overflow;
    html.style.overflow = "hidden";
    cerrarBtn.current?.focus();
    if (!reducirMovimiento() && typeof panel.current?.animate === "function") {
      panel.current.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], ENTRA);
      fondo.current?.animate([{ opacity: 0 }, { opacity: 1 }], ENTRA);
    }
    return () => {
      html.style.overflow = previo;
      // Si el checkout ya se abrió encima, el foco es suyo: no se lo quites.
      if (!document.querySelector('[role="dialog"][aria-modal="true"]:not([data-ti-cajon])')) antes.current?.focus?.();
    };
  }, [abierta]);

  // «Quitaste X · Deshacer» dura 5 s (una raya se va acortando). El foco estaba en el tacho,
  // que ya no existe: pasa a «Deshacer»; si sigue ahí cuando el aviso se va, a «Cerrar».
  useEffect(() => {
    if (!quitado) return;
    if (!panel.current?.contains(document.activeElement)) deshacerBtn.current?.focus();
    if (!reducirMovimiento() && typeof aviso.current?.animate === "function") {
      aviso.current.animate(
        [
          { opacity: 0, transform: "translateY(-6px)" },
          { opacity: 1, transform: "none" },
        ],
        ENTRA,
      );
      reloj.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: DESHACER_MS, easing: "linear", fill: "forwards" });
    }
    const t = setTimeout(() => {
      if (document.activeElement === deshacerBtn.current) cerrarBtn.current?.focus();
      setQuitado(null);
    }, DESHACER_MS);
    return () => clearTimeout(t);
  }, [quitado]);

  if (!montado) return null;

  const quitar = (item: CartItem) => {
    removeItem(item.id);
    setQuitado(item);
  };
  const deshacer = () => {
    if (!quitado) return;
    addMultiple([{ product: quitado, quantity: quitado.quantity }]);
    cerrarBtn.current?.focus();
    setQuitado(null);
  };

  const teclado = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      cerrarBolsa();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focos = [...panel.current.querySelectorAll<HTMLElement>(FOCOS)].filter((el) => el.getAttribute("aria-hidden") !== "true");
    if (focos.length === 0) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  const porWhatsapp = bolsa.pedido === "whatsapp";

  return (
    <div className="fixed inset-0 z-system" data-lenis-prevent onKeyDown={teclado}>
      <div ref={fondo} className="absolute inset-0 bg-[color-mix(in_srgb,var(--ti-texto)_40%,transparent)] backdrop-blur-[2px]" onClick={cerrarBolsa} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ti-bolsa-titulo"
        data-ti-cajon
        className="ti-sombra-flotante absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--ti-fondo)] sm:max-w-[27.5rem] sm:rounded-l-[var(--ti-radio-tarjeta)]"
      >
        <header className="relative flex items-center justify-between gap-3 border-b border-[var(--ti-linea-suave)] py-2 pl-5 pr-3">
          <h2 id="ti-bolsa-titulo" className="ti-titulo flex items-center gap-2.5 text-2xl leading-none text-[var(--ti-texto)]">
            Tu bolsa
            {count > 0 && (
              <>
                <SelloContador n={count} tamano={28} />
                <span className="sr-only">: {unidades(count)}</span>
              </>
            )}
          </h2>
          <button
            ref={cerrarBtn}
            type="button"
            onClick={cerrarBolsa}
            aria-label="Cerrar la bolsa"
            className="ti-foco inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)]"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </header>

        {quitado && (
          <div ref={aviso} role="status" className="relative flex items-center justify-between gap-3 bg-[var(--ti-suave)] py-1 pl-5 pr-3 text-sm text-[var(--ti-texto)]">
            <span className="min-w-0 truncate">
              Quitaste <strong className="font-semibold">{quitado.name}</strong>
            </span>
            <button
              ref={deshacerBtn}
              type="button"
              onClick={deshacer}
              className="ti-foco inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold text-[var(--ti-texto)] underline underline-offset-4"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Deshacer
            </button>
            <span ref={reloj} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[var(--ti-texto)]" />
          </div>
        )}

        {items.length === 0 ? (
          <BolsaVacia catalogo={bolsa.catalogo} porWhatsapp={porWhatsapp} />
        ) : (
          // Un solo scroll: el pie queda pegado abajo (sticky) y, en pantallas bajas (< 640 px,
          // un iPhone SE con la barra del navegador), corre con la lista para no comérsela.
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain" data-lenis-prevent>
            <div className="flex-1 px-5 pt-4">
              <AvanceBolsa subtotal={total} gratisDesde={bolsa.envio.gratisDesde} />
              <ul aria-label="Lo que llevas" className="mt-1 divide-y divide-[var(--ti-linea-suave)]">
                {items.map((i) => (
                  <LineaBolsa key={i.id} item={i} alQuitar={quitar} />
                ))}
              </ul>
            </div>
            <footer className="sticky bottom-0 border-t border-[var(--ti-linea-suave)] bg-[var(--ti-fondo)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 [@media(max-height:40rem)]:static">
              {porWhatsapp ? (
                <PedirPorWhatsapp items={items} bolsa={bolsa} pedido={pedido} subtotal={total} />
              ) : (
                <PieCheckout subtotal={total} catalogo={bolsa.catalogo} enPortada={enPortada} />
              )}
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
