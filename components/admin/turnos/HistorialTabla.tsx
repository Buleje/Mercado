"use client";

/**
 * La lista del historial (la «Línea de tiempo» la repetía y se fue el 10-10). La diferencia es la del servidor
 * (la caja que se cerró con el turno); sin caja vinculada se muestra «—».
 * Tocar un turno abre su resumen (medio de pago, más vendidos, corte).
 */
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { turnoConAlerta, type Turno } from "./tipos";

type Props = {
  turnos: Turno[];
  nombreDe: (t: Turno) => string;
  onVer: (t: Turno) => void;
  cargandoId: string | null;
  page: number;
  setPage: (p: number) => void;
  porPagina: number;
};

export function Diferencia({ t }: { t: Turno }) {
  if (t.diferencia == null) {
    return <span className="text-[var(--text-tertiary)]" title={t.cerradoPorSistema ? "Lo cerró el sistema sin conteo" : "Turno sin caja vinculada"}>—</span>;
  }
  const d = t.diferencia;
  if (Math.abs(d) < 0.01) return <span className="font-semibold text-[var(--data-success-ink)] tabular-nums">{formatCurrency(0)}</span>;
  return (
    <span className={cn("font-bold tabular-nums", d > 0 ? "text-[var(--data-warning-ink)]" : "text-[var(--data-error-ink)]")}>
      {d > 0 ? "+" : ""}{formatCurrency(d)}
    </span>
  );
}

function Marca({ t }: { t: Turno }) {
  if (t.cerradoPorSistema) {
    return <span className="ml-1.5 rounded px-1.5 py-0.5 text-sm font-bold bg-[var(--data-warning-500)]/10 border border-[var(--data-warning-500)]/40 text-[var(--text-primary)]">Sistema</span>;
  }
  if (turnoConAlerta(t)) {
    return <span className="ml-1.5 rounded px-1.5 py-0.5 text-sm font-bold bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/40 text-[var(--text-primary)]">Revisar</span>;
  }
  return null;
}

export function HistorialTabla({ turnos, nombreDe, onVer, cargandoId, page, setPage, porPagina }: Props) {
  const totalPages = Math.max(1, Math.ceil(turnos.length / porPagina));
  const pagina = turnos.slice((page - 1) * porPagina, page * porPagina);
  return (
    <>
      <DataTable>
        <thead>
          <tr>
            <th>Atendió</th>
            <th>Apertura</th>
            <th className="hidden sm:table-cell">Cierre</th>
            <th className="text-right">Ef. inicial</th>
            <th className="text-right">Ventas</th>
            <th className="text-right hidden sm:table-cell">Ef. final</th>
            <th className="text-right">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {pagina.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => onVer(t)}>
              <td className="font-semibold">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onVer(t); }}
                  className="inline-flex items-center gap-1 text-left hover:underline truncate max-w-[200px]"
                  title="Ver el resumen de este turno"
                >
                  {cargandoId === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />}
                  {nombreDe(t)}
                </button>
                <Marca t={t} />
              </td>
              <td className="text-[var(--text-secondary)] tabular-nums">{formatDateTime(t.abrioEn)}</td>
              <td className="text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{t.cerroEn ? formatDateTime(t.cerroEn) : "—"}</td>
              <td className="text-right text-[var(--text-secondary)] tabular-nums">{formatCurrency(t.inicioEfectivo)}</td>
              <td className="text-right font-bold text-[var(--data-success-ink)] tabular-nums">{formatCurrency(t.ventasTotal)}</td>
              <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{t.cierreEfectivo != null && !t.cerradoPorSistema ? formatCurrency(t.cierreEfectivo) : "—"}</td>
              <td className="text-right"><Diferencia t={t} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--rule-soft)]">
          <p className="text-sm text-[var(--text-secondary)]">{turnos.length} turnos · pág. {page}/{totalPages}</p>
          <div className="flex gap-1">
            <button type="button" aria-label="Anterior" disabled={page <= 1} onClick={() => setPage(page - 1)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
