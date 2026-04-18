"use client";

/**
 * GiftCardsAdminModule — Gestión admin de gift cards.
 *
 * Bridge ENRICH-5 para las gift cards que los clientes compran desde
 * marketplace. Admin puede validar códigos, cancelar con reembolso,
 * extender vencimientos y emitir cards manuales por compensación.
 */

import { useState, useMemo } from "react";
import {
  Gift,
  DollarSign,
  CheckCircle,
  Wallet,
  Download,
  Plus,
  Search,
  Eye,
  Calendar,
  Trash2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import KPICard from "@/components/admin/shared/KPICard";
import {
  GiftCardDetailsModal,
  type GiftCardDetails,
} from "./gift-cards-admin/GiftCardDetailsModal";
import { CreateManualGiftCardModal } from "./gift-cards-admin/CreateManualGiftCardModal";

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_CARDS: GiftCardDetails[] = [
  {
    id: "GC-001",
    code: "GIFT-ABCD1234",
    amount: 100,
    balance: 100,
    recipientName: "Ana Torres",
    recipientPhone: "987654321",
    senderName: "Juan Pérez",
    message: "Feliz cumpleaños, que disfrutes!",
    status: "pendiente",
    createdAt: "2026-04-10",
    expiresAt: "2027-04-10",
  },
  {
    id: "GC-002",
    code: "GIFT-XYZ5678Q",
    amount: 50,
    balance: 0,
    recipientName: "Carlos Mendoza",
    recipientPhone: "912345678",
    senderName: "María López",
    message: "",
    status: "canjeada",
    createdAt: "2026-03-15",
    expiresAt: "2027-03-15",
    redeemedAt: "2026-04-02",
    redeemedBy: "Pedido #ORD-5812",
  },
  {
    id: "GC-003",
    code: "GIFT-PQRS9012",
    amount: 200,
    balance: 200,
    recipientName: "Rosa Quispe",
    senderName: "Empresa XYZ",
    message: "Por tu colaboración este año.",
    status: "pendiente",
    createdAt: "2026-04-01",
    expiresAt: "2026-12-31",
  },
  {
    id: "GC-004",
    code: "GIFT-TUVW3456",
    amount: 75,
    balance: 75,
    recipientName: "Luis Ramos",
    message: "",
    status: "expirada",
    createdAt: "2024-10-01",
    expiresAt: "2025-10-01",
  },
  {
    id: "GC-005",
    code: "GIFT-HJKL7890",
    amount: 150,
    balance: 50,
    recipientName: "Sofía Mendez",
    recipientPhone: "998877665",
    senderName: "Cortesía bodega",
    message: "Compensación por demora en pedido",
    status: "canjeada",
    createdAt: "2026-04-05",
    expiresAt: "2027-04-05",
    redeemedAt: "2026-04-12",
    redeemedBy: "Pedido #ORD-5901",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

function maskCode(code: string) {
  if (code.length < 8) return code;
  const prefix = code.substring(0, 5);
  const suffix = code.substring(code.length - 4);
  return `${prefix}•••••${suffix}`;
}

function exportCSV(rows: GiftCardDetails[]) {
  const headers = ["ID", "Codigo", "Monto", "Saldo", "Destinatario", "Estado", "Emitida", "Vence", "Canjeada"];
  const csvRows = rows.map((r) => [
    r.id,
    r.code,
    r.amount.toFixed(2),
    r.balance.toFixed(2),
    r.recipientName,
    r.status,
    r.createdAt,
    r.expiresAt,
    r.redeemedAt ?? "",
  ]);
  const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gift_cards_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Styles ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<GiftCardDetails["status"], string> = {
  pendiente: "Pendiente",
  canjeada: "Canjeada",
  expirada: "Expirada",
  cancelada: "Cancelada",
};

const STATUS_STYLES: Record<GiftCardDetails["status"], string> = {
  pendiente: "bg-[var(--data-success-100)] text-[var(--data-success)]",
  canjeada: "bg-[var(--data-info-100)] text-[var(--data-info)]",
  expirada: "bg-gray-100 text-[var(--text-secondary)]",
  cancelada: "bg-[var(--data-error-100)] text-[var(--data-error)]",
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function GiftCardsAdminModule() {
  const [cards, setCards] = useState<GiftCardDetails[]>(MOCK_CARDS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GiftCardDetails["status"] | "all">("all");
  const [selected, setSelected] = useState<GiftCardDetails | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.recipientName.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
  }, [cards, search, statusFilter]);

  // KPIs este mes
  const now = new Date();
  const thisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const vendidasEsteMes = cards.filter((c) => thisMonth(c.createdAt));
  const canjeadasEsteMes = cards.filter((c) => c.redeemedAt && thisMonth(c.redeemedAt));
  const ingresoEsteMes = vendidasEsteMes.reduce((sum, c) => sum + c.amount, 0);
  const saldoPendiente = cards
    .filter((c) => c.status === "pendiente")
    .reduce((sum, c) => sum + c.balance, 0);

  const handleCancel = (id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "cancelada" as const, balance: 0 } : c))
    );
    setSelected(null);
  };

  const handleExtend = (id: string, newExpiry: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, expiresAt: newExpiry } : c))
    );
    setSelected((s) => (s?.id === id ? { ...s, expiresAt: newExpiry } : s));
  };

  const handleCreate = async (data: {
    amount: number;
    recipientName: string;
    recipientPhone: string;
    message: string;
    expiresAt: string;
    reason: string;
  }) => {
    const code = `GIFT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const newCard: GiftCardDetails = {
      id: `GC-${Date.now()}`,
      code,
      amount: data.amount,
      balance: data.amount,
      recipientName: data.recipientName,
      recipientPhone: data.recipientPhone,
      senderName: `Admin (${data.reason})`,
      message: data.message,
      status: "pendiente",
      createdAt: new Date().toISOString().split("T")[0],
      expiresAt: data.expiresAt || (() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split("T")[0];
      })(),
    };
    setCards((prev) => [newCard, ...prev]);
  };

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Gift Cards"
        description="Gestiona tarjetas regalo vendidas y emite cards manuales"
        icon={Gift}
      >
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00B4A6] text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Emitir manual
        </button>
      </AdminModuleHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Vendidas este mes"
          value={vendidasEsteMes.length}
          icon={Gift}
          color="#00B4A6"
          subtitle="Tarjetas emitidas"
        />
        <KPICard
          label="Ingreso este mes"
          value={fmt(ingresoEsteMes)}
          icon={DollarSign}
          color="#10B981"
          subtitle="Monto vendido"
        />
        <KPICard
          label="Canjeadas este mes"
          value={canjeadasEsteMes.length}
          icon={CheckCircle}
          color="#3B82F6"
          subtitle="Tarjetas redimidas"
        />
        <KPICard
          label="Saldo pendiente"
          value={fmt(saldoPendiente)}
          icon={Wallet}
          color="#F59E0B"
          subtitle="Pasivo por canjear"
          alert={saldoPendiente > 2000}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            placeholder="Buscar por destinatario, código o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-[#00B4A6]/30 focus:border-[#00B4A6] outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as GiftCardDetails["status"] | "all")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm cursor-pointer"
        >
          <option value="all">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="canjeada">Canjeadas</option>
          <option value="expirada">Expiradas</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <button
          onClick={() => exportCSV(filtered)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)] bg-white border border-gray-100 rounded-2xl">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin gift cards para mostrar</p>
          <p className="text-xs mt-1">Ajusta los filtros o emite una gift card manual.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden sm:table-cell">Destinatario</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Monto</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden lg:table-cell">Saldo</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide hidden md:table-cell">Vence</th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-bold text-[var(--text-primary)]">{maskCode(c.code)}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{c.id}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="font-semibold text-[var(--text-primary)] text-sm">{c.recipientName}</p>
                      {c.message && (
                        <p className="text-xs text-[var(--text-tertiary)] italic truncate max-w-xs">{c.message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                      {fmt(c.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#00B4A6] font-bold hidden lg:table-cell">
                      {fmt(c.balance)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] hidden md:table-cell">
                      <span className="flex items-center gap-1 text-xs">
                        <Calendar className="h-3 w-3" />
                        {fmtDate(c.expiresAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-bold", STATUS_STYLES[c.status])}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelected(c)}
                          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {c.status === "pendiente" && (
                          <button
                            onClick={() => handleCancel(c.id)}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] transition-colors"
                            title="Cancelar y reembolsar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
        <GiftCardDetailsModal
          card={selected}
          onClose={() => setSelected(null)}
          onCancel={handleCancel}
          onExtend={handleExtend}
        />
      )}

      {showCreate && (
        <CreateManualGiftCardModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
