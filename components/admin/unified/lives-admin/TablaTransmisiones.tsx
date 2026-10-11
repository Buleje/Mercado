"use client";

/**
 * Transmisiones en una tabla: las que vienen (con «Empezar» a la vista) y las
 * pasadas (con sus cifras). Una sola pieza para las dos secciones.
 */
import { DataTable } from "@buleje/design-system";
import { Play, Square } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { CLASE_TABLA, TH } from "@/components/admin/campanas/comun";
import type { TransmisionDto } from "./tipos";

const cuando = (iso: string) => {
  try {
    return formatDateTimeShort(iso);
  } catch {
    return iso;
  }
};

const BTN = "inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]";

export function TablaTransmisiones({
  filas,
  tipo,
  onEmpezar,
  onTerminar,
}: {
  filas: TransmisionDto[];
  tipo: "proximas" | "pasadas";
  onEmpezar: (t: TransmisionDto) => void;
  onTerminar: (t: TransmisionDto) => void;
}) {
  const proximas = tipo === "proximas";
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="overflow-x-auto">
        <DataTable className={CLASE_TABLA}>
          <thead className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <th className={TH}>{proximas ? "Cuándo" : "Fecha"}</th>
              <th className={TH}>Transmisión</th>
              {!proximas && <th className={cn(TH, "hidden text-right sm:table-cell")}>Duración</th>}
              {!proximas && <th className={cn(TH, "text-right")}>Máx. de espectadores</th>}
              {!proximas && <th className={cn(TH, "hidden text-right md:table-cell")}>Pedidos</th>}
              {!proximas && <th className={cn(TH, "text-right")}>Ventas</th>}
              {proximas && <th className={cn(TH, "text-right")}>Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {filas.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-[var(--surface-sunken)]">
                <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{cuando(proximas || t.status === "live" ? t.scheduledFor : (t.startedAt ?? t.scheduledFor))}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-[var(--text-primary)]">{t.title}</p>
                  {t.description && <p className="line-clamp-1 text-sm text-[var(--text-secondary)]">{t.description}</p>}
                </td>
                {!proximas && <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--text-secondary)] sm:table-cell">{t.durationSeconds ? `${Math.round(t.durationSeconds / 60)} min` : "—"}</td>}
                {!proximas && <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">{t.viewersPeak}</td>}
                {!proximas && <td className="hidden px-4 py-3 text-right tabular-nums text-[var(--text-primary)] md:table-cell">{t.ordersGenerated}</td>}
                {!proximas && <td className="px-4 py-3 text-right font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{formatCurrency(Number(t.gmvSoles))}</td>}
                {proximas && (
                  <td className="px-4 py-3 text-right">
                    {t.status === "live" ? (
                      <button type="button" onClick={() => onTerminar(t)} className={BTN}>
                        <Square className="h-4 w-4" aria-hidden /> Terminar
                      </button>
                    ) : (
                      <button type="button" onClick={() => onEmpezar(t)} className={BTN}>
                        <Play className="h-4 w-4" aria-hidden /> Empezar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
