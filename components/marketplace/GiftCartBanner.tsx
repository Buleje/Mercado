"use client";

/**
 * GiftCartBanner — Regala un carrito armado a alguien.
 *
 * Diferencia con gift-cards/: esta NO regala dinero en abstracto.
 * Regala un PEDIDO CONCRETO con productos específicos. Ideal para:
 *   - Cumpleaños: "te regalo un asado completo"
 *   - Ayuda familiar: "te pagué la despensa"
 *   - Emergencias: "vecino enfermo, le mandé víveres"
 *   - Día de la madre, Navidad, etc
 *
 * Flow:
 *   1. Banner visible si hay items en carrito (>=1)
 *   2. Click "Regalá este carrito" → modal con form
 *   3. Form: nombre destinatario + WhatsApp + mensaje
 *   4. Submit → abre WhatsApp con mensaje pre-hecho + link al carrito
 *   5. Quien paga (sender) completa checkout normal pero la entrega
 *      va a la direccion del destinatario
 *
 * Por ahora el componente genera el link + abre WhatsApp. El checkout
 * puede leer el query param `giftTo` para cambiar la direccion de entrega
 * (feature adicional a implementar en checkout flow).
 */

import { useState, useCallback } from "react";
import { Gift, Send, X, Heart, MessageCircle } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { serializeCart } from "@/lib/marketplace/cart-sharing";
import { cn } from "@/lib/utils";

export default function GiftCartBanner() {
  const { items, itemCount, grandTotal } = useMarketplaceCart();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const buildGiftMessage = useCallback(() => {
    const token = serializeCart(items);
    const giftUrl = `${window.location.origin}/marketplace/carrito?cart=${token}&gift=1`;
    const dear = name.trim() ? ` ${name.trim()}` : "";
    const custom = message.trim() ? `\n\n${message.trim()}` : "";
    return `Hola${dear}, te preparé un pedido de Buleje y te lo quiero regalar.${custom}\n\nAcá está: ${giftUrl}`;
  }, [items, name, message]);

  const handleSend = useCallback(() => {
    if (!phone.trim()) return;
    const cleanPhone = phone.replace(/\D/g, "");
    const msg = encodeURIComponent(buildGiftMessage());
    window.open(`https://wa.me/51${cleanPhone}?text=${msg}`, "_blank", "noopener,noreferrer");
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setName("");
      setPhone("");
      setMessage("");
    }, 2500);
  }, [phone, buildGiftMessage]);

  if (itemCount === 0) return null;

  return (
    <>
      {/* Banner inline en el carrito */}
      <section
        aria-label="Regalar este carrito"
        className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
            <Gift className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              ¿Querés regalárselo a alguien?
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
              Pagás vos, le llega a quien vos quieras. Cumpleaños, emergencias,
              o solo por cariño.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors active:scale-[0.98]"
        >
          <Heart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Regalá este carrito
        </button>
      </section>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-primary)]/60 backdrop-blur-sm"
          onClick={() => !sent && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gift-cart-title"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--surface-raised)] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
              <div className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
                <h2
                  id="gift-cart-title"
                  className="text-base font-extrabold tracking-tight text-[var(--text-primary)]"
                >
                  Regalar carrito
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </header>

            {sent ? (
              <div className="p-8 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white mb-4">
                  <Heart className="h-7 w-7" strokeWidth={2} aria-hidden />
                </span>
                <p className="text-base font-extrabold text-[var(--text-primary)]">
                  ¡WhatsApp abierto!
                </p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  Mandá el mensaje para terminar el regalo
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Carrito summary */}
                <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Estás regalando
                  </p>
                  <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                    {itemCount} {itemCount === 1 ? "producto" : "productos"} · S/ {grandTotal.toFixed(2)}
                  </p>
                </div>

                {/* Form destinatario */}
                <div>
                  <label
                    htmlFor="gift-name"
                    className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5"
                  >
                    Nombre de quien recibe
                  </label>
                  <input
                    id="gift-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Maria"
                    maxLength={60}
                    className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="gift-phone"
                    className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5"
                  >
                    WhatsApp destinatario
                  </label>
                  <div className="flex items-stretch rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] overflow-hidden focus-within:border-[var(--accent)] transition-colors">
                    <span className="inline-flex items-center px-3 bg-[var(--surface-raised)] border-r border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)]">
                      +51
                    </span>
                    <input
                      id="gift-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="987654321"
                      maxLength={12}
                      className="flex-1 px-3 py-2.5 text-sm bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="gift-message"
                    className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5"
                  >
                    Mensaje personal <span className="font-normal normal-case">(opcional)</span>
                  </label>
                  <textarea
                    id="gift-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    maxLength={200}
                    placeholder="Ej: Feliz cumpleaños, te quiero mucho"
                    className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors resize-none leading-relaxed"
                  />
                  <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {message.length} / 200
                  </p>
                </div>

                {/* CTA */}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!phone.trim()}
                  className={cn(
                    "w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition-all active:scale-[0.98]",
                    phone.trim()
                      ? "bg-[#25D366] text-white hover:bg-[#1ea34d]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Mandar por WhatsApp
                </button>

                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center leading-relaxed">
                  El destinatario recibe el mensaje con un link. Vos pagás y la
                  bodega entrega a la dirección que pongas en el checkout.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
