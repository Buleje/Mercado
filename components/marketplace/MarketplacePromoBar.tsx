"use client";

/**
 * MarketplacePromoBar — barra slim arriba del navbar.
 *
 * Reemplaza el rol del antiguo ContextualHintBar:
 * - Se renderiza ANTES del navbar (no sticky — al scrollear se va, el nav queda).
 * - Rota mensajes promocionales cada 6s.
 * - Dismissible — oculta por 24h en localStorage.
 * - Mensajes: cupón nuevo cliente, envío gratis, métodos de pago, etc.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Truck,
  Wallet,
  Tag,
  X,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Promo = {
  id: string;
  href: string;
  text: string;
  cta: string;
  Icon: LucideIcon;
};

const PROMOS: readonly Promo[] = [
  {
    id: "first-coupon",
    href: "/marketplace/ofertas",
    text: "Primera compra con 10% de descuento",
    cta: "Codigo BIENVENIDO",
    Icon: Sparkles,
  },
  {
    id: "free-shipping",
    href: "/marketplace",
    text: "Envio gratis a Ciudad Constitución desde S/50",
    cta: "Comprar ahora",
    Icon: Truck,
  },
  {
    id: "payment",
    href: "/marketplace",
    text: "Paga al recibir — efectivo o Yape",
    cta: "Como funciona",
    Icon: Wallet,
  },
  {
    id: "deals",
    href: "/marketplace/ofertas",
    text: "Ofertas del dia hasta -40% en bodegas locales",
    cta: "Ver ofertas",
    Icon: Tag,
  },
] as const;

/** Si el CTA trae un código de cupón (BIENVENIDO), va en un chip punteado coral. */
function CtaConCodigo({ cta }: { cta: string }) {
  const m = cta.match(/\b[A-Z]{4,}\d{0,3}\b/);
  if (!m || m.index === undefined) return <>{cta}</>;
  return (
    <>
      {cta.slice(0, m.index)}
      <span className="rounded-[var(--radius-xs)] border border-dashed border-amber-400 px-1.5 font-mono font-bold tracking-wide text-amber-300">
        {m[0]}
      </span>
      {cta.slice(m.index + m[0].length)}
    </>
  );
}

const DISMISS_KEY = "buleje-promo-bar-dismissed-until";
const DISMISS_HOURS = 24;
const ROTATE_MS = 6000;

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function markDismissed() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_HOURS * 60 * 60 * 1000));
  } catch {
    /* silent */
  }
}

export default function MarketplacePromoBar() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return isDismissed();
  });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % PROMOS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [dismissed]);

  const promo = useMemo(() => PROMOS[index % PROMOS.length], [index]);

  if (dismissed) return null;

  const { Icon } = promo;

  return (
    <div
      role="region"
      aria-label="Promociones del marketplace"
      className={cn(
        "relative w-full",
        // «Dosel» (2026-10-10): la franja toma el teal hondo del hero.
        "bg-[var(--dosel-950)] text-white",
        "border-b border-white/10",
      )}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-2 h-9 pr-7 text-[length:var(--ts-xs)]">
          <Icon
            className="h-3.5 w-3.5 shrink-0 opacity-80"
            strokeWidth={1.75}
            aria-hidden
          />
          <span aria-live="polite" className="truncate">
            {promo.text}
          </span>
          <Link
            href={promo.href}
            className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline whitespace-nowrap"
          >
            <CtaConCodigo cta={promo.cta} />
            <ArrowRight className="h-3 w-3" aria-hidden strokeWidth={2} />
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          markDismissed();
          setDismissed(true);
        }}
        aria-label="Ocultar barra de promociones"
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2",
          "inline-flex h-6 w-6 items-center justify-center rounded-full",
          "text-white/70 hover:text-white",
          "hover:bg-white/10 transition-colors",
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
      </button>
    </div>
  );
}
