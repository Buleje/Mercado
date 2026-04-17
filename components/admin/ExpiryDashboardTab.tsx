"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  Clock,
  XCircle,
  DollarSign,
  RefreshCw,
  Download,
  Tag,
  Trash2,
  CalendarClock,
  Package,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn, exportToCSV, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpiryBatch {
  id: string;
  lote: string;
  productName: string;
  productId: number | null;
  productCategory: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  entryDate: string;
  costUnit: number;
  salePrice: number;
  warehouseName: string | null;
  daysUntilExpiry: number;
  valorRiesgo: number;
}

interface ExpirySummary {
  expiredCount: number;
  weekCount: number;
  monthCount: number;
  totalAtRisk: number;
  valorExpired: number;
  valorWeek: number;
  valorMonth: number;
  valorTotalRiesgo: number;
}

interface ExpiryData {
  expired: ExpiryBatch[];
  expiresThisWeek: ExpiryBatch[];
  expiresThisMonth: ExpiryBatch[];
  summary: ExpirySummary;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d vencido`;
  if (days === 0) return "Vence hoy";
  return `${days}d restantes`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExpiryDashboardTab() {
  const [data, setData] = useState<ExpiryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<Record<string, boolean>>({
    expired: true,
    week: true,
    month: false,
  });
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/expiry");
      if (!res.ok) throw new Error("Error al obtener datos de vencimiento");
      const json: ExpiryData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleAction = async (batchId: string, action: "liquidar" | "baja") => {
    const label = action === "liquidar" ? "liquidar" : "dar de baja";
    if (!confirm(`¿Seguro que deseas ${label} este lote?`)) return;

    setActionLoading(batchId);
    try {
      const res = await fetch("/api/inventory/expiry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, action }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || `Error al ${label}`);
      }
      toast.success(
        action === "liquidar"
          ? "Lote marcado para liquidación"
          : "Lote dado de baja",
      );
      await fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Error al ${label}`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (!data) return;
    const allBatches = [...data.expired, ...data.expiresThisWeek, ...data.expiresThisMonth];
    if (allBatches.length === 0) {
      toast.info("No hay lotes para exportar.");
      return;
    }

    const rows = allBatches.map((b) => ({
      Producto: b.productName,
      Lote: b.lote,
      Categoria: b.productCategory,
      Cantidad: b.quantity,
      Unidad: b.unit,
      "Fecha Vencimiento": formatDate(b.expiryDate),
      "Dias para Vencer": b.daysUntilExpiry,
      "Costo Unitario": b.costUnit,
      "Valor en Riesgo": b.valorRiesgo,
      Almacen: b.warehouseName ?? "—",
      Estado:
        b.daysUntilExpiry < 0
          ? "Vencido"
          : b.daysUntilExpiry <= 7
            ? "Vence esta semana"
            : "Vence este mes",
    }));

