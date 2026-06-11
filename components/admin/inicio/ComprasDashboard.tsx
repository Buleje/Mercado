"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import {
  Truck, DollarSign, AlertTriangle,
  Clock, ShoppingCart, CreditCard, CalendarDays,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const ComprasCharts = dynamic(() => import("./ComprasCharts"), { ssr: false });
const ComprasAdvancedCharts = dynamic(
  () => import("./ComprasAdvancedCharts").then((m) => ({ default: m.ComprasAdvancedCharts })),
  { ssr: false },
);
// DashboardSectionHeader removido 2026-04-24 — ver decision UX en render.
import { BulejeDashboardSkeleton } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";

// ── Types ────────────────────────────────────────────────────────────────────

interface Purchase {
  id: string; supplierId: string; supplierName: string;
  total: number; status: string; createdAt?: string;
}
interface Payable {
  id: string; supplierId: string; supplierName: string;
  amount: number; paidAmount: number; status: string; dueDate: string;
}
interface Supplier {
  id: string; name: string; phone: string; email: string; createdAt: string;
}

export interface ComprasData {
  // KPIs
  totalCompras: number;
  cantidadOrdenes: number;
  totalProveedores: number;
  deudaPendiente: number;
  cuentasVencidas: number;
  promedioOrden: number;
  // Deltas
  dCompras: number | null;
  // Charts
  comprasPorProveedor: { nombre: string; total: number; ordenes: number; color: string }[];
  comprasDiarias: { dia: string; total: number }[];
  estadoCuentas: { estado: string; cantidad: number; monto: number; color: string }[];
  cuentasPorVencer: { nombre: string; monto: number; diasRestantes: number; status: "vencido" | "urgente" | "pendiente" }[];
  topProveedores: { nombre: string; total: number; ordenes: number }[];
  comprasMensuales: { mes: string; total: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
const PROV_COLORS = ["var(--accent)", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#10b981", "#f97316", "#6366f1"];

// ── Main Component ───────────────────────────────────────────────────────────

interface ComprasDashboardProps {
  dateRange: DateRange;
  onChangeRange?: (r: DateRange) => void;
}

export default function ComprasDashboard({ dateRange, onChangeRange }: ComprasDashboardProps) {
  const { data: shared, loading, error, refresh } = useDashboardData();

  const purchases = (shared?.purchases ?? []) as Purchase[];
  const payables = (shared?.payables ?? []) as Payable[];
  const suppliers = (shared?.suppliers ?? []) as Supplier[];
  const raw = shared ? { purchases, payables, suppliers } : null;

  const data = useMemo<ComprasData | null>(() => {
    if (!raw) return null;
    const { purchases, payables, suppliers } = raw;
    const { from, to } = dateRange;
    const now = new Date();

    // Filter by date range
    const periodPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= from && new Date(p.createdAt) <= to);

    // Previous period
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);
    const prevPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= prevFrom && new Date(p.createdAt) <= prevTo);

    // KPIs
    const totalCompras = periodPurchases.reduce((a, p) => a + p.total, 0);
    const cantidadOrdenes = periodPurchases.length;
    const totalProveedores = suppliers.length;
    const deudaPendiente = payables.filter(p => p.status !== "pagado").reduce((a, p) => a + (p.amount - p.paidAmount), 0);
    const cuentasVencidas = payables.filter(p => p.status !== "pagado" && new Date(p.dueDate) < now).length;
    const promedioOrden = cantidadOrdenes > 0 ? totalCompras / cantidadOrdenes : 0;

    // Delta
    const prevTotal = prevPurchases.reduce((a, p) => a + p.total, 0);
    const dCompras = prevTotal === 0 ? null : ((totalCompras - prevTotal) / prevTotal) * 100;

    // Purchases by supplier
    const provMap = new Map<string, { nombre: string; total: number; ordenes: number }>();
    periodPurchases.forEach(p => {
      const e = provMap.get(p.supplierId) ?? { nombre: p.supplierName, total: 0, ordenes: 0 };
      e.total += p.total; e.ordenes++;
      provMap.set(p.supplierId, e);
    });
    const comprasPorProveedor = [...provMap.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((p, i) => ({ ...p, color: PROV_COLORS[i % PROV_COLORS.length] }));

    // Daily purchases
    const dayMap = new Map<string, number>();
    periodPurchases.forEach(p => {
      if (!p.createdAt) return;
      const k = dateKey(new Date(p.createdAt));
      dayMap.set(k, (dayMap.get(k) ?? 0) + p.total);
    });
    const comprasDiarias = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([k, v]) => ({ dia: dayLabel(k), total: v }));

    // Account status (payables)
    const statusGroups = [
      { key: "pagado", label: "Pagado", color: "var(--accent)" },
      { key: "parcial", label: "Parcial", color: "#f59e0b" },
      { key: "pendiente", label: "Pendiente", color: "#3b82f6" },
      { key: "vencido", label: "Vencido", color: "#ef4444" },
    ];
    const estadoCuentas = statusGroups.map(s => {
      const matching = payables.filter(p => {
        if (s.key === "vencido") return p.status !== "pagado" && new Date(p.dueDate) < now;
        return p.status === s.key;
      });
      return { estado: s.label, cantidad: matching.length, monto: matching.reduce((a, p) => a + (p.amount - p.paidAmount), 0), color: s.color };
    }).filter(s => s.cantidad > 0);

    // Upcoming due accounts
    const cuentasPorVencer = payables
      .filter(p => p.status !== "pagado")
      .map(p => {
        const due = new Date(p.dueDate);
        const diasRestantes = Math.round((due.getTime() - now.getTime()) / 86400000);
        const status: "vencido" | "urgente" | "pendiente" = diasRestantes < 0 ? "vencido" : diasRestantes < 7 ? "urgente" : "pendiente";
        return { nombre: p.supplierName, monto: p.amount - p.paidAmount, diasRestantes, status };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 10);

    // Top suppliers (all time)
    const allProvMap = new Map<string, { nombre: string; total: number; ordenes: number }>();
    purchases.forEach(p => {
      const e = allProvMap.get(p.supplierId) ?? { nombre: p.supplierName, total: 0, ordenes: 0 };
      e.total += p.total; e.ordenes++;
      allProvMap.set(p.supplierId, e);
    });
    const topProveedores = [...allProvMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    // Monthly purchases (last 6 months)
    const comprasMensuales: ComprasData["comprasMensuales"] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
      const total = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= mStart && new Date(p.createdAt) <= mEnd).reduce((a, p) => a + p.total, 0);
      comprasMensuales.push({ mes: label, total });
    }

    return {
      totalCompras, cantidadOrdenes, totalProveedores, deudaPendiente, cuentasVencidas, promedioOrden,
      dCompras, comprasPorProveedor, comprasDiarias, estadoCuentas, cuentasPorVencer, topProveedores, comprasMensuales,
    };
  }, [raw, dateRange]);

