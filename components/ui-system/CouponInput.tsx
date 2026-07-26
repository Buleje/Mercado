"use client";

/**
 * CouponInput — Input de codigo promocional con validacion inline.
 *
 * Flow:
 *   1. User escribe codigo
 *   2. Click "Aplicar" → disparar validate()
 *   3. Valid: mostrar beneficio ("-10%" o "-S/5.00") + X para quitar
 *   4. Invalid: mostrar mensaje error + permitir reintento
 *
 * Ademas muestra cupones disponibles en un popover "Ver cupones".
 *
 * Uso:
 *   <CouponInput
 *     onApply={async (code) => await validateCoupon(code)}
 *     applied={currentCoupon}
 *     onRemove={() => removeCoupon()}
 *     availableCoupons={userCoupons}
 *   />
 */

import { useState } from "react";
import { Ticket, Check, X, AlertCircle, Sparkles } from "@buleje/design-system/icons";
import { formatSoles } from "@/lib/chart-helpers";
import { cn } from "@/lib/utils";

export interface AppliedCoupon {
  code: string;
  description: string;
  /** Discount en porcentaje (0-100) o en soles si isFixed */
  amount: number;
  isFixed?: boolean;
}

export interface AvailableCoupon extends AppliedCoupon {
  expiresAt?: string;
}

interface Props {
  applied?: AppliedCoupon | null;
  onApply: (code: string) => Promise<{ valid: boolean; coupon?: AppliedCoupon; error?: string }>;
  onRemove?: () => void;
  availableCoupons?: AvailableCoupon[];
  className?: string;
}

export default function CouponInput({
  applied,
  onApply,
  onRemove,
  availableCoupons = [],
  className,
}: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAvailable, setShowAvailable] = useState(false);

  const handleApply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onApply(code.trim().toUpperCase());
      if (result.valid) {
        setCode("");
      } else {
        setError(result.error ?? "Código inválido");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al validar");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    }
  };

  // Si hay cupon aplicado, mostrar solo el chip
  if (applied) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-center gap-3 rounded-2xl border-2 border-[var(--accent)] bg-primary/10 p-3",
          className,
        )}
      >
        <div className="shrink-0 h-9 w-9 rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] flex items-center justify-center">
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">{applied.code}</code>
            <span className="inline-block rounded-full bg-[var(--accent)] text-[var(--surface-canvas)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold">
              {applied.isFixed ? `-${formatSoles(applied.amount)}` : `-${applied.amount}%`}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{applied.description}</p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Quitar cupón"
            className="shrink-0 p-1.5 -m-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--data-error,_#e11d48)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-stretch gap-2">
        <div
          className={cn(
            "flex-1 flex items-center gap-2 rounded-full border bg-[var(--surface-raised)] px-3 transition-colors",
            error ? "border-[var(--data-error,_#e11d48)]" : "border-[var(--rule-base)] focus-within:border-[var(--accent)]",
          )}
        >
          <Ticket className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} aria-hidden />
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Código promocional"
            aria-label="Código promocional"
            aria-invalid={!!error}
            className="flex-1 bg-transparent outline-none py-2.5 text-sm font-bold uppercase tracking-wider text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal"
            maxLength={20}
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={!code.trim() || loading}
          className={cn(
            "rounded-full px-4 text-xs font-bold transition-all",
            code.trim() && !loading
              ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
          )}
        >
          {loading ? "Validando…" : "Aplicar"}
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--data-error,_#e11d48)]" role="alert">
          <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          {error}
        </p>
      )}

      {availableCoupons.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAvailable((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
          >
            <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
            {showAvailable ? "Ocultar" : "Ver"} mis cupones ({availableCoupons.length})
          </button>
          {showAvailable && (
            <ul className="mt-2 space-y-1.5">
              {availableCoupons.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => setCode(c.code)}
                    className="w-full flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-left hover:border-[var(--accent)] transition-colors"
                  >
                    <code className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">{c.code}</code>
                    <span className="inline-block rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold">
                      {c.isFixed ? `-${formatSoles(c.amount)}` : `-${c.amount}%`}
                    </span>
                    <span className="flex-1 min-w-0 text-xs text-[var(--text-secondary)] truncate">{c.description}</span>
                    {c.expiresAt && (
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">
                        Vence {c.expiresAt}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
