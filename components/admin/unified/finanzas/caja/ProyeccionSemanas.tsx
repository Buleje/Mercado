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

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { TrendingDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { cn, limaDateKey } from "@/lib/utils";
import type { ProyeccionDeCaja, SemanaProyectada } from "@/hooks/use-caja-del-negocio";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "@/components/admin/forestal/filtros-tabla-forestal";
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

/* Matriz de conceptos × semanas: el filtro útil es elegir qué conceptos ver. */
const COLUMNAS_FILTRO: readonly ColumnaFiltro<Fila>[] = [
  { id: "concepto", label: "Concepto", tipo: "multi", valor: (f) => f.label },
];

/**
 * El detalle por concepto: un renglón por concepto, una columna por semana.
 * Vive plegado debajo de «Semana a semana» (la lista compacta): es para quien
 * quiere ver de dónde sale cada cierre.
 */
export default function ProyeccionSemanas({ d }: { d: ProyeccionDeCaja }) {
  /* El estilo de la tabla es el de `DataTable` (Brandon 11-10: «un solo estilo
     de tabla»). Lo único propio: la 1.ª columna queda fija al desplazar las 13
     semanas (sticky + su fondo, o se transparenta) y el color de cada cifra,
     que dice si entra o sale, va en el texto y no en la celda. */
  const todas = useMemo(() => filas(d), [d]);
  const f = useFiltrosTabla(todas, COLUMNAS_FILTRO);
  return (
    <>
    <BarraFiltrosTabla vistas="proyeccion-caja" f={f} />
    <DataTable className="w-max min-w-full">
      <thead>
        <tr>
          <th scope="col" className="sticky left-0 z-30">
            Concepto
            <FiltroEnCabecera id="concepto" f={f} compacto />
          </th>
          {d.weeks.map((w) => (
            <th scope="col" key={w.weekNumber} className="text-right whitespace-nowrap">
              <span className={w.isNegative ? "text-[var(--data-error-ink)]" : undefined}>
                S{w.weekNumber} · {fechaCorta(limaDateKey(w.weekStart))}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={d.weeks.length + 1} />}
        {f.filtradas.map((fila) => {
          const total = fila.tono === "total";
          return (
            <tr key={fila.clave}>
              <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface-raised)] text-left">
                <span className={cn("inline-flex items-center gap-1", total && "font-bold", fila.tono === "informa" && "italic")}>
                  <span className="text-[var(--text-tertiary)]">{fila.signo}</span>
                  <span>{fila.label}</span>
                  {fila.ayuda && <InfoTip title={fila.label} what={fila.ayuda} />}
                </span>
              </th>
              {d.weeks.map((w) => {
                const v = valor(w, fila.clave);
                const rojo = total && w.closingBalance < 0;
                return (
                  <td key={w.weekNumber} className="text-right tabular-nums whitespace-nowrap">
                    <span
                      className={cn(
                        fila.tono === "entra" && "text-[var(--data-success-ink)]",
                        fila.tono === "sale" && "text-[var(--data-error-ink)]",
                        (fila.tono === "neutro" || fila.tono === "informa") && "text-[var(--text-secondary)]",
                        total && "font-bold",
                        rojo && "text-[var(--data-error-ink)]",
                      )}
                    >
                      {montoTexto(v)}
                      {rojo && <TrendingDown className="ml-1 inline-block h-4 w-4" aria-label="saldo negativo" />}
                    </span>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </DataTable>
    </>
  );
}
