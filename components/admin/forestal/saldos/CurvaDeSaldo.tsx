"use client";

/**
 * CurvaDeSaldo — ¿el patio se está llenando o vaciando?
 *
 * Los KPIs y la cascada dan una foto: cuánto hay hoy y de dónde salió. Ninguno
 * contesta la pregunta con la que se compra madera —«¿esto sube o baja?»—, y un
 * patio que perdió 40 m³ en el mes muestra el mismo total de hoy que uno que
 * ganó 40. La forma que responde eso es una línea en el tiempo, con los
 * movimientos que la explican debajo.
 *
 * Se lee de arriba abajo: los cuatro números del recorrido (de dónde salió, a
 * dónde llegó, cuánto cambió, dónde tocó fondo) y después el dibujo. El VALLE
 * es la razón de existir del gráfico: un saldo que cierra en verde puede haber
 * estado en rojo el martes, y eso es exactamente lo que reconstruye un
 * fiscalizador.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "@buleje/design-system/icons";
import { BulejeComposedChart } from "@/components/ui-system/charts";

export interface PuntoCurva {
  fecha: string;
  ingreso: number;
  consumo: number;
  saldo: number;
}

export interface CurvaSaldoData {
  apertura: number;
  fuenteApertura: "cierre" | "calculada" | "sin_apertura";
  aperturaLabel: string | null;
  paso: "dia" | "semana" | "mes";
  puntos: PuntoCurva[];
  final: number;
  pico: { fecha: string; saldo: number } | null;
  valle: { fecha: string; saldo: number } | null;
}

const n2 = (v: number) => v.toFixed(2);
const m3 = (v: number | string) => `${Number(v).toFixed(2)} m³`;

/**
 * Las fechas del libro son date-only guardadas a medianoche UTC: leerlas en
 * hora de Lima (UTC−5) las corre un día para atrás. Siempre `timeZone: "UTC"`.
 */
function etiqueta(iso: string, paso: CurvaSaldoData["paso"]): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  if (paso === "mes") return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit", timeZone: "UTC" });
  const dia = d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
  return paso === "semana" ? `sem ${dia}` : dia;
}

const NOMBRE_PASO: Record<CurvaSaldoData["paso"], string> = {
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
};

