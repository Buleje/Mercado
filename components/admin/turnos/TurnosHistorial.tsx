"use client";

/**
 * Bloque «Historial»: una sola caja con sus pestañas internas (Lista, Línea de
 * tiempo, Semana, Por cajero) y los filtros pegados a la tabla. Antes eran tres
 * bloques apilados con su propio título (calendario, productividad, historial).
 */
import { forwardRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { HistorialLinea, HistorialTabla } from "./HistorialTabla";
import { TurnosPorCajero } from "./TurnosPorCajero";
import { TurnosSemana } from "./TurnosSemana";
import { PER_PAGE, type Cajero, type FiltrosHistorial, type PeriodoHistorial, type StatCajero, type Turno } from "./tipos";

export type VistaHistorial = "lista" | "linea" | "semana" | "cajero";
const VISTAS: { id: VistaHistorial; label: string }[] = [
  { id: "lista", label: "Lista" },
  { id: "linea", label: "Línea de tiempo" },
  { id: "semana", label: "Semana" },
  { id: "cajero", label: "Por cajero" },
];
const SELECT = "h-9 px-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20";

type Props = {
  historial: Turno[];
  filtrados: Turno[];
  semana: Turno[];
  stats: StatCajero[];
  cajeros: Cajero[];
  filtros: FiltrosHistorial;
  setFiltros: (f: FiltrosHistorial) => void;
  nombreDe: (t: Turno) => string;
  onVer: (t: Turno) => void;
  cargandoId: string | null;
  page: number;
  setPage: (p: number) => void;
  vista: VistaHistorial;
  setVista: (v: VistaHistorial) => void;
};

export const TurnosHistorial = forwardRef<HTMLElement, Props>(function TurnosHistorial(p, ref) {
  const { vista, setVista } = p;
  // Quién aparece en el filtro: los que tienen turnos (con nombre del servidor) + las cajeras de la lista.
  const opcionesCajero = new Map<string, string>();
  for (const t of p.historial) opcionesCajero.set(t.adminUserId, p.nombreDe(t));
  for (const c of p.cajeros) if (!opcionesCajero.has(c.id)) opcionesCajero.set(c.id, c.name || c.username);
  const conFiltros = vista === "lista" || vista === "linea";
  const cambiar = (parcial: Partial<FiltrosHistorial>) => { p.setFiltros({ ...p.filtros, ...parcial }); p.setPage(1); };

  return (
    <section ref={ref} aria-label="Historial de turnos" className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden scroll-mt-24">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-[var(--rule-soft)]">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] mr-1">Historial</CardTitle>
        <div className="flex bg-[var(--surface-sunken)] rounded-lg p-0.5" role="tablist" aria-label="Forma de ver el historial">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={vista === v.id}
              onClick={() => setVista(v.id)}
              className={cn(
                "px-2.5 min-h-8 rounded-md text-xs font-bold transition-colors whitespace-nowrap",
                vista === v.id ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        {conFiltros && p.historial.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
            <select aria-label="Filtrar por cajero" value={p.filtros.cajero} onChange={(e) => cambiar({ cajero: e.target.value })} className={SELECT}>
              <option value="">Todos</option>
              {[...opcionesCajero].map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
            <select aria-label="Periodo" value={p.filtros.periodo} onChange={(e) => cambiar({ periodo: e.target.value as PeriodoHistorial })} className={SELECT}>
              <option value="todo">Todo</option>
              <option value="7d">Últimos 7 días</option>
              <option value="mes">Este mes</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
              <input type="checkbox" checked={p.filtros.soloAlertas} onChange={(e) => cambiar({ soloAlertas: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              Por revisar
            </label>
            <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{p.filtrados.length} de {p.historial.length}</span>
          </div>
        )}
      </div>

      {p.historial.length === 0 && vista !== "semana" ? (
        <div className="text-center py-10 px-4">
          <Clock className="h-6 w-6 mx-auto mb-2 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">Todavía no hay turnos cerrados.</p>
        </div>
      ) : vista === "semana" ? (
        <TurnosSemana turnos={p.semana} nombreDe={p.nombreDe} />
      ) : vista === "cajero" ? (
        <TurnosPorCajero stats={p.stats} />
      ) : p.filtrados.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Ningún turno con esos filtros.</p>
      ) : vista === "linea" ? (
        <HistorialLinea turnos={p.filtrados} nombreDe={p.nombreDe} onVer={p.onVer} />
      ) : (
        <HistorialTabla turnos={p.filtrados} nombreDe={p.nombreDe} onVer={p.onVer} cargandoId={p.cargandoId} page={p.page} setPage={p.setPage} porPagina={PER_PAGE} />
      )}
    </section>
  );
});
