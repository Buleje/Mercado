"use client";

/**
 * El kardex: una fila por movimiento, de dos líneas como mucho (cuándo + quién,
 * producto + motivo). Toda la fila abre la ficha (`MovementDetailModal`).
 * En el celular la tabla pasa a tarjetas sola (`useMobileTableCards` del panel).
 */
import { DataTable } from "@buleje/design-system";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CAUSA, causaDe, diaDelMovimiento, type Direccion, type Movimiento } from "./tipos";
import type { LucideIcon } from "@buleje/design-system/icons";

export type FilaMovimiento = Movimiento & { productName: string; unit: string; label: string; Icon: LucideIcon; dir: Direccion };

const CHIP: Record<Direccion, string> = {
  in: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  out: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20 dark:text-[var(--data-warning-500)]",
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};
const CIFRA: Record<Direccion, string> = {
  in: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
  out: "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  neutral: "text-[var(--text-secondary)]",
};

export function rotuloDe(m: FilaMovimiento): string {
  return m.type === "merma" ? `Pérdida · ${CAUSA[causaDe(m.lossType)].label.toLowerCase()}` : m.label;
}

export function TablaMovimientos({ filas, hoy, onVer }: { filas: readonly FilaMovimiento[]; hoy: string; onVer: (m: FilaMovimiento) => void }) {
  return (
    <DataTable className="min-w-[640px] [&_tbody_td]:py-1.5! [&_tbody_td]:align-top">
      <thead>
        <tr>
          <th>Cuándo</th>
          <th>Producto</th>
          <th>Movimiento</th>
          <th className="text-right">Cantidad</th>
          <th className="text-right">Stock</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((m) => (
          <tr
            key={m.id}
            onClick={() => onVer(m)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVer(m); } }}
            tabIndex={0}
            aria-label={`Ver la ficha de ${rotuloDe(m)} de ${m.productName}`}
            className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          >
            <td data-label="Cuándo" className="whitespace-nowrap">
              <div className="min-w-0">
                <span className="block font-semibold text-[var(--text-primary)]">{diaDelMovimiento(m.createdAt, hoy)}</span>
                <span className="block text-[var(--text-secondary)]">
                  {formatTime(m.createdAt)}{m.createdBy ? ` · ${m.createdBy}` : ""}
                </span>
              </div>
            </td>
            <td data-label="Producto" className="max-w-[18rem]">
              <div className="min-w-0">
                <span className="block truncate font-semibold text-[var(--text-primary)]">{m.productName}</span>
                {/* El motivo que se tipeó al registrarlo: la pregunta que sigue a «¿por qué falta?». */}
                {(m.notes || m.reference) && (
                  <span className="block truncate text-[var(--text-secondary)]" title={[m.notes, m.reference].filter(Boolean).join(" · ")}>
                    {m.notes || m.reference}
                  </span>
                )}
              </div>
            </td>
            <td data-label="Movimiento">
              <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold", CHIP[m.dir])}>
                <m.Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden /> {rotuloDe(m)}
              </span>
            </td>
            <td data-label="Cantidad" className="text-right">
              {/* Un recosteo no movió unidades: «−0» lo hacía pasar por una salida fallida. */}
              <span className={cn("font-mono font-bold tabular-nums", CIFRA[m.dir])}>
                {m.dir === "neutral" ? "sin cambio" : m.dir === "in" ? `+${m.quantity}` : `−${m.quantity}`}
              </span>
            </td>
            <td data-label="Stock" className="text-right">
              <span className={cn(
                "font-mono font-bold tabular-nums",
                m.newStock === 0 ? "text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"
                  : m.newStock <= 5 ? "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
                  : "text-[var(--text-primary)]",
              )}>
                {m.newStock}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