  if (loading) return <BulejeDashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  if (data.totalCompras === 0 && data.cantidadOrdenes === 0) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="compras"
        onChangeRange={onChangeRange}
        action={{ label: "Registrar compra", href: "/admin?tab=compras" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero removido 2026-04-24: los KPI tiles ya comunican el contenido. */}

      {/* ── KPI Hero Row · ADR-068 armonía estricta ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Compras" value={fmt(data.totalCompras)} icon={DollarSign} delta={data.dCompras} />
        <StatCard label="Órdenes" value={String(data.cantidadOrdenes)} icon={ShoppingCart} />
        <StatCard label="Proveedores" value={String(data.totalProveedores)} icon={Truck} />
        <StatCard label="Deuda Pendiente" value={fmt(data.deudaPendiente)} icon={CreditCard} emphasis={data.deudaPendiente > 0 ? "warning" : "success"} />
        <StatCard label="Cuentas Vencidas" value={String(data.cuentasVencidas)} icon={AlertTriangle} emphasis={data.cuentasVencidas > 0 ? "error" : "success"} />
        <StatCard label="Prom. Orden" value={fmt(data.promedioOrden)} icon={CalendarDays} />
      </div>

      {/* ── Alert bar ── */}
      {data.cuentasVencidas > 0 && (
        <div className="flex items-center gap-3 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 px-5 py-3">
          <Clock className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-medium">
            {data.cuentasVencidas} cuenta{data.cuentasVencidas > 1 ? "s" : ""} vencida{data.cuentasVencidas > 1 ? "s" : ""} por un total de {fmt(data.deudaPendiente)}
          </p>
        </div>
      )}

      {/* ── Charts base (diarias, mensual, top prov, estado cuentas, por vencer, histórico) ── */}
      <ComprasCharts data={data} />

      {/* ── Charts especializados (pareto, salud, anual, mix, waterfall, comparativa) ── */}
      <ComprasAdvancedCharts />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-28" />)}
      </div>
      <div className="bg-[var(--surface-sunken)] rounded-xl h-12" />
      <div className="bg-[var(--surface-sunken)] rounded-xl h-[380px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
        <div className="bg-[var(--surface-sunken)] rounded-xl h-[320px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-[var(--surface-sunken)] rounded-xl h-[260px]" />)}
      </div>
    </div>
  );
}
