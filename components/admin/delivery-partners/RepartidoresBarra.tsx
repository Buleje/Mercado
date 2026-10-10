"use client";

/**
 * La fila de herramientas de Reparto › Equipo y la barra de «en bloque».
 *
 *  - `BusquedaEquipo`: buscador (nombre, teléfono o zona), los filtros de Zona,
 *    Vehículo y Estado para el celular (en la compu son el autofiltro del
 *    título de cada columna: `.admin-mobile-cards` esconde el `<thead>`), la
 *    descarga en CSV y «restablecer columnas».
 *  - `AccionesEnBloque`: con repartidores marcados, activarlos o pausarlos.
 *
 * Sacadas de `tabs/RepartidoresTab.tsx` el 10-10 (mismo comportamiento;
 * controles de 48 px).
 */
import { CheckCircle, Download, Search, X } from "@buleje/design-system/icons";
import { vehicleLabel, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { BotonRestablecerColumnas, type UseOrdenColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { downloadCSV } from "./repartidores-helpers";

export function BusquedaEquipo({
  query,
  setQuery,
  zoneFilter,
  setZoneFilter,
  vehicleFilter,
  setVehicleFilter,
  statusFilter,
  setStatusFilter,
  uniqueZones,
  uniqueVehicles,
  filtered,
  ordenRepartidores,
}: {
  query: string;
  setQuery: (v: string) => void;
  zoneFilter: string[];
  setZoneFilter: (v: string[]) => void;
  vehicleFilter: string[];
  setVehicleFilter: (v: string[]) => void;
  statusFilter: string[];
  setStatusFilter: (v: string[]) => void;
  uniqueZones: string[];
  uniqueVehicles: string[];
  filtered: DeliveryPartner[];
  ordenRepartidores: UseOrdenColumnasResult;
}) {
  return (
    <>
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono o zona…"
              className="w-full h-12 pl-10 pr-9 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Zona, Vehículo y Estado ya tienen su autofiltro en el `<th>` — pero
              en el celular la tabla es tarjetas y `.admin-mobile-cards` esconde
              el `<thead>` ENTERO (no sólo las columnas con `hidden sm:table-cell`):
              los tres necesitan este atajo, mismo estado, un solo valor a la vez.
              (El comentario anterior decía que Estado no lo necesitaba porque su
              `<th>` "siempre se ve" — falso, el `<thead>` completo desaparece.) */}
          <select
            aria-label="Filtrar por zona"
            value={zoneFilter[0] ?? "todas"}
            onChange={(e) => setZoneFilter(e.target.value === "todas" ? [] : [e.target.value])}
            className="sm:hidden h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="todas">Todas las zonas</option>
            {uniqueZones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <select
            aria-label="Filtrar por vehículo"
            value={vehicleFilter[0] ?? "todos"}
            onChange={(e) => setVehicleFilter(e.target.value === "todos" ? [] : [e.target.value])}
            className="sm:hidden h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="todos">Todo vehículo</option>
            {uniqueVehicles.map((v) => (
              <option key={v} value={v} className="capitalize">{vehicleLabel(v)}</option>
            ))}
          </select>

          <select
            aria-label="Filtrar por estado"
            value={statusFilter[0] ?? "todos"}
            onChange={(e) => setStatusFilter(e.target.value === "todos" ? [] : [e.target.value])}
            className="sm:hidden h-12 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="todos">Todos los estados</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>

          <button
            type="button"
            onClick={() => downloadCSV(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 h-12 px-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Descargar CSV de los repartidores filtrados"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <BotonRestablecerColumnas cambiado={ordenRepartidores.cambiado} onRestablecer={ordenRepartidores.restablecer} />
    </>
  );
}

export function AccionesEnBloque({
  selectedIds,
  setSelectedIds,
  bulkBusy,
  handleBulkSetActive,
}: {
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  bulkBusy: boolean;
  handleBulkSetActive: (activo: boolean) => void;
}) {
  return (
    <>
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 pl-3 rounded-xl bg-primary/10 border-2 border-[var(--accent)]/40">
          <p className="text-sm font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {selectedIds.size} {selectedIds.size === 1 ? "repartidor seleccionado" : "repartidores seleccionados"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkSetActive(true)}
              className="inline-flex items-center gap-1.5 h-12 px-3 rounded-xl bg-[var(--accent-dark)] text-white text-sm font-bold hover:brightness-110 transition-colors disabled:opacity-40"
            >
              <CheckCircle className="h-4 w-4" />
              Activar todos
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkSetActive(false)}
              className="inline-flex items-center gap-1.5 h-12 px-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-bold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40"
            >
              <X className="h-4 w-4" />
              Pausar todos
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1 h-12 px-3 rounded-xl text-[var(--text-secondary)] text-sm font-bold hover:bg-[var(--surface-raised)] transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
