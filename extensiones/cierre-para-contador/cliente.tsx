"use client";

/**
 * Pieza `cierre-para-contador` — la vista de la pestaña «A medida».
 * Un mes, un botón, un Excel. Lo que dice cada columna sale de las opciones.
 */
import { useState } from "react";
import { FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2 } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { limaDateKey } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { OpcionesCierreParaContador } from "./manifest";
import { useCierre } from "./use-cierre";
import { ROTULO_GASTO, ROTULO_VENTA } from "./columnas";

export default function CierreParaContador({ opciones }: { opciones: OpcionesCierreParaContador }) {
  const [mes, setMes] = useState(() => limaDateKey().slice(0, 7));
  const { estado, descargar } = useCierre(opciones);
  const bajando = estado.fase === "bajando";

  return (
    <section className="space-y-5" data-pieza="cierre-para-contador">
      <div className="flex items-center gap-2">
        <SectionTitle>
          {opciones.contador ? `Cierre del mes para ${opciones.contador}` : "Cierre del mes para el contador"}
        </SectionTitle>
        <InfoTip
          title="Cierre del mes"
          what="Baja un Excel con las ventas y los gastos del mes que elijas, con las columnas que pidió tu contador."
          affects="Sólo lee: no cambia ninguna venta ni gasto."
          example="Eliges septiembre, tocas «Descargar Excel» y recibes cierre-2026-09.xlsx con una hoja de ventas y otra de gastos."
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
          Mes
          <input
            type="month"
            value={mes}
            max={limaDateKey().slice(0, 7)}
            onChange={(e) => setMes(e.target.value)}
            className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none sm:w-52"
          />
        </label>
        <button
          type="button"
          disabled={bajando || !mes}
          onClick={() => void descargar(mes)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-dark)] px-5 text-base font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {bajando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-5 w-5" aria-hidden />}
          {bajando ? "Armando el Excel…" : "Descargar Excel"}
        </button>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {estado.fase === "listo" && (
          <p className="inline-flex items-center gap-2 font-medium text-[var(--data-success-700)]">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Listo: {formatNumber(estado.ventas)} {estado.ventas === 1 ? "venta" : "ventas"}
            {opciones.incluirGastos && <> y {formatNumber(estado.gastos)} {estado.gastos === 1 ? "gasto" : "gastos"}</>}.
          </p>
        )}
        {estado.fase === "vacio" && (
          <p className="text-[var(--text-secondary)]">No hay ventas ni gastos en ese mes. No bajé ningún archivo.</p>
        )}
        {estado.fase === "error" && (
          <p role="alert" className="inline-flex items-center gap-2 font-medium text-[var(--data-error-700)]">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {estado.mensaje}
          </p>
        )}
      </div>

      <dl className="grid gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold text-[var(--text-primary)]">Hoja «Ventas»</dt>
          <dd className="mt-1 text-[var(--text-secondary)]">{opciones.columnasVentas.map((c) => ROTULO_VENTA[c]).join(" · ")}</dd>
        </div>
        {opciones.incluirGastos && (
          <div>
            <dt className="font-bold text-[var(--text-primary)]">Hoja «Gastos»</dt>
            <dd className="mt-1 text-[var(--text-secondary)]">{opciones.columnasGastos.map((c) => ROTULO_GASTO[c]).join(" · ")}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
