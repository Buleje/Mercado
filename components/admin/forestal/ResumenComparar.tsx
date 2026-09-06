"use client";

/**
 * ResumenComparar — este lote contra una cubicación guardada.
 *
 * "¿Mejoré?" es la pregunta que las tablas no responden: si esta corrida sacó
 * más comercial y menos corta que la anterior, el aserrío va bien; si el pie
 * tablar se paga menos, hay que mirar la mezcla antes de culpar al mercado.
 */
import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ArrowLeftRight, Loader2, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { DimensionResumen, PrecioPt } from "@/lib/forestal/cubicacion-resumen";
import { compararLotes, lecturaComparacion } from "@/lib/forestal/cubicacion-comparar";
import { fmtPctSigno, fmtPt, fmtPtSigno, fmtSoles, fmtSolesSigno } from "@/lib/forestal/cubicacion-formato";

/** Mismas medidas que `resumen-tabla`: las dos tablas se leen igual. */
const TH = "px-3 py-2.5 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-3 py-2.5 align-middle";
const NUM = "text-right font-mono tabular-nums";

/** Verde si subió, ámbar si bajó, neutro si no se movió — con dark explícito. */
const tono = (v: number) =>
  v > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
    : v < 0 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "text-[var(--text-tertiary)]";

export default function ResumenComparar({ rows, precioDe, conValor, dim, guardadas, cargando }: {
  rows: PiezaCubicada[];
  precioDe: PrecioPt;
  conValor: boolean;
  dim: DimensionResumen;
  /** Historial del tenant (lo carga el padre: también lo usa la meta). */
  guardadas: CubicacionRegistro[];
  cargando: boolean;
}) {
  const [contraId, setContraId] = useState("");

  const contra = guardadas.find((g) => g.id === contraId);
  const comp = useMemo(
    () => (contra ? compararLotes(contra.piezas, rows, dim, precioDe) : null),
    [contra, rows, dim, precioDe],
  );

  if (cargando) {
    return <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando cubicaciones guardadas…</p>;
  }
  if (guardadas.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
        Guardá una cubicación en el cubicador y vas a poder comparar este lote contra ella.
      </p>
    );
  }

  return (
    <>
      <label className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Comparar contra</span>
        <select
          value={contraId}
          onChange={(e) => setContraId(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:flex-none sm:max-w-sm"
        >
          <option value="">Elegí una cubicación guardada…</option>
          {guardadas.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre} · {g.totales.piezas} pzas · {fmtPt(g.totales.pieTablar)} PT</option>
          ))}
        </select>
      </label>

      {comp && (
        <>
          <p className="mb-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)]">
            {lecturaComparacion(comp)}
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <DataTable className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Este lote contra la cubicación guardada</caption>
              <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
                <tr>
                  <th scope="col" className={TH}>Grupo</th>
                  <th scope="col" className={`${TH} text-right`}>PT antes</th>
                  <th scope="col" className={`${TH} text-right`}>PT ahora</th>
                  <th scope="col" className={`${TH} text-right`}>Δ PT</th>
                  <th scope="col" className={`${TH} text-right`}>Δ mix</th>
                  {conValor && <th scope="col" className={`${TH} text-right`}>Δ valor</th>}
                </tr>
              </thead>
              <tbody>
                {comp.filas.map((f) => (
                  <tr key={f.label} className="border-t border-[var(--rule-soft)] transition-colors even:bg-[var(--surface-canvas)]/50 hover:bg-primary/5">
                    <td className={`${TD} font-bold text-[var(--text-primary)]`}>{f.label}</td>
                    <td className={`${TD} ${NUM} text-[var(--text-tertiary)]`}>{fmtPt(f.ptA)}</td>
                    <td className={`${TD} ${NUM} text-[var(--text-primary)]`}>{fmtPt(f.ptB)}</td>
                    <td className={`${TD} ${NUM} font-bold ${tono(f.deltaPt)}`}>
                      <span className="inline-flex items-center gap-1">
                        {f.deltaPt > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : f.deltaPt < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : null}
                        {fmtPtSigno(f.deltaPt)}
                      </span>
                    </td>
                    <td className={`${TD} ${NUM} ${tono(f.deltaPct)}`}>{fmtPctSigno(f.deltaPct)} pts</td>
                    {conValor && <td className={`${TD} ${NUM} ${tono(f.deltaValor)}`}>S/ {fmtSolesSigno(f.deltaValor)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-[var(--surface-raised)]">
                <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <th scope="row" className={`${TD} text-left`}>Total</th>
                  <td className={`${TD} ${NUM}`}>{fmtPt(comp.total.ptA)}</td>
                  <td className={`${TD} ${NUM}`}>{fmtPt(comp.total.ptB)}</td>
                  <td className={`${TD} ${NUM} ${tono(comp.total.deltaPt)}`}>{fmtPtSigno(comp.total.deltaPt)}</td>
                  <td className={`${TD} ${NUM} text-[var(--text-tertiary)]`}>—</td>
                  {conValor && <td className={`${TD} ${NUM} ${tono(comp.total.deltaValor)}`}>S/ {fmtSolesSigno(comp.total.deltaValor)}</td>}
                </tr>
              </tfoot>
            </DataTable>
          </div>
          {conValor && (
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              <ArrowLeftRight className="mr-1 inline h-3 w-3" />
              Pie tablar: antes S/ {fmtSoles(comp.precioPtA)} · ahora <b className="text-[var(--text-primary)]">S/ {fmtSoles(comp.precioPtB)}</b>
            </p>
          )}
        </>
      )}
    </>
  );
}
