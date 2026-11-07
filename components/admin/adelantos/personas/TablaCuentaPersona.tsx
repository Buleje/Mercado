"use client";

/** La cuenta corriente de una persona (ficha), con filtros tipo Excel en el encabezado. */

import { DataTable } from "@buleje/design-system";
import { TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { MovimientoCuenta } from "@/lib/adelantos/estado-cuenta";
import { formatDate } from "@/lib/format";
import { fmtMon } from "../shared";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { COLUMNAS_FILTRO_CUENTA_PERSONA } from "../filtros-columnas-tablas";

export default function TablaCuentaPersona({ movimientos }: { movimientos: MovimientoCuenta[] }) {
  const ft = useFiltrosTabla(movimientos, COLUMNAS_FILTRO_CUENTA_PERSONA);
  return (
    <>
      <BarraFiltrosTabla f={ft} />
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        {/* min-w-[560px] es clase muerta acá (memoria min-width-utilities-muertas). */}
        <DataTable className="w-full" style={{ minWidth: 560 }}>
          <thead className="[&_th]:align-top">
            <tr>
              <ThColumna ids={["fecha"]} label="Fecha" f={ft} />
              <ThColumna ids={["concepto"]} label="Concepto" f={ft} />
              <ThColumna ids={["monto"]} label="Monto" f={ft} derecha />
              <ThColumna ids={["saldo"]} label="Saldo" f={ft} derecha />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {ft.filtradas.length === 0 && <SinCoincidenciasFila colSpan={4} />}
            {ft.filtradas.map((m, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{formatDate(m.fecha)}</td>
                <td>
                  <span className="flex items-center gap-2">
                    {m.monto >= 0 ? (
                      <TrendingDown className="h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden />
                    ) : (
                      <TrendingUp className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />
                    )}
                    <span className="text-[var(--text-primary)]">{m.concepto}</span>
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap text-right font-bold tabular-nums ${
                    m.monto >= 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"
                  }`}
                >
                  {m.monto >= 0 ? "+" : "−"}
                  {fmtMon(Math.abs(m.monto), m.moneda)}
                </td>
                <td className="whitespace-nowrap text-right font-bold tabular-nums">
                  {/* Negativo = el negocio le debe (ADR-448): «S/ -30.00» no se lee como plata. */}
                  {m.saldo < -0.005 ? (
                    <span className="text-[var(--data-info-ink)]">le debes {fmtMon(-m.saldo, m.moneda)}</span>
                  ) : (
                    fmtMon(m.saldo, m.moneda)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </>
  );
}
