"use client";

import { useState, useEffect } from "react";
import { Tag, X } from "@buleje/design-system/icons";

interface ActiveCoupon {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minPurchase: number | null;
}

interface StickyCouponBannerProps {
  tenantSlug: string;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function getDismissedKey(tenantSlug: string) {
  return `buleje-sticky-coupon-dismissed-${tenantSlug}`;
}

function isDismissed(tenantSlug: string): boolean {
  try {
    const raw = localStorage.getItem(getDismissedKey(tenantSlug));
    if (!raw) return false;
    const { ts } = JSON.parse(raw) as { ts: number };
    return Date.now() - ts < TTL_MS;
  } catch {
    return false;
  }
}

function setDismissed(tenantSlug: string) {
  try {
    localStorage.setItem(
      getDismissedKey(tenantSlug),
      JSON.stringify({ ts: Date.now() }),
    );
  } catch {
    // localStorage puede fallar en modo privado — ignorar
  }
}

function formatDiscount(coupon: ActiveCoupon): string {
  if (coupon.discountType === "percent") {
    return `-${coupon.discountValue}%`;
  }
  return `-S/${coupon.discountValue.toFixed(2)}`;
}

function buildLabel(coupon: ActiveCoupon): string {
  const discount = formatDiscount(coupon);
  if (coupon.minPurchase && coupon.minPurchase > 0) {
    return `${discount} en compras mayores a S/${coupon.minPurchase.toFixed(0)}`;
  }
  return coupon.description || `Cupón ${discount}`;
}

/**
 * StickyCouponBanner — banner sticky que muestra el cupón activo del tenant.
 *
 * Mobile: barra fija al fondo (max 60px).
 * Desktop: sidebar fijo derecho (280px).
 * Se oculta si el usuario lo cierra (localStorage TTL 24h) o si no hay cupón.
 */
export default function StickyCouponBanner({
  tenantSlug,
}: StickyCouponBannerProps) {
  const [coupon, setCoupon] = useState<ActiveCoupon | null>(null);
  const [dismissed, setDismissedState] = useState(true); // empieza oculto hasta hidratar
  const [copied, setCopied] = useState(false);

  // Hidratar desde localStorage + fetch del cupón activo
  useEffect(() => {
    if (isDismissed(tenantSlug)) return;

    // Fetch cupón público activo para este tenant
    const controller = new AbortController();
    fetch(`/api/coupons/active?tenant=${encodeURIComponent(tenantSlug)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { data?: ActiveCoupon };
        if (json.data) {
          setCoupon(json.data);
          setDismissedState(false);
        }
      })
      .catch(() => {
        // Fire-and-forget — si falla, el banner simplemente no se muestra
      });

    return () => controller.abort();
  }, [tenantSlug]);

  function handleDismiss() {
    setDismissed(tenantSlug);
    setDismissedState(true);
  }

  function handleApply() {
    if (!coupon) return;
    try {
      navigator.clipboard.writeText(coupon.code).catch(() => undefined);
    } catch {
      // no clipboard API — ignorar
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (dismissed || !coupon) return null;

  const label = buildLabel(coupon);

  return (
    <>
      {/* Mobile: barra fija al fondo */}
      <div
        role="complementary"
        aria-label="Cupón disponible"
        className="
          fixed bottom-0 left-0 right-0 z-40
          md:hidden
          flex items-center gap-3
          bg-[var(--surface-raised)] border-t border-[var(--rule-base)]
          px-4 py-2 h-[60px] shadow-lg
        "
      >
        <Tag
          className="h-4 w-4 flex-shrink-0 text-[var(--accent-primary,#2d6a4f)]"
          aria-hidden="true"
        />
        <p className="flex-1 text-sm font-semibold text-[var(--text-primary)] truncate">
          {label}
        </p>
        <button
          type="button"
          onClick={handleApply}
          className="
            flex-shrink-0 rounded-full
            bg-[var(--accent-primary,#2d6a4f)] text-white
            px-3 py-1 text-xs font-bold
            hover:opacity-90 transition-opacity
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-[var(--accent-primary,#2d6a4f)]
          "
          aria-label={copied ? "Código copiado" : `Copiar cupón ${coupon.code}`}
        >
          {copied ? "Copiado" : "Aplicar"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-full hover:bg-[var(--surface-sunken)] transition-colors"
          aria-label="Cerrar banner de cupón"
        >
          <X className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
        </button>
      </div>

      {/* Desktop: sidebar fijo derecho */}
      <div
        role="complementary"
        aria-label="Cupón disponible"
        className="
          hidden md:flex
          fixed bottom-6 right-6 z-40
          w-[280px] flex-col gap-3
          bg-[var(--surface-raised)] border border-[var(--rule-base)]
          rounded-2xl shadow-xl p-4
        "
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag
              className="h-4 w-4 flex-shrink-0 text-[var(--accent-primary,#2d6a4f)]"
              aria-hidden="true"
            />
            <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-tight">
              Cupón disponible
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-full hover:bg-[var(--surface-sunken)] transition-colors flex-shrink-0"
            aria-label="Cerrar banner de cupón"
          >
            <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
          {label}
        </p>

        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-[var(--surface-sunken)] px-3 py-1.5 text-sm font-mono font-bold text-[var(--text-primary)] tracking-widest truncate">
            {coupon.code}
          </code>
          <button
            type="button"
            onClick={handleApply}
            className="
              flex-shrink-0 rounded-lg
              bg-[var(--accent-primary,#2d6a4f)] text-white
              px-4 py-1.5 text-sm font-bold
              hover:opacity-90 transition-opacity
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
              focus-visible:outline-[var(--accent-primary,#2d6a4f)]
            "
            aria-label={copied ? "Código copiado" : `Copiar cupón ${coupon.code}`}
          >
            {copied ? "Copiado" : "Aplicar"}
          </button>
        </div>
      </div>
    </>
  );
}
