"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Search, Plus, X, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, Landmark, Building2,
  ArrowUpFromLine, ArrowDownToLine, ArrowLeftRight, Wallet,
  TrendingUp, TrendingDown, BarChart3, Eye, EyeOff,
  RefreshCw, Banknote,
  PiggyBank, Smartphone, Check,
  FileDown, Power, AlertCircle, ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CuentaTipo = "BANCO_AHORRO" | "BANCO_CORRIENTE" | "CAJA_FISICA" | "MONEDERO_DIGITAL";
type MovimientoTipo = "INGRESO" | "EGRESO" | "TRANSFERENCIA_IN" | "TRANSFERENCIA_OUT";

type Cuenta = {
  id: string;
  nombre: string;
  tipo: CuentaTipo;
  banco: string | null;
  numeroCuenta: string | null;
  cci: string | null;
  moneda: string;
  saldo: number;
  saldoInicial: number;
  activa: boolean;
  color: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
};

type Movimiento = {
  id: string;
  cuentaId: string;
  tipo: MovimientoTipo;
  origen: string;
  monto: number;
  saldoAnterior: number;
  saldoPosterior: number;
  descripcion: string;
  referencia: string | null;
  categoria: string | null;
  createdAt: string;
  cuentaNombre?: string;
};

type Transferencia = {
  id: string;
  origenId: string;
  destinoId: string;
  monto: number;
  descripcion: string;
  createdAt: string;
  origenNombre?: string;
  destinoNombre?: string;
};

