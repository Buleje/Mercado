"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, HandCoins, Loader2, X } from "lucide-react";

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
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Consultando fiados...</span>
      </div>
    );
  }

  // No data or no fiados
  if (!data || data.cantidadFiados === 0) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/30">
        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Sin deudas pendientes
        </span>
      </div>
    );
  }

  // Has active fiados
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-800/30">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-red-600 dark:text-red-400">
            Fiado: {fmt(data.montoPendiente)} ({data.diasVencido} dias)
          </span>
          {data.hasFiadosVencidos && (
            <span className="ml-1 text-[length:var(--ts-2xs)] font-bold text-red-500 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
              VENCIDO
            </span>
          )}
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => setShowCobrar(!showCobrar)}
            className="text-[length:var(--ts-xs)] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors"
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
            <p className="text-xs font-bold text-gray-700 dark:text-foreground">
              Cobrar fiado
            </p>
            <button
              onClick={() => setShowCobrar(false)}
              className="p-0.5 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[length:var(--ts-xs)] text-gray-500 dark:text-muted">
            Deuda total: {fmt(data.montoPendiente)}
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                S/
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="0.10"
                value={cobroMonto}
                onChange={(e) => setCobroMonto(e.target.value)}
                placeholder={data.montoPendiente.toFixed(2)}
                className="w-full pl-7 pr-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-gray-900 dark:text-foreground outline-none focus:border-primary"
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
