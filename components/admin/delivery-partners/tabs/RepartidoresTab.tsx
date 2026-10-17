"use client";

/**
 * Reparto › Equipo: tus repartidores. Una fila arriba con el selector Tu
 * equipo / Postulantes (lo pone la cabecera), el buscador, la descarga y
 * «Nuevo repartidor»; abajo la tabla (`RepartidoresTabla`). Las cifras del
 * equipo (en el equipo, activos, pausados, calificación) van en los
 * Indicadores de la cabecera de Reparto.
 *
 * 10-10 (Brandon: «compactar; cada pestaña su tarea»): antes arrancaba con la
 * tarjeta de la Red de repartidores Buleje (hoy en Reparto › Más) y una
 * tarjeta grande con título, párrafo y cuatro cifras de 30 px.
 */
import { useState, useEffect, useCallback, type ReactNode } from "react";
import { AlertCircle, CheckCircle, Plus, Star, Users, X } from "@buleje/design-system/icons";
import { tenantFetch } from "@/lib/tenant-fetch";
import { TableSkeleton, vehicleKind, toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { useIndicadoresReparto } from "@/components/admin/delivery/reparto-indicadores";
import { ConfirmarBorrarRepartidor, PartnerModal } from "../PartnerModal";
import { RepartidoresTabla } from "../RepartidoresTabla";
import { AccionesEnBloque, BusquedaEquipo } from "../RepartidoresBarra";

export function RepartidoresTab({ selector }: { selector?: ReactNode } = {}) {
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [modal, setModal]       = useState<{ open: boolean; partner: Partial<DeliveryPartner> | null }>({ open: false, partner: null });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Brandon mayo 2026 v7 — mejoras RepartidoresTab:
  // - búsqueda libre (nombre / teléfono)
  // - filtros zona + vehículo + estado
  // - selección múltiple para bulk activar/desactivar
  const [query, setQuery] = useState("");
  // Zona, Vehículo y Estado son columnas de la tabla (autofiltro tipo Excel en
  // su `<th>`, Brandon 2026-09-24): `[]` = todos/todas, admite varios a la vez.
  const [zoneFilter, setZoneFilter] = useState<string[]>([]);
  const [vehicleFilter, setVehicleFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Columnas de la tabla: arrastrar el título para reordenarlas.
  const ordenRepartidores = useOrdenColumnas("delivery-repartidores", ["repartidor", "zona", "tarifa", "rating", "estado"]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    tenantFetch("/api/delivery/partners")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPartners(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar los repartidores."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Omit<DeliveryPartner, "id" | "createdAt">) => {
    const id = modal.partner?.id;
    const res = await tenantFetch(id ? `/api/delivery/partners/${id}` : "/api/delivery/partners", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    const saved = await res.json();
    if (id) {
      setPartners((prev) => prev.map((p) => (p.id === id ? saved : p)));
    } else {
      setPartners((prev) => [...prev, saved]);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await tenantFetch(`/api/delivery/partners/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPartners((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Error al eliminar el repartidor.");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  // Brandon mayo 2026 v7: bulk activar/desactivar repartidores.
  const handleBulkSetActive = async (active: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    setError(null);
    // No hay endpoint bulk — actualizamos secuencialmente con PUT por cada id.
    // Es aceptable: <30 partners típicos por tenant. Si crece, agregar /api/delivery/partners/bulk.
    try {
      await Promise.allSettled(
        ids.map((id) => {
          const p = partners.find((x) => x.id === id);
          if (!p) return Promise.resolve(null);
          return tenantFetch(`/api/delivery/partners/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: p.name,
              phone: p.phone,
              zone: p.zone,
              vehicleType: p.vehicleType,
              fee: toNum(p.fee),
              rating: toNum(p.rating),
              isActive: active,
            }),
          });
        }),
      );
      setPartners((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, isActive: active } : p)),
      );
      setSelectedIds(new Set());
    } catch {
      setError("Error al actualizar repartidores en bloque.");
    } finally {
      setBulkBusy(false);
    }
  };

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Las cifras del equipo, en los Indicadores de la cabecera (el hook va antes del «cargando»).
  const activos = partners.filter((p) => p.isActive).length;
  const conCalificacion = partners.filter((p) => toNum(p.rating) > 0);
  const calificacion = conCalificacion.length > 0 ? conCalificacion.reduce((s, p) => s + toNum(p.rating), 0) / conCalificacion.length : 0;
  const kpis = useIndicadoresReparto({
    clave: "equipo",
    cargando: loading,
    resumen: `${activos} de ${partners.length} ${partners.length === 1 ? "activo" : "activos"}`,
    indicadores: [
      { icono: Users, rotulo: "En el equipo", valor: String(partners.length), ayuda: "Repartidores dados de alta en tu negocio." },
      { icono: CheckCircle, rotulo: "Activos", valor: String(activos), ayuda: "Pueden recibir pedidos. Los pausados no.", tono: activos > 0 ? "ok" : undefined },
      { icono: X, rotulo: "Pausados", valor: String(partners.length - activos) },
      {
        icono: Star,
        rotulo: "Calificación promedio",
        valor: calificacion > 0 ? `${calificacion.toFixed(1)} de 5` : "—",
        ayuda: "El promedio de lo que les pusieron los clientes. Quién entrega más y mejor en el período: Ranking.",
      },
    ],
  });

  if (loading) {
    return (
      <div className="space-y-4">
        {kpis.boton}
        {selector}
        <TableSkeleton />
      </div>
    );
  }

  const totalCount = partners.length;

  // Brandon mayo 2026 v7: filtros aplicados + zonas/vehículos únicos para dropdowns.
  const uniqueZones = Array.from(new Set(partners.map((p) => p.zone).filter(Boolean))).sort();
  const uniqueVehicles = Array.from(new Set(partners.map((p) => vehicleKind(p.vehicleType)))).sort();

  const filtered = partners.filter((p) => {
    if (zoneFilter.length > 0 && !zoneFilter.includes(p.zone)) return false;
    if (vehicleFilter.length > 0 && !vehicleFilter.includes(vehicleKind(p.vehicleType))) return false;
    if (statusFilter.length > 0 && !statusFilter.includes(p.isActive ? "Activo" : "Inactivo")) return false;
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      const hit =
        p.name.toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        p.zone.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.id)));
  }

  function clearFilters() {
    setQuery("");
    setZoneFilter([]);
    setVehicleFilter([]);
    setStatusFilter([]);
  }


  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}

      {/* Una fila: selector · buscador · filtros del celular · CSV · columnas · Nuevo repartidor. */}
      <div className="flex flex-wrap items-center gap-2">
        {selector}
        {totalCount > 0 && (
          <>
            <BusquedaEquipo
              query={query}
              setQuery={setQuery}
              zoneFilter={zoneFilter}
              setZoneFilter={setZoneFilter}
              vehicleFilter={vehicleFilter}
              setVehicleFilter={setVehicleFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              uniqueZones={uniqueZones}
              uniqueVehicles={uniqueVehicles}
              filtered={filtered}
              ordenRepartidores={ordenRepartidores}
            />
          </>
        )}
        <button
          type="button"
          onClick={() => setModal({ open: true, partner: null })}
          className="ml-auto inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo repartidor
        </button>
      </div>

      <AccionesEnBloque
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        bulkBusy={bulkBusy}
        handleBulkSetActive={(activo) => void handleBulkSetActive(activo)}
      />

      {error && (
        <div className="flex items-center gap-3 py-1 pl-4 pr-1 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
            <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-error-ink)] flex-1">{error}</p>
          <button aria-label="Quitar"
            type="button"
            onClick={() => setError(null)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <RepartidoresTabla
        partners={partners}
        filtered={filtered}
        error={error}
        selectedIds={selectedIds}
        toggleSelect={toggleSelect}
        toggleSelectAll={toggleSelectAll}
        orden={ordenRepartidores}
        zoneFilter={zoneFilter}
        setZoneFilter={setZoneFilter}
        vehicleFilter={vehicleFilter}
        setVehicleFilter={setVehicleFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        uniqueZones={uniqueZones}
        uniqueVehicles={uniqueVehicles}
        clearFilters={clearFilters}
        onNuevo={() => setModal({ open: true, partner: null })}
        onEditar={(p) => setModal({ open: true, partner: p })}
        onBorrar={setConfirmDelete}
      />

      {/* Modal crear/editar */}
      {modal.open && (
        <PartnerModal
          partner={modal.partner}
          onClose={() => setModal({ open: false, partner: null })}
          onSave={handleSave}
        />
      )}

      {confirmDelete && (
        <ConfirmarBorrarRepartidor
          borrando={!!deleting}
          onCancelar={() => setConfirmDelete(null)}
          onConfirmar={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  );
}
