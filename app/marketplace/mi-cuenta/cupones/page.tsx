"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { EmptyState } from "@/components/ui-system/EmptyState";
import type { DbCustomerCoupon } from "@/lib/db/customer-coupons.db";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDiscount(coupon: DbCustomerCoupon): string {
  if (coupon.discountType === "porcentaje") {
    return `${coupon.discountValue}% dto.`;
  }
  return `S/ ${Number(coupon.discountValue).toFixed(2)} dto.`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  try {
    return `Vence ${new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso))}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Cupones — muestra cupones asignados al cliente.
 * El stub de CustomerCouponsDB retorna [] hasta PR-2 (ADR-059).
 */
export default function CuponesPage() {
  const { customer } = useCustomer();
  const [coupons, setCoupons] = useState<DbCustomerCoupon[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoupons = useCallback(async (phone: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ phone, tenantId: "main" });
      const res = await fetch(`/api/marketplace/mi-cuenta/cupones?${params}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { coupons: DbCustomerCoupon[] };
      setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
    } catch {
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customer?.phone) {
      fetchCoupons(customer.phone);
    } else {
      setLoading(false);
    }
  }, [customer?.phone, fetchCoupons]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)]" />
        ))}
        <span className="sr-only">Cargando cupones...</span>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (coupons.length === 0) {
    return (
      <EmptyState
        eyebrow="Cupones"
        title="Aún no tienes cupones"
        description="Los cupones aparecerán aquí cuando la tienda te los asigne o cuando completes una compra con promoción."
        action={
          <Link
            href="/marketplace/ofertas"
            className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Ver ofertas del día
          </Link>
        }
      />
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────

  const active   = coupons.filter((c) => c.active && !c.usedAt && !isExpired(c.expiresAt));
  const inactive = coupons.filter((c) => !c.active || !!c.usedAt || isExpired(c.expiresAt));

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]">
            Disponibles ({active.length})
          </h2>
          <ul className="space-y-3" aria-label="Cupones disponibles">
            {active.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} dimmed={false} />
            ))}
          </ul>
        </section>
      )}

      {inactive.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-medium text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
            Usados / vencidos ({inactive.length})
          </h2>
          <ul className="space-y-3" aria-label="Cupones usados o vencidos">
            {inactive.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} dimmed />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── CouponCard ────────────────────────────────────────────────────────────────

function CouponCard({
  coupon,
  dimmed,
}: {
  coupon: DbCustomerCoupon;
  dimmed: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  }, [coupon.code]);

  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border p-4",
        dimmed
          ? "border-gray-100 bg-[var(--surface-sunken)] dark:border-[var(--rule-soft)] dark:bg-[var(--surface-canvas)]/50"
          : "border-gray-200 bg-white dark:border-[var(--rule-base)] dark:bg-[var(--surface-canvas)]",
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "font-mono text-sm font-semibold tracking-wide",
            dimmed ? "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]" : "text-[var(--text-primary)] dark:text-[var(--text-primary)]",
          )}
        >
          {coupon.code}
        </p>
        <p className={cn("mt-0.5 text-xs", dimmed ? "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]" : "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]")}>
          {coupon.description}
        </p>
        <p className={cn("mt-1 text-xs", dimmed ? "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]" : "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]")}>
          {formatExpiry(coupon.expiresAt)}
          {coupon.minPurchase ? ` · min. S/ ${Number(coupon.minPurchase).toFixed(2)}` : ""}
        </p>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <span
          className={cn(
            "text-sm font-semibold",
            dimmed
              ? "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]"
              : "text-[#2d6a4f] dark:text-[#52b788]",
          )}
        >
          {formatDiscount(coupon)}
        </span>
        {!dimmed && (
          <button
            onClick={handleCopy}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:border-[var(--rule-strong)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-700"
            aria-label={`Copiar codigo ${coupon.code}`}
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        )}
        {coupon.usedAt && (
          <span className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">Usado</span>
        )}
      </div>
    </li>
  );
}
