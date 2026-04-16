"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Calendar, ArrowUpRight, ArrowDownRight, RefreshCw, MessageCircle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import KPICard from "@/components/admin/shared/KPICard";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SaleItem {
  id: string;
  total: number;
  createdAt: string;
}

interface Payable {
  id: string;
  supplier?: string;
  description?: string;
  amount: number;
  dueDate: string;
  paid: boolean;
}

interface Fiado {
  id: string;
  customerName: string;
  amount: number;
  paidAmount?: number;
  dueDate?: string;
  createdAt: string;
  status: string;
  phone?: string;
  customerPhone?: string;
  customer?: { phone?: string };
}

interface ExpenseSummary {
  total: number;
  byDay?: { date: string; amount: number }[];
}

interface DayFlow {
  date: string;
  label: string;
  ingresos: number;
  gastos: number;
  delta: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n: number) {
  if (n >= 1000) return `S/ ${(n / 1000).toFixed(1)}k`;
  return `S/ ${n.toFixed(0)}`;
}

function daysUntil(isoDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(isoDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days: number): string {
  if (days < 0) return `Vencido hace ${Math.abs(days)}d`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

function urgencyBadge(days: number): string {
  if (days < 0) return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
  if (days <= 7) return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
  return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function FlowTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name === "ingresos" ? "Ingresos" : p.name === "gastos" ? "Gastos" : "Delta"}: {fmtShort(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700", className)} />
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TreasuryDashboard() {
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [salesRes, payablesRes, fiadosRes, expensesRes] = await Promise.all([
        fetch("/api/sales"),
        fetch("/api/payables"),
        fetch("/api/fiados"),
        fetch("/api/expenses/summary"),
      ]);
      if (!salesRes.ok) throw new Error(`Sales HTTP ${salesRes.status}`);
      if (!payablesRes.ok) throw new Error(`Payables HTTP ${payablesRes.status}`);
      if (!fiadosRes.ok) throw new Error(`Fiados HTTP ${fiadosRes.status}`);
      if (!expensesRes.ok) throw new Error(`Expenses HTTP ${expensesRes.status}`);

      const [salesData, payablesData, fiadosData, expensesData] = await Promise.all([
        salesRes.json(),
        payablesRes.json(),
        fiadosRes.json(),
        expensesRes.json(),
      ]);

      setSales(Array.isArray(salesData) ? salesData : salesData?.items ?? []);
      setPayables(Array.isArray(payablesData) ? payablesData : payablesData?.items ?? []);
      setFiados(Array.isArray(fiadosData) ? fiadosData : fiadosData?.items ?? []);
      setExpenses(expensesData ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const ingresosMes = sales
      .filter(s => new Date(s.createdAt) >= startOfMonth)
      .reduce((sum, s) => sum + (s.total ?? 0), 0);

    const gastosMes = expenses?.total ?? 0;
    const saldoActual = ingresosMes - gastosMes;

    const porCobrar = fiados
      .filter(f => f.status !== "pagado")
      .reduce((sum, f) => sum + ((f.amount ?? 0) - (f.paidAmount ?? 0)), 0);

    const porPagar = payables
      .filter(p => !p.paid)
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const flujoProyectado = saldoActual + porCobrar - porPagar;

    return { saldoActual, porCobrar, porPagar, flujoProyectado, ingresosMes, gastosMes };
  }, [sales, payables, fiados, expenses]);

  // ── Flow chart data (last 30 days) ────────────────────────────────────────────

  const flowData = useMemo((): DayFlow[] => {
    const days: DayFlow[] = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);

      const dayStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });

      const ingresos = sales
        .filter(s => {
          const sd = new Date(s.createdAt);
          return sd >= d && sd < next;
        })
        .reduce((sum, s) => sum + (s.total ?? 0), 0);

      // Distribute monthly expense evenly if no daily breakdown
      const byDay = expenses?.byDay;
      let gastos = 0;
      if (byDay) {
        gastos = byDay.find(e => e.date === dayStr)?.amount ?? 0;
      } else if (expenses?.total) {
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        gastos = expenses.total / daysInMonth;
      }

      days.push({ date: dayStr, label, ingresos, gastos, delta: ingresos - gastos });
    }
    return days;
  }, [sales, expenses]);

  // ── Payables sorted by urgency ────────────────────────────────────────────────

  const pendingPayables = useMemo(() =>
    payables
      .filter(p => !p.paid && p.dueDate)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 8),
    [payables],
  );

  // ── Fiados sorted by amount ───────────────────────────────────────────────────

  const pendingFiados = useMemo(() =>
    fiados
      .filter(f => f.status !== "pagado")
      .sort((a, b) => {
        const pendA = (a.amount ?? 0) - (a.paidAmount ?? 0);
        const pendB = (b.amount ?? 0) - (b.paidAmount ?? 0);
        return pendB - pendA;
      })
      .slice(0, 8),
    [fiados],
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      <AdminModuleHeader
        title="Tesorería"
        description="Flujo de caja, vencimientos y cobranzas"
        icon={DollarSign}
        iconColor="#00B4A6"
      >
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          aria-label="Actualizar datos"
          className={cn(
            "h-9 w-9 rounded-xl flex items-center justify-center transition-all",
            "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
            loading && "animate-spin opacity-60",
          )}
        >
          <RefreshCw className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        </button>
      </AdminModuleHeader>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error al cargar datos: {error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <KPICard
              label="Saldo del mes"
              value={fmt(kpis.saldoActual)}
              icon={kpis.saldoActual >= 0 ? TrendingUp : TrendingDown}
              color={kpis.saldoActual >= 0 ? "#00B4A6" : "#e63946"}
              alert={kpis.saldoActual < 0}
              subtitle={`Ingresos ${fmt(kpis.ingresosMes)} − Gastos ${fmt(kpis.gastosMes)}`}
            />
            <KPICard
              label="Por cobrar (fiados)"
              value={fmt(kpis.porCobrar)}
              icon={ArrowUpRight}
              color="#f97316"
              subtitle={`${fiados.filter(f => f.status !== "pagado").length} clientes pendientes`}
            />
            <KPICard
              label="Por pagar"
              value={fmt(kpis.porPagar)}
              icon={ArrowDownRight}
              color="#e63946"
              alert={kpis.porPagar > 0 && pendingPayables.some(p => daysUntil(p.dueDate) < 0)}
              subtitle={`${pendingPayables.length} facturas pendientes`}
            />
            <KPICard
              label="Flujo neto proyectado"
              value={fmt(kpis.flujoProyectado)}
              icon={kpis.flujoProyectado >= 0 ? TrendingUp : TrendingDown}
              color={kpis.flujoProyectado >= 0 ? "#00B4A6" : "#e63946"}
              alert={kpis.flujoProyectado < 0}
              subtitle="Saldo + cobrar − pagar"
            />
          </>
        )}
      </div>

      {/* Gráfico flujo 30 días */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 ">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Flujo de caja — últimos 30 días</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Ingresos vs gastos diarios</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#00B4A6]" />
              Ingresos
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#f97316]" />
              Gastos
            </span>
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={flowData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00B4A6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00B4A6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tickFormatter={fmtShort}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<FlowTooltip />} />
              <Area type="monotone" dataKey="ingresos" name="ingresos" stroke="#00B4A6" strokeWidth={2} fill="url(#ingGrad)" dot={false} />
              <Area type="monotone" dataKey="gastos" name="gastos" stroke="#f97316" strokeWidth={2} fill="url(#gasGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tablas lado a lado en desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Tabla de vencimientos */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 ">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-[#f97316]" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Próximos vencimientos</h2>
            <span className="ml-auto text-xs text-gray-400">{pendingPayables.length} pendientes</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : pendingPayables.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin cuentas por pagar pendientes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Proveedor / Concepto</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Monto</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayables.map(p => {
                    const days = daysUntil(p.dueDate);
                    return (
                      <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                        <td className="py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                          {p.supplier ?? p.description ?? "Sin nombre"}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-gray-800 dark:text-white">
                          {fmt(p.amount)}
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-medium", urgencyBadge(days))}>
                            {urgencyLabel(days)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Tabla de cobranzas */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-5 ">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-[#00B4A6]" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Cobranzas pendientes (fiados)</h2>
            <span className="ml-auto text-xs text-gray-400">{pendingFiados.length} clientes</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : pendingFiados.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Todos los fiados al día</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Cliente</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Pendiente</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Mora</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingFiados.map(f => {
                    const pending = (f.amount ?? 0) - (f.paidAmount ?? 0);
                    const moraDays = f.dueDate ? Math.max(0, -daysUntil(f.dueDate)) : 0;
                    const phone = f.phone ?? f.customerPhone ?? f.customer?.phone;
                    return (
                      <tr key={f.id} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                        <td className="py-2.5 text-gray-700 dark:text-gray-300 truncate max-w-[130px]">
                          {f.customerName}
                        </td>
                        <td className="py-2.5 text-right font-mono font-semibold text-gray-800 dark:text-white">
                          {fmt(pending)}
                        </td>
                        <td className="py-2.5 text-right">
                          {moraDays > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                              {moraDays}d mora
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                              Al día
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          {phone && (
                            <a
                              href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                `Hola! Soy Buleje. Te recuerdo que tienes una cuenta pendiente de S/${pending.toFixed(2)}. Agradecemos tu pronto pago. Gracias!`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[10px] font-medium transition-colors"
                              title="Enviar recordatorio por WhatsApp"
                            >
                              <MessageCircle className="h-3 w-3" />
                              Cobrar
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
