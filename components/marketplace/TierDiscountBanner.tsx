"use client";

/**
 * TierDiscountBanner — Banner que aparece en checkout si el cliente
 * tiene tier (5+ pedidos entregados). Llama al endpoint
 * /api/marketplace/customer-tier para validar server-side antes de
 * mostrarlo (no fiarse solo de localStorage).
 *
 * Uso: <TierDiscountBanner customerPhone={customer.phone} />
 */

import { useEffect, useState } from "react";
import { Sparkles, Award, Crown } from "lucide-react";

interface ServerTier {
  level: "frecuente" | "vip" | "embajador";
  label: string;
  discountPct: number;
}

const ICON_MAP = {
  frecuente: Sparkles,
  vip: Award,
  embajador: Crown,
} as const;

const COLOR_MAP = {
  frecuente: { bg: "var(--accent-soft)", border: "var(--accent)", text: "var(--accent)" },
  vip: { bg: "#FED7AA", border: "#EA580C", text: "#92400E" },
  embajador: { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309" },
} as const;

interface TierDiscountBannerProps {
  customerPhone?: string | null;
  /** Total bruto para mostrar cuánto ahorra concretamente */
  total?: number;
}

export default function TierDiscountBanner({
  customerPhone,
  total,
}: TierDiscountBannerProps) {
  const [tier, setTier] = useState<ServerTier | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!customerPhone || customerPhone.trim().length < 6) {
      setTier(null);
      return;
    }
    const url = `/api/marketplace/customer-tier?phone=${encodeURIComponent(customerPhone.trim())}`;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setTier(json?.tier ?? null);
        setCount(json?.count ?? 0);
      })
      .catch(() => setTier(null));
    return () => {
      cancelled = true;
    };
  }, [customerPhone]);

  if (!tier) return null;

  const Icon = ICON_MAP[tier.level];
  const colors = COLOR_MAP[tier.level];
  const savings = total != null ? (total * tier.discountPct) / 100 : null;

  return (
    <div
      className="rounded-2xl border-2 p-4 flex items-center gap-3"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <div
        className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-sm"
        style={{ backgroundColor: colors.border, color: "white" }}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: colors.text }}>
          {tier.label} · {count} pedidos
        </p>
        <p className="text-sm font-bold mt-0.5" style={{ color: colors.text }}>
          Tenés <span className="text-base font-black">{tier.discountPct}%</span> off extra
          {savings != null && savings > 0 && (
            <span className="font-normal opacity-80">
              {" "}— ahorrás S/ {savings.toFixed(2)} en este pedido
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
