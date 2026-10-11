"use client";

/**
 * Las próximas semanas, en una lista compacta: cada renglón dice con cuánto
 * cierra la semana y, debajo, sólo los conceptos que se mueven ESA semana.
 *
 * Las semanas seguidas en las que no se mueve nada y cierran igual van en UN
 * renglón («S3–S13 · sin movimientos»): en `main` las 13 eran «sin
 * movimientos · S/ 20,500.00» repetido trece veces. La tabla de concepto ×
 * semana sigue entera en «Detalle por concepto» (plegada).
 *
 * No se suma nada: cada cifra es la del servidor.
 */

import { useId } from "react";
import { CardTitle } from "@buleje/design-system";
import { TrendingDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diaConNombre, fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { formatNumber } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import type { ProyeccionDeCaja, SemanaProyectada } from "@/hooks/use-caja-del-negocio";
import { montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import type { Fila } from "./ProyeccionSemanas";

interface Tramo {
  desde: SemanaProyectada;
  hasta: SemanaProyectada;
  movs: { f: Fila; v: number }[];
}

/** Junta las semanas quietas seguidas que cierran con el mismo saldo. */
export function tramosDeSemanas(weeks: SemanaProyectada[], filas: Fila[]): Tramo[] {
  const conceptos = filas.filter((f) => f.clave !== "openingBalance" && f.clave !== "closingBalance");
  const tramos: Tramo[] = [];
  for (const w of weeks) {
    const movs = conceptos
      .map((f) => ({ f, v: w[f.clave] }))
      .filter((x): x is { f: Fila; v: number } => typeof x.v === "number" && Number.isFinite(x.v) && x.v !== 0);
    const previo = tramos[tramos.length - 1];
    if (previo && movs.length === 0 && previo.movs.length === 0 && previo.hasta.closingBalance === w.closingBalance) {
      previo.hasta = w;
    } else {
      tramos.push({ desde: w, hasta: w, movs });
    }
  }
  return tramos;
}

/* `weekEnd` es el fin del domingo de Lima en UTC (04:59 del lunes): el día se
   toma en Lima, no del texto, o la S13 «terminaba» el 04/01 en vez del 03/01. */
const dia = (iso: string) => limaDateKey(iso);
const rotulo = (t: Tramo) =>
  t.desde === t.hasta
    ? `S${t.desde.weekNumber} · ${diaConNombre(dia(t.desde.weekStart))}`
    : `S${t.desde.weekNumber}–S${t.hasta.weekNumber} · ${fechaCorta(dia(t.desde.weekStart))} al ${fechaCorta(dia(t.hasta.weekEnd))}`;

interface Props {
  d: ProyeccionDeCaja;
  filas: Fila[];
  /** Lo que te deben en total (Lo que viene), si se ve: para no repetir la misma cifra en «sin fecha». */
  teDebenTotal?: number | null;
}

export default function SemanasEnLista({ d, filas, teDebenTotal = null }: Props) {
  const id = useId();
  const tramos = tramosDeSemanas(d.weeks, filas);
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-base)] px-4 py-3">
        <CardTitle className="text-sm font-bold" as="h3" id={id}>
          Semana a semana
        </CardTitle>
        <span className="text-sm text-[var(--text-secondary)]">cierra en</span>
      </div>
      <ol className="divide-y divide-[var(--rule-soft)]" aria-label={`Las próximas ${d.weeks.length} semanas`}>
        {tramos.map((t) => {
          const rojo = t.hasta.closingBalance < 0;
          return (
            <li key={t.desde.weekNumber} className={cn("px-4 py-2.5", rojo && "bg-[var(--data-error-500)]/10")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{rotulo(t)}</span>
                <span className={cn("shrink-0 text-sm font-bold tabular-nums", rojo ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]")}>
                  {montoTexto(t.hasta.closingBalance)}
                  {rojo && <TrendingDown className="ml-1 inline-block h-4 w-4" aria-label="saldo negativo" />}
                </span>
              </div>
              {t.movs.length > 0 ? (
                <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                  {t.movs.map(({ f, v }) => (
                    <li key={f.clave} className={cn("text-sm text-[var(--text-secondary)]", f.tono === "informa" && "italic")}>
                      {f.signo} {f.label} <span className="tabular-nums">{montoTexto(v)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Sin movimientos</p>
              )}
            </li>
          );
        })}
      </ol>
      <SinFecha d={d} teDebenTotal={teDebenTotal} />
    </section>
  );
}

const iguales = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Lo que no cae en ninguna semana: sin fecha pactada o ya vencido. */
function SinFecha({ d, teDebenTotal }: { d: ProyeccionDeCaja; teDebenTotal: number | null }) {
  const sf = d.sinFecha;
  const adelantos = d.adelantosConVencimiento;
  const cobrar = sf && sf.cuantosPorCobrar > 0;
  const pagar = sf && sf.cuantosPorPagar > 0;
  if (!cobrar && !pagar && !(adelantos && adelantos.cuantos > 0)) return null;
  /* Si TODO lo que te deben está sin fecha, la cifra ya está en «Te van a pagar»: no se repite. */
  const todoSinFecha = cobrar && teDebenTotal != null && iguales(sf.porCobrar, teDebenTotal);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--rule-base)] px-4 py-3 text-sm text-[var(--text-secondary)]">
      {cobrar &&
        (todoSinFecha ? (
          <span>
            <strong className="font-semibold text-[var(--text-primary)]">Nada de lo que te deben tiene fecha:</strong> no entra en ninguna
            semana
          </span>
        ) : (
          <span className="tabular-nums">
            <strong className="font-semibold text-[var(--text-primary)]">Sin fecha, te deben</strong> {montoTexto(sf.porCobrar)} ·{" "}
            {formatNumber(sf.cuantosPorCobrar, 0)} {sf.cuantosPorCobrar === 1 ? "pendiente" : "pendientes"}
          </span>
        ))}
      {pagar && (
        <span className="tabular-nums">
          <strong className="font-semibold text-[var(--text-primary)]">Vencido, debes</strong> {montoTexto(sf.porPagar)} ·{" "}
          {formatNumber(sf.cuantosPorPagar, 0)} {sf.cuantosPorPagar === 1 ? "pendiente" : "pendientes"}
        </span>
      )}
      {adelantos && adelantos.cuantos > 0 && (
        <span className="tabular-nums">
          <strong className="font-semibold text-[var(--text-primary)]">Adelantos que vencen</strong> {montoTexto(adelantos.monto)} ·{" "}
          {formatNumber(adelantos.cuantos, 0)} {adelantos.cuantos === 1 ? "adelanto" : "adelantos"}
        </span>
      )}
      <InfoTip
        title="Lo que no cae en ninguna semana"
        what="Lo que no tiene fecha pactada o ya venció antes de hoy no se reparte en las semanas: se muestra acá."
        affects="No suma al saldo final de ninguna semana."
      />
    </div>
  );
}
