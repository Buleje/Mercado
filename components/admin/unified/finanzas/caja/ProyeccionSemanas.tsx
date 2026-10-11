"use client";

/**
 * Los conceptos de la proyección de 13 semanas y su tabla de detalle. El
 * servidor recompone todo (`lib/finance/cashflow-rolling.ts`); acá se
 * rotula lo que no es dato duro:
 *  - el saldo inicial dice de dónde sale (cuentas de tesorería, o ≈ ventas
 *    menos gastos de 30 días);
 *  - la planilla ausente es «—», nunca «S/ NaN» (quien no ve RRHH no la recibe);
 *  - los adelantos que vencen se informan y NO entran en el saldo final;
 *  - lo que no tiene fecha no se reparte en semanas: va en una línea aparte.
 */

import { DataTable } from "@buleje/design-system";
import { TrendingDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { cn, limaDateKey } from "@/lib/utils";
import type { ProyeccionDeCaja, SemanaProyectada } from "@/hooks/use-caja-del-negocio";
import { montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";

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

export function filas(d: ProyeccionDeCaja): Fila[] {
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

/**
 * El detalle por concepto: un renglón por concepto, una columna por semana.
 * Vive plegado debajo de «Semana a semana» (la lista compacta): es para quien
 * quiere ver de dónde sale cada cierre.
 */
export default function ProyeccionSemanas({ d }: { d: ProyeccionDeCaja }) {
  return (
    <DataTable
      className="w-max min-w-full border-collapse text-sm [&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal"
      wrapperClassName="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <thead>
        <tr className="border-b border-[var(--rule-base)]">
          <th scope="col" className="sticky left-0 z-10 border-r border-[var(--rule-base)] bg-[var(--surface-sunken)] text-left text-sm">
            Concepto
          </th>
          {d.weeks.map((w) => (
            <th
              scope="col"
              key={w.weekNumber}
              className={cn("text-right text-sm whitespace-nowrap", w.isNegative && "text-[var(--data-error-ink)]")}
            >
              S{w.weekNumber} · {fechaCorta(limaDateKey(w.weekStart))}
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
                  "sticky left-0 z-10 border-r border-[var(--rule-base)] px-3 py-2.5 text-left text-sm font-bold whitespace-nowrap",
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
                      "text-right text-sm tabular-nums whitespace-nowrap",
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
  );
}
