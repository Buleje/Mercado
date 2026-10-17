"use client";

/**
 * La tabla de Equipo (Pedidos y reparto › Reparto): cada repartidor con su
 * zona y vehículo, tarifa, calificación y estado; autofiltro tipo Excel en el
 * título de Zona/Vehículo y de Estado (Brandon 2026-09-24), columnas que se
 * arrastran, y WhatsApp/Editar/Eliminar en la fila. Sin repartidores, el
 * estado vacío con «Agregar primer repartidor».
 *
 * Sacada de `tabs/RepartidoresTab.tsx` el 10-10 (mismo comportamiento; los
 * títulos de columna a 14 px y los botones de la fila a 48 px).
 */
import { DataTable } from "@buleje/design-system";
import { Edit2, MapPin, MessageCircle, Phone, Plus, Star, Trash2, Truck } from "@buleje/design-system/icons";
import { EnOrden, type UseOrdenColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { toNum, VehicleIcon, vehicleKind, vehicleLabel, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { waLink, zoneColor } from "./repartidores-helpers";

interface Props {
  partners: DeliveryPartner[];
  filtered: DeliveryPartner[];
  error: string | null;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  orden: UseOrdenColumnasResult;
  zoneFilter: string[];
  setZoneFilter: (v: string[]) => void;
  vehicleFilter: string[];
  setVehicleFilter: (v: string[]) => void;
  statusFilter: string[];
  setStatusFilter: (v: string[]) => void;
  uniqueZones: string[];
  uniqueVehicles: string[];
  clearFilters: () => void;
  onNuevo: () => void;
  onEditar: (p: DeliveryPartner) => void;
  onBorrar: (id: string) => void;
  /** Abre la ficha del repartidor (17-10, P24): entregas, incidencias y pagos. */
  onFicha?: (p: DeliveryPartner) => void;
}

export function RepartidoresTabla({
  partners,
  filtered,
  error,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  orden,
  zoneFilter,
  setZoneFilter,
  vehicleFilter,
  setVehicleFilter,
  statusFilter,
  setStatusFilter,
  uniqueZones,
  uniqueVehicles,
  clearFilters,
  onNuevo,
  onEditar,
  onBorrar,
  onFicha,
}: Props) {
  return (
    <>
      {partners.length === 0 && !error ? (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-8 text-center">
          <Truck className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Todavía no tienes repartidores: agrega el primero para asignarle entregas.</p>
          <button
            type="button"
            onClick={() => onNuevo()}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Agregar primer repartidor
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <DataTable className="w-full">
              <thead ref={orden.refCabecera}>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos"
                      className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                    />
                  </th>
                  <EnOrden
                    orden={orden.orden}
                    celdas={{
                      repartidor: <th data-col="repartidor">Repartidor</th>,
                      zona: (
                        <th data-col="zona" className="hidden sm:table-cell">
                          <span className="block">Zona / Vehículo</span>
                          <div className="mt-1.5 flex flex-col gap-1">
                            <FiltroColumnaMulti
                              label="Zona"
                              value={zoneFilter}
                              options={uniqueZones.map((z) => ({ value: z, count: partners.filter((p) => p.zone === z).length }))}
                              onChange={setZoneFilter}
                              placeholder="Todas"
                            />
                            <FiltroColumnaMulti
                              label="Vehículo"
                              value={vehicleFilter}
                              options={uniqueVehicles.map((v) => ({ value: v, count: partners.filter((p) => vehicleKind(p.vehicleType) === v).length }))}
                              etiqueta={vehicleLabel}
                              onChange={setVehicleFilter}
                              placeholder="Todos"
                            />
                          </div>
                        </th>
                      ),
                      tarifa: <th data-col="tarifa" className="text-right">Tarifa</th>,
                      rating: <th data-col="rating" className="text-center">Rating</th>,
                      estado: (
                        <th data-col="estado" className="text-center">
                          <span className="block">Estado</span>
                          <FiltroColumnaMulti
                            label="Estado"
                            value={statusFilter}
                            options={[
                              { value: "Activo", count: partners.filter((p) => p.isActive).length },
                              { value: "Inactivo", count: partners.filter((p) => !p.isActive).length },
                            ]}
                            onChange={setStatusFilter}
                            placeholder="Todos"
                            className="mx-auto"
                          />
                        </th>
                      ),
                    }}
                  />
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const zc = zoneColor(p.zone);
                  const wa = p.phone ? waLink(p.phone, p.name) : "";
                  return (
                  <tr
                    key={p.id}
                    className={cn(
                      "",
                      isSelected ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Seleccionar ${p.name}`}
                        className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                      />
                    </td>
                    <EnOrden
                      orden={orden.orden}
                      celdas={{
                        repartidor: (
                          <td>
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "h-12 w-12 rounded-2xl flex items-center justify-center text-xl font-extrabold shrink-0 border border-transparent",
                                  zc.bg,
                                  zc.text,
                                )}
                                title={`Zona: ${p.zone}`}
                              >
                                {(p.name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("")}
                              </div>
                              <div className="min-w-0">
                                {onFicha ? (
                                  <button
                                    type="button"
                                    onClick={() => onFicha(p)}
                                    className="text-left text-sm font-extrabold leading-tight text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
                                    title="Ver su ficha: entregas, incidencias y pagos"
                                    data-qa="abrir-ficha-repartidor"
                                  >
                                    {p.name}
                                  </button>
                                ) : (
                                  <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">{p.name}</p>
                                )}
                                {p.phone && (
                                  <p className="text-sm text-[var(--text-secondary)] font-mono flex items-center gap-1 mt-1">
                                    <Phone className="h-3 w-3 shrink-0" />
                                    {p.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        ),
                        zona: (
                          <td className="hidden sm:table-cell">
                            <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                              {p.zone}
                            </p>
                            <p className="text-sm text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
                              <VehicleIcon type={p.vehicleType} className="h-3.5 w-3.5" />
                              <span className="font-semibold capitalize">{vehicleLabel(p.vehicleType)}</span>
                            </p>
                          </td>
                        ),
                        tarifa: (
                          <td className="text-right font-extrabold tabular-nums">
                            {formatCurrency(toNum(p.fee))}
                          </td>
                        ),
                        rating: (
                          <td className="text-center">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-extrabold bg-[var(--data-warning-50)] text-[var(--data-warning-500)] tabular-nums">
                              <Star className="h-3.5 w-3.5 fill-[var(--data-warning-500)]" />
                              {toNum(p.rating).toFixed(1)}
                            </span>
                          </td>
                        ),
                        estado: (
                          <td className="text-center">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold",
                              p.isActive
                                ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                            )}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", p.isActive ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]")} />
                              {p.isActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                        ),
                      }}
                    />
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-12 w-12 rounded-xl text-[var(--data-success-ink)] hover:bg-[var(--data-success)]/15 transition-colors"
                            title={`WhatsApp a ${p.name}`}
                            aria-label="WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditar(p)}
                          className="inline-flex items-center gap-2 px-4 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-primary/10 hover:border-primary/30 hover:text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => onBorrar(p.id)}
                          className="inline-flex items-center justify-center w-12 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:border-[var(--data-error-500)]/40 hover:text-[var(--data-error-500)] transition-colors"
                          title="Eliminar"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
          {filtered.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-bold text-[var(--text-secondary)]">Sin resultados con esos filtros.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 h-12 px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
              >
                Limpiar filtros
              </button>
            </div>
          )}
          {filtered.length > 0 && filtered.length < partners.length && (
            <div className="border-t border-[var(--rule-base)] px-4 py-2 bg-[var(--surface-sunken)] text-sm font-semibold text-[var(--text-secondary)] flex items-center justify-between">
              <span>
                Mostrando <strong className="tabular-nums">{filtered.length}</strong> de{" "}
                <strong className="tabular-nums">{partners.length}</strong> repartidores
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="h-12 px-2 font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
