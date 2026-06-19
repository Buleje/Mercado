"use client";

/**
 * CheckoutCouponFields — lista de inputs de cupón por tienda (multi-vendor).
 *
 * Single source de la lógica de cupón del checkout: valida contra
 * `/api/marketplace/coupons/validate` (anti-fraude server-side), aplica via
 * `setCouponForStore` del checkout-data-context y muestra el chip aplicado con
 * botón "Quitar". Lo consumen tanto `/checkout/entrega` como `/checkout/confirmar`
 * (los usuarios fast-track saltan entrega, así que necesitan el campo en confirmar).
 *
 * El descuento NO se confía al cliente: confirmar re-valida el total esperado en
 * backend antes de crear la orden. Esto es solo el input + preview.
 */

import { useCallback, useState } from "react";
import { CheckCircle2, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type CouponStoreGroup = { storeSlug: string; storeName: string };
type CouponEntry = { code: string; discount: number; description?: string };

interface CheckoutCouponFieldsProps {
  byStore: Record<string, CouponStoreGroup>;
  coupons: Record<string, CouponEntry>;
  setCouponForStore: (storeSlug: string, entry: CouponEntry | null) => void;
  totalByStore: Record<string, { total: number } | undefined>;
}

export default function CheckoutCouponFields({
  byStore,
  coupons,
  setCouponForStore,
  totalByStore,
}: CheckoutCouponFieldsProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCoupon = useCallback(
    async (storeSlug: string) => {
      const code = (inputs[storeSlug] || "").trim();
      if (!code) return;
      const cartTotal = totalByStore[storeSlug]?.total ?? 0;
      setLoading((p) => ({ ...p, [storeSlug]: true }));
      setErrors((p) => ({ ...p, [storeSlug]: "" }));
      try {
        const res = await fetch("/api/marketplace/coupons/validate", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ code, storeSlug, cartTotal }),
        });
        // Chequear res.ok antes de .json(): un 4xx/5xx con body HTML rompe el
        // parse y el cliente vería "Error de conexión" en vez del motivo real.
        if (!res.ok) {
          let reason = "Cupón inválido";
          try {
            const body = await res.json();
            if (body?.reason) reason = body.reason;
            else if (res.status === 429) reason = "Demasiados intentos. Prueba en un momento.";
            else if (res.status >= 500) reason = "El servidor falló. Intenta de nuevo.";
          } catch {
            if (res.status === 429) reason = "Demasiados intentos. Prueba en un momento.";
            else if (res.status >= 500) reason = "El servidor falló. Intenta de nuevo.";
          }
          setErrors((p) => ({ ...p, [storeSlug]: reason }));
          return;
        }
        const data = await res.json();
        if (data.valid) {
          setCouponForStore(storeSlug, {
            code: data.code || code,
            discount: Number(data.discount) || 0,
            description: data.description,
          });
          setInputs((p) => ({ ...p, [storeSlug]: "" }));
        } else {
          setErrors((p) => ({ ...p, [storeSlug]: data.reason || "Cupón inválido" }));
        }
      } catch {
        setErrors((p) => ({ ...p, [storeSlug]: "Error de conexión" }));
      } finally {
        setLoading((p) => ({ ...p, [storeSlug]: false }));
      }
    },
    [inputs, totalByStore, setCouponForStore],
  );

  const removeCoupon = useCallback(
    (storeSlug: string) => setCouponForStore(storeSlug, null),
    [setCouponForStore],
  );

  return (
    <div className="space-y-3">
      {Object.keys(byStore).map((sid) => {
        const g = byStore[sid];
        const slug = g.storeSlug;
        const applied = coupons[slug];
        const inputVal = inputs[slug] ?? "";
        const isLoading = !!loading[slug];
        const err = errors[slug];
        return (
          <div key={sid} className="space-y-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {g.storeName}
            </p>
            {applied ? (
              <div className="flex items-center justify-between rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)] pl-4 pr-2 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2
                    className="h-4 w-4 text-[var(--accent)] shrink-0"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <span className="text-base font-bold text-[var(--text-primary)] truncate">
                    {applied.code}
                  </span>
                  <span className="text-base text-[var(--accent)] tabular-nums font-bold shrink-0">
                    −{fmt(applied.discount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeCoupon(slug)}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--surface-raised)] px-3 h-8 text-sm font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) =>
                    setInputs((p) => ({ ...p, [slug]: e.target.value.toUpperCase() }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      validateCoupon(slug);
                    }
                  }}
                  placeholder="Código de cupón"
                  maxLength={30}
                  aria-label={`Cupón para ${g.storeName}`}
                  className={cn(
                    "h-12 w-full rounded-2xl border-2 bg-[var(--surface-raised)] px-4 text-base uppercase tracking-wider font-semibold text-[var(--text-primary)] outline-none transition-colors",
                    err
                      ? "border-[var(--data-error-500)] focus:border-[var(--data-error-500)]"
                      : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
                  )}
                />
                <button
                  type="button"
                  onClick={() => validateCoupon(slug)}
                  disabled={isLoading || !inputVal.trim()}
                  className={cn(
                    "shrink-0 inline-flex items-center justify-center rounded-2xl px-5 h-12",
                    "text-base font-bold transition-colors",
                    "bg-[var(--surface-sunken)] text-[var(--text-primary)] border-2 border-[var(--rule-base)]",
                    "hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {isLoading ? "..." : "Aplicar"}
                </button>
              </div>
            )}
            {err && !applied && (
              <p className="text-sm text-[var(--data-error-500)] inline-flex items-center gap-1 ml-1">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {err}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
