"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Users, Bike, Star, Award, Layers, AlertTriangle, MapPin, FileUp, MessageSquare,
  X as XIcon,
  BarChart3, UserCheck, UserPlus, Crown, TrendingUp, DollarSign, RefreshCw, FileDown, Maximize2,
} from "lucide-react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, LineChart, Line,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { ChartTooltip } from "@/lib/chart-tooltip";
import { formatSolesShort } from "@/lib/chart-helpers";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CRMTab = dynamic(() => import("@/components/admin/CRMTab"), { loading: S });
const DeliveryRoutesTab = dynamic(() => import("@/components/admin/DeliveryRoutesTab"), { loading: S });
const NPSTab = dynamic(() => import("@/components/admin/NPSTab"), { loading: S });
const LoyaltyTab = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });
const ChurnPrediction = dynamic(() => import("@/components/admin/ChurnPrediction"), { loading: S });
const AutoSegments = dynamic(() => import("@/components/admin/AutoSegments"), { loading: S });
const CustomerHeatmap = dynamic(() => import("@/components/admin/CustomerHeatmap"), { loading: S });
const CustomerGeoMap = dynamic(() => import("@/components/admin/CustomerGeoMap"), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div> });
const CustomerImporter = dynamic(() => import("@/components/admin/CustomerImporter"), { loading: S });
const MassMessageSender = dynamic(() => import("@/components/admin/MassMessageSender"), { loading: S });

const MODULE_ID = "clientes";

const TABS = [
  { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
  { id: "crm" as const, label: "Mis clientes", icon: Users },
  { id: "delivery" as const, label: "Delivery", icon: Bike },
  { id: "resenas" as const, label: "Opiniones", icon: Star },
  { id: "fidelizacion" as const, label: "Clientes frecuentes", icon: Award },
  { id: "segmentos" as const, label: "Segmentos", icon: Layers },
  { id: "riesgo" as const, label: "En riesgo", icon: AlertTriangle },
  { id: "mapa" as const, label: "Mapa clientes", icon: MapPin },
  { id: "importar" as const, label: "Importar", icon: FileUp },
  { id: "mensajes" as const, label: "Mensajes masivos", icon: MessageSquare },
];

/* ─── Dashboard Analytics CRM ─── */
const _DASH_COLORS = ["#00B4A6","#f97316","#457b9d","#e63946","#9b5de5","#2dd4bf","#264653","#6b705c"];

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-2xl h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-100 rounded-2xl h-72" />
        <div className="bg-gray-100 rounded-2xl h-72" />
      </div>
      <div className="bg-gray-100 rounded-2xl h-64" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-100 rounded-2xl h-72" />
        <div className="bg-gray-100 rounded-2xl h-72" />
      </div>
    </div>
  );
}

// ── Tipo de cliente (desde /api/customers) ─────────────────────────────────
interface CustomerRecord {
  id?: string | number;
  name?: string;
  fullName?: string;
  phone?: string;
  telefono?: string;
  totalSpent?: number;
  lastOrderAt?: string;
  createdAt?: string;
  orderCount?: number;
  totalOrders?: number;
}

function ClientesDashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSegment, setFilterSegment] = useState<string | null>(null); // Mejora 16
  // Mejora 13: Expand chart
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "month">("30d");
  // Mejora 3: Auto-refresh
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [minAgo, setMinAgo] = useState(0);
  // Mock KPI deltas — lazy-init so Math.random runs once per mount, not each render (React Compiler purity rule)
  const [kpiMockChanges] = useState<number[]>(() =>
    Array.from({ length: 6 }, () => Math.round((Math.random() - 0.3) * 30))
  );

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setCustomers(Array.isArray(d) ? d : []); setLastRefresh(new Date()); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setMinAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 60000)), 60000);
    return () => clearInterval(id);
  }, [lastRefresh]);

  if (loading) return <DashboardSkeleton />;

  // Mejora 20: Empty state
  if (customers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-gray-700">Sin clientes registrados</h3>
        <p className="text-sm text-gray-500 mt-1">Importa o registra tu primer cliente para ver el dashboard</p>
        {onNavigate && (
          <button onClick={() => onNavigate("importar")} className="mt-4 px-4 py-2 bg-[#00B4A6] text-white rounded-xl text-sm hover:bg-[#009690] transition-colors">
            Importar Clientes →
          </button>
        )}
      </div>
    );
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // ── KPIs ──
  const total = customers.length;
  const activos = customers.filter(
    (c) => c.lastOrderAt && new Date(c.lastOrderAt) > thirtyDaysAgo,
  ).length;
  const nuevos = customers.filter(
    (c) => c.createdAt && new Date(c.createdAt) > monthStart,
  ).length;
  const vips = customers.filter((c) => (c.totalSpent || 0) > 500).length;
  const ticketAvg =
    total > 0
      ? customers.reduce((s, c) => s + (c.totalSpent || 0), 0) / total
      : 0;
  const retencion = total > 0 ? Math.round((activos / total) * 100) : 0;

  // ── Segmentación para PieChart ──
  const segmentos = (() => {
    let vipCount = 0;
    let premiumCount = 0;
    let regularCount = 0;
    let nuevoCount = 0;
    let inactivoCount = 0;
    for (const c of customers) {
      const spent = c.totalSpent || 0;
      const lastOrder = c.lastOrderAt ? new Date(c.lastOrderAt) : null;
      const orderCount = c.orderCount || c.totalOrders || 0;
      if (!lastOrder || lastOrder < thirtyDaysAgo) {
        inactivoCount++;
      } else if (spent > 500) {
        vipCount++;
      } else if (spent > 200) {
        premiumCount++;
      } else if (orderCount < 3) {
        nuevoCount++;
      } else {
        regularCount++;
      }
    }
    return [
      { name: "VIP", value: vipCount, color: "#00B4A6" },
      { name: "Premium", value: premiumCount, color: "#f97316" },
      { name: "Regular", value: regularCount, color: "#457b9d" },
      { name: "Nuevo", value: nuevoCount, color: "#9b5de5" },
      { name: "Inactivo", value: inactivoCount, color: "#6b705c" },
    ].filter((s) => s.value > 0);
  })();

  // ── Top 10 clientes por gasto ──
  const top10 = [...customers]
    .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
    .slice(0, 10)
    .map((c, i) => ({
      name:
        (i < 3 ? ["🥇", "🥈", "🥉"][i] + " " : "") +
        (c.name || c.fullName || `Cliente ${c.id}`).slice(0, 15),
      gasto: c.totalSpent || 0,
    }));

  // ── Nuevos clientes por mes (últimos 6 meses) ──
  const monthNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const newByMonth = (() => {
    const data: { mes: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = customers.filter((c) => {
        if (!c.createdAt) return false;
        const created = new Date(c.createdAt);
        return created >= d && created < nextMonth;
      }).length;
      data.push({ mes: monthNames[d.getMonth()], count });
    }
    return data;
  })();

  // ── Frecuencia de compra ──
  const frecuencia = (() => {
    let frecuente = 0;
    let regular = 0;
    let ocasional = 0;
    let raro = 0;
    let inactivo = 0;
    for (const c of customers) {
      const orders = c.orderCount || c.totalOrders || 0;
      const lastOrder = c.lastOrderAt ? new Date(c.lastOrderAt) : null;
      if (!lastOrder || lastOrder < thirtyDaysAgo) {
        inactivo++;
      } else if (orders > 10) {
        frecuente++;
      } else if (orders > 3) {
        regular++;
      } else if (orders > 1) {
        ocasional++;
      } else {
        raro++;
      }
    }
    return [
      { name: "Frecuente (>10)", value: frecuente, fill: "#00B4A6" },
      { name: "Regular (3-10)", value: regular, fill: "#2dd4bf" },
      { name: "Ocasional (1-3)", value: ocasional, fill: "#f97316" },
      { name: "Raro (1)", value: raro, fill: "#e63946" },
      { name: "Inactivo", value: inactivo, fill: "#6b705c" },
    ];
  })();

  // ── ScatterChart: Mapa de valor ──
  const scatterData = customers
    .filter((c) => (c.orderCount || c.totalOrders || 0) > 0)
    .map((c) => {
      const spent = c.totalSpent || 0;
      const orders = c.orderCount || c.totalOrders || 0;
      const createdAt = c.createdAt ? new Date(c.createdAt) : now;
      const dias = Math.max(1, Math.round((now.getTime() - createdAt.getTime()) / 86400000));
      const lastOrder = c.lastOrderAt ? new Date(c.lastOrderAt) : null;
      let color = "#6b705c"; // Inactivo
      if (lastOrder && lastOrder > thirtyDaysAgo) {
        color = spent > 500 ? "#00B4A6" : "#457b9d";
      }
      return {
        name: c.name || c.fullName || `Cliente ${c.id}`,
        compras: orders,
        gasto: spent,
        dias,
        fill: color,
      };
    })
    .slice(0, 100); // limitar para rendimiento

  // ── Alertas ──
  const vipsInactivos = customers.filter(
    (c) =>
      (c.totalSpent || 0) > 500 &&
      c.lastOrderAt &&
      new Date(c.lastOrderAt) < fifteenDaysAgo,
  ).length;
  const sinTelefono = customers.filter(
    (c) => !c.phone && !c.telefono,
  ).length;
  const sinSegundaCompra = customers.filter(
    (c) =>
      (c.orderCount || c.totalOrders || 0) <= 1 &&
      c.createdAt &&
      new Date(c.createdAt) > new Date(now.getTime() - 60 * 86400000),
  ).length;

  // ── Pie label renderer ──
  interface PieLabelProps {
    cx?: number;
    cy?: number;
    midAngle?: number;
    outerRadius?: number;
    name?: string;
    value?: number;
  }
  const renderPieLabel = ({
    cx = 0,
    cy = 0,
    midAngle = 0,
    outerRadius = 0,
    name,
    value = 0,
  }: PieLabelProps) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
      <text
        x={x}
        y={y}
        fill="currentColor"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-[10px] fill-gray-600"
      >
        {name} ({pct}%)
      </text>
    );
  };

  // Mejora 6: Alertas CRM
  const inactiveLast30 = customers.filter(c => !c.lastOrderAt || new Date(c.lastOrderAt) < thirtyDaysAgo).length;

  return (
    <div className="space-y-6">
      {/* ── Controls: Period + Refresh + Export ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {([{ id: "today" as const, label: "Hoy" }, { id: "7d" as const, label: "7 dias" }, { id: "30d" as const, label: "30 dias" }, { id: "month" as const, label: "Este mes" }]).map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", period === p.id ? "bg-[#00B4A6] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>Actualizado hace {minAgo} min</span>
            <button onClick={() => { setLastRefresh(new Date()); setMinAgo(0); }} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Actualizar"><RefreshCw className="h-3 w-3" /></button>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"><FileDown className="h-3 w-3" /> Exportar</button>
        </div>
      </div>
      </motion.div>

      {/* ── Alertas CRM ── */}
      {inactiveLast30 > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            <AlertTriangle className="h-3 w-3" /> {inactiveLast30} clientes sin comprar en 30 dias
          </span>
          {vipsInactivos > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
              <AlertTriangle className="h-3 w-3" /> {vipsInactivos} VIPs inactivos
            </span>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: "Total clientes",
            value: total,
            icon: Users,
            color: "border-l-4 border-[#00B4A6]",
            iconBg: "bg-[#00B4A6]/10 text-[#00B4A6]",
          },
          {
            label: "Activos (30d)",
            value: activos,
            icon: UserCheck,
            color: "border-l-4 border-blue-500",
            iconBg: "bg-blue-100 text-blue-600",
          },
          {
            label: "Nuevos este mes",
            value: nuevos,
            icon: UserPlus,
            color: "border-l-4 border-purple-500",
            iconBg: "bg-purple-100 text-purple-600",
          },
          {
            label: "Clientes VIP",
            value: vips,
            icon: Crown,
            color: "border-l-4 border-amber-500",
            iconBg: "bg-amber-100 text-amber-600",
          },
          {
            label: "Gasto promedio",
            value: formatCurrency(ticketAvg, { decimals: 0 }),
            icon: DollarSign,
            color: "border-l-4 border-cyan-500",
            iconBg: "bg-cyan-100 text-cyan-600",
          },
          {
            label: "Retención",
            value: `${retencion}%`,
            icon: TrendingUp,
            color: "border-l-4 border-green-500",
            iconBg: "bg-green-100 text-green-600",
          },
        ].map((k, i) => {
          const Icon = k.icon;
          const change = kpiMockChanges[i] ?? 0;
          return (
            <div
              key={i}
              className={cn(
                "bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow",
                k.color,
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                    k.iconBg,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium truncate">
                    {k.label}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-mono font-bold text-gray-900">
                      {k.value}
                    </p>
                    <span className={`text-xs ${change >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {change >= 0 ? "\u2191" : "\u2193"} {Math.abs(change)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      </motion.div>

      {/* ── Segmentación + Top 10 ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PieChart: Clientes por segmento */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900">
              Clientes por segmento
            </h3>
            <div className="flex items-center gap-2">
              {/* Mejora 16: Filter badge */}
              {filterSegment && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] text-xs font-bold">
                  Filtrando: {filterSegment}
                  <button onClick={() => setFilterSegment(null)} className="hover:bg-[#00B4A6]/20 rounded-full p-0.5 transition-colors">
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button onClick={() => setExpandedChart("segmentos")} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Expandir"><Maximize2 className="h-3.5 w-3.5 text-gray-400" /></button>
            </div>
          </div>
          {segmentos.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={segmentos}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  dataKey="value"
                  label={renderPieLabel}
                  strokeWidth={2}
                  onClick={(data: { name?: string } | undefined) => setFilterSegment(data?.name === filterSegment ? null : data?.name ?? null)}
                  className="cursor-pointer"
                >
                  {segmentos.map((s, i) => (
                    <Cell key={i} fill={s.color} stroke="white" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                {/* Centro: total */}
                <text
                  x="50%"
                  y="47%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-2xl font-bold fill-gray-900"
                >
                  {total}
                </text>
                <text
                  x="50%"
                  y="57%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] fill-gray-500"
                >
                  clientes
                </text>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-12 text-sm">
              Sin datos de segmentación
            </p>
          )}
        </div>

        {/* BarChart horizontal: Top 10 clientes por gasto */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            Top 10 clientes por gasto
          </h3>
          {top10.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={top10}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis
                  type="number"
                  tickFormatter={formatSolesShort}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="gasto" fill="#f97316" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-12 text-sm">
              Sin datos de clientes
            </p>
          )}
        </div>
      </div>

      </motion.div>

      {/* ── Nuevos clientes por mes (AreaChart) ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.10 }}>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4">
          Nuevos clientes por mes
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={newByMonth} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradClientes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00B4A6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00B4A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#00B4A6"
              strokeWidth={2.5}
              fill="url(#gradClientes)"
              dot={{ r: 4, fill: "#00B4A6", strokeWidth: 2, stroke: "white" }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      </motion.div>

      {/* ── Frecuencia + Mapa de valor ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart vertical: Distribución por frecuencia */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            Frecuencia de compra
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={frecuencia} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {frecuencia.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ScatterChart: Mapa de valor del cliente */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            Mapa de valor del cliente
          </h3>
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <ScatterChart margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  type="number"
                  dataKey="compras"
                  name="Compras"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Compras",
                    position: "insideBottom",
                    offset: -5,
                    style: { fontSize: 10, fill: "#6b7280" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="gasto"
                  name="Gasto"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatCurrency(v, { decimals: 0 })}
                  label={{
                    value: "Gasto (S/)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 10, fill: "#6b7280" },
                  }}
                />
                <ZAxis type="number" dataKey="dias" range={[30, 200]} name="Antigüedad" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                        <p className="font-bold text-gray-900">{d.name}</p>
                        <p className="text-gray-600">
                          Compras: {d.compras}
                        </p>
                        <p className="text-gray-600">
                          Gasto: {formatCurrency(d.gasto)}
                        </p>
                        <p className="text-gray-600">
                          Antigüedad: {d.dias} días
                        </p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-400 py-12 text-sm">
              Sin datos suficientes
            </p>
          )}
        </div>
      </div>

      </motion.div>

      {/* ── Retencion mensual (Mejora 6) ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.18 }}>
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Retencion mensual</h3>
        {(() => {
          const retData: { mes: string; retencion: number }[] = [];
          for (let i = 5; i >= 0; i--) {
            const cm = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const pm = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
            const ncm = new Date(cm.getFullYear(), cm.getMonth() + 1, 1);
            const npm2 = new Date(pm.getFullYear(), pm.getMonth() + 1, 1);
            const prevIds = new Set(customers.filter((c) => c.lastOrderAt && new Date(c.lastOrderAt) >= pm && new Date(c.lastOrderAt) < npm2).map((c) => c.id || c.name));
            const currIds = new Set(customers.filter((c) => c.lastOrderAt && new Date(c.lastOrderAt) >= cm && new Date(c.lastOrderAt) < ncm).map((c) => c.id || c.name));
            const ret = [...prevIds].filter(id => currIds.has(id)).length;
            retData.push({ mes: monthNames[cm.getMonth()], retencion: prevIds.size > 0 ? Math.round((ret / prevIds.size) * 100) : 0 });
          }
          return retData.some(d => d.retencion > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={retData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <ReferenceLine y={40} stroke="#f97316" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "Promedio retail: 40%", position: "insideTopRight", style: { fontSize: 10, fill: "#f97316" } }} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="retencion" stroke="#00B4A6" strokeWidth={2.5} dot={{ r: 4, fill: "#00B4A6", strokeWidth: 2, stroke: "white" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm font-medium text-gray-500">Sin datos de retencion</p>
              <p className="text-xs text-gray-400 mt-1">Los datos apareceran cuando tengas clientes recurrentes</p>
            </div>
          );
        })()}
      </div>
      </motion.div>

      {/* ── Alertas de clientes ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.22 }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-bold text-red-700">
              {vipsInactivos} VIPs inactivos
            </span>
          </div>
          <p className="text-xs text-red-600/80">
            Clientes VIP sin compras en los últimos 15 días. Contactar para retener.
          </p>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-amber-700">
              {sinTelefono} sin teléfono
            </span>
          </div>
          <p className="text-xs text-amber-600/80">
            Clientes sin número de teléfono registrado. No podrán recibir mensajes.
          </p>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-bold text-blue-700">
              {sinSegundaCompra} sin segunda compra
            </span>
          </div>
          <p className="text-xs text-blue-600/80">
            Clientes nuevos (últimos 60 días) que aún no repiten. Ofrecer promoción.
          </p>
        </div>
      </div>
      </motion.div>

      {/* Mejora 13: Expand chart modal */}
      {expandedChart && (
        <div className="fixed inset-0 z-50 bg-white p-8 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Clientes por segmento</h2>
            <button onClick={() => setExpandedChart(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><XIcon className="h-5 w-5 text-gray-500" /></button>
          </div>
          <div style={{ height: 500 }}>
            <ResponsiveContainer width="100%" height={500}>
              <PieChart>
                <Pie data={segmentos} cx="50%" cy="50%" innerRadius={100} outerRadius={200} dataKey="value" label strokeWidth={2}>
                  {segmentos.map((s, i) => <Cell key={i} fill={s.color} stroke="white" />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CRMClientesModule() {
  const [sub, setSub] = useState(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return (localStorage.getItem(`admin-last-tab-${MODULE_ID}`) as typeof TABS[number]["id"]) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Mis Clientes"
        description="CRM, segmentación y fidelización"
        icon={Users}
      />



      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={(id) => setSub(id as typeof sub)}
        moduleId="crm"
      />
      {sub === "dashboard" && <ClientesDashboard onNavigate={(tab) => setSub(tab as typeof sub)} />}
      {sub === "crm" && <CRMTab />}
      {sub === "delivery" && <DeliveryRoutesTab />}
      {sub === "resenas" && <NPSTab />}
      {sub === "fidelizacion" && <LoyaltyTab />}
      {sub === "segmentos" && <AutoSegments />}
      {sub === "riesgo" && <ChurnPrediction />}
      {sub === "mapa" && (
        <div className="space-y-8">
          <CustomerGeoMap />
          <CustomerHeatmap />
        </div>
      )}
      {sub === "importar" && <CustomerImporter />}
      {sub === "mensajes" && <MassMessageSender />}
    </div>
  );
}
