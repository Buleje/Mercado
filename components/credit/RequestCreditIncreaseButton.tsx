"use client";

import { useState, useCallback } from "react";
import { TrendingUp, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

type State = "idle" | "sending" | "sent" | "error";

/**
 * RequestCreditIncreaseButton — el vecino pide a la bodega que le suba su línea
 * de fiado desde /mi-credito. POST a /api/credit/request-increase, que crea una
 * notificación para el dueño (no cambia el límite: la decisión es de la bodega).
 * Dedup 24h en el backend → un solo request por cliente por día.
 */
export function RequestCreditIncreaseButton() {
  const [state, setState] = useState<State>("idle");

  const request = useCallback(async () => {
    if (state === "sending" || state === "sent") return;
    setState("sending");
    try {
      const res = await fetch("/api/credit/request-increase", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setState("error");
        const body = await res.json().catch(() => ({}));
        logger.error("[RequestCreditIncrease] failed", { status: res.status, body });
        return;
      }
      setState("sent");
    } catch (err) {
      setState("error");
      logger.error("[RequestCreditIncrease] error", { error: String(err) });
    }
  }, [state]);

  if (state === "sent") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--data-success-200,var(--rule-base))] bg-[var(--data-success-50,var(--surface-sunken))] px-4 py-3 text-sm font-medium text-[var(--data-success-700)]">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
        ¡Solicitud enviada! La bodega la revisará y te avisará.
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={request}
        disabled={state === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
      >
        {state === "sending" ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <TrendingUp className="h-5 w-5 shrink-0" aria-hidden />
        )}
        Pedir aumento de mi línea
      </button>
      {state === "error" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--data-error-600)]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No se pudo enviar. Intenta de nuevo en un momento.
        </p>
      )}
    </div>
  );
}
