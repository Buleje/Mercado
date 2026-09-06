"use client";

/**
 * Los números de arriba, sin repetirse y con un solo protagonista.
 *
 * La pantalla llegó a tener TRECE tarjetas en cuatro bloques distintos, y varias
 * decían lo mismo con otro nombre. Se podaron a ocho, pero ocho cajas del mismo
 * tamaño siguen siendo una lista, no un tablero: el saldo —el único número que
 * se declara ante SERFOR— pesaba lo mismo que «Producto terminado 1 / 2».
 *
 * Ahora hay UN héroe y dos tiras de apoyo, dentro de una sola tarjeta:
 *
 *  1. **El saldo**, grande, con su trayectoria al lado. Es la respuesta a la
 *     pregunta con la que se abre la pestaña.
 *  2. **El movimiento del período** (ingresó / consumió / pendiente / salió sin
 *     aserrar) — los sumandos que explican ese saldo. Van juntos porque leerlos
 *     por separado no dice nada: 114.74 m³ consumidos sólo alarma al lado de
 *     los 32.93 que entraron.
 *  3. **Los derivados de planta** (cobertura, concentración…) — no se declaran,
 *     se usan para decidir. Van últimos y más chicos.
 *
 * Dos cosas que esta tarjeta hace y la anterior no:
 *
 *  · **El saldo negativo se explica con el patio físico.** El endpoint devuelve
 *    `piezasDisponibles` al lado de un `saldoM3` de −81.81: hay 57 trozas
 *    paradas y el libro dice que no queda nada. No es contradicción, son dos
 *    cuentas distintas (el m³ resta contra el ingreso VALIDADO), pero si la
 *    pantalla no lo dice, el que la mira concluye que una de las dos miente.
 *  · **Un derivado sin dato no muestra un guión.** «—» a tamaño de titular se
 *    lee como error de carga. En su lugar va el motivo, en letra chica.
 */

import { useMemo } from "react";
import { Layers, Boxes, Scale, Clock, TreePine } from "@buleje/design-system/icons";
import { BulejeSparkline } from "@/components/ui-system/charts";
import {
  kpisDePlanta,
  type EspecieSaldo,
  type MateriaPrimaTotales,
  type ProductoStock,
} from "@/lib/forestal/ctp-saldos-analisis";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

const n2 = (v: number) => v.toFixed(2);
const nf = (v: number) => v.toLocaleString("es-PE");

/** Cuántos días de patio se consideran cómodos antes de encender el aviso. */
const COBERTURA_JUSTA = 7;
const COBERTURA_CRITICA = 3;
/** Depender de una sola especie por encima de esto es un riesgo de permiso. */
const CONCENTRACION_ALTA = 60;

const TONO_VALOR = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
} as const;

type Tono = keyof typeof TONO_VALOR;

