"use client";

/**
 * Los números de arriba, sin repetirse.
 *
 * La pantalla llegó a tener TRECE tarjetas en cuatro bloques distintos, y varias
 * decían lo mismo con otro nombre: «La que más pesa: Tornillo, 70.8 % del total»
 * y «Depende de: 70.84 %, Tornillo · del saldo en patio» eran el mismo dato a
 * treinta píxeles de distancia. Cuando un tablero repite, el que lo mira deja de
 * confiar en que dos números distintos signifiquen cosas distintas.
 *
 * Quedan dos niveles y se distinguen por su forma:
 *  · **Cuatro tarjetas** — lo que dice el LIBRO. Son los que se declaran.
 *  · **Una tira compacta** — lo que dice la PLANTA. Derivados: útiles para
 *    decidir, no para firmar. Van más chicos porque valen menos.
 *
 * El saldo de materia prima además EXPLICA su diferencia con lo disponible en
 * patio: son dos números que la pantalla mostraba a la vez sin decir por qué no
 * coinciden (la brecha es el volumen en negativo, que no es madera que se pueda
 * aserrar sino un error por corregir).
 */

import { useMemo } from "react";
import { StatCard } from "@buleje/design-system";
import { Layers, Boxes, Scale, Clock, TreePine } from "@buleje/design-system/icons";
import {
  kpisDePlanta,
  type EspecieSaldo,
  type MateriaPrimaTotales,
  type ProductoStock,
} from "@/lib/forestal/ctp-saldos-analisis";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

const n2 = (v: number) => v.toFixed(2);

/** Cuántos días de patio se consideran cómodos antes de encender el aviso. */
const COBERTURA_JUSTA = 7;
const COBERTURA_CRITICA = 3;
/** Depender de una sola especie por encima de esto es un riesgo de permiso. */
const CONCENTRACION_ALTA = 60;

export default function KpisDeExistencias({
  materiaPrima,
  porEspecie,
  productos,
  period,
}: {
  materiaPrima: MateriaPrimaTotales & { ingresosCount: number };
  porEspecie: ReadonlyArray<EspecieSaldo>;
  productos: ReadonlyArray<ProductoStock>;
  period: CtpPeriod;
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

  const coberturaEmphasis =
    kpis.coberturaDias == null
      ? "neutral"
      : kpis.coberturaDias <= COBERTURA_CRITICA
        ? "error"
        : kpis.coberturaDias <= COBERTURA_JUSTA
          ? "warning"
          : "success";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          density="compact"
          label="Saldo de materia prima"
          value={`${n2(mp.saldoM3)} m³`}
          subValue={
            enRojo > 0.0001
              ? `${n2(disponible)} aserrables − ${n2(enRojo)} en negativo`
              : mp.saldoM3 < 0
                ? "sobreconsumo"
                : "disponible en patio"
          }
          icon={Scale}
          emphasis={mp.saldoM3 < 0 ? "error" : "success"}
        />
        <StatCard
          density="compact"
          label="Ingresado (validado)"
          value={`${n2(mp.ingresoM3)} m³`}
          subValue={`${mp.ingresosCount} ${mp.ingresosCount === 1 ? "ingreso" : "ingresos"}`}
          icon={Layers}
          emphasis="neutral"
        />
        <StatCard
          density="compact"
          label="Consumido en producción"
          value={`${n2(mp.consumidoM3)} m³`}
          subValue={kpis.rotacionPct != null ? `${n2(kpis.rotacionPct)} % de lo ingresado` : "sin ingresos que rotar"}
          icon={Boxes}
          emphasis="neutral"
        />
        {/* La madera que salió como entró (ADR-363). Va sólo si la hubo: un cero
            permanente es una tarjeta que nadie lee. Sin esto el saldo baja y no
            hay dónde ver por qué —no se aserró, se vendió en rollo—. */}
        {(mp.despachadoDirectoM3 ?? 0) > 0 && (
          <StatCard
            density="compact"
            label="Salió sin aserrar"
            value={`${n2(mp.despachadoDirectoM3 ?? 0)} m³`}
            subValue="madera vendida en rollo"
            icon={TreePine}
            emphasis="neutral"
          />
        )}
        <StatCard
          density="compact"
          label="Pendiente de validar"
          value={`${n2(mp.pendienteM3)} m³`}
          subValue={
            mp.pendienteM3 > 0
              ? kpis.sinValidarPct != null
                ? `${n2(kpis.sinValidarPct)} % de lo que hay en patio`
                : "no computa como saldo"
              : "todo el ingreso está validado"
          }
          icon={Clock}
          emphasis={mp.pendienteM3 > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Los derivados: no "cuánto hay" sino "cómo va". Tira compacta y no
          tarjetas, porque no se declaran — se usan para decidir. */}
      <dl className="grid grid-cols-2 divide-[var(--rule-soft)] overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] sm:grid-cols-4 sm:divide-x">
        <Derivado
          termino="Cobertura del patio"
          valor={kpis.coberturaDias != null ? `${kpis.coberturaDias} días` : "—"}
          pie={
            kpis.consumoDiario != null
              ? `a ${n2(kpis.consumoDiario)} m³/día · ${kpis.diasMedidos} ${kpis.diasMedidos === 1 ? "día medido" : "días medidos"}`
              : "todavía no hubo consumo que medir"
          }
          emphasis={coberturaEmphasis}
        />
        <Derivado
          termino="Depende de"
          valor={kpis.concentracion ? `${n2(kpis.concentracion.pct)} %` : "—"}
          pie={kpis.concentracion ? `${kpis.concentracion.especie} · del saldo en patio` : "sin saldo positivo en patio"}
          emphasis={kpis.concentracion && kpis.concentracion.pct > CONCENTRACION_ALTA ? "warning" : "neutral"}
        />
        <Derivado
          termino="Especies con movimiento"
          valor={`${kpis.especiesActivas}`}
          pie={kpis.especiesActivas === 1 ? "en el período" : "distintas en el período"}
          emphasis="neutral"
        />
        <Derivado
          termino="Producto terminado"
          valor={`${kpis.productosConStock.con} / ${kpis.productosConStock.total}`}
          pie={kpis.productosConStock.total > 0 ? "líneas con stock para despachar" : "sin producción transformada"}
          emphasis="neutral"
        />
      </dl>
    </div>
  );
}

const TONO_DERIVADO = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
} as const;

function Derivado({
  termino,
  valor,
  pie,
  emphasis,
}: {
  termino: string;
  valor: string;
  pie: string;
  emphasis: keyof typeof TONO_DERIVADO;
}) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-3 first:border-t-0 sm:border-t-0">
      <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {termino}
      </dt>
      <dd className={`font-mono text-lg font-extrabold tabular-nums ${TONO_DERIVADO[emphasis]}`}>{valor}</dd>
      <p className="text-xs text-[var(--text-tertiary)]">{pie}</p>
    </div>
  );
}
