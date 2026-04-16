"use client";

import { useMemo } from "react";
import {
  Truck, DollarSign, Users, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Clock, ShoppingCart, CreditCard, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const ComprasCharts = dynamic(() => import("./ComprasCharts"), { ssr: false });

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

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
const PROV_COLORS = ["#00B4A6", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#10b981", "#f97316", "#6366f1"];

// ── Main Component ───────────────────────────────────────────────────────────

interface ComprasDashboardProps {
  dateRange: DateRange;
}

export default function ComprasDashboard({ dateRange }: ComprasDashboardProps) {
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
      { key: "pagado", label: "Pagado", color: "#10b981" },
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

  if (loading) return <DashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <p className="text-sm text-gray-600 dark:text-gray-400">{error}</p>
      <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* ── KPI Hero Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard label="Total Compras" value={fmt(data.totalCompras)} Icon={DollarSign} delta={data.dCompras} accent="blue" />
        <KPICard label="Órdenes" value={String(data.cantidadOrdenes)} Icon={ShoppingCart} accent="violet" />
        <KPICard label="Proveedores" value={String(data.totalProveedores)} Icon={Truck} accent="emerald" />
        <KPICard label="Deuda Pendiente" value={fmt(data.deudaPendiente)} Icon={CreditCard} accent={data.deudaPendiente > 0 ? "amber" : "emerald"} />
        <KPICard label="Cuentas Vencidas" value={String(data.cuentasVencidas)} Icon={AlertTriangle} accent={data.cuentasVencidas > 0 ? "red" : "emerald"} />
        <KPICard label="Prom. Orden" value={fmt(data.promedioOrden)} Icon={CalendarDays} accent="cyan" />
      </div>

      {/* ── Alert bar ── */}
      {data.cuentasVencidas > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-5 py-3">
          <Clock className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-400 font-medium">
            {data.cuentasVencidas} cuenta{data.cuentasVencidas > 1 ? "s" : ""} vencida{data.cuentasVencidas > 1 ? "s" : ""} por un total de {fmt(data.deudaPendiente)}
          </p>
        </div>
      )}

      {/* ── Charts ── */}
      <ComprasCharts data={data} />
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, Icon, delta, accent }: {
  label: string; value: string;
  Icon: React.ComponentType<{ className?: string }>;
  delta?: number | null;
  accent: "emerald" | "blue" | "violet" | "cyan" | "amber" | "red";
}) {
  const isPositive = delta != null ? delta >= 0 : false;
  const colorMap = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-500" },
    blue: { bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "text-emerald-500" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/30", icon: "text-violet-500" },
    cyan: { bg: "bg-cyan-50 dark:bg-cyan-950/30", icon: "text-cyan-500" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "text-amber-500" },
    red: { bg: "bg-red-50 dark:bg-red-950/30", icon: "text-red-500" },
  };
  const c = colorMap[accent];

  return (
    <div className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", c.bg)}>
          <Icon className={cn("h-4.5 w-4.5", c.icon)} />
        </div>
        {delta != null && (
          <div className={cn("flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold",
            isPositive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
          )}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-foreground tabular-nums leading-none mb-1">{value}</p>
      <p className="text-[11px] font-medium text-gray-400 dark:text-muted">{label}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl h-28 animate-pulse" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl h-64 animate-pulse" />)}
      </div>
    </div>
  );
}
