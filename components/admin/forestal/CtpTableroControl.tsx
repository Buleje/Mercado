"use client";

/**
 * El tablero de Control — las cuatro secciones del libro, en el tiempo.
 *
 * El LO-CTP tiene cuatro secciones y cada una vivía en su pestaña: entraba
 * madera en Ingresos, se gastaba en Consumos, salía producto en Producción y se
 * despachaba en Despacho. Ninguna pantalla mostraba **las cuatro juntas**, que
 * es la única forma de contestar la pregunta del dueño: *¿estoy metiendo más
 * madera de la que estoy sacando?*
 *
 * Todo sale de un solo pedido (`/ctp/movimiento`) con los MISMOS predicados que
 * el balance de Saldos: si el tablero y el balance discutieran, uno de los dos
 * sobra.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  Minus,
  PackageOpen,
  RefreshCw,
  Scale,
  TrendingUp,
  Truck,
} from "@buleje/design-system/icons";
import {
  BulejeComposedChart,
  BulejeDonutChart,
  BulejeWaterfallChart,
} from "@/components/ui-system/charts";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { applyCtpPeriodParams, ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  acumular,
  diasDeMateriaPrima,
  etiquetaDeCubo,
  variacionPct,
  type MovimientoDelLibro,
  type TotalesMovimiento,
} from "@/lib/forestal/movimiento-libro";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { Btn, VistaHeader } from "./ctp-shared";
import CtpPuestaEnMarcha from "./CtpPuestaEnMarcha";

const m3 = (n: number) => `${n.toFixed(2)} m³`;
const NOMBRE_PASO: Record<MovimientoDelLibro["paso"], string> = {
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
};

/** Un número del período, con su lectura contra el período anterior. */
function Kpi({
  icon: Icon,
  label,
  valor,
  pie,
  delta,
  hayPrevio,
}: {
  icon: typeof Flame;
  label: string;
  valor: string;
  pie: string;
  delta: number | null;
  /** Si el período anterior se pudo calcular. Distinto de que haya dado cero. */
  hayPrevio: boolean;
}) {
  const Flecha = delta == null ? Minus : delta >= 0 ? ArrowUpRight : ArrowDownRight;
  /* Tres estados, no dos: no hay con qué comparar / había período pero estuvo
     quieto / hay variación. Decir «sin período previo» cuando el trimestre
     anterior existió y no tuvo movimiento es afirmar algo falso. */
  const lectura =
    delta != null
      ? `${delta > 0 ? "+" : ""}${delta}%`
      : hayPrevio
        ? "antes no hubo movimiento"
        : "sin período previo";
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{valor}</p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-tertiary)]">
        <span>{pie}</span>
        {/* Sin período anterior no se inventa un porcentaje: se dice que no hay
            con qué comparar, que es una respuesta y no un hueco. */}
        <span
          className={
            delta == null
              ? "text-[var(--text-tertiary)]"
              : delta >= 0
                ? "font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                : "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          }
        >
          <Flecha className="inline h-3 w-3" aria-hidden />{" "}
          {lectura}
        </span>
      </p>
    </div>
  );
}

