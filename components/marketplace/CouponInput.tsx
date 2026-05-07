"use client";

/**
 * CouponInput — Input de cupón reusable para el checkout.
 *
 * Consume el endpoint existente `POST /api/coupons/validate` que ya vive en
 * `app/api/coupons/validate/route.ts`. Devuelve al padre el coupon + discount
 * calculados por el backend (Regla 6 de CLAUDE.md: totales en backend,
 * client-side solo preview).
 *
 * Uso:
 *   <CouponInput
 *     cartTotal={total}
 *     onApply={(coupon, discount) => setAppliedCoupon({ coupon, discount })}
 *     onRemove={() => setAppliedCoupon(null)}
 *     appliedCode={appliedCoupon?.coupon?.code}
 *   />
 *
 * Parte de Ola 1 — Retención Marketplace (ADR-059).
 */

import { useState, useCallback, type FormEvent } from "react";
import { Ticket, Loader2, Check, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ValidateCouponSchema } from "@/lib/validations/coupon-redeem.schema";

interface CouponPayload {
  code: string;
  discountType: string;
  discountValue: number;
  balance?: number | null;
}

interface CouponInputProps {
  cartTotal: number;
  onApply: (coupon: CouponPayload, discount: number) => void;
  onRemove?: () => void;
  appliedCode?: string | null;
  appliedDiscount?: number;
  className?: string;
  disabled?: boolean;
}

export default function CouponInput({
  cartTotal,
  onApply,
  onRemove,
  appliedCode,
  appliedDiscount,
  className,
  disabled,
}: CouponInputProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasApplied = Boolean(appliedCode);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      // Client-side preview validation (backend re-valida)
      const parsed = ValidateCouponSchema.safeParse({ code, cartTotal });
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        setError(firstIssue?.message ?? "Código inválido");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: parsed.data.code,
            cartTotal: parsed.data.cartTotal,
          }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(json?.error ?? "No se pudo validar el cupón");
          return;
        }

        if (json?.coupon && typeof json.discount === "number") {
          onApply(json.coupon as CouponPayload, Number(json.discount));
          setCode("");
        } else {
          setError("Respuesta inválida del servidor");
        }
      } catch {
        setError("Error de conexión. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    },
    [code, cartTotal, onApply],
  );

  const handleRemove = useCallback(() => {
    onRemove?.();
    setCode("");
    setError(null);
  }, [onRemove]);

  if (hasApplied) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/30",
          className,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Check className="h-4 w-4 shrink-0 text-[var(--data-success-600)] dark:text-emerald-400" />
          <span className="text-sm font-semibold text-[var(--data-success-700)] dark:text-emerald-300 truncate">
            {appliedCode}
          </span>
          {typeof appliedDiscount === "number" && appliedDiscount > 0 && (
            <span className="text-xs text-[var(--data-success-600)] dark:text-emerald-400">
              -S/ {appliedDiscount.toFixed(2)}
            </span>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--data-success-700)] hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            aria-label="Remover cupón"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)} noValidate>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
        ¿Tienes un cupón?
      </label>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Ticket
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading || disabled}
            placeholder="Ej: WELCOME20"
            className="w-full min-h-[44px] rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm font-semibold uppercase tracking-wide text-gray-800 placeholder:normal-case placeholder:font-normal placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 dark:border-card-border dark:bg-surface dark:text-foreground"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            aria-invalid={Boolean(error)}
          />
        </div>
        <button
          type="submit"
          disabled={loading || disabled || code.trim().length < 3}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando
            </>
          ) : (
            "Aplicar"
          )}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-1.5 text-xs font-medium text-[var(--data-error-600)] dark:text-red-400"
        >
          {error}
        </p>
      )}
    </form>
  );
}
