"use client";

/**
 * Se abre ENCIMA del cierre cuando la diferencia pasa de S/ 20 o del 5 % de lo
 * esperado: pide la causa (mín. 8 caracteres) antes de dejar cerrar.
 */
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOTON_PELIGRO, BOTON_SECUNDARIO, ErrorVentana, MarcoModalTurno } from "./MarcoModalTurno";
import type { useCierreTurno } from "./use-cierre-turno";

type Cierre = ReturnType<typeof useCierreTurno>;

export function DiferenciaAltaModal({ cierre, hayTurno }: { cierre: Cierre; hayTurno: boolean }) {
  const c = cierre;
  const monto = parseFloat(c.cierreEfectivo);
  const abierto = c.showDiffConfirm && hayTurno && c.cierreEfectivo !== "" && !isNaN(monto);
  const diff = abierto ? monto - c.esperado : 0;
  const sobrante = diff > 0;
  const pct = c.esperado > 0 ? (Math.abs(diff) / c.esperado) * 100 : 0;
  const volver = () => { if (!c.closing) c.setShowDiffConfirm(false); };

  return (
    <MarcoModalTurno
      abierto={abierto}
      claveMemoria="turnos-diferencia-caja"
      titulo="Diferencia alta"
      subtitulo="Antes de cerrar, anota qué pasó"
      icono={AlertTriangle}
      tono="error"
      encima
      onFondo={volver}
      pie={<>
        <button type="button" onClick={volver} disabled={c.closing} className={BOTON_SECUNDARIO}>Volver a contar</button>
        <button
          type="button"
          onClick={() => c.handleCerrar({ confirmedAnormal: true })}
          disabled={c.closing || c.notaDiffAnormal.trim().length < 8}
          className={BOTON_PELIGRO}
        >
          {c.closing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <AlertTriangle className="h-5 w-5" aria-hidden />}
          Cerrar con nota
        </button>
      </>}
    >
      <div className="rounded-xl bg-[var(--surface-sunken)] p-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-[var(--text-secondary)]">Esperado</span>
          <span className="font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(c.esperado)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-[var(--text-secondary)]">Contado en caja</span>
          <span className="font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(isNaN(monto) ? 0 : monto)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-[var(--rule-base)] pt-2">
          <span className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">{sobrante ? "Sobrante" : "Faltante"}</span>
          <span className={cn("text-xl font-extrabold tabular-nums", sobrante ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
            {(diff > 0 ? "+" : "") + formatCurrency(diff)}
            <span className="text-sm font-semibold ml-2 opacity-80">({pct.toFixed(1)}%)</span>
          </span>
        </div>
      </div>

      <Field
        label={<span className="inline-flex items-center gap-1">
          Causa de la diferencia <span className="text-[var(--data-error-500)]">*</span>
          <InfoTip
            title="Causa de la diferencia"
            what="Mínimo 8 caracteres. Queda en el registro del turno para auditoría y es distinta de las notas del cierre."
            example={sobrante
              ? "Vuelto que no se entregó, venta sin registrar o aporte de caja chica."
              : "Devolución, propina, error de conteo o un gasto pagado de la caja."}
          />
        </span>}
        labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2"
      >
        <textarea
          value={c.notaDiffAnormal}
          onChange={(e) => { c.setNotaDiffAnormal(e.target.value); c.setCloseError(null); }}
          placeholder={sobrante ? "Ej: sobran S/ 30 de un vuelto que no se entregó a las 18:30" : "Ej: faltan S/ 30 por una devolución de pollo broaster sin registrar"}
          rows={3}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- la ventana se abre para escribir la causa de inmediato
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
        />
      </Field>
      <ErrorVentana mensaje={c.closeError} />
    </MarcoModalTurno>
  );
}