    const fecha = new Date().toISOString().slice(0, 10);
    exportToCSV(rows, `vencimientos-${fecha}.csv`);
    toast.success("Archivo CSV descargado.");
  };

  // ── Filtered data ─────────────────────────────────────────────────────────

  const filterBatches = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    return (batches: ExpiryBatch[]) =>
      batches.filter(
        (b) =>
          b.productName.toLowerCase().includes(term) ||
          b.lote.toLowerCase().includes(term) ||
          b.productCategory.toLowerCase().includes(term),
      );
  }, [searchTerm]);

  const getFilteredBatches = (batches: ExpiryBatch[]) =>
    filterBatches ? filterBatches(batches) : batches;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Cargando datos de vencimiento...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <AlertCircle className="h-10 w-10 text-red-500" />
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">
            Control de Vencimientos
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Lotes vencidos y por vencer — acciones de liquidación y baja
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-[var(--rule-base)] dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-[var(--rule-base)] dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          icon={<XCircle className="h-5 w-5" />}
          iconBg="bg-red-100 dark:bg-red-900/40"
          iconColor="text-red-600 dark:text-red-400"
          label="Vencidos"
          value={summary.expiredCount.toString()}
          alert={summary.expiredCount > 0}
          alertColor="red"
        />
        <KPICard
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBg="bg-orange-100 dark:bg-orange-900/40"
          iconColor="text-orange-600 dark:text-orange-400"
          label="Vence esta semana"
          value={summary.weekCount.toString()}
          alert={summary.weekCount > 0}
          alertColor="orange"
        />
        <KPICard
          icon={<Clock className="h-5 w-5" />}
          iconBg="bg-amber-100 dark:bg-amber-900/40"
          iconColor="text-amber-600 dark:text-amber-400"
          label="Vence este mes"
          value={summary.monthCount.toString()}
          alert={summary.monthCount > 0}
          alertColor="amber"
        />
        <KPICard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-emerald-100 dark:bg-emerald-900/40"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label="Valor en riesgo"
          value={formatCurrency(summary.valorTotalRiesgo)}
        />
      </div>

      {/* ── Value breakdown mini-bar ───────────────────────────────────────── */}
      {summary.valorTotalRiesgo > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-[var(--rule-base)] p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Desglose del valor en riesgo
          </p>
          <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
            {summary.valorExpired > 0 && (
              <div
                className="bg-red-500 dark:bg-red-600 transition-all"
                style={{ width: `${(summary.valorExpired / summary.valorTotalRiesgo) * 100}%` }}
                title={`Vencidos: ${formatCurrency(summary.valorExpired)}`}
              />
            )}
            {summary.valorWeek > 0 && (
              <div
                className="bg-orange-400 dark:bg-orange-500 transition-all"
                style={{ width: `${(summary.valorWeek / summary.valorTotalRiesgo) * 100}%` }}
                title={`Esta semana: ${formatCurrency(summary.valorWeek)}`}
              />
            )}
            {summary.valorMonth > 0 && (
              <div
                className="bg-amber-300 dark:bg-amber-500 transition-all"
                style={{ width: `${(summary.valorMonth / summary.valorTotalRiesgo) * 100}%` }}
                title={`Este mes: ${formatCurrency(summary.valorMonth)}`}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Vencidos: {formatCurrency(summary.valorExpired)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
              7 días: {formatCurrency(summary.valorWeek)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              30 días: {formatCurrency(summary.valorMonth)}
            </span>
          </div>
        </div>
      )}

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar por producto, lote o categoría..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2.5 pl-10 text-sm bg-white dark:bg-gray-800 border border-[var(--rule-base)] rounded-lg text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors"
        />
        <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>

      {/* ── Section: Vencidos ──────────────────────────────────────────────── */}
      <BatchSection
        title="Vencidos"
        subtitle="Productos que ya pasaron su fecha de vencimiento"
        batches={getFilteredBatches(data.expired)}
        color="red"
        icon={<XCircle className="h-5 w-5" />}
        expanded={expandedSection.expired}
        onToggle={() =>
          setExpandedSection((s) => ({ ...s, expired: !s.expired }))
        }
        actionLoading={actionLoading}
        onAction={handleAction}
      />

      {/* ── Section: Vence esta semana ────────────────────────────────────── */}
      <BatchSection
        title="Vence esta semana"
        subtitle="Lotes que vencen en los próximos 7 días"
        batches={getFilteredBatches(data.expiresThisWeek)}
        color="orange"
        icon={<AlertTriangle className="h-5 w-5" />}
        expanded={expandedSection.week}
        onToggle={() => setExpandedSection((s) => ({ ...s, week: !s.week }))}
        actionLoading={actionLoading}
        onAction={handleAction}
      />

      {/* ── Section: Vence este mes ───────────────────────────────────────── */}
      <BatchSection
        title="Vence este mes"
        subtitle="Lotes que vencen en los próximos 30 días"
        batches={getFilteredBatches(data.expiresThisMonth)}
        color="amber"
        icon={<Clock className="h-5 w-5" />}
        expanded={expandedSection.month}
        onToggle={() => setExpandedSection((s) => ({ ...s, month: !s.month }))}
        actionLoading={actionLoading}
        onAction={handleAction}
      />

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {summary.totalAtRisk === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
            <CalendarClock className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            No hay lotes vencidos ni por vencer
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Todos los lotes tienen fechas de vencimiento mayores a 30 días
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KPICard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  alert = false,
  alertColor = "amber",
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  alert?: boolean;
  alertColor?: "amber" | "red" | "orange";
}) {
  const ringColors: Record<string, string> = {
    amber: "ring-amber-300 dark:ring-amber-600",
    red: "ring-red-300 dark:ring-red-600",
    orange: "ring-orange-300 dark:ring-orange-600",
  };

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl border border-[var(--rule-base)] p-4 flex flex-col gap-3 transition-shadow",
        alert && `ring-2 ${ringColors[alertColor] || ringColors.amber}`,
      )}
    >
      <div
        className={cn(
          "inline-flex items-center justify-center h-10 w-10 rounded-lg",
          iconBg,
        )}
      >
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
          {value}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}