export default function CurvaDeSaldo({ curva, periodoLabel }: { curva: CurvaSaldoData; periodoLabel: string }) {
  const data = useMemo(
    () =>
      curva.puntos.map((p) => ({
        x: etiqueta(p.fecha, curva.paso),
        // `Number(...)` antes del `toFixed`: los puntos vienen de un fetch, y un
        // string donde se espera número tira en runtime, no en el tipo.
        Saldo: Number(p.saldo),
        Ingresó: Number(Number(p.ingreso).toFixed(2)),
        Consumió: Number(Number(p.consumo).toFixed(2)),
      })),
    [curva.puntos, curva.paso],
  );

  const delta = Number((curva.final - curva.apertura).toFixed(4));
  const subiendo = delta > 0.0001;
  const bajando = delta < -0.0001;
  const Flecha = subiendo ? TrendingUp : bajando ? TrendingDown : Minus;
  const tonoDelta = subiendo
    ? "text-[var(--data-success-600)]"
    : bajando
      ? "text-[var(--data-warning-600)]"
      : "text-[var(--text-secondary)]";

  // El valle sólo es noticia si tocó el rojo; un mínimo positivo es sólo el día
  // en que menos había, que no obliga a hacer nada.
  const valleEnRojo = curva.valle != null && curva.valle.saldo < -0.0001;

  const movimientos = curva.puntos.filter((p) => p.ingreso > 0 || p.consumo > 0).length;

  if (curva.puntos.length < 2) {
    return (
      <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <Encabezado paso={curva.paso} periodoLabel={periodoLabel} />
        <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
          El período no tiene suficientes movimientos para dibujar una tendencia. Con dos fechas distintas ya se ve.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <Encabezado paso={curva.paso} periodoLabel={periodoLabel} />

      {/* El recorrido en números, antes del dibujo: quien no lee gráficos se
          lleva igual la conclusión. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Dato
          termino="Arrancó en"
          valor={`${n2(curva.apertura)} m³`}
          pie={
            curva.fuenteApertura === "cierre"
              ? `cierre de ${curva.aperturaLabel ?? "el período anterior"}`
              : curva.fuenteApertura === "calculada"
                ? "acumulado al inicio"
                : "sin cierre previo"
          }
        />
        <Dato termino="Terminó en" valor={`${n2(curva.final)} m³`} pie={`${movimientos} ${movimientos === 1 ? "fecha" : "fechas"} con movimiento`} />
        <Dato
          termino="Cambió"
          valor={`${delta > 0 ? "+" : delta < 0 ? "−" : ""}${n2(Math.abs(delta))} m³`}
          pie={subiendo ? "el patio se llenó" : bajando ? "el patio se vació" : "quedó igual"}
          tono={tonoDelta}
          icono={<Flecha className="h-4 w-4" aria-hidden />}
        />
        <Dato
          termino="Tocó fondo en"
          valor={curva.valle ? `${n2(curva.valle.saldo)} m³` : "—"}
          pie={curva.valle ? etiqueta(curva.valle.fecha, curva.paso) : "sin mínimo que marcar"}
          tono={valleEnRojo ? "text-[var(--data-error-600)]" : undefined}
          icono={valleEnRojo ? <AlertTriangle className="h-4 w-4" aria-hidden /> : undefined}
        />
      </dl>

      {valleEnRojo && (
        <p className="mt-3 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
          El saldo estuvo bajo cero durante el período: hubo consumo declarado antes de que ingresara la madera que lo
          respalda. Revisá las fechas de las corridas contra las de sus guías.
        </p>
      )}

      <BulejeComposedChart
        className="mt-3"
        data={data}
        xKey="x"
        /* La línea es el protagonista (el saldo) y va sola en el eje izquierdo;
           las barras son el movimiento que la explica y van a la derecha, en su
           propia escala: un ingreso de 12 m³ y un saldo de 50 en el mismo eje
           dejaban las barras invisibles. */
        lines={[{ key: "Saldo", label: "Saldo en patio (m³)", color: "primary", yAxis: "left" }]}
        /* Entrada y salida en colores OPUESTOS de la paleta (teal / coral). Con
           los dos en gris la leyenda tenía dos puntos negros —el saldo y el
           consumo— y había que adivinar cuál era cuál. */
        bars={[
          { key: "Ingresó", label: "Ingresó", color: "accent", yAxis: "right" },
          { key: "Consumió", label: "Consumió", color: "amber", yAxis: "right" },
        ]}
        /* Sin data labels: son 60+ puntos y el número encima de cada barra tapa
           la línea que hay que leer. */
        showValues={false}
        /* Una serie diaria de un trimestre son 90 fechas: sin tope se dibujan
           todas, rotadas y encimadas. Con 10 se lee cuándo pasó cada cosa. */
        maxXTicks={10}
        height={280}
        leftAxisFormat={(v) => `${v}`}
        rightAxisFormat={(v) => `${v}`}
        tooltipFormat={m3}
      />
    </div>
  );
}

function Encabezado({ paso, periodoLabel }: { paso: CurvaSaldoData["paso"]; periodoLabel: string }) {
  return (
    <>
      <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Tendencia · {periodoLabel}
      </p>
      <CardTitle as="h3" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
        Cómo se movió el patio, {NOMBRE_PASO[paso]}
      </CardTitle>
      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
        La línea es la existencia de materia prima acumulada; las barras, lo que entró y lo que se aserró en cada
        fecha. Sube cuando llegan guías, baja cuando la sierra trabaja.
      </p>
    </>
  );
}

function Dato({
  termino,
  valor,
  pie,
  tono,
  icono,
}: {
  termino: string;
  valor: string;
  pie: string;
  tono?: string;
  icono?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {termino}
      </dt>
      <dd className={`flex items-center gap-1.5 font-mono text-lg font-extrabold tabular-nums ${tono ?? "text-[var(--text-primary)]"}`}>
        {icono}
        {valor}
      </dd>
      <p className="text-xs text-[var(--text-tertiary)]">{pie}</p>
    </div>
  );
}
