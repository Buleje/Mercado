"use client";

/**
 * El cajón de la bolsa (panel lateral). Lo abre `abrirBolsa()` (botón del
 * encabezado, aviso flotante o `?carrito=abrir`), no el `isOpen` del carrito:
 * ver `estado-bolsa.ts`.
 *
 * Musa NO usa el checkout: el pie de la bolsa es «Pedir por WhatsApp»
 * (`PedirPorWhatsapp.tsx`) con nombre, pueblo y forma de pago. `codigos` (id →
 * código y «por encargo») lo manda el servidor para escribir el pedido.
 *
 * Capa `z-system`: por encima del cupón de bienvenida de la tienda (z 7000),
 * que en el celular tapaba el botón del pie.
 */
import { useEffect, useRef } from "react";
import Image from "next/image";
import { Minus, Plus, ShoppingBag, Trash2, X } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { soles, unidades } from "./destinos";
import { Sello } from "./Sello";
import { cerrarBolsa, useBolsaAbierta } from "./estado-bolsa";
import { PedirPorWhatsapp, type CodigosProductos } from "./PedirPorWhatsapp";

const REDONDO = "inline-flex items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--mu-nude-claro)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function Cajon({ codigos }: { codigos: CodigosProductos }) {
  const { items, count, total, updateQty, removeItem } = useCart();
  const abierta = useBolsaAbierta();
  const panel = useRef<HTMLDivElement>(null);
  const cerrarBtn = useRef<HTMLButtonElement>(null);
  const antes = useRef<HTMLElement | null>(null);

  // Al abrir: guarda el foco, bloquea el scroll de atrás y enfoca «Cerrar». Al cerrar: devuelve el foco.
  useEffect(() => {
    if (!abierta) return;
    antes.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const previo = html.style.overflow;
    html.style.overflow = "hidden";
    cerrarBtn.current?.focus();
    return () => {
      html.style.overflow = previo;
      antes.current?.focus?.();
    };
  }, [abierta]);

  if (!abierta) return null;

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      cerrarBolsa();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focos = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select");
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
      <div className="absolute inset-0 bg-[var(--mu-cacao)]/50 backdrop-blur-[2px]" onClick={cerrarBolsa} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mu-bolsa-titulo"
        className="absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col bg-[var(--surface-canvas)] shadow-[var(--shadow-xl)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-5 py-4">
          <h2 id="mu-bolsa-titulo" className="mu-serif text-3xl text-[var(--text-primary)]">
            Tu bolsa <span className="font-sans text-base font-medium text-[var(--text-secondary)]">({unidades(count)})</span>
          </h2>
          <button ref={cerrarBtn} type="button" onClick={cerrarBolsa} aria-label="Cerrar la bolsa" className={`${REDONDO} h-11 w-11`}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <ShoppingBag className="h-12 w-12 text-[var(--mu-nude-fuerte)]" strokeWidth={1.4} aria-hidden="true" />
            <p className="text-lg font-semibold text-[var(--text-primary)]">Tu bolsa está vacía</p>
            <p className="text-base text-[var(--text-secondary)]">Agrega tus favoritos y pídelos por WhatsApp en un solo mensaje.</p>
            <button type="button" onClick={cerrarBolsa} className="mt-2 h-12 rounded-full border-2 border-[var(--text-primary)] px-6 text-base font-semibold text-[var(--text-primary)]">
              Seguir comprando
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-[var(--rule-soft)] overflow-y-auto px-5" data-lenis-prevent>
              {items.map((i) => (
                <li key={i.id} className="flex gap-4 py-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--mu-nude-claro)]">
                    {i.image ? (
                      <Image src={i.image} alt="" fill sizes="80px" className="object-cover" />
                    ) : (
                      <Sello id={`bolsa-${i.id}`} className="absolute inset-[18%] h-[64%] w-[64%] opacity-90" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)]">{i.name}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-full border border-[var(--rule-base)]">
                        <button type="button" onClick={() => updateQty(i.id, i.quantity - 1)} aria-label={`Quitar uno de ${i.name}`} className={`${REDONDO} h-10 w-10`}>
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="w-7 text-center text-base font-semibold tabular-nums" aria-label={`${i.quantity} en la bolsa`}>
                          {i.quantity}
                        </span>
                        <button type="button" onClick={() => updateQty(i.id, i.quantity + 1)} aria-label={`Agregar uno más de ${i.name}`} className={`${REDONDO} h-10 w-10`}>
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="text-base font-bold tabular-nums text-[var(--text-primary)]">{soles(i.price * i.quantity)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(i.id)} aria-label={`Sacar ${i.name} de la bolsa`} className={`${REDONDO} h-10 w-10 shrink-0 self-start text-[var(--text-secondary)]`}>
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-5">
              <div className="flex items-baseline justify-between">
                <span className="text-base font-semibold text-[var(--text-primary)]">Subtotal</span>
                <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{soles(total)}</span>
              </div>
              <PedirPorWhatsapp items={items} codigos={codigos} />
              <button type="button" onClick={cerrarBolsa} className="mt-2 h-11 w-full rounded-full text-base font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline">
                Seguir comprando
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
