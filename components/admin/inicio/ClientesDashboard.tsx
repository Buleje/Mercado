"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import {
  Users, UserPlus, UserCheck, Star,
  AlertTriangle, TrendingUp, Heart, Crown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import type { DateRange } from "./DashboardDateRange";

const ClientesCharts = dynamic(() => import("./ClientesCharts"), { ssr: false });
const ClientesAdvancedCharts = dynamic(
  () => import("./ClientesAdvancedCharts").then((m) => ({ default: m.ClientesAdvancedCharts })),
  { ssr: false },
);
// DashboardSectionHeader removido 2026-04-24 — ver decision UX en render.
import { BulejeDashboardSkeleton } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";

// ── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  phone: string; name: string; totalSpent: number;
  creditBalance: number; creditLimit: number;
  loyaltyPoints?: number; loyaltyTier?: string;
  createdAt: string; updatedAt: string;
}
interface Order {
  id: string; customer: { name: string; phone?: string };
  items: { id: number; price: number; quantity: number }[];
  total: number; status: string; createdAt: string;
}
interface Sale {
  id: string; total: number; customerPhone: string; createdAt: string;
  items: { productId: number; price: number; quantity: number }[];
}
interface Review { id: string; name: string; rating: number; text: string; date: string; productId: number; }

export interface ClientesData {
  // KPIs
  totalClientes: number;
  clientesActivos: number;
  nuevos: number;
  recurrentes: number;
  ratingPromedio: number;
  totalResenas: number;
  // Deltas
  dActivos: number | null;
  dNuevos: number | null;
  // Charts
  topClientes: { nombre: string; gasto: number; pedidos: number }[];
  retencion: { mes: string; nuevos: number; recurrentes: number; total: number }[];
  cohortData: { cohorte: string; m0: number; m1: number; m2: number; m3: number }[];
  distribucionGasto: { rango: string; cantidad: number; color: string }[];
  frecuenciaCompra: { frecuencia: string; cantidad: number; color: string }[];
  clientesPorDia: { dia: string; nuevos: number; activos: number }[];
  distribucionRating: { rating: number; cantidad: number }[];
  ticketPorCliente: { nombre: string; ticket: number; visitas: number }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function dayLabel(dk: string) { return new Date(dk + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

// ── Main Component ───────────────────────────────────────────────────────────

interface ClientesDashboardProps {
  dateRange: DateRange;
  onChangeRange?: (r: DateRange) => void;
}

export default function ClientesDashboard({ dateRange, onChangeRange }: ClientesDashboardProps) {
  const { data: shared, loading, error, refresh } = useDashboardData();

  const customers = (shared?.customers ?? []) as Customer[];
  const orders = (shared?.orders ?? []) as Order[];
  const sales = (shared?.sales ?? []) as Sale[];
  const reviews = (shared?.reviews ?? []) as Review[];
  const raw = shared ? { customers, orders, sales, reviews } : null;

  const data = useMemo<ClientesData | null>(() => {
    if (!raw) return null;
    const { customers, orders, sales, reviews } = raw;
    const { from, to } = dateRange;

    // Previous period
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);

    // KPIs
    const totalClientes = customers.length;

    // Active = purchased in period
    const periodOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
    const periodSales = sales.filter(s => new Date(s.createdAt) >= from && new Date(s.createdAt) <= to);
    const activePhones = new Set<string>();
    periodOrders.forEach(o => { if (o.customer?.phone) activePhones.add(o.customer.phone); });
    periodSales.forEach(s => { if (s.customerPhone) activePhones.add(s.customerPhone); });
    const clientesActivos = activePhones.size;

    // New vs returning
    const beforePeriodPhones = new Set<string>();
    orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < from).forEach(o => { if (o.customer?.phone) beforePeriodPhones.add(o.customer.phone); });
    sales.filter(s => new Date(s.createdAt) < from).forEach(s => { if (s.customerPhone) beforePeriodPhones.add(s.customerPhone); });
    let nuevos = 0, recurrentes = 0;
    activePhones.forEach(phone => {
      if (beforePeriodPhones.has(phone)) recurrentes++;
      else nuevos++;
    });

    // Previous period actives for delta
    const prevOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= prevFrom && new Date(o.createdAt) <= prevTo);
    const prevSales = sales.filter(s => new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);
    const prevActivePhones = new Set<string>();
    prevOrders.forEach(o => { if (o.customer?.phone) prevActivePhones.add(o.customer.phone); });
    prevSales.forEach(s => { if (s.customerPhone) prevActivePhones.add(s.customerPhone); });
    const prevBeforePhones = new Set<string>();
    orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < prevFrom).forEach(o => { if (o.customer?.phone) prevBeforePhones.add(o.customer.phone); });
    sales.filter(s => new Date(s.createdAt) < prevFrom).forEach(s => { if (s.customerPhone) prevBeforePhones.add(s.customerPhone); });
    let prevNuevos = 0;
    prevActivePhones.forEach(phone => { if (!prevBeforePhones.has(phone)) prevNuevos++; });
    const dActivos = prevActivePhones.size === 0 ? null : ((clientesActivos - prevActivePhones.size) / prevActivePhones.size) * 100;
    const dNuevos = prevNuevos === 0 ? null : ((nuevos - prevNuevos) / prevNuevos) * 100;

    // Reviews
    const ratingPromedio = reviews.length > 0 ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
    const totalResenas = reviews.length;

    // Top 10 customers by spend in period
    const clientSpend = new Map<string, { nombre: string; gasto: number; pedidos: number }>();
    periodOrders.forEach(o => {
      const phone = o.customer?.phone ?? "anon";
      const e = clientSpend.get(phone) ?? { nombre: o.customer?.name ?? phone, gasto: 0, pedidos: 0 };
      e.gasto += o.total; e.pedidos++;
      clientSpend.set(phone, e);
    });
    periodSales.forEach(s => {
      const phone = s.customerPhone || "anon";
      const e = clientSpend.get(phone) ?? { nombre: phone, gasto: 0, pedidos: 0 };
      e.gasto += s.total; e.pedidos++;
      clientSpend.set(phone, e);
    });
    const topClientes = [...clientSpend.values()].sort((a, b) => b.gasto - a.gasto).slice(0, 10);

    // Monthly retention (last 6 months)
    const now = new Date();
    const retencion: ClientesData["retencion"] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
      const mPhones = new Set<string>();
      orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd).forEach(o => { if (o.customer?.phone) mPhones.add(o.customer.phone); });
      sales.filter(s => new Date(s.createdAt) >= mStart && new Date(s.createdAt) <= mEnd).forEach(s => { if (s.customerPhone) mPhones.add(s.customerPhone); });