export default function KpisDeExistencias({
  materiaPrima,
  porEspecie,
  productos,
  period,
  serieSaldo,
}: {
  materiaPrima: MateriaPrimaTotales & { ingresosCount: number };
  porEspecie: ReadonlyArray<EspecieSaldo>;
  productos: ReadonlyArray<ProductoStock>;
  period: CtpPeriod;
  /**
   * El saldo acumulado del período, para dibujar la trayectoria al lado del
   * número. Viene de la curva —que es un pedido aparte— así que puede no estar:
   * sin serie, el héroe se dibuja igual, sólo sin el rastro.
   */
  serieSaldo?: readonly number[];
}) {
  const mp = materiaPrima;

  // `Date.now()` se toma acá y se INYECTA: la lib es pura y testeable, y el
  // valor no cambia entre los cálculos de un mismo render.
  const kpis = useMemo(
    () => kpisDePlanta(mp, porEspecie, productos, { from: period.from, to: period.to, ahora: Date.now() }),
    [mp, porEspecie, productos, period.from, period.to],
  );

  // Lo que de verdad se puede aserrar: los negativos no son madera, son un
  // error. Sumarlos al disponible daría menos patio del que hay.
  const disponible = porEspecie.reduce((a, e) => a + Math.max(0, e.saldoM3), 0);
  const enRojo = Number((disponible - mp.saldoM3).toFixed(4));

  /** Trozas que siguen paradas en el patio, cuente lo que cuente el m³. */
  const piezasEnPatio = porEspecie.reduce((a, e) => a + (e.piezasDisponibles ?? 0), 0);

  const tonoSaldo: Tono = mp.saldoM3 < -0.0001 ? "error" : "success";

  /**
   * Por qué el saldo dice lo que dice. Tres situaciones distintas que antes
   * compartían un `subValue` de cuatro palabras.
   */
  const explicacion =
    mp.saldoM3 < -0.0001
      ? `Se declaró más consumo del que respalda el ingreso validado del período.${
          piezasEnPatio > 0
            ? ` Aun así hay ${nf(piezasEnPatio)} ${piezasEnPatio === 1 ? "troza parada" : "trozas paradas"} en el patio: lo que falta no es madera, es el ingreso que la ampare.`
            : ""
        }`
      : enRojo > 0.0001
        ? `${n2(disponible)} m³ aserrables menos ${n2(enRojo)} m³ de especies en negativo, que no son stock sino un error por corregir.`
        : piezasEnPatio > 0
          ? `Disponible en patio, en ${nf(piezasEnPatio)} ${piezasEnPatio === 1 ? "troza" : "trozas"} listas para la sierra.`
          : "Disponible en patio para aserrar.";

  const coberturaTono: Tono =
    kpis.coberturaDias == null
      ? "neutral"
      : kpis.coberturaDias <= COBERTURA_CRITICA
        ? "error"
        : kpis.coberturaDias <= COBERTURA_JUSTA
          ? "warning"
          : "success";

  /** Sin cobertura hay dos motivos distintos y el operador necesita cuál. */
  const coberturaSinDato =
    mp.saldoM3 <= 0.0001
      ? `el saldo no es positivo${kpis.consumoDiario != null ? ` · se consume ${n2(kpis.consumoDiario)} m³/día` : ""}`
      : "todavía no hubo consumo que marque el ritmo";

  /* «Salió sin aserrar» sólo aparece cuando la hubo, así que la tira tiene 3 o 4
     celdas. Fijar cuatro columnas dejaba un cuarto de fila vacío en el caso
     normal — un hueco que se lee como una tarjeta que no cargó. */
  const hayDespachoDirecto = (mp.despachadoDirectoM3 ?? 0) > 0;

  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-label="Existencias del período"
    >
      {/* ── 1. El saldo: el único número que se firma ─────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <Scale className="h-3.5 w-3.5" aria-hidden /> Saldo de materia prima
          </p>
          <p
            className={`mt-1 font-mono text-3xl font-extrabold leading-none tabular-nums sm:text-4xl ${TONO_VALOR[tonoSaldo]}`}
          >
            {n2(mp.saldoM3)} m³
          </p>
          <p className="mt-2 max-w-prose text-sm text-[var(--text-secondary)]">{explicacion}</p>
        </div>

        {/* La trayectoria, no el valor: el número grande ya está a la izquierda.
            Sin ejes a propósito —es contexto de forma, no una lectura—; el
            gráfico que se lee con números vive más abajo. */}
        {serieSaldo && serieSaldo.length >= 2 && (
          <div className="w-full shrink-0 sm:w-56">
            <p className="mb-1 text-right text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Cómo llegó hasta acá
            </p>
            <BulejeSparkline
              data={[...serieSaldo]}
              width="100%"
              height={40}
              trend={tonoSaldo === "error" ? "down" : "up"}
              strokeWidth={2}
            />
          </div>
        )}
      </div>

      {/* ── 2. Los sumandos que lo explican ───────────────────────────────── */}
      <dl
        className={`grid grid-cols-2 divide-[var(--rule-soft)] border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] sm:divide-x ${
          hayDespachoDirecto ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
        }`}
      >
        <Movimiento
          icono={Layers}
          termino="Ingresado (validado)"
          valor={`${n2(mp.ingresoM3)} m³`}
          pie={`${mp.ingresosCount} ${mp.ingresosCount === 1 ? "ingreso" : "ingresos"} en el período`}
        />
        <Movimiento
          icono={Boxes}
          termino="Consumido en producción"
          valor={`${n2(mp.consumidoM3)} m³`}
          pie={kpis.rotacionPct != null ? `${n2(kpis.rotacionPct)} % de lo ingresado` : "sin ingresos que rotar"}
          /* Consumir más del 100 % de lo ingresado es exactamente el sobreconsumo
             que deja el saldo en rojo: se marca donde se produce, no sólo en el
             total de arriba. */
          tono={kpis.rotacionPct != null && kpis.rotacionPct > 100 ? "warning" : "neutral"}
        />
        <Movimiento
          icono={Clock}
          termino="Pendiente de validar"
          valor={`${n2(mp.pendienteM3)} m³`}
          pie={
            mp.pendienteM3 > 0
              ? kpis.sinValidarPct != null
                ? `${n2(kpis.sinValidarPct)} % de lo que hay en patio`
                : "no computa como saldo"
              : "todo el ingreso está validado"
          }
          tono={mp.pendienteM3 > 0 ? "warning" : "neutral"}
        />
        {/* La madera que salió como entró (ADR-363). Va sólo si la hubo: un cero
            permanente es una tarjeta que nadie lee. Sin esto el saldo baja y no
            hay dónde ver por qué —no se aserró, se vendió en rollo—. */}
        {hayDespachoDirecto && (
          <Movimiento
            icono={TreePine}
            termino="Salió sin aserrar"
            valor={`${n2(mp.despachadoDirectoM3 ?? 0)} m³`}
            pie="madera vendida en rollo"
          />
        )}
      </dl>

      {/* ── 3. Los derivados: no "cuánto hay" sino "cómo va" ──────────────── */}
      <dl className="grid grid-cols-2 divide-[var(--rule-soft)] border-t border-[var(--rule-soft)] sm:grid-cols-4 sm:divide-x">
        <Derivado
          termino="Cobertura del patio"
          valor={kpis.coberturaDias != null ? `${kpis.coberturaDias} días` : null}
          pie={
            kpis.coberturaDias != null && kpis.consumoDiario != null
              ? `a ${n2(kpis.consumoDiario)} m³/día · ${kpis.diasMedidos} ${kpis.diasMedidos === 1 ? "día medido" : "días medidos"}`
              : coberturaSinDato
          }
          tono={coberturaTono}
        />
        <Derivado
          termino="Depende de"
          valor={kpis.concentracion ? `${n2(kpis.concentracion.pct)} %` : null}
          pie={kpis.concentracion ? `${kpis.concentracion.especie} · del saldo en patio` : "sin saldo positivo en patio"}
          tono={kpis.concentracion && kpis.concentracion.pct > CONCENTRACION_ALTA ? "warning" : "neutral"}
        />
        <Derivado
          termino="Especies con movimiento"
          valor={`${kpis.especiesActivas}`}
          pie={kpis.especiesActivas === 1 ? "en el período" : "distintas en el período"}
        />
        <Derivado
          termino="Producto terminado"
          valor={`${kpis.productosConStock.con} / ${kpis.productosConStock.total}`}
          pie={kpis.productosConStock.total > 0 ? "líneas con stock para despachar" : "sin producción transformada"}
        />
      </dl>
    </section>
  );
}