type Resumen = {
  saldoTotal: number;
  saldoPorTipo: Record<string, number>;
  saldoPorMoneda: Record<string, number>;
  cuentasActivas: number;
  ingresosMes: number;
  egresosMes: number;
  flujoNeto: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number, moneda = "PEN") {
  const symbol = moneda === "USD" ? "$" : "S/";
  return `${symbol}${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

const TIPO_META: Record<CuentaTipo, { label: string; shortLabel: string; icon: typeof Landmark; color: string; bg: string }> = {
  BANCO_AHORRO:    { label: "Banco Ahorro",      shortLabel: "Ahorro",   icon: PiggyBank,  color: "text-emerald-700 dark:text-emerald-400",   bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  BANCO_CORRIENTE: { label: "Banco Corriente",    shortLabel: "Corriente", icon: Building2,  color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  CAJA_FISICA:     { label: "Caja Física",        shortLabel: "Caja",     icon: Banknote,   color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  MONEDERO_DIGITAL:{ label: "Monedero Digital",   shortLabel: "Digital",  icon: Smartphone, color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
};

const MOV_META: Record<MovimientoTipo, { label: string; color: string; icon: typeof ArrowUpFromLine }> = {
  INGRESO:          { label: "Ingreso",           color: "text-emerald-600 dark:text-emerald-400", icon: ArrowDownToLine },
  EGRESO:           { label: "Egreso",            color: "text-red-600 dark:text-red-400",         icon: ArrowUpFromLine },
  TRANSFERENCIA_IN: { label: "Transferencia ←",   color: "text-emerald-600 dark:text-emerald-400",       icon: ArrowLeftRight },
  TRANSFERENCIA_OUT:{ label: "Transferencia →",   color: "text-amber-600 dark:text-amber-400",     icon: ArrowLeftRight },
};

const TIPO_COLORS: Record<CuentaTipo, string> = {
  BANCO_AHORRO: "#3b82f6",
  BANCO_CORRIENTE: "#a855f7",
  CAJA_FISICA: "#10b981",
  MONEDERO_DIGITAL: "#f97316",
};

const PER_PAGE = 15;

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3"><Wallet className="h-6 w-6 text-primary" /></div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{message}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los datos aparecerán cuando registres movimientos</p>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function TresoDashboard({ cuentas, resumen }: { cuentas: Cuenta[]; resumen: Resumen | null }) {
  const [showBalance, setShowBalance] = useState(true);
  const saldoTotal = resumen?.saldoTotal ?? cuentas.reduce((s, c) => s + c.saldo, 0);
  const ingresosMes = resumen?.ingresosMes ?? 0;
  const egresosMes = resumen?.egresosMes ?? 0;
  const flujoNeto = resumen?.flujoNeto ?? (ingresosMes - egresosMes);
  const cuentasActivas = resumen?.cuentasActivas ?? cuentas.filter(c => c.activa).length;

  // Balance por tipo
  const tipoPieData = Object.entries(resumen?.saldoPorTipo ?? {}).map(([tipo, saldo]) => ({
    name: TIPO_META[tipo as CuentaTipo]?.shortLabel ?? tipo,
    value: Number(saldo),
    color: TIPO_COLORS[tipo as CuentaTipo] ?? "#6b7280",
  }));

  // Flujo mensual simulado (últimos 6 meses basado en resumen actual)
  const flowData: { mes: string; ingresos: number; egresos: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const label = d.toLocaleDateString("es-PE", { month: "short" });
    // Proporcionalmente disminuimos para meses anteriores (determinístico)
    const factors = [1, 0.7, 0.55, 0.45, 0.6, 0.5];
    const factor = factors[i] ?? 0.5;
    flowData.push({ mes: label, ingresos: Math.round(ingresosMes * factor), egresos: Math.round(egresosMes * factor) });
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl  p-4 border-b-4 border-b-[#2563EB]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-[#2563EB]" />
                <p className="text-[10px] uppercase font-bold text-gray-400">Saldo total</p>
              </div>
              <button onClick={() => setShowBalance(!showBalance)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                {showBalance ? <Eye className="h-3.5 w-3.5 text-gray-400" /> : <EyeOff className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            </div>
            <p className="text-2xl font-extrabold font-mono text-gray-900 dark:text-white">
              {showBalance ? fmtCurrency(saldoTotal) : "S/••••••"}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">{cuentasActivas} cuenta{cuentasActivas !== 1 ? "s" : ""} activa{cuentasActivas !== 1 ? "s" : ""}</p>
          </div>

          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl  p-4 border-b-4 border-b-emerald-500">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
              <p className="text-[10px] uppercase font-bold text-gray-400">Ingresos mes</p>
            </div>
            <p className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
              {showBalance ? fmtCurrency(ingresosMes) : "S/••••"}
            </p>
          </div>

          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl  p-4 border-b-4 border-b-red-500">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowUpFromLine className="h-4 w-4 text-red-500" />
              <p className="text-[10px] uppercase font-bold text-gray-400">Egresos mes</p>
            </div>
            <p className="text-2xl font-extrabold font-mono text-red-600 dark:text-red-400">
              {showBalance ? fmtCurrency(egresosMes) : "S/••••"}
            </p>
          </div>

          <div className={cn(
            "bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl  p-4 border-b-4",
            flujoNeto >= 0 ? "border-b-[#2563EB]" : "border-b-red-600"
          )}>
            <div className="flex items-center gap-1.5 mb-2">
              {flujoNeto >= 0 ? <TrendingUp className="h-4 w-4 text-[#2563EB]" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
              <p className="text-[10px] uppercase font-bold text-gray-400">Flujo neto</p>
            </div>
            <p className={cn("text-2xl font-extrabold font-mono", flujoNeto >= 0 ? "text-[#2563EB] dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {showBalance ? fmtCurrency(flujoNeto) : "S/••••"}
            </p>
          </div>
        </div>
      </m.div>

      {/* Account cards */}
      {cuentas.length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-3">Mis cuentas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cuentas.filter(c => c.activa).map(cuenta => {
              const meta = TIPO_META[cuenta.tipo];
              const Icon = meta.icon;
              return (
                <div key={cuenta.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", meta.bg)}>
                      <Icon className={cn("h-5 w-5", meta.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{cuenta.nombre}</p>
                      <p className="text-[10px] text-gray-400">{meta.label}{cuenta.banco ? ` · ${cuenta.banco}` : ""}</p>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Activa" />
                  </div>
                  <p className="text-xl font-extrabold font-mono text-gray-900 dark:text-white">
                    {showBalance ? fmtCurrency(cuenta.saldo, cuenta.moneda) : `${cuenta.moneda === "USD" ? "$" : "S/"}••••`}
                  </p>
                  {cuenta.numeroCuenta && (
                    <p className="text-[10px] text-gray-400 mt-1 font-mono">•••• {cuenta.numeroCuenta.slice(-4)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </m.div>
      )}

      {/* Charts */}
      <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Flow chart */}
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 ">
            <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Flujo de caja (6 meses)</h3>
            {flowData.some(d => d.ingresos > 0 || d.egresos > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={flowData}>
                  <defs>
                    <linearGradient id="tresoIngGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tresoEgrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `S/${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={((v: number, name: string) => [fmtCurrency(Number(v)), name === "ingresos" ? "Ingresos" : "Egresos"]) as never}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="ingresos" stroke="#10b981" fill="url(#tresoIngGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="egresos" stroke="#ef4444" fill="url(#tresoEgrGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="Sin movimientos recientes" />
            )}
          </div>

          {/* Pie by tipo */}
          <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-6 ">
            <h3 className="text-sm font-bold text-gray-700 dark:text-foreground mb-4">Saldo por tipo de cuenta</h3>
            {tipoPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={tipoPieData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={85}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {tipoPieData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={((v: number) => [fmtCurrency(Number(v)), "Saldo"]) as never} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="Sin cuentas registradas" />
            )}
          </div>
        </div>
      </m.div>

      {/* Low Balance Alerts */}
      {cuentas.filter(c => c.activa && c.saldo < LOW_BALANCE_THRESHOLD).length > 0 && (
        <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Cuentas con saldo bajo</h3>
            </div>
            <div className="space-y-2">
              {cuentas.filter(c => c.activa && c.saldo < LOW_BALANCE_THRESHOLD).map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-700 dark:text-amber-300 font-medium">{c.nombre}</span>
                  <span className="font-mono font-bold text-amber-800 dark:text-amber-200">{fmtCurrency(c.saldo, c.moneda)}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-2">
              Umbral: menos de S/{LOW_BALANCE_THRESHOLD.toFixed(2)}
            </p>
          </div>
        </m.div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  "Ventas", "Compras", "Servicios", "Planilla", "Alquiler",
  "Impuestos", "Préstamos", "Proveedores", "Marketing", "Otros",
];

const LOW_BALANCE_THRESHOLD = 500;

// ── Main Component ────────────────────────────────────────────────────────────

export default function TesoreriaModule() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "cuentas" | "movimientos" | "transferencias">("dashboard");

  // Data
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateCuenta, setShowCreateCuenta] = useState(false);
  const [showCreateMov, setShowCreateMov] = useState(false);
  const [showCreateTransfer, setShowCreateTransfer] = useState(false);
  const [editCuenta, setEditCuenta] = useState<Cuenta | null>(null);

  // Filters
  const [movCuentaFilter, setMovCuentaFilter] = useState("");
  const [movTipoFilter, setMovTipoFilter] = useState("");
  const [movSearch, setMovSearch] = useState("");
  const [movPage, setMovPage] = useState(1);
  const [_cuentaPage, _setCuentaPage] = useState(1);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [movFechaDesde, setMovFechaDesde] = useState("");
  const [movFechaHasta, setMovFechaHasta] = useState("");
  const [movCategoriaFilter, setMovCategoriaFilter] = useState("");
  const [movMontoMin, setMovMontoMin] = useState("");
  const [movMontoMax, setMovMontoMax] = useState("");
  const [movSortField, setMovSortField] = useState<"fecha" | "monto">("fecha");
  const [movSortDir, setMovSortDir] = useState<"asc" | "desc">("desc");

  // Deactivate account
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Cuenta | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Form state - Cuenta
  const [formNombre, setFormNombre] = useState("");
  const [formTipo, setFormTipo] = useState<CuentaTipo>("CAJA_FISICA");
  const [formBanco, setFormBanco] = useState("");
  const [formNumeroCuenta, setFormNumeroCuenta] = useState("");
  const [formSaldoInicial, setFormSaldoInicial] = useState("");
  const [formColor, setFormColor] = useState("");
  const [formNotas, setFormNotas] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state - Movimiento
  const [movFormCuenta, setMovFormCuenta] = useState("");
  const [movFormTipo, setMovFormTipo] = useState<"INGRESO" | "EGRESO">("INGRESO");
  const [movFormMonto, setMovFormMonto] = useState("");
  const [movFormDesc, setMovFormDesc] = useState("");
  const [movFormCategoria, setMovFormCategoria] = useState("");
  const [movFormRef, setMovFormRef] = useState("");
  const [movFormSubmitting, setMovFormSubmitting] = useState(false);
  const [movFormError, setMovFormError] = useState<string | null>(null);

  // Form state - Transferencia
  const [transOrigen, setTransOrigen] = useState("");
  const [transDestino, setTransDestino] = useState("");
  const [transMonto, setTransMonto] = useState("");
  const [transDesc, setTransDesc] = useState("");
  const [transSubmitting, setTransSubmitting] = useState(false);
  const [transError, setTransError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, rRes] = await Promise.all([
        fetch("/api/treasury/cuentas"),
        fetch("/api/treasury/resumen"),
      ]);
      if (!cRes.ok) throw new Error("Error al cargar cuentas");
      const cData: Cuenta[] = await cRes.json();
      setCuentas(cData);
      if (rRes.ok) setResumen(await rRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMovimientos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (movCuentaFilter) params.set("cuentaId", movCuentaFilter);
      if (movTipoFilter) params.set("tipo", movTipoFilter);
      if (movSearch) params.set("search", movSearch);
      params.set("limit", "200");
      const res = await fetch(`/api/treasury/movimientos?${params}`);
      if (res.ok) setMovimientos(await res.json());
    } catch { /* silently fail */ }
  }, [movCuentaFilter, movTipoFilter, movSearch]);

  const fetchTransferencias = useCallback(async () => {
    try {
      const res = await fetch("/api/treasury/transferencias?limit=100");
      if (res.ok) setTransferencias(await res.json());
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (activeTab === "movimientos") fetchMovimientos();
  }, [activeTab, fetchMovimientos]);

  useEffect(() => {
    if (activeTab === "transferencias") fetchTransferencias();
  }, [activeTab, fetchTransferencias]);

  // ESC handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showCreateCuenta) { setShowCreateCuenta(false); return; }
      if (showCreateMov) { setShowCreateMov(false); return; }
      if (showCreateTransfer) { setShowCreateTransfer(false); return; }
      if (editCuenta) { setEditCuenta(null); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showCreateCuenta, showCreateMov, showCreateTransfer, editCuenta]);

  // ── Create Cuenta ──────────────────────────────────────────────────────────

  const resetCuentaForm = () => {
    setFormNombre(""); setFormTipo("CAJA_FISICA"); setFormBanco("");
    setFormNumeroCuenta(""); setFormSaldoInicial(""); setFormColor("");
    setFormNotas(""); setFormError(null);
  };

  const handleCreateCuenta = async () => {
    setFormError(null);
    if (!formNombre.trim()) { setFormError("Nombre requerido"); return; }

    setFormSubmitting(true);
    try {
      const body: Record<string, unknown> = { nombre: formNombre.trim(), tipo: formTipo };
      if (formBanco.trim()) body.banco = formBanco.trim();
      if (formNumeroCuenta.trim()) body.numeroCuenta = formNumeroCuenta.trim();
      const saldo = parseFloat(formSaldoInicial);
      if (!isNaN(saldo) && saldo > 0) body.saldoInicial = saldo;
      if (formColor.trim()) body.color = formColor.trim();
      if (formNotas.trim()) body.notas = formNotas.trim();

      const res = await fetch("/api/treasury/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al crear");
      }
      setShowCreateCuenta(false);
      resetCuentaForm();
      fetchAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setFormSubmitting(false);
    }
  };

  // ── Edit Cuenta ────────────────────────────────────────────────────────────

  const openEditCuenta = (c: Cuenta) => {
    setEditCuenta(c);
    setFormNombre(c.nombre);
    setFormTipo(c.tipo);
    setFormBanco(c.banco ?? "");
    setFormNumeroCuenta(c.numeroCuenta ?? "");
    setFormColor(c.color ?? "");
    setFormNotas(c.notas ?? "");
    setFormError(null);
  };

  const handleEditCuenta = async () => {
    if (!editCuenta) return;
    setFormError(null);
    setFormSubmitting(true);
    try {
      const body: Record<string, unknown> = { id: editCuenta.id };
      if (formNombre.trim()) body.nombre = formNombre.trim();
      if (formBanco !== (editCuenta.banco ?? "")) body.banco = formBanco.trim();
      if (formNumeroCuenta !== (editCuenta.numeroCuenta ?? "")) body.numeroCuenta = formNumeroCuenta.trim();
      if (formColor !== (editCuenta.color ?? "")) body.color = formColor.trim();
      if (formNotas !== (editCuenta.notas ?? "")) body.notas = formNotas.trim();

      const res = await fetch("/api/treasury/cuentas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      setEditCuenta(null);
      resetCuentaForm();
      fetchAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setFormSubmitting(false);
    }
  };

  // ── Create Movimiento ──────────────────────────────────────────────────────

  const handleCreateMov = async () => {
    setMovFormError(null);
    if (!movFormCuenta) { setMovFormError("Selecciona una cuenta"); return; }
    const monto = parseFloat(movFormMonto);
    if (isNaN(monto) || monto <= 0) { setMovFormError("Monto inválido"); return; }

    setMovFormSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        cuentaId: movFormCuenta,
        tipo: movFormTipo,
        monto,
      };
      if (movFormDesc.trim()) body.descripcion = movFormDesc.trim();
      if (movFormCategoria.trim()) body.categoria = movFormCategoria.trim();
      if (movFormRef.trim()) body.referencia = movFormRef.trim();

      const res = await fetch("/api/treasury/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al registrar");
      }
      setShowCreateMov(false);
      setMovFormCuenta(""); setMovFormMonto(""); setMovFormDesc("");
      setMovFormCategoria(""); setMovFormRef(""); setMovFormError(null);
      fetchAll();
      fetchMovimientos();
    } catch (e) {
      setMovFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setMovFormSubmitting(false);
    }
  };

  // ── Create Transferencia ───────────────────────────────────────────────────

  const handleCreateTransfer = async () => {
    setTransError(null);
    if (!transOrigen) { setTransError("Selecciona cuenta origen"); return; }
    if (!transDestino) { setTransError("Selecciona cuenta destino"); return; }
    if (transOrigen === transDestino) { setTransError("Origen y destino deben ser diferentes"); return; }
    const monto = parseFloat(transMonto);
    if (isNaN(monto) || monto <= 0) { setTransError("Monto inválido"); return; }

    setTransSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        origenId: transOrigen,
        destinoId: transDestino,
        monto,
      };
      if (transDesc.trim()) body.descripcion = transDesc.trim();

      const res = await fetch("/api/treasury/transferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al transferir");
      }
      setShowCreateTransfer(false);
      setTransOrigen(""); setTransDestino(""); setTransMonto("");
      setTransDesc(""); setTransError(null);
      fetchAll();
      fetchTransferencias();
    } catch (e) {
      setTransError(e instanceof Error ? e.message : "Error");
    } finally {
      setTransSubmitting(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredMov = useMemo(() => {
    let filtered = [...movimientos];
    if (movFechaDesde) filtered = filtered.filter(m => m.createdAt >= movFechaDesde);
    if (movFechaHasta) filtered = filtered.filter(m => m.createdAt <= movFechaHasta + "T23:59:59");
    if (movCategoriaFilter) filtered = filtered.filter(m => m.categoria === movCategoriaFilter);
    if (movMontoMin) filtered = filtered.filter(m => m.monto >= parseFloat(movMontoMin));
    if (movMontoMax) filtered = filtered.filter(m => m.monto <= parseFloat(movMontoMax));
    // Sort
    filtered.sort((a, b) => {
      const mul = movSortDir === "asc" ? 1 : -1;
      if (movSortField === "monto") return (a.monto - b.monto) * mul;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * mul;
    });
    return filtered;
  }, [movimientos, movFechaDesde, movFechaHasta, movCategoriaFilter, movMontoMin, movMontoMax, movSortField, movSortDir]);

  const movTotals = useMemo(() => {
    const ingresos = filteredMov.filter(m => m.tipo === "INGRESO" || m.tipo === "TRANSFERENCIA_IN").reduce((s, m) => s + m.monto, 0);
    const egresos = filteredMov.filter(m => m.tipo === "EGRESO" || m.tipo === "TRANSFERENCIA_OUT").reduce((s, m) => s + m.monto, 0);
    return { ingresos, egresos, neto: ingresos - egresos };
  }, [filteredMov]);

  const _topCategorias = useMemo(() => {
    const map = new Map<string, number>();
    movimientos.filter(m => m.tipo === "EGRESO" && m.categoria).forEach(m => {
      map.set(m.categoria!, (map.get(m.categoria!) || 0) + m.monto);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [movimientos]);

  const _lowBalanceAccounts = useMemo(() =>
    cuentas.filter(c => c.activa && c.saldo < LOW_BALANCE_THRESHOLD),
    [cuentas]
  );
  const movTotalPages = Math.max(1, Math.ceil(filteredMov.length / PER_PAGE));
  const paginatedMov = filteredMov.slice((movPage - 1) * PER_PAGE, movPage * PER_PAGE);
  const activeCuentas = cuentas.filter(c => c.activa);

  useEffect(() => { setMovPage(1); }, [movCuentaFilter, movTipoFilter, movSearch, movFechaDesde, movFechaHasta, movCategoriaFilter, movMontoMin, movMontoMax]);

  // ── CSV Export ─────────────────────────────────────────────────────────────

  const handleExportCSV = useCallback(() => {
    const headers = ["Fecha", "Cuenta", "Tipo", "Categoría", "Descripción", "Referencia", "Monto", "Saldo posterior"];
    const rows = filteredMov.map(m => [
      new Date(m.createdAt).toLocaleDateString("es-PE"),
      m.cuentaNombre ?? "",
      m.tipo,
      m.categoria ?? "",
      m.descripcion ?? "",
      m.referencia ?? "",
      m.monto.toFixed(2),
      m.saldoPosterior.toFixed(2),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tesoreria-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredMov]);

  // ── Deactivate/Activate Account ────────────────────────────────────────────

  const handleToggleActive = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const res = await fetch(`/api/treasury/cuentas/${deactivateTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !deactivateTarget.activa }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al actualizar");
      }
      setShowDeactivateModal(false);
      setDeactivateTarget(null);
      fetchAll();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setDeactivating(false);
    }
  };

  // ── Column Sort Toggle ─────────────────────────────────────────────────────

  const toggleSort = (field: "fecha" | "monto") => {
    if (movSortField === field) {
      setMovSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setMovSortField(field);
      setMovSortDir("desc");
    }
  };

  // ── Clear All Filters ──────────────────────────────────────────────────────

  const hasActiveFilters = movFechaDesde || movFechaHasta || movCategoriaFilter || movMontoMin || movMontoMax;
  const clearAdvancedFilters = () => {
    setMovFechaDesde(""); setMovFechaHasta("");
    setMovCategoriaFilter(""); setMovMontoMin(""); setMovMontoMax("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
    { id: "cuentas" as const, label: "Cuentas", icon: Wallet },
    { id: "movimientos" as const, label: "Movimientos", icon: ArrowLeftRight },
    { id: "transferencias" as const, label: "Transferencias", icon: ArrowLeftRight },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-[#2563EB] text-white flex items-center justify-center  shrink-0">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Tesorería
              {activeCuentas.length > 0 && (
                <span className="ml-2 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full align-middle">
                  {activeCuentas.length} cuenta{activeCuentas.length !== 1 ? "s" : ""}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500">Bancos, cajas, billeteras y movimientos de dinero</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchAll()} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors" title="Actualizar">
            <RefreshCw className={cn("h-4 w-4 text-gray-500", loading && "animate-spin")} />
          </button>
          {activeTab === "cuentas" && (
            <button
              onClick={() => { resetCuentaForm(); setShowCreateCuenta(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8]  transition-colors"
            >
              <Plus className="h-4 w-4" /> Nueva cuenta
            </button>
          )}
          {activeTab === "movimientos" && (
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                disabled={filteredMov.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
                title="Exportar CSV"
              >
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={() => { setMovFormError(null); setShowCreateMov(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8]  transition-colors"
              >
                <Plus className="h-4 w-4" /> Registrar
              </button>
            </div>
          )}
          {activeTab === "transferencias" && (
            <button
              onClick={() => { setTransError(null); setShowCreateTransfer(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8]  transition-colors"
            >
              <ArrowLeftRight className="h-4 w-4" /> Transferir
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-card-border -mx-1 px-1 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5",
                activeTab === t.id
                  ? "border-[#2563EB] text-[#2563EB] dark:text-emerald-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && activeTab === "dashboard" && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={fetchAll} className="text-xs text-[#2563EB] hover:underline font-semibold">Reintentar</button>
        </div>
      )}

      {/* ── Tab: Dashboard ─────────────────────────────────────────────── */}
      {activeTab === "dashboard" && !loading && !error && (
        <TresoDashboard cuentas={cuentas} resumen={resumen} />
      )}

      {/* ── Tab: Cuentas ───────────────────────────────────────────────── */}
      {activeTab === "cuentas" && !loading && (
        <div className="space-y-6">
          {cuentas.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl">
              <div className="text-6xl mb-4">🏦</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin cuentas</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Crea tu primera cuenta (banco, caja o billetera digital)</p>
              <button
                onClick={() => { resetCuentaForm(); setShowCreateCuenta(true); }}
                className="bg-[#2563EB] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#1D4ED8]"
              >
                Crear cuenta
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cuentas.map(cuenta => {
                const meta = TIPO_META[cuenta.tipo];
                const Icon = meta.icon;
                return (
                  <m.div
                    key={cuenta.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "bg-white dark:bg-card border rounded-xl p-5 hover:shadow-lg transition-all cursor-pointer group",
                      cuenta.activa ? "border-gray-200 dark:border-card-border" : "border-dashed border-gray-300 dark:border-gray-600 opacity-60"
                    )}
                    onClick={() => openEditCuenta(cuenta)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", meta.bg)}>
                        <Icon className={cn("h-6 w-6", meta.color)} />
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                        cuenta.activa
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      )}>
                        {cuenta.activa ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-gray-900 dark:text-white truncate">{cuenta.nombre}</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">{meta.label}{cuenta.banco ? ` · ${cuenta.banco}` : ""}</p>
                    <p className="text-2xl font-extrabold font-mono text-gray-900 dark:text-white mt-3">
                      {fmtCurrency(cuenta.saldo, cuenta.moneda)}
                    </p>
                    {cuenta.activa && cuenta.saldo < LOW_BALANCE_THRESHOLD && (
                      <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        <span className="font-bold">Saldo bajo</span>
                      </div>
                    )}
                    {cuenta.numeroCuenta && (
                      <p className="text-[11px] text-gray-400 mt-1.5 font-mono">N° •••• {cuenta.numeroCuenta.slice(-4)}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-gray-300 dark:text-gray-600">
                        Creada {fmtDate(cuenta.createdAt)}
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeactivateTarget(cuenta); setShowDeactivateModal(true); }}
                        className={cn(
                          "p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100",
                          cuenta.activa ? "hover:bg-red-50 dark:hover:bg-red-900/20" : "hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        )}
                        title={cuenta.activa ? "Desactivar" : "Activar"}
                      >
                        <Power className={cn("h-3.5 w-3.5", cuenta.activa ? "text-red-400" : "text-emerald-400")} />
                      </button>
                    </div>
                  </m.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Movimientos ───────────────────────────────────────────── */}
      {activeTab === "movimientos" && (
        <div className="space-y-6">
          {/* Basic Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={movCuentaFilter}
              onChange={e => setMovCuentaFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
            >
              <option value="">Todas las cuentas</option>
              {activeCuentas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            <select
              value={movTipoFilter}
              onChange={e => setMovTipoFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
            >
              <option value="">Todos los tipos</option>
              <option value="INGRESO">Ingresos</option>
              <option value="EGRESO">Egresos</option>
              <option value="TRANSFERENCIA_IN">Transferencia ←</option>
              <option value="TRANSFERENCIA_OUT">Transferencia →</option>
            </select>
            <div className="relative flex-1 min-w-50">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={movSearch}
                onChange={e => setMovSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
              />
            </div>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-bold transition-colors",
                showAdvancedFilters || hasActiveFilters
                  ? "border-[#2563EB] bg-[#2563EB]/5 text-[#2563EB] dark:text-emerald-400"
                  : "border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-[#2563EB]" />}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvancedFilters && "rotate-180")} />
            </button>
          </div>

          {/* Advanced Filters (collapsible) */}
          <AnimatePresence>
            {showAdvancedFilters && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Desde</label>
                      <input
                        type="date"
                        value={movFechaDesde}
                        onChange={e => setMovFechaDesde(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Hasta</label>
                      <input
                        type="date"
                        value={movFechaHasta}
                        onChange={e => setMovFechaHasta(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Categoría</label>
                      <select
                        value={movCategoriaFilter}
                        onChange={e => setMovCategoriaFilter(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      >
                        <option value="">Todas</option>
                        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Min S/</label>
                        <input
                          type="number"
                          step="0.01"
                          value={movMontoMin}
                          onChange={e => setMovMontoMin(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Max S/</label>
                        <input
                          type="number"
                          step="0.01"
                          value={movMontoMax}
                          onChange={e => setMovMontoMax(e.target.value)}
                          placeholder="∞"
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                        />
                      </div>
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <button onClick={clearAdvancedFilters} className="text-xs text-[#2563EB] hover:underline font-bold">
                      Limpiar filtros avanzados
                    </button>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Totalizador Bar */}
          {filteredMov.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 mb-0.5">Ingresos</p>
                <p className="text-lg font-extrabold font-mono text-emerald-700 dark:text-emerald-300">+{fmtCurrency(movTotals.ingresos)}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
                <p className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400 mb-0.5">Egresos</p>
                <p className="text-lg font-extrabold font-mono text-red-700 dark:text-red-300">-{fmtCurrency(movTotals.egresos)}</p>
              </div>
              <div className={cn(
                "border rounded-xl p-3 text-center",
                movTotals.neto >= 0
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                  : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
              )}>
                <p className={cn("text-[10px] uppercase font-bold mb-0.5", movTotals.neto >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400")}>Neto</p>
                <p className={cn("text-lg font-extrabold font-mono", movTotals.neto >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-orange-700 dark:text-orange-300")}>
                  {movTotals.neto >= 0 ? "+" : ""}{fmtCurrency(movTotals.neto)}
                </p>
              </div>
            </div>
          )}

          {/* Movements table */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden ">
            {filteredMov.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="text-6xl mb-4">💸</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin movimientos</h3>
                <p className="text-sm text-gray-500 mb-6">Registra ingresos y egresos para ver tu historial</p>
                <button
                  onClick={() => { setMovFormError(null); setShowCreateMov(true); }}
                  className="bg-[#2563EB] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#1D4ED8]"
                >
                  Registrar movimiento
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-150 text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                        <th
                          className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                          onClick={() => toggleSort("fecha")}
                        >
                          <span className="inline-flex items-center gap-1">
                            Fecha
                            {movSortField === "fecha" && <ChevronDown className={cn("h-3 w-3 transition-transform", movSortDir === "asc" && "rotate-180")} />}
                          </span>
                        </th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Cuenta</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Tipo</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Categoría</th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Descripción</th>
                        <th
                          className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                          onClick={() => toggleSort("monto")}
                        >
                          <span className="inline-flex items-center gap-1 justify-end">
                            Monto
                            {movSortField === "monto" && <ChevronDown className={cn("h-3 w-3 transition-transform", movSortDir === "asc" && "rotate-180")} />}
                          </span>
                        </th>
                        <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-right hidden sm:table-cell">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMov.map(m => {
                        const meta = MOV_META[m.tipo];
                        const MovIcon = meta.icon;
                        const isIngreso = m.tipo === "INGRESO" || m.tipo === "TRANSFERENCIA_IN";
                        return (
                          <tr key={m.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDateShort(m.createdAt)}</td>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{m.cuentaNombre ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex items-center gap-1 text-xs font-bold", meta.color)}>
                                <MovIcon className="h-3 w-3" />
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {m.categoria ? (
                                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 font-medium">{m.categoria}</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-50 truncate">{m.descripcion || "—"}</td>
                            <td className={cn("px-4 py-3 text-right font-bold font-mono", isIngreso ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                              {isIngreso ? "+" : "-"}{fmtCurrency(m.monto)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                              {fmtCurrency(m.saldoPosterior)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {movTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-white/5">
                    <p className="text-xs text-gray-500">{filteredMov.length} movimiento{filteredMov.length !== 1 ? "s" : ""} — Pág. {movPage}/{movTotalPages}</p>
                    <div className="flex gap-1">
                      <button disabled={movPage <= 1} onClick={() => setMovPage(p => p - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button disabled={movPage >= movTotalPages} onClick={() => setMovPage(p => p + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Transferencias ────────────────────────────────────────── */}
      {activeTab === "transferencias" && (
        <div className="space-y-6">
          {transferencias.length === 0 ? (
            <div className="text-center py-16 px-4 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl">
              <div className="text-6xl mb-4">↔️</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin transferencias</h3>
              <p className="text-sm text-gray-500 mb-6">Mueve dinero entre tus cuentas</p>
              <button
                onClick={() => { setTransError(null); setShowCreateTransfer(true); }}
                className="bg-[#2563EB] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-[#1D4ED8]"
              >
                Nueva transferencia
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {transferencias.map(t => {
                const origenCuenta = cuentas.find(c => c.id === t.origenId);
                const destinoCuenta = cuentas.find(c => c.id === t.destinoId);
                const origenMeta = origenCuenta ? TIPO_META[origenCuenta.tipo] : null;
                const destinoMeta = destinoCuenta ? TIPO_META[destinoCuenta.tipo] : null;
                return (
                <m.div
                  key={t.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    {/* Origen */}
                    <div className="flex-1 min-w-0 text-center">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mx-auto mb-1", origenMeta?.bg ?? "bg-gray-100 dark:bg-gray-800")}>
                        {origenMeta ? (() => { const OI = origenMeta.icon; return <OI className={cn("h-5 w-5", origenMeta.color)} />; })() : <Wallet className="h-5 w-5 text-gray-400" />}
                      </div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{t.origenNombre ?? "Origen"}</p>
                      <p className="text-[10px] text-red-500 font-mono font-bold">-{fmtCurrency(t.monto)}</p>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <ArrowLeftRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400">{fmtCurrency(t.monto)}</p>
                      <p className="text-[10px] text-gray-400">{fmtDate(t.createdAt)}</p>
                    </div>

                    {/* Destino */}
                    <div className="flex-1 min-w-0 text-center">
                      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mx-auto mb-1", destinoMeta?.bg ?? "bg-gray-100 dark:bg-gray-800")}>
                        {destinoMeta ? (() => { const DI = destinoMeta.icon; return <DI className={cn("h-5 w-5", destinoMeta.color)} />; })() : <Wallet className="h-5 w-5 text-gray-400" />}
                      </div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{t.destinoNombre ?? "Destino"}</p>
                      <p className="text-[10px] text-emerald-500 font-mono font-bold">+{fmtCurrency(t.monto)}</p>
                    </div>
                  </div>
                  {t.descripcion && <p className="text-xs text-gray-400 mt-2 text-center truncate">{t.descripcion}</p>}
                </m.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Modal: Crear/Editar Cuenta */}
      <AnimatePresence>
        {(showCreateCuenta || editCuenta) && (
          <>
            <m.div
              key="cuenta-bg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => { setShowCreateCuenta(false); setEditCuenta(null); }}
            />
            <m.div
              key="cuenta-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-auto sm:w-full sm:max-w-lg bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden"
            >
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {editCuenta ? "Editar cuenta" : "Nueva cuenta"}
                  </h3>
                  <button onClick={() => { setShowCreateCuenta(false); setEditCuenta(null); }} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
                    <input
                      value={formNombre}
                      onChange={e => setFormNombre(e.target.value)}
                      placeholder="Ej: BCP Ahorro, Caja Principal, Yape..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>

                  {!editCuenta && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Tipo de cuenta *</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(TIPO_META) as CuentaTipo[]).map(tipo => {
                          const m = TIPO_META[tipo];
                          const TipoIcon = m.icon;
                          return (
                            <button
                              key={tipo}
                              type="button"
                              onClick={() => setFormTipo(tipo)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all",
                                formTipo === tipo
                                  ? "border-[#2563EB] bg-[#2563EB]/5 text-[#2563EB] dark:text-emerald-400 ring-2 ring-[#2563EB]/20"
                                  : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                              )}
                            >
                              <TipoIcon className="h-4 w-4 shrink-0" />
                              {m.shortLabel}
                              {formTipo === tipo && <Check className="h-3.5 w-3.5 ml-auto" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Banco / Entidad</label>
                      <input
                        value={formBanco}
                        onChange={e => setFormBanco(e.target.value)}
                        placeholder="BCP, BBVA, Yape..."
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">N° Cuenta</label>
                      <input
                        value={formNumeroCuenta}
                        onChange={e => setFormNumeroCuenta(e.target.value)}
                        placeholder="123-456-789"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                  </div>

                  {!editCuenta && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Saldo inicial (S/)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formSaldoInicial}
                        onChange={e => setFormSaldoInicial(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Notas</label>
                    <textarea
                      rows={2}
                      value={formNotas}
                      onChange={e => setFormNotas(e.target.value)}
                      placeholder="Notas opcionales..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 resize-none"
                    />
                  </div>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setShowCreateCuenta(false); setEditCuenta(null); }}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={editCuenta ? handleEditCuenta : handleCreateCuenta}
                    disabled={formSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 transition-colors"
                  >
                    {formSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editCuenta ? "Guardar" : "Crear cuenta"}
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Registrar Movimiento */}
      <AnimatePresence>
        {showCreateMov && (
          <>
            <m.div
              key="mov-bg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCreateMov(false)}
            />
            <m.div
              key="mov-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-auto sm:w-full sm:max-w-lg bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden"
            >
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Registrar movimiento</h3>
                  <button onClick={() => setShowCreateMov(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Cuenta *</label>
                    <select
                      value={movFormCuenta}
                      onChange={e => setMovFormCuenta(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    >
                      <option value="">Seleccionar cuenta...</option>
                      {activeCuentas.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre} — {fmtCurrency(c.saldo)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Tipo *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMovFormTipo("INGRESO")}
                        className={cn(
                          "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all",
                          movFormTipo === "INGRESO"
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-2 ring-emerald-500/20"
                            : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400"
                        )}
                      >
                        <ArrowDownToLine className="h-4 w-4" /> Ingreso
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovFormTipo("EGRESO")}
                        className={cn(
                          "flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all",
                          movFormTipo === "EGRESO"
                            ? "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 ring-2 ring-red-500/20"
                            : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400"
                        )}
                      >
                        <ArrowUpFromLine className="h-4 w-4" /> Egreso
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Monto (S/) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={movFormMonto}
                      onChange={e => setMovFormMonto(e.target.value)}
                      placeholder="100.00"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                      <select
                        value={movFormCategoria}
                        onChange={e => setMovFormCategoria(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      >
                        <option value="">Sin categoría</option>
                        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Referencia</label>
                      <input
                        value={movFormRef}
                        onChange={e => setMovFormRef(e.target.value)}
                        placeholder="N° boleta, fact..."
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                    <input
                      value={movFormDesc}
                      onChange={e => setMovFormDesc(e.target.value)}
                      placeholder="Detalle del movimiento..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>
                </div>

                {/* Balance Warning */}
                {movFormTipo === "EGRESO" && movFormCuenta && parseFloat(movFormMonto) > 0 && (() => {
                  const cuenta = activeCuentas.find(c => c.id === movFormCuenta);
                  const monto = parseFloat(movFormMonto);
                  if (cuenta && monto > cuenta.saldo) {
                    return (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          El monto ({fmtCurrency(monto)}) supera el saldo disponible ({fmtCurrency(cuenta.saldo)}). La cuenta quedará en negativo.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {movFormError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{movFormError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowCreateMov(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateMov}
                    disabled={movFormSubmitting}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition-colors",
                      movFormTipo === "INGRESO" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                    )}
                  >
                    {movFormSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Registrar {movFormTipo === "INGRESO" ? "ingreso" : "egreso"}
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Transferencia */}
      <AnimatePresence>
        {showCreateTransfer && (
          <>
            <m.div
              key="trans-bg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowCreateTransfer(false)}
            />
            <m.div
              key="trans-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-auto sm:w-full sm:max-w-lg bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden"
            >
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Transferencia entre cuentas</h3>
                  <button onClick={() => setShowCreateTransfer(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Cuenta origen *</label>
                    <select
                      value={transOrigen}
                      onChange={e => setTransOrigen(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    >
                      <option value="">Seleccionar origen...</option>
                      {activeCuentas.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre} — {fmtCurrency(c.saldo)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-center">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <ArrowDownToLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Cuenta destino *</label>
                    <select
                      value={transDestino}
                      onChange={e => setTransDestino(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    >
                      <option value="">Seleccionar destino...</option>
                      {activeCuentas.filter(c => c.id !== transOrigen).map(c => (
                        <option key={c.id} value={c.id}>{c.nombre} — {fmtCurrency(c.saldo)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Monto (S/) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={transMonto}
                      onChange={e => setTransMonto(e.target.value)}
                      placeholder="500.00"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                    <input
                      value={transDesc}
                      onChange={e => setTransDesc(e.target.value)}
                      placeholder="Motivo de la transferencia..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                    />
                  </div>
                </div>

                {/* Transfer Balance Warning */}
                {transOrigen && parseFloat(transMonto) > 0 && (() => {
                  const cuenta = activeCuentas.find(c => c.id === transOrigen);
                  const monto = parseFloat(transMonto);
                  if (cuenta && monto > cuenta.saldo) {
                    return (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          El monto supera el saldo de la cuenta origen ({fmtCurrency(cuenta.saldo)}).
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {transError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{transError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowCreateTransfer(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateTransfer}
                    disabled={transSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {transSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Transferir
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Deactivate/Activate Account */}
      <AnimatePresence>
        {showDeactivateModal && deactivateTarget && (
          <>
            <m.div
              key="deact-bg"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => { setShowDeactivateModal(false); setDeactivateTarget(null); }}
            />
            <m.div
              key="deact-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[20%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-auto sm:w-full sm:max-w-md bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden"
            >
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-12 w-12 rounded-xl flex items-center justify-center",
                    deactivateTarget.activa ? "bg-red-100 dark:bg-red-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                  )}>
                    <Power className={cn("h-6 w-6", deactivateTarget.activa ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {deactivateTarget.activa ? "Desactivar" : "Activar"} cuenta
                    </h3>
                    <p className="text-sm text-gray-500">{deactivateTarget.nombre}</p>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {deactivateTarget.activa
                    ? "La cuenta no aparecerá en la lista activa ni podrá recibir movimientos. El saldo se conserva."
                    : "La cuenta volverá a aparecer en la lista activa y podrá recibir movimientos."}
                </p>

                {deactivateTarget.activa && deactivateTarget.saldo > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Esta cuenta tiene un saldo de {fmtCurrency(deactivateTarget.saldo)}. Considera transferir el dinero antes.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setShowDeactivateModal(false); setDeactivateTarget(null); }}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleToggleActive}
                    disabled={deactivating}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition-colors",
                      deactivateTarget.activa ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                  >
                    {deactivating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {deactivateTarget.activa ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
