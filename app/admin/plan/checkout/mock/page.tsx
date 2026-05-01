"use client";

/**
 * /admin/plan/checkout/mock?plan=pro
 *
 * Mock de checkout solo en dev. Cuando STRIPE_PRICE_IDS no está
 * configurado, /api/billing/checkout devuelve esta URL para acelerar
 * testing local sin secrets reales. Producción nunca llega acá.
 */

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertTriangle, Sparkles } from "@buleje/design-system/icons";

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

export default function MockCheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params?.get("plan") ?? "pro";

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PLAN_PRICES: Record<string, { name: string; price: string }> = {
    pro: { name: "Pro", price: "S/ 99" },
    business: { name: "Business", price: "S/ 249" },
    enterprise: { name: "Enterprise", price: "Custom" },
  };
  const planInfo = PLAN_PRICES[plan] ?? { name: plan, price: "—" };

  const simulatePayment = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Mock: actualiza el tenant a este plan directamente (solo dev).
      const res = await fetch("/api/admin/plan/mock-activate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "No pudimos activar el plan mock");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/admin?tab=plan"), 2000);
    } catch {
      setError("Error de red.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="rounded-3xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-4 mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Modo desarrollo — sin pasarela real
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Stripe no está configurado. Esta página simula el checkout para testing local.
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
          {!done && (
            <>
              <div className="text-center mb-6">
                <Sparkles className="h-10 w-10 mx-auto text-[var(--accent)]" strokeWidth={2.25} />
                <h1 className="mt-3 text-2xl font-extrabold text-[var(--text-primary)]">
                  Activar plan {planInfo.name}
                </h1>
                <p className="mt-1 text-3xl font-extrabold text-[var(--accent)]">{planInfo.price}<span className="text-sm font-bold text-[var(--text-tertiary)]">/mes</span></p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={simulatePayment}
                disabled={submitting}
                className="w-full h-14 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-extrabold text-white shadow-md disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                Simular pago exitoso
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
            </>
          )}

          {done && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-16 w-16 mx-auto text-[var(--data-success)]" strokeWidth={2.25} />
              <h2 className="mt-4 text-xl font-extrabold text-[var(--text-primary)]">¡Plan activado!</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Llevándote al admin…
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
