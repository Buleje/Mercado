"use client";

/**
 * Resumen de Adelantos — la primera sub-vista, ordenada por la pregunta que se
 * hace al abrirla (ley de orden, `.claude/rules/ui-components.md`):
 *
 *   1. ¿Cuánto me deben? — el saldo (el único `SectionTitle` de la vista), la
 *      recuperación y los indicadores plegados en una línea (recordado).
 *   2. ¿Qué se escapó o vence ya? — «sin control» en una línea que se
 *      despliega, y «vence esta semana».
 *   3. ¿Quién me debe? — los deudores por urgencia, con el total.
 *   4. El detalle: la cuenta por persona (adelantos + cuenta forestal).
 *
 * Medido a 1280 px en `main` (08-10): 3,44 pantallas y 49 botones antes,
 * con ocho filas de «sin control» abiertas y seis tarjetas al pie. Nada se
 * borró: lo que no se mira primero quedó plegado o más abajo.
 *
 * Todo lo de esta vista es «lo que te deben» (sólo lo DADO, ADR-448); lo
 * RECIBIDO entra sólo en «Le debes».
 */

import { useId } from "react";
import { SectionTitle } from "@buleje/design-system";
import { CheckCircle, Clock, Coins, Wallet } from "@buleje/design-system/icons";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { deudoresDeCobranza, ordenarPorUrgencia, type DeudorCobranza } from "@/lib/adelantos/urgencia-cobranza";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import ProximosVencimientos from "../cobranza/ProximosVencimientos";
import SinControl from "../cobranza/SinControl";
import CuentasPorPersona from "../cuentas/CuentasPorPersona";
import { EmptyState, SkeletonGrid, fmtMonedas, sumByMoneda } from "../shared";
import IndicadoresResumen from "./IndicadoresResumen";
import QuienTeDebe from "./QuienTeDebe";
import ResumenSinActividad from "./ResumenSinActividad";
import type { Resumen } from "./tipos";

