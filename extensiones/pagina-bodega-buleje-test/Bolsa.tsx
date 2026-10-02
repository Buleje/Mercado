"use client";

/**
 * La bolsa de compras de la página del salón.
 *
 * Usa el CARRITO DE LA TIENDA (`CartProvider` del negocio): mismo guardado en el
 * navegador y mismo canal entre pestañas que el catálogo. Por eso «Finalizar
 * compra» lleva al catálogo con la bolsa abierta (`?carrito=abrir`) y el pago
 * sigue por el flujo de siempre. El subtotal de acá es una vista previa: el
 * total lo calcula el servidor al confirmar el pedido.
 */
import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { Minus, Plus, ShoppingBag, Trash2, X } from "@buleje/design-system/icons";
import { CartProvider, useCart } from "@/contexts/cart-context";
import { soles } from "./destinos";

export function ProveedorBolsa({ slug, pagar, children }: { slug: string; pagar: string; children: ReactNode }) {
  return (
    <CartProvider tenantSlug={slug}>
      {children}
      <Cajon pagar={pagar} />
      <AvisoFlotante />
    </CartProvider>
  );
}

const unidades = (n: number) => `${n} ${n === 1 ? "producto" : "productos"}`;

/** Botón del encabezado: ícono + cuántos llevas. */
export function BotonBolsa() {
  const { count, open } = useCart();
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Abrir tu bolsa: ${unidades(count)}`}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-primary)] transition hover:bg-[var(--bb-rubor)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <ShoppingBag className="h-6 w-6" strokeWidth={1.6} aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 items-center justify-center rounded-full bg-[var(--bb-vino)] px-1.5 text-xs font-bold tabular-nums text-[var(--surface-canvas)]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/** Aviso abajo a la derecha cuando la bolsa tiene algo y está cerrada. */
function AvisoFlotante() {
  const { count, total, isOpen, open } = useCart();
  if (count === 0 || isOpen) return null;
  return (
    <button
      type="button"
      onClick={open}
      className="fixed bottom-4 right-4 z-40 inline-flex h-14 items-center gap-3 rounded-full bg-[var(--text-primary)] pl-5 pr-6 text-base font-semibold text-[var(--surface-canvas)] shadow-xl transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:bottom-6 sm:right-6"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      <span>Ver bolsa · {unidades(count)}</span>
      <span className="tabular-nums opacity-80">{soles(total)}</span>
    </button>
  );
}

function Cajon({ pagar }: { pagar: string }) {
  const { items, count, total, isOpen, close, updateQty, removeItem } = useCart();
  const panel = useRef<HTMLDivElement>(null);
  const cerrarBtn = useRef<HTMLButtonElement>(null);
  const antes = useRef<HTMLElement | null>(null);

  // Al abrir: guarda el foco, bloquea el scroll de atrás y enfoca «Cerrar». Al cerrar: devuelve el foco.
  useEffect(() => {
    if (!isOpen) return;
    antes.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const previo = html.style.overflow;
    html.style.overflow = "hidden";
    cerrarBtn.current?.focus();
    return () => {
      html.style.overflow = previo;
      antes.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focos = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
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
    <div className="fixed inset-0 z-[60]" data-lenis-prevent onKeyDown={teclado}>
      <div className="absolute inset-0 bg-[var(--bb-tinta)]/50 backdrop-blur-[2px]" onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-bolsa-titulo"
        className="absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col bg-[var(--surface-canvas)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-5 py-4">
          <h2 id="bb-bolsa-titulo" className="bb-serif text-3xl text-[var(--text-primary)]">
            Tu bolsa <span className="font-sans text-base font-medium text-[var(--text-secondary)]">({unidades(count)})</span>
          </h2>
          <button
            ref={cerrarBtn}
            type="button"
            onClick={close}
            aria-label="Cerrar la bolsa"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--bb-rubor)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <ShoppingBag className="h-12 w-12 text-[var(--bb-rosa)]" strokeWidth={1.4} aria-hidden="true" />
            <p className="text-lg font-semibold text-[var(--text-primary)]">Tu bolsa está vacía</p>
            <p className="text-base text-[var(--text-secondary)]">Agrega tus favoritos y los pagas en un solo pedido.</p>
            <button type="button" onClick={close} className="mt-2 h-12 rounded-full border-2 border-[var(--text-primary)] px-6 text-base font-semibold text-[var(--text-primary)]">
              Seguir comprando
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-[var(--rule-soft)] overflow-y-auto px-5" data-lenis-prevent>
              {items.map((i) => (
                <li key={i.id} className="flex gap-4 py-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--bb-rubor)]">
                    {i.image && <Image src={i.image} alt="" fill sizes="80px" className="object-cover" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text-primary)]">{i.name}</p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center rounded-full border border-[var(--rule-base)]">
                        <button type="button" onClick={() => updateQty(i.id, i.quantity - 1)} aria-label={`Quitar uno de ${i.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--bb-rubor)]">
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="w-7 text-center text-base font-semibold tabular-nums" aria-label={`${i.quantity} en la bolsa`}>
                          {i.quantity}
                        </span>
                        <button type="button" onClick={() => updateQty(i.id, i.quantity + 1)} aria-label={`Agregar uno más de ${i.name}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--bb-rubor)]">
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="text-base font-bold tabular-nums text-[var(--text-primary)]">{soles(i.price * i.quantity)}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(i.id)} aria-label={`Sacar ${i.name} de la bolsa`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full text-[var(--text-secondary)] hover:bg-[var(--bb-rubor)] hover:text-[var(--text-primary)]">
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
              <p className="mt-1 text-sm text-[var(--text-secondary)]">El delivery y el total final se calculan al confirmar tu pedido.</p>
              <a href={pagar} className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--text-primary)] text-base font-semibold text-[var(--surface-canvas)] transition hover:-translate-y-0.5 hover:shadow-lg">
                Finalizar compra
              </a>
              <button type="button" onClick={close} className="mt-2 h-11 w-full rounded-full text-base font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline">
                Seguir comprando
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
