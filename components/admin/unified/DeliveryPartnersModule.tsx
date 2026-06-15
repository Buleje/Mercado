"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";

// Lazy-load del mapa Leaflet — usa window, sin esto rompe en SSR.
const DeliveryPartnersLiveMap = dynamic(
  () => import("@/components/admin/delivery/DeliveryPartnersLiveMap"),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center text-[var(--text-tertiary)]">Cargando mapa…</div> },
);
const NetworkToggleCard = dynamic(
  () => import("@/components/admin/delivery/NetworkToggleCard"),
  { ssr: false, loading: () => <div className="h-[180px] rounded-2xl bg-[var(--surface-sunken)] animate-pulse" /> },
);
import {
  Truck,
  Users,
  ClipboardList,
  Shield,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Star,
  Phone,
  MapPin,
  Clock,
  ChevronDown,
  FileText,
  Trophy,
  DollarSign,
  Search,
  MessageCircle,
  Download,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { tenantFetch } from "@/lib/tenant-fetch";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TableSkeleton, VehicleIcon, vehicleLabel, vehicleKind, toNum } from "@/components/admin/delivery-partners/shared";
import { RankingTab } from "@/components/admin/delivery-partners/tabs/RankingTab";
import { SolicitudesTab } from "@/components/admin/delivery-partners/tabs/SolicitudesTab";

// ── Types ──
interface DeliveryPartner {
  id: string;
  name: string;
  phone: string;
  zone: string;
  vehicleType: string;
  fee: number | string;
  rating: number | string;
  isActive: boolean;
  createdAt?: string;
}

interface DeliveryAssignment {
  id: string;
  orderId: string;
  partnerId: string;
  partnerName: string;
  status: string;
  fee: number | string;
  assignedAt: string;
  deliveredAt?: string;
  notes?: string;
}

interface StorePermission {
  id: string;
  storeId: string;
  storeName: string;
  userId: string;
  userType: string;
  userName: string;
  userEmail: string;
  permissions: string[];
  grantedBy: string;
  createdAt: string;
}

