"use client";

import { CardTitle, LoadingState, PageTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Plus, X, DollarSign, Calendar, User, FileText,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, CreditCard,
  Clock, CheckCircle2, XCircle, Ban, MessageCircle, Printer, PenTool, Download,
  ArrowUp, ArrowDown, Maximize2, Minimize2,
  LayoutList, Columns3, MapPin, HandCoins, Search, RefreshCw } from "@buleje/design-system/icons";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart } from "recharts";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import ClienteFormModal from "./clientes/ClienteFormModal";

import dynamic from "next/dynamic";
const FiadoFormModal = dynamic(() => import("./fiados/FiadoFormModal"), { ssr: false });
const FiadoModals = dynamic(() => import("./fiados/FiadoModals"), { ssr: false });
const FiadoStats = dynamic(() => import("./fiados/FiadoStats"), { ssr: false });
const CobranzaInteligente = dynamic(() => import("./fiados/CobranzaInteligente"), { ssr: false });


// ── Types ─────────────────────────────────────────────────────────────────────

type FiadoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";

type FiadoCuota = {
  id: string;
  fiadoId: string;
  monto: number;
  pagadoEn?: string;
  notas?: string;
  createdAt: string;
};

type Fiado = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  total: number;
  saldo: number;
  descripcion?: string;
  status: FiadoStatus;
  fechaVence?: string;
  cuotas: FiadoCuota[];
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<FiadoStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2; variant: BadgeVariant }> = {
  ACTIVO:    { label: "Activo",    color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-100)]",   icon: Clock,       variant: "warning" },
  PAGADO:    { label: "Pagado",    color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)]", icon: CheckCircle2, variant: "success" },
  VENCIDO:   { label: "Vencido",   color: "text-[var(--data-error)]",       bg: "bg-[var(--data-error-100)]",       icon: XCircle,     variant: "error" },
  CANCELADO: { label: "Cancelado", color: "text-[var(--text-secondary)]",     bg: "bg-gray-100",     icon: Ban,         variant: "neutral" },
};

