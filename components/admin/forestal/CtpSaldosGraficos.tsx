"use client";

/**
 * CtpSaldosGraficos — el tablero de Control, dibujado.
 *
 * La pestaña mostraba cuatro totales y cuatro tablas: decía QUÉ hay, no si eso
 * es mucho o poco ni cuánto dura. Acá van las tres lecturas que una tabla no
 * da de un vistazo, cada una con la forma que le corresponde:
 *
 *  · **Cascada** — de dónde salió el saldo (apertura → +ingresos → −consumo).
 *    Es un recorrido, no una comparación: la forma tiene que mostrar el camino.
 *  · **Dona** — de qué especie depende el patio. Es parte-de-un-todo, y por eso
 *    va con rampa de un solo tono, no con colores de identidad.
 *  · **Barra apilada horizontal** — en qué estado está el volumen de cada
 *    especie. Horizontal porque "Shihuahuaco" no entra bajo una barra vertical
 *    sin rotarse, y apilada porque los tramos SUMAN el volumen físico.
 *
 * Los colores salen de `.charts-forestal` (globals.css): tres tonos elegidos
 * por modo y verificados contra la superficie real de la tarjeta.
 */

import { useMemo } from "react";
import { StatCard, CardTitle } from "@buleje/design-system";
import { Activity, CalendarClock, PieChart, PackageCheck } from "@buleje/design-system/icons";
import { BulejeDonutChart, BulejeStackedBar, BulejeWaterfallChart } from "@/components/ui-system/charts";
import {
  composicionSaldo,
  kpisDePlanta,
  pasosDeBalance,
  rankingEspecies,
  type EspecieSaldo,
  type MateriaPrimaTotales,
  type ProductoStock,
} from "@/lib/forestal/ctp-saldos-analisis";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

const n2 = (v: number) => v.toFixed(2);
const m3 = (v: number | string) => `${Number(v).toFixed(2)} m³`;

/** Rampa de la dona: la definen las CSS vars de `.charts-forestal`, por modo. */
const RAMPA_PATIO = [1, 2, 3, 4, 5, 6].map((i) => `var(--forestal-slice-${i})`);

/**
 * Estira la rampa sobre las rebanadas que realmente hay.
 *
 * Tomando los primeros N pasos, tres especies se pintaban con los tres tonos
 * más oscuros —tres verdes casi iguales— desperdiciando la mitad clara de la
 * rampa. Espaciando los índices, dos rebanadas usan los extremos y tres usan
 * primero-medio-último: el mismo hue, con la máxima separación disponible.
 */
function rampaPara(n: number): string[] {
  if (n <= 1) return [RAMPA_PATIO[0]];
  const ultimo = RAMPA_PATIO.length - 1;
  return Array.from({ length: n }, (_, i) => RAMPA_PATIO[Math.round((i * ultimo) / (n - 1))]);
}

/** Cuántos días de patio se consideran cómodos antes de encender el aviso. */
const COBERTURA_JUSTA = 7;
const COBERTURA_CRITICA = 3;
/** Depender de una sola especie por encima de esto es un riesgo de permiso. */
const CONCENTRACION_ALTA = 60;

