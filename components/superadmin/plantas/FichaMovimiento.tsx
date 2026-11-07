"use client";

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { TendenciaMes } from "@/lib/db/forest-ctp.db";
import type { MovimientoPeriodo } from "@/lib/superadmin/plantas-forestales/tipos";
import { SinLectura } from "./cifras";
import { m3, pct } from "./formato";

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const mesCorto = (ym: string) => {
  const [y, mm] = ym.split("-");
  return `${MESES[Number(mm)] ?? mm} ${y?.slice(2) ?? ""}`;
};

function Cifra({ titulo, valor, nota, alerta }: { titulo: string; valor: ReactNode; nota?: ReactNode; alerta?: boolean }) {
  return (
    <div className={alerta ? "rounded-xl border border-[var(--data-warning)] bg-[var(--data-warning-50)] p-3" : "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3"}>
      <dt className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">{titulo}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-[var(--text-primary)]">{valor}</dd>
      {nota && <dd className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">{nota}</dd>}
    </div>
  );
}

const corridas = (n: number) => `${n} ${n === 1 ? "corrida" : "corridas"}`;

function Periodo({ mov }: { mov: MovimientoPeriodo }) {
  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      <Cifra titulo="Entró rolliza" valor={m3(mov.ingresoM3)} nota={`${mov.ingresosCount} ${mov.ingresosCount === 1 ? "guía" : "guías"}`} />
      <Cifra titulo="Consumida en corridas" valor={m3(mov.consumidoM3)} />
      <Cifra titulo="Despachada en rollo" valor={m3(mov.despachadoDirectoM3)} />
      <Cifra titulo="Saldo de rolliza" valor={m3(mov.saldoM3)} alerta={mov.saldoM3 < 0} nota={mov.saldoM3 < 0 ? "Negativo: salió más de lo que entró" : undefined} />
      <Cifra titulo="Pendiente" valor={m3(mov.pendienteM3)} />
      <Cifra titulo="Aserrada producida" valor={m3(mov.producidoM3)} />
      <Cifra titulo="Aserrada despachada" valor={m3(mov.despachadoM3)} />
      <Cifra titulo="Rendimiento" valor={pct(mov.rendimientoPct)} />
      <Cifra
        titulo="Consumo sin origen"
        valor={m3(mov.consumoSinOrigen.m3)}
        nota={corridas(mov.consumoSinOrigen.corridas)}
        alerta={mov.consumoSinOrigen.corridas > 0}
      />
      <Cifra
        titulo="Consumo sin declarar"
        valor={m3(mov.consumoSinDeclarar.m3)}
        nota={corridas(mov.consumoSinDeclarar.corridas)}
        alerta={mov.consumoSinDeclarar.corridas > 0}
      />
    </dl>
  );
}

function Tendencia({ tendencia }: { tendencia: TendenciaMes[] }) {
  if (tendencia.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay meses con movimiento.</p>;
  // Sin consumo el rendimiento no existe: se deja el hueco, no un 0.
  const data = tendencia.map((t) => ({
    mes: mesCorto(t.mes),
    Ingresado: Math.round(t.ingresoM3 * 1000) / 1000,
    Consumido: Math.round(t.consumidoM3 * 1000) / 1000,
    ...(t.consumidoM3 > 0 ? { Rendimiento: Math.round(t.rendimiento * 10) / 10 } : {}),
  }));
  return (
    <BulejeComposedChart
      data={data}
      xKey="mes"
      bars={[
        { key: "Ingresado", label: "Entró (m³)", color: "accent", yAxis: "left" },
        { key: "Consumido", label: "Consumida (m³)", color: "amber", yAxis: "left" },
      ]}
      lines={[{ key: "Rendimiento", label: "Rendimiento (%)", color: "purple", yAxis: "right" }]}
      height={260}
      leftAxisFormat={(v) => formatNumber(v, 0)}
      rightAxisFormat={(v) => `${formatNumber(v, 0)} %`}
      tooltipFormat={(v, nombre) => (nombre?.startsWith("Rendimiento") ? `${formatNumber(Number(v), 1)} %` : m3(Number(v)))}
      minDataPoints={1}
    />
  );
}

/** Movimiento del período elegido y cómo vino cada mes. */
export function FichaMovimiento({ movimiento, tendencia }: { movimiento: MovimientoPeriodo | null; tendencia: TendenciaMes[] }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>En el período</CardTitle>
          <InfoTip
            title="Movimiento del período"
            what="Lo que entró, se aserró y salió en las fechas elegidas, según su libro de operaciones."
            affects="«Sin origen»: corridas que consumieron rolliza sin decir de qué trozas. «Sin declarar»: corridas abiertas que ya consumieron y todavía no dicen qué aserrada salió."
          />
        </div>
        {movimiento ? <Periodo mov={movimiento} /> : <p className="text-sm"><SinLectura fuente="saldos" /></p>}
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <CardTitle>Mes a mes</CardTitle>
          <InfoTip title="Mes a mes" what="Rolliza que entró y que se consumió cada mes, con el rendimiento en la línea." example="Un rendimiento que salta de golpe puede ser producción declarada de más." />
        </div>
        <Tendencia tendencia={tendencia} />
      </section>
    </div>
  );
}
