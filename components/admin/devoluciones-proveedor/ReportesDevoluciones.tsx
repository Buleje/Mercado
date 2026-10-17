"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { formatMonthYear } from "@/lib/format";
import type { Devolucion } from "./tipos";

const DevolucionesChart = dynamic(() => import("../DevolucionesChart"), {
  ssr: false,
  loading: () => <div className="h-44 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />,
});

function Barras({ titulo, filas, color }: { titulo: string; filas: Array<[string, number]>; color: string }) {
  const max = filas[0]?.[1] ?? 1;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">{titulo}</p>
      <div className="space-y-1.5">
        {filas.map(([nombre, total]) => (
          <div key={nombre}>
            <div className="mb-0.5 flex items-center justify-between">
              <span className="truncate text-sm text-[var(--text-primary)]">{nombre}</span>
              <span className="ml-2 text-sm font-bold text-[var(--text-primary)]">{total}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(total / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function top(cuentas: Record<string, number>, n: number): Array<[string, number]> {
  return Object.entries(cuentas).sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Gráfico por mes y los 5 motivos y proveedores que más devuelven: dentro de Indicadores. */
export function ReportesDevoluciones({ devoluciones }: { devoluciones: Devolucion[] }) {
  const { porMes, motivos, proveedores } = useMemo(() => {
    const meses: Record<string, number> = {};
    const mot: Record<string, number> = {};
    const prov: Record<string, number> = {};
    for (const d of devoluciones) {
      const mes = formatMonthYear(d.createdAt);
      meses[mes] = (meses[mes] ?? 0) + 1;
      const m = d.motivo.length > 20 ? `${d.motivo.slice(0, 18)}…` : d.motivo;
      mot[m] = (mot[m] ?? 0) + 1;
      prov[d.proveedorNombre] = (prov[d.proveedorNombre] ?? 0) + 1;
    }
    return {
      porMes: Object.entries(meses).map(([mes, total]) => ({ mes, total })).slice(-6),
      motivos: top(mot, 5),
      proveedores: top(prov, 5),
    };
  }, [devoluciones]);

  if (devoluciones.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 md:grid-cols-3">
      <DevolucionesChart data={porMes} />
      <Barras titulo="Motivos más frecuentes" filas={motivos} color="bg-secondary" />
      <Barras titulo="Proveedores con más devoluciones" filas={proveedores} color="bg-primary" />
    </div>
  );
}
