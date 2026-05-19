"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, HandCoins, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface FiadoResumen {
  montoPendiente: number;
  cantidadFiados: number;
  diasVencido: number;
  hasFiadosVencidos: boolean;
}

interface POSFiadoPanelProps {
  customerPhone: string;
  cartTotal: number;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

export default function POSFiadoPanel({
  customerPhone,
  cartTotal: _cartTotal,
}: POSFiadoPanelProps) {
  const [data, setData] = useState<FiadoResumen | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCobrar, setShowCobrar] = useState(false);
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobrando, setCobrando] = useState(false);
  // Audit 2026-05-17 P1-1: antes `catch { /* Silent fail */ }` perdía
  // errores de cobro y el cajero no sabía si el cobro pasó. Ahora
  // distinguimos: éxito + remaining (P2-6), conflict 409 (P1-3), error real.
  const [cobroError, setCobroError] = useState<string | null>(null);
  const [cobroResult, setCobroResult] = useState<{ cobrado: number; remaining: number } | null>(null);

  const fetchResumen = useCallback(async () => {
    if (!customerPhone || customerPhone.length < 6) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/customers/${encodeURIComponent(customerPhone)}/fiado-resumen`
      );
      if (res.ok) {
        setData(await res.json());
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [customerPhone]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  const handleCobrar = async () => {
    const monto = Number(cobroMonto);
    if (!monto || monto <= 0 || !data) return;
    setCobrando(true);
    setCobroError(null);
    setCobroResult(null);
    try {
      const res = await fetch(`/api/fiados/cobrar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          customerPhone,
          monto,
        }),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok) {
        // Audit P2-6: si remaining > 0 el cajero cobró más que la deuda;
        // se le devolvió/mantuvo en caja y debe enterarse.
        const cobrado = Number(body.totalCobrado ?? monto);
        const remaining = Number(body.remaining ?? 0);
        setCobroResult({ cobrado, remaining });
        setCobroMonto("");
        fetchResumen(); // Refresh
        // Cierra el mini-modal solo si no hubo remaining (cero confusión)
        if (remaining <= 0.01) {
          setTimeout(() => { setShowCobrar(false); setCobroResult(null); }, 1500);
        }
      } else if (res.status === 409) {
        setCobroError("Otro cajero está cobrando ahora mismo. Reintentá en un segundo.");
      } else if (res.status === 404) {
        setCobroError(typeof body.error === "string" ? body.error : "No hay fiados activos");
      } else {
        setCobroError(typeof body.error === "string" ? body.error : `Error ${res.status}`);
      }
    } catch (err) {
      setCobroError(err instanceof Error ? err.message : "Error de red — verificá tu conexión");
    }
    setCobrando(false);
  };

  // Don't show if no phone
  if (!customerPhone || customerPhone.length < 6) return null;

  // Loading
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" />
        <span className="text-xs text-[var(--text-tertiary)]">Consultando fiados...</span>
      </div>
    );
  }

  // No data or no fiados
  if (!data || data.cantidadFiados === 0) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
        <CheckCircle className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
        <span className="text-xs font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
          Sin deudas pendientes
        </span>
      </div>
    );
  }

  // Has active fiados
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
        <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
            Fiado: {fmt(data.montoPendiente)} ({data.diasVencido} dias)
          </span>
          {data.hasFiadosVencidos && (
            <span className="ml-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 px-1.5 py-0.5 rounded-full">
              VENCIDO
            </span>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setShowCobrar(!showCobrar)}
            className="text-[length:var(--ts-xs)] font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] px-2 py-1 rounded-lg transition-colors"
          >
            <HandCoins className="h-3 w-3 inline mr-0.5" />
            Cobrar
          </button>
        </div>
      </div>

      {/* Cobrar mini modal */}
      {showCobrar && (
        <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)]  space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              Cobrar fiado
            </p>
            <button
              onClick={() => setShowCobrar(false)}
              className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted">
            Deuda total: {fmt(data.montoPendiente)}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">
                S/
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.10"
                value={cobroMonto}
                onChange={(e) => { setCobroMonto(e.target.value); setCobroError(null); }}
                placeholder={Number(data.montoPendiente).toFixed(2)}
                className="w-full pl-7 pr-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={handleCobrar}
              disabled={cobrando || !cobroMonto || Number(cobroMonto) <= 0}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {cobrando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Confirmar"
              )}
            </button>
          </div>
          {cobroError && (
            <div role="alert" className="flex items-start gap-1.5 p-2 rounded-md bg-[var(--data-error-50)] border border-[var(--data-error-500)]/40">
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-error-500)] shrink-0 mt-px" />
              <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--data-error-500)]">{cobroError}</p>
            </div>
          )}
          {cobroResult && cobroResult.remaining > 0.01 && (
            <div role="status" className="flex items-start gap-1.5 p-2 rounded-md bg-[var(--data-warning-50)] border border-[var(--data-warning-500)]/40">
              <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0 mt-px" />
              <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--data-warning-500)]">
                Cobrado {fmt(cobroResult.cobrado)}. Sobran {fmt(cobroResult.remaining)} — devolver al cliente o usar para nuevo fiado.
              </p>
            </div>
          )}
          {cobroResult && cobroResult.remaining <= 0.01 && (
            <div role="status" className="flex items-center gap-1.5 p-2 rounded-md bg-[var(--accent-soft)] border border-[var(--data-success-500)]/40">
              <CheckCircle className="h-3.5 w-3.5 text-[var(--data-success-500)] shrink-0" />
              <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--data-success-500)]">
                Cobrado {fmt(cobroResult.cobrado)} ✓
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
