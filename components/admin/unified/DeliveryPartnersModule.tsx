"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

// ── Spinner compacto ──
const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
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
  pendiente:  { label: "Pendiente",  className: "bg-amber-100 text-amber-700" },
  en_camino:  { label: "En camino",  className: "bg-blue-100 text-blue-700" },
  entregado:  { label: "Entregado",  className: "bg-emerald-100 text-emerald-700" },
  cancelado:  { label: "Cancelado",  className: "bg-red-100 text-red-600" },
};
const PERMISSION_TYPES = ["view", "edit", "admin", "delivery"];

const MODULE_ID = "delivery-partners";

const TABS = [
  { id: "repartidores",  label: "Repartidores",  icon: Users },
  { id: "asignaciones",  label: "Asignaciones",  icon: ClipboardList },
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-extrabold text-gray-900">
            {partner?.id ? "Editar repartidor" : "Nuevo repartidor"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Nombre completo *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Juan Pérez"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] transition-all"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Teléfono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="987654321"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Tarifa base (S/)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.fee}
                onChange={(e) => setForm((p) => ({ ...p, fee: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Zona</label>
              <div className="relative">
                <select
                  value={form.zone}
                  onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] appearance-none transition-all"
                >
                  {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Vehículo</label>
              <div className="relative">
                <select
                  value={form.vehicleType}
                  onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] appearance-none transition-all"
                >
                  {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Activo toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-sm font-bold text-gray-900">Activo</p>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                form.isActive ? "bg-[#00B4A6]" : "bg-gray-300"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                form.isActive ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-primary-dark transition-colors disabled:opacity-50"
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
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-600">{partners.length} repartidor{partners.length !== 1 ? "es" : ""}</p>
        <button
          onClick={() => setModal({ open: true, partner: null })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00B4A6] text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo repartidor
        </button>
      </div>

      {partners.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin repartidores registrados</p>
          <p className="text-xs mt-1">Agrega tu primer repartidor para empezar a gestionar entregas.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Repartidor</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Zona / Vehículo</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Tarifa</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Rating</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{p.name}</p>
                      {p.phone && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-xs text-gray-600 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" /> {p.zone}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.vehicleType}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      S/{p.fee.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                        {p.rating.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex px-2.5 py-1 rounded-full text-xs font-bold",
                        p.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      )}>
                        {p.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setModal({ open: true, partner: p })}
                          className="p-2 rounded-lg text-gray-400 hover:text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900">¿Eliminar repartidor?</h3>
                <p className="text-sm text-gray-500">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={!!deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
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
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-600">{assignments.length} asignación{assignments.length !== 1 ? "es" : ""}</p>
        <button
          onClick={() => setAssignModal({ open: true })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00B4A6] text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Asignar
        </button>
      </div>

      {assignments.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin asignaciones registradas</p>
          <p className="text-xs mt-1">Asigna repartidores a órdenes pendientes.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Orden</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Repartidor</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Tarifa</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Asignado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assignments.map((a) => {
                  const sc = ASSIGNMENT_STATUS_CONFIG[a.status] ?? {
                    label: a.status, className: "bg-gray-100 text-gray-600",
                  };
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">
                        #{a.orderId.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {a.partnerName}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        S/{a.fee.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", sc.className)}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 hidden sm:table-cell">
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
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900">Asignar repartidor</h3>
              <button onClick={() => setAssignModal({ open: false })} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">ID de orden (opcional)</label>
              <input
                type="text"
                value={assignModal.orderId ?? ""}
                onChange={(e) => setAssignModal((p) => ({ ...p, orderId: e.target.value }))}
                placeholder="Ej: ORD-12345"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-600">Repartidor *</label>
              <div className="relative">
                <select
                  value={selectedPartner}
                  onChange={(e) => setSelectedPartner(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] appearance-none transition-all"
                >
                  <option value="">Seleccionar repartidor...</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.zone} — S/{p.fee.toFixed(2)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setAssignModal({ open: false })}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedPartner}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-primary-dark transition-colors disabled:opacity-50"
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
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {permissions.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin permisos configurados</p>
          <p className="text-xs mt-1">Los permisos de acceso a la tienda aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Tipo</th>
                  {PERMISSION_TYPES.map((p) => (
                    <th key={p} className="text-center px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {permissions.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900">{p.userName}</p>
                      <p className="text-xs text-gray-400">{p.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
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
                              ? "bg-[#00B4A6] border-[#00B4A6]"
                              : "bg-white border-gray-300 hover:border-[#00B4A6]",
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
          className="p-2 rounded-lg text-gray-400 hover:text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", kpisLoading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Repartidores activos", value: kpis.activePartners,     color: "text-[#00B4A6]" },
          { label: "Entregas hoy",          value: kpis.deliveriesToday,    color: "text-blue-600" },
          { label: "Pendientes",            value: kpis.pendingDeliveries,  color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-4 shadow-sm text-center"
          >
            {kpisLoading ? (
              <div className="h-7 w-12 mx-auto bg-gray-200 rounded animate-pulse" />
            ) : (
              <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
            )}
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      />

      {tab === "repartidores" && <RepartidoresTab />}
      {tab === "asignaciones" && <AsignacionesTab />}
      {tab === "permisos"     && <PermisosTab />}
    </div>
  );
}
