/**
 * «Recepción y llegada» — la guía en una línea de tiempo: expedida → fecha del
 * papel → al libro → llegó al patio → validada (ADR-434).
 *
 * Lo que el papel no trae se dice pendiente, nunca se estima. Una llegada
 * posterior al vencimiento se pinta en aviso: el libro dice que la madera
 * viajó con la guía vencida.
 */

import { AlertTriangle, CalendarClock, Check, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { HitoDeGuia } from "@/lib/forestal/ficha-guia-resumen";
import { diaCorto } from "../costo-guia/comun";
import { BOTON_BLOQUE, BloqueFicha } from "./comun";

const PUNTO: Record<HitoDeGuia["estado"], string> = {
  hecho: "border-[var(--data-success-500)] bg-[var(--data-success-500)] text-[var(--surface-raised)]",
  pendiente: "border-dashed border-[var(--text-tertiary)] bg-[var(--surface-raised)] text-transparent",
  alerta: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)] text-[var(--surface-raised)]",
};

export default function BloqueRecepcion({
  hitos,
  piezasDecididas,
  piezasTotal,
  onCorregir,
  ocupado,
  indice,
}: {
  hitos: HitoDeGuia[];
  piezasDecididas: number;
  piezasTotal: number;
  /** «Corregir la recepción» (ADR-434); sólo si la guía ya se recibió y hay permiso. */
  onCorregir?: () => void;
  ocupado: boolean;
  indice: number;
}) {
  const pct = piezasTotal > 0 ? Math.round((piezasDecididas / piezasTotal) * 100) : 0;
  return (
    <BloqueFicha
      titulo="Recepción y llegada"
      icono={Truck}
      indice={indice}
      info={
        <InfoTip
          title="La guía en el tiempo"
          what="Cada paso con su día: cuándo se expidió la guía, la fecha del papel, cuándo entró al libro, cuándo llegó la madera al patio y cuándo se validó."
          affects="La llegada es la fecha que manda para el plazo de registro y para poder aserrar sus trozas."
          example="Llegó el jueves 10/09 y la guía vencía el 05/09: se avisa, porque viajó vencida."
        />
      }
      extra={
        piezasTotal > 0 ? (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]" title="Piezas con decisión de recepción">
            {piezasDecididas}/{piezasTotal} pzas
          </span>
        ) : undefined
      }
      pie={
        onCorregir ? (
          <button type="button" onClick={onCorregir} disabled={ocupado} className={BOTON_BLOQUE}>
            <CalendarClock className="h-4 w-4" aria-hidden /> Corregir la recepción
          </button>
        ) : undefined
      }
    >
      <ol className="relative">
        {hitos.map((h, i) => (
          <li key={h.clave} className="relative flex gap-3 pb-3 last:pb-0">
            {i < hitos.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-0.5 ${
                  h.estado === "pendiente" ? "bg-[var(--rule-base)]" : "bg-[var(--data-success-500)]/50"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-[1] mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${PUNTO[h.estado]}`}
            >
              {h.estado === "alerta" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={`text-sm font-semibold ${h.estado === "pendiente" ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>
                  {h.rotulo}
                </span>
                <span className={`text-sm tabular-nums ${h.dia ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}>
                  {h.dia ? diaCorto(h.dia) : "pendiente"}
                </span>
              </div>
              {h.detalle && (
                <p className={`text-xs ${h.estado === "alerta" ? "font-semibold text-[var(--data-warning-ink)]" : "text-[var(--text-tertiary)]"}`}>
                  {h.detalle}
                </p>
              )}
              <span className="sr-only">{h.estado === "hecho" ? "hecho" : h.estado === "alerta" ? "con aviso" : "pendiente"}</span>
            </div>
          </li>
        ))}
      </ol>

      {piezasTotal > 0 && (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            role="progressbar"
            aria-label="Piezas con decisión de recepción"
            aria-valuemin={0}
            aria-valuemax={piezasTotal}
            aria-valuenow={piezasDecididas}
          >
            <div className="h-full rounded-full bg-[var(--data-success-500)] transition-[width] duration-[var(--motion-slow)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </BloqueFicha>
  );
}
