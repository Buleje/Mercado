"use client";

/**
 * Anexo04Cuadre — «me pasé por 0,003 m³: ¿qué medida muevo?»
 *
 * Aparece SOLO cuando el VOLUMEN TOTAL declarado a mano no coincide con lo que
 * suman las piezas. Hasta ahora la pantalla avisaba de la diferencia y ahí
 * terminaba: cerrarla era tantear escuadrías a ojo en la hoja.
 *
 * Acá se elige la medida y se ve, para cada dimensión, **su tamaño de hoy y el
 * que haría cuadrar** (Brandon, 2026-09-09). Un clic la aplica en la hoja —la
 * misma corrección que «Editar medidas», no un número aparte— y el recuadro se
 * cierra solo cuando el total cierra.
 *
 * Lo que NO hace: inventar el total. La cuenta se cierra moviendo una medida
 * real y diciendo lo que queda; si no llega a cero, lo dice.
 */
import { useMemo, useState } from "react";
import { Ruler } from "@buleje/design-system/icons";
import { fmtAnexo, fmtMedida } from "@/lib/forestal/anexo04-serfor";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  ajustesParaCuadrar,
  filasDeCuadre,
  totalCalculado,
  DIMENSION_ANEXO,
  TOL_CUADRE_M3,
  type DimensionAnexo,
} from "@/lib/forestal/anexo04-cuadre";

const DIMS: DimensionAnexo[] = ["espesor", "ancho", "largo"];

export default function Anexo04Cuadre({
  filas,
  objetivoM3,
  onAplicar,
}: {
  /** Las piezas tal como las imprime la hoja (con las correcciones ya hechas). */
  filas: PiezaCubicada[];
  /** El (3) VOLUMEN TOTAL declarado a mano. */
  objetivoM3: number;
  /** Aplica la medida sugerida en la hoja — el mismo camino que «Editar medidas». */
  onAplicar: (id: string, campo: DimensionAnexo, valor: number) => void;
}) {
  const calculado = useMemo(() => totalCalculado(filas), [filas]);
  const delta = Math.round((objetivoM3 - calculado) * 1000) / 1000;
  const candidatas = useMemo(() => filasDeCuadre(filas), [filas]);
  /* El global sólo elige la medida por default: la que cuadra con el ajuste más
     chico. Las opciones que se muestran se recalculan para la elegida. */
  const mejores = useMemo(
    () => (Math.abs(delta) < TOL_CUADRE_M3 ? [] : ajustesParaCuadrar(filas, objetivoM3)),
    [filas, objetivoM3, delta],
  );
  const [elegida, setElegida] = useState<string | null>(null);
  const idElegido =
    (elegida && candidatas.some((f) => f.id === elegida) ? elegida : null) ??
    mejores[0]?.id ??
    candidatas[0]?.id ??
    null;
  const fila = candidatas.find((f) => f.id === idElegido) ?? null;
  const ajustes = useMemo(
    () => (idElegido ? ajustesParaCuadrar(filas, objetivoM3, { soloId: idElegido }) : []),
    [filas, objetivoM3, idElegido],
  );

  if (Math.abs(delta) < TOL_CUADRE_M3 || !fila) return null;
  const sobra = delta < 0; // lo declarado es MENOR que lo que suman las piezas

  return (
    <div className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <Ruler className="h-4 w-4 shrink-0" aria-hidden />
          {sobra ? "Sobran" : "Faltan"}{" "}
          <span className="font-mono tabular-nums">{fmtAnexo(Math.abs(delta))} m³</span>
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          declarás <span className="font-mono font-bold tabular-nums">{fmtAnexo(objetivoM3)}</span> y las
          piezas suman <span className="font-mono font-bold tabular-nums">{fmtAnexo(calculado)}</span> m³ ·
          mové una medida para cerrarlo
        </p>
        <label className="ml-auto flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Medida
          <select
            value={idElegido ?? ""}
            onChange={(e) => setElegida(e.target.value)}
            aria-label="Medida a ajustar"
            className="h-8 max-w-[14rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 font-mono text-xs font-bold normal-case tracking-normal text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            {candidatas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.medida} · {f.cantidad} pzas · {fmtAnexo(f.m3)} m³
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {DIMS.map((campo) => {
          const a = ajustes.find((x) => x.campo === campo);
          const meta = DIMENSION_ANEXO[campo];
          const actual = campo === "espesor" ? fila.espesor : campo === "ancho" ? fila.ancho : fila.largo;
          return (
            <div
              key={campo}
              className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-1.5"
            >
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {meta.etiqueta} <span className="font-normal normal-case">· {meta.unidad}</span>
              </p>
              {a ? (
                <>
                  <p className="mt-0.5 flex items-baseline gap-1.5 font-mono text-sm tabular-nums">
                    <span className="text-[var(--text-tertiary)] line-through">{fmtMedida(a.actual)}</span>
                    <span className="text-[var(--text-tertiary)]" aria-label="pasa a">→</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">{fmtMedida(a.sugerido)}</span>
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    total {fmtAnexo(a.totalM3)} m³ ·{" "}
                    {Math.abs(a.restaM3) < TOL_CUADRE_M3 ? (
                      <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">cuadra exacto</b>
                    ) : (
                      <>quedan {fmtAnexo(Math.abs(a.restaM3))} m³ {a.restaM3 > 0 ? "de más" : "de menos"}</>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => onAplicar(a.id, a.campo, a.sugerido)}
                    title={`Poner ${meta.etiqueta} en ${fmtMedida(a.sugerido)} ${meta.unidad} — se corrige en la hoja, como en «Editar medidas»`}
                    className="mt-1 inline-flex h-8 w-full items-center justify-center rounded-lg border-2 border-[var(--accent)] bg-primary/10 text-xs font-bold text-[var(--accent-ink)] transition hover:brightness-95 dark:text-[var(--accent)]"
                  >
                    Aplicar
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-0.5 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                    {fmtMedida(actual)}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
                    Con esta medida no se llega: el cambio sería demasiado grande. Probá otra medida.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        Se mueve <b>una sola</b> dimensión de esa medida y el volumen se recalcula solo (PT ÷ 424). La
        corrección vive en este anexo: no toca el lote del cubicador ni la cubicación guardada.
      </p>
    </div>
  );
}
