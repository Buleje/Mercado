"use client";

/**
 * ResumenComparar — este lote contra una cubicación guardada.
 *
 * "¿Mejoré?" es la pregunta que las tablas no responden: si esta corrida sacó
 * más comercial y menos corta que la anterior, el aserrío va bien; si el pie
 * tablar se paga menos, hay que mirar la mezcla antes de culpar al mercado.
 */
import { useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { DimensionResumen, PrecioPt } from "@/lib/forestal/cubicacion-resumen";
import { compararLotes, lecturaComparacion } from "@/lib/forestal/cubicacion-comparar";

const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signo = (v: number) => (v > 0 ? `+${n2(v)}` : n2(v));
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
    return <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando cubicaciones guardadas…</p>;
  }
  if (guardadas.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">
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
          className="h-9 min-w-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:flex-none sm:max-w-sm"
        >
          <option value="">Elegí una cubicación guardada…</option>
          {guardadas.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre} · {g.totales.piezas} pzas · {n2(g.totales.pieTablar)} PT</option>
          ))}
        </select>
      </label>

      {comp && (
        <>
          <p className="mb-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">
            {lecturaComparacion(comp)}
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  <th className="px-3 py-2">Grupo</th>
                  <th className="px-3 py-2 text-right">PT antes</th>
                  <th className="px-3 py-2 text-right">PT ahora</th>
                  <th className="px-3 py-2 text-right">Δ PT</th>
                  <th className="px-3 py-2 text-right">Δ mix</th>
                  {conValor && <th className="px-3 py-2 text-right">Δ valor</th>}
                </tr>
              </thead>
              <tbody>
                {comp.filas.map((f) => (
                  <tr key={f.label} className="border-t border-[var(--rule-soft)]">
                    <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{f.label}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{n2(f.ptA)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">{n2(f.ptB)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-bold tabular-nums ${tono(f.deltaPt)}`}>
                      <span className="inline-flex items-center gap-1">
                        {f.deltaPt > 0 ? <TrendingUp className="h-3 w-3" /> : f.deltaPt < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                        {signo(f.deltaPt)}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${tono(f.deltaPct)}`}>{signo(f.deltaPct)} pts</td>
                    {conValor && <td className={`px-3 py-2 text-right font-mono tabular-nums ${tono(f.deltaValor)}`}>S/ {signo(f.deltaValor)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-[var(--accent-soft)]/40 font-bold text-[var(--text-primary)]">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{n2(comp.total.ptA)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{n2(comp.total.ptB)}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${tono(comp.total.deltaPt)}`}>{signo(comp.total.deltaPt)}</td>
                  <td className="px-3 py-2 text-right text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">—</td>
                  {conValor && <td className={`px-3 py-2 text-right font-mono tabular-nums ${tono(comp.total.deltaValor)}`}>S/ {signo(comp.total.deltaValor)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
          {conValor && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              <ArrowLeftRight className="mr-1 inline h-3 w-3" />
              Pie tablar: antes S/ {n2(comp.precioPtA)} · ahora <b className="text-[var(--text-primary)]">S/ {n2(comp.precioPtB)}</b>
            </p>
          )}
        </>
      )}
    </>
  );
}
