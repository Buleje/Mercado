"use client";

/**
 * PnlHero — la pregunta de negocio en una tarjeta: ¿la plataforma gana o pierde?
 * Todo el cálculo viene del servidor (`pnl` de /api/superadmin/platform-expenses):
 * lo COBRADO de verdad (vouchers aprobados), el MRR ESTIMADO de los planes que
 * pagan hoy, el gasto registrado y la infra estimada. Cobrado y MRR van con
 * rótulos distintos: uno es plata que entró, el otro precio de lista.
 * Brandon 2026-06-30 · plata real 2026-10-09.
 */

import { TrendingUp, TrendingDown, Target } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PnlPlataforma } from "@/lib/billing/mrr-plataforma";
import { fmtPen } from "./gastos-helpers";

const firmado = (n: number) => `${n >= 0 ? "+" : "−"}${fmtPen(Math.abs(n))}`;

export function PnlHero({ pnl, loading = false }: { pnl: PnlPlataforma | null; loading?: boolean }) {
  if (!pnl && loading) {
    // Mientras carga, esqueleto: antes salía «No pudimos calcular…» en cada apertura.
    return (
      <section
        aria-busy="true"
        aria-label="Calculando el resultado del mes"
        className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6"
      >
        <div className="flex animate-pulse flex-col gap-5 lg:flex-row lg:justify-between">
          <div className="space-y-2 lg:w-64">
            <div className="h-3 w-40 rounded bg-[var(--rule-soft)]" />
            <div className="h-9 w-36 rounded bg-[var(--rule-soft)]" />
            <div className="h-3 w-48 rounded bg-[var(--rule-soft)]" />
          </div>
          <div className="flex-1 space-y-3">
            <div className="h-3 w-full rounded bg-[var(--rule-soft)]" />
            <div className="h-3 w-5/6 rounded bg-[var(--rule-soft)]" />
            <div className="h-3 w-2/3 rounded bg-[var(--rule-soft)]" />
          </div>
        </div>
      </section>
    );
  }
  if (!pnl) {
    return (
      <section className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 text-sm text-[var(--text-secondary)]">
        No pudimos calcular el resultado del mes. Toca «Actualizar».
      </section>
    );
  }
  const { ingresos, gastos } = pnl;
  const gana = pnl.resultadoCobradoPen >= 0;
  const accent = gana ? "var(--data-success-600)" : "var(--data-error-600)";
  const infraSumada = gastos.infraEstimadaSumada ? (gastos.infraEstimadaPen ?? 0) : 0;
  const scale = Math.max(ingresos.cobradoPen, ingresos.mrrEstimadoPen, gastos.totalPen, 1);
  const eq = pnl.puntoDeEquilibrio;

  return (
    <section className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
        {/* Veredicto con la plata que entró */}
        <div className="min-w-0 lg:max-w-xs">
          <div className="flex items-center gap-1.5">
            <Kicker>Resultado del mes · con lo cobrado</Kicker>
            <InfoTip
              title="Resultado del mes"
              what="Lo cobrado este mes (vouchers aprobados) menos el gasto del mes: el registrado más la infra estimada si no registraste infra."
              example="Cobraste S/ 179 y gastaste S/ 40 → +S/ 139."
            />
          </div>
          <p className="mt-1 font-display text-4xl font-extrabold tabular-nums" style={{ color: accent }}>
            {firmado(pnl.resultadoCobradoPen)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: accent }}>
            {gana ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {ingresos.cobradoPen > 0 ? `${ingresos.pagosCobrados} pago(s) cobrados` : "Aún no cobraste este mes"}
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Con el MRR estimado:{" "}
            <span className="font-bold tabular-nums text-[var(--text-primary)]">{firmado(pnl.resultadoMrrPen)}</span>/mes
          </p>
        </div>

        {/* Ingresos vs gasto (barras comparativas) */}
        <div className="flex-1 space-y-3 lg:px-6">
          <Bar
            label="Cobrado este mes"
            info="Vouchers de pago APROBADOS cuyo pago se subió este mes. Es plata que entró."
            value={ingresos.cobradoPen}
            scale={scale}
            color="var(--accent)"
          />
          <Bar
            label="MRR estimado"
            info={`Precio de lista de las ${ingresos.tiendasQuePagan} tienda(s) que pagan hoy. Las ${ingresos.tiendasEnPrueba} en prueba cuentan S/ 0.`}
            value={ingresos.mrrEstimadoPen}
            scale={scale}
            color="var(--data-info-500)"
          />
          <Bar
            label="Gasto del mes"
            info={
              gastos.infraEstimadaSumada
                ? `Registrado ${fmtPen(gastos.registradoPen)} + infra estimada ${fmtPen(infraSumada)} (estimado: aún no registraste infra este mes).`
                : `Lo que registraste en Registro.${gastos.infraEstimadaPen !== null ? ` La infra estimada (${fmtPen(gastos.infraEstimadaPen)}) no se suma: ya registraste infra este mes.` : ""}`
            }
            value={gastos.totalPen}
            scale={scale}
            color="var(--text-secondary)"
            nota={gastos.infraEstimadaSumada ? `incluye ${fmtPen(infraSumada)} de infra estimado` : undefined}
          />
        </div>

        {/* Punto de equilibrio */}
        <div className="flex items-center gap-3 rounded-lg bg-[var(--surface-sunken)] px-4 py-3 lg:max-w-[220px]">
          <Target className="h-8 w-8 shrink-0 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <div className="min-w-0">
            <Kicker>Punto de equilibrio</Kicker>
            {eq.tiendas === null ? (
              <p className="text-sm font-bold text-[var(--text-secondary)]">Sin gasto este mes</p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                <span className="font-display text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {eq.tiendas}
                </span>{" "}
                {eq.tiendas === 1 ? "tienda" : "tiendas"}
                {eq.ticketEsReferencia ? ` en plan ${eq.planReferencia} (${fmtPen(eq.ticketPen)})` : " que pagan"}
                {eq.tiendas === 1 ? " cubre" : " cubren"} el gasto{" "}
                <span className="text-[var(--text-tertiary)]">(hoy {ingresos.tiendasQuePagan})</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bar({
  label,
  info,
  value,
  scale,
  color,
  nota,
}: {
  label: string;
  info: string;
  value: number;
  scale: number;
  color: string;
  nota?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1">
          <span className="text-sm font-bold text-[var(--text-secondary)]">{label}</span>
          <InfoTip title={label} what={info} />
        </span>
        <span className="tabular-nums text-sm font-extrabold text-[var(--text-primary)]">{fmtPen(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--rule-base)]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, (value / scale) * 100)}%`, background: color }} />
      </div>
      {nota && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{nota}</p>}
    </div>
  );
}