function Bloque({ titulo, meta, children }: { titulo: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          {titulo}
        </CardTitle>
        {meta && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
      </div>
      {/* Los charts van en un div con alto propio: dentro de un flex sin ancho,
          `ResponsiveContainer` mide 0 y el gráfico no se dibuja (gotcha del repo). */}
      {children}
    </section>
  );
}

export default function CtpTableroControl({ period, onIr }: { period: CtpPeriod; onIr?: (vista: string) => void }) {
  const [mov, setMov] = useState<MovimientoDelLibro | null>(null);
  const [previo, setPrevio] = useState<TotalesMovimiento | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const u = new URL("/api/admin/forestal/ctp/movimiento", window.location.origin);
      applyCtpPeriodParams(u.searchParams, period);
      u.searchParams.set("comparar", "1");
      const r = await ctpGet<{ movimiento: MovimientoDelLibro; previo: TotalesMovimiento | null }>(u.toString());
      setMov(r.movimiento);
      setPrevio(r.previo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMov(null);
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const serie = useMemo(
    () =>
      (mov?.puntos ?? []).map((p) => ({
        x: etiquetaDeCubo(p.fecha, mov!.paso),
        Ingresado: p.ingresoM3,
        "A la sierra": p.consumoM3,
        Producido: p.producido,
        Despachado: p.despachado,
        Rendimiento: p.rendimiento,
      })),
    [mov],
  );

  const t = mov?.totales;
  const balance = useMemo(
    () =>
      t
        ? [
            { label: "Entró al patio", value: t.ingresoM3, type: "positive" as const },
            { label: "A la sierra", value: -t.consumoM3, type: "negative" as const },
            { label: "Variación del patio", value: t.variacionPatioM3, type: "total" as const },
          ]
        : [],
    [t],
  );

  /* Las dos curvas acumuladas: si se separan, el patio crece; si se juntan, se
     está vaciando. Es la lectura que la barra por cubo no puede dar. */
  const serieAcum = useMemo(
    () =>
      acumular(mov?.puntos ?? []).map((p) => ({
        x: etiquetaDeCubo(p.fecha, mov!.paso),
        "Entró acumulado": p.ingresoAcum,
        "A la sierra acumulado": p.consumoAcum,
      })),
    [mov],
  );

  /** Derivado, no un dato del libro: se dice de dónde sale. */
  const diasPatio = useMemo(
    () =>
      t && mov
        ? diasDeMateriaPrima(t.saldoPatioM3, t.consumoM3, Math.max(mov.puntos.length, 1) * (mov.paso === "mes" ? 30 : mov.paso === "semana" ? 7 : 1))
        : null,
    [t, mov],
  );

  const especies = useMemo(
    () => (mov?.porEspecie ?? []).filter((e) => e.ingresoM3 > 0).slice(0, 8),
    [mov],
  );

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Tablero del libro"
        meta={`${ctpPeriodShortLabel(period)}${mov ? ` · ${NOMBRE_PASO[mov.paso]}` : ""}`}
        hint="Las cuatro secciones del LO-CTP en el tiempo: lo que entró, lo que fue a la sierra, lo que salió de producto y lo que se despachó. Mismos números que el balance de Saldos."
      >
        <Btn variant="secondary" onClick={() => void cargar()} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Recargar
        </Btn>
      </VistaHeader>

      {/* Qué partes del libro están construidas y sin estrenar. Va acá, en la
          portada del grupo Control, porque es lo único de esta pantalla que se
          responde UNA vez: el resto del tablero es el movimiento del mes, que se
          mira siempre. Se dibuja solo si hay algo que decir, y NO mira el
          período —la pregunta es «¿alguna vez usaste esto?», no «¿lo usaste en
          julio?»—. */}
      <CtpPuestaEnMarcha onIr={onIr} />

      {error && (
        <p className="rounded-xl bg-[var(--data-error-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {cargando && !mov ? (
        <p className="text-sm text-[var(--text-tertiary)]">Sumando el movimiento del libro…</p>
      ) : !t ? null : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              icon={PackageOpen}
              label="Entró al patio"
              valor={m3(t.ingresoM3)}
              pie={`${pieTablarDe(t.ingresoM3).toLocaleString("es-PE")} pt`}
              delta={previo ? variacionPct(t.ingresoM3, previo.ingresoM3) : null}
              hayPrevio={previo != null}
            />
            <Kpi
              icon={Flame}
              label="A la sierra"
              valor={m3(t.consumoM3)}
              pie="materia prima consumida"
              delta={previo ? variacionPct(t.consumoM3, previo.consumoM3) : null}
              hayPrevio={previo != null}
            />
            <Kpi
              icon={TrendingUp}
              label="Producido"
              valor={t.producido.toFixed(2)}
              pie="producto declarado"
              delta={previo ? variacionPct(t.producido, previo.producido) : null}
              hayPrevio={previo != null}
            />
            <Kpi
              icon={Truck}
              label="Despachado"
              valor={t.despachado.toFixed(2)}
              pie="salidas del período"
              delta={previo ? variacionPct(t.despachado, previo.despachado) : null}
              hayPrevio={previo != null}
            />
            <Kpi
              icon={Scale}
              label="Rendimiento"
              valor={t.rendimiento > 0 ? `${t.rendimiento.toFixed(1)}%` : "—"}
              pie={
                t.corridasOtraUnidad > 0
                  ? `${t.corridasOtraUnidad} corrida(s) fuera: declaran en otra unidad`
                  : "producido ÷ consumido, sólo en m³"
              }
              delta={previo ? variacionPct(t.rendimiento, previo.rendimiento) : null}
              hayPrevio={previo != null}
            />
          </div>

          <Bloque
            titulo="Flujo del libro"
            meta={`${mov.puntos.length} ${mov.paso === "mes" ? "meses" : mov.paso === "semana" ? "semanas" : "días"}`}
          >
            <BulejeComposedChart
              data={serie}
              xKey="x"
              bars={[
                { key: "Ingresado", label: "Entró (m³)", color: "primary" },
                { key: "A la sierra", label: "A la sierra (m³)", color: "amber" },
              ]}
              lines={[{ key: "Despachado", label: "Despachado", color: "accent", yAxis: "right" }]}
              height={260}
              showLegend
            />
          </Bloque>

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque
              titulo={`Aserrío ${NOMBRE_PASO[mov.paso]}`}
              meta={
                t.rendimiento > 0
                  ? `rendimiento ponderado ${t.rendimiento.toFixed(1)}%`
                  : "sin corridas declaradas en m³"
              }
            >
              <BulejeComposedChart
                data={serie}
                xKey="x"
                bars={[{ key: "A la sierra", label: "Consumido (m³)", color: "amber" }]}
                lines={[{ key: "Rendimiento", label: "Rendimiento (%)", color: "accent", yAxis: "right" }]}
                height={240}
                rightAxisFormat={(v) => `${v}%`}
                showLegend
              />
            </Bloque>

            <Bloque titulo="Balance del patio" meta="lo que entró contra lo que se gastó">
              <BulejeWaterfallChart
                steps={balance}
                label={m3(t.variacionPatioM3)}
                sublabel={
                  t.variacionPatioM3 >= 0
                    ? "el patio creció en el período"
                    : "el patio se consumió más de lo que entró"
                }
                formatValue={(v) => `${v.toFixed(2)} m³`}
                height={240}
              />
            </Bloque>
          </div>

          <Bloque
            titulo="Entrada contra sierra, acumulado"
            meta={
              diasPatio != null
                ? `al ritmo del período, quedan ~${diasPatio} días de materia prima`
                : "sin consumo en el período: no hay ritmo que proyectar"
            }
          >
            <BulejeComposedChart
              data={serieAcum}
              xKey="x"
              lines={[
                { key: "Entró acumulado", label: "Entró acumulado (m³)", color: "primary" },
                { key: "A la sierra acumulado", label: "A la sierra acumulado (m³)", color: "amber" },
              ]}
              height={240}
              showLegend
            />
          </Bloque>

          {especies.length > 0 && (
            <Bloque titulo="De qué especie entró la madera" meta={`${especies.length} especie(s)`}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] md:items-center">
                <BulejeDonutChart
                  data={especies.map((e) => ({ name: e.especie, value: e.ingresoM3 }))}
                  height={220}
                  format={(v) => `${Number(v).toFixed(2)} m³`}
                  ariaLabel="Composición por especie de la madera ingresada"
                />
                <ul className="space-y-1 text-sm">
                  {especies.map((e) => (
                    <li key={e.especie} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[var(--text-secondary)]">{e.especie}</span>
                      <span className="shrink-0 font-mono tabular-nums text-[var(--text-primary)]">
                        {e.ingresoM3.toFixed(2)} m³
                        {e.consumoM3 > 0 && (
                          <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                            · {e.consumoM3.toFixed(2)} a la sierra
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Bloque>
          )}

          {mov.truncado && (
            <p className="text-xs text-[var(--text-tertiary)]">
              El período es tan largo que el eje se cortó: acotá las fechas para ver el detalle completo.
            </p>
          )}
        </>
      )}
    </div>
  );
}
