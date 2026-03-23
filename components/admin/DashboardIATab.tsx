"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Send,
  Loader2,
  Sun,
  Moon,
  Sunset,
  Clock,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  products: { id: string; stock?: number; stockMin?: number; price?: number }[];
  orders: { id: string; status: string; total?: number; createdAt: string }[];
  sales: { id: string; total: number; createdAt: string }[];
  payables: { id: string; amount: number; paidAmount: number; status: string; dueDate: string }[];
  alerts: {
    lowStock: number;
    pendingOrders: number;
    overduePayables: number;
  };
}

interface ExpiringBatch {
  id: string;
  productName?: string;
  expiresAt: string;
  quantity?: number;
}

interface ActionCard {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  action: string;
  href: string;
  color: "red" | "orange" | "yellow" | "blue";
}

interface Props {
  tenantId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): { text: string; icon: React.ElementType } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buenos dias", icon: Sun };
  if (h >= 12 && h < 18) return { text: "Buenas tardes", icon: Sunset };
  return { text: "Buenas noches", icon: Moon };
}

function getTodayRevenue(sales: DashboardData["sales"]): number {
  const today = new Date().toDateString();
  return sales
    .filter((s) => new Date(s.createdAt).toDateString() === today)
    .reduce((sum, s) => sum + (s.total ?? 0), 0);
}

function getYesterdayRevenue(sales: DashboardData["sales"]): number {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = y.toDateString();
  return sales
    .filter((s) => new Date(s.createdAt).toDateString() === yesterday)
    .reduce((sum, s) => sum + (s.total ?? 0), 0);
}

function getDebtTotal(
  payables: DashboardData["payables"],
): number {
  return payables
    .filter((p) => p.status !== "pagado")
    .reduce((sum, p) => sum + (p.amount - p.paidAmount), 0);
}

const COLOR_MAP = {
  red: {
    border: "border-l-red-500",
    bg: "bg-red-50 dark:bg-red-950/20",
    icon: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    button: "bg-red-600 hover:bg-red-700 text-white",
  },
  orange: {
    border: "border-l-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    icon: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    button: "bg-orange-600 hover:bg-orange-700 text-white",
  },
  yellow: {
    border: "border-l-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    icon: "text-yellow-600 dark:text-yellow-500",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
    button: "bg-yellow-600 hover:bg-yellow-700 text-white",
  },
  blue: {
    border: "border-l-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    icon: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    button: "bg-blue-600 hover:bg-blue-700 text-white",
  },
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 sm:p-5 animate-pulse"
        >
          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
          <div className="h-7 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
          <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      ))}
    </div>
  );
}

function ActionSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            <div className="flex-1">
              <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-3 w-56 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardIATab({ tenantId: _tenantId }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick chat state
  const [question, setQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, batchRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/batches/expiring?days=7"),
      ]);

      if (!dashRes.ok) throw new Error("Error al cargar datos del dashboard");

      const dashData = await dashRes.json();
      setData(dashData);

      if (batchRes.ok) {
        const batchData = await batchRes.json();
        setExpiring(Array.isArray(batchData.data) ? batchData.data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Quick chat handler ──────────────────────────────────────────────────

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || chatLoading) return;
    setChatLoading(true);
    setChatAnswer("");
    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, stream: false }),
      });
      if (!res.ok) throw new Error("Error del asistente");
      const json = await res.json();
      setChatAnswer(json.response ?? json.message ?? "Sin respuesta");
      setQuestion("");
    } catch {
      setChatAnswer("No pude responder en este momento. Intenta de nuevo.");
    }
    setChatLoading(false);
  };

  // ── Build action cards ──────────────────────────────────────────────────

  function buildActionCards(): ActionCard[] {
    if (!data) return [];
    const cards: ActionCard[] = [];

    if (data.alerts.pendingOrders > 0) {
      cards.push({
        id: "pending-orders",
        icon: ShoppingCart,
        title: `Tienes ${data.alerts.pendingOrders} pedido${data.alerts.pendingOrders > 1 ? "s" : ""} sin atender`,
        description: "Revisa y confirma los pedidos pendientes para no perder ventas.",
        action: "Ver pedidos",
        href: "pedidos",
        color: "red",
      });
    }

    if (expiring.length > 0) {
      cards.push({
        id: "expiring-batches",
        icon: Clock,
        title: `${expiring.length} producto${expiring.length > 1 ? "s" : ""} vence${expiring.length > 1 ? "n" : ""} esta semana`,
        description: "Ponlos en oferta o usalos primero para evitar perdidas.",
        action: "Revisar",
        href: "inventario-almacenes",
        color: "orange",
      });
    }

    if (data.alerts.lowStock > 0) {
      cards.push({
        id: "low-stock",
        icon: Package,
        title: `${data.alerts.lowStock} producto${data.alerts.lowStock > 1 ? "s" : ""} con stock bajo`,
        description: "Reabastecer para no quedarte sin productos importantes.",
        action: "Ver inventario",
        href: "inventario-almacenes",
        color: "yellow",
      });
    }

    const debt = getDebtTotal(data.payables ?? []);
    if (debt > 0) {
      cards.push({
        id: "debt",
        icon: CreditCard,
        title: `Debes ${formatCurrency(debt)} a proveedores`,
        description: "Revisa las facturas pendientes y programa los pagos.",
        action: "Ver deudas",
        href: "tesoreria",
        color: "blue",
      });
    }

    return cards;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-800/30 p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3">
          {error}
        </p>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Greeting skeleton */}
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
          <div className="h-4 w-72 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
        <KPISkeleton />
        <ActionSkeleton />
      </div>
    );
  }

  const todayRev = data ? getTodayRevenue(data.sales) : 0;
  const yesterdayRev = data ? getYesterdayRevenue(data.sales) : 0;
  const revTrend =
    yesterdayRev > 0
      ? ((todayRev - yesterdayRev) / yesterdayRev) * 100
      : null;
  const actionCards = buildActionCards();

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#2d6a4f]/10 dark:bg-[#2d6a4f]/20">
          <GreetingIcon className="w-5 h-5 text-[#2d6a4f] dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-foreground">
            {greeting.text}
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted">
            {actionCards.length > 0
              ? `Tienes ${actionCards.length} cosa${actionCards.length > 1 ? "s" : ""} que revisar hoy`
              : "Todo esta en orden. Buen trabajo."}
          </p>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Ventas hoy */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
              Ventas hoy
            </span>
            <DollarSign className="w-4 h-4 text-[#2d6a4f]" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">
            {formatCurrency(todayRev)}
          </p>
          {revTrend !== null && (
            <div
              className={cn(
                "flex items-center gap-1 mt-1 text-xs font-semibold",
                revTrend >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              {revTrend >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {revTrend >= 0 ? "+" : ""}
              {revTrend.toFixed(1)}% vs ayer
            </div>
          )}
        </div>

        {/* Pedidos pendientes */}
        <div
          className={cn(
            "bg-white dark:bg-card rounded-2xl border p-4 sm:p-5",
            data && data.alerts.pendingOrders > 0
              ? "border-red-300 dark:border-red-800/40"
              : "border-gray-200 dark:border-card-border",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
              Pedidos pendientes
            </span>
            <ShoppingCart
              className={cn(
                "w-4 h-4",
                data && data.alerts.pendingOrders > 0
                  ? "text-red-500"
                  : "text-gray-400",
              )}
            />
          </div>
          <p
            className={cn(
              "text-xl sm:text-2xl font-extrabold",
              data && data.alerts.pendingOrders > 0
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-foreground",
            )}
          >
            {data?.alerts.pendingOrders ?? 0}
          </p>
          <p className="text-xs text-gray-400 dark:text-muted mt-1">
            {data && data.alerts.pendingOrders > 0
              ? "Requieren atencion"
              : "Todo al dia"}
          </p>
        </div>

        {/* Productos por vencer */}
        <div
          className={cn(
            "bg-white dark:bg-card rounded-2xl border p-4 sm:p-5",
            expiring.length > 0
              ? "border-orange-300 dark:border-orange-800/40"
              : "border-gray-200 dark:border-card-border",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
              Por vencer (7d)
            </span>
            <Clock
              className={cn(
                "w-4 h-4",
                expiring.length > 0 ? "text-orange-500" : "text-gray-400",
              )}
            />
          </div>
          <p
            className={cn(
              "text-xl sm:text-2xl font-extrabold",
              expiring.length > 0
                ? "text-orange-600 dark:text-orange-400"
                : "text-gray-900 dark:text-foreground",
            )}
          >
            {expiring.length}
          </p>
          <p className="text-xs text-gray-400 dark:text-muted mt-1">
            {expiring.length > 0 ? "Revisar pronto" : "Sin urgencia"}
          </p>
        </div>

        {/* Stock bajo */}
        <div
          className={cn(
            "bg-white dark:bg-card rounded-2xl border p-4 sm:p-5",
            data && data.alerts.lowStock > 0
              ? "border-yellow-300 dark:border-yellow-800/40"
              : "border-gray-200 dark:border-card-border",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
              Stock bajo
            </span>
            <Package
              className={cn(
                "w-4 h-4",
                data && data.alerts.lowStock > 0
                  ? "text-yellow-500"
                  : "text-gray-400",
              )}
            />
          </div>
          <p
            className={cn(
              "text-xl sm:text-2xl font-extrabold",
              data && data.alerts.lowStock > 0
                ? "text-yellow-600 dark:text-yellow-500"
                : "text-gray-900 dark:text-foreground",
            )}
          >
            {data?.alerts.lowStock ?? 0}
          </p>
          <p className="text-xs text-gray-400 dark:text-muted mt-1">
            {data && data.alerts.lowStock > 0
              ? "Reabastecer"
              : "Inventario OK"}
          </p>
        </div>
      </div>

      {/* ── Action cards ─────────────────────────────────────────────────── */}
      {actionCards.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold text-gray-700 dark:text-foreground uppercase tracking-wide">
            Acciones sugeridas
          </h3>
          {actionCards.map((card) => {
            const colors = COLOR_MAP[card.color];
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className={cn(
                  "flex items-center gap-4 rounded-2xl border border-l-4 p-4",
                  colors.border,
                  colors.bg,
                  "border-gray-200 dark:border-card-border",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-card shrink-0",
                    colors.icon,
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-foreground">
                    {card.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                    {card.description}
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Dispatch navigation event for the admin shell
                    window.dispatchEvent(
                      new CustomEvent("admin:navigate", {
                        detail: { tab: card.href },
                      }),
                    );
                  }}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1",
                    colors.button,
                  )}
                >
                  {card.action}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── All clear ────────────────────────────────────────────────────── */}
      {actionCards.length === 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/30 p-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            Todo en orden
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
            No hay alertas ni acciones pendientes. Sigue asi.
          </p>
        </div>
      )}

      {/* ── Quick Chat ───────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 sm:p-5">
        <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide mb-3">
          Preguntale a tu asistente
        </p>

        {chatAnswer && (
          <div className="mb-3 bg-gray-50 dark:bg-surface rounded-xl p-3 text-sm text-gray-700 dark:text-foreground whitespace-pre-line">
            {chatAnswer}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAsk();
            }}
            placeholder="Preguntame sobre tu negocio..."
            className="flex-1 bg-gray-50 dark:bg-surface border border-gray-200 dark:border-card-border rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[#2d6a4f]/30 focus:border-[#2d6a4f] transition-colors"
            disabled={chatLoading}
          />
          <button
            onClick={() => void handleAsk()}
            disabled={chatLoading || !question.trim()}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-[#2d6a4f] hover:bg-[#245a42] disabled:opacity-50 text-white transition-colors"
          >
            {chatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
