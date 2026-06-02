"use client";

/**
 * ClienteFrecuenteBadge — Badge dorado que aparece tras 5+ pedidos. Crea
 * sensación de pertenencia y comunica el descuento implícito (-5% en
 * próximas compras).
 *
 * Bug Hunter Report 2026-04-30 P1#9 fix: ANTES el conteo vivia en
 * localStorage `buleje:order-count` — manipulable por el usuario para
 * obtener -10% que no le correspondía. AHORA: fetch a
 * `/api/marketplace/customer-tier` que cuenta orders entregados reales
 * del cliente en DB (cross-tenant fidelity). localStorage queda solo
 * como fallback opcional cuando el cliente NO tiene sesión.
 *
 * Tres niveles de prestigio:
 *   - 5–9 pedidos → "Cliente Frecuente"   · halo teal claro
 *   - 10–24      → "Cliente VIP"          · halo amber
 *   - 25+        → "Cliente Embajador"    · halo gold + ribbon
 */

import { useEffect, useState } from "react";
import { Crown, Sparkles, Award } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { fetchCustomerTier } from "@/lib/customer-tier-cache";

// LocalStorage key — solo se usa como fallback para clientes ANONIMOS
// que aun no tienen sesion. Cliente con sesion -> server count.
const COUNT_KEY = "buleje:order-count";

type Tier = {
  level: "frecuente" | "vip" | "embajador";
  label: string;
  Icon: typeof Crown;
  color: string;
  bg: string;
  border: string;
  /** Descuento implícito mostrado al cliente */
  discountPct: number;
};

function getTier(count: number): Tier | null {
  if (count >= 25) {
    return {
      level: "embajador",
      label: "Cliente Embajador",
      Icon: Crown,
      color: "#B45309",
      bg: "#FEF3C7",
      border: "#F59E0B",
      discountPct: 10,
    };
  }
  if (count >= 10) {
    return {
      level: "vip",
      label: "Cliente VIP",
      Icon: Award,
      color: "#92400E",
      bg: "#FED7AA",
      border: "#EA580C",
      discountPct: 7,
    };
  }
  if (count >= 5) {
    return {
      level: "frecuente",
      label: "Cliente Frecuente",
      Icon: Sparkles,
      color: "var(--accent)",
      bg: "var(--accent-soft)",
      border: "var(--accent)",
      discountPct: 5,
    };
  }
  return null;
}

interface ClienteFrecuenteBadgeProps {
  /** Variante visual: chip compact (navbar) o card detallada (perfil) */
  variant?: "chip" | "card";
}

export default function ClienteFrecuenteBadge({
  variant = "chip",
}: ClienteFrecuenteBadgeProps) {
  const { customer } = useCustomer();
  const [count, setCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Bug Hunter P1#9 fix: priorizar count del SERVIDOR si hay cliente con
  // sesión (no manipulable). localStorage solo como fallback anónimo.
  useEffect(() => {
    setHydrated(true);

    // 1. Si hay cliente identificado → tier real del servidor (cacheado +
    //    deduplicado en lib/customer-tier-cache para no reventar el rate-limit).
    if (customer?.phone) {
      let cancelled = false;
      fetchCustomerTier(customer.phone).then((data) => {
        if (!cancelled) setCount(data.count);
      });
      return () => {
        cancelled = true;
      };
    }

    // 2. Sin cliente identificado → fallback localStorage (legacy anónimo)
    try {
      const raw = localStorage.getItem(COUNT_KEY);
      const n = raw ? Number(raw) : 0;
      if (Number.isFinite(n)) setCount(n);
    } catch {
      /* silent */
    }
    const onUpdate = () => {
      try {
        const raw = localStorage.getItem(COUNT_KEY);
        const n = raw ? Number(raw) : 0;
        if (Number.isFinite(n)) setCount(n);
      } catch {
        /* silent */
      }
    };
    window.addEventListener("buleje:order-count-updated", onUpdate);
    return () =>
      window.removeEventListener("buleje:order-count-updated", onUpdate);
  }, [customer?.phone]);

  if (!hydrated) return null;

  const tier = getTier(count);
  if (!tier) return null;

  const { Icon, label, color, bg, border, discountPct } = tier;

  if (variant === "chip") {
    return (
      <span
        title={`${label} — ${count} pedidos · -${discountPct}% extra`}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-xs)] font-bold border"
        style={{ color, backgroundColor: bg, borderColor: border }}
      >
        <Icon className="h-3 w-3" strokeWidth={2.25} />
        {label}
      </span>
    );
  }

  // Variant card
  return (
    <div
      className="rounded-2xl border-2 p-4 sm:p-5"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <div className="flex items-center gap-3">
        <div
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"
          style={{ backgroundColor: border, color: "white" }}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]" style={{ color }}>
            Tu nivel
          </p>
          <p className="text-lg font-black" style={{ color }}>
            {label}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase" style={{ color }}>
            Pedidos
          </p>
          <p className="text-2xl font-black tabular-nums" style={{ color }}>
            {count}
          </p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-current/20">
        <p className="text-sm font-bold" style={{ color }}>
          Tenés {discountPct}% off extra en cada compra
        </p>
        <p className="text-xs mt-0.5" style={{ color, opacity: 0.85 }}>
          Se aplica automáticamente al ir al checkout.
        </p>
      </div>
    </div>
  );
}

/**
 * Helper para que el flujo de checkout incremente el contador post-éxito.
 */
export function incrementOrderCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    const cur = raw ? Number(raw) : 0;
    const next = (Number.isFinite(cur) ? cur : 0) + 1;
    localStorage.setItem(COUNT_KEY, String(next));
    window.dispatchEvent(new CustomEvent("buleje:order-count-updated"));
    return next;
  } catch {
    return 0;
  }
}

export function getOrderCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export { getTier };
