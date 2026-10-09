"use client";

/**
 * Productividad por cajero (antes «Productividad por cajero» debajo del
 * calendario). Mostraba el id interno como nombre y la diferencia restando
 * ventas con Yape; ahora usa nombre y diferencia del servidor.
 */
import { DataTable } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cajeroColor, cajeroColorText, type StatCajero } from "./tipos";

export function DifCaja({ valor }: { valor: number }) {
  if (Math.abs(valor) < 0.01) return <span className="text-[var(--data-success-500)] font-bold tabular-nums">{formatCurrency(0)}</span>;
  return (
    <span className={cn("font-bold tabular-nums", valor > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
      {valor > 0 ? "+" : ""}{formatCurrency(valor)}
    </span>
  );
}

export function Inicial({ nombre, tam = "h-6 w-6 text-xs" }: { nombre: string; tam?: string }) {
  return (
    <span className={cn("rounded-full flex items-center justify-center font-bold shrink-0", tam)} style={{ backgroundColor: cajeroColor(nombre), color: cajeroColorText(nombre) }} aria-hidden>
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

export function TurnosPorCajero({ stats }: { stats: StatCajero[] }) {
  if (stats.length === 0) {
    return <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Cierra al menos un turno para ver la productividad.</p>;
  }
  const mejor = stats[0]?.id;
  return (
    <DataTable>
      <thead>
        <tr className="border-b border-[var(--rule-soft)]">
          <th>Cajero</th>
          <th className="text-right">Turnos</th>
          <th className="text-right">Ventas</th>
          <th className="text-right hidden sm:table-cell">Ventas/hora</th>
          <th className="text-right hidden sm:table-cell">Ticket prom.</th>
          <th className="text-right">Dif. caja</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((c) => (
          <tr key={c.id} className={c.id === mejor && stats.length > 1 ? "bg-primary/10" : undefined}>
            <td className="font-medium text-[var(--text-primary)]">
              <span className="flex items-center gap-2">
                <Inicial nombre={c.name} />
                <span className="truncate max-w-[160px]">{c.name}</span>
                {c.id === mejor && stats.length > 1 && <span className="text-[var(--data-success-500)] text-xs font-bold">TOP</span>}
              </span>
            </td>
            <td className="text-right text-[var(--text-secondary)] tabular-nums">{c.turnos}</td>
            <td className="text-right font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(c.ventasTotal)}</td>
            <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{formatCurrency(c.ventasPorHora)}/h</td>
            <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{formatCurrency(c.ticketPromedio)}</td>
            <td className="text-right"><DifCaja valor={c.difCaja} /></td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
