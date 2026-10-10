"use client";

import { Building2, Check } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { TenantCard, type TenantCardProps } from "@/components/superadmin/tenants/TenantCard";
import { TenantCardCompact } from "@/components/superadmin/tenants/TenantCardCompact";
import type { ViewMode } from "@/components/superadmin/tenants/types";
import type { Health } from "@/components/superadmin/tenants/useTenantsFiltros";

interface TenantsGridProps {
  loading: boolean;
  viewMode: ViewMode;
  sortedFinal: TenantRow[];
  totalTenants: number;
  bulkMode: boolean;
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  getHealth: (t: TenantRow) => Health;
  onLimpiarFiltros: () => void;
  acciones: Omit<TenantCardProps, "tenant" | "health">;
}

/** Vistas tarjetas y compacta de la lista de tiendas (la tabla vive en TenantTable). */
export function TenantsGrid({
  loading, viewMode, sortedFinal, totalTenants, bulkMode, selectedIds,
  toggleSelected, getHealth, onLimpiarFiltros, acciones,
}: TenantsGridProps) {
  return (
    <>
          {/* Cargando: esqueleto en vez de una pantalla vacía (la tabla trae el suyo). */}
          {loading && viewMode !== "table" && (
            <div role="status" aria-label="Cargando tiendas…" className={viewMode === "cards" ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"}>
              {Array.from({ length: viewMode === "cards" ? 3 : 8 }, (_, i) => (
                <div key={i} aria-hidden="true" className={`animate-pulse rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] ${viewMode === "cards" ? "h-72" : "h-24"}`} />
              ))}
            </div>
          )}

          {/* Empty state compartido por cards + compacta */}
          {!loading && viewMode !== "table" && sortedFinal.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--rule-base)] py-16 px-6 text-center">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-[var(--text-tertiary)] opacity-50" />
              <p className="text-base font-bold text-[var(--text-primary)]">
                {totalTenants === 0 ? "Sin tenants registrados" : "Sin coincidencias con los filtros"}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                {totalTenants === 0
                  ? "Aún no hay ningún tenant en la plataforma."
                  : "Prueba ajustar la búsqueda, plan o estado."}
              </p>
              {totalTenants > 0 && (
                <button
                  type="button"
                  onClick={onLimpiarFiltros}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {/* Vista tarjetas — health integrado en el kicker de la card
              (Brandon 2026-06-05: antes era un badge absoluto que se
              superponía con los badges propios de la card). */}
          {!loading && viewMode === "cards" && sortedFinal.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {sortedFinal.map((tenant) => {
                const isSelected = selectedIds.has(tenant.id);
                return (
                  <div key={tenant.id} className="relative">
                    {/* Checkbox flotante cuando bulk mode activo */}
                    {bulkMode && (
                      <button
                        type="button"
                        onClick={() => toggleSelected(tenant.id)}
                        className={`absolute top-3 left-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--accent)]"
                        }`}
                        aria-label={isSelected ? "Deseleccionar" : "Seleccionar"}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    )}

                    <div className={isSelected ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)] rounded-2xl" : ""}>
                      <TenantCard
                        tenant={tenant}
                        health={getHealth(tenant)}
                        {...acciones}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Vista compacta — mini-cards densas: identidad + pendientes +
              ventas + trial. Click → detalle; flecha → panel admin. */}
          {!loading && viewMode === "compact" && sortedFinal.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {sortedFinal.map((tenant) => {
                const isSelected = selectedIds.has(tenant.id);
                return (
                  <div key={tenant.id} className="relative">
                    {bulkMode && (
                      <button
                        type="button"
                        onClick={() => toggleSelected(tenant.id)}
                        className={`absolute -top-2 -left-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-colors ${
                          isSelected
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--accent)]"
                        }`}
                        aria-label={isSelected ? "Deseleccionar" : "Seleccionar"}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    )}
                    <div className={isSelected ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-canvas)] rounded-xl" : ""}>
                      <TenantCardCompact
                        tenant={tenant}
                        health={getHealth(tenant)}
                        onDetail={acciones.onDetail}
                        onImpersonate={acciones.onImpersonate}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </>
  );
}
