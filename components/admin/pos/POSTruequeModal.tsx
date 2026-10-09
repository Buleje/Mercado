"use client";

import { useState } from "react";
import { RefreshCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";
import type { PaymentLine, ComprobanteTipo } from "@/components/admin/pos/POSPaymentModal";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { ETIQUETA_METODO } from "@/lib/fiados/cobro-metodo";
import { useMiRol } from "@/hooks/use-mi-rol";
import type { ExtraCobro } from "@/components/admin/pos/pos-shared";
import {
  armarCobroTrueque,
  calcularTrueque,
  frenaPorRol,
  MAX_RECIBIDO,
  MEDIOS_TRUEQUE,
  type CobroTrueque,
  type MedioTrueque,
} from "@/lib/pos/trueque";

interface POSTruequeModalProps {
  showTrueque: boolean;
  setShowTrueque: (v: boolean) => void;
  cartTotal: number;
  processing: boolean;
  customerPhone: string;
  handlePaymentConfirm: (
    payments: PaymentLine[],
    phone?: string,
    extra?: ExtraCobro,
  ) => Promise<void>;
}

const CAMPO =
  "w-full text-sm border border-[var(--rule-base)] rounded-xl px-3 bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/**
 * Trueque: el cliente paga con productos. Lo que vale lo recibido es un
 * DESCUENTO de la venta y lo que falta se cobra con efectivo, Yape o Plin
 * (regla y cuentas en `lib/pos/trueque.ts`).
 */
export default function POSTruequeModal({
  showTrueque,
  setShowTrueque,
  cartTotal,
  processing,
  customerPhone,
  handlePaymentConfirm,
}: POSTruequeModalProps) {
  const [recibido, setRecibido] = useState("");
  const [valorTexto, setValorTexto] = useState("");
  const [medio, setMedio] = useState<MedioTrueque>("efectivo");
  const rol = useMiRol();

  // El formulario se limpia cuando el carrito queda vacío (venta hecha o
  // carrito borrado). Si la venta falla, lo escrito sigue ahí para reintentar.
  const [carritoVacio, setCarritoVacio] = useState(cartTotal <= 0);
  if (cartTotal <= 0 !== carritoVacio) {
    setCarritoVacio(cartTotal <= 0);
    if (cartTotal <= 0) {
      setRecibido("");
      setValorTexto("");
      setMedio("efectivo");
    }
  }

  const calc = calcularTrueque(cartTotal, Number(valorTexto));
  const frena = frenaPorRol(calc, rol);
  const listo =
    recibido.trim().length > 0 && calc.valor > 0 && cartTotal > 0 && !frena && !processing;

  const confirmar = async () => {
    if (!listo) return;
    const cobro = armarCobroTrueque(calc, medio, recibido);
    // `trueque` es la nota de la venta: /api/sales la guarda en
    // `paymentDetails` cuando usePOSCobro la reenvía en `salePayload`.
    // Sin `customerName`: la nota no reemplaza el nombre del cliente (el botón
    // «Enviar a …» y el aviso de fiado mostraban «Trueque: …» como si fuera él).
    const extra: ExtraCobro & { trueque: CobroTrueque["trueque"] } = {
      comprobanteTipo: "ticket" as ComprobanteTipo,
      discountAmount: cobro.descuento,
      discountPercent: 0,
      trueque: cobro.trueque,
    };
    await handlePaymentConfirm([cobro.pago], customerPhone || undefined, extra);
    setShowTrueque(false);
  };

  const etiquetaBoton =
    calc.aCobrar > 0
      ? `Cobrar ${formatCurrency(calc.aCobrar)} con ${ETIQUETA_METODO[medio]}`
      : "Registrar trueque";

  return (
    <AdminModal
      open={showTrueque}
      onClose={() => setShowTrueque(false)}
      title="Cobrar con trueque"
      icon={RefreshCcw}
      variant="centered-sm"
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
        <Field label="¿Qué te da el cliente?">
          <textarea
            value={recibido}
            onChange={(e) => setRecibido(e.target.value)}
            maxLength={MAX_RECIBIDO}
            placeholder="Ej.: 3 kg de plátano, 2 gallinas"
            rows={2}
            className={cn(CAMPO, "py-2 resize-none")}
          />
        </Field>
        <Field label="¿Cuánto vale? (S/)">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
            placeholder="0.00"
            className={cn(CAMPO, "h-11 max-w-[10rem] tabular-nums")}
          />
        </Field>

        <div
          className="rounded-xl bg-[var(--surface-sunken)] p-3 text-sm tabular-nums"
          aria-live="polite"
        >
          <dl>
            <div className="flex justify-between gap-3 text-[var(--text-secondary)]">
              <dt>Venta</dt>
              <dd>{formatCurrency(calc.total)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-[var(--text-secondary)]">
              <dt className="flex items-center gap-1">
                Trueque
                <InfoTip
                  title="El trueque es un descuento"
                  what="Lo que te da el cliente baja el total de la venta. Lo que falta lo cobras con efectivo, Yape o Plin."
                  affects="La caja solo espera la plata que de verdad entra. Si lo recibido vale más que la venta, ese exceso no se devuelve en plata."
                  example="Venta S/ 25.00 y te da 3 kg de plátano por S/ 10.00: cobras S/ 15.00 y la venta queda con S/ 10.00 de descuento."
                  side="right"
                />
              </dt>
              <dd>
                {calc.descuento > 0 ? `− ${formatCurrency(calc.descuento)}` : formatCurrency(0)}
              </dd>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-[var(--rule-base)] pt-2 font-bold text-[var(--text-primary)]">
              <dt>{calc.aCobrar > 0 ? "Falta cobrar" : "Cubre toda la venta"}</dt>
              <dd>{formatCurrency(calc.aCobrar)}</dd>
            </div>
          </dl>
          {calc.sobra > 0 && (
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Vale {formatCurrency(calc.sobra)} más que la venta: no se devuelve en plata.
            </p>
          )}
        </div>

        {calc.aCobrar > 0 && (
          <div>
            <span
              id="trueque-medio"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5"
            >
              ¿Con qué paga la diferencia?
            </span>
            <div
              role="radiogroup"
              aria-labelledby="trueque-medio"
              className="grid grid-cols-3 gap-2"
            >
              {MEDIOS_TRUEQUE.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={medio === m}
                  onClick={() => setMedio(m)}
                  className={cn(
                    "min-h-11 rounded-xl border text-sm font-semibold transition-colors",
                    medio === m
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
                  )}
                >
                  {ETIQUETA_METODO[m]}
                </button>
              ))}
            </div>
          </div>
        )}

        {frena && (
          <p role="alert" className="text-xs font-semibold text-[var(--data-error-500)]">
            Como cajero puedes descontar hasta {formatCurrency(calc.topeCajero)} (15 % de la venta).
            Que el dueño o un admin registre este trueque.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!listo}
            onClick={() => void confirmar()}
            className="flex-1 min-h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {processing ? "Registrando…" : etiquetaBoton}
          </button>
          <button
            type="button"
            onClick={() => setShowTrueque(false)}
            className="px-4 min-h-11 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
