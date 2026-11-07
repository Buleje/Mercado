"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency } from "@/lib/format";
import type { MetodoCobro } from "@/lib/fiados/cobro-metodo";
import { MedioCobroCompacto, avisarSiSinCaja, cuerpoCobroACaja } from "./POSMedioCobro";

/**
 * Mejora M-3: abono rápido al fiado del cliente elegido en el POS. El cobro
 * entra a la caja abierta con el medio elegido (efectivo por defecto).
 * Montarlo con `key={telefono}`: al cambiar de cliente se limpia solo.
 */
export default function POSAbonoRapido({
  telefono,
  nombre,
  saldo,
  onAbonado,
}: {
  telefono: string;
  nombre: string;
  saldo: number;
  onAbonado: (monto: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoCobro>("efectivo");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abonar = async () => {
    const valor = Number(monto);
    if (!valor || valor <= 0) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/fiados/cobrar", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ customerPhone: telefono, monto: valor, ...cuerpoCobroACaja(metodo) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : `No se pudo registrar el abono (error ${res.status})`);
        return;
      }
      avisarSiSinCaja(body);
      onAbonado(valor);
      setAbierto(false);
      setMonto("");
    } catch (err) {
      console.warn("[POS] abono rápido de fiado falló", err);
      setError("Sin conexión — el abono no se registró.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 rounded-lg">
        <span className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex-1">
          Fiado pendiente: {formatCurrency(saldo)}
        </span>
        <button
          onClick={() => { setAbierto(!abierto); setMonto(saldo.toFixed(2)); setError(null); }}
          className="text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12 dark:bg-primary/15 hover:bg-primary/10 px-2 py-1 rounded transition-colors"
        >
          Abonar
        </button>
      </div>
      {abierto && (
        <div className="px-2 py-2 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg space-y-1.5">
          <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            Abonar a fiado de {nombre || telefono}
          </p>
          <MedioCobroCompacto valor={metodo} onCambiar={setMetodo} deshabilitado={enviando} />
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm font-bold">S/</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.10"
                value={monto}
                onChange={(e) => { setMonto(e.target.value); setError(null); }}
                aria-label="Monto a abonar al fiado"
                className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={abonar}
              disabled={enviando || !monto || Number(monto) <= 0}
              className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {enviando ? "..." : "Confirmar"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs font-semibold text-[var(--data-error-500)]">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
