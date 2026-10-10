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

import { useEffect, useState } from "react";
import { Kicker } from "@buleje/design-system";
import { AlertTriangle, Check, Loader2, Wallet } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { chip } from "@/components/admin/gastos/estilos";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { PAYMENT_METHOD_LABELS, type ExpensePaymentMethod } from "@/lib/expense-meta";
import type { PagoDeFijo } from "./pagar-fijo";
import { fmt } from "./shared";

const METODOS = Object.keys(PAYMENT_METHOD_LABELS) as ExpensePaymentMethod[];
const esMetodo = (v: unknown): v is ExpensePaymentMethod => METODOS.includes(v as ExpensePaymentMethod);

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
  /** El medio que dice el gasto fijo (columna o metadata vieja). */
  metodo?: string | null;
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
  onConfirmar: (pago: PagoDeFijo) => void;
  onClose: () => void;
}) {
  const [fecha, setFecha] = useState(hoyLocal);
  const [monto, setMonto] = useState(() => String(pago?.amount ?? ""));
  const [metodo, setMetodo] = useState<ExpensePaymentMethod>(() => {
    const delFijo = pago?.metodo;
    return esMetodo(delFijo) ? delFijo : "efectivo";
  });
  // Recordado como en «Por pagar»: quien paga del cajón, paga siempre del cajón.
  const [salidaDeCaja, setSalidaDeCaja] = useLocalStorage<boolean>("compras:gastos-fijos:sale-de-caja", true);
  /** `null` = mirando; decide si «sale de la caja» se puede marcar. */
  const [caja, setCaja] = useState<{ abierta: boolean; esperado?: number } | null>(null);
  const abierto = pago != null;

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    fetch("/api/finanzas/caja-abierta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { abierta: false }))
      .then((d: { abierta?: boolean; esperado?: number }) => { if (vivo) setCaja({ abierta: d.abierta === true, esperado: d.esperado }); })
      .catch((err) => { console.warn("[ConfirmarPagoModal] caja-abierta falló", err); if (vivo) setCaja({ abierta: false }); });
    return () => { vivo = false; };
  }, [abierto]);

  if (!pago) return null;

  const montoNum = Number(monto.replace(",", "."));
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const difiere = montoValido && Math.abs(montoNum - pago.amount) > 0.005;
  const esDeHoy = fecha === hoyLocal();
  /** Sólo efectivo de HOY con una caja abierta sale del cajón (el servidor da 400 si no). */
  const puedeSalirDeCaja = metodo === "efectivo" && esDeHoy && caja?.abierta === true;
  const pocoEnCaja = puedeSalirDeCaja && salidaDeCaja && caja?.esperado != null && montoValido && montoNum > caja.esperado;

  const confirmar = () => {
    if (!montoValido) return;
    // El input da `YYYY-MM-DD` sin hora; el endpoint pide un datetime. Se cierra
    // a mediodía local para que ningún huso lo empuje al día anterior.
    const [y, m, d] = fecha.split("-").map(Number);
    const cuando = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
    onConfirmar({ fechaIso: cuando.toISOString(), monto: montoNum, paymentMethod: metodo, salidaDeCaja: puedeSalirDeCaja && salidaDeCaja });
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
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={guardando || !montoValido}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {guardando ? "Registrando…" : "Sí, registrar"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
          <div className="block">
            {/* El ⓘ va al lado de la etiqueta, nunca dentro del <label> (guardián infotip-no-anidado). */}
            <span className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              <label htmlFor="monto-pago-gasto-fijo">Cuánto salió</label>
              <InfoTip
                title="Pago del período"
                what="Esto anota el pago de este período. El gasto fijo del catálogo no cambia."
                affects="Si el precio subió para siempre, actualízalo también en el Punto de Compra."
                example="La luz vino S/ 145 este mes: se registra S/ 145 y la ficha sigue diciendo S/ 129.90."
              />
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-extrabold text-[var(--text-secondary)]">S/</span>
              <input
                id="monto-pago-gasto-fijo"
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                aria-invalid={!montoValido}
                className="h-14 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-3xl font-extrabold tabular-nums text-[var(--text-primary)] outline-none focus:border-primary/60 "
              />
            </div>
          </div>
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
              Pon un monto mayor que cero.
            </p>
          )}
        </div>

        {/* Pagar dos veces el mismo mes es el error caro de esta pantalla. */}
        {pago.pagado && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
            <p className="text-sm text-[var(--text-primary)]">
              <span className="font-bold">Este gasto ya figura pagado en el período.</span>{" "}
              Si sigues, queda registrado dos veces.
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
            className="mt-1 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base tabular-nums text-[var(--text-primary)] outline-none focus:border-primary/60 "
          />
          <span className="mt-1 block text-sm text-[var(--text-secondary)]">
            Si lo pagaste otro día, cámbialo: el período se cuenta por esta fecha.
          </span>
        </label>

        <div className="space-y-2">
          <Kicker>Cómo pagaste</Kicker>
          <div role="radiogroup" aria-label="Cómo pagaste" className="flex flex-wrap gap-2">
            {METODOS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={metodo === m} onClick={() => setMetodo(m)} className={chip(metodo === m)}>
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {metodo === "efectivo" && (
            <div className="flex items-start gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm">
              {!esDeHoy ? (
                <span className="flex-1 text-[var(--text-secondary)]">Es un pago de otro día: no sale de la caja de hoy.</span>
              ) : caja?.abierta ? (
                <label className="flex flex-1 cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={salidaDeCaja} onChange={(e) => setSalidaDeCaja(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-[var(--accent)]" />
                  <span className="text-[var(--text-primary)]">
                    Sale de la caja abierta
                    {caja.esperado != null && <span className="text-[var(--text-tertiary)]"> · en el cajón debería haber {fmt(caja.esperado)}</span>}
                    {pocoEnCaja && <span className="block text-xs font-semibold text-[var(--data-error-500)]">El pago es mayor que lo que hay en el cajón.</span>}
                  </span>
                </label>
              ) : (
                <span className="flex-1 text-[var(--text-secondary)]">{caja ? "No hay caja abierta: el pago se registra y ninguna caja se toca." : "Mirando la caja…"}</span>
              )}
              <InfoTip
                title="Sale de la caja"
                what="El efectivo que sacas del cajón para pagar se anota como un retiro de la caja abierta, en el mismo momento."
                affects="El arqueo del día cuadra: la caja sabe que salió esa plata. Déjala sin marcar si pagas con plata que no está en la caja."
                example="Pagas S/ 120 de luz con la plata del cajón → la caja anota «Gasto · luz» por S/ 120."
              />
            </div>
          )}
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
