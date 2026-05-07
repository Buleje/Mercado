"use client";

/**
 * PostPurchaseCelebration — Hero card tras confirmación de compra.
 *
 * Muestra:
 *   - Ilustración (BodegueroCelebrando o similar — ligera, sin SVG pesado)
 *   - Mensaje "Gracias por tu pedido, {nombre}"
 *   - Número de orden + ETA
 *   - 3 CTAs: Ver seguimiento / Seguir comprando / Compartir
 *
 * ADR-068: 0 emojis, tokens CSS only, 0 gradientes decorativos.
 */

import Link from "next/link";
import { CheckCircle2, Truck, Share2, ShoppingBag } from "@buleje/design-system/icons";
import { PrimaryButton, cn } from "@buleje/design-system";
import { useLocale } from "@/contexts/locale-context";

interface PostPurchaseCelebrationProps {
  orderId: string;
  customerName?: string;
  etaIso: string;
  onShare?: () => void;
}

function formatEta(etaIso: string): string {
  try {
    const date = new Date(etaIso);
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin <= 0) return "Llegando";
    if (diffMin < 60) return `En ~${diffMin} min`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `En ~${hours}h ${mins > 0 ? `${mins}min` : ""}`.trim();
  } catch {
    return "Pronto";
  }
}

export default function PostPurchaseCelebration({
  orderId,
  customerName,
  etaIso,
  onShare,
}: PostPurchaseCelebrationProps) {
  const { t } = useLocale();
  const etaLabel = formatEta(etaIso);
  const firstName = customerName?.split(" ")[0];

  return (
    <section
      aria-labelledby="celebration-title"
      className={cn(
        "rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)]",
        "p-6 md:p-8 relative overflow-hidden",
      )}
    >
      {/* Ilustración sutil — success ring, sin gradiente decorativo */}
      <div className="flex items-start gap-5 md:gap-6">
        <div
          className={cn(
            "shrink-0 rounded-full",
            "w-14 h-14 md:w-16 md:h-16",
            "bg-[var(--data-success-500)]/10 border border-[var(--data-success-500)]/30",
            "flex items-center justify-center",
          )}
          aria-hidden
        >
          <CheckCircle2 className="h-7 w-7 md:h-8 md:w-8 text-[var(--data-success-500)]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] font-bold text-[var(--text-tertiary)]">
            {t("common.success")}
          </p>
          <h1
            id="celebration-title"
            className="mt-1 text-[length:var(--ts-xl)] md:text-[length:var(--ts-2xl)] font-extrabold text-[var(--text-primary)] leading-tight"
          >
            {t("postPurchase.thanks")}
            {firstName ? <span>, {firstName}</span> : null}
          </h1>
          <p className="mt-1.5 text-[length:var(--ts-sm)] text-[var(--text-secondary)]">
            Tu bodeguero confirmará el pedido en breve.
          </p>

          {/* Metrics row */}
          <div className="mt-4 grid grid-cols-2 gap-3 max-w-md">
            <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] font-bold text-[var(--text-tertiary)]">
                {t("postPurchase.orderNumber")}
              </p>
              <p className="mt-0.5 text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                #{orderId.slice(0, 10)}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] font-bold text-[var(--text-tertiary)]">
                Entrega
              </p>
              <p className="mt-0.5 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)]">
                {etaLabel}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-5 md:mt-6 flex flex-col sm:flex-row gap-2.5">
        <PrimaryButton
          size="md"
          variant="primary"
          leftIcon={<Truck className="h-4 w-4" aria-hidden />}
          asChild
          className="w-full sm:w-auto"
        >
          <Link href={`/cuenta/pedidos/${orderId}/seguimiento`}>
            {t("postPurchase.trackOrder")}
          </Link>
        </PrimaryButton>
        <PrimaryButton
          size="md"
          variant="secondary"
          leftIcon={<ShoppingBag className="h-4 w-4" aria-hidden />}
          asChild
          className="w-full sm:w-auto"
        >
          <Link href="/marketplace/explorar">
            {t("postPurchase.keepShopping")}
          </Link>
        </PrimaryButton>
        <PrimaryButton
          size="md"
          variant="ghost"
          leftIcon={<Share2 className="h-4 w-4" aria-hidden />}
          onClick={onShare}
          className="w-full sm:w-auto"
        >
          {t("postPurchase.share")}
        </PrimaryButton>
      </div>
    </section>
  );
}