/** Un sumando del saldo. Se declara: va en mono y con su ícono. */
function Movimiento({
  icono: Icono,
  termino,
  valor,
  pie,
  tono = "neutral",
}: {
  icono: typeof Layers;
  termino: string;
  valor: string;
  pie: string;
  tono?: Tono;
}) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-3 first:border-t-0 sm:border-t-0">
      <dt className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <Icono className="h-3.5 w-3.5" aria-hidden /> {termino}
      </dt>
      <dd className={`mt-0.5 font-mono text-xl font-extrabold tabular-nums ${TONO_VALOR[tono]}`}>{valor}</dd>
      <p className="text-xs text-[var(--text-tertiary)]">{pie}</p>
    </div>
  );
}

/**
 * Un derivado de planta. `valor` en `null` significa «no se puede afirmar»: en
 * vez del guión gigante —que se lee como dato que no cargó— sube el motivo, que
 * es lo único que hay para decir.
 */
function Derivado({
  termino,
  valor,
  pie,
  tono = "neutral",
}: {
  termino: string;
  valor: string | null;
  pie: string;
  tono?: Tono;
}) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-2.5 first:border-t-0 sm:border-t-0">
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {termino}
      </dt>
      {valor != null ? (
        <>
          <dd className={`font-mono text-lg font-extrabold tabular-nums ${TONO_VALOR[tono]}`}>{valor}</dd>
          <p className="text-xs text-[var(--text-tertiary)]">{pie}</p>
        </>
      ) : (
        <dd className="mt-0.5 text-sm text-[var(--text-secondary)]">Sin dato: {pie}.</dd>
      )}
    </div>
  );
}
