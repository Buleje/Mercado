"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2 } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { BotonCancelar, MarcoModalCaja, mensajeDeError } from "./MarcoModalCaja";

/* QA Brandon 2026-06-10 #8: motivos separados por tipo (antes Egreso ofrecía
   «Ingreso extra»). El texto del motivo es el prefijo que lee
   `lib/caja/origen-movimiento.ts` para decir de dónde vino cada movimiento. */
const MOTIVOS: Record<"ingreso" | "egreso", Array<{ valor: string; rotulo: string }>> = {
  egreso: [
    { valor: "Pago a proveedor", rotulo: "Pago a proveedor" },
    { valor: "Retiro personal", rotulo: "Retiro del dueño" },
    { valor: "Compra de insumos", rotulo: "Compra de insumos" },
    { valor: "Gasto", rotulo: "Gasto del negocio (luz, flete, bolsas…)" },
    { valor: "Cambio", rotulo: "Cambio (sencillo)" },
    { valor: "Otro", rotulo: "Otro" },
  ],
  ingreso: [
    { valor: "Ingreso extra", rotulo: "Ingreso extra" },
    { valor: "Cobro pendiente", rotulo: "Cobro pendiente (fiado)" },
    { valor: "Cambio", rotulo: "Cambio (sencillo)" },
    { valor: "Otro", rotulo: "Otro" },
  ],
};

const MEDIOS = ["efectivo", "yape", "plin", "transferencia"] as const;

interface Props {
  cajaId: string;
  tipo: "ingreso" | "egreso";
  onCerrar: () => void;
  onHecho: () => void;
}

/** Registrar un ingreso o un retiro de la caja abierta. */
export function ModalMovimientoCaja({ cajaId, tipo, onCerrar, onHecho }: Props) {
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [medio, setMedio] = useState<(typeof MEDIOS)[number]>("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esIngreso = tipo === "ingreso";
  // Egreso exige motivo O detalle. Antes el botón se habilitaba con el motivo
  // elegido pero el guardado pedía detalle: el clic no hacía nada, en silencio.
  const faltaMotivo = !esIngreso && !motivo && !detalle.trim();

  const registrar = async () => {
    if (guardando || !monto || faltaMotivo) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cash-registers/${cajaId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "movement",
          type: tipo,
          amount: Number(monto),
          method: medio,
          description: [motivo, detalle].filter(Boolean).join(" — ") || (esIngreso ? "Ingreso manual" : "Egreso manual"),
        }),
      });
      // Un retiro que no se guarda descuadra el arqueo del día entero.
      if (!res.ok) {
        setError(await mensajeDeError(res, `No se pudo registrar el ${tipo}`));
        return;
      }
      onHecho();
      onCerrar();
    } catch (err) {
      console.warn("[caja] movimiento de caja falló", err);
      setError("Sin conexión con el servidor — el movimiento NO se registró.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <MarcoModalCaja
      claveMemoria="caja-movimiento"
      titulo={esIngreso ? "Registrar ingreso" : "Registrar retiro"}
      subtitulo={esIngreso ? "Dinero que entra a la caja" : "Dinero que sale de la caja"}
      icono={esIngreso ? ArrowUp : ArrowDown}
      iconoClase={esIngreso ? "bg-primary/10 text-[var(--data-success-500)]" : "bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]"}
      onCerrar={onCerrar}
      error={error}
      pie={
        <>
          <BotonCancelar onClick={onCerrar} />
          <button
            type="button"
            onClick={registrar}
            disabled={guardando || !monto || faltaMotivo}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl text-base font-semibold text-white disabled:opacity-50 transition-colors",
              esIngreso ? "bg-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/90" : "bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90",
            )}
          >
            {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Registrar
          </button>
        </>
      }
    >
      <Field label="Monto" labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
        {(id) => (
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
            <input
              id={id}
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.10"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full pl-12 pr-4 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal text-right font-mono tabular-nums outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- el modal se abre para escribir el monto de inmediato
              autoFocus
            />
          </div>
        )}
      </Field>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
          Medio
          <InfoTip what="Sólo el efectivo suma o resta al cajón. Yape, Plin o transferencia quedan anotados aparte para el cuadre." example="Pagas S/ 80 al proveedor por Yape: elige Yape y el esperado del cajón no cambia." />
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="radiogroup" aria-label="Medio del movimiento">
          {MEDIOS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={medio === m}
              onClick={() => setMedio(m)}
              className={cn(
                "min-h-10 rounded-xl text-sm font-semibold capitalize border transition-colors",
                medio === m ? "bg-primary text-white border-primary" : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary/40",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <Field label={<>Motivo {!esIngreso && <span className="text-[var(--data-error-500)]">*</span>}</>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
        {(id) => (
          <>
            <select
              id={id}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-4 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              <option value="">Elige un motivo…</option>
              {MOTIVOS[tipo].map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
            {faltaMotivo && <p className="text-sm text-[var(--data-error-500)] mt-1.5 font-medium">Motivo obligatorio para retiros</p>}
          </>
        )}
      </Field>

      <Field label={<>Detalle <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
        <textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder={esIngreso ? "Ej: devolución de doña Rosa" : "Ej: bolsas para el delivery"}
          rows={2}
          className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
        />
      </Field>
    </MarcoModalCaja>
  );
}
