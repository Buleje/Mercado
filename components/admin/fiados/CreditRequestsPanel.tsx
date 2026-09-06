"use client";

import { useState, useEffect, useCallback } from "react";
import { HandCoins, Check, X, Loader2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

/**
 * CreditRequestsPanel — cola de solicitudes de línea de fiado que el vecino
 * mandó desde /mi-credito (Frente 3). El dueño aprueba (fija un monto) o rechaza.
 * Aprobar → CreditDB.grantLimit desbloquea el fiado en checkout del cliente.
 *
 * Solo se muestra si hay solicitudes PENDING (no ensucia el módulo si no hay).
 */

type CreditRequest = {
  id: string;
  customerId: string;
  customerName: string | null;
  requestedAmount: number | null;
  reason: string | null;
  createdAt: string;
};

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
};

export default function CreditRequestsPanel() {
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/credit/requests", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.requests) return;
        setRequests(data.requests);
        // Prefill del input con el monto pedido (o vacío).
        const seed: Record<string, string> = {};
        for (const req of data.requests as CreditRequest[]) {
          seed[req.id] = req.requestedAmount != null ? String(req.requestedAmount) : "";
        }
        setAmounts(seed);
      })
      .catch((err) => logger.error("[CreditRequestsPanel] load failed", { error: String(err) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const decide = useCallback(
    async (id: string, action: "approve" | "reject") => {
      if (busy[id]) return;
      const approvedLimit = action === "approve" ? Number(amounts[id]) : undefined;
      if (action === "approve" && (!approvedLimit || approvedLimit <= 0)) return;

      setBusy((b) => ({ ...b, [id]: true }));
      try {
        const res = await fetch(`/api/credit/requests/${id}/decide`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ action, approvedLimit }),
        });
        if (res.ok) {
          setRequests((rs) => rs.filter((r) => r.id !== id));
        } else {
          const body = await res.json().catch(() => ({}));
          logger.error("[CreditRequestsPanel] decide failed", { status: res.status, body });
          setBusy((b) => ({ ...b, [id]: false }));
        }
      } catch (err) {
        logger.error("[CreditRequestsPanel] decide error", { error: String(err) });
        setBusy((b) => ({ ...b, [id]: false }));
      }
    },
    [amounts, busy],
  );

  if (loading || requests.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--data-warning-200,var(--rule-base))] bg-[var(--data-warning-50,var(--surface-sunken))] p-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-5 w-5 text-[var(--data-warning-600)]" strokeWidth={2} aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">
          Solicitudes de línea de fiado
        </p>
        <span className="ml-auto rounded-full bg-[var(--data-warning-100,var(--surface-raised))] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
          {requests.length} pendiente{requests.length !== 1 ? "s" : ""}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {r.customerName ?? r.customerId}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">{fmtDate(r.createdAt)}</p>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {r.customerId}
              {r.requestedAmount != null && (
                <> · pide <span className="font-semibold">S/{r.requestedAmount.toFixed(2)}</span></>
              )}
            </p>
            {r.reason && (
              <p className="mt-1 text-xs italic text-[var(--text-secondary)]">“{r.reason}”</p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <label className="sr-only" htmlFor={`limit-${r.id}`}>
                Línea a otorgar
              </label>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--text-tertiary)]">
                  S/
                </span>
                <input
                  id={`limit-${r.id}`}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amounts[r.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                  placeholder="Monto de la línea"
                  className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-8 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <button
                type="button"
                onClick={() => decide(r.id, "approve")}
                disabled={busy[r.id] || !(Number(amounts[r.id]) > 0)}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-dark,var(--accent))] disabled:opacity-50"
              >
                {busy[r.id] ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                )}
                Aprobar
              </button>
              <button
                type="button"
                onClick={() => decide(r.id, "reject")}
                disabled={busy[r.id]}
                aria-label={`Rechazar solicitud de ${r.customerName ?? r.customerId}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--data-error-500)] hover:text-[var(--data-error-600)] disabled:opacity-50"
              >
                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