// ── Constants ──
const VEHICLE_TYPES = ["Moto", "Bicicleta", "Auto", "A pie", "Motokar"];
const ZONAS = [
  "Yarinacocha", "Callería", "Manantay", "Centro",
  "Pueblo Libre", "Ica Yanayacu", "Todos",
];
// FIX 2026-05-06 (audit team): claves SINCRONIZADAS con backend.
// Antes UI usaba "pendiente/en_camino/entregado" pero schema/route handler
// usan los valores reales abajo → status badges nunca matcheaban y los KPIs
// daban siempre 0. VALID_TRANSITIONS en /api/delivery/assignments enforce
// la state machine: assigned → picked_up → in_transit → delivered.
const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  assigned:    { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  picked_up:   { label: "Recogido",   className: "bg-primary/10 text-primary" },
  in_transit:  { label: "En camino",  className: "bg-primary/10 text-primary" },
  delivered:   { label: "Entregado",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  cancelled:   { label: "Cancelado",  className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};
// Permisos canónicos sincronizados con /api/store-permissions
const PERMISSION_TYPES = [
  "view_orders",
  "edit_status",
  "view_prices",
  "manage_products",
  "view_analytics",
] as const;
const PERMISSION_LABELS: Record<string, { label: string; short: string; description: string }> = {
  view_orders:     { label: "Ver órdenes",         short: "Órdenes",   description: "Ver listado de pedidos" },
  edit_status:     { label: "Editar estado",       short: "Estado",    description: "Cambiar estado de pedidos" },
  view_prices:     { label: "Ver precios",         short: "Precios",   description: "Acceso a tarifas y costos" },
  manage_products: { label: "Gestionar productos", short: "Productos", description: "Crear y editar inventario" },
  view_analytics:  { label: "Ver analytics",       short: "Analytics", description: "Acceso a reportes" },
};
const USER_TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  admin:    { label: "Admin",       bg: "bg-primary/10",                  text: "text-primary" },
  cajero:   { label: "Cajero",      bg: "bg-[var(--data-warning-100)]",   text: "text-[var(--data-warning-500)]" },
  delivery: { label: "Delivery",    bg: "bg-[var(--accent-soft)]",        text: "text-[var(--data-success-500)]" },
};

const MODULE_ID = "delivery-partners";

const TABS = [
  { id: "live",          label: "En vivo",       icon: MapPin },
  { id: "repartidores",  label: "Repartidores",  icon: Users },
  { id: "solicitudes",   label: "Solicitudes",   icon: FileText },
  { id: "asignaciones",  label: "Asignaciones",  icon: ClipboardList },
  { id: "ranking",       label: "Ranking",        icon: Trophy },
  { id: "permisos",      label: "Permisos",       icon: Shield },
];

type TabId = string;

// ─────────────────────────────────────────────
// Modal para crear/editar repartidor
// ─────────────────────────────────────────────
const EMPTY_PARTNER: Omit<DeliveryPartner, "id" | "createdAt"> = {
  name: "", phone: "", zone: "Centro", vehicleType: "Moto",
  fee: 5, rating: 5, isActive: true,
};

function PartnerModal({
  partner,
  onClose,
  onSave,
}: {
  partner: Partial<DeliveryPartner> | null;
  onClose: () => void;
  onSave: (data: Omit<DeliveryPartner, "id" | "createdAt">) => Promise<void>;
}) {
  const [form, setForm] = useState<Omit<DeliveryPartner, "id" | "createdAt">>(
    partner
      ? {
          name: partner.name ?? "",
          phone: partner.phone ?? "",
          zone: partner.zone ?? "Centro",
          vehicleType: partner.vehicleType ?? "Moto",
          fee: partner.fee ?? 5,
          rating: partner.rating ?? 5,
          isActive: partner.isActive ?? true,
        }
      : { ...EMPTY_PARTNER }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIX 2026-05-06 (audit team): a11y modal — Esc cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es obligatorio."); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError("Error al guardar el repartidor. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-[var(--surface-raised)] rounded-2xl w-full max-w-md shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-modal-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
          <CardTitle id="partner-modal-title" className="font-extrabold text-[var(--text-primary)]">
            {partner?.id ? "Editar repartidor" : "Nuevo repartidor"}
          </CardTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Nombre completo *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Juan Pérez"
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Teléfono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="987654321"
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Tarifa base (S/)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.fee}
                onChange={(e) => setForm((p) => ({ ...p, fee: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Zona</label>
              <div className="relative">
                <select
                  value={form.zone}
                  onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                >
                  {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Vehículo</label>
              <div className="relative">
                <select
                  value={form.vehicleType}
                  onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                >
                  {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Activo toggle — a11y: role="switch" + aria-checked */}
          <div className="flex items-center justify-between p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)]">
            <label htmlFor="partner-active-toggle" className="text-sm font-bold text-[var(--text-primary)] cursor-pointer">
              Activo
            </label>
            <button
              type="button"
              id="partner-active-toggle"
              role="switch"
              aria-checked={form.isActive}
              aria-label={form.isActive ? "Desactivar repartidor" : "Activar repartidor"}
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
                form.isActive ? "bg-primary" : "bg-[var(--rule-base)]",
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white dark:bg-[var(--color-card)] transition-transform",
                form.isActive ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Repartidores
// ─────────────────────────────────────────────
/**
 * Brandon mayo 2026 v7: helpers para mejoras de RepartidoresTab.
 *  - zoneColor: hash determinístico zona → color de avatar (5 paletas).
 *  - downloadCSV: export plano para SUNAT/contabilidad/pagos.
 *  - waLink: link wa.me con template auto en español-PE.
 */
const ZONE_PALETTE = [
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-sky-100 dark:bg-sky-900/40",         text: "text-sky-700 dark:text-sky-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-teal-100 dark:bg-teal-900/40",       text: "text-teal-700 dark:text-teal-300" },
  { bg: "bg-orange-100 dark:bg-orange-900/40",   text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40",       text: "text-cyan-700 dark:text-cyan-300" },
] as const;

function zoneColor(zone: string): (typeof ZONE_PALETTE)[number] {
  const z = (zone ?? "").toLowerCase().trim() || "default";
  let hash = 0;
  for (let i = 0; i < z.length; i++) hash = ((hash << 5) - hash) + z.charCodeAt(i);
  return ZONE_PALETTE[Math.abs(hash) % ZONE_PALETTE.length];
}

function downloadCSV(rows: DeliveryPartner[]) {
  const header = ["Nombre", "Telefono", "Zona", "Vehiculo", "Tarifa (S/)", "Rating", "Estado"];
  const lines = rows.map((p) => [
    p.name,
    p.phone ?? "",
    p.zone,
    vehicleLabel(p.vehicleType),
    toNum(p.fee).toFixed(2),
    toNum(p.rating).toFixed(1),
    p.isActive ? "Activo" : "Inactivo",
  ]);
  const all = [header, ...lines].map((r) =>
    r.map((c) => {
      const s = String(c ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","),
  );
  const csv = "﻿" + all.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `repartidores-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function waLink(phone: string, name: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  const intl = digits.length === 9 ? `51${digits}` : digits;
  const text = `Hola ${name}, te escribo del negocio. ¿Estás disponible para una entrega ahora?`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

function RepartidoresTab() {
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
  const [zoneFilter, setZoneFilter] = useState<string>("todas");
  const [vehicleFilter, setVehicleFilter] = useState<string>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "activos" | "inactivos">("todos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

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

  if (loading) return <TableSkeleton />;

  // Derived KPIs
  const totalCount = partners.length;
  const activeCount = partners.filter((p) => p.isActive).length;
  const inactiveCount = totalCount - activeCount;
  const avgRating =
    totalCount > 0
      ? partners.reduce((s, p) => s + toNum(p.rating), 0) / totalCount
      : 0;

  // Brandon mayo 2026 v7: filtros aplicados + zonas/vehículos únicos para dropdowns.
  const uniqueZones = Array.from(new Set(partners.map((p) => p.zone).filter(Boolean))).sort();
  const uniqueVehicles = Array.from(new Set(partners.map((p) => vehicleKind(p.vehicleType)))).sort();

  const filtered = partners.filter((p) => {
    if (zoneFilter !== "todas" && p.zone !== zoneFilter) return false;
    if (vehicleFilter !== "todos" && vehicleKind(p.vehicleType) !== vehicleFilter) return false;
    if (statusFilter === "activos" && !p.isActive) return false;
    if (statusFilter === "inactivos" && p.isActive) return false;
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
    setZoneFilter("todas");
    setVehicleFilter("todos");
    setStatusFilter("todos");
  }

  return (
    <div className="space-y-6">
      {/* ── 0. Toggle Red Buleje (Brandon mayo 2026 v7) ─────────────── */}
      <NetworkToggleCard />

      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Repartidores
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {totalCount === 0
                  ? "Aún no tenés repartidores registrados. Agregá uno para empezar a gestionar entregas."
                  : `${totalCount} ${totalCount === 1 ? "repartidor registrado" : "repartidores registrados"} · gestioná tarifas, zonas y disponibilidad.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModal({ open: true, partner: null })}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nuevo repartidor
          </button>
        </div>

        {totalCount > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                {totalCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Registrados</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Activos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {activeCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Disponibles</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface-sunken)]">
                  <X className="h-5 w-5 text-[var(--text-tertiary)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Inactivos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-tertiary)] leading-tight mt-2">
                {inactiveCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Pausados</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-50)]">
                  <Star className="h-5 w-5 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Rating promedio
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-warning-500)] leading-tight mt-2">
                {avgRating > 0 ? avgRating.toFixed(1) : "—"}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">de 5 estrellas</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 1.5 Toolbar (search + filters + CSV) ───────────────────── */}
      {totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono o zona…"
              className="w-full h-11 pl-10 pr-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
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

          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="h-11 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="todas">Todas las zonas</option>
            {uniqueZones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="h-11 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="todos">Todo vehículo</option>
            {uniqueVehicles.map((v) => (
              <option key={v} value={v} className="capitalize">{vehicleLabel(v)}</option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5 gap-0.5">
            {(["todos", "activos", "inactivos"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                aria-pressed={statusFilter === s}
                className={cn(
                  "h-10 px-3 rounded-lg text-xs font-extrabold transition-colors capitalize",
                  statusFilter === s
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => downloadCSV(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-extrabold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Descargar CSV de los repartidores filtrados"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      )}

      {/* ── 1.6 Bulk action bar ────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--accent-soft)] border-2 border-[var(--accent)]/40">
          <p className="text-sm font-extrabold text-[var(--accent)]">
            {selectedIds.size} {selectedIds.size === 1 ? "repartidor seleccionado" : "repartidores seleccionados"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkSetActive(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--data-success-500)] text-white text-xs font-extrabold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Activar todos
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkSetActive(false)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-primary)] text-xs font-extrabold hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              Pausar todos
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[var(--text-secondary)] text-xs font-extrabold hover:bg-[var(--surface-raised)] transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Banner error ─────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
            <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
          </span>
          <p className="text-sm font-bold text-[var(--data-error-500)] flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/10 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 3. Tabla / Empty state ─────────────────────────────────── */}
      {partners.length === 0 && !error ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Truck className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Sin repartidores registrados
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Agregá tu primer repartidor para empezar a asignar entregas y gestionar tu flota.
          </p>
          <button
            type="button"
            onClick={() => setModal({ open: true, partner: null })}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors mt-6"
          >
            <Plus className="h-4 w-4" />
            Agregar primer repartidor
          </button>
        </div>
      ) : (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-3 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Seleccionar todos"
                      className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Repartidor</th>
                  <th className="text-left px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">Zona / Vehículo</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Tarifa</th>
                  <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Rating</th>
                  <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Estado</th>
                  <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acciones</th>
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
                      "transition-colors",
                      isSelected ? "bg-[var(--accent-soft)]/40" : "hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Seleccionar ${p.name}`}
                        className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "h-12 w-12 rounded-2xl flex items-center justify-center text-xl font-extrabold shrink-0 border-2 border-transparent",
                            zc.bg,
                            zc.text,
                          )}
                          title={`Zona: ${p.zone}`}
                        >
                          {(p.name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("")}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">{p.name}</p>
                          {p.phone && (
                            <p className="text-xs text-[var(--text-tertiary)] font-mono flex items-center gap-1 mt-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {p.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        {p.zone}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-1.5">
                        <VehicleIcon type={p.vehicleType} className="h-3.5 w-3.5" />
                        <span className="font-semibold capitalize">{vehicleLabel(p.vehicleType)}</span>
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                      S/{toNum(p.fee).toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-extrabold bg-[var(--data-warning-50)] text-[var(--data-warning-500)] tabular-nums">
                        <Star className="h-3.5 w-3.5 fill-[var(--data-warning-500)]" />
                        {toNum(p.rating).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold",
                        p.isActive
                          ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", p.isActive ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]")} />
                        {p.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-10 w-10 rounded-xl text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                            title={`WhatsApp a ${p.name}`}
                            aria-label="WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setModal({ open: true, partner: p })}
                          className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-secondary)] hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(p.id)}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:border-[var(--data-error-500)]/40 hover:text-[var(--data-error-500)] transition-colors"
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
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-bold text-[var(--text-secondary)]">Sin resultados con esos filtros.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 text-xs font-extrabold text-[var(--accent)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
          {filtered.length > 0 && filtered.length < partners.length && (
            <div className="border-t border-[var(--rule-base)] px-4 py-2 bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>
                Mostrando <strong className="tabular-nums">{filtered.length}</strong> de{" "}
                <strong className="tabular-nums">{partners.length}</strong> repartidores
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="text-[var(--accent)] hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      {modal.open && (
        <PartnerModal
          partner={modal.partner}
          onClose={() => setModal({ open: false, partner: null })}
          onSave={handleSave}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-[var(--surface-raised)] rounded-2xl w-full max-w-sm p-6 border border-[var(--rule-base)] shadow-[var(--shadow-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" />
              </div>
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)]">¿Eliminar repartidor?</CardTitle>
                <p className="text-sm text-[var(--text-secondary)]">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={!!deleting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Asignaciones
// ─────────────────────────────────────────────
function AsignacionesTab() {
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [partners, setPartners]       = useState<DeliveryPartner[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [assignModal, setAssignModal] = useState<{ open: boolean; orderId?: string }>({ open: false });
  const [selectedPartner, setSelectedPartner] = useState("");
  const [assigning, setAssigning]     = useState(false);

  // Cada fetch maneja su propio error para que partners siga cargando
  // aunque assignments falle (y viceversa) — antes Promise.all rejected
  // descartaba ambos y dejaba la UI sin partners para asignar.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [aRes, pRes] = await Promise.allSettled([
      tenantFetch("/api/delivery/assignments")
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(`assignments ${r.status}: ${body.detail ?? body.error ?? "unknown"}`);
          }
          return r.json();
        }),
      tenantFetch("/api/delivery/partners")
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(`partners ${r.status}: ${body.detail ?? body.error ?? "unknown"}`);
          }
          return r.json();
        }),
    ]);

    if (aRes.status === "fulfilled") {
      setAssignments(Array.isArray(aRes.value) ? aRes.value : []);
    } else {
      setAssignments([]);
      // Mostramos el detail real para diagnosticar (el endpoint lo expone solo en dev).
      const reason = aRes.reason instanceof Error ? aRes.reason.message : String(aRes.reason);
      setError(`No se pudieron cargar las asignaciones — ${reason}`);
    }

    if (pRes.status === "fulfilled" && Array.isArray(pRes.value)) {
      setPartners(pRes.value.filter((x: DeliveryPartner) => x.isActive));
    } else {
      setPartners([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async () => {
    if (!selectedPartner) {
      setError("Seleccioná un repartidor primero.");
      return;
    }
    if (!assignModal.orderId) {
      setError("Ingresá un ID de orden.");
      return;
    }
    // El endpoint requiere `fee` — usamos la tarifa del partner seleccionado.
    const partner = partners.find((p) => p.id === selectedPartner);
    const fee = toNum(partner?.fee ?? 0);

    setAssigning(true);
    setError(null);
    try {
      const res = await tenantFetch("/api/delivery/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: assignModal.orderId,
          partnerId: selectedPartner,
          fee,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const saved = await res.json();
      setAssignments((prev) => [saved, ...prev]);
      setAssignModal({ open: false });
      setSelectedPartner("");
    } catch (err) {
      setError(`Error al crear la asignación: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <TableSkeleton />;

  // Derivados para KPIs — usa los status reales del backend (VALID_TRANSITIONS)
  const pendientes  = assignments.filter((a) => a.status === "assigned").length;
  const enCamino    = assignments.filter((a) => ["picked_up", "in_transit"].includes(a.status)).length;
  const entregadas  = assignments.filter((a) => a.status === "delivered").length;
  const canceladas  = assignments.filter((a) => a.status === "cancelled").length;
  const ingresos    = assignments
    .filter((a) => a.status === "delivered")
    .reduce((acc, a) => acc + toNum(a.fee), 0);
  const partnersActivos = partners.length;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto p-1 rounded-lg hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Asignaciones de delivery
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {assignments.length === 0
                  ? "Acá vas a ver las órdenes asignadas a cada repartidor en tiempo real."
                  : `${assignments.length} ${assignments.length === 1 ? "asignación" : "asignaciones"} · ${partnersActivos} ${partnersActivos === 1 ? "repartidor activo" : "repartidores activos"}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAssignModal({ open: true })}
            disabled={partnersActivos === 0}
            title={partnersActivos === 0 ? "No hay repartidores activos disponibles" : "Asignar nueva orden"}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Asignar orden
          </button>
        </div>

        {assignments.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--data-warning-50)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                  <Clock className="h-5 w-5 text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Pendientes
              </p>
              <p className={cn(
                "text-3xl font-extrabold tabular-nums leading-tight mt-2",
                pendientes > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
              )}>
                {pendientes}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Por despachar</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Truck className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                En camino
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
                {enCamino}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Activas ahora</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Entregadas
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {entregadas}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Completadas</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <DollarSign className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Ingresos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                S/{ingresos.toFixed(0)}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Tarifas cobradas</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Tabla / Empty state ─────────────────────────────────── */}
      {assignments.length === 0 && !error ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <ClipboardList className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            Sin asignaciones registradas
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            Asigná un repartidor a una orden pendiente y se mostrará acá con su estado en vivo.
          </p>
          <button
            type="button"
            onClick={() => setAssignModal({ open: true })}
            disabled={partnersActivos === 0}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 mt-6"
          >
            <Plus className="h-4 w-4" />
            Crear primera asignación
          </button>
        </div>
      ) : assignments.length > 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Listado de asignaciones
            </p>
            <p className="text-sm text-[var(--text-tertiary)] font-bold">
              {assignments.length} {assignments.length === 1 ? "registro" : "registros"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Orden
                  </th>
                  <th className="text-left px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Repartidor
                  </th>
                  <th className="text-right px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Tarifa
                  </th>
                  <th className="text-center px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Estado
                  </th>
                  <th className="text-right px-6 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">
                    Asignado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {assignments.map((a) => {
                  const sc = ASSIGNMENT_STATUS_CONFIG[a.status] ?? {
                    label: a.status,
                    className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  };
                  const initial = (a.partnerName || "?").trim().charAt(0).toUpperCase();
                  return (
                    <tr key={a.id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-extrabold text-[var(--text-primary)]">
                        #{a.orderId.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-sm font-extrabold shrink-0">
                            {initial}
                          </div>
                          <span className="font-bold text-[var(--text-primary)]">
                            {a.partnerName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                          S/{toNum(a.fee).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-sm font-bold",
                          sc.className,
                        )}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-[var(--text-secondary)] hidden sm:table-cell">
                        <span className="inline-flex items-center justify-end gap-1.5 font-bold">
                          <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                          {new Date(a.assignedAt).toLocaleDateString("es-PE", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canceladas > 0 && (
            <div className="px-6 py-3 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
              <p className="text-sm text-[var(--text-tertiary)] font-bold">
                <AlertCircle className="inline h-4 w-4 mr-1.5 -mt-0.5 text-[var(--data-error-500)]" />
                {canceladas} {canceladas === 1 ? "asignación cancelada" : "asignaciones canceladas"}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* ── 3. Modal asignar ───────────────────────────────────────── */}
      {assignModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setAssignModal({ open: false })}
        >
          <div
            className="bg-[var(--surface-raised)] rounded-2xl w-full max-w-md p-6 sm:p-7 space-y-5 shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </span>
                <CardTitle className="font-display text-xl font-extrabold text-[var(--text-primary)]">
                  Nueva asignación
                </CardTitle>
              </div>
              <button
                type="button"
                onClick={() => setAssignModal({ open: false })}
                className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                ID de orden (opcional)
              </label>
              <input
                type="text"
                value={assignModal.orderId ?? ""}
                onChange={(e) => setAssignModal((p) => ({ ...p, orderId: e.target.value }))}
                placeholder="Ej: ORD-12345"
                className="w-full px-4 h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Repartidor *
              </label>
              <div className="relative">
                <select
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="w-full px-4 h-12 pr-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                >
                  <option value="">Seleccionar repartidor...</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.zone} — S/{toNum(p.fee).toFixed(2)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
              {partners.length === 0 && (
                <p className="text-sm text-[var(--data-warning-500)] font-bold flex items-center gap-1.5 mt-2">
                  <AlertCircle className="h-4 w-4" />
                  No hay repartidores activos. Activá uno desde la pestaña Repartidores.
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAssignModal({ open: false })}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={assigning || !selectedPartner}
                className="flex-[2] inline-flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {assigning ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {assigning ? "Asignando..." : "Confirmar asignación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Permisos
// ─────────────────────────────────────────────
function PermisosTab() {
  const [permissions, setPermissions] = useState<StorePermission[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [savingId, setSavingId]       = useState<string | null>(null);
  const [filterUserType, setFilterUserType] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await tenantFetch("/api/store-permissions");
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(`${r.status}: ${body.detail ?? body.error ?? "unknown"}`);
      }
      const d = await r.json();
      setPermissions(Array.isArray(d) ? d : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No se pudieron cargar los permisos — ${msg}`);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePermission = async (permId: string, perm: string) => {
    const target = permissions.find((p) => p.id === permId);
    if (!target) return;
    const has = target.permissions.includes(perm);
    const newPerms = has
      ? target.permissions.filter((p) => p !== perm)
      : [...target.permissions, perm];

    setSavingId(permId);
    setError(null);
    // Optimistic UI
    setPermissions((prev) =>
      prev.map((p) => (p.id === permId ? { ...p, permissions: newPerms } : p)),
    );

    try {
      const res = await tenantFetch(`/api/store-permissions/${permId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: newPerms }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      // Rollback
      setPermissions((prev) =>
        prev.map((p) => (p.id === permId ? { ...p, permissions: target.permissions } : p)),
      );
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error al actualizar permisos — ${msg}`);
    } finally {
      setSavingId(null);
    }
  };

  // Derivados para KPIs
  const userTypes = Array.from(new Set(permissions.map((p) => p.userType)));
  const filtered = filterUserType === "all"
    ? permissions
    : permissions.filter((p) => p.userType === filterUserType);
  const adminsCount = permissions.filter((p) => p.userType === "admin").length;
  const cajerosCount = permissions.filter((p) => p.userType === "cajero").length;
  const deliveryCount = permissions.filter((p) => p.userType === "delivery").length;
  const totalGrants = permissions.reduce((acc, p) => acc + p.permissions.length, 0);

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="font-bold">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto p-1 rounded-lg hover:bg-[var(--data-error-100)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Permisos de tienda
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                {permissions.length === 0
                  ? "No hay permisos configurados todavía. Asigná accesos granulares por usuario."
                  : `${permissions.length} ${permissions.length === 1 ? "usuario" : "usuarios"} con accesos · ${totalGrants} ${totalGrants === 1 ? "permiso otorgado" : "permisos otorgados"}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm font-bold hover:brightness-95 border border-[var(--rule-base)] transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refrescar
          </button>
        </div>

        {permissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Total usuarios
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-2">
                {permissions.length}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Con accesos</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Admins
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
                {adminsCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Acceso total</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-warning-100)]">
                  <Star className="h-5 w-5 text-[var(--data-warning-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Cajeros
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-warning-500)] leading-tight mt-2">
                {cajerosCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Operativos</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                  <Truck className="h-5 w-5 text-[var(--data-success-500)]" />
                </span>
              </div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Delivery
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
                {deliveryCount}
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">Repartidores</p>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Leyenda de permisos ─────────────────────────────────── */}
      {permissions.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Permisos disponibles
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {PERMISSION_TYPES.map((perm) => {
              const meta = PERMISSION_LABELS[perm];
              return (
                <div key={perm} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4">
                  <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {meta.label}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-snug">
                    {meta.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. Filtros por tipo de usuario ─────────────────────────── */}
      {permissions.length > 0 && userTypes.length > 1 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-2">
              Filtrar por tipo
            </span>
            <button
              type="button"
              onClick={() => setFilterUserType("all")}
              className={cn(
                "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                filterUserType === "all"
                  ? "bg-primary text-white border-primary"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Todos
              <span className={cn(
                "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                filterUserType === "all" ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
              )}>
                {permissions.length}
              </span>
            </button>
            {userTypes.map((ut) => {
              const count = permissions.filter((p) => p.userType === ut).length;
              const meta = USER_TYPE_LABELS[ut] ?? { label: ut, bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]" };
              return (
                <button
                  key={ut}
                  type="button"
                  onClick={() => setFilterUserType(ut)}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold transition-colors border",
                    filterUserType === ut
                      ? "bg-primary text-white border-primary"
                      : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {meta.label}
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-extrabold tabular-nums",
                    filterUserType === ut ? "bg-white/25" : "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Cards de usuarios / Empty / Loading ─────────────────── */}
      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
            <Shield className="h-8 w-8 text-[var(--text-tertiary)]" />
          </span>
          <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
            {permissions.length === 0 ? "Sin permisos configurados" : "Sin coincidencias"}
          </p>
          <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
            {permissions.length === 0
              ? "Cuando otorgues accesos a usuarios sobre tu tienda, aparecerán acá con detalle por permiso."
              : "Cambiá el filtro para ver permisos de otro tipo."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const userMeta = USER_TYPE_LABELS[p.userType] ?? { label: p.userType, bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]" };
            const initial = (p.userName || "?").trim().charAt(0).toUpperCase();
            const isSaving = savingId === p.id;
            return (
              <div
                key={p.id}
                className={cn(
                  "bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-5 sm:p-6 shadow-sm transition-opacity",
                  isSaving && "opacity-60",
                )}
              >
                <div className="flex items-start gap-4 mb-5 flex-wrap">
                  <div className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-extrabold shrink-0",
                    userMeta.bg, userMeta.text,
                  )}>
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                        {p.userName}
                      </p>
                      <span className={cn(
                        "inline-flex items-center px-3 py-1 rounded-full text-sm font-bold",
                        userMeta.bg, userMeta.text,
                      )}>
                        {userMeta.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                      {p.userEmail && (
                        <span className="font-mono">{p.userEmail}</span>
                      )}
                      {p.storeName && p.storeName !== "—" && (
                        <span className="flex items-center gap-1.5 font-bold">
                          <span className="text-[var(--text-tertiary)]">Tienda:</span>
                          {p.storeName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Permisos
                    </p>
                    <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)] leading-tight mt-1">
                      {p.permissions.length}
                      <span className="text-base text-[var(--text-tertiary)] font-bold">/{PERMISSION_TYPES.length}</span>
                    </p>
                  </div>
                </div>

                {/* Toggles de permisos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-4 border-t border-[var(--rule-soft)]">
                  {PERMISSION_TYPES.map((perm) => {
                    const meta = PERMISSION_LABELS[perm];
                    const has = p.permissions.includes(perm);
                    return (
                      <button
                        key={perm}
                        type="button"
                        onClick={() => togglePermission(p.id, perm)}
                        disabled={isSaving}
                        title={meta.description}
                        className={cn(
                          "inline-flex items-center justify-between gap-2 px-4 h-11 rounded-xl text-sm font-bold transition-colors border-2",
                          has
                            ? "bg-[var(--accent-soft)] border-[var(--data-success-500)]/40 text-[var(--data-success-500)]"
                            : "bg-[var(--surface-sunken)] border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:border-primary/30 hover:text-[var(--text-secondary)]",
                          isSaving && "cursor-not-allowed",
                        )}
                      >
                        <span className="truncate">{meta.short}</span>
                        <span className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0",
                          has ? "bg-[var(--data-success-500)]" : "bg-transparent border border-[var(--rule-base)]",
                        )}>
                          {has && <CheckCircle className="h-4 w-4 text-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface DeliveryKPIs {
  activePartners: number;
  deliveriesToday: number;
  pendingDeliveries: number;
}

export default function DeliveryPartnersModule() {
  const [tab, setTab] = useState<TabId>(TABS[0].id);
  const [kpis, setKpis] = useState<DeliveryKPIs>({
    activePartners: 0,
    deliveriesToday: 0,
    pendingDeliveries: 0,
  });
  const [kpisLoading, setKpisLoading] = useState(true);

  const refreshKpis = useCallback(() => {
    setKpisLoading(true);
    tenantFetch("/api/delivery/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as DeliveryKPIs); })
      .catch((err) => console.warn("[DeliveryPartnersModule] /api/delivery/kpis failed:", err))
      .finally(() => setKpisLoading(false));
  }, []);

  useEffect(() => { refreshKpis(); }, [refreshKpis]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Delivery"
        description="Gestiona repartidores, asignaciones y permisos"
        icon={Truck}
      >
        <button
          onClick={refreshKpis}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "live"         && <DeliveryPartnersLiveMap />}
        {tab === "repartidores" && <RepartidoresTab />}
        {tab === "solicitudes"  && <SolicitudesTab />}
        {tab === "asignaciones" && <AsignacionesTab />}
        {tab === "ranking"      && <RankingTab />}
        {tab === "permisos"     && <PermisosTab />}
      </AdminTabBar>
    </div>
  );
}
