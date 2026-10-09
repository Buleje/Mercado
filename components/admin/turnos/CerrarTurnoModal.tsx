"use client";

/** Ventana «Cerrar turno»: lo esperado en el cajón, el conteo, la diferencia y la nota. */
import { Loader2, Square } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConteoDenominaciones } from "./ConteoDenominaciones";
import { BOTON_PELIGRO, BOTON_SECUNDARIO, ErrorVentana, MarcoModalTurno } from "./MarcoModalTurno";
import type { useCierreTurno } from "./use-cierre-turno";
import type { Turno } from "./tipos";

type Cierre = ReturnType<typeof useCierreTurno>;

const SEGMENTO = "px-2.5 py-1 rounded-lg transition-colors";
const SEGMENTO_ON = "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm";
const SEGMENTO_OFF = "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]";

/** `ventasDelTurno` = la misma cifra en vivo del servidor que «Vendido» en la tarjeta del turno abierto. */
export function CerrarTurnoModal({ turno, cierre, ventasDelTurno }: { turno: Turno | null; cierre: Cierre; ventasDelTurno: number }) {
  const c = cierre;
  const montoValido = c.cierreEfectivo !== "" && !isNaN(parseFloat(c.cierreEfectivo));
  const diff = montoValido ? parseFloat(c.cierreEfectivo) - c.esperado : 0;
  const cuadrado = Math.abs(diff) < 0.01;
  const sobrante = diff > 0;
  const tonoDiff = cuadrado ? "text-[var(--data-success-500)]" : sobrante ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]";

  return (
    <MarcoModalTurno
      abierto={c.showCierre && !!turno}
      claveMemoria="turnos-cerrar-turno"
      titulo="Cerrar turno"
      subtitulo="Cuenta el efectivo final y confirma"
      icono={Square}
      tono="error"
      ancho="lg"
      onFondo={c.resetCierreState}
      onCerrar={c.resetCierreState}
      pie={<>
        <button type="button" onClick={c.resetCierreState} className={BOTON_SECUNDARIO}>Cancelar</button>
        <button type="button" onClick={() => c.handleCerrar()} disabled={c.closing} className={BOTON_PELIGRO}>
          {c.closing ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Square className="h-5 w-5" aria-hidden />}
          Confirmar cierre
        </button>
      </>}
    >
      {turno && (
        <>
          <div className="bg-[var(--surface-sunken)] rounded-xl p-4 space-y-2">
            <div className="flex justify-between items-center text-base">
              <span className="text-[var(--text-secondary)]">Efectivo inicial</span>
              <span className="font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(turno.inicioEfectivo)}</span>
            </div>
            <div className="flex justify-between items-center text-base">
              <span className="text-[var(--text-secondary)]">Ventas del turno</span>
              <span className="font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(ventasDelTurno)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-[var(--rule-base)] pt-2">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                Esperado en caja
                <InfoTip
                  title="Efectivo esperado"
                  what="Apertura + ventas en efectivo + ingresos − egresos de la caja del turno. Yape, Plin y tarjeta no entran al cajón."
                  example="S/ 100 de apertura + S/ 24.90 en efectivo + S/ 5 de ingreso = S/ 129.90"
                />
              </span>
              <span className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">{formatCurrency(c.esperado)}</span>
            </div>
            {c.cajaFueraDelCajon && <p className="text-sm text-[var(--text-secondary)]">{c.cajaFueraDelCajon}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">Conteo de efectivo final</span>
              <div className="inline-flex rounded-lg bg-[var(--surface-sunken)] p-0.5 text-xs font-semibold" role="group" aria-label="Forma de contar">
                <button type="button" aria-pressed={c.conteoMode === "denominacion"} onClick={() => c.setConteoMode("denominacion")} className={cn(SEGMENTO, c.conteoMode === "denominacion" ? SEGMENTO_ON : SEGMENTO_OFF)}>
                  Por billete
                </button>
                <button type="button" aria-pressed={c.conteoMode === "manual"} onClick={() => c.setConteoMode("manual")} className={cn(SEGMENTO, c.conteoMode === "manual" ? SEGMENTO_ON : SEGMENTO_OFF)}>
                  Monto directo
                </button>
              </div>
            </div>
            {c.conteoMode === "denominacion" ? (
              <ConteoDenominaciones conteo={c.denomCounts} cambiar={c.cambiarDenominacion} />
            ) : (
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={c.cierreEfectivo}
                  onChange={(e) => { c.setCierreEfectivo(e.target.value); c.setCloseError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") c.handleCerrar(); }}
                  placeholder="0.00"
                  aria-label="Efectivo contado en caja"
                  className="w-full pl-12 pr-4 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-right font-mono tabular-nums"
                />
              </div>
            )}
          </div>

          {montoValido && (
            <div
              aria-live="polite"
              className={cn(
                "rounded-xl p-3 flex items-center justify-between gap-3 border",
                cuadrado ? "bg-primary/10 border-[var(--data-success-500)]/30"
                  : sobrante ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 border-[var(--data-warning-500)]/30"
                  : "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 border-[var(--data-error-500)]/30",
              )}
            >
              <span className={cn("text-sm font-semibold uppercase tracking-wide", tonoDiff)}>
                {cuadrado ? "Caja cuadrada" : sobrante ? "Sobrante" : "Faltante"}
              </span>
              <span className={cn("text-2xl font-extrabold tabular-nums", tonoDiff)}>
                {cuadrado ? formatCurrency(0) : (diff > 0 ? "+" : "") + formatCurrency(diff)}
              </span>
            </div>
          )}

          <Field label={<>Notas <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
            <textarea
              value={c.cierreNotas}
              onChange={(e) => c.setCierreNotas(e.target.value)}
              placeholder="Ej: turno normal, nada raro…"
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </Field>
          <ErrorVentana mensaje={c.closeError} />
        </>
      )}
    </MarcoModalTurno>
  );
}
