"use client";

/**
 * GiftCardsAdminModule — Gestión admin de gift cards.
 *
 * Bridge ENRICH-5 para las gift cards que los clientes compran desde
 * marketplace. Admin puede validar códigos, cancelar con reembolso,
 * extender vencimientos y emitir cards manuales por compensación.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
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
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import KPICard from "@/components/admin/shared/KPICard";
import {
  GiftCardDetailsModal,
  type GiftCardDetails,
} from "./gift-cards-admin/GiftCardDetailsModal";
import { CreateManualGiftCardModal } from "./gift-cards-admin/CreateManualGiftCardModal";

// ADR-077: cargar data real desde el backend.
type AdminStats = {
  vendidas30d: number;
  ingreso30d: number;
  canjeadas30d: number;
  saldoPendiente: number;
  totalActivas: number;
  totalCanceladas: number;
};

type ApiGiftCard = {
  id: string;
  code: string; // masked "****-****-****-XXXX"
  amount: number;
  balance: number;
  recipientName: string;
  recipientContact?: string;
  senderName?: string;
  message?: string;
  status: "activa" | "canjeada" | "expirada";
  createdAt: string;
  expiresAt?: string | null;
  redeemedAt?: string | null;
};

function toGiftCardDetails(card: ApiGiftCard): GiftCardDetails {
  const statusMap: Record<string, GiftCardDetails["status"]> = {
    activa: "pendiente",
    canjeada: "canjeada",
    expirada: "expirada",
  };
  return {
    id: card.id,
    code: card.code,
    amount: card.amount,
    balance: card.balance,
    recipientName: card.recipientName,
    recipientPhone: card.recipientContact,
    senderName: card.senderName ?? "",
    message: card.message ?? "",
    status: statusMap[card.status] ?? "pendiente",
    createdAt: card.createdAt,
    expiresAt: card.expiresAt ?? "",
    redeemedAt: card.redeemedAt ?? undefined,
  };
}

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
    Number(r.amount).toFixed(2),
    Number(r.balance).toFixed(2),
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
  pendiente: "bg-[var(--data-success-100)] text-[var(--data-success-500)]",
  canjeada: "bg-[var(--data-info-100)] text-[var(--data-info-500)]",
  expirada: "bg-gray-100 text-[var(--text-secondary)]",
  cancelada: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function GiftCardsAdminModule() {
  const [cards, setCards] = useState<GiftCardDetails[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GiftCardDetails["status"] | "all">("all");
  const [selected, setSelected] = useState<GiftCardDetails | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/admin/gift-cards", { cache: "no-store" }),
        fetch("/api/admin/gift-cards/stats", { cache: "no-store" }),
      ]);
      if (listRes.ok) {
        const data = (await listRes.json()) as { cards: ApiGiftCard[] };
        setCards(data.cards.map(toGiftCardDetails));
      } else {
        // Dev fallback: si no hay auth admin, dejamos el array vacio
        setCards([]);
      }
      if (statsRes.ok) {
        const data = (await statsRes.json()) as { stats: AdminStats };
        setStats(data.stats);
      }
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Suprimir referencias no usadas al mock (se deja para referencia rápida en dev).
  void MOCK_CARDS;

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

  // KPIs: prioriza stats reales del backend; fallback calculo local sobre las
  // cards cargadas si stats aun no esta disponible.
  const vendidasEsteMes = stats?.vendidas30d ?? cards.length;
  const canjeadasEsteMes = stats?.canjeadas30d ?? cards.filter((c) => c.redeemedAt).length;
  const ingresoEsteMes =
    stats?.ingreso30d ?? cards.reduce((sum, c) => sum + c.amount, 0);
  const saldoPendiente =
    stats?.saldoPendiente ??
    cards
      .filter((c) => c.status === "pendiente")
      .reduce((sum, c) => sum + c.balance, 0);

  const handleCancel = async (id: string) => {
    const reason = window.prompt("Motivo de la cancelacion:", "Solicitud del cliente");
    if (!reason || reason.trim().length < 3) return;

    try {
      const res = await fetch(`/api/admin/gift-cards/${id}/cancel`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) {
        setCards((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "cancelada", balance: 0 } : c)),
        );
        setSelected(null);
        void refetch();
      }
    } catch {
      /* noop */
    }
  };

  const handleExtend = async (id: string, newExpiry: string) => {
    try {
      const res = await fetch(`/api/admin/gift-cards/${id}/extend`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresAt: newExpiry }),
      });
      if (!res.ok) return;
      const iso = new Date(newExpiry).toISOString();
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, expiresAt: iso } : c)),
      );
      setSelected((s) => (s?.id === id ? { ...s, expiresAt: iso } : s));
      void refetch();
    } catch {
      /* noop: la UI no cambia si falla la persistencia */
    }
  };

  const handleCreate = async (data: {
    amount: number;
    recipientName: string;
    recipientPhone: string;
    message: string;
    expiresAt: string;
    reason: string;
  }) => {
    try {
      const res = await fetch("/api/admin/gift-cards/issue-manual", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          amount: Math.floor(data.amount),
          recipientName: data.recipientName,
          recipientPhone: data.recipientPhone || null,
          message: data.message || undefined,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
          reason: data.reason,
        }),
      });
      if (!res.ok) {
        throw new Error("No se pudo emitir la gift card");
      }
      const payload = (await res.json()) as {
        plainCode?: string;
        giftCard?: ApiGiftCard;
      };
      if (payload.plainCode) setIssuedCode(payload.plainCode);
      if (payload.giftCard) {
        setCards((prev) => [toGiftCardDetails(payload.giftCard!), ...prev]);
      }
      void refetch();
    } catch {
      throw new Error("No se pudo emitir la gift card. Intenta nuevamente.");
    }
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
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Emitir manual
        </button>
      </AdminModuleHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Vendidas (30d)"
          value={vendidasEsteMes}
          icon={Gift}
          color="var(--accent)"
          subtitle="Tarjetas emitidas"
        />
        <KPICard
          label="Ingreso (30d)"
          value={fmt(ingresoEsteMes)}
          icon={DollarSign}
          color="#10B981"
          subtitle="Monto vendido"
        />
        <KPICard
          label="Canjeadas (30d)"
          value={canjeadasEsteMes}
          icon={CheckCircle}
          color="#3B82F6"
          subtitle="Tarjetas redimidas"
        />
        <KPICard
          label="Saldo pendiente"
          value={fmt(saldoPendiente)}
          icon={Wallet}
          color="#ff6b5b"
          subtitle="Pasivo por canjear"
          alert={saldoPendiente > 2000}
        />
      </div>

      {loading && (
        <div className="text-xs text-[var(--text-tertiary)]">Cargando datos...</div>
      )}

      {/* Modal cuando un admin emite gift card manual — muestra el plainCode UNA vez */}
      {issuedCode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setIssuedCode(null)}
        >
          <div
            className="bg-white dark:bg-[var(--color-card)] rounded-2xl shadow-2xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">
              Codigo generado
            </CardTitle>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Este codigo solo se muestra UNA vez. Copialo y entregalo al destinatario
              (WhatsApp, email, impreso). No lo podemos recuperar despues.
            </p>
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-gray-100 px-3 py-3">
              <code className="font-mono text-base font-bold tracking-wider text-[var(--text-primary)]">
                {issuedCode}
              </code>
              <button
                type="button"
                onClick={() => {
                  // Clipboard best-effort — falla por permisos del browser.
                  navigator.clipboard.writeText(issuedCode).catch(() => { /* clipboard best-effort */ });
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
              >
                Copiar
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIssuedCode(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            placeholder="Buscar por destinatario, código o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
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
        <div className="text-center py-16 text-[var(--text-tertiary)] bg-white dark:bg-[var(--color-card)] border border-gray-100 rounded-2xl">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin gift cards para mostrar</p>
          <p className="text-xs mt-1">Ajusta los filtros o emite una gift card manual.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[var(--color-card)] border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
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
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{c.id}</p>
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
                    <td className="px-4 py-3 text-right text-primary font-bold hidden lg:table-cell">
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
                          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {c.status === "pendiente" && (
                          <button
                            onClick={() => handleCancel(c.id)}
                            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
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
