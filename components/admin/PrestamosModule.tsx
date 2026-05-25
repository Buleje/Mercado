"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, DollarSign, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, User, Landmark,
  Clock, CheckCircle2, XCircle, Ban, Calculator, FileText, Printer, TrendingUp, BarChart3,
  ArrowUpDown, ArrowDownToLine, ArrowUpFromLine, Building2,
  RefreshCcw, Paperclip, Shield, Coins,
  Filter, ChevronDown, ChevronUp, Trash2, AlertCircle, Bell,
  RotateCcw, History, Scale, FileDown } from "@buleje/design-system/icons";
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, LineChart, Line } from "recharts";
import { CardTitle, LoadingState, PageTitle, SectionTitle, WarningAlert } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/settings-context";
import PrestamoTimeline from "@/components/admin/prestamos/PrestamoTimeline";
import ClienteFormModal from "./clientes/ClienteFormModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type PrestamoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
type PrestamoTipo = "PERSONAL" | "BANCARIO" | "TERCERO" | "PROVEEDOR";
type PrestamoDireccion = "DADO" | "RECIBIDO";
type PrestamoEntidadTipo = "BANCO" | "PERSONA_NATURAL" | "EMPRESA" | "PROVEEDOR";
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

type PrestamoDocumento = {
  id: string;
  prestamoId: string;
  nombre: string;
  tipo: string;
  url: string;
  createdAt: string;
};

type Prestamo = {
  id: string;
  tenantId: string;
  customerId?: string;
  tipo: PrestamoTipo;
  direccion: PrestamoDireccion;
  entidadNombre?: string;
  entidadTipo?: PrestamoEntidadTipo;
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
  documentos?: PrestamoDocumento[];
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

const STATUS_META: Record<PrestamoStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  ACTIVO:    { label: "Activo",    color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)]",   icon: Clock },
  PAGADO:    { label: "Pagado",    color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)]", icon: CheckCircle2 },
  VENCIDO:   { label: "Vencido",   color: "text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-100)]",       icon: XCircle },
  CANCELADO: { label: "Cancelado", color: "text-[var(--text-secondary)]",     bg: "bg-gray-100",     icon: Ban },
};

const TIPO_META: Record<PrestamoTipo, { label: string; color: string; bg: string; icon: typeof Landmark }> = {
  PERSONAL:  { label: "Personal",  color: "text-[var(--data-success-500)]",     bg: "bg-[var(--accent-soft)]",     icon: User },
  BANCARIO:  { label: "Bancario",  color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]", icon: Building2 },
  TERCERO:   { label: "Tercero",   color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)]", icon: ArrowUpDown },
  PROVEEDOR: { label: "Proveedor", color: "text-[var(--data-success-500)]",     bg: "bg-[var(--accent-soft)]",     icon: Coins },
};

const DIRECCION_META: Record<PrestamoDireccion, { label: string; shortLabel: string; color: string; bg: string; icon: typeof ArrowDownToLine }> = {
  DADO:     { label: "Préstamo Dado",     shortLabel: "Dado",     color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)]",     icon: ArrowUpFromLine },
  RECIBIDO: { label: "Préstamo Recibido", shortLabel: "Recibido", color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)]", icon: ArrowDownToLine },
};

const SISTEMA_LABELS: Record<SistemaAmortizacion, string> = {
  FRANCES: "Francés (cuota fija)",
  ALEMAN: "Alemán (capital fijo)",
  AMERICANO: "Americano (pago final)",
};

const ENTIDAD_LABELS: Record<PrestamoEntidadTipo, string> = {
  BANCO: "Banco",
  PERSONA_NATURAL: "Persona Natural",
  EMPRESA: "Empresa",
  PROVEEDOR: "Proveedor",
};

