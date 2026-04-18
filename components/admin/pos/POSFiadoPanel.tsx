"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, HandCoins, Loader2, X } from "@buleje/design-system/icons";

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
    try {
      const res = await fetch(`/api/fiados/cobrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone,
          monto,
        }),
      });
      if (res.ok) {
        setShowCobrar(false);
        setCobroMonto("");
        fetchResumen(); // Refresh
      }
    } catch {
      // Silent fail
    }
    setCobrando(false);
  };

  // Don't show if no phone
  if (!customerPhone || customerPhone.length < 6) return null;

  // Loading
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-surface border border-[var(--rule-soft)] dark:border-card-border">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" />
        <span className="text-xs text-[var(--text-tertiary)]">Consultando fiados...</span>
      </div>
    );
  }

  // No data or no fiados
  if (!data || data.cantidadFiados === 0) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30">
        <CheckCircle className="h-3.5 w-3.5 text-[var(--data-success)]" />
        <span className="text-xs font-semibold text-[var(--data-success)] dark:text-[var(--data-success)]">
          Sin deudas pendientes
        </span>
      </div>
    );
  }

  // Has active fiados
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)]/30">
        <AlertTriangle className="h-4 w-4 text-[var(--data-error)] shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">
            Fiado: {fmt(data.montoPendiente)} ({data.diasVencido} dias)
          </span>
          {data.hasFiadosVencidos && (
            <span className="ml-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30 px-1.5 py-0.5 rounded-full">
              VENCIDO
            </span>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setShowCobrar(!showCobrar)}
            className="text-[length:var(--ts-xs)] font-bold text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] px-2 py-1 rounded-lg transition-colors"
          >
            <HandCoins className="h-3 w-3 inline mr-0.5" />
            Cobrar
          </button>
        </div>
      </div>

      {/* Cobrar mini modal */}
      {showCobrar && (
        <div className="p-3 rounded-lg bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border  space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground">
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
                onChange={(e) => setCobroMonto(e.target.value)}
                placeholder={data.montoPendiente.toFixed(2)}
                className="w-full pl-7 pr-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
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
        </div>
      )}
    </div>
  );
}
