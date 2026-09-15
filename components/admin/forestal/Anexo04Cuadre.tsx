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
 * Dos formas de cerrarlo, porque el patio tiene dos:
 *  · **Una medida** — la más directa; deforma una sola escuadría.
 *  · **Repartir en 2 o 3** — cada fila absorbe su parte PROPORCIONAL al volumen,
 *    así todas se mueven el mismo (y menor) porcentaje.
 * Y dos grillas: la **exacta** (0,01, lo que imprime la hoja) o **medidas
 * reales** (¼ de pulgada, medio pie), que casi nunca cierra al milímetro y por
 * eso dice cuánto es su escalón más chico cuando no llega.
 *
 * Lo que NO hace: inventar el total. La cuenta se cierra moviendo medidas
 * reales y diciendo lo que queda; si no llega a cero, lo dice.
 */
import { useMemo, useState } from "react";
import { Ruler } from "@buleje/design-system/icons";
import { fmtAnexo, fmtMedida } from "@/lib/forestal/anexo04-serfor";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  ajustesParaCuadrar,
  filasDeCuadre,
  planDeCuadre,
  saltoMinimoM3,
  totalCalculado,
  DIMENSION_ANEXO,
  TOL_CUADRE_M3,
  type DimensionAnexo,
  type ModoCuadre,
} from "@/lib/forestal/anexo04-cuadre";

const DIMS: DimensionAnexo[] = ["espesor", "ancho", "largo"];
const CAJA = "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-1.5";
const BOTON_APLICAR =
  "inline-flex h-8 items-center justify-center rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-3 text-xs font-bold text-[var(--accent-ink)] transition hover:brightness-95 dark:text-[var(--accent)]";

