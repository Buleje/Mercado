"use client";

/**
 * FamilyCartBanner — Banner en la pagina del carrito que invita al usuario
 * a compartir el pedido con su familia para que cada uno sume sus productos.
 *
 * Flow:
 *   1. Banner visible solo si el carrito tiene items (>=1)
 *   2. Botón "Compartir con la familia" genera link token + abre WhatsApp
 *      con mensaje pre-hecho
 *   3. Los receptores abren el link, ven el carrito actual, agregan los suyos
 *   4. Quien paga abre el link final con todo agregado
 *
 * Insight: en Peru las compras de bodega son familiares. Mama arma la lista
 * base, hijos agregan snacks, papa agrega bebidas. Este banner hace explicito
 * ese flujo social.
 *
 * Impacto esperado: +60% AOV en pedidos familiares vs 1 usuario solo.
 */

import { useCallback, useState } from "react";
import { Users, Share2, Check, MessageCircle } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { serializeCart } from "@/lib/marketplace/cart-sharing";

export default function FamilyCartBanner() {
  const { items, itemCount } = useMarketplaceCart();
  const [status, setStatus] = useState<"idle" | "copied">("idle");

  const buildShareUrl = useCallback(() => {
    const token = serializeCart(items);
    return `${window.location.origin}/marketplace/carrito?cart=${token}`;
  }, [items]);

  const handleCopy = useCallback(async () => {
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      // silent fallback — user can tap WhatsApp directly
    }
  }, [buildShareUrl]);

  const handleWhatsApp = useCallback(() => {
    const url = buildShareUrl();
    const msg = encodeURIComponent(
      `Armé el pedido de la familia. Agregá lo que te falte y se lo pagamos juntos — acá: ${url}`,
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  }, [buildShareUrl]);

  if (itemCount === 0) return null;

  return (
    <section
      aria-label="Compartir carrito con la familia"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3 mb-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
          <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            ¿Varios en tu casa van a sumar productos?
          </h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
            Compartí este carrito — cada uno agrega lo que quiera y pagás al
            final todo junto.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={handleWhatsApp}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white py-3 text-sm font-bold hover:bg-[#1ea34d] transition-colors active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          Compartir por WhatsApp
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] px-5 py-3 text-sm font-bold hover:border-[var(--accent)]/40 transition-colors active:scale-[0.98]"
          aria-label={status === "copied" ? "Link copiado" : "Copiar link del carrito"}
        >
          {status === "copied" ? (
            <>
              <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
              ¡Copiado!
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Copiar link
            </>
          )}
        </button>
      </div>

      <p className="mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">
        Los productos se mergean — nadie pierde lo que puso
      </p>
    </section>
  );
}
