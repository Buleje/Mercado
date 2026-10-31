"use client";

/**
 * El ranking de cajeros (sección Cajeros). Mostraba el id interno como nombre
 * y la diferencia restando ventas con Yape; ahora usa nombre y diferencia del
 * servidor. Desde el 10-10 es la ÚNICA tabla por cajero: el historial tenía
 * una copia («Por cajero») y Cajeros, además, tarjetas con cuatro de sus cinco
 * cifras. En el celular sale en tarjetas (useMobileTableCards) con todas.
 */
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cajeroColor, cajeroColorText, type StatCajero } from "./tipos";

export function DifCaja({ valor }: { valor: number }) {
  if (Math.abs(valor) < 0.01) return <span className="text-[var(--data-success-ink)] font-bold tabular-nums">{formatCurrency(0)}</span>;
  return (
    <span className={cn("font-bold tabular-nums", valor > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--data-error-ink)]")}>
      {valor > 0 ? "+" : ""}{formatCurrency(valor)}
    </span>
  );
}

export function Inicial({ nombre, tam = "h-7 w-7 text-sm" }: { nombre: string; tam?: string }) {
  return (
    <span className={cn("rounded-full flex items-center justify-center font-bold shrink-0", tam)} style={{ backgroundColor: cajeroColor(nombre), color: cajeroColorText(nombre) }} aria-hidden>
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

const horas = (h: number) => `${h.toLocaleString("es-PE", { maximumFractionDigits: 1 })} h`;

/** M21: al pulsar la cifra, la cuenta con la que salió (ventas, horas y tickets usados). */
function FormulaPorHora({ c }: { c: StatCajero }) {
  return (
    <InfoTip
      title={`Ventas por hora de ${c.name}`}
      what={c.horasTotales > 0 ? `${formatCurrency(c.ventasTotal)} ÷ ${horas(c.horasTotales)} trabajadas = ${formatCurrency(c.ventasPorHora)}/h` : "Sin horas: ningún turno cerrado en el período."}
      affects="Cuenta sólo los turnos cerrados: uno abierto todavía no tiene horas ni ventas."
    />
  );
}

function FormulaTicket({ c }: { c: StatCajero }) {
  return (
    <InfoTip
      title={`Ticket promedio de ${c.name}`}
      what={c.ticketPromedio != null ? `${formatCurrency(c.ventasConTickets)} ÷ ${c.tickets} ${c.tickets === 1 ? "ticket" : "tickets"} = ${formatCurrency(c.ticketPromedio)}` : "Sin tickets en los turnos cerrados del período."}
      affects="Divide entre las ventas hechas, no entre turnos: un turno sin ventas no cambia el promedio."
    />
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
        <tr>
          <th>Cajero</th>
          <th className="text-right">Turnos</th>
          <th className="text-right">Ventas</th>
          <th className="text-right">Ventas/hora</th>
          <th className="text-right">Ticket prom.</th>
          <th className="text-right">Dif. caja</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((c) => (
          <tr key={c.id} className={c.id === mejor && stats.length > 1 ? "bg-primary/10" : undefined}>
            <td className="font-medium">
              <span className="flex items-center gap-2">
                <Inicial nombre={c.name} />
                <span className="truncate max-w-[160px]">{c.name}</span>
                {c.id === mejor && stats.length > 1 && <span className="text-[var(--data-success-ink)] text-sm font-bold">Top</span>}
              </span>
            </td>
            <td className="text-right text-[var(--text-secondary)] tabular-nums">{c.turnos}</td>
            <td className="text-right font-bold text-[var(--data-success-ink)] tabular-nums whitespace-nowrap">{formatCurrency(c.ventasTotal)}</td>
            <td className="text-right font-bold tabular-nums whitespace-nowrap">
              <span className="inline-flex items-center gap-1">{formatCurrency(c.ventasPorHora)}/h<FormulaPorHora c={c} /></span>
            </td>
            <td className="text-right text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
              <span className="inline-flex items-center gap-1">{c.ticketPromedio != null ? formatCurrency(c.ticketPromedio) : "—"}<FormulaTicket c={c} /></span>
            </td>
            <td className="text-right"><DifCaja valor={c.difCaja} /></td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
