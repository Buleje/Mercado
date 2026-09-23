"use client";

/**
 * El resumen por semana: una fila por semana de lunes a domingo, la más nueva
 * arriba (es la que se mira primero), y el total del período al pie.
 *
 * La variación se calcula contra los MISMOS días de la semana anterior: el
 * miércoles, la semana en curso tiene tres días y compararla contra siete
 * entera la haría parecer un derrumbe todas las semanas. El título de la
 * celda dice contra qué se comparó.
 *
 * El PT de cada fila es la suma de los PT de sus días —la misma cuenta que la
 * cabecera de la tira de días—: la semana del reporte y la de la tira tienen
 * que decir lo mismo.
 */

import { useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { ReporteDeProduccion, SemanaReporte } from "@/lib/forestal/reportes-produccion";
import { formatNumber } from "@/lib/format";

/** Más de dos meses de filas dejan de ser un vistazo: el resto se despliega. */
const VISIBLES = 8;

function Variacion({ s }: { s: SemanaReporte }) {
  const comparado =
    s.dias < 7
      ? `contra los mismos ${s.dias} días de la semana anterior (${fmtPt(s.ptSemanaAnterior)} PT)`
      : `contra la semana anterior (${fmtPt(s.ptSemanaAnterior)} PT)`;
  if (s.variacionPct == null) {
    return (
      <span className="text-[var(--text-tertiary)]" title={`Sin producción ${comparado.replace(/^contra /, "en ")}`}>
        —
      </span>
    );
  }
  const Flecha = s.variacionPct > 0 ? ArrowUpRight : s.variacionPct < 0 ? ArrowDownRight : Minus;
  const tono =
    s.variacionPct > 0
      ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : s.variacionPct < 0
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--text-secondary)]";
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${tono}`} title={comparado}>
      <Flecha className="h-4 w-4" aria-hidden />
      {/* «+5,310.9 %» no se lee: arriba de diez veces se dice cuántas veces. */}
      {s.variacionPct >= 900
        ? `×${formatNumber(Math.round(1 + s.variacionPct / 100))}`
        : `${s.variacionPct > 0 ? "+" : ""}${formatNumber(s.variacionPct, { max: 1 })} %`}
      <span className="sr-only"> {comparado}</span>
    </span>
  );
}

export default function ReportesSemanas({ reporte }: { reporte: ReporteDeProduccion }) {
  const [todas, setTodas] = useState(false);
  const filas = [...reporte.semanas].reverse();
  const visibles = todas ? filas : filas.slice(0, VISIBLES);
  const t = reporte.totales;

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3">
        <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
          Resumen por semana
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)]">
          De lunes a domingo, la más nueva arriba. La variación compara con los mismos días de la semana anterior.
        </p>
      </div>
      <DataTable className="w-full text-sm" wrapperClassName="hidden sm:block">
        <thead>
          <tr>
            <th className="text-left">Semana</th>
            <th className="text-right">Días con sierra</th>
            <th className="text-right">Corridas</th>
            <th className="text-right">Piezas</th>
            <th className="text-right">m³</th>
            <th className="text-right">PT</th>
            <th className="text-right">vs semana anterior</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((s) => (
            <tr key={s.lunes} className={s.corridas === 0 ? "text-[var(--text-tertiary)]" : undefined}>
              <td className="whitespace-nowrap">
                <span className="font-semibold text-[var(--text-primary)]">{s.etiqueta}</span>
                {s.enCurso ? (
                  <span className="ml-2 rounded-md bg-[var(--data-info-500)]/12 px-1.5 py-0.5 text-xs font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                    en curso
                  </span>
                ) : s.parcial ? (
                  <span
                    className="ml-2 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs font-bold text-[var(--text-secondary)]"
                    title={`El período corta esta semana: cuenta del ${s.desde.slice(8, 10)}/${s.desde.slice(5, 7)} al ${s.hasta.slice(8, 10)}/${s.hasta.slice(5, 7)}`}
                  >
                    {s.dias} de 7 días
                  </span>
                ) : null}
              </td>
              <td className="text-right tabular-nums">
                {s.diasConProduccion} de {s.dias}
              </td>
              <td className="text-right tabular-nums">{s.corridas}</td>
              <td className="text-right tabular-nums">{fmtPiezas(s.piezas)}</td>
              <td className="text-right tabular-nums">{fmtM3(s.m3)}</td>
              <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(s.pt)}</td>
              <td className="text-right">
                <Variacion s={s} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--rule-strong)] font-bold text-[var(--text-primary)]">
            <td className="whitespace-nowrap">
              {/* Dice cuántas suma: con filas plegadas, el total no es la suma de lo visible. */}
              Total · {filas.length} {filas.length === 1 ? "semana" : "semanas"}
            </td>
            <td className="text-right tabular-nums">
              {t.diasConProduccion} de {reporte.periodo.diasTranscurridos}
            </td>
            <td className="text-right tabular-nums">{t.corridas}</td>
            <td className="text-right tabular-nums">{fmtPiezas(t.piezas)}</td>
            <td className="text-right tabular-nums">{fmtM3(t.m3)}</td>
            <td className="text-right tabular-nums">{fmtPt(t.pt)}</td>
            <td />
          </tr>
        </tfoot>
      </DataTable>
      {/* En el celular, una línea por semana: la tabla hecha tarjetas medía
          ~400 px por semana (6 887 px la vista entera, medido a 400). */}
      <ul className="divide-y divide-[var(--rule-soft)] sm:hidden" aria-label="Resumen por semana">
        {visibles.map((s) => (
          <li key={s.lunes} className="py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-[var(--text-primary)]">
                {s.etiqueta}
                {s.enCurso && (
                  <span className="ml-1.5 rounded-md bg-[var(--data-info-500)]/12 px-1.5 py-0.5 text-xs font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
                    en curso
                  </span>
                )}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmtPt(s.pt)} PT</span>
                <Variacion s={s} />
              </span>
            </div>
            <p className="text-xs tabular-nums text-[var(--text-secondary)]">
              {s.diasConProduccion} de {s.dias} días · {s.corridas} corr. · {fmtPiezas(s.piezas)} pzas · {fmtM3(s.m3)} m³
            </p>
          </li>
        ))}
        <li className="py-2 font-bold text-[var(--text-primary)]">
          <div className="flex items-baseline justify-between gap-2">
            <span>
              Total · {filas.length} {filas.length === 1 ? "semana" : "semanas"}
            </span>
            <span className="tabular-nums">{fmtPt(t.pt)} PT</span>
          </div>
          <p className="text-xs font-normal tabular-nums text-[var(--text-secondary)]">
            {t.diasConProduccion} de {reporte.periodo.diasTranscurridos} días · {t.corridas} corr. ·{" "}
            {fmtPiezas(t.piezas)} pzas · {fmtM3(t.m3)} m³
          </p>
        </li>
      </ul>
      {filas.length > VISIBLES && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          aria-expanded={todas}
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${todas ? "rotate-180" : ""}`} aria-hidden />
          {todas ? `Ver sólo las ${VISIBLES} más nuevas` : `Ver las ${filas.length} semanas`}
        </button>
      )}
    </section>
  );
}
