"use client";

import { m } from "@/components/admin/providers";
import {
  DollarSign, AlertTriangle, TrendingUp,
  ArrowUpFromLine, ArrowDownToLine, XCircle,
  User, Shield, Scale, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PrestamoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
type PrestamoDireccion = "DADO" | "RECIBIDO";
type SistemaAmortizacion = "FRANCES" | "ALEMAN" | "AMERICANO";

type PrestamoCuota = {
  id: string;
  prestamoId: string;
  numeroCuota: number;
  monto: number;
  capital: number;
  interes: number;
  moraCalculada: number;
  fechaVence: string;
  pagadoEn?: string;
  montoPagado?: number;
};

type Prestamo = {
  id: string;
  tenantId: string;
  customerId?: string;
  tipo: string;
  direccion: PrestamoDireccion;
  entidadNombre?: string;
  entidadTipo?: string;
  nroOperacion?: string;
  monto: number;
  moneda: string;
  tasaInteres: number;
  tea?: number;
  moraInteres: number;
  numeroCuotas: number;
  sistemaAmortizacion: SistemaAmortizacion;
  periodoGracia: number;
  status: PrestamoStatus;
  fechaDesembolso?: string;
  fechaVencimiento?: string;
  garantia?: string;
  notas?: string;
  cuotas: PrestamoCuota[];
  createdAt: string;
  updatedAt: string;
};

type Resumen = {
  totalDados: number;
  totalRecibidos: number;
  saldoDados: number;
  saldoRecibidos: number;
  cuotasVencidas: number;
  moraAcumulada: number;
  porTipo: Record<string, number>;
  activosDados: number;
  activosRecibidos: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number, moneda = "PEN") {
  const symbol = moneda === "USD" ? "$" : "S/";
  return `${symbol}${n.toFixed(2)}`;
}

function genSparkData(base: number): { v: number }[] {
  const seed = Math.abs(base) || 100;
  return Array.from({ length: 6 }, (_, i) => ({
    v: Math.max(0, seed * (0.65 + Math.sin(i + seed * 0.01) * 0.2 + Math.cos(i * 1.5) * 0.15) * (1 + i * 0.04)),
  }));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyChartPrestamos({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3"><BarChart3 className="h-6 w-6 text-primary" /></div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los datos aparecerán cuando registres préstamos</p>
    </div>
  );
}

function SparklineKPICard({
  title, value, sub, accentColor, icon: Icon, sparkData,
}: {
  title: string; value: string; sub?: string; accentColor: string;
  icon: React.ElementType; sparkData: { v: number }[];
}) {
  const gradId = `sp-${title.replace(/\W+/g, "")}`;
  return (
    <div
      className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl  p-3 relative overflow-hidden"
      style={{ borderBottomColor: accentColor, borderBottomWidth: 4 }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
        <p className="text-[10px] uppercase font-bold text-gray-400 truncate">{title}</p>
      </div>
      <p className="text-xl font-extrabold font-mono text-gray-900 dark:text-white leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      <div className="absolute bottom-0 right-0 w-20 h-10 opacity-50 pointer-events-none">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.4} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={accentColor} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── PrestamosDashboard ────────────────────────────────────────────────────────

interface Props {
  prestamos: Prestamo[];
  resumen?: Resumen | null;
}

export function PrestamosDashboard({ prestamos, resumen }: Props) {
  const now = new Date();
  const activosAll = prestamos.filter(p => p.status !== "CANCELADO");
  const totalPrestado = activosAll.reduce((s, p) => s + p.monto, 0);
  const porCobrar = activosAll.reduce((s, p) => s + p.cuotas.filter(c => !c.pagadoEn).reduce((ss, c) => ss + c.monto, 0), 0);
  const totalCobrado = activosAll.reduce((s, p) => s + p.cuotas.filter(c => c.pagadoEn).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0);
  const tasaRecuperacion = totalPrestado > 0 ? (totalCobrado / totalPrestado) * 100 : 0;
  const cuotasVencidas = resumen?.cuotasVencidas ?? activosAll.reduce((s, p) => s + p.cuotas.filter(c => !c.pagadoEn && new Date(c.fechaVence) < now).length, 0);
  const moraAcumulada = resumen?.moraAcumulada ?? 0;
  const totalDados = resumen?.totalDados ?? prestamos.filter(p => p.direccion === "DADO").reduce((s, p) => s + p.monto, 0);
  const totalRecibidos = resumen?.totalRecibidos ?? prestamos.filter(p => p.direccion === "RECIBIDO").reduce((s, p) => s + p.monto, 0);
  const maxDireccion = Math.max(totalDados, totalRecibidos, 1);

  const spark1 = genSparkData(totalDados); const spark2 = genSparkData(totalRecibidos);
  const spark3 = genSparkData(porCobrar); const spark4 = genSparkData(cuotasVencidas * 200);
  const spark5 = genSparkData(moraAcumulada); const spark6 = genSparkData(tasaRecuperacion * 50);

  const areaData: { mes: string; cobrado: number; nuevos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-PE", { month: "short" });
    const cobrado = activosAll.reduce((s, p) => s + p.cuotas.filter(c => c.pagadoEn && c.pagadoEn.startsWith(mesKey)).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0);
    const nuevos = prestamos.filter(p => p.createdAt.startsWith(mesKey)).reduce((s, p) => s + p.monto, 0);
    areaData.push({ mes: label, cobrado, nuevos });
  }

  const deudorMap = new Map<string, number>();
  for (const p of activosAll.filter(p => (p.status === "ACTIVO" || p.status === "VENCIDO") && p.direccion === "DADO")) {
    const saldo = p.cuotas.filter(c => !c.pagadoEn).reduce((s, c) => s + c.monto, 0);
    if (saldo > 0) {
      const key = (p.customerId || p.entidadNombre || "Sin nombre").slice(0, 15);
      deudorMap.set(key, (deudorMap.get(key) ?? 0) + saldo);
    }
  }
  const topDeudores = Array.from(deudorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, monto]) => ({ name, monto }));

  const statusCounts = {
    ACTIVO: prestamos.filter(p => p.status === "ACTIVO").length,
    PAGADO: prestamos.filter(p => p.status === "PAGADO").length,
    VENCIDO: prestamos.filter(p => p.status === "VENCIDO").length,
    CANCELADO: prestamos.filter(p => p.status === "CANCELADO").length,
  };
  const donutData = [
    { name: "Activos", value: statusCounts.ACTIVO, color: "#f59e0b" },
    { name: "Pagados", value: statusCounts.PAGADO, color: "#10b981" },
    { name: "Vencidos", value: statusCounts.VENCIDO, color: "#ef4444" },
    { name: "Cancelados", value: statusCounts.CANCELADO, color: "#9ca3af" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SparklineKPICard title="Dados" value={formatCurrency(totalDados)} sub={`${resumen?.activosDados ?? prestamos.filter(p=>p.direccion==="DADO"&&p.status==="ACTIVO").length} activos`} accentColor="#ef4444" icon={ArrowUpFromLine} sparkData={spark1} />
          <SparklineKPICard title="Recibidos" value={formatCurrency(totalRecibidos)} sub={`${resumen?.activosRecibidos ?? prestamos.filter(p=>p.direccion==="RECIBIDO"&&p.status==="ACTIVO").length} activos`} accentColor="#10b981" icon={ArrowDownToLine} sparkData={spark2} />
          <SparklineKPICard title="Por cobrar" value={formatCurrency(resumen?.saldoDados ?? porCobrar)} accentColor="#f97316" icon={DollarSign} sparkData={spark3} />
          <SparklineKPICard title="Cuotas vencidas" value={String(cuotasVencidas)} accentColor={cuotasVencidas > 0 ? "#dc2626" : "#10b981"} icon={XCircle} sparkData={spark4} />
          <SparklineKPICard title="Mora acumulada" value={formatCurrency(moraAcumulada)} accentColor="#f59e0b" icon={AlertTriangle} sparkData={spark5} />
          <SparklineKPICard title="Recuperación" value={`${tasaRecuperacion.toFixed(1)}%`} accentColor={tasaRecuperacion > 80 ? "#10b981" : tasaRecuperacion > 50 ? "#f59e0b" : "#ef4444"} icon={TrendingUp} sparkData={spark6} />
        </div>
      </m.div>

      {moraAcumulada > 0 && (
        <m.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400 tracking-wider">Mora Acumulada</p>
              <p className="text-3xl font-extrabold font-mono text-amber-700 dark:text-amber-400">{formatCurrency(moraAcumulada)}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">En préstamos con cuotas vencidas</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-amber-600 dark:text-amber-500">{cuotasVencidas} cuots. vencidas</p>
              <div className="mt-1 h-2 w-24 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (cuotasVencidas / Math.max(1, prestamos.reduce((s,p)=>s+p.cuotas.length,0))) * 100 * 10)}%` }} />
              </div>
            </div>
          </div>
        </m.div>
      )}

      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 ">
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Cobros vs Nuevos préstamos (6 meses)</h3>
          {areaData.some(d => d.cobrado > 0 || d.nuevos > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="prestCobGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prestNuevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e63946" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#e63946" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={((v: number, name: string) => [formatCurrency(Number(v)), name === "cobrado" ? "Cobrado" : "Nuevos"]) as never} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                <Legend formatter={(v: string) => v === "cobrado" ? "Cobrado" : "Nuevos préstamos"} />
                <Area type="monotone" dataKey="cobrado" stroke="#2563EB" fill="url(#prestCobGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="nuevos" stroke="#e63946" fill="url(#prestNuevGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartPrestamos message="Sin movimiento en los últimos 6 meses" />
          )}
        </div>
      </m.div>

      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 ">
            <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-[#f97316]" /> Top 5 deudores
            </h3>
            {topDeudores.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topDeudores} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={((v: number) => [formatCurrency(Number(v)), "Saldo"]) as never} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                  <Bar dataKey="monto" radius={[0, 6, 6, 0]}>
                    {topDeudores.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#ef4444" : "#f97316"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartPrestamos message="Sin deudores activos" />
            )}
          </div>

          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 ">
            <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-purple-500" /> Distribución por estado
            </h3>
            {donutData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="value" stroke="none" paddingAngle={2}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={((v: number, name: string) => [v, name]) as never} contentStyle={{ borderRadius: "12px", fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  {donutData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-[10px] text-gray-600 dark:text-gray-400">{d.name}: <strong>{d.value}</strong></span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyChartPrestamos message="Sin préstamos" />
            )}
          </div>

          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 ">
            <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4 flex items-center gap-2">
              <Scale className="h-4 w-4 text-emerald-500" /> Dado vs Recibido
            </h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Dados</span>
                  </div>
                  <span className="text-xs font-bold font-mono text-red-600 dark:text-red-400">{formatCurrency(totalDados)}</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <m.div className="h-full bg-red-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${(totalDados / maxDireccion) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{prestamos.filter(p=>p.direccion==="DADO").length} préstamos</p>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Recibidos</span>
                  </div>
                  <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(totalRecibidos)}</span>
                </div>
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <m.div className="h-full bg-emerald-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${(totalRecibidos / maxDireccion) * 100}%` }} transition={{ duration: 0.8, delay: 0.5 }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{prestamos.filter(p=>p.direccion==="RECIBIDO").length} préstamos</p>
              </div>
              <div className="pt-3 border-t border-gray-100 dark:border-white/10">
                <p className="text-xs text-gray-500 dark:text-gray-400">Balance neto</p>
                <p className={cn("text-lg font-extrabold font-mono", totalDados > totalRecibidos ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {totalDados > totalRecibidos ? "− " : "+ "}{formatCurrency(Math.abs(totalDados - totalRecibidos))}
                </p>
                <p className="text-[10px] text-gray-400">{totalDados > totalRecibidos ? "Más dado que recibido" : "Más recibido que dado"}</p>
              </div>
            </div>
          </div>
        </div>
      </m.div>
    </div>
  );
}
