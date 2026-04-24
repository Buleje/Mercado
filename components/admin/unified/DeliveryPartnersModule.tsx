"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
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
  ThumbsUp,
  ThumbsDown,
  Trophy,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import EmptyState from "@/components/admin/shared/EmptyState";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

// ── Spinner compacto ──
const _Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Loading skeleton ──
const TableSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-10 w-10 bg-gray-200 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="h-8 w-24 bg-gray-200 rounded-lg" />
      </div>
    ))}
  </div>
);

// ── Types ──
interface DeliveryPartner {
  id: string;
  name: string;
  phone: string;
  zone: string;
  vehicleType: string;
  fee: number;
  rating: number;
  isActive: boolean;
  createdAt?: string;
}

interface DeliveryAssignment {
  id: string;
  orderId: string;
  partnerId: string;
  partnerName: string;
  status: string;
  fee: number;
  assignedAt: string;
  deliveredAt?: string;
  notes?: string;
}

interface StorePermission {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  permissionType: string;
  permissions: string[];
  createdAt: string;
}

// ── Constants ──
const VEHICLE_TYPES = ["Moto", "Bicicleta", "Auto", "A pie", "Motokar"];
const ZONAS = [
  "Yarinacocha", "Callería", "Manantay", "Centro",
  "Pueblo Libre", "Ica Yanayacu", "Todos",
];
const ASSIGNMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pendiente:  { label: "Pendiente",  className: "bg-[var(--data-warning-100)] text-[var(--data-warning)]" },
  en_camino:  { label: "En camino",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]" },
  entregado:  { label: "Entregado",  className: "bg-[var(--accent-soft)] text-[var(--data-success)]" },
  cancelado:  { label: "Cancelado",  className: "bg-[var(--data-error-100)] text-[var(--data-error)]" },
};
const PERMISSION_TYPES = ["view", "edit", "admin", "delivery"];

const MODULE_ID = "delivery-partners";