export default function ResumenView({
  resumen,
  adelantos,
  recibidos,
  loading,
  onGoTab,
  onChange,
}: {
  resumen: Resumen | null;
  /** Sólo lo DADO: todo lo de esta vista es «lo que te deben». */
  adelantos: DbAdelanto[];
  /** Lo RECIBIDO, para «Le debes». */
  recibidos: DbAdelanto[];
  loading: boolean;
  onGoTab: (tab: string) => void;
  /** Recargar después de tocar un adelanto desde su ficha (aviso «sin control»). */
  onChange: () => void;
}) {
  const tituloId = useId();
  if (loading) return <SkeletonGrid />;
  if (!resumen) return <EmptyState icon={Wallet} title="Sin datos aún" hint="Crea tu primer adelanto en la pestaña Adelantos." />;

  // Sin actividad todavía → guía de 2 pasos en vez del muro de ceros.
  const sinActividad =
    resumen.beneficiarios === 0 &&
    resumen.adelantosAbiertos === 0 &&
    resumen.adelantosLiquidados === 0;

  if (sinActividad) return <ResumenSinActividad onGoTab={onGoTab} />;

  const adelantado = resumen.totalAdelantado;
  const liquidado = resumen.totalLiquidado;
  const pct = adelantado > 0 ? Math.min(100, Math.round((liquidado / adelantado) * 100)) : 0;
  const abiertos = adelantos.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0);

  const deudores: DeudorCobranza[] = ordenarPorUrgencia(deudoresDeCobranza(abiertos));

  // Cifras segmentadas por moneda (ADR-118) — desde el listado (que trae moneda)
  const activos = adelantos.filter((a) => a.status !== "CANCELADO");
  const saldoMap = sumByMoneda(abiertos.map((a) => ({ monto: a.saldoPendiente, moneda: a.moneda })));
  const adelantadoMap = sumByMoneda(activos.map((a) => ({ monto: a.montoAdelantado, moneda: a.moneda })));
  const liquidadoMap = sumByMoneda(activos.map((a) => ({ monto: Math.max(0, a.montoAdelantado - a.saldoPendiente), moneda: a.moneda })));
  const excedenteMap = sumByMoneda(adelantos.filter((a) => a.status === "EXCEDIDO").map((a) => ({ monto: -a.saldoPendiente, moneda: a.moneda })));
  const hayExcedente = Object.values(excedenteMap).some((v) => v > 0);
  /* «Le debes» = lo que te entregaron de más + lo que te dieron y todavía
     devuelves (ADR-448 §2.6: la misma cuenta que la ficha de la persona). */
  const porDevolverMap = sumByMoneda(recibidos.filter((a) => a.status === "ABIERTO").map((a) => ({ monto: a.saldoPendiente, moneda: a.moneda })));
  const leDebesMap = sumByMoneda([
    ...Object.entries(excedenteMap).map(([moneda, monto]) => ({ monto, moneda })),
    ...Object.entries(porDevolverMap).map(([moneda, monto]) => ({ monto, moneda })),
  ]);
  const hayLeDebes = Object.values(leDebesMap).some((v) => v > 0);
  const hayPorDevolver = Object.values(porDevolverMap).some((v) => v > 0);

  // Mensaje de salud: prioriza lo que te deben; si nada, todo al día; si excedente, a favor de ellos.
  const health =
    resumen.saldoPendiente > 0
      ? { cls: "text-[var(--data-warning)]", Icon: Clock, text: `Te faltan ${fmtMonedas(saldoMap)} por recuperar.` }
      : hayExcedente
        ? { cls: "text-[var(--data-info)]", Icon: Coins, text: `Te entregaron ${fmtMonedas(excedenteMap)} de más.` }
        : { cls: "text-[var(--data-success)]", Icon: CheckCircle, text: "Todo al día — nadie te debe nada." };

  /* Donut de "% recuperado": una sola dona en vez de dos categorías — el
     resto (surface-sunken) es sólo el fondo del medidor, no una segunda
     serie que compita en el tooltip. */
  const donutData = [
    { name: "Recuperado", value: pct, color: "var(--data-success)" },
    { name: "Pendiente", value: 100 - pct, color: "var(--surface-sunken)" },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Lo que se mira primero: el saldo, cuánto volvió y los indicadores. */}
      <section aria-labelledby={tituloId} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <SectionTitle id={tituloId}>Saldo pendiente</SectionTitle>
              <InfoTip
                title="Saldo pendiente"
                what="Lo que te deben de los adelantos que diste y siguen abiertos, por moneda."
                affects="Lo que te dieron a ti (te pagaron antes o te prestaron) no entra: está en «Le debes», dentro de Indicadores."
                example="Diste S/ 1,000 y te entregaron S/ 400 en madera: el saldo es S/ 600."
              />
            </div>
            <div className="mt-1 text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">{fmtMonedas(saldoMap)}</div>
            <div className={`mt-2 flex items-center gap-2 text-base font-semibold ${health.cls}`}>
              <health.Icon className="h-5 w-5 shrink-0" />
              <span>{health.text}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:w-[24rem] sm:shrink-0 sm:border-l sm:border-[var(--rule-soft)] sm:pl-6">
            <div className="relative h-[120px] w-[120px] shrink-0">
              <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} minWidth={0} width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={56}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{pct}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-base font-extrabold text-[var(--text-primary)]">Recuperación de adelantos</span>
              <div className="mt-1 text-base text-[var(--text-secondary)]">
                Recuperaste <span className="whitespace-nowrap font-bold text-[var(--text-primary)]">{fmtMonedas(liquidadoMap)}</span> de{" "}
                <span className="whitespace-nowrap font-bold text-[var(--text-primary)]">{fmtMonedas(adelantadoMap)}</span> adelantados.
              </div>
            </div>
          </div>
        </div>

        <IndicadoresResumen
          adelantadoMap={adelantadoMap}
          liquidadoMap={liquidadoMap}
          leDebesMap={leDebesMap}
          porDevolverMap={porDevolverMap}
          excedenteMap={excedenteMap}
          hayLeDebes={hayLeDebes}
          hayPorDevolver={hayPorDevolver}
          hayExcedente={hayExcedente}
          abiertos={resumen.adelantosAbiertos}
          liquidados={resumen.adelantosLiquidados}
          personas={resumen.beneficiarios}
          onGoTab={onGoTab}
        />
      </section>

      {/* 2. Los dos avisos juntos: lo que ya se escapó y lo que vence esta semana. */}
      <SinControl datos={resumen.sinControl} onChange={onChange} />
      <ProximosVencimientos adelantos={adelantos} />

      {/* 3. Quién te debe — deudores ordenados por urgencia real. */}
      <QuienTeDebe deudores={deudores} saldoMap={saldoMap} onGoTab={onGoTab} />

      {/* 4. El detalle: la cuenta de cada persona (adelantos + forestal). */}
      <CuentasPorPersona onGoTab={onGoTab} />
    </div>
  );
}
