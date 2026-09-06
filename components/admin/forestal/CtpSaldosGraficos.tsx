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
 * Los KPIs derivados que vivían acá se mudaron a `saldos/KpisDeExistencias`:
 * eran una tercera fila de tarjetas a media pantalla y dos de ellos repetían
 * números que ya estaban arriba. Este archivo dibuja; no resume.
 *
 * Los colores salen de `.charts-forestal` (globals.css): tres tonos elegidos
 * por modo y verificados contra la superficie real de la tarjeta.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { BulejeDonutChart, BulejeStackedBar, BulejeWaterfallChart } from "@/components/ui-system/charts";
import {
  composicionPiezas,
  composicionSaldo,
  pasosDeBalance,
  rankingEspecies,
  type EspecieSaldo,
  type MateriaPrimaTotales,
} from "@/lib/forestal/ctp-saldos-analisis";

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

export default function CtpSaldosGraficos({
  materiaPrima,
  porEspecie,
  apertura,
  aperturaPendiente = false,
}: {
  materiaPrima: MateriaPrimaTotales;
  porEspecie: ReadonlyArray<EspecieSaldo>;
  /** Existencia heredada del cierre anterior; `null` si el período no la tiene. */
  apertura: number | null;
  /**
   * La conciliación viaja en un segundo pedido. Mientras no llegue, `apertura`
   * es `null` por no saberse todavía —no por no existir— y el pie no puede
   * afirmar "sin cierre previo": diría lo contrario de lo que se ve un segundo
   * después.
   */
  aperturaPendiente?: boolean;
}) {
  const pasos = useMemo(() => pasosDeBalance(materiaPrima, apertura), [materiaPrima, apertura]);

  /**
   * De qué está hecho el patio. Primero en m³ —la unidad del libro—; si el
   * saldo no tiene nada positivo que repartir, en TROZAS, que es lo que hay
   * físicamente. Nunca las dos juntas: son unidades distintas y el anillo
   * dejaría de significar algo.
   */
  const patio = useMemo(() => {
    const enM3 = composicionSaldo(porEspecie);
    if (enM3.length > 0) return { rebanadas: enM3, unidad: "m3" as const };
    return { rebanadas: composicionPiezas(porEspecie), unidad: "piezas" as const };
  }, [porEspecie]);
  const rebanadas = patio.rebanadas;
  const totalPatio = useMemo(() => rebanadas.reduce((a, r) => a + r.value, 0), [rebanadas]);
  const rampa = useMemo(() => rampaPara(rebanadas.length), [rebanadas.length]);
  const enPiezas = patio.unidad === "piezas";
  /** Formateador y rótulo de la unidad activa, en un solo lugar. */
  const fmtUnidad = enPiezas
    ? (v: number | string) => `${Number(v).toLocaleString("es-PE")} trozas`
    : m3;
  const rotuloUnidad = enPiezas ? "trozas en patio" : "m³ en patio";

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
  const hayDisponible = porEstado.some((e) => e.Disponible > 0);
  const hayConsumido = porEstado.some((e) => e.Consumido > 0);

  /**
   * Sólo los tramos que existen.
   *
   * «Sin validar» y «Sobreconsumo» ya se condicionaban; «Disponible» y
   * «Consumido» no, y con el patio en cero la leyenda anunciaba un tramo teal
   * que no está dibujado en ninguna barra. Una leyenda que nombra colores
   * ausentes hace dudar de los que sí están.
   */
  const tramos = [
    ...(hayDisponible ? [{ key: "Disponible", label: "Disponible", color: "accent" as const }] : []),
    ...(hayConsumido ? [{ key: "Consumido", label: "Consumido", color: "secondary" as const }] : []),
    ...(haySinValidar ? [{ key: "Sin validar", label: "Sin validar", color: "tertiary" as const }] : []),
    ...(haySobreconsumo ? [{ key: "Sobreconsumo", label: "Sobreconsumo", color: "error" as const }] : []),
  ];

  return (
    <div className="charts-forestal space-y-4">
      <div className={`grid items-start gap-4 ${rebanadas.length > 0 ? "lg:grid-cols-2" : ""}`}>
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
        {rebanadas.length > 0 && (
          <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
            <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Composición
            </p>
            <CardTitle as="h3" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {enPiezas ? "De qué especie son las trozas paradas" : "De qué especie está hecho el saldo"}
            </CardTitle>
            {enPiezas && (
              /* Decir la unidad y por qué cambió. Un anillo que dice «57» donde
                 antes decía «m³» sin avisar es peor que no dibujarlo. */
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                El saldo en m³ no tiene nada positivo que repartir, así que acá va el conteo físico del patio —las
                mismas piezas que se ven en Antigüedad—.
              </p>
            )}

            {rebanadas.length === 1 ? (
              /* Una sola rebanada es un anillo del 100 %: la forma no compara
                 nada y ocupa 180 px para decir lo que entra en una línea. */
              <div className="mt-4 flex items-start gap-3">
                <span
                  className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
                  style={{ background: rampa[0] }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-mono text-3xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
                    {enPiezas ? totalPatio.toLocaleString("es-PE") : n2(totalPatio)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {rotuloUnidad}, {rebanadas[0].especies > 1 ? "repartidas entre" : "todas de"}{" "}
                    <strong className="font-bold text-[var(--text-primary)]">{rebanadas[0].name}</strong>
                    {rebanadas[0].especies > 1 ? ` (${rebanadas[0].especies} especies)` : " — una sola especie"}.
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    Todo el patio cuelga de un mismo permiso: un problema con ese título habilitante para la planta
                    entera.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row">
                {/* Tamaño fijo, sin medir: dentro de un flex el contenedor se
                    resolvía en 0 —al montar en móvil y al redimensionar— y la
                    dona quedaba como un hueco con el número flotando. */}
                <div className="shrink-0">
                  <BulejeDonutChart
                    data={rebanadas}
                    colors={rampa}
                    width={190}
                    height={180}
                    innerRadius={52}
                    outerRadius={76}
                    format={fmtUnidad}
                    ariaLabel={`Composición del patio por especie, en ${enPiezas ? "trozas" : "metros cúbicos"}`}
                    label={
                      <div className="text-center">
                        <p className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                          {enPiezas ? totalPatio.toLocaleString("es-PE") : n2(totalPatio)}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                          {rotuloUnidad}
                        </p>
                      </div>
                    }
                  />
                </div>
                {/* La leyenda lleva el valor al lado: el color solo no dice cuánto,
                    y una dona sin cifras obliga a estimar ángulos a ojo. */}
                <ul className="w-full min-w-0 flex-1 space-y-1.5">
                  {rebanadas.map((r, i) => (
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
                        {enPiezas ? r.value.toLocaleString("es-PE") : `${n2(r.value)} m³`}
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {totalPatio > 0 ? `${((r.value / totalPatio) * 100).toFixed(0)} %` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sin m³ positivos y sin piezas no hay composición que dibujar. La frase
          va suelta en vez de dentro de una tarjeta de 300 px vacía. */}
      {rebanadas.length === 0 && (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-tertiary)]">
          Sin saldo positivo ni trozas en patio: todo lo que ingresó ya se transformó o salió.
        </p>
      )}

      {/* ── En qué estado está el volumen de cada especie ───────────────────── */}
      {porEstado.length > 0 && tramos.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Estado del volumen
          </p>
          <CardTitle as="h3" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            Cada especie, tramo por tramo (m³)
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            La barra completa es la madera que entró físicamente.
            {/* El pie explicaba «Disponible» aunque ese tramo no estuviera en
                ninguna barra: con el patio en cero, describía un color que no
                existe en el dibujo. */}
            {hayDisponible && " Cuanto más largo el tramo «Disponible», más queda por aserrar."}
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
            stacks={tramos}
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
