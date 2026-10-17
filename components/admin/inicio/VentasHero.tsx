"use client";

/**
 * Piezas de la fila héroe de Inicio › Ventas (Brandon 2026-10-09, regla R3:
 * «ningún tile grande en cero de relleno»).
 *
 *  - `SinDatoHero`: la cifra de una `StatCard` que no se puede saber → «—»
 *    atenuado + ⓘ con el porqué (p. ej. sin costos cargados no hay utilidad).
 *  - `HoyVsAyer`: la franja «Hoy S/ 120.00 · ayer S/ 95.00 ↑ 26%». Se esconde
 *    si ni hoy ni ayer hubo ventas, y no dibuja «S/ 0.00»: dice «sin ventas».
 *  - `sparkSiHayTendencia`: la mini-línea sólo con 2+ días con venta (un punto
 *    solo dibujaba una raya plana que subía al final: ruido, no tendencia).
 *  - `queSeMuestraVentas`: qué gráfico de la pestaña tiene algo que decir. Vive acá
 *    (y no en VentasCharts) para que VentasDashboard lo use sin cargar los gráficos.
 */

import { ArrowDownRight, ArrowUpRight, Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  MIN_PUNTOS_TENDENCIA,
  hayDatosEnSerie,
  hayTendencia,
  modoRanking,
  valorConDato,
  type ModoRanking,
} from "@/lib/admin/inicio/hay-datos";
import { porcentaje, soles } from "@/lib/admin/inicio/formato-tablero";
import type { VentasData } from "./VentasDashboard";

export function SinDatoHero({ titulo, motivo }: { titulo: string; motivo: string }) {
  return (
    <span data-sin-dato="true" className="inline-flex items-center gap-1.5">
      <span className="text-[var(--text-tertiary)] opacity-70" aria-label="Sin dato">
        —
      </span>
      <InfoTip title={titulo} what={motivo} ariaLabel={`Por qué «${titulo}» no tiene dato`} />
    </span>
  );
}

/** La serie para la sparkline de `StatCard`, o nada si no hay tendencia que mostrar. */
export function sparkSiHayTendencia(serie: readonly number[]): { data: number[] } | undefined {
  const conValor = serie.filter((v) => valorConDato(v)).length;
  return conValor >= MIN_PUNTOS_TENDENCIA ? { data: [...serie] } : undefined;
}

/** Variación de hoy contra ayer en %, sólo si los dos días tienen venta. */
export function variacionHoyVsAyer(hoy: number, ayer: number): number | null {
  if (!(hoy > 0) || !(ayer > 0)) return null;
  return ((hoy - ayer) / ayer) * 100;
}

export function HoyVsAyer({ hoy, ayer }: { hoy: number; ayer: number }) {
  if (!valorConDato(hoy) && !valorConDato(ayer)) return null;
  const delta = variacionHoyVsAyer(hoy, ayer);
  const sube = delta !== null && delta >= 0;
  const Flecha = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      data-hoy-vs-ayer=""
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 py-3 text-sm dark:border-[var(--rule-base)]"
    >
      <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold text-[var(--text-secondary)]">Hoy</span>
        {valorConDato(hoy) ? (
          <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
            {soles(hoy)}
          </span>
        ) : (
          <span className="font-semibold text-[var(--text-tertiary)]">todavía sin ventas</span>
        )}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold text-[var(--text-secondary)]">Ayer</span>
        {valorConDato(ayer) ? (
          <span className="font-bold tabular-nums text-[var(--text-secondary)]">{soles(ayer)}</span>
        ) : (
          <span className="font-semibold text-[var(--text-tertiary)]">sin ventas</span>
        )}
      </span>
      {delta !== null && (
        <span
          className={
            "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums " +
            (sube ? "text-[var(--data-success)]" : "text-[var(--data-error)]")
          }
        >
          <Flecha className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          {sube ? "+" : ""}
          {porcentaje(delta)} vs ayer
        </span>
      )}
    </div>
  );
}

export interface QueSeMuestraVentas {
  porDia: boolean;
  utilidadEnPorDia: boolean;
  porDiaSemana: boolean;
  porHora: boolean;
  medioDePago: ModoRanking;
  meta: boolean;
  pronostico: boolean;
}

/**
 * Qué gráfico tiene algo que decir (regla R2, helper único de la BASE).
 * Día de la semana y hora piden 2 barras con venta: una sola no compara nada.
 */
export function queSeMuestraVentas(
  data: Pick<
    VentasData,
    "ventasDiarias" | "ventasPorDia" | "ventasPorHora" | "metodosPago" | "ventasNetas" | "forecast7"
  >,
): QueSeMuestraVentas {
  const porDia = hayTendencia(data.ventasDiarias, ["ventas"]);
  return {
    porDia,
    utilidadEnPorDia: porDia && hayDatosEnSerie(data.ventasDiarias, ["utilidad"]),
    porDiaSemana: hayDatosEnSerie(data.ventasPorDia, ["total"], { minPuntos: 2 }),
    porHora: hayDatosEnSerie(data.ventasPorHora, ["monto"], { minPuntos: 2 }),
    medioDePago: modoRanking(data.metodosPago, "total"),
    meta: valorConDato(data.ventasNetas),
    pronostico: porDia && hayDatosEnSerie(data.forecast7, ["estimado"]),
  };
}

/** Índice de la fila con el mayor valor (> 0), o -1. */
export function indiceDelMayor<T>(filas: readonly T[], valor: (f: T) => number): number {
  let idx = -1;
  let max = 0;
  filas.forEach((f, i) => {
    const v = valor(f);
    if (v > max) {
      max = v;
      idx = i;
    }
  });
  return idx;
}