function formatCurrency(n: number) {
  return `S/${n.toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const PER_PAGE = 10;

// ── Mejora 15: Semáforo visual por fiado ────────────────────────────────────

function FiadoSemaphore({ fiado }: { fiado: { status: string; fechaVence?: string } }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (fiado.status === "PAGADO") {
    return <StatusBadge variant="success" label="Pagado" icon={CheckCircle2} size="sm" />;
  }
  if (fiado.status === "CANCELADO") {
    return null;
  }

  // Active or Overdue
  const vence = fiado.fechaVence ? new Date(fiado.fechaVence) : null;
  if (vence) vence.setHours(0, 0, 0, 0);

  // Bloqueado: vencido > 60 dias
  if (vence && vence.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
    return <StatusBadge variant="error" label="Bloqueado" dot size="sm" pulse />;
  }

  // Vencido
  if (fiado.status === "VENCIDO" || (vence && vence < now)) {
    const diasVencido = vence ? Math.floor((now.getTime() - vence.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    return <StatusBadge variant="error" label={`Vencido${diasVencido > 0 ? ` hace ${diasVencido}d` : ""}`} dot size="sm" />;
  }

  // Por vencer (7 dias)
  if (vence) {
    const diasRestantes = Math.floor((vence.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diasRestantes <= 7) {
      return <StatusBadge variant="warning" label={`Vence en ${diasRestantes}d`} dot size="sm" pulse />;
    }
  }

  // Al dia
  return <StatusBadge variant="success" label="Al dia" dot size="sm" />;
}

// ── Mejora 11: Score de confiabilidad para fiados ────────────────────────────

type ReliabilityScore = {
  score: number; // 1-5
  label: string;
  pagosATiempo: number;
  pagosTotal: number;
  diasPromedioPago: number;
  sufficientHistory: boolean;
};

function computeReliabilityScore(fiados: Fiado[]): ReliabilityScore {
  // Solo considerar fiados completados (PAGADO)
  const completados = fiados.filter(f => f.status === "PAGADO");
  if (completados.length < 3) {
    return { score: 0, label: "Sin historial", pagosATiempo: 0, pagosTotal: 0, diasPromedioPago: 0, sufficientHistory: false };
  }

  let pagosATiempo = 0;
  let totalDiasPago = 0;

  for (const f of completados) {
    const createdAt = new Date(f.createdAt).getTime();
    const updatedAt = new Date(f.updatedAt).getTime(); // pagadoEn ~ updatedAt
    const diasPago = Math.max(0, Math.floor((updatedAt - createdAt) / (1000 * 60 * 60 * 24)));
    totalDiasPago += diasPago;

    if (f.fechaVence) {
      const vence = new Date(f.fechaVence).getTime();
      if (updatedAt <= vence) pagosATiempo++;
    } else {
      // Sin fecha de vencimiento, considerar "a tiempo" si pagó en <30 días
      if (diasPago < 30) pagosATiempo++;
    }
  }

  const pagosTotal = completados.length;
  const pctATiempo = pagosTotal > 0 ? (pagosATiempo / pagosTotal) * 100 : 0;
  const diasPromedioPago = pagosTotal > 0 ? totalDiasPago / pagosTotal : 0;

  let score: number;
  if (pctATiempo > 90 && diasPromedioPago < 7) score = 5;
  else if (pctATiempo > 75 && diasPromedioPago < 15) score = 4;
  else if (pctATiempo > 50 && diasPromedioPago < 30) score = 3;
  else if (pctATiempo > 25) score = 2;
  else score = 1;

  return { score, label: `${score}/5`, pagosATiempo, pagosTotal, diasPromedioPago, sufficientHistory: true };
}

// ── Mejora QW-10h: Streak de pagos consecutivos a tiempo ────────────────────

function FiadoStreakBadge({ customerId, fiados }: { customerId: string; fiados: Fiado[] }) {
  const clientFiados = fiados.filter(f => f.customerId === customerId && f.status === "PAGADO");
  if (clientFiados.length < 3) return null;

  // Ordenar por fecha de pago (updatedAt) desc y contar consecutivos a tiempo
  const sorted = [...clientFiados].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  let streak = 0;
  for (const f of sorted) {
    const pagado = new Date(f.updatedAt).getTime();
    const vence = f.fechaVence ? new Date(f.fechaVence).getTime() : new Date(f.createdAt).getTime() + 30 * 86400000;
    if (pagado <= vence) streak++;
    else break;
  }

  if (streak < 3) return null;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
      streak >= 5 ? "bg-[var(--data-warning-100)] text-[var(--data-warning)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning)]"
    )}>
      {streak >= 5 ? "\u2B50" : "\uD83D\uDD25"} {streak} pagos a tiempo
    </span>
  );
}

// Cache de scores por cliente para evitar recálculos
const reliabilityCache = new Map<string, ReliabilityScore>();

function FiadoReliabilityBadge({ customerId, fiados }: { customerId: string; fiados: Fiado[] }) {
  // Calcular score usando fiados del mismo cliente
  const cacheKey = `${customerId}-${fiados.length}`;
  let score = reliabilityCache.get(cacheKey);
  if (!score) {
    const clientFiados = fiados.filter(f => f.customerId === customerId);
    score = computeReliabilityScore(clientFiados);
    reliabilityCache.set(cacheKey, score);
  }

  if (!score.sufficientHistory) {
    return (
      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] italic ml-1">Sin historial</span>
    );
  }

  const colorMap: Record<number, string> = {
    5: "text-yellow-500",
    4: "text-yellow-500",
    3: "text-amber-500",
    2: "text-orange-500",
    1: "text-red-500",
  };

  return (
    <span
      className={cn("text-[length:var(--ts-2xs)] font-bold ml-1", colorMap[score.score] ?? "text-[var(--text-tertiary)]")}
      title={`Calificación basada en pagos a tiempo. 5 estrellas = siempre puntual. Pagos a tiempo: ${score.pagosATiempo}/${score.pagosTotal} · Promedio: ${Math.round(score.diasPromedioPago)} días`}
    >
      {score.label}
    </span>
  );
}

// ── Mejora 16: Gráfica de cobro mensual ──────────────────────────────────────

function FiadoTendenciaCobro() {
  const [chartData, setChartData] = useState<Array<{ mes: string; cobrados: number; nuevos: number; neto: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/fiado-analytics")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tendencia12m && Array.isArray(data.tendencia12m)) {
          const last6 = data.tendencia12m.slice(-6);
          setChartData(last6.map((m: { mes?: string; month?: string; cobrados?: number; collected?: number; nuevos?: number; created?: number }) => {
            const cobrados = m.cobrados ?? m.collected ?? 0;
            const nuevos = m.nuevos ?? m.created ?? 0;
            return {
              mes: m.mes ?? m.month ?? "",
              cobrados: Math.round(cobrados),
              nuevos: Math.round(nuevos),
              neto: Math.round(cobrados - nuevos),
            };
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-[200px] bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
        <p className="text-xs text-[var(--text-tertiary)] text-center py-4">Sin datos de fiados para mostrar grafica</p>
      </div>
    );
  }

  const lastNeto = chartData[chartData.length - 1]?.neto ?? 0;

  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4 sm:p-5 ">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-[var(--text-secondary)]">Tendencia de Cobro</p>
        <StatusBadge
          variant={lastNeto >= 0 ? "success" : "error"}
          label={lastNeto >= 0 ? "Recuperando mas de lo que prestas" : "Prestando mas de lo que cobras"}
        />
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `S/${v}`} />
          <Tooltip formatter={(value: unknown, name: unknown) => { const v = Number(value); const n = String(name); return [`S/${v.toLocaleString("es-PE")}`, n === "cobrados" ? "Cobrados" : n === "nuevos" ? "Nuevos" : "Neto"]; }} />
          <Legend formatter={(value: unknown) => { const v = String(value); return v === "cobrados" ? "Cobrados" : v === "nuevos" ? "Nuevos" : "Neto"; }} />
          <Bar dataKey="cobrados" fill="var(--data-success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="nuevos" fill="var(--text-tertiary)" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="neto" stroke="var(--data-success)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FiadosModule() {
  // List state
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FiadoStatus | "">("");
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [page, setPage] = useState(1);

  // Detail sheet
  const [selected, setSelected] = useState<Fiado | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // New fiado modal
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ customerId: "", total: "", descripcion: "", fechaVence: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Mejora 17: Foto del DNI
  const [dniPhoto, setDniPhoto] = useState<string | null>(null);

  // Mejora M1: Resumen visual del cliente al crear fiado
  const [clienteResumen, setClienteResumen] = useState<{
    nombre: string; score: number; pagados: number; total: number;
    deudaActual: number; limite: number; promedioDias: number;
    bloqueado: boolean;
  } | null>(null);
  const [clienteResumenLoading, setClienteResumenLoading] = useState(false);
  const [clienteEsNuevo, setClienteEsNuevo] = useState(false);

  // Mejora 18: Compromiso de pago
  const [showCompromiso, setShowCompromiso] = useState(false);

  // UX: Panel tabs (Mejora 15)
  const [panelTab, setPanelTab] = useState<"Detalle" | "Pagos" | "Acciones">("Detalle");

  // UX: Panel width toggle (Mejora 16)
  const [isPanelWide, setIsPanelWide] = useState(() => {
    try { return localStorage.getItem("panel-width-preference") === "wide"; } catch { return false; }
  });

  // UX: Sortable columns (Mejora 19)
  const [sortBy, setSortBy] = useState<"name" | "total" | "saldo" | "fecha">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // UX: Table density (Mejora 20)
  const [tableDensity, setTableDensity] = useState<"compact" | "normal" | "wide">(() => {
    try { return (localStorage.getItem("table-density") as "compact" | "normal" | "wide") || "normal"; } catch { return "normal"; }
  });

  // Mejora 17 (ronda 3): Kanban view for fiados
  const [fiadosViewMode, setFiadosViewMode] = useState<"list" | "kanban" | "libreta" | "cobranza">(() => {
    try { return (localStorage.getItem("fiados-view-mode") as "list" | "kanban" | "libreta" | "cobranza") || "list"; } catch { return "list"; }
  });

  // IDEA 1: Libreta Digital — Vista que replica la libreta de fiados de papel
  const [_libretaPage, _setLibretaPage] = useState(0); // Reserved for pagination
  const [showQuickFiado, setShowQuickFiado] = useState(false);
  const [quickFiadoForm, setQuickFiadoForm] = useState({ nombre: "", producto: "", monto: "" });
  const [quickFiadoCreating, setQuickFiadoCreating] = useState(false);

  // Agrupar fiados por cliente para la vista libreta
  const libretaClientes = useMemo(() => {
    const activos = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
    const map = new Map<string, { nombre: string; customerId: string; fiados: Fiado[]; totalDeuda: number; totalPagado: number }>();
    for (const f of activos) {
      const key = f.customerId;
      const existing = map.get(key);
      const pagado = f.cuotas.reduce((s, c) => s + c.monto, 0);
      if (existing) {
        existing.fiados.push(f);
        existing.totalDeuda += f.saldo;
        existing.totalPagado += pagado;
      } else {
        map.set(key, {
          nombre: f.customerName || f.customerId,
          customerId: f.customerId,
          fiados: [f],
          totalDeuda: f.saldo,
          totalPagado: pagado,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalDeuda - a.totalDeuda);
  }, [fiados]);

  const handleQuickFiado = async () => {
    if (quickFiadoCreating) return;
    const monto = parseFloat(quickFiadoForm.monto);
    if (!quickFiadoForm.nombre.trim() || isNaN(monto) || monto <= 0) return;
    setQuickFiadoCreating(true);
    try {
      const res = await fetch("/api/fiados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: quickFiadoForm.nombre.trim(),
          total: monto,
          descripcion: quickFiadoForm.producto.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear fiado" }));
        setError(err.error || "Error al crear fiado rapido");
        setQuickFiadoCreating(false);
        return;
      }
      setShowQuickFiado(false);
      setQuickFiadoForm({ nombre: "", producto: "", monto: "" });
      fetchFiados();
    } catch { setError("Error de conexion al crear fiado"); }
    setQuickFiadoCreating(false);
  };

  // Mejora 20 (ronda 3): Debtors map modal
  const [showDebtorsMap, setShowDebtorsMap] = useState(false);
  const [compromisoMonto, setCompromisoMonto] = useState("");
  const [compromisoFecha, setCompromisoFecha] = useState("");
  const firmaCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Pago modal
  const [showPago, setShowPago] = useState(false);
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoNotas, setPagoNotas] = useState("");
  const [paying, setPaying] = useState(false);
  const [pagoError, setPagoError] = useState<string | null>(null);

  // Mejora 7: Recibo post-pago
  const [showRecibo, setShowRecibo] = useState(false);
  const [reciboData, setReciboData] = useState<{
    clienteNombre: string;
    montoPagado: number;
    saldoAnterior: number;
    saldoActual: number;
    fecha: string;
    clientePhone: string;
  } | null>(null);

  // Mejora M2: Calendario de vencimientos state
  const [_calMes, _setCalMes] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [_calDiaSeleccionado, _setCalDiaSeleccionado] = useState<string | null>(null);

  // Mejora 3: Cobro masivo
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCobroMasivo, setShowCobroMasivo] = useState(false);
  const [cobroMonto, setCobroMonto] = useState("");
  const [cobroPaying, setCobroPaying] = useState(false);
  const [cobroError, setCobroError] = useState<string | null>(null);

  // ── Mejora M1: Fetch client summary when customerId changes in new fiado ────
  useEffect(() => {
    const cid = newForm.customerId.trim();
    if (cid.length < 6 || !showNew) {
      setClienteResumen(null);
      setClienteEsNuevo(false);
      return;
    }
    const timer = setTimeout(async () => {
      setClienteResumenLoading(true);
      try {
        // Buscar fiados del cliente en los datos ya cargados
        const clientFiados = fiados.filter(f => f.customerId === cid);
        if (clientFiados.length === 0) {
          // Intentar fetch para verificar si el cliente existe
          const res = await fetch(`/api/customers/${encodeURIComponent(cid)}`).catch(() => null);
          if (res && res.ok) {
            setClienteEsNuevo(true);
            setClienteResumen(null);
          } else {
            setClienteEsNuevo(true);
            setClienteResumen(null);
          }
        } else {
          setClienteEsNuevo(false);
          const score = computeReliabilityScore(clientFiados);
          const activos = clientFiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
          const deudaActual = activos.reduce((s, f) => s + f.saldo, 0);
          const pagados = clientFiados.filter(f => f.status === "PAGADO").length;
          const nombre = clientFiados[0]?.customerName || cid;
          const limite = 500; // Limite default
          // Detectar bloqueo: algun fiado vencido > 60 dias
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const bloqueado = activos.some(f => {
            if (!f.fechaVence) return false;
            const vence = new Date(f.fechaVence);
            return vence.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000;
          });
          setClienteResumen({
            nombre,
            score: score.score,
            pagados,
            total: clientFiados.length,
            deudaActual,
            limite,
            promedioDias: Math.round(score.diasPromedioPago),
            bloqueado,
          });
        }
      } catch {
        setClienteResumen(null);
        setClienteEsNuevo(true);
      } finally {
        setClienteResumenLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [newForm.customerId, showNew, fiados]);

  // Debounce search (250ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch list ──────────────────────────────────────────────────────────────

  const fetchFiados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/fiados?${params}`);
      if (!res.ok) throw new Error("Error al cargar fíados");
      const data: Fiado[] = await res.json();
      setFiados(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { fetchFiados(); }, [fetchFiados]);

  // UX Mejora 13: Cerrar modales con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showCompromiso) { setShowCompromiso(false); return; }
      if (showRecibo) { setShowRecibo(false); return; }
      if (showCobroMasivo) { setShowCobroMasivo(false); return; }
      if (showPago) { setShowPago(false); return; }
      if (showNew) { setShowNew(false); return; }
      if (selected) { setSelected(null); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showCompromiso, showRecibo, showCobroMasivo, showPago, showNew, selected]);

  // UX Mejora 19: Toggle sort
  const toggleSort = (col: "name" | "total" | "saldo" | "fecha") => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  // ── Fetch detail ────────────────────────────────────────────────────────────

  const openDetail = async (fiado: Fiado) => {
    setSelected(fiado);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/fiados/${fiado.id}`);
      if (res.ok) {
        const detail: Fiado = await res.json();
        setSelected(detail);
      }
    } catch {
      // Use list data as fallback
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Create fiado ────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError(null);
    const total = parseFloat(newForm.total);
    if (!newForm.customerId.trim()) { setCreateError("Cliente requerido"); return; }
    if (isNaN(total) || total <= 0) { setCreateError("Monto inválido"); return; }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        customerId: newForm.customerId.trim(),
        total,
      };
      // Mejora 17: Include DNI photo in description if present
      let desc = newForm.descripcion.trim();
      if (dniPhoto) desc = `[IMG:${dniPhoto}] ${desc}`.trim();
      if (desc) body.descripcion = desc;
      if (newForm.fechaVence) body.fechaVence = new Date(newForm.fechaVence).toISOString();

      const res = await fetch("/api/fiados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(err.error || "Error al crear fíado");
      }
      setShowNew(false);
      setNewForm({ customerId: "", total: "", descripcion: "", fechaVence: "" });
      setDniPhoto(null);
      fetchFiados();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setCreating(false);
    }
  };

  // ── Register payment ────────────────────────────────────────────────────────

  const handlePago = async () => {
    if (!selected) return;
    setPagoError(null);
    const monto = parseFloat(pagoMonto);
    if (isNaN(monto) || monto <= 0) { setPagoError("Monto inválido"); return; }

    setPaying(true);
    try {
      const body: Record<string, unknown> = { monto };
      if (pagoNotas.trim()) body.notas = pagoNotas.trim();

      const res = await fetch(`/api/fiados/${selected.id}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al pagar" }));
        throw new Error(err.error || "Error al registrar pago");
      }
      const updated: Fiado = await res.json();
      // Mejora 7: Show recibo post-pago
      setReciboData({
        clienteNombre: selected.customerName || selected.customerId,
        montoPagado: monto,
        saldoAnterior: selected.saldo,
        saldoActual: updated.saldo,
        fecha: new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }),
        clientePhone: selected.customerId,
      });
      setShowRecibo(true);
      setSelected(updated);
      setShowPago(false);
      setPagoMonto("");
      setPagoNotas("");
      fetchFiados();
    } catch (e) {
      setPagoError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setPaying(false);
    }
  };

  // ── Mejora 3: Cobro masivo handlers ─────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedFiados = fiados.filter(f => selectedIds.has(f.id) && (f.status === "ACTIVO" || f.status === "VENCIDO"));
  const selectedTotal = selectedFiados.reduce((s, f) => s + f.saldo, 0);

  // Distribute payment oldest-first
  const computeDistribution = (totalPago: number) => {
    const sorted = [...selectedFiados].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let remaining = totalPago;
    const distribution: { fiadoId: string; customerName: string; saldo: number; pago: number; tipo: string }[] = [];
    for (const f of sorted) {
      if (remaining <= 0) break;
      const pago = Math.min(remaining, f.saldo);
      distribution.push({
        fiadoId: f.id,
        customerName: f.customerName || f.customerId,
        saldo: f.saldo,
        pago,
        tipo: pago >= f.saldo ? "Pago completo" : "Abono parcial",
      });
      remaining -= pago;
    }
    return distribution;
  };

  const handleCobroMasivo = async () => {
    const monto = parseFloat(cobroMonto);
    if (isNaN(monto) || monto <= 0) { setCobroError("Monto invalido"); return; }
    setCobroPaying(true);
    setCobroError(null);
    try {
      const distribution = computeDistribution(monto);
      const payments = distribution.map(d => ({ fiadoId: d.fiadoId, monto: d.pago }));
      const res = await fetch("/api/fiados/cobro-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al cobrar");
      }
      setShowCobroMasivo(false);
      setCobroMonto("");
      setSelectedIds(new Set());
      fetchFiados();
    } catch (e) {
      setCobroError(e instanceof Error ? e.message : "Error");
    } finally {
      setCobroPaying(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const totalSaldo = useMemo(() => fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO").reduce((s, f) => s + f.saldo, 0), [fiados]);

  // UX Mejora 19: Sort fiados
  const sortedFiados = useMemo(() => {
    const arr = [...fiados];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "name": return ((a.customerName || a.customerId) > (b.customerName || b.customerId) ? 1 : -1) * dir;
        case "total": return (a.total - b.total) * dir;
        case "saldo": return (a.saldo - b.saldo) * dir;
        case "fecha": return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        default: return 0;
      }
    });
    return arr;
  }, [fiados, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedFiados.length / PER_PAGE));
  const paginated = sortedFiados.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  // ── Mejora QW-7: Fiado activo mas antiguo ─────────────────────────────────

  const fiadoMasAntiguo = useMemo(() => {
    const activos = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
    if (activos.length === 0) return null;
    const sorted = [...activos].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const oldest = sorted[0];
    const dias = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 86400000);
    if (dias < 7) return null;
    return { ...oldest, dias };
  }, [fiados]);

  // ── Mejora P-9: Clientes que pagaron esta semana ────────────────────────────

  const pagosEstaSemana = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startTs = startOfWeek.getTime();

    const clientesPagaron = new Set<string>();
    for (const f of fiados) {
      for (const c of f.cuotas) {
        if (c.pagadoEn) {
          try {
            if (new Date(c.pagadoEn).getTime() >= startTs) clientesPagaron.add(f.customerId);
          } catch { /* ignore */ }
        }
      }
    }
    const totalConFiado = new Set(fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO").map(f => f.customerId)).size;
    return { pagaron: clientesPagaron.size, total: totalConFiado };
  }, [fiados]);

  // ── Mejora P-10: Mejor pagador del mes ─────────────────────────────────────

  const mejorPagadorMes = useMemo(() => {
    const now = new Date();
    const mesActual = now.getMonth();
    const anioActual = now.getFullYear();
    const clientePagos = new Map<string, { nombre: string; total: number }>();

    for (const f of fiados) {
      for (const c of f.cuotas) {
        if (!c.pagadoEn) continue;
        try {
          const d = new Date(c.pagadoEn);
          if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
            const key = f.customerId;
            const ex = clientePagos.get(key) || { nombre: f.customerName || f.customerId, total: 0 };
            ex.total += c.monto;
            clientePagos.set(key, ex);
          }
        } catch { /* ignore */ }
      }
    }
    if (clientePagos.size === 0) return null;
    let best: { nombre: string; total: number } | null = null;
    for (const data of clientePagos.values()) {
      if (!best || data.total > best.total) best = data;
    }
    return best;
  }, [fiados]);

  // ── Mejora 19 (ronda 3): Proyeccion de cobro ─────────────────────────────────
  const proyeccionCobro = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const startTs = startOfWeek.getTime();
    const todayTs = todayStart.getTime();
    const diasTranscurridos = Math.max(1, Math.floor((now.getTime() - startTs) / 86400000));

    let cobradoHoy = 0;
    let cobradoSemana = 0;
    let cobradoTotal = 0;
    let totalOriginal = 0;
    const totalPendiente = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO").reduce((s, f) => s + f.saldo, 0);

    for (const f of fiados) {
      totalOriginal += f.total;
      for (const c of f.cuotas) {
        cobradoTotal += c.monto;
        try {
          const t = new Date(c.createdAt).getTime();
          if (t >= todayTs) cobradoHoy += c.monto;
          if (t >= startTs) cobradoSemana += c.monto;
        } catch {}
      }
    }

    const promedioDiario = cobradoSemana / diasTranscurridos;
    const diasRestantes = promedioDiario > 0 ? Math.ceil(totalPendiente / promedioDiario) : 0;
    const pctRecuperado = totalOriginal > 0 ? Math.round((cobradoTotal / totalOriginal) * 100) : 0;

    return { cobradoHoy, cobradoSemana, promedioDiario, diasRestantes, totalPendiente, pctRecuperado, cobradoTotal, totalOriginal };
  }, [fiados]);

  // ── Mejora QW-8: Tendencia de morosidad ────────────────────────────────────

  const tendenciaMorosidad = useMemo(() => {
    const now = new Date();
    const mesActual = now.getMonth();
    const anioActual = now.getFullYear();

    let cobradoEsteMes = 0;
    let prestadoEsteMes = 0;

    for (const f of fiados) {
      try {
        const d = new Date(f.createdAt);
        if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
          prestadoEsteMes += f.total;
        }
      } catch { /* ignore */ }
      for (const c of f.cuotas) {
        try {
          const d = new Date(c.createdAt);
          if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
            cobradoEsteMes += c.monto;
          }
        } catch { /* ignore */ }
      }
    }

    return { cobradoEsteMes, prestadoEsteMes };
  }, [fiados]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header estandar ──────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--accent-soft)] shrink-0">
          <HandCoins className="w-5 h-5 text-[var(--data-success)]" />
        </div>
        <div className="flex-1 min-w-0">
          <PageTitle className="text-xl font-bold text-[var(--text-primary)] truncate">
            Fiados
            {fiados.length > 0 && (() => {
              const activos = fiados.filter(f => f.status === "ACTIVO").length;
              const vencidos = fiados.filter(f => f.status === "VENCIDO").length;
              return (
                <span className="ml-2 text-xs font-bold text-[var(--text-secondary)] align-middle">
                  {activos > 0 && <span className="text-[var(--data-success)]">{activos} activos</span>}
                  {activos > 0 && vencidos > 0 && " · "}
                  {vencidos > 0 && <span className="text-[var(--data-error)]">{vencidos} vencidos</span>}
                </span>
              );
            })()}
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Creditos informales y cobranza
            {totalSaldo > 0 && <> · Pendiente: <span className="font-bold text-[var(--data-error)]">{formatCurrency(totalSaldo)}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => setShowDebtorsMap(true)}
            className="p-2 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors" title="Mapa deudores"
          >
            <MapPin className="h-4 w-4 text-[var(--data-success)]" />
          </button>
          <button
            onClick={() => {
              const deudores = fiados
                .filter(f => f.status === "ACTIVO" || f.status === "VENCIDO")
                .sort((a, b) => b.saldo - a.saldo);
              if (deudores.length === 0) return;

              const fecha = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              const totalCobrar = deudores.reduce((s, f) => s + f.saldo, 0);

              const lines = deudores.map((f, i) => {
                const diasPasados = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86400000);
                const phone = f.customerId || "";
                const displayPhone = phone.length > 3 ? phone.slice(0, 3) + "XXXXXX" : phone;
                return `${i + 1}. ${f.customerName || f.customerId} · ${displayPhone} · S/ ${f.saldo.toFixed(2)} · ${diasPasados} dias [ ]`;
              });

              const content = [
                "═══════════════════════════════════════",
                `LISTA DE COBRO — ${fecha}`,
                "Buleje",
                "═══════════════════════════════════════",
                "",
                ...lines,
                "",
                "───────────────────────────────────────",
                `Total por cobrar: S/ ${totalCobrar.toFixed(2)} (${deudores.length} clientes)`,
                "[ ] = marcar cuando se cobre",
                "───────────────────────────────────────",
              ].join("\n");

              const printWin = window.open("", "_blank", "width=420,height=600");
              if (printWin) {
                printWin.document.write(`<html><head><title>Lista de Cobro</title><style>body{font-family:monospace;font-size:12px;white-space:pre-wrap;padding:20px;line-height:1.6;}@media print{body{padding:10px;}}</style></head><body>${content}</body></html>`);
                printWin.document.close();
                printWin.focus();
                setTimeout(() => printWin.print(), 300);
              }
            }}
            className="p-2 rounded-lg bg-[var(--data-warning-50)] hover:bg-[var(--data-warning-100)] transition-colors" title="Lista de cobro"
          >
            <Printer className="h-4 w-4 text-[var(--data-warning)]" />
          </button>
          <button
            onClick={() => {
              const deudores = fiados
                .filter(f => f.status === "ACTIVO" || f.status === "VENCIDO")
                .sort((a, b) => b.saldo - a.saldo);
              if (deudores.length === 0) return;
              const rows = deudores.map(f => {
                const diasPasados = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86400000);
                return {
                  Nombre: f.customerName || f.customerId,
                  "Teléfono": f.customerId,
                  "Monto original (S/)": Number(f.total.toFixed(2)),
                  "Saldo pendiente (S/)": Number(f.saldo.toFixed(2)),
                  "Fecha inicio": new Date(f.createdAt).toLocaleDateString("es-PE"),
                  "Días": diasPasados,
                  Estado: f.status === "VENCIDO" ? "Vencido" : "Activo",
                };
              });
              const fecha = new Date().toISOString().slice(0, 10);
              exportToExcel(rows, `deudores-${fecha}`, "Deudores");
            }}
            className="p-2 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] transition-colors" title="Exportar deudores"
          >
            <Download className="h-4 w-4 text-[var(--data-success)]" />
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo Fiado
          </button>
        </div>
      </div>

      {/* ── Tabs estandar (View modes) ─────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => { setFiadosViewMode("list"); try { localStorage.setItem("fiados-view-mode", "list"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", fiadosViewMode === "list" ? "bg-white text-[var(--text-primary)] " : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
        >
          Lista
        </button>
        <button
          onClick={() => { setFiadosViewMode("kanban"); try { localStorage.setItem("fiados-view-mode", "kanban"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", fiadosViewMode === "kanban" ? "bg-white text-[var(--text-primary)] " : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
        >
          Kanban
        </button>
        <button
          onClick={() => { setFiadosViewMode("libreta"); try { localStorage.setItem("fiados-view-mode", "libreta"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", fiadosViewMode === "libreta" ? "bg-white text-[var(--text-primary)] " : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
        >
          Libreta
        </button>
        <button
          onClick={() => { setFiadosViewMode("cobranza"); try { localStorage.setItem("fiados-view-mode", "cobranza"); } catch {} }}
          className={cn("px-4 py-2 text-sm font-medium rounded-lg transition-all", fiadosViewMode === "cobranza" ? "bg-white text-[var(--text-primary)] " : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
        >
          Cobranza
        </button>
      </div>

      {/* ── Toolbar estandar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busqueda */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fiado o cliente..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-white focus:border-[var(--data-success)]/30 focus:ring-1 focus:ring-[var(--data-success)]/40 outline-none transition-all"
          />
        </div>

        {/* Filtro status — chips estandar */}
        {([
          { key: "" as const, label: "Todos" },
          { key: "ACTIVO" as const, label: "Activo" },
          { key: "VENCIDO" as const, label: "Vencido" },
          { key: "PAGADO" as const, label: "Pagado" },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
              statusFilter === f.key
                ? "bg-[var(--accent-soft)] border-[var(--data-success)]/30 text-[var(--data-success)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] bg-white hover:bg-gray-50"
            )}
          >
            {f.label}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tendencia de morosidad */}
        {(tendenciaMorosidad.cobradoEsteMes > 0 || tendenciaMorosidad.prestadoEsteMes > 0) && (
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
            tendenciaMorosidad.cobradoEsteMes > tendenciaMorosidad.prestadoEsteMes
              ? "bg-[var(--accent-soft)] text-[var(--data-success)]"
              : tendenciaMorosidad.cobradoEsteMes < tendenciaMorosidad.prestadoEsteMes
              ? "bg-[var(--data-error-100)] text-[var(--data-error)]"
              : "bg-gray-100 text-[var(--text-secondary)]"
          )}>
            {tendenciaMorosidad.cobradoEsteMes > tendenciaMorosidad.prestadoEsteMes ? "+" : tendenciaMorosidad.cobradoEsteMes < tendenciaMorosidad.prestadoEsteMes ? "-" : "="}{" "}
            Cobrado S/{tendenciaMorosidad.cobradoEsteMes.toFixed(0)} / Prestado S/{tendenciaMorosidad.prestadoEsteMes.toFixed(0)}
          </span>
        )}

        {/* Resultado count */}
        <span className="text-xs text-[var(--text-tertiary)]">
          {fiados.length} resultados
        </span>

        {/* Reload */}
        <button onClick={fetchFiados} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors" title="Actualizar">
          <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      </div>

      {/* Stats, KPIs, Calendar, Risk Ranking, Projections */}
      <FiadoStats fiados={fiados} loading={loading} totalSaldo={totalSaldo} tendenciaMorosidad={tendenciaMorosidad} proyeccionCobro={proyeccionCobro} fiadoMasAntiguo={fiadoMasAntiguo} pagosEstaSemana={pagosEstaSemana} mejorPagadorMes={mejorPagadorMes} openDetail={openDetail} search={search} setSearch={setSearch} setSelected={setSelected} statusFilter={statusFilter} setStatusFilter={setStatusFilter} FiadoTendenciaCobro={FiadoTendenciaCobro} />

      {/* Cobranza Inteligente — escalado automático + descuentos */}
      {fiadosViewMode === "cobranza" && <CobranzaInteligente />}

      {/* IDEA 1: Vista Libreta Digital — replica la libreta de fiados de papel */}
      {fiadosViewMode === "libreta" && (
        <div className="space-y-6">
          {/* Boton para anotar fiado rapido */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--data-warning)] italic">Libreta de fiados — como la de toda la vida</p>
            <button
              onClick={() => setShowQuickFiado(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-primary hover:bg-[#245a41] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Anotar fiado
            </button>
          </div>

          {libretaClientes.length === 0 ? (
            <div className="bg-[var(--data-warning-50)] border-2 border-dashed border-[var(--data-warning)] rounded-xl p-8 text-center">
              <FileText className="h-10 w-10 text-[var(--data-warning)] mx-auto mb-2" />
              <p className="text-sm font-bold text-[var(--data-warning)]">Libreta vacia</p>
              <p className="text-xs text-[var(--data-warning)] mt-1">No hay fiados activos. Usa el boton &quot;Anotar fiado&quot; para empezar.</p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory no-scrollbar" style={{ scrollBehavior: "smooth" }}>
              {libretaClientes.map((cliente, idx) => (
                <div
                  key={cliente.customerId}
                  className="snap-center shrink-0 w-[320px] sm:w-[360px] rounded-xl border-2 border-[var(--data-warning)]/30"
                  style={{ background: "linear-gradient(180deg, #fef3c7 0%, #fffbeb 30%, #fffdf5 100%)" }}
                >
                  {/* Encabezado de pagina */}
                  <div className="px-4 pt-4 pb-2 border-b-2 border-[var(--data-warning)]/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-serif italic font-bold text-[var(--data-warning)] text-base">{cliente.nombre}</span>
                      </div>
                      <span className="text-[length:var(--ts-2xs)] font-mono text-[var(--data-warning)]">Pag. {idx + 1}/{libretaClientes.length}</span>
                    </div>
                    <FiadoReliabilityBadge customerId={cliente.customerId} fiados={fiados} />
                  </div>

                  {/* Lineas de la libreta */}
                  <div className="px-4 py-3 space-y-0" style={{ backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, #d4a57355 27px, #d4a57355 28px)", backgroundSize: "100% 28px" }}>
                    {cliente.fiados.map((f) => {
                      const fechaCorta = new Date(f.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
                      return (
                        <div key={f.id} className="flex items-baseline justify-between font-mono text-sm leading-7 cursor-pointer hover:bg-[var(--data-warning)]/30 px-1 rounded transition-colors" onClick={() => openDetail(f)}>
                          <span className="text-[var(--data-warning)] truncate max-w-[200px]">
                            <span className="text-[var(--data-warning)] text-xs">{fechaCorta}</span> — {f.descripcion || "fiado"}
                          </span>
                          <span className="font-bold text-[var(--data-warning)] shrink-0 ml-2">S/ {f.total.toFixed(0)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totales */}
                  <div className="px-4 py-3 border-t-2 border-[var(--data-warning)]/20">
                    <div className="flex justify-between font-mono text-sm text-[var(--data-warning)]">
                      <span>Total:</span>
                      <span className="font-bold">S/ {cliente.fiados.reduce((s, f) => s + f.total, 0).toFixed(0)}</span>
                    </div>
                    {cliente.totalPagado > 0 && (
                      <div className="flex justify-between font-mono text-sm text-[var(--data-success)]">
                        <span>Pagado:</span>
                        <span className="font-bold">-S/ {cliente.totalPagado.toFixed(0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-mono text-sm mt-1 pt-1 border-t border-[var(--data-warning)]/20">
                      <span className="font-bold text-[var(--data-error)]">Debe:</span>
                      <span className="font-bold text-[var(--data-error)] text-base">S/ {cliente.totalDeuda.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal de fiado rapido */}
          {showQuickFiado && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowQuickFiado(false)}>
              <div className="bg-[var(--data-warning-50)] rounded-xl max-w-sm w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-2">
                  <CardTitle className="text-base font-bold text-[var(--data-warning)] font-serif italic">Anotar en la libreta</CardTitle>
                </div>
                <input
                  type="text"
                  placeholder="Nombre del cliente"
                  value={quickFiadoForm.nombre}
                  onChange={e => setQuickFiadoForm({ ...quickFiadoForm, nombre: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--data-warning)] bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Producto (ej: arroz 5kg, leche)"
                  value={quickFiadoForm.producto}
                  onChange={e => setQuickFiadoForm({ ...quickFiadoForm, producto: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--data-warning)] bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <input
                  type="number"
                  placeholder="Monto S/"
                  value={quickFiadoForm.monto}
                  onChange={e => setQuickFiadoForm({ ...quickFiadoForm, monto: e.target.value })}
                  step="0.50"
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--data-warning)] bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowQuickFiado(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 transition-colors">Cancelar</button>
                  <button onClick={handleQuickFiado} disabled={quickFiadoCreating || !quickFiadoForm.nombre.trim() || !quickFiadoForm.monto} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-[#245a41] transition-colors disabled:opacity-50">
                    {quickFiadoCreating ? "Anotando..." : "Anotar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mejora 17 (ronda 3): Kanban view de fiados */}
      {fiadosViewMode === "kanban" && (() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const in7days = new Date(now);
        in7days.setDate(in7days.getDate() + 7);
        const ago60days = new Date(now);
        ago60days.setDate(ago60days.getDate() - 60);

        const activos = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");

        const cols = [
          {
            key: "aldia", label: "Al dia", bg: "bg-[var(--accent-soft)]", border: "border-[var(--data-success)]/30", headerBg: "bg-[var(--accent-soft)]",
            items: activos.filter(f => {
              if (!f.fechaVence) return true;
              const v = new Date(f.fechaVence); v.setHours(0, 0, 0, 0);
              return v > in7days;
            }),
          },
          {
            key: "porvencer", label: "Por vencer", bg: "bg-[var(--data-warning-50)]", border: "border-[var(--data-warning)]", headerBg: "bg-yellow-100",
            items: activos.filter(f => {
              if (!f.fechaVence) return false;
              const v = new Date(f.fechaVence); v.setHours(0, 0, 0, 0);
              return v >= now && v <= in7days;
            }),
          },
          {
            key: "vencido", label: "Vencido", bg: "bg-[var(--data-error-50)]", border: "border-[var(--data-error)]", headerBg: "bg-red-100",
            items: activos.filter(f => {
              if (!f.fechaVence) return false;
              const v = new Date(f.fechaVence); v.setHours(0, 0, 0, 0);
              return v < now && v >= ago60days;
            }),
          },
          {
            key: "bloqueado", label: "Bloqueado", bg: "bg-gray-100", border: "border-gray-400", headerBg: "bg-gray-200",
            items: activos.filter(f => {
              if (!f.fechaVence) return false;
              const v = new Date(f.fechaVence); v.setHours(0, 0, 0, 0);
              return v < ago60days;
            }),
          },
        ];

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto">
            {cols.map(col => (
              <div key={col.key} className={cn("rounded-xl border-2 min-w-[200px]", col.bg, col.border)}>
                <div className={cn("px-3 py-2 rounded-t-lg flex items-center justify-between", col.headerBg)}>
                  <span className="text-xs font-extrabold text-[var(--text-primary)]">{col.label}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-white/60 text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">{col.items.length}</span>
                </div>
                <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                  {col.items.length === 0 ? (
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center py-4">Sin fiados</p>
                  ) : [...col.items].sort((a, b) => b.saldo - a.saldo).map(f => {
                    const diasCreado = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86400000);
                    const diasVence = f.fechaVence ? Math.floor((new Date(f.fechaVence).getTime() - Date.now()) / 86400000) : null;
                    return (
                      <div key={f.id} className="bg-white rounded-lg border border-[var(--rule-base)] p-2.5  hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openDetail(f)}>
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{f.customerName || f.customerId}</p>
                        <p className={cn("text-sm font-extrabold font-mono mt-0.5", col.key === "vencido" || col.key === "bloqueado" ? "text-[var(--data-error)]" : col.key === "porvencer" ? "text-[var(--data-warning)]" : "text-primary")}>{formatCurrency(f.saldo)}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                          {diasVence !== null ? (diasVence > 0 ? `vence en ${diasVence}d` : `vencido hace ${Math.abs(diasVence)}d`) : `hace ${diasCreado} dias`}
                        </p>
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={e => { e.stopPropagation(); openDetail(f); }}
                            className="flex-1 text-[length:var(--ts-2xs)] font-bold text-center py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            Cobrar
                          </button>
                          {f.customerId && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                const nombre = f.customerName || f.customerId;
                                const msg = `Hola ${nombre}, te recordamos que tienes un pendiente de S/${f.saldo.toFixed(2)} en Buleje.`;
                                const cleanPhone = f.customerId.replace(/\D/g, "");
                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                              }}
                              className="text-[length:var(--ts-2xs)] font-bold px-2 py-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                            >
                              <MessageCircle className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* UX Mejora 20: Density toggle */}
      {fiadosViewMode === "list" && <div className="flex items-center gap-1 mb-2">
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mr-1">Densidad:</span>
        {(["compact", "normal", "wide"] as const).map(d => (
          <button
            key={d}
            onClick={() => { setTableDensity(d); try { localStorage.setItem("table-density", d); } catch {} }}
            className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold transition-colors", tableDensity === d ? "bg-primary text-white" : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200")}
          >
            {d === "compact" ? "Compacta" : d === "normal" ? "Normal" : "Amplia"}
          </button>
        ))}
      </div>}

      {/* Table — UX Mejora 18: Sticky header + Mejora 19: Sortable columns */}
      {fiadosViewMode === "list" && <div className={cn("bg-white border border-[var(--rule-base)] rounded-xl overflow-hidden ", tableDensity === "compact" ? "table-compact" : tableDensity === "wide" ? "table-wide" : "")}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error)]" />
            <p className="text-sm text-[var(--data-error)]">{error}</p>
            <button onClick={fetchFiados} className="text-xs text-primary hover:underline font-semibold mt-1">Reintentar</button>
          </div>
        ) : fiados.length === 0 ? (
          <EmptyState
            illustration="generic"
            title="Sin fiados registrados"
            description="Los créditos a clientes aparecerán aquí."
            action={{ label: "Crear primer fiado", onClick: () => { setShowNew(true); setCreateError(null); } }}
          />
        ) : (
          <>
            <div className="max-h-[65vh] overflow-y-auto overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[700px] sm:min-w-0 text-sm">
                <thead className="sticky top-0 bg-white z-10 shadow-[var(--shadow-sm)]">
                  <tr className="border-b border-[var(--rule-soft)] text-left">
                    <th className="px-2 py-3 w-8">
                      <span className="sr-only">Seleccionar</span>
                    </th>
                    <th onClick={() => toggleSort("name")} className="px-4 py-3 font-semibold text-[var(--text-secondary)] cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors">
                      <div className="flex items-center gap-1">Cliente {sortBy === "name" && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</div>
                    </th>
                    <th onClick={() => toggleSort("total")} className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors">
                      <div className="flex items-center justify-end gap-1">Total {sortBy === "total" && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</div>
                    </th>
                    <th onClick={() => toggleSort("saldo")} className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right cursor-pointer select-none hover:text-[var(--text-primary)] transition-colors">
                      <div className="flex items-center justify-end gap-1">Saldo {sortBy === "saldo" && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</div>
                    </th>
                    <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] hidden sm:table-cell">Vencimiento</th>
                    <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Status</th>
                    <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-center hidden sm:table-cell">Recordar</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(f => {
                    const meta = STATUS_META[f.status];
                    const StatusIcon = meta.icon;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => openDetail(f)}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                          {(f.status === "ACTIVO" || f.status === "VENCIDO") && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(f.id)}
                              onChange={() => toggleSelect(f.id)}
                              className="h-4 w-4 rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {(() => {
                              const name = f.customerName || f.customerId;
                              const avatarColors = ['#00B4A6','#f97316','#e63946','#457b9d','#6b705c','#9b5de5'];
                              let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
                              const color = avatarColors[Math.abs(h) % avatarColors.length];
                              const initials = name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
                              return <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[length:var(--ts-2xs)] font-bold shrink-0" style={{ backgroundColor: color }}>{initials}</div>;
                            })()}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium text-[var(--text-primary)] truncate">{f.customerName || f.customerId}</p>
                                {/* Mejora 15: Semáforo visual */}
                                <FiadoSemaphore fiado={f} />
                                {/* Mejora 11: Score de confiabilidad */}
                                <FiadoReliabilityBadge customerId={f.customerId} fiados={fiados} />
                                {/* Mejora QW-10h: Streak de pagos */}
                                <FiadoStreakBadge customerId={f.customerId} fiados={fiados} />
                              </div>
                              {f.descripcion && (
                                <p className="text-xs text-[var(--text-tertiary)] truncate max-w-[200px]">{f.descripcion}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">{formatCurrency(f.total)}</td>
                        <td className={cn("px-4 py-3 text-right font-bold font-mono", f.status === "PAGADO" ? "text-[var(--data-success)]" : "text-[var(--data-error)]")}>{formatCurrency(f.saldo)}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] hidden sm:table-cell">
                          {f.fechaVence ? formatDate(f.fechaVence) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold", meta.bg, meta.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          {(f.status === "ACTIVO" || f.status === "VENCIDO") && f.customerId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const nombre = f.customerName || f.customerId;
                                const saldo = f.saldo.toFixed(2);
                                const fecha = f.fechaVence ? formatDate(f.fechaVence) : "";
                                const msg = f.status === "VENCIDO"
                                  ? `Hola ${nombre}, tienes un pendiente de S/${saldo}${fecha ? ` vencido desde el ${fecha}` : ""} en Buleje. Cuando puedas pasa a regularizarlo?`
                                  : `Hola ${nombre}, te recordamos que tienes un pendiente de S/${saldo} en Buleje${fecha ? ` que vence el ${fecha}` : ""}. Pasa cuando puedas!`;
                                const cleanPhone = f.customerId.replace(/\D/g, "");
                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                              }}
                              title="Enviar recordatorio por WhatsApp"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-xs font-bold transition-colors"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)]">
                <p className="text-xs text-[var(--text-secondary)]">
                  {fiados.length} fíado{fiados.length !== 1 ? "s" : ""} — Pág. {page}/{totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>}

      {/* ── Detail Sheet (side panel) ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div
              key="sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <m.div
              key="sheet-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className={cn("fixed inset-y-0 right-0 z-50 w-full bg-white border-l border-[var(--rule-base)] overflow-y-auto transition-all duration-[var(--dur-base)]", isPanelWide ? "max-w-[500px]" : "max-w-md")}
            >
              <div className="p-4 sm:p-6 space-y-5">
                {/* Sheet header — UX Mejora 16: Width toggle */}
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Detalle del Fíado</CardTitle>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { const next = !isPanelWide; setIsPanelWide(next); try { localStorage.setItem("panel-width-preference", next ? "wide" : "normal"); } catch {} }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors hidden sm:flex"
                      title={isPanelWide ? "Panel normal" : "Panel ancho"}
                    >
                      {isPanelWide ? <Minimize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> : <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
                    </button>
                    <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                      <X className="h-5 w-5 text-[var(--text-secondary)]" />
                    </button>
                  </div>
                </div>

                {/* UX Mejora 15: Panel tabs */}
                <div className="flex border-b border-[var(--rule-base)]">
                  {(["Detalle", "Pagos", "Acciones"] as const).map(t => (
                    <button key={t} onClick={() => setPanelTab(t)} className={cn(
                      "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                      panelTab === t ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    )}>{t}</button>
                  ))}
                </div>

                {/* Tab: Detalle */}
                {panelTab === "Detalle" && (
                  <>
                {/* Fiado info */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center">
                      <User className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{selected.customerName || selected.customerId}</p>
                      <p className="text-xs text-[var(--text-secondary)]">Creado: {formatDate(selected.createdAt)}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <FiadoStreakBadge customerId={selected.customerId} fiados={fiados} />
                      <StatusBadge variant={STATUS_META[selected.status].variant} label={STATUS_META[selected.status].label} icon={STATUS_META[selected.status].icon} />
                    </div>
                  </div>
                  {selected.descripcion && (
                    <p className="text-sm text-[var(--text-secondary)]">{selected.descripcion}</p>
                  )}
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--rule-base)]">
                    <div>
                      <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.total)}</p>
                    </div>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Pagado</p>
                      <p className="text-sm font-bold text-[var(--data-success)]">{formatCurrency(selected.total - selected.saldo)}</p>
                    </div>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Saldo</p>
                      <p className="text-sm font-bold text-[var(--data-error)]">{formatCurrency(selected.saldo)}</p>
                    </div>
                  </div>
                  {selected.fechaVence && (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Calendar className="h-3.5 w-3.5" />
                      Vence: {formatDate(selected.fechaVence)}
                    </div>
                  )}
                </div>
                  </>
                )}

                {/* Tab: Pagos */}
                {panelTab === "Pagos" && (
                  <>
                {/* Mejora 15: Historial de pagos mejorado con timeline */}
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">Historial de pagos</h4>
                  {detailLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : selected.cuotas.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)] text-center py-4">Aun no se ha registrado ningun pago</p>
                  ) : (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-[var(--accent-soft)]" />
                      <div className="space-y-3">
                        {[...selected.cuotas].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(c => (
                          <div key={c.id} className="flex items-start gap-3 relative">
                            <div className="h-8 w-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center shrink-0 z-10 border-2 border-white">
                              <DollarSign className="h-3.5 w-3.5 text-[var(--data-success)]" />
                            </div>
                            <div className="flex-1 min-w-0 bg-gray-50 rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(c.monto)}</p>
                                <StatusBadge variant="success" label="Pagado" size="sm" />
                              </div>
                              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                                {new Date(c.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                {" "}
                                {new Date(c.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {c.notas && (
                                <p className="text-xs text-[var(--text-secondary)] mt-1 italic">{c.notas}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                  </>
                )}

                {/* Tab: Acciones */}
                {panelTab === "Acciones" && (
                  <div className="space-y-3">
                    {(selected.status === "ACTIVO" || selected.status === "VENCIDO") && (
                      <>
                        <button
                          onClick={() => { setShowPago(true); setPagoError(null); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors"
                        >
                          <DollarSign className="h-4 w-4" />
                          Registrar Pago
                        </button>
                        <button
                          onClick={() => {
                            setShowCompromiso(true);
                            setCompromisoMonto(selected.saldo.toFixed(2));
                            const d = new Date(); d.setDate(d.getDate() + 7);
                            setCompromisoFecha(d.toISOString().slice(0, 10));
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold text-primary border-2 border-primary hover:bg-primary hover:text-white transition-colors"
                        >
                          <PenTool className="h-4 w-4" />
                          Compromiso de Pago
                        </button>
                        <a
                          href={`https://wa.me/${selected.customerId.replace(/\D/g, "").startsWith("51") ? selected.customerId.replace(/\D/g, "") : "51" + selected.customerId.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${selected.customerName || selected.customerId}, te recordamos que tienes un pendiente de S/${selected.saldo.toFixed(2)} en Buleje.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#25D366] hover:bg-[#1da851] transition-colors"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Recordar por WhatsApp
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => window.print()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir
                    </button>
                  </div>
                )}
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      {/* New Fiado Modal */}
      <FiadoFormModal showNew={showNew} setShowNew={setShowNew} newForm={newForm} setNewForm={setNewForm} creating={creating} createError={createError} handleCreate={handleCreate} setCreateError={setCreateError} dniPhoto={dniPhoto} setDniPhoto={setDniPhoto} clienteResumen={clienteResumen} clienteResumenLoading={clienteResumenLoading} clienteEsNuevo={clienteEsNuevo} />

      {/* Payment, Cobro Masivo, Recibo, Compromiso, Debtors Map Modals */}
      <FiadoModals
        showPago={showPago} setShowPago={setShowPago} selected={selected}
        pagoMonto={pagoMonto} setPagoMonto={setPagoMonto} pagoNotas={pagoNotas} setPagoNotas={setPagoNotas}
        paying={paying} pagoError={pagoError} handlePago={handlePago} setPagoError={setPagoError}
        selectedIds={selectedIds} selectedFiados={selectedFiados} selectedTotal={selectedTotal}
        setSelectedIds={setSelectedIds} showCobroMasivo={showCobroMasivo} setShowCobroMasivo={setShowCobroMasivo}
        cobroMonto={cobroMonto} setCobroMonto={setCobroMonto} cobroPaying={cobroPaying}
        cobroError={cobroError} handleCobroMasivo={handleCobroMasivo} setCobroError={setCobroError}
        computeDistribution={computeDistribution}
        showRecibo={showRecibo} setShowRecibo={setShowRecibo} reciboData={reciboData}
        showCompromiso={showCompromiso} setShowCompromiso={setShowCompromiso}
        compromisoMonto={compromisoMonto} setCompromisoMonto={setCompromisoMonto}
        compromisoFecha={compromisoFecha} setCompromisoFecha={setCompromisoFecha}
        firmaCanvasRef={firmaCanvasRef} isDrawing={isDrawing} setIsDrawing={setIsDrawing}
        showDebtorsMap={showDebtorsMap} setShowDebtorsMap={setShowDebtorsMap}
        fiados={fiados}
      />

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