export default function CtpSaldosGraficos({
  materiaPrima,
  porEspecie,
  productos,
  apertura,
  aperturaPendiente = false,
  period,
}: {
  materiaPrima: MateriaPrimaTotales;
  porEspecie: ReadonlyArray<EspecieSaldo>;
  productos: ReadonlyArray<ProductoStock>;
  /** Existencia heredada del cierre anterior; `null` si el período no la tiene. */
  apertura: number | null;
  /**
   * La conciliación viaja en un segundo pedido. Mientras no llegue, `apertura`
   * es `null` por no saberse todavía —no por no existir— y el pie no puede
   * afirmar "sin cierre previo": diría lo contrario de lo que se ve un segundo
   * después.
   */
  aperturaPendiente?: boolean;
  period: CtpPeriod;
}) {
  // `Date.now()` se toma acá y se INYECTA: la lib es pura y testeable, y el
  // valor no cambia entre los tres cálculos de un mismo render.
  const kpis = useMemo(
    () => kpisDePlanta(materiaPrima, porEspecie, productos, { from: period.from, to: period.to, ahora: Date.now() }),
    [materiaPrima, porEspecie, productos, period.from, period.to],
  );

  const pasos = useMemo(() => pasosDeBalance(materiaPrima, apertura), [materiaPrima, apertura]);

  const patio = useMemo(() => composicionSaldo(porEspecie), [porEspecie]);
  const totalPatio = useMemo(() => patio.reduce((a, r) => a + r.value, 0), [patio]);
  const rampa = useMemo(() => rampaPara(patio.length), [patio.length]);

  // Cada barra es el volumen FÍSICO de la especie, partido por estado. El
  // sobreconsumo va aparte y en color de problema: sumarlo al consumo normal
  // escondería justo lo que hay que ver.
  const porEstado = useMemo(
    () =>
      rankingEspecies(porEspecie).map((e) => ({
        especie: e.especie.length > 18 ? `${e.especie.slice(0, 17)}…` : e.especie,
        Disponible: Number(Math.max(0, e.saldoM3).toFixed(2)),
        Consumido: Number(Math.min(e.consumidoM3, e.ingresoM3).toFixed(2)),
        "Sin validar": Number(Number(e.pendienteM3).toFixed(2)),
        Sobreconsumo: Number(Math.max(0, e.consumidoM3 - e.ingresoM3).toFixed(2)),
      })),
    [porEspecie],
  );
  const haySobreconsumo = porEstado.some((e) => e.Sobreconsumo > 0);
  const haySinValidar = porEstado.some((e) => e["Sin validar"] > 0);

  const coberturaEmphasis =
    kpis.coberturaDias == null
      ? "neutral"
      : kpis.coberturaDias <= COBERTURA_CRITICA
        ? "error"
        : kpis.coberturaDias <= COBERTURA_JUSTA
          ? "warning"
          : "success";

  return (
    <div className="charts-forestal space-y-4">
      {/* ── Los cuatro derivados: no "cuánto hay" sino "cómo va" ───────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Rotación del ingreso"
          value={kpis.rotacionPct != null ? `${n2(kpis.rotacionPct)} %` : "—"}
          subValue={kpis.rotacionPct != null ? "de lo ingresado ya se transformó" : "sin ingresos en el período"}
          icon={Activity}
          emphasis="neutral"
        />
        <StatCard
          label="Cobertura del patio"
          value={kpis.coberturaDias != null ? `${kpis.coberturaDias} días` : "—"}
          subValue={
            kpis.consumoDiario != null
              ? `al ritmo de ${n2(kpis.consumoDiario)} m³/día (${kpis.diasMedidos} día${kpis.diasMedidos === 1 ? "" : "s"} medidos)`
              : "todavía no hubo consumo que medir"
          }
          icon={CalendarClock}
          emphasis={coberturaEmphasis}
        />
        <StatCard
          label="Depende de"
          value={kpis.concentracion ? `${n2(kpis.concentracion.pct)} %` : "—"}
          subValue={
            kpis.concentracion
              ? `${kpis.concentracion.especie} · del saldo en patio`
              : "sin saldo positivo en patio"
          }
          icon={PieChart}
          emphasis={kpis.concentracion && kpis.concentracion.pct > CONCENTRACION_ALTA ? "warning" : "neutral"}
        />
        <StatCard
          label="Producto terminado"
          value={`${kpis.productosConStock.con} / ${kpis.productosConStock.total}`}
          subValue={
            kpis.productosConStock.total > 0
              ? "líneas con stock listo para despachar"
              : "sin producción transformada"
          }
          icon={PackageCheck}
          emphasis="neutral"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Cómo se llegó al saldo ───────────────────────────────────────── */}
        <BulejeWaterfallChart
          steps={pasos}
          label={apertura != null ? "Rollforward del período" : "Movimiento del período"}
          sublabel="Cómo se llegó a la existencia final"
          formatValue={(v) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`}
          hint={
            apertura != null
              ? "En m³. La existencia final incluye lo heredado del cierre anterior; el KPI «Saldo de materia prima» cuenta sólo el movimiento del período."
              : aperturaPendiente
                ? "En m³. Señalá una barra para ver el acumulado."
                : "En m³. Sin cierre previo, la cascada arranca en el ingreso del período."
          }
          height={250}
          className="border-2"
        />

        {/* ── De qué especie depende el patio ──────────────────────────────── */}
        <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Composición
          </p>
          <CardTitle as="h3" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            De qué especie está hecho el saldo
          </CardTitle>
          {patio.length > 0 ? (
            <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row">
              {/* Tamaño fijo, sin medir: dentro de un flex el contenedor se
                  resolvía en 0 —al montar en móvil y al redimensionar— y la
                  dona quedaba como un hueco con el número flotando. */}
              <div className="shrink-0">
              <BulejeDonutChart
                data={patio}
                colors={rampa}
                width={190}
                height={180}
                innerRadius={52}
                outerRadius={76}
                format={m3}
                ariaLabel="Composición del saldo en patio por especie"
                label={
                  <div className="text-center">
                    <p className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{n2(totalPatio)}</p>
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">m³ en patio</p>
                  </div>
                }
              />
              </div>
              {/* La leyenda lleva el valor al lado: el color solo no dice cuánto,
                  y una dona sin cifras obliga a estimar ángulos a ojo. */}
              <ul className="w-full min-w-0 flex-1 space-y-1.5">
                {patio.map((r, i) => (
                  <li key={r.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: rampa[i % rampa.length] }}
                      aria-hidden
                    />
                    <span className="truncate text-[var(--text-secondary)]">
                      {r.name}
                      {r.especies > 1 && (
                        <span className="text-[var(--text-tertiary)]"> ({r.especies} especies)</span>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                      {n2(r.value)} m³
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {totalPatio > 0 ? `${((r.value / totalPatio) * 100).toFixed(0)} %` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">
              Sin saldo positivo en patio: todo lo ingresado ya se transformó.
            </p>
          )}
        </div>
      </div>

      {/* ── En qué estado está el volumen de cada especie ───────────────────── */}
      {porEstado.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Estado del volumen
          </p>
          <CardTitle as="h3" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            Cada especie, tramo por tramo (m³)
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            La barra completa es la madera que entró físicamente. Cuanto más largo el tramo
            «Disponible», más queda por aserrar.
            {haySinValidar && " «Sin validar» está en el patio pero todavía no cuenta como saldo."}
            {haySobreconsumo && " «Sobreconsumo» es volumen transformado sin ingreso que lo respalde: hay que corregirlo."}
          </p>
          <BulejeStackedBar
            className="mt-3"
            data={porEstado}
            xKey="especie"
            horizontal
            /* Cuatro tramos, DOS colores. Cuatro tonos distintos en una misma
               barra no se distinguen: medidos de a pares, teal↔azul quedaban en
               ΔE 10.5 y ámbar↔rojo en 9.1 — por debajo del piso de 15 incluso
               con visión de color completa. Así que sólo lo que exige un color
               lo lleva (lo que queda = teal, el problema = rojo) y los dos
               tramos históricos se separan por luminosidad, que es una
               dimensión libre. */
            stacks={[
              { key: "Disponible", label: "Disponible", color: "accent" },
              { key: "Consumido", label: "Consumido", color: "secondary" },
              ...(haySinValidar ? [{ key: "Sin validar", label: "Sin validar", color: "tertiary" as const }] : []),
              ...(haySobreconsumo ? [{ key: "Sobreconsumo", label: "Sobreconsumo", color: "error" as const }] : []),
            ]}
            height={Math.max(200, porEstado.length * 46 + 70)}
            maxBarSize={26}
            yAxisFormat={(v) => `${v}`}
            tooltipFormat={m3}
          />
        </div>
      )}
    </div>
  );
}
