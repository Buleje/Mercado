"use client";

/**
 * GrillaDelMes — lo central de «Calendario»: los días del mes de Lima, de lunes
 * a domingo, pintados según la meta diaria de ventas (o la intensidad de lo
 * vendido si no hay meta).
 *
 * Desde el 10-10 (Brandon: «la información central bien vista»):
 *  · celdas de 48 px en el celular y 72 px en la PC, texto de 14 px;
 *  · columna «Semana» (desde `sm`) con el total de lunes a domingo contra la
 *    meta semanal: reemplaza a la tarjeta «Esta semana», que repetía una fila;
 *  · fila ✓ al pie (con meta diaria): cuántos lunes, martes… cumplieron;
 *  · la estrella marca el mejor día del mes (antes, una tarjeta aparte);
 *  · cada día se toca y su detalle sale en la línea de abajo: en el celular el
 *    monto no entra en la celda y antes sólo vivía en un `title` sin dedo.
 */
import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, Star } from "@buleje/design-system/icons";
import { TEXTO_TONO } from "@/components/admin/metas/clases-meta";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import type { VentasPorDia } from "@/lib/metas/logros-reglas";
import { cn } from "@/lib/utils";
import {
  CLASE_TONO,
  INICIALES_SEMANA,
  NOMBRES_SEMANA,
  diasDelMes,
  montoCorto,
  semanasDelMes,
  sumarCumplimiento,
  tonoDeSemana,
  tonoDelDia,
  totalDeSemana,
  type CumplePorDia,
} from "./calendario-calculos";

const soles = (n: number) => cifraDeMeta(n, "S/");
const ventas = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
/** 7 días + la columna «Semana» desde `sm` (en el celular no entra: va en la línea del día). */
const COLUMNAS =
  "grid grid-cols-7 gap-1 sm:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.2fr)] sm:gap-1.5";
/** La semana sin meta semanal: neutra, sin el gris terciario de un día sin venta. */
const SEMANA_NEUTRA = "bg-[var(--surface-sunken)] text-[var(--text-primary)]";
/**
 * El «·» va al FINAL de cada tramo de la línea del día: al partirse en el
 * celular no queda un punto al inicio. El tramo del mes sólo existe en el
 * celular, así que lo que lo precede lleva el punto sólo ahí.
 */
const PUNTO = "after:ml-1.5 after:content-['·']";
const PUNTO_MOVIL = "max-sm:after:ml-1.5 max-sm:after:content-['·']";

function claseCumple(c: CumplePorDia): string {
  if (c.evaluados === 0) return "text-[var(--text-tertiary)]";
  if (c.cumplidos === c.evaluados) return TEXTO_TONO.exito;
  return c.cumplidos === 0 ? TEXTO_TONO.error : TEXTO_TONO.neutro;
}

