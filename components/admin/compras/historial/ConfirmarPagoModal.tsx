"use client";

/**
 * ConfirmarPagoModal — antes de que salga la plata.
 *
 * «Registrar pago» era un botón suelto en una tarjeta: un click registraba el
 * alquiler de S/850 con la fecha de hoy, sin preguntar, sin decir cuánto y sin
 * forma de deshacerlo. En una grilla donde las tarjetas se reordenan solas (los
 * pagados se van al final) eso es un click equivocado esperando a pasar.
 *
 * El monto se puede ajustar: la luz y el agua nunca salen dos meses iguales.
 * Antes no se podía —el panel cruzaba plantilla y pago por nombre + monto, así
 * que registrar S/145 contra un fijo de S/129.90 dejaba la tarjeta diciendo
 * «pendiente» para siempre—; ahora el pago guarda de qué plantilla salió
 * (`templateId`, ADR-374) y el vínculo sobrevive a que el número cambie.
 */

import { useState } from "react";
import { AlertTriangle, Check, Info, Loader2, Wallet } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { fmt } from "./shared";

export type PagoPropuesto = {
  id: string;
  nombre: string;
  amount: number;
  /** «Mensual · Día 15 · Transferencia» */
  resumenMeta: string;
  /** «vence en 3 días», «venció hace 2 días»… */
  textoVencimiento: string;
  /** Ya hay un pago de este fijo en el período en curso. */
  pagado: boolean;
};

/** `YYYY-MM-DD` de hoy en hora local: `toISOString()` corre el día en Perú. */
function hoyLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export default function ConfirmarPagoModal({
  pago, guardando, error, onConfirmar, onClose,
}: {
  pago: PagoPropuesto | null;
  guardando: boolean;
  error: string | null;
  onConfirmar: (fechaIso: string, monto: number) => void;
  onClose: () => void;
}) {
  const [fecha, setFecha] = useState(hoyLocal);
  const [monto, setMonto] = useState(() => String(pago?.amount ?? ""));

  if (!pago) return null;

  const montoNum = Number(monto.replace(",", "."));
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const difiere = montoValido && Math.abs(montoNum - pago.amount) > 0.005;

  const confirmar = () => {
    if (!montoValido) return;
    // El input da `YYYY-MM-DD` sin hora; el endpoint pide un datetime. Se cierra
    // a mediodía local para que ningún huso lo empuje al día anterior.
    const [y, m, d] = fecha.split("-").map(Number);
    const cuando = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
    onConfirmar(cuando.toISOString(), montoNum);
  };

  return (
    <AdminModal
      open={Boolean(pago)}
      onClose={onClose}
      variant="centered-sm"
      icon={Wallet}
      title="Registrar pago"
      description={pago.nombre}
      footer={
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando || !montoValido}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {guardando ? "Registrando…" : "Sí, registrar"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
          <label className="block">
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Cuánto salió
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-extrabold text-[var(--text-secondary)]">S/</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                aria-invalid={!montoValido}
                className="h-14 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 text-3xl font-extrabold tabular-nums text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]"
              />
            </div>
          </label>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            {pago.resumenMeta || "Gasto fijo"}
            {pago.textoVencimiento ? ` · ${pago.textoVencimiento}` : ""}
          </p>
          {/* Que el recibo venga distinto es lo normal en luz, agua e internet.
              Se dice qué se va a guardar, sin bloquear. */}
          {difiere && (
            <p className="mt-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
              El gasto fijo dice {fmt(pago.amount)}. Se registra {fmt(montoNum)} y la ficha del
              catálogo queda como está.
            </p>
          )}
          {!montoValido && (
            <p className="mt-1.5 text-sm font-semibold text-[var(--data-error-500)]" role="alert">
              Poné un monto mayor que cero.
            </p>
          )}
        </div>

        {/* Pagar dos veces el mismo mes es el error caro de esta pantalla. */}
        {pago.pagado && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
            <p className="text-sm text-[var(--text-primary)]">
              <span className="font-bold">Este gasto ya figura pagado en el período.</span>{" "}
              Si seguís, queda registrado dos veces.
            </p>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Fecha del pago
          </span>
          <input
            type="date"
            value={fecha}
            max={hoyLocal()}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-white px-3 text-base tabular-nums text-[var(--text-primary)] outline-none focus:border-primary/60 dark:bg-[var(--color-card)]"
          />
          <span className="mt-1 block text-sm text-[var(--text-secondary)]">
            Si lo pagaste otro día, cambialo: el período se cuenta por esta fecha.
          </span>
        </label>

        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            Esto anota el pago de este período. El gasto fijo del catálogo no cambia: si el precio
            subió para siempre, actualizalo también en el Punto de Compra.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-500)]" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden />{error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
