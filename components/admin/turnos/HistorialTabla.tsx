"use client";

/**
 * Lista y línea de tiempo del historial. La diferencia es la del servidor
 * (la caja que se cerró con el turno); sin caja vinculada se muestra «—».
 * Tocar un turno abre su resumen (medio de pago, más vendidos, corte).
 */
import { DataTable } from "@buleje/design-system";
import { ChevronLeft, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { formatCurrency, formatDateShort, formatDateTime, formatTime } from "@/lib/format";
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
  if (Math.abs(d) < 0.01) return <span className="font-semibold text-[var(--data-success-500)] tabular-nums">{formatCurrency(0)}</span>;
  return (
    <span className={cn("font-bold tabular-nums", d > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
      {d > 0 ? "+" : ""}{formatCurrency(d)}
    </span>
  );
}

function Marca({ t }: { t: Turno }) {
  if (t.cerradoPorSistema) {
    return <span className="ml-1.5 rounded px-1.5 py-0.5 text-xs font-bold bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 text-[var(--text-primary)]">Sistema</span>;
  }
  if (turnoConAlerta(t)) {
    return <span className="ml-1.5 rounded px-1.5 py-0.5 text-xs font-bold bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]">Revisar</span>;
  }
  return null;
}

export function HistorialTabla({ turnos, nombreDe, onVer, cargandoId, page, setPage, porPagina }: Props) {
  const totalPages = Math.max(1, Math.ceil(turnos.length / porPagina));
  const pagina = turnos.slice((page - 1) * porPagina, page * porPagina);
  return (
    <>
      <DataTable className="text-base">
        <thead>
          <tr className="border-b border-[var(--rule-soft)]">
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
            <tr key={t.id} className="cursor-pointer hover:bg-[var(--surface-sunken)]" onClick={() => onVer(t)}>
              <td className="font-semibold text-[var(--text-primary)]">
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
              <td className="text-sm text-[var(--text-secondary)] tabular-nums">{formatDateTime(t.abrioEn)}</td>
              <td className="text-sm text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{t.cerroEn ? formatDateTime(t.cerroEn) : "—"}</td>
              <td className="text-right text-[var(--text-secondary)] tabular-nums">{formatCurrency(t.inicioEfectivo)}</td>
              <td className="text-right font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(t.ventasTotal)}</td>
              <td className="text-right text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{t.cierreEfectivo != null && !t.cerradoPorSistema ? formatCurrency(t.cierreEfectivo) : "—"}</td>
              <td className="text-right"><Diferencia t={t} /></td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--rule-soft)]">
          <p className="text-xs text-[var(--text-tertiary)]">{turnos.length} turnos · pág. {page}/{totalPages}</p>
          <div className="flex gap-1">
            <button type="button" aria-label="Anterior" disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-2 rounded-xl hover:bg-[var(--surface-sunken)] disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function HistorialLinea({ turnos, nombreDe, onVer }: Pick<Props, "turnos" | "nombreDe" | "onVer">) {
  const diez = turnos.slice(0, 10);
  return (
    <ol className="p-4">
      {diez.map((t, idx) => {
        const alerta = turnoConAlerta(t);
        return (
          <li key={t.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("w-3 h-3 rounded-full shrink-0 mt-1.5", t.diferencia == null && !t.cerradoPorSistema ? "bg-[var(--rule-base)]" : alerta ? "bg-[var(--data-warning-500)]" : "bg-primary")} aria-hidden />
              {idx < diez.length - 1 && <span className="w-0.5 flex-1 bg-[var(--rule-soft)] my-1" aria-hidden />}
            </div>
            <button type="button" onClick={() => onVer(t)} className="pb-4 flex-1 min-w-0 text-left">
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                {nombreDe(t)} <span className="font-normal text-[var(--text-tertiary)] tabular-nums">{formatTime(t.abrioEn)}-{t.cerroEn ? formatTime(t.cerroEn) : "…"}</span>{" "}
                <span className="font-extrabold text-[var(--data-success-500)] tabular-nums">{formatCurrency(t.ventasTotal)}</span>
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                {t.cerradoPorSistema ? "Cerrado por el sistema" : t.diferencia == null ? "Sin dato de caja" : alerta ? "Diferencia alta" : "Cuadrado"} · {formatDateShort(t.abrioEn)}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
