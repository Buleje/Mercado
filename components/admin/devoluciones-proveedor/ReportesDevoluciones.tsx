"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatMonthYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import { medirDevoluciones } from "./medir-devoluciones";
import { soles, type Devolucion } from "./tipos";

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

/**
 * Gráfico por mes, los 5 motivos y proveedores que más devuelven y (C56) cuánto
 * se recupera por proveedor: dentro de Indicadores. Todo sobre el período del filtro.
 */
export function ReportesDevoluciones({ devoluciones, periodo }: { devoluciones: Devolucion[]; periodo: string }) {
  const { porMes, motivos, proveedores } = useMemo(() => {
    const meses: Record<string, number> = {};
    const mot: Record<string, number> = {};
    const prov: Record<string, number> = {};
    for (const d of devoluciones) {
      if (d.estado === "ANULADA") continue;
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
  const medida = useMemo(() => medirDevoluciones(devoluciones), [devoluciones]);
  const t = medida.total;

  if (devoluciones.length === 0) return null;
  return (
    <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <DevolucionesChart data={porMes} />
        <Barras titulo="Motivos más frecuentes" filas={motivos} color="bg-secondary" />
        <Barras titulo="Proveedores con más devoluciones" filas={proveedores} color="bg-primary" />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Recuperación por proveedor</CardTitle>
          <InfoTip
            what="Solicitado = lo devuelto con costo. Recuperado = lo de las resueltas con costo. Lo «sin valorar» no se suma como plata en ninguno de los dos."
            affects="Días a resolver es de registrada a resuelta, aproximado por su último cambio. Las anuladas no cuentan."
            example="3 devoluciones, 2 resueltas → «2 de 3»; si una no tiene costo, sale en «Sin valorar» y no en soles."
          />
          <span className="text-sm text-[var(--text-secondary)]">
            {periodo} · {t.n} {t.n === 1 ? "devolución" : "devoluciones"}{medida.anuladas > 0 ? ` (sin ${medida.anuladas} anulada${medida.anuladas === 1 ? "" : "s"})` : ""} · recuperado {soles(t.recuperado)} de {soles(t.solicitado)}
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Resueltas</th>
                <th className="text-right">Días a resolver</th>
                <th className="text-right">Solicitado</th>
                <th className="text-right">Recuperado</th>
                <th className="text-right">Sin valorar</th>
                <th>Motivo que más se repite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {medida.porProveedor.map((f) => (
                <tr key={f.proveedor}>
                  <td className="font-semibold">{f.proveedor}</td>
                  <td className="text-right tabular-nums">{f.resueltas} de {f.n}</td>
                  <td className="text-right tabular-nums">{f.diasParaResolver ?? "—"}</td>
                  <td className="text-right tabular-nums">{soles(f.solicitado)}</td>
                  <td className="text-right font-semibold tabular-nums">{soles(f.recuperado)}</td>
                  <td className={cn("text-right tabular-nums", f.sinValorar > 0 && "font-semibold text-[var(--data-warning-ink)]")}>
                    {f.sinValorar > 0 ? `${f.sinValorar} ${f.sinValorar === 1 ? "ítem" : "ítems"}` : "—"}
                  </td>
                  <td className={cn(f.reincide && "font-semibold text-[var(--data-warning-ink)]")}>
                    {f.motivo ? `${f.motivo.texto} (${f.motivo.veces} de ${f.n})` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </div>
    </div>
  );
}