function BatchSection({
  title,
  subtitle,
  batches,
  color,
  icon,
  expanded,
  onToggle,
  actionLoading,
  onAction,
}: {
  title: string;
  subtitle: string;
  batches: ExpiryBatch[];
  color: "red" | "orange" | "amber";
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  actionLoading: string | null;
  onAction: (batchId: string, action: "liquidar" | "baja") => void;
}) {
  const colorMap = {
    red: {
      bg: "bg-red-50 dark:bg-red-900/20",
      border: "border-red-200 dark:border-red-800/50",
      text: "text-red-700 dark:text-red-400",
      badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
      headerBg: "hover:bg-red-50/50 dark:hover:bg-red-900/10",
    },
    orange: {
      bg: "bg-orange-50 dark:bg-orange-900/20",
      border: "border-orange-200 dark:border-orange-800/50",
      text: "text-orange-700 dark:text-orange-400",
      badge: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
      headerBg: "hover:bg-orange-50/50 dark:hover:bg-orange-900/10",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      border: "border-amber-200 dark:border-amber-800/50",
      text: "text-amber-700 dark:text-amber-400",
      badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
      headerBg: "hover:bg-amber-50/50 dark:hover:bg-amber-900/10",
    },
  };

  const c = colorMap[color];

  if (batches.length === 0) return null;

  const totalValor = batches.reduce((s, b) => s + b.valorRiesgo, 0);

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl border overflow-hidden",
        c.border,
      )}
    >
      {/* Section header */}
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 transition-colors",
          c.headerBg,
        )}
      >
        <div className="flex items-center gap-2">
          <span className={c.text}>{icon}</span>
          <div className="text-left">
            <span className={cn("font-semibold text-sm", c.text)}>{title}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 hidden sm:inline">
              {subtitle}
            </span>
          </div>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full",
              c.badge,
            )}
          >
            {batches.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:block">
            {formatCurrency(totalValor)}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Table */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-t border-b border-[var(--rule-base)]">
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 dark:text-gray-400">
                  Producto
                </th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                  Lote
                </th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                  Vencimiento
                </th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                  Cantidad
                </th>
                <th className="text-center py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                  Estado
                </th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                  Valor
                </th>
                <th className="text-center py-2.5 px-3 font-medium text-gray-500 dark:text-gray-400">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {batch.productName}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {batch.productCategory}
                        {batch.warehouseName && ` · ${batch.warehouseName}`}
                      </p>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 font-mono text-xs">
                    {batch.lote}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 text-xs">
                    {formatDate(batch.expiryDate)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-900 dark:text-white tabular-nums">
                    {batch.quantity} {batch.unit}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <ExpiryBadge days={batch.daysUntilExpiry} />
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-900 dark:text-white tabular-nums text-xs">
                    {formatCurrency(batch.valorRiesgo)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onAction(batch.id, "liquidar")}
                        disabled={actionLoading === batch.id}
                        title="Liquidar (marcar para descuento)"
                        className="p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                      >
                        <Tag className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onAction(batch.id, "baja")}
                        disabled={actionLoading === batch.id}
                        title="Dar de baja (registrar como pérdida)"
                        className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)] dark:border-gray-600">
                <td
                  colSpan={5}
                  className="py-2.5 px-4 text-right font-semibold text-gray-600 dark:text-gray-300 text-sm"
                >
                  Total valor en riesgo:
                </td>
                <td
                  className={cn(
                    "py-2.5 px-3 text-right font-bold tabular-nums text-sm",
                    c.text,
                  )}
                >
                  {formatCurrency(totalValor)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpiryBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">
        <XCircle className="h-3 w-3" />
        {daysLabel(days)}
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full">
        <AlertCircle className="h-3 w-3" />
        Vence hoy
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full">
        <AlertTriangle className="h-3 w-3" />
        {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full">
      <Clock className="h-3 w-3" />
      {days}d
    </span>
  );
}
