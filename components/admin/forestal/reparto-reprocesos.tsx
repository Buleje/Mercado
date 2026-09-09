"use client";

/**
 * «Esto que sobra, reprocesalo en lo que falta» — el apartado de reprocesos
 * sugeridos de la distribución (ADR-404).
 *
 * Es una SUGERENCIA, no un movimiento: acá no se registra nada en el Libro. Lo
 * que hace es poner del mismo lado dos números que hoy viven en dos tablas —lo
 * que sobra de un tipo y lo que falta de otro— y decir cuánto se puede
 * convertir de uno en otro sin inventar madera.
 *
 * Dos formas de aparecer, y se distinguen porque piden cosas distintas:
 *  · **Falta amparar** — hay capacidad libre de un tipo y piezas sin respaldo
 *    de otro. Reprocesar cuadra la hoja.
 *  · **Ya lo está amparando** — el bloque dice comercial y respalda paquetería.
 *    El reparto lo permite, pero el papel afirma algo que sólo es cierto si ese
 *    reproceso existe: hay que declararlo.
 */

import { ArrowRight, Info, RefreshCw } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { SugerenciaReproceso } from "@/lib/forestal/reproceso-sugerido";

const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";

export default function ReprocesosSugeridos({
  sugerencias,
}: {
  sugerencias: SugerenciaReproceso[];
}) {
  if (sugerencias.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-tertiary)]">
        De un tipo a otro cambia la escuadría: salen más piezas y el volumen{" "}
        <b className="text-[var(--text-secondary)]">baja</b> — nunca sube. Por eso lo que se sugiere
        convertir nunca pasa de lo que hay.
      </p>

      {sugerencias.map((s, i) => (
        <div
          key={`${s.especie}|${s.motivo}|${s.desdeTipo}|${s.haciaTipo}|${i}`}
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
              {s.desdeTipo}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
            <span className={`${CHIP} bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`}>
              {s.haciaTipo}
            </span>
            <span className="text-xs font-bold text-[var(--text-secondary)]">· {s.especie}</span>
            <span
              className={`${CHIP} ml-auto ${
                s.motivo === "faltante"
                  ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  : "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              }`}
            >
              {s.motivo === "faltante" ? "Falta amparar" : "Ya lo está amparando"}
            </span>
          </div>

          <p className="mt-2 text-sm text-[var(--text-primary)]">
            {s.motivo === "faltante" ? (
              <>
                Reprocesá{" "}
                <b className="font-mono tabular-nums">{fmtM3(s.convertirM3)} m³</b> de{" "}
                {s.desdeTipo.toLowerCase()} —de los {fmtM3(s.disponibleM3)} m³ libres— y respaldás{" "}
                {s.cubreTodo ? (
                  <>
                    <b>todo</b> lo que falta de {s.haciaTipo.toLowerCase()} (
                    {fmtPiezas(s.faltantePiezas)} piezas · {fmtM3(s.faltanteM3)} m³).
                  </>
                ) : (
                  <>
                    parte de {s.haciaTipo.toLowerCase()}: siguen faltando{" "}
                    <b className="font-mono tabular-nums">{fmtM3(s.restaM3)} m³</b> de los{" "}
                    {fmtM3(s.faltanteM3)} m³ ({fmtPiezas(s.faltantePiezas)} piezas).
                  </>
                )}
              </>
            ) : (
              <>
                El respaldo dice <b>{s.desdeTipo.toLowerCase()}</b> y está amparando{" "}
                <b className="font-mono tabular-nums">{fmtM3(s.convertirM3)} m³</b> de{" "}
                {s.haciaTipo.toLowerCase()} ({fmtPiezas(s.faltantePiezas)} piezas). Para que el papel
                diga la verdad, ese reproceso hay que declararlo en el Libro.
              </>
            )}
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            <span>
              {s.bloques.length === 1 ? "Bloque" : "Bloques"}:{" "}
              {s.bloques.map((b) => b.etiqueta || "(sin etiqueta)").join(" · ")}
            </span>
            {s.motivo === "faltante" && s.sobraM3 > 0 && (
              <span>Quedarían {fmtM3(s.sobraM3)} m³ sin usar</span>
            )}
          </p>
        </div>
      ))}

      <p className="flex items-start gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Esto no mueve nada en el Libro: el reproceso se registra desde Productos disponibles, con
          su origen y su destino. Acá sólo se dice cuál conviene hacer para que la distribución
          cuadre.
        </span>
      </p>
    </div>
  );
}

/** El ícono del apartado: el MISMO que «Reprocesar» en Productos disponibles —
 *  la misma acción no puede tener dos símbolos en el mismo módulo. */
export const ICONO_REPROCESOS = RefreshCw;
