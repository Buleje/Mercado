"use client";

/**
 * «Cobrar» dentro de un aviso de fiado vencido (mejora M-8), sin salir del
 * centro de notificaciones. Salió de `NotificationItem` el 10-10: mismo
 * endpoint (`POST /api/fiados/[id]/pagar`, admin o cajero), mismos mensajes.
 *
 * El cobro va a la caja abierta con el medio elegido (`aCaja` + `metodo`), igual
 * que Me deben y el abono del POS: sin eso la deuda bajaba pero la plata no
 * figuraba en el esperado, y al cierre salía un sobrante.
 */
import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import {
  MedioCobroCompacto,
  avisarSiSinCaja,
  cuerpoCobroACaja,
} from "@/components/admin/pos/POSMedioCobro";
import { csrfHeaders } from "@/lib/csrf-client";
import type { MetodoCobro } from "@/lib/fiados/cobro-metodo";

interface Props {
  fiadoId: string;
  onPagado: () => void;
  onCancelar: () => void;
}

export default function CobroExpressFiado({ fiadoId, onPagado, onCancelar }: Props) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoCobro>("efectivo");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valor = Number(monto);
  const valido = Number.isFinite(valor) && valor > 0;

  async function confirmar() {
    if (!valido || cargando) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/fiados/${fiadoId}/pagar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ monto: valor, ...cuerpoCobroACaja(metodo) }),
      });
      if (res.ok) {
        avisarSiSinCaja(await res.json().catch(() => null));
        onPagado();
      } else {
        const cuerpo = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setError(
          res.status === 403
            ? "Tu rol no puede registrar cobros."
            : (cuerpo?.message ?? cuerpo?.error ?? "No se pudo registrar el pago."),
        );
      }
    } catch {
      setError("No se pudo registrar el pago. Revisa tu conexión.");
    }
    setCargando(false);
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <label
        htmlFor={`cobro-${fiadoId}`}
        className="text-sm font-semibold text-[var(--text-primary)]"
      >
        Registrar pago
      </label>
      <div className="mt-2">
        <MedioCobroCompacto valor={metodo} onCambiar={setMetodo} deshabilitado={cargando} />
      </div>
      <div className="mt-2 flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--text-secondary)]">
            S/
          </span>
          <input
            id={`cobro-${fiadoId}`}
            type="number"
            inputMode="decimal"
            step="0.10"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void confirmar()}
            placeholder="Monto"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-base font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </div>
        <button
          type="button"
          onClick={onCancelar}
          className="h-12 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          aria-disabled={!valido || cargando}
          className="inline-flex h-12 min-w-28 items-center justify-center rounded-xl bg-[var(--text-primary)] px-4 text-sm font-bold text-[var(--surface-raised)] transition-opacity aria-disabled:opacity-50"
        >
          {cargando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Registrando" />
          ) : (
            "Confirmar"
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[var(--data-error-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