export function GrillaDelMes({
  mes,
  dias,
  leidos,
  meses,
  hoy,
  metaDiaria,
  metaSemanal,
  metaMensual,
  mesTotal,
  maximo,
  mejorDia,
  cumpleMes,
}: {
  mes: string;
  /** Los días del mes que se mira. */
  dias: VentasPorDia;
  /** Los del mes que se mira y del anterior: completan la semana del día 1. */
  leidos: VentasPorDia;
  /** Los "YYYY-MM" que trae `leidos`. */
  meses: readonly string[];
  hoy: string;
  metaDiaria: number | null;
  metaSemanal: number | null;
  metaMensual: number | null;
  /** Lo vendido en el mes (lo suma `resumirMes`). */
  mesTotal: number;
  maximo: number;
  mejorDia: string | null;
  cumpleMes: readonly CumplePorDia[];
}) {
  const semanas = useMemo(() => semanasDelMes(mes), [mes]);
  const totales = useMemo(
    () => semanas.map((s) => totalDeSemana(s.fechas, leidos, meses, hoy)),
    [semanas, leidos, meses, hoy],
  );
  const [elegido, setElegido] = useState<string | null>(null);
  const { dias: fechas } = diasDelMes(mes);
  // Sin tocar nada se lee hoy (o el último día de un mes que ya pasó).
  const visto = elegido ?? (hoy.startsWith(mes) ? hoy : fechas[fechas.length - 1]!);
  const iSemana = semanas.findIndex((s) => s.fechas.includes(visto));
  const semanaVista = totales[iSemana];
  const tVisto = dias[visto] ?? { total: 0, n: 0 };
  const pctMeta = metaDiaria !== null && metaDiaria > 0 ? Math.round((tVisto.total / metaDiaria) * 100) : null;
  const todos = sumarCumplimiento(cumpleMes);

  return (
    <div>
      <div className={cn(COLUMNAS, "pb-1.5")} aria-hidden="true">
        {INICIALES_SEMANA.map((d, i) => (
          <span key={i} className="text-center text-sm font-bold text-[var(--text-tertiary)]">
            {d}
          </span>
        ))}
        <span className="hidden text-center text-sm font-bold text-[var(--text-tertiary)] sm:block">Semana</span>
      </div>

      <div className={COLUMNAS}>
        {semanas.map((s, iS) => {
          const tS = totales[iS]!;
          const tonoS = tonoDeSemana(tS, s.fechas[0]!, hoy, metaSemanal);
          return (
            <Fragment key={s.fechas[0]}>
              {s.delMes.map((f, i) => {
                if (f === null) return <span key={i} aria-hidden="true" />;
                const t = dias[f];
                const total = t?.total ?? 0;
                const tono = tonoDelDia(f, t, hoy, metaDiaria, maximo);
                const clase = cn(
                  "relative flex h-12 w-full flex-col items-center justify-center rounded-lg text-sm sm:h-18",
                  CLASE_TONO[tono],
                  f === hoy && "outline outline-2 outline-offset-1 outline-[var(--accent)]",
                );
                const numero = (
                  <span aria-hidden="true" className="font-bold tabular-nums">
                    {Number(f.slice(8, 10))}
                  </span>
                );
                if (f > hoy) return <span key={f} className={clase}>{numero}</span>;
                return (
                  <button
                    key={f}
                    type="button"
                    data-dia={f}
                    aria-pressed={elegido === f}
                    aria-label={`${diaConNombre(f)}: ${total > 0 ? `${soles(total)}, ${ventas(t?.n ?? 0)}` : "sin ventas"}${f === mejorDia ? ", el mejor día del mes" : ""}`}
                    onClick={() => setElegido(f)}
                    className={cn(
                      clase,
                      "transition-shadow hover:ring-2 hover:ring-inset hover:ring-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]",
                      elegido === f && "ring-2 ring-inset ring-[var(--text-primary)]",
                    )}
                  >
                    {numero}
                    {total > 0 && (
                      <span aria-hidden="true" className="hidden tabular-nums sm:block">
                        {montoCorto(total)}
                      </span>
                    )}
                    {f === mejorDia && (
                      <Star aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5 fill-current" />
                    )}
                  </button>
                );
              })}
              <div
                className={cn(
                  "hidden h-18 flex-col items-center justify-center rounded-lg text-sm sm:flex",
                  tonoS === "nivel0" ? SEMANA_NEUTRA : CLASE_TONO[tonoS],
                )}
              >
                {s.fechas[0]! <= hoy && (
                  <>
                    <span className="sr-only">
                      {`Semana del ${ddmm(s.fechas[0]!)} al ${ddmm(s.fechas[6]!)}: ${soles(tS.total)}${metaSemanal !== null ? ` de ${soles(metaSemanal)}` : ""}${tS.parcial ? " (sin los días del mes siguiente)" : ""}`}
                    </span>
                    <span aria-hidden="true" className="font-bold tabular-nums">
                      {montoCorto(tS.total)}
                    </span>
                    <span aria-hidden="true" className="tabular-nums">
                      {tS.parcial
                        ? "parcial"
                        : metaSemanal !== null && metaSemanal > 0
                          ? `${Math.round((tS.total / metaSemanal) * 100)} %`
                          : ventas(tS.n)}
                    </span>
                  </>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>

      {metaDiaria !== null && (
        <div className={cn(COLUMNAS, "mt-1.5 border-t border-[var(--rule-soft)] pt-1.5")}>
          {cumpleMes.map((c, i) => (
            <span
              key={i}
              className={cn("flex h-8 items-center justify-center gap-1 text-sm font-semibold tabular-nums", claseCumple(c))}
            >
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] max-[379px]:hidden" />
              <span aria-hidden="true">{c.evaluados > 0 ? `${c.cumplidos}/${c.evaluados}` : "—"}</span>
              <span className="sr-only">{`Los ${NOMBRES_SEMANA[i]}: ${c.cumplidos} de ${c.evaluados} cumplieron la meta diaria`}</span>
            </span>
          ))}
          <span
            className={cn("hidden h-8 items-center justify-center text-sm font-semibold tabular-nums sm:flex", claseCumple(todos))}
          >
            {todos.cumplidos}/{todos.evaluados} días
          </span>
        </div>
      )}

      <p
        aria-live="polite"
        className="mt-2 flex min-h-8 flex-wrap items-center gap-x-1.5 text-sm text-[var(--text-secondary)]"
      >
        <b className={cn("text-[var(--text-primary)]", PUNTO)}>{diaConNombre(visto)}</b>
        <span className={pctMeta !== null || semanaVista ? PUNTO : PUNTO_MOVIL}>{tVisto.n > 0 ? `${soles(tVisto.total)} · ${ventas(tVisto.n)}` : "sin ventas"}</span>
        {pctMeta !== null && (
          <b className={cn(TEXTO_TONO[pctMeta >= 100 ? "exito" : visto === hoy ? "neutro" : "error"], semanaVista ? PUNTO : PUNTO_MOVIL)}>
            {pctMeta} % de tu meta diaria
          </b>
        )}
        {semanaVista && (
          <span className={PUNTO_MOVIL}>
            semana: {soles(semanaVista.total)}
            {metaSemanal !== null && !semanaVista.parcial && ` de ${soles(metaSemanal)}`}
            {semanaVista.parcial && " (sin los días del mes siguiente)"}
          </span>
        )}
        {/* En el celular «Indicadores» va sin titular: el mes contra su meta se lee acá. */}
        <span className="sm:hidden">
          mes: {soles(mesTotal)}
          {metaMensual !== null && ` de ${soles(metaMensual)}`}
        </span>
      </p>
    </div>
  );
}
