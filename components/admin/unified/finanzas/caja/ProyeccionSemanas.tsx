"use client";

/**
 * Las próximas 13 semanas: un renglón por concepto, una columna por semana.
 * El servidor recompone todo (`lib/finance/cashflow-rolling.ts`); acá se
 * rotula lo que no es dato duro:
 *  - el saldo inicial dice de dónde sale (cuentas de tesorería, o ≈ ventas
 *    menos gastos de 30 días);
 *  - la planilla ausente es «—», nunca «S/ NaN» (quien no ve RRHH no la recibe);
 *  - los adelantos que vencen se informan y NO entran en el saldo final;
 *  - lo que no tiene fecha no se reparte en semanas: va en una línea aparte.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { TrendingDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateShort, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProyeccionDeCaja, SemanaProyectada } from "@/hooks/use-caja-del-negocio";
import { montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import SemanasEnLista from "./SemanasEnLista";

export type Clave =
  | "openingBalance"
  | "expectedCollections"
  | "creditCollections"
  | "supplierPayments"
  | "payroll"
  | "loans"
  | "otherExpenses"
  | "advanceCollections"
  | "closingBalance";

export interface Fila {
  clave: Clave;
  label: string;
  signo: "+" | "−" | "=" | "·";
  tono: "neutro" | "entra" | "sale" | "total" | "informa";
  ayuda?: string;
}

function filas(d: ProyeccionDeCaja): Fila[] {
  const planilla =
    d.payrollFuente === "sin_permiso"
      ? "No tienes acceso a la planilla."
      : d.payrollFuente === "sin_dato"
        ? "No hay gastos de «personal» en los últimos 30 días: la planilla va en cero."
        : `≈ El promedio semanal de tus gastos de «personal» de los últimos 30 días.${
            d.payrollRrhhSemanal != null ? ` Según la asistencia de Recursos Humanos: ≈ ${montoTexto(d.payrollRrhhSemanal)} por semana.` : ""
          }`;
  const cierre = d.cierreSinNomina
    ? "Este saldo no resta la planilla."
    : d.payrollFuente === "sin_permiso"
      ? "Este saldo ya resta la planilla, aunque no la veas."
      : undefined;
  const hayAdelantos = d.weeks.some((w) => w.advanceCollections != null);
  return [
    { clave: "openingBalance", label: "Saldo inicial", signo: "=", tono: "neutro" },
    { clave: "expectedCollections", label: "Cobros esperados", signo: "+", tono: "entra" },
    { clave: "creditCollections", label: "Cobros de fiados", signo: "+", tono: "entra" },
    { clave: "supplierPayments", label: "Pagos a proveedores", signo: "−", tono: "sale" },
    { clave: "payroll", label: "Planilla", signo: "−", tono: "sale", ayuda: planilla },
    { clave: "loans", label: "Cuotas de préstamos", signo: "−", tono: "sale" },
    { clave: "otherExpenses", label: "Otros gastos fijos", signo: "−", tono: "sale" },
    ...(hayAdelantos
      ? [
          {
            clave: "advanceCollections" as const,
            label: "Adelantos que vencen",
            signo: "·" as const,
            tono: "informa" as const,
            ayuda: "Adelantos que diste y vencen esa semana. Se muestran para que los cobres; no suman al saldo final.",
          },
        ]
      : []),
    {
      clave: "closingBalance",
      label: d.cierreSinNomina ? "Saldo final (sin la planilla)" : "Saldo final",
      signo: "=",
      tono: "total",
      ayuda: cierre,
    },
  ];
}

export const valor = (w: SemanaProyectada, c: Clave): number | null => {
  const v = w[c];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export default function ProyeccionSemanas({ d }: { d: ProyeccionDeCaja }) {
  const sanas = d.weeks.filter((w) => !w.isNegative).length;
  const saldo = d.saldoInicial;
  const saldoEstimado = saldo?.estimado ?? false;
  const sf = d.sinFecha;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-bold" as="h3">
              {saldo?.fuente === "neto_30_dias" ? "Saldo de hoy, estimado" : saldo ? "Saldo de hoy en tus cuentas" : "Saldo de hoy"}
            </CardTitle>
            <InfoTip
              title="De dónde sale el saldo de hoy"
              what={
                saldo?.fuente === "neto_30_dias"
                  ? "No hay cuentas cargadas en Tesorería: se estima con lo que vendiste menos lo que gastaste en los últimos 30 días."
                  : "La suma de tus cuentas en Tesorería."
              }
              affects="Es el punto de partida de las 13 semanas."
            />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {montoTexto(saldo?.monto ?? d.startingBalance, { aproximado: saldoEstimado })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-[var(--text-secondary)]">Semanas sanas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {sanas} / {d.weeks.length}
          </p>
        </div>
      </div>

      <DataTable
        className="w-max min-w-full border-collapse text-sm"
        wrapperClassName="hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:block"
      >
        <thead>
          <tr className="border-b border-[var(--rule-base)]">
            <th scope="col" className="sticky left-0 z-10 border-r border-[var(--rule-base)] bg-[var(--surface-sunken)] text-left">
              Concepto
            </th>
            {d.weeks.map((w) => (
              <th
                scope="col"
                key={w.weekNumber}
                className={cn("text-right whitespace-nowrap", w.isNegative && "text-[var(--data-error-ink)]")}
              >
                S{w.weekNumber} · {formatDateShort(w.weekStart)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas(d).map((f) => {
            const total = f.tono === "total";
            return (
              <tr key={f.clave} className={cn("border-b border-[var(--rule-soft)]", total && "border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]")}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 border-r border-[var(--rule-base)] px-3 py-2.5 text-left text-xs font-bold whitespace-nowrap",
                    total ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--surface-raised)] text-[var(--text-secondary)]",
                    f.tono === "informa" && "italic",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[var(--text-tertiary)]">{f.signo}</span>
                    <span>{f.label}</span>
                    {f.ayuda && <InfoTip title={f.label} what={f.ayuda} />}
                  </span>
                </th>
                {d.weeks.map((w) => {
                  const v = valor(w, f.clave);
                  const rojo = total && w.closingBalance < 0;
                  return (
                    <td
                      key={w.weekNumber}
                      className={cn(
                        "text-right text-xs tabular-nums whitespace-nowrap",
                        f.tono === "entra" && "text-[var(--data-success-ink)]",
                        f.tono === "sale" && "text-[var(--data-error-ink)]",
                        f.tono === "neutro" && "text-[var(--text-secondary)]",
                        f.tono === "informa" && "text-[var(--text-secondary)]",
                        total && (rojo ? "font-bold text-[var(--data-error-ink)] bg-[var(--data-error-500)]/10" : "font-bold text-[var(--text-primary)]"),
                      )}
                    >
                      {montoTexto(v)}
                      {rojo && <TrendingDown className="ml-1 inline-block h-3 w-3" aria-label="saldo negativo" />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      {/* En el celular, la tabla de 9 conceptos × 13 semanas se volvía 117 renglones de tarjetas: una línea por semana. */}
      <SemanasEnLista d={d} filas={filas(d)} />

      {(sf && (sf.cuantosPorCobrar > 0 || sf.cuantosPorPagar > 0)) || (d.adelantosConVencimiento?.cuantos ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
          {sf && sf.cuantosPorCobrar > 0 && (
            <span className="tabular-nums">
              <strong className="font-semibold text-[var(--text-primary)]">Sin fecha, te deben</strong> {montoTexto(sf.porCobrar)} ·{" "}
              {formatNumber(sf.cuantosPorCobrar, 0)} {sf.cuantosPorCobrar === 1 ? "pendiente" : "pendientes"}
            </span>
          )}
          {sf && sf.cuantosPorPagar > 0 && (
            <span className="tabular-nums">
              <strong className="font-semibold text-[var(--text-primary)]">Vencido, debes</strong> {montoTexto(sf.porPagar)} ·{" "}
              {formatNumber(sf.cuantosPorPagar, 0)} {sf.cuantosPorPagar === 1 ? "pendiente" : "pendientes"}
            </span>
          )}
          {d.adelantosConVencimiento && d.adelantosConVencimiento.cuantos > 0 && (
            <span className="tabular-nums">
              <strong className="font-semibold text-[var(--text-primary)]">Adelantos que vencen en 13 semanas</strong>{" "}
              {montoTexto(d.adelantosConVencimiento.monto)} · {formatNumber(d.adelantosConVencimiento.cuantos, 0)}{" "}
              {d.adelantosConVencimiento.cuantos === 1 ? "adelanto" : "adelantos"}
            </span>
          )}
          <InfoTip
            title="Lo que no cae en ninguna semana"
            what="Lo que no tiene fecha pactada o ya venció antes de hoy no se reparte en las semanas: se muestra acá."
            affects="No suma al saldo final de ninguna semana."
          />
        </div>
      ) : null}
    </div>
  );
}
