"use client";

/**
 * TipWidget — caja para que el cliente deje propina al partner tras la
 * entrega. POST a /api/delivery/tip/[orderId]. Idempotente: si ya hay tip,
 * devuelve 409 y mostramos thank-you.
 *
 * Flow:
 *   1. botones rápidos: S/ 2, 5, 10
 *   2. campo "Otro monto" + textarea mensaje opcional
 *   3. submit → success state con check verde
 */

import { useState } from "react";
import { Gift, Loader2, CheckCircle2, AlertTriangle } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface Props {
  orderId: string;
  partnerName: string;
}

const QUICK_AMOUNTS = [2, 5, 10];

export default function TipWidget({ orderId, partnerName }: Props) {
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalAmount = amount ?? Number(customAmount) ?? 0;
  const valid = finalAmount > 0 && finalAmount <= 500;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/delivery/tip/${orderId}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          amount: finalAmount,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos procesar la propina.");
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 dark:border-[var(--data-success-700)] bg-emerald-50 dark:bg-emerald-950/30 p-5 text-center">
        <CheckCircle2 className="h-12 w-12 mx-auto text-[var(--data-success-600)] dark:text-emerald-400" strokeWidth={2.25} />
        <p className="mt-2 text-base font-extrabold text-[var(--data-success-700)] dark:text-emerald-300">
          ¡Gracias por tu propina!
        </p>
        <p className="mt-1 text-sm text-[var(--data-success-500)]/80 dark:text-emerald-300/80">
          {partnerName} la recibirá directo en su cuenta.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--surface-raised)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <Gift className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
        <h3 className="text-base font-extrabold text-[var(--text-primary)]">
          ¿Dejarle propina a {partnerName}?
        </h3>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        100% para el repartidor. Opcional, pero motiva al equipo.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => { setAmount(a); setCustomAmount(""); }}
            className={`h-12 rounded-xl border-2 font-extrabold transition-colors ${
              amount === a
                ? "border-[var(--accent)] bg-[var(--accent-600,var(--accent))] text-white"
                : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--accent)]"
            }`}
          >
            S/ {a}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
          Otro monto
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-bold">S/</span>
          <input
            type="number"
            min={1}
            max={500}
            step={0.5}
            value={customAmount}
            onChange={(e) => { setCustomAmount(e.target.value); setAmount(null); }}
            placeholder="0"
            className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)] outline-none"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
          Mensaje <span className="font-normal normal-case">(opcional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="¡Gracias por la rapidez!"
          className="w-full px-3 py-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] outline-none resize-none"
        />
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-red-300">
          <AlertTriangle className="inline h-4 w-4 mr-1.5 mb-0.5" />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!valid || submitting}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-extrabold text-white shadow-md disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gift className="h-5 w-5" />}
        Dar S/ {finalAmount > 0 ? finalAmount.toFixed(2) : "—"} de propina
      </button>
    </div>
  );
}