function formatCurrency(n: number, moneda = "PEN") {
  const symbol = moneda === "USD" ? "$" : "S/";
  return `${symbol}${n.toFixed(2)}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const PER_PAGE = 10;

// ── Empty state for charts ───────────────────────────────────────────────────
function EmptyChartPrestamos({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
        <BarChart3 className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{message}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">Los datos aparecerán cuando registres préstamos</p>
    </div>
  );
}

// ── Sparkline KPI Card (mejora #1) ───────────────────────────────────────────

function genSparkData(base: number): { v: number }[] {
  const seed = Math.abs(base) || 100;
  return Array.from({ length: 6 }, (_, i) => ({
    v: Math.max(0, seed * (0.65 + Math.sin(i + seed * 0.01) * 0.2 + Math.cos(i * 1.5) * 0.15) * (1 + i * 0.04)),
  }));
}

function SparklineKPICard({
  title, value, sub, accentColor, iconColor, valueColor, icon: Icon, sparkData,
}: {
  title: string;
  value: string;
  sub?: string;
  /** Trazo del sparkline. Usa `var(--accent)` o `var(--text-tertiary)`. */
  accentColor: string;
  /** Icono — default neutro gris. */
  iconColor?: string;
  /** Valor numérico — default neutro; usa warning/error sólo si es crítico. */
  valueColor?: string;
  icon: React.ElementType;
  sparkData: { v: number }[];
}) {
  const gradId = `sp-${title.replace(/\W+/g, "")}`;
  const resolvedIconColor = iconColor ?? "var(--text-secondary)";
  const resolvedValueColor = valueColor ?? "var(--text-primary)";
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 relative overflow-hidden">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color: resolvedIconColor }} />
        <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] truncate">{title}</p>
      </div>
      <p className="text-xl font-extrabold font-mono leading-tight" style={{ color: resolvedValueColor }}>{value}</p>
      {sub && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
      <div className="absolute bottom-0 right-0 w-20 h-10 opacity-40 pointer-events-none">
        <ResponsiveContainer minWidth={0} width={80} height={40}>
          <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
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

// ── Amortization calculators (client-side) ───────────────────────────────────

function calcAmortizacion(monto: number, tasa: number, cuotas: number, sistema: SistemaAmortizacion, periodoGracia = 0) {
  const tasaMensual = tasa > 0 ? tasa / 100 / 12 : 0;
  const tabla: { num: number; cuota: number; interes: number; capital: number; saldo: number }[] = [];
  let saldo = monto;

  // Período de gracia: solo interés
  for (let i = 1; i <= periodoGracia; i++) {
    const interes = saldo * tasaMensual;
    tabla.push({ num: i, cuota: interes, interes, capital: 0, saldo });
  }

  const n = cuotas - periodoGracia;
  if (n <= 0) return tabla;

  if (sistema === "FRANCES") {
    const cuotaFija = tasaMensual > 0
      ? (saldo * tasaMensual * Math.pow(1 + tasaMensual, n)) / (Math.pow(1 + tasaMensual, n) - 1)
      : saldo / n;
    for (let i = 1; i <= n; i++) {
      const interes = saldo * tasaMensual;
      const capital = cuotaFija - interes;
      saldo = Math.max(0, saldo - capital);
      tabla.push({ num: periodoGracia + i, cuota: cuotaFija, interes, capital, saldo });
    }
  } else if (sistema === "ALEMAN") {
    const capitalFijo = saldo / n;
    for (let i = 1; i <= n; i++) {
      const interes = saldo * tasaMensual;
      const cuotaTotal = capitalFijo + interes;
      saldo = Math.max(0, saldo - capitalFijo);
      tabla.push({ num: periodoGracia + i, cuota: cuotaTotal, interes, capital: capitalFijo, saldo });
    }
  } else {
    // AMERICANO: solo interés + capital al final
    for (let i = 1; i <= n; i++) {
      const interes = saldo * tasaMensual;
      const capital = i === n ? saldo : 0;
      const cuotaTotal = interes + capital;
      if (i === n) saldo = 0;
      tabla.push({ num: periodoGracia + i, cuota: cuotaTotal, interes, capital, saldo });
    }
  }
  return tabla;
}

// ── Prestamos Dashboard ──────────────────────────────────────────────────────

function PrestamosDashboard({ prestamos, resumen }: { prestamos: Prestamo[]; resumen?: Resumen | null }) {
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
  // Sparkline data (mejora 1)
  const spark1 = genSparkData(totalDados); const spark2 = genSparkData(totalRecibidos);
  const spark3 = genSparkData(porCobrar); const spark4 = genSparkData(cuotasVencidas * 200);
  const spark5 = genSparkData(moraAcumulada); const spark6 = genSparkData(tasaRecuperacion * 50);

  // Area chart: cobros vs nuevos prestamos (6 meses)
  const areaData: { mes: string; cobrado: number; nuevos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-PE", { month: "short" });
    const cobrado = activosAll.reduce((s, p) => s + p.cuotas.filter(c => c.pagadoEn && c.pagadoEn.startsWith(mesKey)).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0);
    const nuevos = prestamos.filter(p => p.createdAt.startsWith(mesKey)).reduce((s, p) => s + p.monto, 0);
    areaData.push({ mes: label, cobrado, nuevos });
  }

  // Top 5 deudores (horizontal bar)
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

  // Mejora 4: Donut de riesgo con 4 estados (semáforo)
  const statusCounts = {
    ACTIVO: prestamos.filter(p => p.status === "ACTIVO").length,
    PAGADO: prestamos.filter(p => p.status === "PAGADO").length,
    VENCIDO: prestamos.filter(p => p.status === "VENCIDO").length,
    CANCELADO: prestamos.filter(p => p.status === "CANCELADO").length,
  };
  const donutData = [
    { name: "Activos", value: statusCounts.ACTIVO, color: "var(--data-warning)" },
    { name: "Pagados", value: statusCounts.PAGADO, color: "var(--data-success)" },
    { name: "Vencidos", value: statusCounts.VENCIDO, color: "var(--data-error)" },
    { name: "Cancelados", value: statusCounts.CANCELADO, color: "var(--text-tertiary)" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Mejora 1: KPI Cards con sparklines */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SparklineKPICard title="Dados" value={formatCurrency(totalDados)} sub={`${resumen?.activosDados ?? prestamos.filter(p=>p.direccion==="DADO"&&p.status==="ACTIVO").length} activos`} accentColor="var(--text-tertiary)" iconColor="var(--text-secondary)" icon={ArrowUpFromLine} sparkData={spark1} />
          <SparklineKPICard title="Recibidos" value={formatCurrency(totalRecibidos)} sub={`${resumen?.activosRecibidos ?? prestamos.filter(p=>p.direccion==="RECIBIDO"&&p.status==="ACTIVO").length} activos`} accentColor="var(--accent)" iconColor="var(--text-secondary)" icon={ArrowDownToLine} sparkData={spark2} />
          <SparklineKPICard title="Por cobrar" value={formatCurrency(resumen?.saldoDados ?? porCobrar)} accentColor="var(--text-tertiary)" iconColor="var(--text-secondary)" icon={DollarSign} sparkData={spark3} />
          <SparklineKPICard title="Cuotas vencidas" value={String(cuotasVencidas)} valueColor={cuotasVencidas > 0 ? "var(--data-warning)" : undefined} accentColor="var(--text-tertiary)" iconColor={cuotasVencidas > 0 ? "var(--data-warning)" : "var(--text-secondary)"} icon={XCircle} sparkData={spark4} />
          <SparklineKPICard title="Mora acumulada" value={formatCurrency(moraAcumulada)} valueColor={moraAcumulada > 0 ? "var(--data-warning)" : undefined} accentColor="var(--text-tertiary)" iconColor={moraAcumulada > 0 ? "var(--data-warning)" : "var(--text-secondary)"} icon={AlertTriangle} sparkData={spark5} />
          <SparklineKPICard title="Recuperación" value={`${tasaRecuperacion.toFixed(1)}%`} accentColor="var(--accent)" iconColor="var(--text-secondary)" icon={TrendingUp} sparkData={spark6} />
        </div>
      </m.div>

      {/* Mejora 5: Indicador de mora destacado */}
      {moraAcumulada > 0 && (
        <m.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
          <WarningAlert
            title="Mora Acumulada"
            description={
              <span>
                <span className="block text-3xl font-extrabold font-mono text-[var(--data-warning-500)]">
                  {formatCurrency(moraAcumulada)}
                </span>
                <span className="block text-xs mt-0.5">En prestamos con cuotas vencidas</span>
              </span>
            }
            action={
              <div className="text-right shrink-0">
                <p className="text-xs text-[var(--text-secondary)]">{cuotasVencidas} cuots. vencidas</p>
                <div className="mt-1 h-2 w-24 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--data-warning-500)] rounded-full"
                    style={{ width: `${Math.min(100, (cuotasVencidas / Math.max(1, prestamos.reduce((s,p)=>s+p.cuotas.length,0))) * 100 * 10)}%` }}
                  />
                </div>
              </div>
            }
          />
        </m.div>
      )}

      {/* AreaChart: cobros vs nuevos */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6 ">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4">Cobros vs Nuevos préstamos (6 meses)</CardTitle>
          {areaData.some(d => d.cobrado > 0 || d.nuevos > 0) ? (
            <ResponsiveContainer minWidth={0} width="100%" height={250}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="prestCobGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--data-success)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--data-success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prestNuevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--text-tertiary)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--text-tertiary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={((v: number, name: string) => [formatCurrency(Number(v)), name === "cobrado" ? "Cobrado" : "Nuevos"]) as never} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                <Legend formatter={(v: string) => v === "cobrado" ? "Cobrado" : "Nuevos préstamos"} />
                <Area type="monotone" dataKey="cobrado" stroke="var(--data-success)" fill="url(#prestCobGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="nuevos" stroke="var(--text-tertiary)" fill="url(#prestNuevGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartPrestamos message="Sin movimiento en los últimos 6 meses" />
          )}
        </div>
      </m.div>

      {/* Mejoras 3, 4 y 6: Top deudores + Donut riesgo + Dirección */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mejora 3: Top 5 deudores */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6 ">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-secondary" /> Top 5 deudores
            </CardTitle>
            {topDeudores.length > 0 ? (
              <ResponsiveContainer minWidth={0} width="100%" height={220}>
                <BarChart data={topDeudores} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={((v: number) => [formatCurrency(Number(v)), "Saldo"]) as never} contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
                  <Bar dataKey="monto" radius={[0, 6, 6, 0]}>
                    {topDeudores.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#ef4444" : i === 1 ? "#f97316" : "#f97316"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChartPrestamos message="Sin deudores activos" />
            )}
          </div>

          {/* Mejora 4: Donut de riesgo con 4 estados semáforo */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6 ">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[var(--text-secondary)]" /> Distribución por estado
            </CardTitle>
            {donutData.length > 0 ? (
              <>
                <ResponsiveContainer minWidth={0} width="100%" height={160}>
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
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{d.name}: <strong>{d.value}</strong></span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyChartPrestamos message="Sin préstamos" />
            )}
          </div>

          {/* Mejora 6: Resumen por dirección con barras comparativas */}
          <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] p-6 ">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Scale className="h-4 w-4 text-[var(--data-success-500)]" /> Dado vs Recibido
            </CardTitle>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpFromLine className="h-3.5 w-3.5 text-[var(--data-error-500)]" />
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Dados</span>
                  </div>
                  <span className="text-xs font-bold font-mono text-[var(--data-error-500)]">{formatCurrency(totalDados)}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <m.div className="h-full bg-[var(--data-error-500)] rounded-full" initial={{ width: 0 }} animate={{ width: `${(totalDados / maxDireccion) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
                </div>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{prestamos.filter(p=>p.direccion==="DADO").length} préstamos</p>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Recibidos</span>
                  </div>
                  <span className="text-xs font-bold font-mono text-[var(--data-success-500)]">{formatCurrency(totalRecibidos)}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <m.div className="h-full bg-[var(--accent-soft)] rounded-full" initial={{ width: 0 }} animate={{ width: `${(totalRecibidos / maxDireccion) * 100}%` }} transition={{ duration: 0.8, delay: 0.5 }} />
                </div>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{prestamos.filter(p=>p.direccion==="RECIBIDO").length} préstamos</p>
              </div>
              <div className="pt-3 border-t border-[var(--rule-soft)]">
                <p className="text-xs text-[var(--text-secondary)]">Balance neto</p>
                <p className={cn("text-lg font-extrabold font-mono", totalDados > totalRecibidos ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]")}>
                  {totalDados > totalRecibidos ? "− " : "+ "}{formatCurrency(Math.abs(totalDados - totalRecibidos))}
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{totalDados > totalRecibidos ? "Más dado que recibido" : "Más recibido que dado"}</p>
              </div>
            </div>
          </div>
        </div>
      </m.div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrestamosModule() {
  const { businessName, storeTheme } = useSettings();
  const storeName = (storeTheme as { storeName?: string } | null)?.storeName?.trim()
    || businessName?.trim()
    || "Tu Tienda";
  const storeLocation = (storeTheme as { address?: string } | null)?.address || "Pucallpa, Perú";
  const [activeTab, setActiveTab] = useState<"dashboard" | "activos" | "cobros" | "calculadora" | "historial">("dashboard");

  // Mejora nueva: Filtro por estado en prestamos
  const [prestamoStatusFilter, setPrestamoStatusFilter] = useState<"" | PrestamoStatus>("");

  // Prestamos list
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Detail
  const [selected, setSelected] = useState<Prestamo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Pago modal
  const [showPago, setShowPago] = useState(false);
  const [pagoCuotaId, setPagoCuotaId] = useState("");
  const [pagoMonto, setPagoMonto] = useState("");
  const [paying, setPaying] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  // Calculadora
  const [calcMonto, setCalcMonto] = useState("");
  const [calcTasa, setCalcTasa] = useState("");
  const [calcCuotas, setCalcCuotas] = useState("");

  // Create modal (from calculadora)
  const [showCreate, setShowCreate] = useState(false);
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [createNotas, setCreateNotas] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Create modal — campos extendidos
  const [createDireccion, setCreateDireccion] = useState<PrestamoDireccion>("DADO");
  const [createTipo, setCreateTipo] = useState<PrestamoTipo>("PERSONAL");
  const [createEntidadNombre, setCreateEntidadNombre] = useState("");
  const [createEntidadTipo, setCreateEntidadTipo] = useState<PrestamoEntidadTipo | "">("");
  const [createNroOperacion, setCreateNroOperacion] = useState("");
  const [createMoneda, setCreateMoneda] = useState("PEN");
  const [createMoraInteres, setCreateMoraInteres] = useState("");
  const [createTea, setCreateTea] = useState("");
  const [createPeriodoGracia, setCreatePeriodoGracia] = useState("");
  const [createGarantia, setCreateGarantia] = useState("");
  const [createFechaDesembolso, setCreateFechaDesembolso] = useState("");
  const [createStep, setCreateStep] = useState<1 | 2>(1);

  // Resumen API (mejoras dashboard)
  const [resumen, setResumen] = useState<Resumen | null>(null);

  // Cobros tab — cuotas próximas y vencidas
  type CuotaVencida = { cuotaId: string; prestamoId: string; numeroCuota: number; monto: number; fechaVence: string; diasAtraso: number; phone?: string; nombre: string; moneda: string };
  type CuotaProxima = { cuotaId: string; prestamoId: string; numeroCuota: number; monto: number; fechaVence: string; diasRestantes: number; phone?: string; nombre: string; moneda: string };
  const [cobrosData, setCobrosData] = useState<{ vencidas: CuotaVencida[]; proximas: CuotaProxima[] } | null>(null);
  const [cobrosLoading, setCobrosLoading] = useState(false);

  // Búsqueda mejorada (mejora 10)
  const [searchQuery, setSearchQuery] = useState("");

  // Filtro avanzado colapsable (mejora 7)
  const [showFilters, setShowFilters] = useState(false);
  const [filterFechaFrom, setFilterFechaFrom] = useState("");
  const [filterFechaTo, setFilterFechaTo] = useState("");
  const [filterMontoMin, setFilterMontoMin] = useState("");
  const [filterMontoMax, setFilterMontoMax] = useState("");
  const [filterTipo, setFilterTipo] = useState<"" | PrestamoTipo>("");
  const [filterDireccion, setFilterDireccion] = useState<"" | PrestamoDireccion>("");
  const [filterSistema, setFilterSistema] = useState<"" | SistemaAmortizacion>("");

  // Sort por columnas (mejora 8)
  const [sortKey, setSortKey] = useState<"monto" | "tasaInteres" | "numeroCuotas" | "createdAt" | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Bulk selection (mejora 9)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Refinanciar modal (mejora 15)
  const [showRefinanciar, setShowRefinanciar] = useState(false);
  const [refMonto, setRefMonto] = useState("");
  const [refTasa, setRefTasa] = useState("");
  const [refCuotas, setRefCuotas] = useState("");
  const [refSistema, setRefSistema] = useState<SistemaAmortizacion>("FRANCES");
  const [refinancing, setRefinancing] = useState(false);
  const [refinanciarError, setRefinanciarError] = useState<string | null>(null);

  // Cancelar préstamo (mejora 23)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // Upload de documento (mejora 17)
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Detalle: tab amortización vs timeline + pago múltiple + pago anticipado
  const [detailView, setDetailView] = useState<"timeline" | "amortizacion">("timeline");
  const [selectedCuotaIds, setSelectedCuotaIds] = useState<Set<string>>(new Set());
  const [showPagoAnticipado, setShowPagoAnticipado] = useState(false);
  const [payingMultiple, setPayingMultiple] = useState(false);

  // Calculadora: sistema selector + comparador (mejoras 19-21)
  const [calcSistema, setCalcSistema] = useState<SistemaAmortizacion>("FRANCES");
  const [showComparador, setShowComparador] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPrestamos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prestamos");
      if (!res.ok) throw new Error("Error al cargar préstamos");
      const data: Prestamo[] = await res.json();
      setPrestamos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResumen = useCallback(async () => {
    try {
      const res = await fetch("/api/prestamos/resumen");
      if (res.ok) setResumen(await res.json());
    } catch { /* silencioso */ }
  }, []);

  const fetchCobros = useCallback(async () => {
    setCobrosLoading(true);
    try {
      const res = await fetch("/api/prestamos/cobros?dias=30");
      if (res.ok) setCobrosData(await res.json());
    } catch { /* silencioso */ } finally {
      setCobrosLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrestamos(); fetchResumen(); }, [fetchPrestamos, fetchResumen]);
  useEffect(() => { if (activeTab === "cobros") fetchCobros(); }, [activeTab, fetchCobros]);

  // Cerrar modales con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPago) { setShowPago(false); return; }
      if (showRefinanciar) { setShowRefinanciar(false); return; }
      if (showCancelConfirm) { setShowCancelConfirm(false); return; }
      if (showCreate) { setShowCreate(false); return; }
      if (selected) { setSelected(null); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showPago, showRefinanciar, showCancelConfirm, showCreate, selected]);

  // ── Detail ─────────────────────────────────────────────────────────────────

  const openDetail = async (p: Prestamo) => {
    setSelected(p);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/prestamos/${p.id}`);
      if (res.ok) {
        const detail: Prestamo = await res.json();
        setSelected(detail);
      }
    } catch {
      // fallback
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Pay cuota ──────────────────────────────────────────────────────────────

  const handlePago = async () => {
    if (!selected) return;
    setPagoError(null);
    const monto = parseFloat(pagoMonto);
    if (!pagoCuotaId) { setPagoError("Selecciona una cuota"); return; }
    if (isNaN(monto) || monto <= 0) { setPagoError("Monto inválido"); return; }

    setPaying(true);
    try {
      const res = await fetch(`/api/prestamos/${selected.id}/pagar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ cuotaId: pagoCuotaId, montoPagado: monto }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al pagar");
      }
      const updated: Prestamo = await res.json();
      setSelected(updated);
      setShowPago(false);
      setPagoCuotaId("");
      setPagoMonto("");
      fetchPrestamos();
    } catch (e) {
      setPagoError(e instanceof Error ? e.message : "Error");
    } finally {
      setPaying(false);
    }
  };

  // ── Pay multiple cuotas (pago múltiple) ──────────────────────────────────

  const handlePagoMultiple = async () => {
    if (!selected || selectedCuotaIds.size === 0) return;
    setPayingMultiple(true);
    try {
      const cuotasToPay = selected.cuotas
        .filter(c => selectedCuotaIds.has(c.id) && !c.pagadoEn)
        .sort((a, b) => a.numeroCuota - b.numeroCuota);
      let updated: Prestamo = selected;
      for (const c of cuotasToPay) {
        const res = await fetch(`/api/prestamos/${selected.id}/pagar`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ cuotaId: c.id, montoPagado: c.monto }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Error" }));
          throw new Error(err.error || `Error pagando cuota ${c.numeroCuota}`);
        }
        updated = await res.json();
      }
      setSelected(updated);
      setSelectedCuotaIds(new Set());
      fetchPrestamos();
      fetchResumen();
    } catch (e) {
      setPagoError(e instanceof Error ? e.message : "Error");
    } finally {
      setPayingMultiple(false);
    }
  };

  // ── Refinanciar (mejora 15) ──────────────────────────────────────────────────

  const handleRefinanciar = async () => {
    if (!selected) return;
    setRefinanciarError(null);
    const monto = parseFloat(refMonto);
    const tasa = parseFloat(refTasa);
    const cuotas = parseInt(refCuotas);
    if (isNaN(monto) || monto <= 0) { setRefinanciarError("Monto inválido"); return; }
    if (isNaN(tasa) || tasa < 0) { setRefinanciarError("Tasa inválida"); return; }
    if (isNaN(cuotas) || cuotas <= 0) { setRefinanciarError("N° cuotas inválido"); return; }
    setRefinancing(true);
    try {
      const res = await fetch(`/api/prestamos/${selected.id}/refinanciar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ monto, tasaInteres: tasa, numeroCuotas: cuotas, sistemaAmortizacion: refSistema }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Error" })); throw new Error(err.error || "Error al refinanciar"); }
      const updated: Prestamo = await res.json();
      setSelected(updated);
      setShowRefinanciar(false);
      setRefMonto(""); setRefTasa(""); setRefCuotas("");
      fetchPrestamos();
    } catch (e) {
      setRefinanciarError(e instanceof Error ? e.message : "Error");
    } finally {
      setRefinancing(false);
    }
  };

  // ── Cancelar préstamo (mejora 23) ─────────────────────────────────────────

  const handleCancelPrestamo = async () => {
    if (!selected) return;
    setCanceling(true);
    try {
      const res = await fetch(`/api/prestamos/${selected.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "CANCELADO" }),
      });
      if (!res.ok) throw new Error("Error al cancelar");
      const updated: Prestamo = await res.json();
      setSelected(updated);
      setShowCancelConfirm(false);
      fetchPrestamos(); fetchResumen();
    } catch (e) { console.error(e); } finally { setCanceling(false); }
  };

  // ── Sort & Bulk helpers ────────────────────────────────────────────────────────

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginated.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(paginated.map(p => p.id)));
  };

  // ── Create prestamo ────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError(null);
    // Para préstamos DADO el cliente es obligatorio
    if (createDireccion === "DADO" && !createCustomerId.trim()) { setCreateError("Cliente requerido para préstamos dados"); return; }
    const monto = parseFloat(calcMonto);
    if (isNaN(monto) || monto <= 0) { setCreateError("Monto inválido — ve a la calculadora primero"); return; }
    // Para BANCARIO/TERCERO/PROVEEDOR se pide nombre de entidad
    if ((createTipo === "BANCARIO" || createTipo === "TERCERO" || createTipo === "PROVEEDOR") && !createEntidadNombre.trim()) {
      setCreateError("Ingresa el nombre del banco/entidad"); return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        monto,
        direccion: createDireccion,
        tipo: createTipo,
        sistemaAmortizacion: calcSistema,
        moneda: createMoneda,
      };
      if (createCustomerId.trim()) body.customerId = createCustomerId.trim();
      const tasa = parseFloat(calcTasa);
      if (!isNaN(tasa) && tasa >= 0) body.tasaInteres = tasa;
      const cuotas = parseInt(calcCuotas);
      if (!isNaN(cuotas) && cuotas > 0) body.numeroCuotas = cuotas;
      if (createEntidadNombre.trim()) body.entidadNombre = createEntidadNombre.trim();
      if (createEntidadTipo) body.entidadTipo = createEntidadTipo;
      if (createNroOperacion.trim()) body.nroOperacion = createNroOperacion.trim();
      const mora = parseFloat(createMoraInteres);
      if (!isNaN(mora) && mora > 0) body.moraInteres = mora;
      const tea = parseFloat(createTea);
      if (!isNaN(tea) && tea > 0) body.tea = tea;
      const gracia = parseInt(createPeriodoGracia);
      if (!isNaN(gracia) && gracia > 0) body.periodoGracia = gracia;
      if (createGarantia.trim()) body.garantia = createGarantia.trim();
      if (createFechaDesembolso) body.fechaDesembolso = createFechaDesembolso;
      if (createNotas.trim()) body.notas = createNotas.trim();

      const res = await fetch("/api/prestamos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al crear préstamo");
      }
      setShowCreate(false);
      resetCreateForm();
      setActiveTab("activos");
      fetchPrestamos();
      fetchResumen();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateCustomerId(""); setCreateNotas(""); setCreateDireccion("DADO");
    setCreateTipo("PERSONAL"); setCreateEntidadNombre(""); setCreateEntidadTipo("");
    setCreateNroOperacion(""); setCreateMoneda("PEN"); setCreateMoraInteres("");
    setCreateTea(""); setCreatePeriodoGracia(""); setCreateGarantia("");
    setCreateFechaDesembolso(""); setCreateStep(1); setCreateError(null);
  };

  // Bank presets para autocompletar campos
  const BANK_PRESETS: Array<{ nombre: string; entidadTipo: PrestamoEntidadTipo; tasaRef: string; moraRef: string; teaRef: string; sistema: SistemaAmortizacion }> = [
    { nombre: "BCP", entidadTipo: "BANCO", tasaRef: "1.5", moraRef: "15", teaRef: "19.56", sistema: "FRANCES" },
    { nombre: "BBVA", entidadTipo: "BANCO", tasaRef: "1.4", moraRef: "12", teaRef: "18.16", sistema: "FRANCES" },
    { nombre: "Interbank", entidadTipo: "BANCO", tasaRef: "1.6", moraRef: "14", teaRef: "20.98", sistema: "FRANCES" },
    { nombre: "Scotiabank", entidadTipo: "BANCO", tasaRef: "1.5", moraRef: "13", teaRef: "19.56", sistema: "FRANCES" },
    { nombre: "MiBanco", entidadTipo: "BANCO", tasaRef: "2.5", moraRef: "18", teaRef: "34.49", sistema: "FRANCES" },
    { nombre: "Caja Huancayo", entidadTipo: "BANCO", tasaRef: "2.8", moraRef: "20", teaRef: "39.29", sistema: "FRANCES" },
    { nombre: "Caja Arequipa", entidadTipo: "BANCO", tasaRef: "2.7", moraRef: "18", teaRef: "37.67", sistema: "FRANCES" },
    { nombre: "Caja Piura", entidadTipo: "BANCO", tasaRef: "2.9", moraRef: "20", teaRef: "40.91", sistema: "FRANCES" },
    { nombre: "Financiera Confianza", entidadTipo: "EMPRESA", tasaRef: "3.0", moraRef: "22", teaRef: "42.58", sistema: "FRANCES" },
    { nombre: "CrediScotia", entidadTipo: "EMPRESA", tasaRef: "2.2", moraRef: "15", teaRef: "29.84", sistema: "FRANCES" },
    { nombre: "Cooperativa", entidadTipo: "EMPRESA", tasaRef: "2.0", moraRef: "12", teaRef: "26.82", sistema: "FRANCES" },
  ];

  const applyBankPreset = (preset: typeof BANK_PRESETS[number]) => {
    setCreateEntidadNombre(preset.nombre);
    setCreateEntidadTipo(preset.entidadTipo);
    setCalcTasa(preset.tasaRef);
    setCreateMoraInteres(preset.moraRef);
    setCreateTea(preset.teaRef);
    setCalcSistema(preset.sistema);
    if (createTipo !== "BANCARIO") setCreateTipo("BANCARIO");
  };

  // ── Amortization calculator ────────────────────────────────────────────────

  const amortizacion = useMemo(() => {
    const m = parseFloat(calcMonto);
    const t = parseFloat(calcTasa);
    const n = parseInt(calcCuotas);
    if (isNaN(m) || isNaN(n) || m <= 0 || n <= 0) return [];
    return calcAmortizacion(m, isNaN(t) ? 0 : t, n, calcSistema);
  }, [calcMonto, calcTasa, calcCuotas, calcSistema]);

  // Comparador: los 3 sistemas con los mismos datos (mejora 19)
  const amortizacionAll = useMemo(() => {
    const m = parseFloat(calcMonto);
    const t = parseFloat(calcTasa);
    const n = parseInt(calcCuotas);
    if (isNaN(m) || isNaN(n) || m <= 0 || n <= 0) return null;
    const tasa = isNaN(t) ? 0 : t;
    return {
      FRANCES: calcAmortizacion(m, tasa, n, "FRANCES"),
      ALEMAN: calcAmortizacion(m, tasa, n, "ALEMAN"),
      AMERICANO: calcAmortizacion(m, tasa, n, "AMERICANO"),
    };
  }, [calcMonto, calcTasa, calcCuotas]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const activos = prestamos.filter(p => p.status === "ACTIVO" || p.status === "VENCIDO");
  const historial = prestamos.filter(p => p.status === "PAGADO" || p.status === "CANCELADO");

  const displayList = useMemo(() => {
    const base = activeTab === "activos" ? activos : historial;
    let list = prestamoStatusFilter ? base.filter(p => p.status === prestamoStatusFilter) : base;
    // Búsqueda (mejora 10)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.customerId || "").toLowerCase().includes(q) ||
        (p.entidadNombre || "").toLowerCase().includes(q) ||
        (p.nroOperacion || "").toLowerCase().includes(q)
      );
    }
    // Filtros avanzados (mejora 7)
    if (filterFechaFrom) list = list.filter(p => p.createdAt >= filterFechaFrom);
    if (filterFechaTo) list = list.filter(p => p.createdAt <= filterFechaTo + "T23:59:59");
    if (filterMontoMin) list = list.filter(p => p.monto >= parseFloat(filterMontoMin));
    if (filterMontoMax) list = list.filter(p => p.monto <= parseFloat(filterMontoMax));
    if (filterTipo) list = list.filter(p => p.tipo === filterTipo);
    if (filterDireccion) list = list.filter(p => p.direccion === filterDireccion);
    if (filterSistema) list = list.filter(p => p.sistemaAmortizacion === filterSistema);
    // Sort (mejora 8)
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = sortKey === "monto" ? a.monto : sortKey === "tasaInteres" ? a.tasaInteres : sortKey === "numeroCuotas" ? a.numeroCuotas : new Date(a.createdAt).getTime();
        const bv = sortKey === "monto" ? b.monto : sortKey === "tasaInteres" ? b.tasaInteres : sortKey === "numeroCuotas" ? b.numeroCuotas : new Date(b.createdAt).getTime();
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prestamos, activeTab, prestamoStatusFilter, searchQuery, filterFechaFrom, filterFechaTo, filterMontoMin, filterMontoMax, filterTipo, filterDireccion, filterSistema, sortKey, sortDir]);

  const activeFilterCount = [filterFechaFrom, filterFechaTo, filterMontoMin, filterMontoMax, filterTipo, filterDireccion, filterSistema].filter(Boolean).length;

  const clearFilters = () => {
    setFilterFechaFrom(""); setFilterFechaTo(""); setFilterMontoMin(""); setFilterMontoMax("");
    setFilterTipo(""); setFilterDireccion(""); setFilterSistema(""); setSearchQuery("");
  };

  const totalPages = Math.max(1, Math.ceil(displayList.length / PER_PAGE));
  const paginated = displayList.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const saldoPendiente = activos.reduce((s, p) => {
    const cuotasPendientes = p.cuotas.filter(c => !c.pagadoEn);
    return s + cuotasPendientes.reduce((sum, c) => sum + c.monto, 0);
  }, 0);

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [activeTab]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const prestamosDescription = activos.length > 0
    ? `Préstamos a clientes con cuotas programadas. ${activos.length} activos${saldoPendiente > 0 ? ` — saldo pendiente ${formatCurrency(saldoPendiente)}.` : "."}`
    : "Préstamos a clientes con cuotas programadas. Registra, calcula cuotas y lleva el seguimiento de pagos.";

  return (
    <div className="space-y-4 sm:space-y-6">
      <AdminModuleHeader
        icon={DollarSign}
        eyebrow="Finanzas · Créditos y cuotas"
        title="Préstamos"
        description={prestamosDescription}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--rule-base)] -mx-1 px-1 overflow-x-auto">
        {([
          { id: "dashboard" as const, label: "Dashboard" },
          { id: "activos" as const, label: "Préstamos Activos" },
          { id: "cobros" as const, label: "Cobros", badge: cobrosData ? cobrosData.vencidas.length : undefined },
          { id: "calculadora" as const, label: "Calculadora" },
          { id: "historial" as const, label: "Historial" },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5",
              activeTab === t.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t.id === "dashboard" && <BarChart3 className="h-3.5 w-3.5" />}
            {t.id === "cobros" && <Bell className="h-3.5 w-3.5" />}
            {t.label}
            {"badge" in t && t.badge != null && t.badge > 0 && (
              <span className="ml-0.5 bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-bold rounded-full px-1.5 py-0.5 leading-none">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Dashboard ────────────────────────────────────────────────── */}
      {activeTab === "dashboard" && !loading && <PrestamosDashboard prestamos={prestamos} resumen={resumen} />}
      {activeTab === "dashboard" && loading && (
        <LoadingState />
      )}

      {/* ── Resumen Cartera de Préstamos ───────────────────────────────────── */}
      {activeTab === "activos" && !loading && prestamos.length > 0 && (() => {
        const activosAll = prestamos.filter(p => p.status !== "CANCELADO");
        const totalPrestado = activosAll.reduce((s, p) => s + p.monto, 0);
        const porCobrar = activosAll.reduce((s, p) => s + p.cuotas.filter(c => !c.pagadoEn).reduce((ss, c) => ss + c.monto, 0), 0);
        const totalCobrado = activosAll.reduce((s, p) => s + p.cuotas.filter(c => c.pagadoEn).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0);
        const tasaRecuperacion = totalPrestado > 0 ? (totalCobrado / totalPrestado) * 100 : 0;
        const hoy = new Date();
        const cuotasVencidas = activosAll.reduce((s, p) => s + p.cuotas.filter(c => !c.pagadoEn && new Date(c.fechaVence) < hoy).length, 0);

        // Grafica mensual ultimos 6 meses
        const monthData: { mes: string; cobrado: number; nuevos: number }[] = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const label = d.toLocaleDateString("es-PE", { month: "short" });
          const cobrado = activosAll.reduce((s, p) => s + p.cuotas.filter(c => c.pagadoEn && c.pagadoEn.startsWith(mesKey)).reduce((ss, c) => ss + (c.montoPagado || c.monto), 0), 0);
          const nuevos = prestamos.filter(p => p.createdAt.startsWith(mesKey)).reduce((s, p) => s + p.monto, 0);
          monthData.push({ mes: label, cobrado, nuevos });
        }

        return (
          <div className="space-y-6">
            {/* KPI Cards — mejorado con iconos prominentes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl  hover:shadow-[var(--shadow-sm)] transition-shadow p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Landmark className="h-4 w-4 text-[var(--data-info-500)]" />
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total prestado</p>
                </div>
                <p className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">{formatCurrency(totalPrestado)}</p>
              </div>
              <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl  hover:shadow-[var(--shadow-sm)] transition-shadow p-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-secondary" />
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Por cobrar</p>
                </div>
                <p className={cn("text-2xl font-extrabold font-mono", porCobrar > totalPrestado * 0.5 ? "text-secondary" : "text-[var(--data-error-500)]")}>{formatCurrency(porCobrar)}</p>
              </div>
              <div className={cn("bg-white dark:bg-[var(--color-card)] border rounded-xl  hover:shadow-[var(--shadow-sm)] transition-shadow p-3", cuotasVencidas > 3 ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]")}>
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-4 w-4 text-[var(--data-error-500)]" />
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Cuotas vencidas</p>
                </div>
                <p className={cn("text-2xl font-extrabold font-mono", cuotasVencidas > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]")}>
                  {cuotasVencidas}
                </p>
              </div>
              <div className={cn("bg-white dark:bg-[var(--color-card)] border rounded-xl  hover:shadow-[var(--shadow-sm)] transition-shadow p-3", tasaRecuperacion > 80 ? "border-[var(--data-success-500)]/30" : "border-[var(--rule-base)]")}>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-[var(--data-success-500)]" />
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Tasa recuperacion</p>
                </div>
                <p className={cn("text-2xl font-extrabold font-mono", tasaRecuperacion > 80 ? "text-[var(--data-success-500)]" : tasaRecuperacion > 50 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                  {tasaRecuperacion.toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Grafica mensual */}
            {monthData.some(d => d.cobrado > 0 || d.nuevos > 0) && (
              <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 ">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-3 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Movimiento mensual (6 meses)
                </h4>
                <ResponsiveContainer minWidth={0} width="100%" height={180}>
                  <BarChart data={monthData}>
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} width={50} tickFormatter={(v: number) => `S/${v}`} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="cobrado" name="Cobrado" fill="var(--data-success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="nuevos" name="Nuevos" fill="var(--text-tertiary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })()}

      {/* Mejora 25: Banner de vencimiento */}
      {(activeTab === "activos" || activeTab === "historial") && !loading && (() => {
        const hoy = new Date();
        const semana = new Date(); semana.setDate(hoy.getDate() + 7);
        const venciendoProx = activos.filter(p => p.cuotas.some(c => !c.pagadoEn && new Date(c.fechaVence) >= hoy && new Date(c.fechaVence) <= semana));
        if (venciendoProx.length === 0) return null;
        return (
          <m.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] border-l-2 border-l-[var(--data-warning)] p-3 flex items-center gap-3">
            <Bell className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
            <p className="text-xs text-[var(--text-secondary)] font-semibold flex-1">
              {venciendoProx.length} préstamo{venciendoProx.length > 1 ? "s" : ""} con cuotas venciendo esta semana
            </p>
            <button onClick={() => { setPrestamoStatusFilter("ACTIVO"); setActiveTab("activos"); }} className="text-xs font-semibold text-[var(--data-warning-500)] hover:underline shrink-0">Ver</button>
          </m.div>
        );
      })()}

      {/* Mejora 10: Búsqueda + Mejora 7: Filtros */}
      {(activeTab === "activos" || activeTab === "historial") && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }} placeholder="Buscar por cliente, entidad, N° operación..." className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
            </div>
            <button onClick={() => setShowFilters(f => !f)} className={cn("flex items-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors", showFilters ? "bg-[var(--accent-600,var(--accent))] text-white border-[var(--accent)]" : "bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)]")}>
              <Filter className="h-4 w-4" />
              Filtros {activeFilterCount > 0 && <span className="bg-secondary text-white rounded-full text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5">{activeFilterCount}</span>}
            </button>
            <button onClick={() => { fetchPrestamos(); fetchResumen(); }} title="Recargar" className="p-2.5 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-gray-50 transition-colors">
              <RotateCcw className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
          </div>
          <AnimatePresence>
            {showFilters && (
              <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="bg-gray-50 rounded-xl border border-[var(--rule-base)] p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Desde</label><input type="date" value={filterFechaFrom} onChange={e => { setFilterFechaFrom(e.target.value); setPage(1); }} className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" /></div>
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Hasta</label><input type="date" value={filterFechaTo} onChange={e => { setFilterFechaTo(e.target.value); setPage(1); }} className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" /></div>
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Monto mín.</label><input type="number" value={filterMontoMin} onChange={e => { setFilterMontoMin(e.target.value); setPage(1); }} placeholder="0" className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" /></div>
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Monto máx.</label><input type="number" value={filterMontoMax} onChange={e => { setFilterMontoMax(e.target.value); setPage(1); }} placeholder="∞" className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" /></div>
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Tipo</label><select value={filterTipo} onChange={e => { setFilterTipo(e.target.value as ""|PrestamoTipo); setPage(1); }} className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none"><option value="">Todos</option>{Object.entries(TIPO_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Dirección</label><select value={filterDireccion} onChange={e => { setFilterDireccion(e.target.value as ""|PrestamoDireccion); setPage(1); }} className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none"><option value="">Todos</option><option value="DADO">Dado</option><option value="RECIBIDO">Recibido</option></select></div>
                    <div><label className="block text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] mb-1">Sistema amort.</label><select value={filterSistema} onChange={e => { setFilterSistema(e.target.value as ""|SistemaAmortizacion); setPage(1); }} className="w-full px-2.5 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-xs text-[var(--text-primary)] focus:outline-none"><option value="">Todos</option><option value="FRANCES">Francés</option><option value="ALEMAN">Alemán</option><option value="AMERICANO">Americano</option></select></div>
                    <div className="flex items-end"><button onClick={clearFilters} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--data-error-500)] bg-gray-100 hover:bg-[var(--data-error-50)] transition-colors"><Trash2 className="h-3.5 w-3.5" /> Limpiar</button></div>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Mejora 9: Status pills + bulk actions */}
      {(activeTab === "activos" || activeTab === "historial") && !loading && prestamos.length > 0 && (() => {
        const counts = { ACTIVO: prestamos.filter(p => p.status === "ACTIVO").length, PAGADO: prestamos.filter(p => p.status === "PAGADO").length, VENCIDO: prestamos.filter(p => p.status === "VENCIDO").length, CANCELADO: prestamos.filter(p => p.status === "CANCELADO").length };
        const pills = [
          { id: "" as "" | PrestamoStatus, label: "Todos", count: prestamos.length, activeBg: "bg-[var(--accent-600,var(--accent))] text-white", inactiveClass: "bg-gray-100 text-[var(--text-secondary)]" },
          { id: "ACTIVO" as PrestamoStatus, label: "Activos", count: counts.ACTIVO, activeBg: "bg-[var(--accent-soft)] text-white", inactiveClass: "bg-[var(--accent-soft)] text-[var(--data-success-500)] border border-[var(--data-success-500)]/30" },
          { id: "PAGADO" as PrestamoStatus, label: "Pagados", count: counts.PAGADO, activeBg: "bg-gray-500 text-white", inactiveClass: "bg-gray-100 text-[var(--text-secondary)] border border-[var(--rule-base)]" },
          { id: "VENCIDO" as PrestamoStatus, label: "Vencidos", count: counts.VENCIDO, activeBg: "bg-[var(--data-error-500)] text-white", inactiveClass: "bg-red-50 text-[var(--data-error-700)] border border-red-200" },
          { id: "CANCELADO" as PrestamoStatus, label: "Cancelados", count: counts.CANCELADO, activeBg: "bg-gray-700 text-white", inactiveClass: "bg-gray-100 text-[var(--text-secondary)] border border-[var(--rule-base)]" },
        ];
        return (
          <div className="flex flex-wrap gap-2 items-center">
            {pills.map(pill => (
              <button key={pill.id} onClick={() => { setPrestamoStatusFilter(pill.id); setPage(1); }} className={cn("shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors", prestamoStatusFilter === pill.id ? pill.activeBg : pill.inactiveClass)}>
                {pill.label} ({pill.count})
              </button>
            ))}
            {selectedIds.size > 0 && (
              <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/20">
                <span className="text-xs font-bold text-[var(--accent)]">{selectedIds.size} selec.</span>
                <button onClick={() => {
                  const sel = prestamos.filter(p => selectedIds.has(p.id));
                  const rows = sel.map(p => [p.id, p.entidadNombre||p.customerId||"", p.monto, p.tasaInteres, p.numeroCuotas, p.status].join(","));
                  const csv = ["ID,Cliente,Monto,Tasa,Cuotas,Status", ...rows].join("\n");
                  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  const a = document.createElement("a"); a.href = url; a.download = "prestamos.csv"; a.click(); URL.revokeObjectURL(url);
                }} className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:underline"><FileDown className="h-3 w-3" /> CSV</button>
                <button onClick={() => setSelectedIds(new Set())} className="text-[var(--accent)] hover:text-[var(--data-error-500)]"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        );
      })()}
      {(activeTab === "activos" || activeTab === "historial") && (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden ">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
              <p className="text-sm text-[var(--data-error-500)]">{error}</p>
              <button onClick={fetchPrestamos} className="text-xs text-[var(--accent)] hover:underline font-semibold">Reintentar</button>
            </div>
          ) : displayList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Landmark className="h-16 w-16 mb-4 text-[var(--text-tertiary)] mx-auto" />
              <CardTitle className="text-lg font-semibold text-[var(--text-primary)] mb-2">Sin préstamos</CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">Registra préstamos a clientes con cuotas</p>
              <button onClick={() => { setShowCreate(true); setCreateError(null); }} className="bg-[var(--accent-600,var(--accent))] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[var(--data-success-500)]">Crear préstamo</button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[600px] sm:min-w-0 text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-soft)] text-left">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === paginated.length} onChange={toggleSelectAll} className="rounded accent-blue-600 cursor-pointer" />
                      </th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Cliente</th>
                      <th className="px-2 py-3 font-semibold text-[var(--text-secondary)] text-center hidden sm:table-cell">Sys</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right cursor-pointer select-none hover:text-[var(--text-primary)]" onClick={() => handleSort("monto")}>
                        <span className="flex items-center justify-end gap-1">Monto {sortKey === "monto" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown className="h-3 w-3 opacity-40" />}</span>
                      </th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right hidden sm:table-cell cursor-pointer select-none hover:text-[var(--text-primary)]" onClick={() => handleSort("tasaInteres")}>
                        <span className="flex items-center justify-end gap-1">Tasa {sortKey === "tasaInteres" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown className="h-3 w-3 opacity-40" />}</span>
                      </th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right hidden sm:table-cell cursor-pointer select-none hover:text-[var(--text-primary)]" onClick={() => handleSort("numeroCuotas")}>
                        <span className="flex items-center justify-end gap-1">Cuotas {sortKey === "numeroCuotas" ? (sortDir === "asc" ? "↑" : "↓") : <ArrowUpDown className="h-3 w-3 opacity-40" />}</span>
                      </th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right">Saldo</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(p => {
                      const meta = STATUS_META[p.status];
                      const StatusIcon = meta.icon;
                      const cuotasPagadas = p.cuotas.filter(c => c.pagadoEn).length;
                      const saldoPend = p.cuotas.filter(c => !c.pagadoEn).reduce((s, c) => s + c.monto, 0);
                      const proxVence = p.cuotas.find(c => !c.pagadoEn);
                      // Mejora 11: Indicador visual de riesgo (semáforo)
                      const rowNow = new Date(); const rowSemana = new Date(); rowSemana.setDate(rowNow.getDate() + 7);
                      const tieneVenc = p.cuotas.some(c => !c.pagadoEn && new Date(c.fechaVence) < rowNow);
                      const venceSemana = !tieneVenc && p.cuotas.some(c => !c.pagadoEn && new Date(c.fechaVence) <= rowSemana);
                      const riskDot = tieneVenc ? "bg-[var(--data-error-500)]" : venceSemana ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent-soft)]";
                      // Mejora 12: Badge de sistema de amortización
                      const sisBadge = p.sistemaAmortizacion === "FRANCES" ? "F" : p.sistemaAmortizacion === "ALEMAN" ? "A" : "AM";
                      const sisBg = p.sistemaAmortizacion === "FRANCES" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : p.sistemaAmortizacion === "ALEMAN" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]";
                      return (
                        <tr key={p.id} className={cn("border-b border-gray-50 hover:bg-gray-50 transition-colors", selectedIds.has(p.id) && "bg-[var(--accent-soft)]")}>
                          <td className="px-3 py-3 w-8" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded accent-blue-600 cursor-pointer" />
                          </td>
                          <td className="px-4 py-3 cursor-pointer" onClick={() => openDetail(p)}>
                            <div className="flex items-center gap-2">
                              <div className="relative h-8 w-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
                                <User className="h-4 w-4 text-secondary" />
                                <span className={cn("absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", riskDot)} title={tieneVenc ? "Cuota vencida" : venceSemana ? "Vence esta semana" : "Al día"} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--text-primary)] truncate">{p.entidadNombre || p.customerId}</p>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                  <div className="bg-[var(--accent)] h-1.5 rounded-full" style={{ width: `${p.numeroCuotas > 0 ? (cuotasPagadas / p.numeroCuotas) * 100 : 0}%` }} />
                                </div>
                                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{cuotasPagadas}/{p.numeroCuotas} cuotas</span>
                                {proxVence && (
                                  <span className="ml-1 text-[length:var(--ts-2xs)] bg-[var(--data-warning-100)] text-[var(--data-warning-500)] px-1.5 py-0.5 rounded-full">
                                    {new Date(proxVence.fechaVence).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })} · {formatCurrency(proxVence.monto)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3 hidden sm:table-cell text-center cursor-pointer" onClick={() => openDetail(p)}>
                            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[length:var(--ts-2xs)] font-bold", sisBg)}>{sisBadge}</span>
                          </td>
                          <td className="num px-4 py-3 font-medium text-[var(--text-primary)] cursor-pointer" onClick={() => openDetail(p)}>{formatCurrency(p.monto)}</td>
                          <td className="num px-4 py-3 text-[var(--text-secondary)] hidden sm:table-cell cursor-pointer" onClick={() => openDetail(p)}>{p.tasaInteres}%</td>
                          <td className="num px-4 py-3 text-[var(--text-secondary)] hidden sm:table-cell cursor-pointer" onClick={() => openDetail(p)}>{p.numeroCuotas}</td>
                          <td className="num px-4 py-3 font-bold text-[var(--text-primary)] cursor-pointer" onClick={() => openDetail(p)}>{formatCurrency(saldoPend)}</td>
                          <td className="px-4 py-3 cursor-pointer" onClick={() => openDetail(p)}>
                            <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                              <StatusIcon className="h-3 w-3" />
                              {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                  <p className="text-xs text-[var(--text-secondary)]">{displayList.length} préstamo{displayList.length !== 1 ? "s" : ""} — Pág. {page}/{totalPages}</p>
                  <div className="flex gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Cobros ─────────────────────────────────────────────────────── */}
      {activeTab === "cobros" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <SectionTitle className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Bell className="h-4 w-4 text-[var(--data-warning-500)]" /> Centro de Cobros
              </SectionTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Cuotas vencidas y próximas a vencer (30 días)</p>
            </div>
            <button
              onClick={fetchCobros}
              disabled={cobrosLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-600,var(--accent))] text-white text-xs font-bold hover:opacity-90 transition disabled:opacity-50"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", cobrosLoading && "animate-spin")} />
              Actualizar
            </button>
          </div>

          {cobrosLoading && (
            <LoadingState />
          )}

          {!cobrosLoading && cobrosData && (
            <>
              {/* Vencidas */}
              <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--data-error-500)] rounded-xl  overflow-hidden">
                <div className="bg-[var(--data-error-50)] px-4 py-3 flex items-center gap-2 border-b border-[var(--data-error-500)]">
                  <XCircle className="h-4 w-4 text-[var(--data-error-500)]" />
                  <span className="text-sm font-bold text-[var(--data-error-500)]">
                    Cuotas Vencidas ({cobrosData.vencidas.length})
                  </span>
                </div>
                {cobrosData.vencidas.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">Sin cuotas vencidas.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {cobrosData.vencidas.map((c) => {
                      const symbol = c.moneda === "USD" ? "$" : "S/";
                      const msg = encodeURIComponent(
                        `🏪 *${storeName}*\n━━━━━━━━━━━━━━━━━━━\n⚠️ *CUOTA VENCIDA*\n━━━━━━━━━━━━━━━━━━━\nHola *${c.nombre}* 👋\n\nTienes una cuota de préstamo vencida:\n\n  💰 *Cuota N°${c.numeroCuota}:* ${symbol}${Number(c.monto).toFixed(2)}\n  📅 Venció hace *${c.diasAtraso} día${c.diasAtraso !== 1 ? "s" : ""}*\n\nPor favor, regulariza tu pago para evitar mora adicional.\n\n_${storeName}_ 🙏`
                      );
                      const waLink = c.phone
                        ? `https://wa.me/${c.phone.replace(/\D/g, "").length === 9 ? `51${c.phone.replace(/\D/g, "")}` : c.phone.replace(/\D/g, "")}?text=${msg}`
                        : null;
                      return (
                        <div key={c.cuotaId} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[var(--text-primary)] truncate">{c.nombre}</span>
                              <span className="text-[length:var(--ts-2xs)] font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                {c.diasAtraso}d atraso
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              Cuota N°{c.numeroCuota} · Vencía {new Date(c.fechaVence).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                            </p>
                          </div>
                          <span className="text-sm font-extrabold font-mono text-[var(--data-error-500)] shrink-0">
                            {symbol}{Number(c.monto).toFixed(2)}
                          </span>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] text-white text-xs font-bold hover:bg-[var(--accent-soft)] transition"
                              title="Enviar recordatorio por WhatsApp"
                            >
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              WA
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Próximas */}
              <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--data-warning-500)] rounded-xl  overflow-hidden">
                <div className="bg-[var(--data-warning-50)] px-4 py-3 flex items-center gap-2 border-b border-[var(--data-warning-500)]">
                  <Clock className="h-4 w-4 text-[var(--data-warning-500)]" />
                  <span className="text-sm font-bold text-[var(--data-warning-500)]">
                    Próximas a vencer — 30 días ({cobrosData.proximas.length})
                  </span>
                </div>
                {cobrosData.proximas.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">Sin cuotas próximas este mes</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {cobrosData.proximas.map((c) => {
                      const symbol = c.moneda === "USD" ? "$" : "S/";
                      const isUrgent = c.diasRestantes <= 3;
                      const msg = encodeURIComponent(
                        `🏪 *${storeName}*\n━━━━━━━━━━━━━━━━━━━\n📅 *RECORDATORIO DE CUOTA*\n━━━━━━━━━━━━━━━━━━━\nHola *${c.nombre}* 👋\n\nTe recordamos que tienes una cuota próxima:\n\n  💰 *Cuota N°${c.numeroCuota}:* ${symbol}${Number(c.monto).toFixed(2)}\n  📅 Vence en *${c.diasRestantes} día${c.diasRestantes !== 1 ? "s" : ""}*\n\n¡Ten listo tu pago a tiempo! 🙏\n\n_${storeName}_`
                      );
                      const waLink = c.phone
                        ? `https://wa.me/${c.phone.replace(/\D/g, "").length === 9 ? `51${c.phone.replace(/\D/g, "")}` : c.phone.replace(/\D/g, "")}?text=${msg}`
                        : null;
                      return (
                        <div key={c.cuotaId} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[var(--text-primary)] truncate">{c.nombre}</span>
                              <span className={cn(
                                "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap",
                                isUrgent
                                  ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                                  : "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                              )}>
                                {c.diasRestantes}d restantes
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              Cuota N°{c.numeroCuota} · Vence {new Date(c.fechaVence).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                            </p>
                          </div>
                          <span className="text-sm font-extrabold font-mono text-[var(--text-primary)] shrink-0">
                            {symbol}{Number(c.monto).toFixed(2)}
                          </span>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] text-white text-xs font-bold hover:bg-[var(--accent-soft)] transition"
                              title="Enviar recordatorio por WhatsApp"
                            >
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              WA
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {!cobrosLoading && !cobrosData && (
            <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
              Haz clic en <strong>Actualizar</strong> para cargar las cuotas.
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Calculadora ──────────────────────────────────────────────────── */}
      {activeTab === "calculadora" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6  space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Monto (S/)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={calcMonto}
                  onChange={e => setCalcMonto(e.target.value)}
                  placeholder="1000"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Tasa de interés (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={calcTasa}
                  onChange={e => setCalcTasa(e.target.value)}
                  placeholder="12"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">N° cuotas</label>
                <input type="number" min="1" max="60" value={calcCuotas} onChange={e => setCalcCuotas(e.target.value)} placeholder="12" className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30" />
              </div>
              {/* Mejora 19: Sistema selector */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Sistema amortización</label>
                <select value={calcSistema} onChange={e => setCalcSistema(e.target.value as SistemaAmortizacion)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30">
                  {Object.entries(SISTEMA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {amortizacion.length > 0 && (
                <>
                  <button onClick={() => { setShowCreate(true); setCreateError(null); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--data-success-500)]  transition-colors">
                    <Plus className="h-4 w-4" /> Crear Préstamo con estos datos
                  </button>
                  <button onClick={() => setShowComparador(c => !c)} className={cn("inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold  transition-colors border", showComparador ? "bg-[var(--accent-soft)] text-white border-[var(--data-success-500)]/30" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--data-success-500)]/30 hover:text-[var(--data-success-500)]")}>
                    <Scale className="h-4 w-4" /> Comparar sistemas
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Amortization table */}
          {amortizacion.length > 0 && (
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden ">
              <div className="px-4 py-3 border-b border-[var(--rule-soft)]">
                <p className="text-sm font-bold text-[var(--text-primary)]">Tabla de amortización</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Cuota mensual: <span className="font-bold">{formatCurrency(amortizacion[0]?.cuota ?? 0)}</span>
                  {" — "}
                  Total a pagar: <span className="font-bold">{formatCurrency(amortizacion.reduce((s, r) => s + r.cuota, 0))}</span>
                </p>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[var(--color-card)]">
                    <tr className="border-b border-[var(--rule-soft)] text-left">
                      <th className="px-4 py-2 font-semibold text-[var(--text-secondary)] text-center">#</th>
                      <th className="px-4 py-2 font-semibold text-[var(--text-secondary)] text-right">Cuota</th>
                      <th className="px-4 py-2 font-semibold text-[var(--text-secondary)] text-right">Interés</th>
                      <th className="px-4 py-2 font-semibold text-[var(--text-secondary)] text-right">Capital</th>
                      <th className="px-4 py-2 font-semibold text-[var(--text-secondary)] text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amortizacion.map(r => (
                      <tr key={r.num} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-center text-[var(--text-secondary)]">{r.num}</td>
                        <td className="px-4 py-2 text-right font-medium text-[var(--text-primary)]">{formatCurrency(r.cuota)}</td>
                        <td className="px-4 py-2 text-right text-[var(--data-error-500)]">{formatCurrency(r.interes)}</td>
                        <td className="px-4 py-2 text-right text-[var(--data-success-500)]">{formatCurrency(r.capital)}</td>
                        <td className="px-4 py-2 text-right text-[var(--text-primary)]">{formatCurrency(r.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mejora 20: Gráfico capital vs interés */}
          {amortizacion.length > 0 && (
            <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 ">
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--data-info-500)]" /> Evolución Capital vs Interés ({calcSistema})
              </CardTitle>
              <ResponsiveContainer minWidth={0} width="100%" height={220}>
                <LineChart data={amortizacion}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" />
                  <XAxis dataKey="num" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => `S/${v.toFixed(0)}`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={((v: number, n: string) => [formatCurrency(Number(v)), n === "capital" ? "Capital" : n === "interes" ? "Interés" : "Saldo"]) as never} contentStyle={{ borderRadius: "12px", fontSize: "12px" }} />
                  <Legend formatter={(v: string) => v === "capital" ? "Capital" : v === "interes" ? "Interés" : "Saldo"} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="capital" stroke="var(--data-success)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="interes" stroke="var(--data-warning)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="saldo" stroke="var(--text-tertiary)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Mejora 21: Resumen totales */}
          {amortizacion.length > 0 && (() => {
            const totalPagar = amortizacion.reduce((s, r) => s + r.cuota, 0);
            const totalInt = amortizacion.reduce((s, r) => s + r.interes, 0);
            const cuotaProm = totalPagar / amortizacion.length;
            const montoBase = parseFloat(calcMonto) || 0;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[{ label: "Total a pagar", value: formatCurrency(totalPagar), color: "text-[var(--text-primary)]" }, { label: "Total intereses", value: formatCurrency(totalInt), color: "text-[var(--data-error-500)]" }, { label: "Cuota promedio", value: formatCurrency(cuotaProm), color: "text-[var(--accent)]" }, { label: "Costo / capital", value: montoBase > 0 ? `${((totalInt / montoBase) * 100).toFixed(1)}%` : "—", color: "text-[var(--data-warning-500)]" }].map(kpi => (
                  <div key={kpi.label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3  text-center">
                    <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">{kpi.label}</p>
                    <p className={cn("text-lg font-extrabold font-mono", kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Mejora 19: Comparador de los 3 sistemas */}
          {showComparador && amortizacionAll && (() => {
            const sistemas = Object.entries(amortizacionAll) as [SistemaAmortizacion, { num: number; cuota: number; interes: number; capital: number; saldo: number }[]][];
            const colores: Record<SistemaAmortizacion, string> = { FRANCES: "var(--data-success)", ALEMAN: "var(--text-secondary)", AMERICANO: "var(--text-tertiary)" };
            return (
              <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6  space-y-4">
                <CardTitle className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Scale className="h-4 w-4 text-[var(--data-success-500)]" /> Comparador — mismo monto, tasa y plazo
                </CardTitle>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sistemas.map(([sis, tabla]) => {
                    const total = tabla.reduce((s, r) => s + r.cuota, 0);
                    const intTotal = tabla.reduce((s, r) => s + r.interes, 0);
                    return (
                      <div key={sis} className="border border-[var(--rule-base)] rounded-xl p-4 space-y-1" style={{ borderTopColor: colores[sis], borderTopWidth: 3 }}>
                        <p className="text-xs font-bold text-[var(--text-primary)] mb-2">{SISTEMA_LABELS[sis]}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">1ª cuota: <strong className="text-[var(--text-primary)]">{formatCurrency(tabla[0]?.cuota ?? 0)}</strong></p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Última: <strong className="text-[var(--text-primary)]">{formatCurrency(tabla[tabla.length-1]?.cuota ?? 0)}</strong></p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Intereses: <strong className="text-[var(--data-error-500)]">{formatCurrency(intTotal)}</strong></p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">Total: <strong className="text-[var(--text-primary)]">{formatCurrency(total)}</strong></p>
                        <button onClick={() => { setCalcSistema(sis); setShowComparador(false); }} className="mt-2 w-full text-[length:var(--ts-2xs)] font-bold py-1.5 rounded-lg transition-colors" style={{ backgroundColor: colores[sis] + "20", color: colores[sis] }}>Usar este sistema</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Detail Sheet ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div
              key="prestamo-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop" style={{ zIndex: 40 }}
              onClick={() => setSelected(null)}
            />
            <m.div
              key="prestamo-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-[var(--color-card)] border-l border-[var(--rule-base)] overflow-y-auto"
            >
              <div className="p-4 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Detalle Préstamo</CardTitle>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <X className="h-5 w-5 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Info */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{selected.customerId}</p>
                      <p className="text-xs text-[var(--text-secondary)]">Creado: {formatDate(selected.createdAt)}</p>
                    </div>
                    <span className={cn("ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", STATUS_META[selected.status].bg, STATUS_META[selected.status].color)}>
                      {STATUS_META[selected.status].label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--rule-base)]">
                    <div>
                      <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Monto</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.monto)}</p>
                    </div>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Tasa</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{selected.tasaInteres}%</p>
                    </div>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Cuotas</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{selected.numeroCuotas}</p>
                    </div>
                  </div>
                  {/* Mejora 18: Resumen financiero */}
                  {(() => {
                    const pagadas = selected.cuotas.filter(c => c.pagadoEn);
                    const pendientes = selected.cuotas.filter(c => !c.pagadoEn);
                    const totalPagado = pagadas.reduce((s, c) => s + (c.montoPagado || c.monto), 0);
                    const totalPendiente = pendientes.reduce((s, c) => s + c.monto, 0);
                    const interesesPag = pagadas.reduce((s, c) => s + c.interes, 0);
                    const moraAcum = Math.max(0, pagadas.reduce((s, c) => s + ((c.montoPagado||c.monto) - c.monto), 0));
                    return (
                      <div className="mt-3 pt-3 border-t border-[var(--rule-base)] grid grid-cols-2 gap-2">
                        {[{ label: "Pagado", val: formatCurrency(totalPagado), col: "text-[var(--data-success-500)]" }, { label: "Pendiente", val: formatCurrency(totalPendiente), col: "text-secondary" }, { label: "Intereses pag.", val: formatCurrency(interesesPag), col: "text-[var(--data-error-500)]" }, { label: "Mora acum.", val: formatCurrency(moraAcum), col: moraAcum > 0 ? "text-[var(--data-warning-600)]" : "text-[var(--text-tertiary)]" }].map(item => (
                          <div key={item.label} className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)]">{item.label}</p>
                            <p className={cn("text-sm font-extrabold font-mono", item.col)}>{item.val}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Datos del préstamo (tipo, entidad, sistema, etc.) */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">Información del préstamo</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Dirección:</span>
                      <span className="font-bold" style={{ color: DIRECCION_META[selected.direccion].color }}>{DIRECCION_META[selected.direccion].label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Tipo:</span>
                      <span className="font-bold" style={{ color: TIPO_META[selected.tipo].color }}>{TIPO_META[selected.tipo].label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Sistema:</span>
                      <span className="font-bold text-[var(--text-primary)]">{SISTEMA_LABELS[selected.sistemaAmortizacion]}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Moneda:</span>
                      <span className="font-bold text-[var(--text-primary)]">{selected.moneda}</span>
                    </div>
                    {selected.tea != null && selected.tea > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">TEA:</span>
                        <span className="font-bold text-[var(--text-primary)]">{selected.tea}%</span>
                      </div>
                    )}
                    {selected.moraInteres > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Mora:</span>
                        <span className="font-bold text-[var(--data-error-500)]">{selected.moraInteres}%</span>
                      </div>
                    )}
                    {selected.periodoGracia > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Gracia:</span>
                        <span className="font-bold text-[var(--text-primary)]">{selected.periodoGracia} meses</span>
                      </div>
                    )}
                    {selected.entidadNombre && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-[var(--text-secondary)]">Entidad:</span>
                        <span className="font-bold text-[var(--text-primary)]">{selected.entidadNombre} {selected.entidadTipo ? `(${ENTIDAD_LABELS[selected.entidadTipo]})` : ""}</span>
                      </div>
                    )}
                    {selected.nroOperacion && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-[var(--text-secondary)]">N° Op:</span>
                        <span className="font-bold text-[var(--text-primary)] font-mono">{selected.nroOperacion}</span>
                      </div>
                    )}
                    {selected.fechaDesembolso && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Desembolso:</span>
                        <span className="font-bold text-[var(--text-primary)]">{formatDate(selected.fechaDesembolso)}</span>
                      </div>
                    )}
                    {selected.garantia && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-[var(--text-secondary)]">Garantía:</span>
                        <span className="font-bold text-[var(--text-primary)] truncate ml-2">{selected.garantia}</span>
                      </div>
                    )}
                    {selected.notas && (
                      <div className="col-span-2 pt-1 border-t border-[var(--rule-base)]">
                        <span className="text-[var(--text-secondary)]">Notas:</span>
                        <p className="text-[var(--text-primary)] mt-0.5">{selected.notas}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cronograma de cuotas — tabs: timeline vs tabla amortización */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Cronograma de cuotas</h4>
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setDetailView("timeline")}
                        className={cn("px-2.5 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition-colors", detailView === "timeline" ? "bg-white dark:bg-[var(--color-card)] text-[var(--accent)] " : "text-[var(--text-secondary)]")}
                      >
                        Timeline
                      </button>
                      <button
                        onClick={() => setDetailView("amortizacion")}
                        className={cn("px-2.5 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition-colors", detailView === "amortizacion" ? "bg-white dark:bg-[var(--color-card)] text-[var(--accent)] " : "text-[var(--text-secondary)]")}
                      >
                        Tabla
                      </button>
                    </div>
                  </div>
                  {detailLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                    </div>
                  ) : selected.cuotas.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-4">Sin cuotas</p>
                  ) : (
                    <>
                      {/* Vista Timeline */}
                      {detailView === "timeline" && (
                        <PrestamoTimeline cuotas={selected.cuotas} totalCuotas={selected.numeroCuotas} />
                      )}

                      {/* Vista Tabla de Amortización */}
                      {detailView === "amortizacion" && (() => {
                        let saldoVivo = selected.monto;
                        const rows = selected.cuotas.map(c => {
                          const row = { ...c, saldo: Math.max(0, saldoVivo - c.capital) };
                          saldoVivo = row.saldo;
                          return row;
                        });
                        const totalCapital = selected.cuotas.reduce((s, c) => s + c.capital, 0);
                        const totalInteres = selected.cuotas.reduce((s, c) => s + c.interes, 0);
                        const totalCuota = selected.cuotas.reduce((s, c) => s + c.monto, 0);
                        return (
                          <div className="overflow-x-auto -mx-1">
                            <table className="w-full text-[length:var(--ts-xs)]">
                              <thead>
                                <tr className="border-b border-[var(--rule-base)]">
                                  <th className="text-left py-1.5 px-1 font-bold text-[var(--text-tertiary)]">#</th>
                                  <th className="text-left py-1.5 px-1 font-bold text-[var(--text-tertiary)]">Fecha</th>
                                  <th className="text-right py-1.5 px-1 font-bold text-[var(--text-tertiary)]">Capital</th>
                                  <th className="text-right py-1.5 px-1 font-bold text-[var(--text-tertiary)]">Interés</th>
                                  <th className="text-right py-1.5 px-1 font-bold text-[var(--text-tertiary)]">Cuota</th>
                                  <th className="text-right py-1.5 px-1 font-bold text-[var(--text-tertiary)]">Saldo</th>
                                  <th className="text-center py-1.5 px-1 font-bold text-[var(--text-tertiary)]">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(c => (
                                  <tr key={c.id} className={cn("border-b border-[var(--rule-soft)]", c.pagadoEn ? "bg-[var(--accent-soft)]/50" : !c.pagadoEn && new Date(c.fechaVence) < new Date() ? "bg-[var(--data-error-50)]/50" : "")}>
                                    <td className="py-1.5 px-1 font-mono text-[var(--text-secondary)]">{c.numeroCuota}</td>
                                    <td className="py-1.5 px-1 text-[var(--text-secondary)]">{new Date(c.fechaVence).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</td>
                                    <td className="py-1.5 px-1 text-right font-mono text-[var(--text-primary)]">{formatCurrency(c.capital)}</td>
                                    <td className="py-1.5 px-1 text-right font-mono text-[var(--data-error-500)]/70">{formatCurrency(c.interes)}</td>
                                    <td className="py-1.5 px-1 text-right font-mono font-bold text-[var(--text-primary)]">{formatCurrency(c.monto)}</td>
                                    <td className="py-1.5 px-1 text-right font-mono text-[var(--data-success-500)]">{formatCurrency(c.saldo)}</td>
                                    <td className="py-1.5 px-1 text-center">
                                      {c.pagadoEn ? (
                                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">PAGADA</span>
                                      ) : new Date(c.fechaVence) < new Date() ? (
                                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-100)] px-1.5 py-0.5 rounded">VENCIDA</span>
                                      ) : (
                                        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)] bg-[var(--data-warning-100)] px-1.5 py-0.5 rounded">PEND.</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-[var(--rule-base)] font-bold">
                                  <td colSpan={2} className="py-2 px-1 text-[var(--text-secondary)]">TOTAL</td>
                                  <td className="py-2 px-1 text-right font-mono text-[var(--text-primary)]">{formatCurrency(totalCapital)}</td>
                                  <td className="py-2 px-1 text-right font-mono text-[var(--data-error-500)]">{formatCurrency(totalInteres)}</td>
                                  <td className="py-2 px-1 text-right font-mono text-[var(--text-primary)]">{formatCurrency(totalCuota)}</td>
                                  <td colSpan={2}></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        );
                      })()}

                      {/* Pago anticipado total — solo si hay cuotas pendientes */}
                      {selected.status === "ACTIVO" && (() => {
                        const pendientes = selected.cuotas.filter(c => !c.pagadoEn);
                        if (pendientes.length === 0) return null;
                        const capitalPendiente = pendientes.reduce((s, c) => s + c.capital, 0);
                        const interesPendiente = pendientes.reduce((s, c) => s + c.interes, 0);
                        const totalPendiente = pendientes.reduce((s, c) => s + c.monto, 0);
                        // Descuento: solo cobrar capital + intereses devengados (del mes actual)
                        const pagoAnticipado = capitalPendiente + (pendientes[0]?.interes || 0);
                        const ahorro = totalPendiente - pagoAnticipado;
                        return (
                          <div className="mt-3 bg-[var(--accent-soft)] rounded-xl p-3 border border-[var(--data-success-500)]/30">
                            <button
                              onClick={() => setShowPagoAnticipado(!showPagoAnticipado)}
                              className="w-full flex items-center justify-between"
                            >
                              <span className="text-xs font-bold text-[var(--data-success-500)] flex items-center gap-1.5">
                                <Calculator className="h-3.5 w-3.5" /> Pago anticipado total
                              </span>
                              {showPagoAnticipado ? <ChevronUp className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--data-success-500)]" />}
                            </button>
                            {showPagoAnticipado && (
                              <div className="mt-2 pt-2 border-t border-[var(--data-success-500)]/30 space-y-1.5">
                                <div className="flex justify-between text-[length:var(--ts-xs)]">
                                  <span className="text-[var(--data-success-500)]">Capital pendiente:</span>
                                  <span className="font-bold font-mono text-[var(--text-primary)]">{formatCurrency(capitalPendiente)}</span>
                                </div>
                                <div className="flex justify-between text-[length:var(--ts-xs)]">
                                  <span className="text-[var(--data-success-500)]">Intereses pendientes:</span>
                                  <span className="font-mono text-[var(--data-error-500)]">{formatCurrency(interesPendiente)}</span>
                                </div>
                                <div className="flex justify-between text-[length:var(--ts-xs)]">
                                  <span className="text-[var(--data-success-500)]">Interés mes actual:</span>
                                  <span className="font-mono text-[var(--text-secondary)]">{formatCurrency(pendientes[0]?.interes || 0)}</span>
                                </div>
                                <div className="flex justify-between text-xs pt-1 border-t border-[var(--data-success-500)]/30">
                                  <span className="font-bold text-[var(--data-success-500)]">Liquidación hoy:</span>
                                  <span className="font-extrabold font-mono text-[var(--data-success-500)]">{formatCurrency(pagoAnticipado)}</span>
                                </div>
                                {ahorro > 0 && (
                                  <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] font-bold bg-[var(--accent-soft)] rounded-lg px-2 py-1 text-center">
                                    Ahorro de {formatCurrency(ahorro)} en intereses futuros
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Print buttons */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => {
                            const cuotas = selected.cuotas;
                            let saldo = selected.monto;
                            const totalPagar = cuotas.reduce((s, c) => s + c.monto, 0);
                            const w = window.open("", "_blank");
                            if (!w) return;
                            w.document.write(`<!DOCTYPE html><html><head><title>Cronograma de Préstamo</title>
<style>
  @media print { @page { margin: 1.5cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: Arial, sans-serif; color: #333; padding: 20px; }
  h1 { color: var(--accent); font-size: 16px; margin-bottom: 4px; text-align: center; }
  .sub { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 13px; }
  .info b { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: var(--accent); color: white; padding: 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) { background: #f9f9f9; }
  .paid { color: var(--accent); font-weight: bold; }
  .pending { color: #d97706; }
  .total-row { background: #f0fdf4 !important; font-weight: bold; }
  .right { text-align: right; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px; display: flex; justify-content: space-between; font-size: 12px; }
  .firma { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 4px; margin-top: 40px; }
</style></head><body>
<h1>CRONOGRAMA DE AMORTIZACIÓN</h1>
<p class="sub">${storeName}</p>
<div class="info">
  <div><b>Cliente:</b> ${selected.customerId || selected.entidadNombre || "—"}</div>
  <div><b>Monto:</b> ${selected.moneda === "USD" ? "$" : "S/"}${Number(selected.monto).toFixed(2)}</div>
  <div><b>Tasa:</b> ${selected.tasaInteres}% mensual${selected.tea ? ` (TEA ${selected.tea}%)` : ""}</div>
  <div><b>Sistema:</b> ${SISTEMA_LABELS[selected.sistemaAmortizacion]}</div>
  <div><b>N° Cuotas:</b> ${selected.numeroCuotas}</div>
  <div><b>Fecha:</b> ${formatDate(selected.createdAt)}</div>
  ${selected.entidadNombre ? `<div><b>Entidad:</b> ${selected.entidadNombre}</div>` : ""}
  <div><b>Estado:</b> ${selected.status}</div>
</div>
<table>
<thead><tr><th>#</th><th>Fecha vence</th><th class="right">Capital</th><th class="right">Interés</th><th class="right">Cuota</th><th class="right">Saldo</th><th>Estado</th><th>Pago</th></tr></thead>
<tbody>
${cuotas.map(c => { const row = `<tr>
  <td>${c.numeroCuota}</td>
  <td>${new Date(c.fechaVence).toLocaleDateString("es-PE")}</td>
  <td class="right">S/${Number(c.capital).toFixed(2)}</td>
  <td class="right">S/${Number(c.interes).toFixed(2)}</td>
  <td class="right"><b>S/${Number(c.monto).toFixed(2)}</b></td>
  <td class="right">S/${(saldo = Math.max(0, saldo - c.capital)).toFixed(2)}</td>
  <td class="${c.pagadoEn ? "paid" : "pending"}">${c.pagadoEn ? "Pagado" : "Pendiente"}</td>
  <td>${c.pagadoEn ? new Date(c.pagadoEn).toLocaleDateString("es-PE") : "—"}</td>
</tr>`; return row; }).join("")}
<tr class="total-row"><td colspan="2"><b>TOTAL</b></td><td class="right"><b>S/${cuotas.reduce((s,c)=>s+c.capital,0).toFixed(2)}</b></td><td class="right"><b>S/${cuotas.reduce((s,c)=>s+c.interes,0).toFixed(2)}</b></td><td class="right"><b>S/${totalPagar.toFixed(2)}</b></td><td colspan="3"></td></tr>
</tbody></table>
<div class="footer">
  <div class="firma">Firma del deudor</div>
  <div class="firma">Firma de la bodega</div>
</div>
</body></html>`);
                            w.document.close();
                            setTimeout(() => w.print(), 300);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" /> Cronograma
                        </button>
                        <button
                          onClick={() => {
                            const cuotas = selected.cuotas;
                            const pagadas = cuotas.filter(c => c.pagadoEn);
                            const pendientes = cuotas.filter(c => !c.pagadoEn);
                            const saldoPendiente = pendientes.reduce((s, c) => s + c.monto, 0);
                            const hoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
                            const w = window.open("", "_blank");
                            if (!w) return;
                            w.document.write(`<!DOCTYPE html><html><head><title>Resumen de Deuda</title>
<style>
  @media print { @page { margin: 1.5cm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: 'Courier New', monospace; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; }
  .header { text-align: center; border-top: 3px double var(--accent); border-bottom: 3px double var(--accent); padding: 12px 0; margin-bottom: 20px; }
  .header h1 { color: var(--accent); font-size: 16px; margin: 0; }
  .header p { color: #666; font-size: 11px; margin: 4px 0 0; }
  .section { border-top: 1px dashed #999; padding: 12px 0; font-size: 13px; }
  .row { display: flex; justify-content: space-between; margin: 4px 0; }
  .row b { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 10px 0; }
  th { background: #f0f0f0; padding: 6px; text-align: left; border: 1px solid #ddd; }
  td { padding: 5px 6px; border: 1px solid #eee; }
  .paid { color: var(--accent); }
  .pend { color: #d97706; }
  .right { text-align: right; }
  .firma-section { margin-top: 50px; }
  .firma-line { border-top: 1px solid #333; width: 250px; margin-top: 40px; padding-top: 4px; text-align: center; font-size: 11px; }
  .footer-text { text-align: center; font-size: 10px; color: #999; margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; }
</style></head><body>
<div class="header">
  <h1>RESUMEN DE DEUDA</h1>
  <p>${storeName} — ${storeLocation}</p>
</div>
<div class="section">
  <div class="row"><span>Cliente:</span><b>${selected.customerId || selected.entidadNombre || "—"}</b></div>
  <div class="row"><span>Fecha del documento:</span><b>${hoy}</b></div>
  ${selected.entidadNombre ? `<div class="row"><span>Entidad:</span><b>${selected.entidadNombre}</b></div>` : ""}
  ${selected.nroOperacion ? `<div class="row"><span>N° Operación:</span><b>${selected.nroOperacion}</b></div>` : ""}
</div>
<div class="section">
  <div class="row"><span>Monto prestado:</span><b>${selected.moneda === "USD" ? "$" : "S/"} ${Number(selected.monto).toFixed(2)}</b></div>
  <div class="row"><span>Tasa de interes:</span><b>${selected.tasaInteres}% mensual</b></div>
  ${selected.tea ? `<div class="row"><span>TEA:</span><b>${selected.tea}%</b></div>` : ""}
  <div class="row"><span>Amortización:</span><b>${SISTEMA_LABELS[selected.sistemaAmortizacion]}</b></div>
  <div class="row"><span>Número de cuotas:</span><b>${selected.numeroCuotas}</b></div>
  <div class="row"><span>Cuotas pagadas:</span><b>${pagadas.length}</b></div>
  <div class="row"><span>Cuotas pendientes:</span><b>${pendientes.length}</b></div>
  <div class="row" style="font-size:15px;margin-top:8px;"><span>Monto pendiente:</span><b style="color:#dc2626;">${selected.moneda === "USD" ? "$" : "S/"} ${saldoPendiente.toFixed(2)}</b></div>
</div>
<div class="section">
  <p style="font-weight:bold;margin-bottom:8px;">TABLA DE CUOTAS</p>
  <table>
  <thead><tr><th>#</th><th>Fecha vence</th><th class="right">Capital</th><th class="right">Interés</th><th class="right">Monto</th><th>Estado</th><th>Fecha pago</th></tr></thead>
  <tbody>
  ${cuotas.map(c => `<tr>
    <td>${c.numeroCuota}</td>
    <td>${new Date(c.fechaVence).toLocaleDateString("es-PE")}</td>
    <td class="right">S/ ${Number(c.capital).toFixed(2)}</td>
    <td class="right">S/ ${Number(c.interes).toFixed(2)}</td>
    <td class="right"><b>S/ ${Number(c.monto).toFixed(2)}</b></td>
    <td class="${c.pagadoEn ? "paid" : "pend"}">${c.pagadoEn ? "PAGADO" : "PEND."}</td>
    <td>${c.pagadoEn ? new Date(c.pagadoEn).toLocaleDateString("es-PE") : "—"}</td>
  </tr>`).join("")}
  </tbody></table>
</div>
<div class="firma-section">
  <div class="firma-line">Firma del deudor</div>
</div>
<p class="footer-text">${storeName} — ${storeLocation} — ${hoy}</p>
</body></html>`);
                            w.document.close();
                            setTimeout(() => w.print(), 300);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]/80 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" /> Resumen Deuda
                        </button>
                      </div>

                      {/* Acciones de pago — mejorado con multi-cuota */}
                      {selected.status === "ACTIVO" && (
                        <div className="mt-4 space-y-3">
                          <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Pagar cuotas</p>
                          {/* Selección múltiple de cuotas */}
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {selected.cuotas.filter(c => !c.pagadoEn).map(c => {
                              const isOverdue = new Date(c.fechaVence) < new Date();
                              const isSelected = selectedCuotaIds.has(c.id);
                              return (
                                <label
                                  key={c.id}
                                  className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
                                    isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] hover:border-gray-300",
                                    isOverdue && !isSelected && "border-[var(--data-error-500)] bg-[var(--data-error-50)]/50"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      const next = new Set(selectedCuotaIds);
                                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                      setSelectedCuotaIds(next);
                                    }}
                                    className="accent-blue-600 h-3.5 w-3.5"
                                  />
                                  <span className="flex-1 text-xs">
                                    <span className="font-bold text-[var(--text-primary)]">Cuota {c.numeroCuota}</span>
                                    <span className="text-[var(--text-secondary)] ml-1">— {new Date(c.fechaVence).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                                  </span>
                                  <span className="text-xs font-bold font-mono text-[var(--text-primary)]">{formatCurrency(c.monto)}</span>
                                  {isOverdue && <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] bg-[var(--data-error-100)] px-1 py-0.5 rounded">VENCIDA</span>}
                                </label>
                              );
                            })}
                          </div>
                          {/* Botones de pago */}
                          <div className="flex gap-2">
                            {selectedCuotaIds.size > 0 ? (
                              <button
                                onClick={handlePagoMultiple}
                                disabled={payingMultiple}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--data-success-500)] disabled:opacity-50  transition-colors"
                              >
                                {payingMultiple ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                                Pagar {selectedCuotaIds.size} cuota{selectedCuotaIds.size > 1 ? "s" : ""} ({formatCurrency(selected.cuotas.filter(c => selectedCuotaIds.has(c.id)).reduce((s, c) => s + c.monto, 0))})
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const next = selected.cuotas.find(c => !c.pagadoEn);
                                  if (next) { setPagoCuotaId(next.id); setPagoMonto(String(next.monto)); setPagoError(null); setShowPago(true); }
                                }}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--data-success-500)]  transition-colors"
                              >
                                <DollarSign className="h-4 w-4" /> Pagar siguiente cuota
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const all = new Set(selected.cuotas.filter(c => !c.pagadoEn).map(c => c.id));
                                setSelectedCuotaIds(selectedCuotaIds.size === all.size ? new Set() : all);
                              }}
                              className="px-3 py-2.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors"
                              title={selectedCuotaIds.size > 0 ? "Deseleccionar todas" : "Seleccionar todas"}
                            >
                              {selectedCuotaIds.size > 0 ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setRefMonto(String(selected.monto)); setRefTasa(String(selected.tasaInteres)); setRefCuotas(String(selected.numeroCuotas)); setRefSistema(selected.sistemaAmortizacion); setRefinanciarError(null); setShowRefinanciar(true); }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[var(--data-success-500)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30">
                              <RotateCcw className="h-3.5 w-3.5" /> Refinanciar
                            </button>
                            <button onClick={() => setShowCancelConfirm(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[var(--data-error-500)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] border border-[var(--data-error-500)]">
                              <Ban className="h-3.5 w-3.5" /> Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Mejora 17: Documentos adjuntos */}
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-[var(--data-success-500)]" /> Documentos
                          <span className="text-xs text-[var(--text-tertiary)] font-normal">({selected.documentos?.length ?? 0})</span>
                        </h4>
                        {selected.documentos && selected.documentos.length > 0 ? (
                          <div className="space-y-1.5">
                            {selected.documentos.map(doc => (
                              <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg border border-[var(--rule-soft)] hover:bg-gray-50 transition-colors">
                                <FileText className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
                                <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{doc.nombre}</span>
                                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">{formatDate(doc.createdAt)}</span>
                              </a>
                            ))}
                          </div>
                        ) : <p className="text-xs text-[var(--text-tertiary)] py-1">Sin documentos adjuntos</p>}
                        <label className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--rule-base)] cursor-pointer hover:bg-gray-50">
                          <input type="file" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0]; if (!file) return; setUploadingDoc(true);
                            try { const form = new FormData(); form.append("file", file); form.append("nombre", file.name); await fetch(`/api/prestamos/${selected.id}/documentos`, { method: "POST", body: form }); await openDetail(selected); } catch { /* silent */ } finally { setUploadingDoc(false); e.target.value = ""; }
                          }} />
                          {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" /> : <Plus className="h-3.5 w-3.5 text-[var(--data-info-500)]" />}
                          <span className="text-xs text-[var(--text-secondary)]">Subir documento</span>
                        </label>
                      </div>

                      {/* Mejora 26: Historial de pagos */}
                      {(() => {
                        const pagadas = selected.cuotas.filter(c => c.pagadoEn).sort((a, b) => new Date(b.pagadoEn!).getTime() - new Date(a.pagadoEn!).getTime());
                        if (pagadas.length === 0) return null;
                        return (
                          <div>
                            <h4 className="text-sm font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                              <History className="h-4 w-4 text-[var(--data-info-500)]" /> Historial de pagos ({pagadas.length})
                            </h4>
                            <div className="space-y-2 max-h-52 overflow-y-auto">
                              {pagadas.map(c => (
                                <div key={c.id} className="flex items-center justify-between py-2 px-3 bg-[var(--accent-soft)] rounded-xl">
                                  <div>
                                    <p className="text-xs font-bold text-[var(--text-primary)]">Cuota #{c.numeroCuota}</p>
                                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{formatDate(c.pagadoEn!)}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-[var(--data-success-500)]">{formatCurrency(c.montoPagado || c.monto)}</p>
                                    {c.montoPagado && c.montoPagado > c.monto && <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-500)]">+{formatCurrency(c.montoPagado - c.monto)} mora</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Refinanciar Modal (mejora 15) ──────────────────────────────────────── */}
      <AnimatePresence>
        {showRefinanciar && selected && (
          <>
            <m.div key="ref-bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 60 }} onClick={() => setShowRefinanciar(false)} />
            <m.div key="ref-modal" initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowRefinanciar(false)}>
              <div className="w-full max-w-sm bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2"><RotateCcw className="h-5 w-5 text-[var(--data-success-500)]" /> Refinanciar Préstamo</CardTitle>
                  <button onClick={() => setShowRefinanciar(false)}><X className="h-4 w-4 text-[var(--text-secondary)]" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Nuevo monto (S/)</label><input type="number" step="0.01" min="0.01" value={refMonto} onChange={e => setRefMonto(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40" /></div>
                  <div><label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Nueva tasa (%)</label><input type="number" step="0.1" min="0" value={refTasa} onChange={e => setRefTasa(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40" /></div>
                  <div><label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">N° cuotas</label><input type="number" min="1" value={refCuotas} onChange={e => setRefCuotas(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--data-success-500)]/40" /></div>
                  <div><label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Sistema</label><select value={refSistema} onChange={e => setRefSistema(e.target.value as SistemaAmortizacion)} className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none">{Object.entries(SISTEMA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                </div>
                {refinanciarError && <p className="text-xs text-[var(--data-error-500)] font-semibold">{refinanciarError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setShowRefinanciar(false)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200">Cancelar</button>
                  <button onClick={handleRefinanciar} disabled={refinancing} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] disabled:opacity-50">
                    {refinancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Refinanciar
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Cancelar Préstamo Confirm (mejora 23) ─────────────────────────────── */}
      <AnimatePresence>
        {showCancelConfirm && selected && (
          <>
            <m.div key="cancel-bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" style={{ zIndex: 60 }} onClick={() => setShowCancelConfirm(false)} />
            <m.div key="cancel-modal" initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setShowCancelConfirm(false)}>
              <div className="w-full max-w-sm bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-[var(--data-error-50)] rounded-xl border border-[var(--data-error-500)]">
                  <AlertCircle className="h-6 w-6 text-[var(--data-error-500)] shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--data-error-500)]">¿Cancelar este préstamo?</p>
                    <p className="text-xs text-[var(--data-error-500)] mt-0.5">Esta acción cambiará el estado a CANCELADO. Las cuotas pendientes no se cobrarán.</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--text-primary)]">Préstamo: <strong>{selected.entidadNombre || selected.customerId}</strong> — {formatCurrency(selected.monto)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200">Volver</button>
                  <button onClick={handleCancelPrestamo} disabled={canceling} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] disabled:opacity-50">
                    {canceling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Sí, cancelar
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Pago Modal ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPago && selected && (
          <>
            <m.div
              key="pago-prestamo-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop" style={{ zIndex: 60 }}
              onClick={() => setShowPago(false)}
            />
            <m.div
              key="pago-prestamo-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && setShowPago(false)}
            >
              <div className="w-full max-w-sm bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4">
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Pagar Cuota</CardTitle>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Monto del pago (S/)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pagoMonto}
                    onChange={e => setPagoMonto(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                </div>
                {pagoError && <p className="text-xs text-[var(--data-error-500)] font-semibold">{pagoError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setShowPago(false)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handlePago}
                    disabled={paying}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--data-success-500)] disabled:opacity-50  transition-colors"
                  >
                    {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                    Pagar
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Create Prestamo Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <>
            <m.div
              key="create-prestamo-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop"
              onClick={() => { setShowCreate(false); resetCreateForm(); }}
            />
            <m.div
              key="create-prestamo-modal"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
              onClick={e => e.target === e.currentTarget && (() => { setShowCreate(false); resetCreateForm(); })()}
            >
              <div className="w-full max-w-2xl bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 space-y-4 my-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Crear Préstamo</CardTitle>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)]">
                      Paso {createStep} de 2
                    </span>
                  </div>
                  <button onClick={() => { setShowCreate(false); resetCreateForm(); }} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Step indicator */}
                <div className="flex gap-2">
                  <div className={`flex-1 h-1 rounded-full transition-colors ${createStep >= 1 ? "bg-[var(--accent)]" : "bg-gray-200"}`} />
                  <div className={`flex-1 h-1 rounded-full transition-colors ${createStep >= 2 ? "bg-[var(--accent)]" : "bg-gray-200"}`} />
                </div>

                {/* ── STEP 1: Tipo, Dirección, Entidad ──────────── */}
                {createStep === 1 && (
                  <div className="space-y-6">
                    {/* Dirección: DADO / RECIBIDO */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">¿Prestas o te prestan?</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["DADO", "RECIBIDO"] as const).map(dir => {
                          const meta = DIRECCION_META[dir];
                          const Icon = meta.icon;
                          const active = createDireccion === dir;
                          return (
                            <button
                              key={dir}
                              onClick={() => setCreateDireccion(dir)}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-gray-300"}`}
                            >
                              <Icon className="h-4 w-4" />
                              {meta.label}
                              <span className="text-[length:var(--ts-2xs)] font-normal opacity-60">{dir === "DADO" ? "(tú prestas)" : "(te prestan)"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tipo de préstamo */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Tipo de préstamo</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["PERSONAL", "BANCARIO", "TERCERO", "PROVEEDOR"] as const).map(tipo => {
                          const meta = TIPO_META[tipo];
                          const Icon = meta.icon;
                          const active = createTipo === tipo;
                          return (
                            <button
                              key={tipo}
                              onClick={() => {
                                setCreateTipo(tipo);
                                if (tipo === "PERSONAL") { setCreateEntidadNombre(""); setCreateEntidadTipo(""); }
                                if (tipo === "BANCARIO") setCreateEntidadTipo("BANCO");
                                if (tipo === "PROVEEDOR") setCreateEntidadTipo("PROVEEDOR");
                              }}
                              className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-bold transition-all ${active ? `border-current bg-current/5` : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-gray-300"}`}
                              style={active ? { color: meta.color, borderColor: meta.color, backgroundColor: meta.color + "10" } : undefined}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bancos rápidos — solo si tipo BANCARIO */}
                    {createTipo === "BANCARIO" && (
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Seleccionar banco (tasa referencial)</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                          {BANK_PRESETS.map(preset => {
                            const active = createEntidadNombre === preset.nombre;
                            return (
                              <button
                                key={preset.nombre}
                                onClick={() => applyBankPreset(preset)}
                                className={`px-2 py-1.5 rounded-lg text-[length:var(--ts-xs)] font-bold transition-all border ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50"}`}
                              >
                                <span className="block">{preset.nombre}</span>
                                <span className="block text-[length:var(--ts-2xs)] opacity-60">TEA ~{preset.teaRef}%</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Entidad (para no-personal) */}
                    {createTipo !== "PERSONAL" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Nombre de entidad</label>
                          <input
                            type="text"
                            value={createEntidadNombre}
                            onChange={e => setCreateEntidadNombre(e.target.value)}
                            placeholder={createTipo === "BANCARIO" ? "Ej: BCP" : createTipo === "PROVEEDOR" ? "Ej: Distribuidora Lima" : "Ej: Juan Pérez"}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Tipo de entidad</label>
                          <select
                            value={createEntidadTipo}
                            onChange={e => setCreateEntidadTipo(e.target.value as PrestamoEntidadTipo)}
                            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                          >
                            <option value="">Seleccionar...</option>
                            {(Object.entries(ENTIDAD_LABELS) as [PrestamoEntidadTipo, string][]).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Cliente — solo si DADO */}
                    {createDireccion === "DADO" && (
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">¿A quién le prestas? (teléfono del cliente)</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={createCustomerId}
                            onChange={e => setCreateCustomerId(e.target.value)}
                            placeholder="Ej: 987654321"
                            className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                          />
                          <button
                            type="button"
                            onClick={() => setShowQuickClient(true)}
                            className="shrink-0 h-[38px] w-[38px] flex items-center justify-center rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] text-[var(--text-secondary)] transition-colors"
                            title="Crear cliente rápido"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Nro Operación */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">N° de operación (opcional)</label>
                      <input
                        type="text"
                        value={createNroOperacion}
                        onChange={e => setCreateNroOperacion(e.target.value)}
                        placeholder="Ej: OP-2025-001234"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                      />
                    </div>

                    {createError && <p className="text-xs text-[var(--data-error-500)] font-semibold">{createError}</p>}

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setShowCreate(false); resetCreateForm(); }} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors">
                        Cancelar
                      </button>
                      <button
                        onClick={() => { setCreateError(null); setCreateStep(2); }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--data-success-500)]  transition-colors"
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── STEP 2: Datos financieros ──────────── */}
                {createStep === 2 && (
                  <div className="space-y-6">
                    {/* Resumen de paso 1 */}
                    <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="font-bold">{DIRECCION_META[createDireccion].label}</span>
                        <span>·</span>
                        <span style={{ color: TIPO_META[createTipo].color }} className="font-bold">{TIPO_META[createTipo].label}</span>
                        {createEntidadNombre && <><span>·</span><span className="font-medium">{createEntidadNombre}</span></>}
                      </div>
                      <button onClick={() => setCreateStep(1)} className="text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:underline">Editar</button>
                    </div>

                    {/* Moneda + Monto */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Moneda</label>
                        <select
                          value={createMoneda}
                          onChange={e => setCreateMoneda(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        >
                          <option value="PEN">S/ Soles</option>
                          <option value="USD">$ Dólares</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Monto total</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={calcMonto}
                          onChange={e => setCalcMonto(e.target.value)}
                          placeholder="10000"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                    </div>

                    {/* Tasa mensual + TEA + Mora */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Tasa mensual %</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={calcTasa}
                          onChange={e => setCalcTasa(e.target.value)}
                          placeholder="1.5"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">TEA % <span className="font-normal opacity-60">(anual)</span></label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="999"
                          value={createTea}
                          onChange={e => setCreateTea(e.target.value)}
                          placeholder="19.56"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Mora % <span className="font-normal opacity-60">(penalidad)</span></label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={createMoraInteres}
                          onChange={e => setCreateMoraInteres(e.target.value)}
                          placeholder="15"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                    </div>

                    {/* Cuotas + Sistema + Periodo gracia */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">N° cuotas</label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={calcCuotas}
                          onChange={e => setCalcCuotas(e.target.value)}
                          placeholder="12"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Amortización</label>
                        <select
                          value={calcSistema}
                          onChange={e => setCalcSistema(e.target.value as SistemaAmortizacion)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        >
                          {(Object.entries(SISTEMA_LABELS) as [SistemaAmortizacion, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Gracia <span className="font-normal opacity-60">(meses)</span></label>
                        <input
                          type="number"
                          min="0"
                          max="24"
                          value={createPeriodoGracia}
                          onChange={e => setCreatePeriodoGracia(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                    </div>

                    {/* Fecha desembolso + Garantía */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Fecha de desembolso</label>
                        <input
                          type="date"
                          value={createFechaDesembolso}
                          onChange={e => setCreateFechaDesembolso(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Garantía <span className="font-normal opacity-60">(opcional)</span></label>
                        <input
                          type="text"
                          value={createGarantia}
                          onChange={e => setCreateGarantia(e.target.value)}
                          placeholder="Ej: Título de propiedad"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                    </div>

                    {/* Notas */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Notas (opcional)</label>
                      <input
                        type="text"
                        value={createNotas}
                        onChange={e => setCreateNotas(e.target.value)}
                        placeholder="Motivo del préstamo, condiciones especiales..."
                        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                      />
                    </div>

                    {createError && <p className="text-xs text-[var(--data-error-500)] font-semibold">{createError}</p>}

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setCreateStep(1)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors">
                        <ChevronLeft className="h-4 w-4 inline -mt-0.5" /> Atrás
                      </button>
                      <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[var(--accent-600,var(--accent))] hover:bg-[var(--data-success-500)] disabled:opacity-50  transition-colors"
                      >
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Crear Préstamo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick client creation modal */}
      <ClienteFormModal
        isOpen={showQuickClient}
        onClose={() => setShowQuickClient(false)}
        onSaved={() => setShowQuickClient(false)}
        initialFormat="simple"
      />
    </div>
  );
}
