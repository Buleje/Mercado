"use client";

/**
 * Lista de miembros de Socio Buleje: buscador + plan + estado en UNA fila (antes
 * los filtros iban en la cabecera de cada columna y otra vez arriba en el
 * celular), cada miembro con «Ver perfil» a la vista. Las columnas se siguen
 * pudiendo reordenar arrastrando el título.
 */

import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";
import { EnOrden, type UseOrdenColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { CLASE_SELECT, CLASE_TABLA, FilaFiltros, TH, Vacio } from "@/components/admin/campanas/comun";
import type { SocioMember } from "./MemberProfileDrawer";

export const PLAN_LABELS: Record<SocioMember["plan"], string> = { mensual: "Mensual", anual: "Anual" };
export const STATUS_LABELS: Record<SocioMember["status"], string> = { activo: "Activo", pausado: "Pausado", cancelado: "Cancelado" };

const STATUS_STYLES: Record<SocioMember["status"], string> = {
  activo: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  pausado: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]",
  cancelado: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

export const fmtSoles = (n: number) => `S/ ${formatNumber(n, 2)}`;
const fmtDate = (iso: string) => {
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
};

export interface FiltroMiembros {
  search: string;
  plan: SocioMember["plan"] | "all";
  estado: SocioMember["status"] | "all";
}
export const SIN_FILTRO: FiltroMiembros = { search: "", plan: "all", estado: "all" };

export function filtrarMiembros(members: SocioMember[], f: FiltroMiembros): SocioMember[] {
  const q = f.search.trim().toLowerCase();
  return members.filter((m) => {
    if (f.plan !== "all" && m.plan !== f.plan) return false;
    if (f.estado !== "all" && m.status !== f.estado) return false;
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.id.toLowerCase().includes(q);
  });
}

export function ListaMiembros({
  total,
  filtrados,
  filtro,
  onFiltro,
  onSelect,
  orden,
}: {
  /** Cuántos socios hay sin filtrar (para decir «aún no hay» o «ninguno coincide»). */
  total: number;
  filtrados: SocioMember[];
  filtro: FiltroMiembros;
  onFiltro: (f: FiltroMiembros) => void;
  onSelect: (m: SocioMember) => void;
  orden: UseOrdenColumnasResult;
}) {
  const { search, plan, estado } = filtro;
  const setSearch = (v: string) => onFiltro({ ...filtro, search: v });
  const setPlan = (v: FiltroMiembros["plan"]) => onFiltro({ ...filtro, plan: v });
  const setEstado = (v: FiltroMiembros["estado"]) => onFiltro({ ...filtro, estado: v });

  return (
    <div className="space-y-3">
      <FilaFiltros valor={search} onCambio={setSearch} placeholder="Buscar nombre, teléfono o código" etiqueta="Buscar socios">
        <select value={plan} onChange={(e) => setPlan(e.target.value as FiltroMiembros["plan"])} aria-label="Filtrar por plan" className={CLASE_SELECT}>
          <option value="all">Todos los planes</option>
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value as FiltroMiembros["estado"])} aria-label="Filtrar por estado" className={CLASE_SELECT}>
          <option value="all">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
          <option value="cancelado">Cancelados</option>
        </select>
      </FilaFiltros>

      {filtrados.length === 0 ? (
        <Vacio>{total === 0 ? "Aún no hay socios: aparecerán cuando un cliente se una al programa." : "Ningún socio coincide con los filtros."}</Vacio>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="overflow-x-auto">
            <DataTable className={CLASE_TABLA}>
              <thead ref={orden.refCabecera}>
                <tr>
                  <EnOrden
                    orden={orden.orden}
                    celdas={{
                      miembro: <th data-col="miembro" className={TH}>Socio</th>,
                      plan: <th data-col="plan" className={cn(TH, "hidden sm:table-cell")}>Plan</th>,
                      renovacion: <th data-col="renovacion" className={cn(TH, "hidden md:table-cell")}>Renovación</th>,
                      cashback: <th data-col="cashback" className={cn(TH, "hidden text-right lg:table-cell")}>Cashback</th>,
                      pedidos: <th data-col="pedidos" className={cn(TH, "hidden text-right lg:table-cell")}>Pedidos</th>,
                      estado: <th data-col="estado" className={cn(TH, "text-center")}>Estado</th>,
                    }}
                  />
                  <th className={cn(TH, "text-right")}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtrados.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--surface-alt)]">
                    <EnOrden
                      orden={orden.orden}
                      celdas={{
                        miembro: (
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] text-sm font-bold text-white" aria-hidden>
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{m.name}</p>
                                {m.phone && <p className="text-sm text-[var(--text-secondary)]">{m.phone}</p>}
                              </div>
                            </div>
                          </td>
                        ),
                        plan: <td className="hidden sm:table-cell">{PLAN_LABELS[m.plan]}</td>,
                        renovacion: <td className="hidden text-[var(--text-secondary)] md:table-cell">{m.status === "cancelado" ? "—" : fmtDate(m.renewsAt)}</td>,
                        cashback: <td className="hidden text-right font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)] lg:table-cell">{fmtSoles(m.totalCashback)}</td>,
                        pedidos: <td className="hidden text-right tabular-nums text-[var(--text-secondary)] lg:table-cell">{m.ordersCount}</td>,
                        estado: (
                          <td className="text-center">
                            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-sm font-bold", STATUS_STYLES[m.status])}>{STATUS_LABELS[m.status]}</span>
                          </td>
                        ),
                      }}
                    />
                    <td className="text-right">
                      <button type="button" onClick={() => onSelect(m)} className="inline-flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]">
                        Ver perfil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}
    </div>
  );
}
