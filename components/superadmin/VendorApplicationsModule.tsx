"use client";

/**
 * VendorApplicationsModule — Review de aplicaciones de vendedores.
 *
 * Superadmin ve todas las aplicaciones enviadas desde /vender/registro
 * y puede aprobar, rechazar con motivo o solicitar info adicional.
 */

import { useState, useMemo } from "react";
import {
  Building2,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  Search,
  Download,
  Eye,
  Check,
  X,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ApplicationDetailsDrawer,
  type VendorApplication,
} from "./vendor-applications/ApplicationDetailsDrawer";

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_APPLICATIONS: VendorApplication[] = [
  {
    id: "VA-001",
    businessName: "Bodega El Sol",
    ownerName: "Carlos Torres",
    ruc: "20123456789",
    phone: "987654321",
    email: "carlos@elsol.pe",
    district: "Yarinacocha",
    address: "Jr. Los Incas 234",
    category: "Abarrotes y minimarket",
    monthlyRevenue: "S/ 15,000 - 30,000",
    productsCount: 120,
    hasDelivery: true,
    hasPos: true,
    description:
      "Bodega familiar con 8 años de experiencia atendiendo al vecindario. Queremos expandirnos al delivery online.",
    status: "pendiente",
    submittedAt: "2026-04-15",
  },
  {
    id: "VA-002",
    businessName: "Panadería La Espiga Dorada",
    ownerName: "María Quispe",
    ruc: "20234567890",
    phone: "912345678",
    email: "maria@espigadorada.pe",
    district: "Callería",
    address: "Av. Pucallpa 567",
    category: "Panadería y repostería",
    monthlyRevenue: "S/ 8,000 - 15,000",
    productsCount: 45,
    hasDelivery: true,
    hasPos: false,
    description:
      "Panadería artesanal especializada en panes regionales. Producción diaria desde las 4am.",
    status: "pendiente",
    submittedAt: "2026-04-14",
  },
  {
    id: "VA-003",
    businessName: "Frutas Amazónicas S.A.C.",
    ownerName: "Juan Ramírez",
    ruc: "20345678901",
    phone: "965432109",
    email: "juan@frutasamazonicas.com",
    district: "Manantay",
    address: "Calle Las Palmeras 89",
    category: "Frutas y verduras",
    monthlyRevenue: "S/ 30,000+",
    productsCount: 80,
    hasDelivery: true,
    hasPos: true,
    description:
      "Mayorista de frutas amazónicas regionales. Atendemos a restaurantes y tiendas del centro.",
    status: "aprobada",
    submittedAt: "2026-04-01",
    reviewedAt: "2026-04-03",
  },
  {
    id: "VA-004",
    businessName: "Farmacia Vida Plena",
    ownerName: "Ana Mendoza",
    ruc: "20456789012",
    phone: "998877665",
    email: "ana@vidaplena.pe",
    district: "Centro",
    address: "Jr. Raymondi 456",
    category: "Farmacia",
    monthlyRevenue: "S/ 15,000 - 30,000",
    productsCount: 200,
    hasDelivery: false,
    hasPos: true,
    description: "Farmacia con servicio de delivery por WhatsApp.",
    status: "rechazada",
    submittedAt: "2026-03-25",
    reviewedAt: "2026-03-28",
    rejectReason:
      "Categoría Farmacia requiere certificación DIGEMID adicional. Por favor, envía el certificado vigente para reactivar tu solicitud.",
  },
  {
    id: "VA-005",
    businessName: "Pollería Sabor Norteño",
    ownerName: "Pedro Salas",
    ruc: "20567890123",
    phone: "934567890",
    email: "pedro@sabornorteno.pe",
    district: "Pueblo Libre",
    address: "Av. Centenario 123",
    category: "Restaurante y pollería",
    monthlyRevenue: "S/ 8,000 - 15,000",
    productsCount: 25,
    hasDelivery: true,
    hasPos: false,
    description: "Pollería con más de 5 años atendiendo en la zona.",
    status: "info_solicitada",
    submittedAt: "2026-04-10",
    reviewedAt: "2026-04-11",
    requestedInfo:
      "Por favor envía una foto del letrero exterior del local y copia de la ficha RUC al día.",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function calcReviewDays(submitted: string, reviewed?: string) {
  if (!reviewed) return null;
  const diff = new Date(reviewed).getTime() - new Date(submitted).getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

function exportCSV(rows: VendorApplication[]) {
  const headers = ["ID", "Razon social", "RUC", "Propietario", "Telefono", "Distrito", "Categoria", "Estado", "Enviada", "Revisada"];
  const csvRows = rows.map((r) => [
    r.id,
    r.businessName,
    r.ruc,
    r.ownerName,
    r.phone,
    r.district,
    r.category,
    r.status,
    r.submittedAt,
    r.reviewedAt ?? "",
  ]);
  const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendor_applications_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<VendorApplication["status"], string> = {
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning)]",
  aprobada: "bg-[var(--data-success-100)] text-[var(--data-success)]",
  rechazada: "bg-[var(--data-error-100)] text-[var(--data-error)]",
  info_solicitada: "bg-[var(--data-info-100)] text-[var(--data-info)]",
};

const STATUS_LABELS: Record<VendorApplication["status"], string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  info_solicitada: "Info solicitada",
};

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconColor,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white mt-1 tabular-nums">{value}</p>
          {subtitle && <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0")} style={{ backgroundColor: `${iconColor}15` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function VendorApplicationsModule() {
  const [apps, setApps] = useState<VendorApplication[]>(MOCK_APPLICATIONS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VendorApplication["status"] | "all">("pendiente");
  const [selected, setSelected] = useState<VendorApplication | null>(null);

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        a.businessName.toLowerCase().includes(q) ||
        a.ruc.includes(q) ||
        a.ownerName.toLowerCase().includes(q) ||
        a.district.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    });
  }, [apps, search, statusFilter]);

  // KPIs
  const pendientes = apps.filter((a) => a.status === "pendiente").length;
  const now = new Date();
  const thisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const aprobadasEsteMes = apps.filter(
    (a) => a.status === "aprobada" && a.reviewedAt && thisMonth(a.reviewedAt)
  ).length;
  const rechazadasEsteMes = apps.filter(
    (a) => a.status === "rechazada" && a.reviewedAt && thisMonth(a.reviewedAt)
  ).length;
  const reviewedApps = apps.filter((a) => a.reviewedAt);
  const avgReviewDays = reviewedApps.length > 0
    ? Math.round(
        reviewedApps
          .map((a) => calcReviewDays(a.submittedAt, a.reviewedAt) ?? 0)
          .reduce((s, d) => s + d, 0) / reviewedApps.length
      )
    : 0;

  const handleApprove = (id: string) => {
    setApps((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status: "aprobada" as const,
              reviewedAt: new Date().toISOString().split("T")[0],
            }
          : a
      )
    );
    setSelected(null);
  };

  const handleReject = (id: string, reason: string) => {
    setApps((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status: "rechazada" as const,
              reviewedAt: new Date().toISOString().split("T")[0],
              rejectReason: reason,
            }
          : a
      )
    );
    setSelected(null);
  };

  const handleRequestInfo = (id: string, info: string) => {
    setApps((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              status: "info_solicitada" as const,
              reviewedAt: new Date().toISOString().split("T")[0],
              requestedInfo: info,
            }
          : a
      )
    );
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            Aplicaciones de vendedores
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Review de onboarding para nuevos vendedores del marketplace
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pendientes"
          value={pendientes}
          icon={Clock}
          iconColor="#F59E0B"
          subtitle="Requieren revisión"
        />
        <StatCard
          label="Aprobadas este mes"
          value={aprobadasEsteMes}
          icon={CheckCircle}
          iconColor="#10B981"
          subtitle="Nuevos vendedores"
        />
        <StatCard
          label="Rechazadas este mes"
          value={rechazadasEsteMes}
          icon={XCircle}
          iconColor="#EF4444"
          subtitle="No aprobadas"
        />
        <StatCard
          label="Tiempo de review"
          value={`${avgReviewDays} días`}
          icon={Timer}
          iconColor="#3B82F6"
          subtitle="Promedio histórico"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por negocio, RUC, propietario o distrito..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as VendorApplication["status"] | "all")}
          className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="info_solicitada">Info solicitada</option>
        </select>
        <button
          onClick={() => exportCSV(filtered)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin aplicaciones que mostrar</p>
          <p className="text-xs mt-1">Ajusta los filtros para ver más.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Negocio</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden sm:table-cell">RUC</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Distrito</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Fecha</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900 dark:text-white">{a.businessName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.ownerName}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{a.ruc}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {a.district}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      <span className="text-xs">{a.category}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      <span className="text-xs">{fmtDate(a.submittedAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[a.status])}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelected(a)}
                          className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {a.status === "pendiente" && (
                          <>
                            <button
                              onClick={() => handleApprove(a.id)}
                              className="p-2 rounded-lg text-gray-400 hover:text-[var(--data-success)] hover:bg-[var(--data-success-50)] dark:hover:bg-[var(--data-success)]/20 transition-colors"
                              title="Aprobar"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSelected(a)}
                              className="p-2 rounded-lg text-gray-400 hover:text-[var(--data-info)] hover:bg-[var(--data-info-50)] dark:hover:bg-[var(--data-info)]/20 transition-colors"
                              title="Solicitar info"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setSelected(a)}
                              className="p-2 rounded-lg text-gray-400 hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20 transition-colors"
                              title="Rechazar"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <ApplicationDetailsDrawer
          application={selected}
          onClose={() => setSelected(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onRequestInfo={handleRequestInfo}
        />
      )}
    </div>
  );
}
