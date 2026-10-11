"use client";

/**
 * Los clientes con su nivel, puntos y lo que gastaron, del que más gastó al
 * que menos. Tocar la fila abre su ficha al lado. Antes: botones-tarjeta a
 * 12 px con el nivel a 10 px —y «oro» y «diamante» con el texto del mismo
 * color que el fondo, ilegibles—.
 */
import { DataTable } from "@buleje/design-system";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientePuntos } from "./use-puntos";

const NIVEL: Record<string, string> = {
  bronce: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  plata: "bg-[var(--data-info-50)] text-[var(--data-info-ink)] dark:bg-[var(--data-info-500)]/15",
  oro: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15",
  diamante: "bg-primary/10 text-[var(--accent-ink)] dark:bg-primary/15 dark:text-[var(--accent)]",
};

export function ChipNivel({ nivel }: { nivel: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold capitalize", NIVEL[nivel] ?? NIVEL.bronce)}>
      {nivel}
    </span>
  );
}

export function ListaPuntos({
  clientes,
  elegido,
  onElegir,
}: {
  clientes: ClientePuntos[];
  elegido: string | null;
  onElegir: (phone: string) => void;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Nivel</th>
          <th className="text-right">Puntos</th>
          <th className="text-right">Gastó</th>
        </tr>
      </thead>
      <tbody>
        {clientes.map((c) => {
          const activo = elegido === c.phone;
          return (
            <tr key={c.phone} onClick={() => onElegir(c.phone)} className={cn("cursor-pointer", activo && "bg-primary/5")}>
              <td>
                <button
                  type="button"
                  aria-pressed={activo}
                  onClick={(e) => { e.stopPropagation(); onElegir(c.phone); }}
                  className="block min-h-12 w-full max-w-[16rem] text-left"
                >
                  <span className="block truncate font-semibold text-[var(--text-primary)]">{c.name}</span>
                  <span className="block text-sm tabular-nums text-[var(--text-tertiary)]">{c.phone}</span>
                </button>
              </td>
              <td><ChipNivel nivel={c.loyaltyTier} /></td>
              <td className="text-right font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{formatNumber(c.loyaltyPoints ?? 0)}</td>
              <td className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">{formatCurrency(c.totalSpent ?? 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
