"use client";

import { memo } from "react";
import { Check, Clock, MapPin, MessageCircle, ArrowRight, Gift } from "@buleje/design-system/icons";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PrimaryButton, IconBadge } from "@buleje/design-system";

/**
 * OrderConfirmationCard — pantalla de exito post-pago.
 *
 * Cialdini commitment post-conversion. Muestra:
 *   - Confirmacion visual grande (✓ animated)
 *   - Resumen del pedido
 *   - ETA concreto
 *   - CTAs: seguir pedido, WhatsApp soporte
 *   - Opcional: invitar a un amigo (referral Cialdini reciprocity)
 *
 * @example
 * <OrderConfirmationCard
 *   orderId="BUL-1234"
 *   totalAmount={47.5}
 *   etaMinutes={25}
 *   address="Jr. Ucayali 450"
 *   itemsCount={7}
 *   paymentMethod="yape"
 * />
 */

interface Props {
  orderId: string;
  totalAmount: number;
  etaMinutes?: number;
  address?: string;
  itemsCount?: number;
  paymentMethod?: "yape" | "plin" | "efectivo";
  referralCode?: string;
  onReferral?: () => void;
  className?: string;
}

const PAYMENT_LABELS = {
  yape: "Yape",
  plin: "Plin",
  efectivo: "Efectivo al recibir",
};

export const OrderConfirmationCard = memo(function OrderConfirmationCard({
  orderId,
  totalAmount,
  etaMinutes = 25,
  address,
  itemsCount,
  paymentMethod,
  referralCode,
  onReferral,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "max-w-xl mx-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        className,
      )}
    >
      {/* Hero confirmation */}
      <div className="p-8 sm:p-10 text-center border-b border-[var(--rule-soft)]" style={{ background: "var(--brand-ink)" }}>
        {/* Big animated check */}
        <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-[var(--data-success)] mb-5 relative">
          <Check className="h-10 w-10 text-white" strokeWidth={2.5} />
          <span className="absolute inset-0 rounded-full bg-[var(--data-success)] opacity-30 animate-ping" />
        </div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 mb-2">
          Pedido confirmado
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-[-0.015em] text-white leading-[1.05] mb-3">
          ¡Ya lo estamos preparando!
        </h1>
        <p className="text-white/65 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
          Tu pedido{" "}
          <span className="font-bold tabular-nums text-white">
            #{orderId.slice(-6).toUpperCase()}
          </span>
          {" "}llega en{" "}
          <span className="font-bold tabular-nums text-white">~{etaMinutes} min</span>.
        </p>
      </div>

      {/* Resumen del pedido */}
      <dl className="divide-y divide-[var(--rule-soft)]">
        <div className="flex items-center justify-between px-6 py-4">
          <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Total
          </dt>
          <dd className="text-xl font-extrabold tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            S/ {totalAmount.toFixed(2)}
          </dd>
        </div>
        {itemsCount != null && (
          <div className="flex items-center justify-between px-6 py-4">
            <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Productos
            </dt>
            <dd className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {itemsCount} {itemsCount === 1 ? "producto" : "productos"}
            </dd>
          </div>
        )}
        {paymentMethod && (
          <div className="flex items-center justify-between px-6 py-4">
            <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Pago
            </dt>
            <dd className="text-sm font-bold text-[var(--text-primary)]">
              {PAYMENT_LABELS[paymentMethod]}
            </dd>
          </div>
        )}
        {etaMinutes != null && (
          <div className="flex items-center justify-between px-6 py-4">
            <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1.5">
              <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Entrega
            </dt>
            <dd className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
              ~{etaMinutes} min
            </dd>
          </div>
        )}
        {address && (
          <div className="px-6 py-4">
            <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1.5 mb-1">
              <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Dirección
            </dt>
            <dd className="text-sm text-[var(--text-primary)] leading-snug">{address}</dd>
          </div>
        )}
      </dl>

      {/* CTAs */}
      <div className="p-5 space-y-2.5">
        <PrimaryButton
          asChild
          size="lg"
          className="w-full rounded-full"
          rightIcon={<ArrowRight className="h-4 w-4" strokeWidth={2} />}
        >
          <Link href={`/mis-pedidos`}>Seguir mi pedido</Link>
        </PrimaryButton>
        <a
          href={`https://wa.me/51916409675?text=${encodeURIComponent(`Hola, soy del pedido #${orderId.slice(-6).toUpperCase()}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-transparent text-[var(--text-primary)] py-3 text-sm font-bold border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
          WhatsApp de soporte
        </a>
      </div>

      {/* Referral (Cialdini reciprocity) */}
      {referralCode && (
        <div className="p-5 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <div className="flex items-start gap-3">
            <IconBadge size="md" shape="square"><Gift className="h-4 w-4" strokeWidth={1.75} /></IconBadge>
            <div className="flex-1 min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                Invitá a un amigo
              </p>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-3">
                Con tu código{" "}
                <span className="inline-flex items-center rounded bg-[var(--surface-raised)] border border-[var(--rule-base)] px-2 py-0.5 font-mono tabular-nums text-xs">
                  {referralCode}
                </span>
                {" "}ambos reciben S/ 10 en su próximo pedido.
              </p>
              <button
                type="button"
                onClick={onReferral}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] underline underline-offset-2 hover:opacity-70"
              >
                Compartir por WhatsApp
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
