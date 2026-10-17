"use client";

/**
 * Sección «Historial»: los turnos cerrados con sus filtros pegados a la tabla.
 *
 * Hasta el 10-10 tenía cuatro pestañas propias: «Línea de tiempo» repetía la
 * Lista (los mismos turnos, menos columnas, sólo diez) y «Por cajero» era la
 * misma tabla del ranking de Cajeros; se fueron. La Semana es su propia sección.
 */
import { Clock } from "@buleje/design-system/icons";
import { HistorialTabla } from "./HistorialTabla";
import { PER_PAGE, type Cajero, type FiltrosHistorial, type PeriodoHistorial, type Turno } from "./tipos";

const SELECT = "h-12 px-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20";

type Props = {
  historial: Turno[];
  filtrados: Turno[];
  cajeros: Cajero[];
  filtros: FiltrosHistorial;
  setFiltros: (f: FiltrosHistorial) => void;
  nombreDe: (t: Turno) => string;
  onVer: (t: Turno) => void;
  cargandoId: string | null;
  page: number;
  setPage: (p: number) => void;
};

export function TurnosHistorial(p: Props) {
  // Quién aparece en el filtro: los que tienen turnos (con nombre del servidor) + las cajeras de la lista.
  const opcionesCajero = new Map<string, string>();
  for (const t of p.historial) opcionesCajero.set(t.adminUserId, p.nombreDe(t));
  for (const c of p.cajeros) if (!opcionesCajero.has(c.id)) opcionesCajero.set(c.id, c.name || c.username);
  const cambiar = (parcial: Partial<FiltrosHistorial>) => { p.setFiltros({ ...p.filtros, ...parcial }); p.setPage(1); };

  return (
    <section aria-label="Historial de turnos" className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
      {p.historial.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-[var(--rule-soft)]">
          <select aria-label="Filtrar por cajero" value={p.filtros.cajero} onChange={(e) => cambiar({ cajero: e.target.value })} className={SELECT}>
            <option value="">Todos los cajeros</option>
            {[...opcionesCajero].map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <select aria-label="Periodo" value={p.filtros.periodo} onChange={(e) => cambiar({ periodo: e.target.value as PeriodoHistorial })} className={SELECT}>
            <option value="todo">Todo</option>
            <option value="7d">Últimos 7 días</option>
            <option value="mes">Este mes</option>
          </select>
          <label className="inline-flex min-h-12 items-center gap-1.5 px-1 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
            <input type="checkbox" checked={p.filtros.soloAlertas} onChange={(e) => cambiar({ soloAlertas: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            Por revisar
          </label>
          <span className="ml-auto text-sm text-[var(--text-secondary)] tabular-nums">{p.filtrados.length} de {p.historial.length}</span>
        </div>
      )}

      {p.historial.length === 0 ? (
        <div className="text-center py-10 px-4">
          <Clock className="h-6 w-6 mx-auto mb-2 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">Todavía no hay turnos cerrados.</p>
        </div>
      ) : p.filtrados.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Ningún turno con esos filtros.</p>
      ) : (
        <HistorialTabla turnos={p.filtrados} nombreDe={p.nombreDe} onVer={p.onVer} cargandoId={p.cargandoId} page={p.page} setPage={p.setPage} porPagina={PER_PAGE} />
      )}
    </section>
  );
}
