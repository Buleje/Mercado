"use client";

/**
 * Debajo de «Impuestos del mes», plegado: EL AÑO. Cada mes en una fila con la
 * misma cuenta que la vista del mes (ingresos de Mi Plata + IGV registrado) y
 * en qué quedó su declaración.
 *
 * Antes (medido 11-10) repetía la vista del mes con otro selector de mes y
 * otra cifra: IGV y Renta salían de ×18 % sobre los pedidos web (sin el POS),
 * con su propia cabecera, un aviso de estimación, tarjetas por tributo y la
 * lista PLAME / Renta anual en párrafos. Lo del mes vive arriba; acá, el año.
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { MESES } from "./impuestos/impuestos-del-mes";
import { useConfigTributaria, useDeclaraciones, type EstadoDeclaracion } from "./impuestos/use-impuestos";
import { useAnioTributario } from "./impuestos/use-anio-tributario";

const ESTADO: Record<EstadoDeclaracion, { rotulo: string; clase: string }> = {
  pendiente: { rotulo: "Pendiente", clase: "text-[var(--data-warning-ink)]" },
  presentada: { rotulo: "Presentada", clase: "text-[var(--text-primary)]" },
  pagada: { rotulo: "Pagada", clase: "text-[var(--data-success-ink)]" },
};

const NUM = "text-right tabular-nums";

export default function ObligacionesTab() {
  const hoy = limaDateKey().slice(0, 7);
  const anioActual = Number(hoy.slice(0, 4));
  const [anio, setAnio] = useState(anioActual);
  const { regimen } = useConfigTributaria();
  const declaraciones = useDeclaraciones(anio);
  const estado = useAnioTributario(anio, hoy, regimen);

  const totales = estado.fase === "lista"
    ? estado.meses.reduce((t, m) => ({ ingresos: t.ingresos + m.ingresos, igv: t.igv + m.calculo.igvAPagar, renta: t.renta + m.calculo.renta, total: t.total + m.calculo.total }), { ingresos: 0, igv: 0, renta: 0, total: 0 })
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="impuestos-anio">Año</label>
        <select
          id="impuestos-anio"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        >
          {[anioActual, anioActual - 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-sm text-[var(--text-secondary)]">Formulario 621 de cada mes</span>
        <InfoTip
          title="El año"
          what="La misma cuenta que «Impuestos del mes», mes por mes, y si marcaste la declaración presentada o pagada."
          affects="Otras declaraciones: PLAME (sólo si tienes trabajadores en planilla: ESSALUD 9 %, ONP/AFP) y la Renta anual (marzo o abril del año siguiente, sobre la renta neta del ejercicio; no se estima acá)."
          example="Marcas octubre como pagada en «Impuestos del mes» y acá la fila de octubre dice «Pagada»."
        />
      </div>

      {estado.fase === "cargando" ? (
        <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Armando el año…
        </p>
      ) : estado.fase === "error" ? (
        <p role="alert" className="flex items-center gap-2 py-6 text-sm text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4" aria-hidden /> No se pudieron leer los ingresos del año.
        </p>
      ) : (
        <DataTable className="min-w-[34rem]">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right">Ingresos</th>
              <th className="text-right">IGV</th>
              <th className="text-right">Renta</th>
              <th className="text-right">A pagar</th>
              <th>Declaración</th>
            </tr>
          </thead>
          <tbody>
            {estado.meses.map(({ mes, ingresos, calculo }) => {
              const e = ESTADO[declaraciones.estadoDe(mes)];
              const sinIgv = calculo.lecturaIgv?.tipo !== "registrado";
              return (
                <tr key={mes} className={mes === hoy ? "bg-[var(--accent-soft)]" : undefined}>
                  <td className="capitalize text-[var(--text-primary)]">{MESES[Number(mes.slice(5, 7)) - 1]}</td>
                  <td className={cn(NUM, "text-[var(--text-secondary)]")}>{formatCurrency(ingresos)}</td>
                  <td className={cn(NUM, sinIgv ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>{sinIgv ? "—" : formatCurrency(calculo.igvAPagar)}</td>
                  <td className={cn(NUM, "text-[var(--text-primary)]")}>{calculo.esNrus ? "Cuota fija" : formatCurrency(calculo.renta)}</td>
                  <td className={cn(NUM, "font-bold text-[var(--text-primary)]")}>{formatCurrency(calculo.total)}</td>
                  <td className={cn("text-sm font-semibold", e.clase)}>{e.rotulo}</td>
                </tr>
              );
            })}
          </tbody>
          {totales && (
            <tfoot>
              <tr className="font-bold">
                <td className="text-[var(--text-primary)]">Total {anio}</td>
                <td className={cn(NUM, "text-[var(--text-primary)]")}>{formatCurrency(totales.ingresos)}</td>
                <td className={cn(NUM, "text-[var(--text-primary)]")}>{formatCurrency(totales.igv)}</td>
                <td className={cn(NUM, "text-[var(--text-primary)]")}>{formatCurrency(totales.renta)}</td>
                <td className={cn(NUM, "text-[var(--text-primary)]")}>{formatCurrency(totales.total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </DataTable>
      )}
    </div>
  );
}
