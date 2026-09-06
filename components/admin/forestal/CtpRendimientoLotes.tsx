"use client";

/**
 * CtpRendimientoLotes — el (13) del Cuadro 3, contra su referencia.
 *
 * El cuadro oficial trae el rendimiento de cada lote como un número suelto en
 * la última columna: «58 %», «52 %». Sin referencia al lado, ese número no
 * dice nada — hay que saberse de memoria que un aserrío rinde entre 40 y 75 y
 * que la meta de la planta es 56, y después comparar fila por fila.
 *
 * Acá cada lote es un punto sobre la misma regla: la franja creíble pintada de
 * fondo y la meta marcada. Lo que cae fuera salta solo, que es justo lo que un
 * fiscalizador busca cuando abre el cuadro.
 *
 * ── Por qué no es un chart de librería ──────────────────────────────────────
 * Un eje fijo de 0 a 100 y un punto por fila no necesitan escalas calculadas ni
 * medir el contenedor: posicionar por porcentaje es exacto, se imprime bien y
 * no tiene el modo de falla de quedar en blanco cuando el contenedor mide 0.
 *
 * NO es parte del formato oficial y se dice: el papel que se presenta ante
 * SERFOR es la tabla de arriba.
 */

import { AlertTriangle, CheckCircle2, TrendingDown } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import {
  RENDIMIENTO_META,
  RENDIMIENTO_PLAUSIBLE_MAX,
  RENDIMIENTO_PLAUSIBLE_MIN,
  juzgarRendimiento,
} from "@/lib/forestal/loctp-catalogos";

export interface FilaRendimiento {
  lote: string;
  especie: string;
  tipoProducto: string;
  lineaProduccion: string;
  rendimientoPct: number | null;
}

/** La meta se guarda como fracción y se dibuja en porcentaje. */
const META_PCT = RENDIMIENTO_META * 100;

/**
 * Estado de un lote. `juzgarRendimiento` ya decide "bueno / bajo / sospechoso"
 * contra la meta; acá sólo se agrega el caso "por encima de lo creíble", que la
 * meta no puede ver porque mira hacia abajo.
 */
function estado(pct: number): { tono: "ok" | "aviso" | "malo"; texto: string } {
  const juicio = juzgarRendimiento(pct);
  if (juicio === "sospechoso") return { tono: "malo", texto: "Imposible: revisá la carga" };
  if (pct > RENDIMIENTO_PLAUSIBLE_MAX) return { tono: "malo", texto: "Más alto de lo creíble" };
  if (pct < RENDIMIENTO_PLAUSIBLE_MIN) return { tono: "malo", texto: "Muy bajo: falta declarar o se perdió madera" };
  if (juicio === "bajo") return { tono: "aviso", texto: `Bajo la meta de ${META_PCT.toFixed(0)} %` };
  return { tono: "ok", texto: "En rango y sobre la meta" };
}

const TONO = {
  ok: { punto: "bg-[var(--data-success-500)]", texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", icono: CheckCircle2 },
  aviso: { punto: "bg-[var(--data-warning-500)]", texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", icono: TrendingDown },
  malo: { punto: "bg-[var(--data-error-500)]", texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", icono: AlertTriangle },
} as const;

/** El eje llega a 100: un rendimiento mayor es un error de carga, y se ancla al tope. */
const posicion = (pct: number) => `${Math.min(100, Math.max(0, pct))}%`;

export default function CtpRendimientoLotes({ filas }: { filas: ReadonlyArray<FilaRendimiento> }) {
  const conDato = filas.filter((f) => f.rendimientoPct != null && Number.isFinite(f.rendimientoPct));
  if (conDato.length === 0) return null;

  const fuera = conDato.filter((f) => estado(f.rendimientoPct as number).tono === "malo").length;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Rendimiento de cada lote, contra su referencia
        </CardTitle>
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Lectura · no va en el formato
        </span>
      </div>
      <p className="mb-3 text-xs text-[var(--text-tertiary)]">
        La franja es el rango creíble de un aserrío ({RENDIMIENTO_PLAUSIBLE_MIN}–{RENDIMIENTO_PLAUSIBLE_MAX} %) y la
        marca es la meta de la planta ({META_PCT.toFixed(0)} %). Fuera de la franja, el número casi siempre es un
        error de carga antes que un problema de sierra.
        {fuera > 0 && (
          <>
            {" "}
            <strong className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {fuera} {fuera === 1 ? "lote está" : "lotes están"} fuera de rango.
            </strong>
          </>
        )}
      </p>

      <ul className="space-y-3">
        {conDato.map((f) => {
          const pct = f.rendimientoPct as number;
          const e = estado(pct);
          const Icono = TONO[e.tono].icono;
          return (
            <li key={`${f.lote}|${f.lineaProduccion}|${f.tipoProducto}|${f.especie}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                <span className="font-mono font-bold text-[var(--text-primary)]">{f.lote}</span>
                <span className="text-[var(--text-secondary)]">
                  {f.tipoProducto} · {f.especie}
                </span>
                <span className={`ml-auto inline-flex items-center gap-1 font-bold ${TONO[e.tono].texto}`}>
                  <Icono className="h-3.5 w-3.5" aria-hidden />
                  {e.texto}
                </span>
                <span className="w-14 text-right font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {pct.toFixed(1)} %
                </span>
              </div>

              {/* La regla: 0 a 100, con la franja creíble y la meta dibujadas. */}
              <div
                className="relative mt-1.5 h-6 rounded-lg bg-[var(--surface-sunken)]"
                role="img"
                aria-label={`${f.lote}: ${pct.toFixed(1)} por ciento. ${e.texto}. Rango creíble ${RENDIMIENTO_PLAUSIBLE_MIN} a ${RENDIMIENTO_PLAUSIBLE_MAX} por ciento, meta ${META_PCT.toFixed(0)} por ciento.`}
              >
                <div
                  className="absolute inset-y-0 rounded-lg bg-[var(--data-success-500)]/12"
                  style={{
                    left: posicion(RENDIMIENTO_PLAUSIBLE_MIN),
                    width: `${RENDIMIENTO_PLAUSIBLE_MAX - RENDIMIENTO_PLAUSIBLE_MIN}%`,
                  }}
                />
                <div
                  className="absolute inset-y-1 w-0.5 bg-[var(--text-tertiary)]"
                  style={{ left: posicion(META_PCT) }}
                  title={`Meta ${META_PCT.toFixed(0)} %`}
                />
                {/* El punto va con borde del color de la tarjeta: sobre la franja
                    verde, un círculo sin ranura se funde con el fondo. */}
                <div
                  className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface-raised)] ${TONO[e.tono].punto}`}
                  style={{ left: posicion(pct) }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--rule-soft)] pt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-[var(--data-success-500)]/12 ring-1 ring-[var(--rule-base)]" aria-hidden />
          Rango creíble
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-[var(--text-tertiary)]" aria-hidden />
          Meta {META_PCT.toFixed(0)} %
        </span>
        <span>0 % a la izquierda, 100 % a la derecha.</span>
      </div>
    </section>
  );
}