const TABS = [
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
    >
      <div
        className="bg-white rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
          <CardTitle className="font-extrabold text-[var(--text-primary)]">
            {partner?.id ? "Editar repartidor" : "Nuevo repartidor"}
          </CardTitle>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
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
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
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
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
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
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Zona</label>
              <div className="relative">
                <select
                  value={form.zone}
                  onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
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
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                >
                  {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Activo toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-[var(--rule-base)]">
            <p className="text-sm font-bold text-[var(--text-primary)]">Activo</p>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                form.isActive ? "bg-primary" : "bg-gray-300"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white  transition-transform",
                form.isActive ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
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
function RepartidoresTab() {
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [modal, setModal]       = useState<{ open: boolean; partner: Partial<DeliveryPartner> | null }>({ open: false, partner: null });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/delivery/partners")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPartners(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar los repartidores."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: Omit<DeliveryPartner, "id" | "createdAt">) => {
    const id = modal.partner?.id;
    const res = await fetch(id ? `/api/delivery/partners/${id}` : "/api/delivery/partners", {
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
      const res = await fetch(`/api/delivery/partners/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPartners((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Error al eliminar el repartidor.");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{partners.length} repartidor{partners.length !== 1 ? "es" : ""}</p>
        <button
          onClick={() => setModal({ open: true, partner: null })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo repartidor
        </button>
      </div>

      {partners.length === 0 && !error ? (
        <EmptyState icon={Truck} title="Sin repartidores registrados" description="Agrega tu primer repartidor para empezar a gestionar entregas." />
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Repartidor</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] hidden sm:table-cell">Zona / Vehículo</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Tarifa</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Rating</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[var(--text-primary)]">{p.name}</p>
                      {p.phone && (
                        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" /> {p.zone}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{p.vehicleType}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                      S/{p.fee.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-warning)]">
                        <Star className="h-3.5 w-3.5 fill-[var(--data-warning)]" />
                        {p.rating.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                        p.isActive
                          ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
                          : "bg-gray-100 text-[var(--text-secondary)]"
                      )}>
                        {p.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setModal({ open: true, partner: p })}
                          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            className="bg-white rounded-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-[var(--data-error)]" />
              </div>
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)]">¿Eliminar repartidor?</CardTitle>
                <p className="text-sm text-[var(--text-secondary)]">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={!!deleting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--data-error)] hover:bg-[var(--data-error)] transition-colors disabled:opacity-50"
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/delivery/assignments").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/delivery/partners").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([a, p]) => {
        setAssignments(Array.isArray(a) ? a : []);
        setPartners(Array.isArray(p) ? p.filter((x: DeliveryPartner) => x.isActive) : []);
      })
      .catch(() => setError("No se pudieron cargar las asignaciones."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAssign = async () => {
    if (!selectedPartner || !assignModal.orderId) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/delivery/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: assignModal.orderId, partnerId: selectedPartner }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setAssignments((prev) => [saved, ...prev]);
      setAssignModal({ open: false });
      setSelectedPartner("");
    } catch {
      setError("Error al crear la asignación.");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{assignments.length} asignación{assignments.length !== 1 ? "es" : ""}</p>
        <button
          onClick={() => setAssignModal({ open: true })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Asignar
        </button>
      </div>

      {assignments.length === 0 && !error ? (
        <EmptyState icon={ClipboardList} title="Sin asignaciones registradas" description="Asigna repartidores a ordenes pendientes." />
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Orden</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Repartidor</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Tarifa</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] hidden sm:table-cell">Asignado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => {
                  const sc = ASSIGNMENT_STATUS_CONFIG[a.status] ?? {
                    label: a.status, className: "bg-gray-100 text-[var(--text-secondary)]",
                  };
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--text-primary)]">
                        #{a.orderId.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {a.partnerName}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                        S/{a.fee.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", sc.className)}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--text-secondary)] hidden sm:table-cell">
                        <span className="flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(a.assignedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal asignar */}
      {assignModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setAssignModal({ open: false })}
        >
          <div
            className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)]">Asignar repartidor</CardTitle>
              <button onClick={() => setAssignModal({ open: false })} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">ID de orden (opcional)</label>
              <input
                type="text"
                value={assignModal.orderId ?? ""}
                onChange={(e) => setAssignModal((p) => ({ ...p, orderId: e.target.value }))}
                placeholder="Ej: ORD-12345"
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Repartidor *</label>
              <div className="relative">
                <select
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                >
                  <option value="">Seleccionar repartidor...</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.zone} — S/{p.fee.toFixed(2)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setAssignModal({ open: false })}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedPartner}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {assigning ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Asignar
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/store-permissions")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPermissions(Array.isArray(d) ? d : []))
      .catch(() => setError("No se pudieron cargar los permisos."))
      .finally(() => setLoading(false));
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
    try {
      const res = await fetch(`/api/store-permissions/${permId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: newPerms }),
      });
      if (!res.ok) throw new Error();
      setPermissions((prev) =>
        prev.map((p) => (p.id === permId ? { ...p, permissions: newPerms } : p))
      );
    } catch {
      setError("Error al actualizar permisos.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {permissions.length === 0 && !error ? (
        <EmptyState icon={Shield} title="Sin permisos configurados" description="Los permisos de acceso a la tienda apareceran aqui." />
      ) : (
        <div className="bg-white border border-[var(--rule-base)] rounded-xl  overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-[var(--rule-base)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)]">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] hidden sm:table-cell">Tipo</th>
                  {PERMISSION_TYPES.map((p) => (
                    <th key={p} className="text-center px-3 py-3 text-xs font-bold text-[var(--text-secondary)]">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {permissions.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[var(--text-primary)]">{p.userName}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{p.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success)]">
                        {p.permissionType}
                      </span>
                    </td>
                    {PERMISSION_TYPES.map((perm) => (
                      <td key={perm} className="px-3 py-3 text-center">
                        <button
                          onClick={() => togglePermission(p.id, perm)}
                          disabled={savingId === p.id}
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors",
                            p.permissions.includes(perm)
                              ? "bg-primary border-primary"
                              : "bg-white border-[var(--rule-base)] hover:border-primary",
                            savingId === p.id && "opacity-50 cursor-not-allowed"
                          )}
                          title={p.permissions.includes(perm) ? `Quitar permiso ${perm}` : `Otorgar permiso ${perm}`}
                        >
                          {p.permissions.includes(perm) && (
                            <CheckCircle className="h-3 w-3 text-white" />
                          )}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Solicitudes de repartidores
// ─────────────────────────────────────────────
interface DriverApplication {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function parseApplicationBody(body: string) {
  // Format: "Name (Phone) - Zona: zone - Vehículo: type - Horario: avail"
  const match = body.match(
    /^(.+?)\s*\((.+?)\)\s*-\s*Zona:\s*(.+?)\s*-\s*Vehículo:\s*(.+?)\s*-\s*Horario:\s*(.+)$/
  );
  if (!match) return { name: body, phone: "", zone: "", vehicle: "", availability: "" };
  return {
    name: match[1].trim(),
    phone: match[2].trim(),
    zone: match[3].trim(),
    vehicle: match[4].trim(),
    availability: match[5].trim(),
  };
}

const AVAILABILITY_LABELS: Record<string, string> = {
  manana: "Mañana",
  tarde: "Tarde",
  noche: "Noche",
  full: "Todo el día",
  fines: "Fines de semana",
};

const VEHICLE_LABELS: Record<string, string> = {
  moto: "Moto",
  bicicleta: "Bicicleta",
  auto: "Auto",
  a_pie: "A pie",
};

// ─────────────────────────────────────────────
// Ranking Tab
// ─────────────────────────────────────────────
interface RankingEntry {
  id: string;
  name: string;
  phone: string;
  zone: string;
  vehicleType: string;
  rating: number;
  isActive: boolean;
  baseFee: number;
  deliveries: number;
  pending: number;
  avgFee: number;
  avgTimeMin: number;
  score: number;
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function RankingTab() {
  const [data, setData] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"semana" | "mes" | "todo">("mes");

  const fetchRanking = useCallback((p: string) => {
    setLoading(true);
    fetch(`/api/delivery/ranking?period=${p}`)
      .then((r) => (r.ok ? r.json() : { ranking: [] }))
      .then((d) => setData(d.ranking ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRanking(period); }, [fetchRanking, period]);

  const PERIODS: { id: "semana" | "mes" | "todo"; label: string }[] = [
    { id: "semana", label: "Esta semana" },
    { id: "mes",    label: "Este mes" },
    { id: "todo",   label: "Todo" },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
              period === p.id
                ? "bg-primary text-white"
                : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <Trophy className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay datos de ranking para este periodo</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-soft)] text-left text-xs text-[var(--text-secondary)]">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2 pr-3">Repartidor</th>
                <th className="pb-2 pr-3">Zona</th>
                <th className="pb-2 pr-3 text-center">Rating</th>
                <th className="pb-2 pr-3 text-center">Entregas</th>
                <th className="pb-2 pr-3 text-center">Prom. min</th>
                <th className="pb-2 pr-3 text-center">Prom. tarifa</th>
                <th className="pb-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry, idx) => (
                <tr
                  key={entry.id}
                  className={cn(
                    "border-b border-gray-50 hover:bg-gray-50/50 transition-colors",
                    idx < 3 && "bg-[var(--data-warning-50)]/30"
                  )}
                >
                  <td className="py-2.5 pr-2 font-bold text-[var(--text-tertiary)]">
                    {idx < 3 ? RANK_MEDALS[idx] : idx + 1}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
                          entry.isActive ? "bg-primary" : "bg-gray-300"
                        )}
                      >
                        {entry.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)] text-xs">{entry.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{entry.vehicleType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {entry.zone}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className="flex items-center justify-center gap-0.5 text-xs font-bold text-[var(--data-warning)]">
                      <Star className="h-3 w-3 fill-[var(--data-warning)] text-[var(--data-warning)]" />
                      {entry.rating.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{entry.deliveries}</span>
                    {entry.pending > 0 && (
                      <span className="ml-1 text-xs text-[var(--data-warning)]">+{entry.pending} pen.</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className="flex items-center justify-center gap-0.5 text-xs text-[var(--text-secondary)]">
                      <Clock className="h-3 w-3" />
                      {entry.avgTimeMin > 0 ? `${entry.avgTimeMin} min` : "—"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      S/ {entry.avgFee.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2.5 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-7 w-12 rounded-full text-xs font-extrabold",
                        entry.score >= 70
                          ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
                          : entry.score >= 40
                            ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
                            : "bg-[var(--data-error-100)] text-[var(--data-error)]"
                      )}
                    >
                      {entry.score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SolicitudesTab() {
  const [apps, setApps] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const fetchApps = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/driver-applications")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setApps(d.data ?? []))
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setProcessing(id);
    try {
      const res = await fetch("/api/admin/driver-applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notificationId: id }),
      });
      if (res.ok) {
        fetchApps();
      }
    } catch {
      // silently fail
    } finally {
      setProcessing(null);
    }
  };

  const filtered = filter === "pending"
    ? apps.filter((a) => !a.readAt)
    : apps;

  const pendingCount = apps.filter((a) => !a.readAt).length;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter("pending")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
            filter === "pending"
              ? "bg-primary text-white"
              : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
          )}
        >
          Pendientes {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
            filter === "all"
              ? "bg-primary text-white"
              : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200"
          )}
        >
          Todas
        </button>
        <button
          onClick={fetchApps}
          className="ml-auto p-2 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)] font-medium">
            {filter === "pending" ? "No hay solicitudes pendientes" : "No hay solicitudes"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            const data = parseApplicationBody(app.body);
            const isPending = !app.readAt;
            const isProcessing = processing === app.id;

            return (
              <div
                key={app.id}
                className={cn(
                  "bg-white border rounded-xl p-4  transition-all",
                  isPending ? "border-[var(--data-warning)] bg-[var(--data-warning-50)]/30" : "border-[var(--rule-base)] opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-[var(--text-primary)] text-sm truncate">{data.name}</h4>
                      {isPending ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning)]">
                          Pendiente
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-[var(--text-secondary)]">
                          Revisado
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {data.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {data.zone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Truck className="h-3 w-3" /> {VEHICLE_LABELS[data.vehicle] ?? data.vehicle}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {AVAILABILITY_LABELS[data.availability] ?? data.availability}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      {new Date(app.createdAt).toLocaleDateString("es-PE", {
                        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleAction(app.id, "approve")}
                        disabled={isProcessing}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success)] hover:bg-[var(--accent-soft)] disabled:opacity-50 transition-colors"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Aprobar
                      </button>
                      <button
                        onClick={() => handleAction(app.id, "reject")}
                        disabled={isProcessing}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error)] hover:bg-[var(--data-error)] disabled:opacity-50 transition-colors"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
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
    fetch("/api/delivery/kpis")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setKpis(d as DeliveryKPIs); })
      .catch(() => {})
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

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Repartidores activos", value: kpis.activePartners,     color: "text-primary" },
          { label: "Entregas hoy",          value: kpis.deliveriesToday,    color: "text-[var(--data-success)]" },
          { label: "Pendientes",            value: kpis.pendingDeliveries,  color: "text-[var(--data-warning)]" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white border border-[var(--rule-base)] rounded-xl p-3 sm:p-4  text-center"
          >
            {kpisLoading ? (
              <div className="h-7 w-12 mx-auto bg-gray-200 rounded animate-pulse" />
            ) : (
              <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
            )}
            <p className="text-xs sm:text-xs text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "repartidores" && <RepartidoresTab />}
        {tab === "solicitudes"  && <SolicitudesTab />}
        {tab === "asignaciones" && <AsignacionesTab />}
        {tab === "ranking"      && <RankingTab />}
        {tab === "permisos"     && <PermisosTab />}
      </AdminTabBar>
    </div>
  );
}
