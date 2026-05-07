"use client";

import { SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle, ChevronDown, ChevronUp, RefreshCw,
  Download, Tag, Trash2, Package, DollarSign, CalendarClock,
  Loader2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpiryBatch {
  id: string;
  lote: string;
  productName: string;
  productId: number | null;
  productCategory: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  daysUntilExpiry: number;
  costUnit: number;
  salePrice: number;
  warehouseName: string | null;
  valorRiesgo: number;
}

type SectionId = "7d" | "15d" | "30d";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function exportListToExcel(rows: ExpiryBatch[], label: string) {
  const header = ["Producto", "Lote", "Fecha venc.", "Días", "Cantidad", "Unidad", "Costo unit.", "Valor riesgo", "Almacén"];
  const lines = [
    header.join(","),
    ...rows.map(r => [
      `"${r.productName}"`,
      `"${r.lote}"`,
      fmtDate(r.expiryDate),
      r.daysUntilExpiry,
      r.quantity,
      `"${r.unit}"`,
      Number(r.costUnit).toFixed(2),
      Number(r.valorRiesgo).toFixed(2),
      `"${r.warehouseName ?? ""}"`,
    ].join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vencimientos_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Section Component ─────────────────────────────────────────────────────────

function ExpirySection({
  id, label, rows, colorClass, bgClass, borderClass, collapsed, onToggle, onLiquidar, onDarBaja,
}: {
  id: SectionId;
  label: string;
  rows: ExpiryBatch[];
  colorClass: string;
  bgClass: string;
  borderClass: string;
  collapsed: boolean;
  onToggle: () => void;
  onLiquidar: (batch: ExpiryBatch) => void;
  onDarBaja: (batch: ExpiryBatch) => void;
}) {
  return (
    <div className={cn("bg-white dark:bg-card border rounded-xl overflow-hidden", borderClass)}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", bgClass.replace("bg-", "bg-"))} />
          <span className={cn("text-sm font-bold", colorClass)}>{label}</span>
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", bgClass, colorClass)}>
            {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); exportListToExcel(rows, id); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Exportar CSV"
            >
              <Download className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            </button>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />}
        </div>
      </button>

      {/* Table */}
      {!collapsed && (
        rows.length === 0 ? (
          <div className="px-4 py-6 text-center border-t border-[var(--rule-soft)] dark:border-card-border">
            <Package className="h-7 w-7 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin productos en este rango</p>
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--rule-soft)] dark:border-card-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5">
                  <th className="px-4 py-2.5 text-left text-[length:var(--ts-xs)] font-bold uppercase text-[var(--text-tertiary)]">Producto</th>
                  <th className="px-4 py-2.5 text-left text-[length:var(--ts-xs)] font-bold uppercase text-[var(--text-tertiary)] hidden sm:table-cell">Lote</th>
                  <th className="px-4 py-2.5 text-left text-[length:var(--ts-xs)] font-bold uppercase text-[var(--text-tertiary)]">Vence</th>
                  <th className="px-4 py-2.5 text-right text-[length:var(--ts-xs)] font-bold uppercase text-[var(--text-tertiary)]">Cantidad</th>
                  <th className="px-4 py-2.5 text-right text-[length:var(--ts-xs)] font-bold uppercase text-[var(--text-tertiary)] hidden md:table-cell">Valor riesgo</th>
                  <th className="px-4 py-2.5 text-center text-[length:var(--ts-xs)] font-bold uppercase text-[var(--text-tertiary)]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-[var(--text-primary)] text-xs">{row.productName}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{row.productCategory}</p>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-xs font-mono text-[var(--text-secondary)]">{row.lote}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-xs text-[var(--text-secondary)]">{fmtDate(row.expiryDate)}</p>
                      <p className={cn("text-[length:var(--ts-2xs)] font-bold", colorClass)}>{row.daysUntilExpiry}d</p>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-bold text-[var(--text-primary)]">{row.quantity} {row.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right hidden md:table-cell">
                      <span className="text-xs font-mono font-bold text-[var(--text-secondary)]">{fmt(row.valorRiesgo)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onLiquidar(row)}
                          title="Liquidar — crear promoción"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 hover:bg-[var(--data-warning-100)] dark:hover:bg-[var(--data-warning-500)]/30 transition-colors min-h-[32px]"
                        >
                          <Tag className="h-3 w-3" /> Liquidar
                        </button>
                        <button
                          onClick={() => onDarBaja(row)}
                          title="Dar de baja"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 hover:bg-[var(--data-error-100)] dark:hover:bg-[var(--data-error-500)]/30 transition-colors min-h-[32px]"
                        >
                          <Trash2 className="h-3 w-3" /> Dar baja
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExpiryAlertsDashboard() {
  const [batches, setBatches] = useState<ExpiryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>({
    "7d": false,
    "15d": false,
    "30d": false,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/expiry");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Error al cargar vencimientos");
      }
      const json = await res.json();
      const all: ExpiryBatch[] = json.batches ?? json.data ?? json ?? [];
      setBatches(all.filter(b => b.daysUntilExpiry >= 0 && b.daysUntilExpiry <= 30));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggle = (id: SectionId) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const rows7 = useMemo(() => batches.filter(b => b.daysUntilExpiry <= 7).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry), [batches]);
  const rows15 = useMemo(() => batches.filter(b => b.daysUntilExpiry > 7 && b.daysUntilExpiry <= 15).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry), [batches]);
  const rows30 = useMemo(() => batches.filter(b => b.daysUntilExpiry > 15 && b.daysUntilExpiry <= 30).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry), [batches]);

  const totalValor = useMemo(() => batches.reduce((s, b) => s + b.valorRiesgo, 0), [batches]);
  const lotesAfectados = useMemo(() => new Set(batches.map(b => b.lote)).size, [batches]);

  const handleLiquidar = useCallback(async (batch: ExpiryBatch) => {
    if (!confirm(`¿Crear promoción de liquidación para ${batch.productName} (${batch.quantity} ${batch.unit})?`)) return;
    setActionLoading(batch.id);
    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: `Liquidación — ${batch.productName}`,
          productId: batch.productId,
          batchId: batch.id,
          discountType: "PERCENTAGE",
          discountValue: 30,
          reason: "expiry_risk",
        }),
      });
      if (!res.ok) throw new Error("No se pudo crear la promoción");
      alert("Promoción de liquidación creada correctamente.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al liquidar");
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleDarBaja = useCallback(async (batch: ExpiryBatch) => {
    if (!confirm(`¿Dar de baja el lote ${batch.lote} de ${batch.productName}? Esta acción no se puede deshacer.`)) return;
    setActionLoading(batch.id);
    try {
      const res = await fetch(`/api/inventory/expiry/${batch.id}/writeoff`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason: "expiry" }),
      });
      if (!res.ok) throw new Error("No se pudo dar de baja el lote");
      setBatches(prev => prev.filter(b => b.id !== batch.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al dar de baja");
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleExportAll = () => {
    if (batches.length === 0) return;
    exportListToExcel(batches, "todos");
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        <button onClick={fetchData} className="text-xs text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[var(--data-warning-500)] text-white flex items-center justify-center  shrink-0">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">Alertas de Vencimiento</SectionTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Productos próximos a vencer en los próximos 30 días</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportAll}
            disabled={batches.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30 transition-colors min-h-[40px]"
            title="Exportar todo a CSV"
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Actualizar"
          >
            <RefreshCw className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 border-b-4 border-b-amber-500">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Productos</p>
          </div>
          <p className="text-2xl font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{batches.length}</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">por vencer en 30d</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 border-b-4 border-b-red-500">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Valor en riesgo</p>
          </div>
          <p className="text-lg font-extrabold font-mono text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{fmt(totalValor)}</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 border-b-4 border-b-orange-500">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Lotes afectados</p>
          </div>
          <p className="text-2xl font-extrabold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{lotesAfectados}</p>
        </div>
      </div>

      {/* Loading overlay for actions */}
      {actionLoading && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
          <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Procesando acción...</p>
        </div>
      )}

      {/* Sections */}
      <ExpirySection
        id="7d"
        label="Vencen en 7 días"
        rows={rows7}
        colorClass="text-[var(--data-error-600)] dark:text-red-400"
        bgClass="bg-red-100 dark:bg-red-900/30"
        borderClass="border-red-200 dark:border-red-800/40"
        collapsed={collapsed["7d"]}
        onToggle={() => toggle("7d")}
        onLiquidar={handleLiquidar}
        onDarBaja={handleDarBaja}
      />
      <ExpirySection
        id="15d"
        label="Vencen en 15 días"
        rows={rows15}
        colorClass="text-orange-600 dark:text-orange-400"
        bgClass="bg-orange-100 dark:bg-orange-900/30"
        borderClass="border-orange-200 dark:border-orange-800/40"
        collapsed={collapsed["15d"]}
        onToggle={() => toggle("15d")}
        onLiquidar={handleLiquidar}
        onDarBaja={handleDarBaja}
      />
      <ExpirySection
        id="30d"
        label="Vencen en 30 días"
        rows={rows30}
        colorClass="text-yellow-600 dark:text-yellow-400"
        bgClass="bg-yellow-100 dark:bg-yellow-900/30"
        borderClass="border-yellow-200 dark:border-yellow-800/40"
        collapsed={collapsed["30d"]}
        onToggle={() => toggle("30d")}
        onLiquidar={handleLiquidar}
        onDarBaja={handleDarBaja}
      />

      {/* Empty */}
      {batches.length === 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl py-16 text-center">
          <Package className="h-10 w-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-3" />
          <p className="text-sm font-medium text-[var(--text-secondary)] dark:text-muted">Sin productos por vencer en los próximos 30 días</p>
        </div>
      )}
    </div>
  );
}
