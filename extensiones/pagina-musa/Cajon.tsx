"use client";

/**
 * El cajón de la bolsa (440 px a la derecha; en el celular, a pantalla entera).
 * Lo abre `abrirBolsa()` (botón del encabezado, aviso flotante o `?carrito=abrir`),
 * no el `isOpen` del carrito: ver `estado-bolsa.ts`.
 *
 * Arriba: «Tu bolsa», cuántos productos y unidades llevas, y el avance hacia el
 * envío gratis y el regalo de la campaña. Al medio, una línea por producto (su
 * ilustración, código, contador − N + y lo que suma) y «Drucila te sugiere». Abajo,
 * pegado al fondo: subtotal y «Pedir por WhatsApp» (Musa NO usa el checkout).
 * Quitar algo deja 5 s para deshacerlo.
 *
 * Capa `z-system`: por encima del cupón de bienvenida de la tienda (z 7000),
 * que en el celular tapaba el botón del pie.
 */
import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "@buleje/design-system/icons";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { solesPedido as soles } from "./pedido-whatsapp";
import { reducirMovimiento } from "./efecto-agregar";
import { cerrarBolsa, useBolsaAbierta, usePedido } from "./estado-bolsa";
import { AvanceBolsa } from "./AvanceBolsa";
import { PedirPorWhatsapp, type CodigosProductos } from "./PedirPorWhatsapp";
import { BolsaVacia, LineaBolsa } from "./BolsaPartes";
import { SugerenciaKit } from "./SugerenciaKit";

const ENTRA = { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const SALE = { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const DESHACER_MS = 5000;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Sigue a `abierta`, pero al cerrar espera a que el panel termine de salir (240 ms). */
function useMontado(
  abierta: boolean,
  panel: React.RefObject<HTMLDivElement | null>,
  fondo: React.RefObject<HTMLDivElement | null>,
) {
  const [montado, setMontado] = useState(abierta);
  if (abierta && !montado) setMontado(true);
  useEffect(() => {
    if (abierta || !montado) return;
    if (reducirMovimiento() || !panel.current) {
      setMontado(false);
      return;
    }
    // Si la vuelven a abrir mientras sale, la salida se cancela y el panel se queda.
    let cancelada = false;
    const b = fondo.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      ...SALE,
      fill: "forwards",
    });
    const a = panel.current.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(100%)" }],
      { ...SALE, fill: "forwards" },
    );
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

export function Cajon({ codigos }: { codigos: CodigosProductos }) {
  const { items, count, total, removeItem, addMultiple } = useCart();
  const abierta = useBolsaAbierta();
  const pedido = usePedido();
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
    if (!reducirMovimiento()) {
      panel.current?.animate(
        [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
        ENTRA,
      );
      fondo.current?.animate([{ opacity: 0 }, { opacity: 1 }], ENTRA);
    }
    return () => {
      html.style.overflow = previo;
      antes.current?.focus?.();
    };
  }, [abierta]);

  // «Quitaste X · Deshacer» dura 5 s (una raya oro se va acortando). El foco estaba en el
  // tacho, que ya no existe: pasa a «Deshacer»; si sigue ahí cuando el aviso se va, a «Cerrar».
  useEffect(() => {
    if (!quitado) return;
    if (!panel.current?.contains(document.activeElement)) deshacerBtn.current?.focus();
    if (!reducirMovimiento()) {
      aviso.current?.animate(
        [
          { opacity: 0, transform: "translateY(-6px)" },
          { opacity: 1, transform: "none" },
        ],
        ENTRA,
      );
      reloj.current?.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
        duration: DESHACER_MS,
        easing: "linear",
        fill: "forwards",
      });
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

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      cerrarBolsa();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focos = panel.current.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input, select",
    );
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

  return (
    <div className="fixed inset-0 z-system" data-lenis-prevent onKeyDown={teclado}>
      <div
        ref={fondo}
        className="absolute inset-0 bg-[var(--mu-cacao)]/55 backdrop-blur-[3px]"
        onClick={cerrarBolsa}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mu-bolsa-titulo"
        className="mu-sombra-flotante absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--surface-canvas)] sm:max-w-[27.5rem] sm:rounded-l-[var(--mu-radio-tarjeta)]"
      >
        <header className="relative flex items-start justify-between gap-3 border-b border-[var(--rule-soft)] px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2
              id="mu-bolsa-titulo"
              className="mu-serif flex flex-wrap items-baseline gap-x-3 text-[length:var(--mu-t-titulo)] leading-none text-[var(--text-primary)]"
            >
              Tu bolsa
              {items.length > 0 && (
                <span
                  aria-hidden="true"
                  className="mu-script -rotate-3 text-[2rem] font-normal leading-none text-[var(--mu-rosa-tinta)]"
                >
                  lo que llevas
                </span>
              )}
            </h2>
            <p className="mt-1.5 text-[13px] text-[var(--text-tertiary)]">
              {items.length === 0
                ? "Todavía no agregaste nada"
                : `${plural(items.length, "producto", "productos")} · ${plural(count, "unidad", "unidades")}`}
            </p>
          </div>
          <button
            ref={cerrarBtn}
            type="button"
            onClick={cerrarBolsa}
            aria-label="Cerrar la bolsa"
            className="mu-foco inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors duration-[var(--mu-dur-corto)] hover:bg-[var(--mu-nude-claro)]"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </header>

        {quitado && (
          <div
            ref={aviso}
            role="status"
            className="relative flex items-center justify-between gap-3 bg-[var(--mu-cacao)] py-1 pl-5 pr-3 text-[13px] text-[var(--mu-sobre-cacao)]"
          >
            <span className="min-w-0 truncate">
              Quitaste <strong className="font-semibold">{quitado.name}</strong>
            </span>
            <button
              ref={deshacerBtn}
              type="button"
              onClick={deshacer}
              className="mu-foco inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold text-[var(--mu-oro)] underline-offset-4 [--mu-foco-halo:var(--mu-cacao)] [--mu-foco:var(--mu-oro)] hover:underline"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Deshacer
            </button>
            <span
              ref={reloj}
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[var(--mu-oro)]"
            />
          </div>
        )}

        {items.length === 0 ? (
          <BolsaVacia />
        ) : (
          // Un solo scroll: el pie queda pegado abajo (sticky) y, en pantallas bajas (< 640 px,
          // un iPhone SE con la barra del navegador), corre con la lista para no comérsela.
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
            data-lenis-prevent
          >
            <div className="flex-1 px-5 pt-4">
              <AvanceBolsa subtotal={total} pueblo={pedido.pueblo} />
              <ul aria-label="Lo que llevas" className="mt-2 divide-y divide-[var(--rule-soft)]">
                {items.map((i) => (
                  <LineaBolsa key={i.id} item={i} info={codigos[String(i.id)]} alQuitar={quitar} />
                ))}
              </ul>
              <SugerenciaKit items={items} codigos={codigos} />
            </div>
            <footer className="sticky bottom-0 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 [@media(max-height:40rem)]:static">
              <div className="flex items-baseline justify-between gap-3">
                <span className="mu-kicker text-[var(--text-secondary)]">Subtotal</span>
                <span className="mu-precio text-[2rem] text-[var(--text-primary)]">
                  {soles(total)}
                </span>
              </div>
              <div className="mt-3">
                <PedirPorWhatsapp
                  items={items}
                  codigos={codigos}
                  pedido={pedido}
                  subtotal={total}
                />
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