/** El segmentado de cuántas medidas se tocan, y la grilla de la sugerencia. */
function Controles({
  medidas, onMedidas, modo, onModo,
}: {
  medidas: number;
  onMedidas: (n: number) => void;
  modo: ModoCuadre;
  onModo: (m: ModoCuadre) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Cuántas medidas se mueven"
        className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5"
      >
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={medidas === n}
            onClick={() => onMedidas(n)}
            title={n === 1 ? "Mover una sola escuadría" : `Repartir la diferencia entre ${n} medidas, según su volumen`}
            className={`h-7 rounded-md px-2 text-xs font-bold transition ${
              medidas === n
                ? "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-[var(--shadow-xs)] dark:text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {n === 1 ? "1 medida" : `repartir en ${n}`}
          </button>
        ))}
      </div>
      <label
        className="inline-flex cursor-pointer items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
        title="Sólo valores que la sierra corta: cuartos de pulgada en escuadría, medio pie en el largo. Casi nunca cierra al milímetro."
      >
        <input
          type="checkbox"
          checked={modo === "real"}
          onChange={(e) => onModo(e.target.checked ? "real" : "exacta")}
          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
        />
        Medidas reales (¼&quot;)
      </label>
    </div>
  );
}

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
  const [medidas, setMedidas] = useState(1);
  const [modo, setModo] = useState<ModoCuadre>("exacta");
  const [elegida, setElegida] = useState<string | null>(null);

  const calculado = useMemo(() => totalCalculado(filas), [filas]);
  const delta = Math.round((objetivoM3 - calculado) * 1000) / 1000;
  const hayDiferencia = Math.abs(delta) >= TOL_CUADRE_M3;
  const candidatas = useMemo(() => filasDeCuadre(filas), [filas]);
  /* El global sólo elige la medida por default: la que cuadra con el ajuste más
     chico. Las opciones que se muestran se recalculan para la elegida. */
  const mejores = useMemo(
    () => (hayDiferencia && medidas === 1 ? ajustesParaCuadrar(filas, objetivoM3, { modo }) : []),
    [filas, objetivoM3, hayDiferencia, medidas, modo],
  );
  const idElegido =
    (elegida && candidatas.some((f) => f.id === elegida) ? elegida : null) ??
    mejores[0]?.id ??
    candidatas[0]?.id ??
    null;
  const fila = candidatas.find((f) => f.id === idElegido) ?? null;
  const piezaElegida = filas.find((f) => f.id === idElegido) ?? null;
  const ajustes = useMemo(
    () => (hayDiferencia && idElegido ? ajustesParaCuadrar(filas, objetivoM3, { soloId: idElegido, modo }) : []),
    [filas, objetivoM3, hayDiferencia, idElegido, modo],
  );
  const plan = useMemo(
    () => (hayDiferencia && medidas > 1 ? planDeCuadre(filas, objetivoM3, { medidas, modo }) : null),
    [filas, objetivoM3, hayDiferencia, medidas, modo],
  );

  if (!hayDiferencia || !fila) return null;
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
          declaras <span className="font-mono font-bold tabular-nums">{fmtAnexo(objetivoM3)}</span> y las
          piezas suman <span className="font-mono font-bold tabular-nums">{fmtAnexo(calculado)}</span> m³ ·
          mueve {medidas === 1 ? "una medida" : `${medidas} medidas`} para cerrarlo
        </p>
        {medidas === 1 && (
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
        )}
      </div>

      <div className="mt-1.5">
        <Controles medidas={medidas} onMedidas={setMedidas} modo={modo} onModo={setModo} />
      </div>

      {medidas === 1 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {DIMS.map((campo) => {
            const a = ajustes.find((x) => x.campo === campo);
            const meta = DIMENSION_ANEXO[campo];
            const actual = campo === "espesor" ? fila.espesor : campo === "ancho" ? fila.ancho : fila.largo;
            /* Con la grilla de la sierra, «no se llega» tiene un número: el
               escalón más chico de esa escuadría. Decirlo evita que parezca que
               el sistema no sabe resolverlo. */
            const salto = !a && modo === "real" && piezaElegida ? saltoMinimoM3(piezaElegida, campo, "real") : 0;
            return (
              <div key={campo} className={CAJA}>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {meta.etiqueta} <span className="font-normal normal-case">· {meta.unidad}</span>
                </p>
                {a ? (
                  <>
                    <p className="mt-0.5 flex items-baseline gap-1.5 font-mono text-sm tabular-nums">
                      <span className="text-[var(--text-tertiary)] line-through">{fmtMedida(a.actual)}</span>
                      <span role="img" className="text-[var(--text-tertiary)]" aria-label="pasa a">→</span>
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
                      className={`${BOTON_APLICAR} mt-1 w-full`}
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
                      {salto > 0 ? (
                        <>
                          El escalón más chico acá mueve{" "}
                          <b className="font-mono tabular-nums">{fmtAnexo(salto)} m³</b> — más que la
                          diferencia. Saca «medidas reales» o reparte entre varias.
                        </>
                      ) : (
                        <>Con esta medida no se llega: el cambio sería demasiado grande. Prueba otra medida.</>
                      )}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : plan ? (
        <div className="mt-2 space-y-1.5">
          {plan.pasos.map((p, i) => (
            <div key={`${p.id}|${p.campo}`} className={`${CAJA} flex flex-wrap items-baseline gap-x-3 gap-y-0.5`}>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                {i + 1}. {p.medida} · {p.cantidad} pzas
              </span>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)]">
                {DIMENSION_ANEXO[p.campo].etiqueta}
              </span>
              <span className="flex items-baseline gap-1.5 font-mono text-sm tabular-nums">
                <span className="text-[var(--text-tertiary)] line-through">{fmtMedida(p.actual)}</span>
                <span role="img" className="text-[var(--text-tertiary)]" aria-label="pasa a">→</span>
                <span className="font-bold text-[var(--text-primary)]">{fmtMedida(p.sugerido)}</span>
                <span className="text-[length:var(--ts-2xs)] font-sans font-normal text-[var(--text-tertiary)]">
                  {DIMENSION_ANEXO[p.campo].unidad} · {p.cambioPct} %
                </span>
              </span>
              <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                total {fmtAnexo(p.totalM3)} m³
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => plan.pasos.forEach((p) => onAplicar(p.id, p.campo, p.sugerido))}
              title={`Aplica ${plan.pasos.length} correcciones en la hoja, en este orden`}
              className={BOTON_APLICAR}
            >
              Aplicar {plan.pasos.length === 1 ? "la corrección" : `las ${plan.pasos.length}`}
            </button>
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              queda en <b className="font-mono tabular-nums">{fmtAnexo(plan.totalM3)} m³</b> ·{" "}
              {Math.abs(plan.restaM3) < TOL_CUADRE_M3 ? (
                <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">cuadra exacto</b>
              ) : (
                <>
                  quedan {fmtAnexo(Math.abs(plan.restaM3))} m³ {plan.restaM3 > 0 ? "de más" : "de menos"}
                </>
              )}
              {" · "}cada medida se mueve lo mismo, proporcional a su volumen
            </span>
          </div>
        </div>
      ) : (
        <p className={`${CAJA} mt-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]`}>
          Con {medidas} medidas {modo === "real" ? "y la grilla de la sierra " : ""}no se llega a
          cuadrar: los escalones disponibles mueven más que la diferencia. Prueba con una sola medida
          {modo === "real" ? " o saca «medidas reales»" : ""}.
        </p>
      )}

      <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        El volumen se recalcula solo (PT ÷ 424). La corrección vive en este anexo: no toca el lote del
        cubicador ni la cubicación guardada.
      </p>
    </div>
  );
}