      const priorPhones = new Set<string>();
      orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < mStart).forEach(o => { if (o.customer?.phone) priorPhones.add(o.customer.phone); });
      sales.filter(s => new Date(s.createdAt) < mStart).forEach(s => { if (s.customerPhone) priorPhones.add(s.customerPhone); });
      let mNew = 0, mRet = 0;
      mPhones.forEach(p => { if (priorPhones.has(p)) mRet++; else mNew++; });
      retencion.push({ mes: label, nuevos: mNew, recurrentes: mRet, total: mPhones.size });
    }

    // Cohort analysis (simplified — 4 monthly cohorts)
    const cohortData: ClientesData["cohortData"] = [];
    for (let c = 3; c >= 0; c--) {
      const cStart = new Date(now.getFullYear(), now.getMonth() - c, 1);
      const cEnd = new Date(now.getFullYear(), now.getMonth() - c + 1, 0, 23, 59, 59);
      const label = cStart.toLocaleDateString("es-PE", { month: "short" });
      // Phones that first purchased in this month
      const firstPurchase = new Set<string>();
      const allPhonesBefore = new Set<string>();
      orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < cStart).forEach(o => { if (o.customer?.phone) allPhonesBefore.add(o.customer.phone); });
      sales.filter(s => new Date(s.createdAt) < cStart).forEach(s => { if (s.customerPhone) allPhonesBefore.add(s.customerPhone); });
      orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= cStart && new Date(o.createdAt) <= cEnd).forEach(o => {
        if (o.customer?.phone && !allPhonesBefore.has(o.customer.phone)) firstPurchase.add(o.customer.phone);
      });
      sales.filter(s => new Date(s.createdAt) >= cStart && new Date(s.createdAt) <= cEnd).forEach(s => {
        if (s.customerPhone && !allPhonesBefore.has(s.customerPhone)) firstPurchase.add(s.customerPhone);
      });
      const cohortSize = firstPurchase.size;
      if (cohortSize === 0) { cohortData.push({ cohorte: label, m0: 0, m1: 0, m2: 0, m3: 0 }); continue; }
      // Check retention in following months
      const mPcts = [100]; // m0 by definition
      for (let m = 1; m <= 3; m++) {
        const mS = new Date(now.getFullYear(), now.getMonth() - c + m, 1);
        const mE = new Date(now.getFullYear(), now.getMonth() - c + m + 1, 0, 23, 59, 59);
        if (mS > now) { mPcts.push(0); continue; }
        let retained = 0;
        firstPurchase.forEach(phone => {
          const hasPurchase = orders.some(o => o.status === "entregado" && o.customer?.phone === phone && new Date(o.createdAt) >= mS && new Date(o.createdAt) <= mE)
            || sales.some(s => s.customerPhone === phone && new Date(s.createdAt) >= mS && new Date(s.createdAt) <= mE);
          if (hasPurchase) retained++;
        });
        mPcts.push(Math.round((retained / cohortSize) * 100));
      }
      cohortData.push({ cohorte: label, m0: mPcts[0], m1: mPcts[1], m2: mPcts[2], m3: mPcts[3] });
    }

    // Spend distribution
    const spendRanges = [
      { label: "S/ 0-50", min: 0, max: 50, color: "#94a3b8" },
      { label: "S/ 51-200", min: 50.01, max: 200, color: "#3b82f6" },
      { label: "S/ 201-500", min: 200.01, max: 500, color: "#8b5cf6" },
      { label: "S/ 500+", min: 500.01, max: Infinity, color: "var(--accent)" },
    ];
    const distribucionGasto = spendRanges.map(r => ({
      rango: r.label,
      cantidad: customers.filter(c => c.totalSpent >= r.min && c.totalSpent <= r.max).length,
      color: r.color,
    }));

    // Purchase frequency (orders per customer in period)
    const freqMap = new Map<string, number>();
    periodOrders.forEach(o => { if (o.customer?.phone) freqMap.set(o.customer.phone, (freqMap.get(o.customer.phone) ?? 0) + 1); });
    periodSales.forEach(s => { if (s.customerPhone) freqMap.set(s.customerPhone, (freqMap.get(s.customerPhone) ?? 0) + 1); });
    const freqRanges = [
      { label: "1 compra", min: 1, max: 1, color: "#94a3b8" },
      { label: "2-3 compras", min: 2, max: 3, color: "#3b82f6" },
      { label: "4-7 compras", min: 4, max: 7, color: "#f59e0b" },
      { label: "8+ compras", min: 8, max: Infinity, color: "var(--accent)" },
    ];
    const frecuenciaCompra = freqRanges.map(r => ({
      frecuencia: r.label,
      cantidad: [...freqMap.values()].filter(f => f >= r.min && f <= r.max).length,
      color: r.color,
    }));

    // Daily new/active clients in period
    const dayNewMap = new Map<string, Set<string>>();
    const dayActiveMap = new Map<string, Set<string>>();
    [...periodOrders.map(o => ({ date: o.createdAt, phone: o.customer?.phone })),
     ...periodSales.map(s => ({ date: s.createdAt, phone: s.customerPhone }))
    ].forEach(t => {
      if (!t.phone) return;
      const k = dateKey(new Date(t.date));
      if (!dayActiveMap.has(k)) dayActiveMap.set(k, new Set());
      dayActiveMap.get(k)!.add(t.phone);
      if (!beforePeriodPhones.has(t.phone)) {
        if (!dayNewMap.has(k)) dayNewMap.set(k, new Set());
        dayNewMap.get(k)!.add(t.phone);
      }
    });
    const allDays = [...new Set([...dayActiveMap.keys(), ...dayNewMap.keys()])].sort().slice(-14);
    const clientesPorDia = allDays.map(k => ({
      dia: dayLabel(k), nuevos: dayNewMap.get(k)?.size ?? 0, activos: dayActiveMap.get(k)?.size ?? 0,
    }));

    // Rating distribution
    const distribucionRating = [1, 2, 3, 4, 5].map(r => ({
      rating: r, cantidad: reviews.filter(rv => Math.round(rv.rating) === r).length,
    }));

    // Avg ticket per top client
    const ticketPorCliente = topClientes.slice(0, 8).map(c => ({
      nombre: c.nombre, ticket: c.pedidos > 0 ? c.gasto / c.pedidos : 0, visitas: c.pedidos,
    }));

    return {
      totalClientes, clientesActivos, nuevos, recurrentes, ratingPromedio, totalResenas,
      dActivos, dNuevos,
      topClientes, retencion, cohortData, distribucionGasto, frecuenciaCompra,
      clientesPorDia, distribucionRating, ticketPorCliente,
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

  if (data.totalClientes === 0 && data.nuevos === 0 && data.recurrentes === 0) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="clientes"
        onChangeRange={onChangeRange}
        icon={Users}
        action={{ label: "Ver listado de clientes", href: "/admin?tab=clientes" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero removido 2026-04-24: los KPI tiles ya comunican el contenido. */}

      {/* ── KPI Hero Row · ADR-068 armonía estricta ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Clientes" value={String(data.totalClientes)} icon={Users} />
        <StatCard label="Activos" value={String(data.clientesActivos)} icon={UserCheck} delta={data.dActivos} />
        <StatCard label="Nuevos" value={String(data.nuevos)} icon={UserPlus} delta={data.dNuevos} />
        <StatCard label="Recurrentes" value={String(data.recurrentes)} icon={Heart} />
        <StatCard label="Rating Prom." value={Number(data.ratingPromedio).toFixed(1)} icon={Star} emphasis={data.ratingPromedio >= 4 ? "success" : data.ratingPromedio >= 3 ? "warning" : "error"} />
        <StatCard label="Reseñas" value={String(data.totalResenas)} icon={Crown} />
      </div>

      {/* ── Retention summary bar ── */}
      {data.clientesActivos > 0 && (
        <div className="flex items-center gap-3 bg-[var(--surface-raised)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-5 py-3">
          <TrendingUp className="h-4 w-4 text-[var(--text-tertiary)]" />
          <div className="flex-1 flex items-center gap-4 text-sm">
            <span className="text-[var(--text-secondary)] dark:text-muted">Retención:</span>
            <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {data.clientesActivos > 0 ? Math.round((data.recurrentes / data.clientesActivos) * 100) : 0}%
            </span>
            <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">|</span>
            <span className="text-[var(--text-secondary)] dark:text-muted">Nuevos:</span>
            <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{data.nuevos}</span>
            <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">|</span>
            <span className="text-[var(--text-secondary)] dark:text-muted">Recurrentes:</span>
            <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{data.recurrentes}</span>
          </div>
        </div>
      )}

      {/* ── Charts base (top, retención, por día, gasto, frecuencia, ticket) ── */}
      <ClientesCharts data={data} />

      {/* ── Charts especializados (cohort, RFM, rating, comparativa, heatmap, churn) ── */}
      <ClientesAdvancedCharts />
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
