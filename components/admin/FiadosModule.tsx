"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Plus, X, DollarSign, Calendar, User, FileText,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, CreditCard,
  Clock, CheckCircle2, XCircle, Ban, MessageCircle, Printer, PenTool, Download,
  ArrowUp, ArrowDown, Maximize2, Minimize2,
  LayoutList, Columns3, MapPin, Search, RefreshCw, HandCoins, Share2 } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import EmptyState from "@/components/admin/shared/EmptyState";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import ClienteFormModal from "./clientes/ClienteFormModal";

import dynamic from "next/dynamic";
import { csrfHeaders } from "@/lib/csrf-client";
const FiadoFormModal = dynamic(() => import("./fiados/FiadoFormModal"), { ssr: false });
const FiadoTendenciaCobroChart = dynamic(() => import("./FiadoTendenciaCobroChart"), {
  ssr: false,
  loading: () => <div className="h-[248px] animate-pulse bg-[var(--color-muted)] rounded-xl" />,
});
const FiadoModals = dynamic(() => import("./fiados/FiadoModals"), { ssr: false });
const FiadoStats = dynamic(() => import("./fiados/FiadoStats"), { ssr: false });
const FiadoMarketplaceToggle = dynamic(() => import("./fiados/FiadoMarketplaceToggle"), { ssr: false });
const CreditRequestsPanel = dynamic(() => import("./fiados/CreditRequestsPanel"), { ssr: false });


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
  ACTIVO:    { label: "Activo",    color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)]",   icon: Clock,       variant: "warning" },
  PAGADO:    { label: "Pagado",    color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)]", icon: CheckCircle2, variant: "success" },
  VENCIDO:   { label: "Vencido",   color: "text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-100)]",       icon: XCircle,     variant: "error" },
  CANCELADO: { label: "Cancelado", color: "text-[var(--text-secondary)]",     bg: "bg-[var(--surface-sunken)]",     icon: Ban,         variant: "neutral" },
};

function formatCurrency(n: number) {
  return `S/${n.toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const PER_PAGE = 10;

// AdminTabBar: coherencia con el resto del admin (reorden por drag,
// registro en sidebar). Persistencia en `tab-order-${FIADOS_MODULE_ID}`.
const FIADOS_MODULE_ID = "fiados";

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
  // Round 21 fix: ambas ramas ten\u00EDan el mismo className \u2192 solo cambiaba emoji.
  // Streak 3-4 (bueno) usa success token, 5+ (excelente) mantiene gold-warning
  // con peso visual mayor. Diferenciaci\u00F3n intencional seg\u00FAn dise\u00F1o.
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold",
      streak >= 5
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
        : "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
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
      <span className="text-xs text-[var(--text-tertiary)] italic ml-1">Sin historial</span>
    );
  }

  // Round 9: tokens DS (ADR-075). 5/4 estrellas = excelente puntualidad → success.
  // 3 = warning. 2/1 = malo → error (gradiente). Antes: yellow-500/orange-500 raw.
  const colorMap: Record<number, string> = {
    5: "text-[var(--data-success-500)]",
    4: "text-[var(--data-success-500)]",
    3: "text-[var(--data-warning-500)]",
    2: "text-[var(--data-error-500)]",
    1: "text-[var(--data-error-500)]",
  };

  return (
    <span
      className={cn("text-xs font-bold ml-1", colorMap[score.score] ?? "text-[var(--text-tertiary)]")}
      title={`Calificación basada en pagos a tiempo. 5 estrellas = siempre puntual. Pagos a tiempo: ${score.pagosATiempo}/${score.pagosTotal} · Promedio: ${Math.round(score.diasPromedioPago)} días`}
    >
      {score.label}
    </span>
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

  // Audit 2026-05-17: sub-tabs dentro del módulo Fiados.
  // Antes había 10+ widgets en una sola vista scrollable. Ahora se reparten
  // en 3 vistas con persistencia para que el dueño abra siempre donde estaba.
  type FiadoTab = "resumen" | "deudores" | "analisis";
  const [activeTab, setActiveTab] = useState<FiadoTab>(() => {
    try {
      const stored = localStorage.getItem("fiados-tab") as FiadoTab | null;
      if (stored === "resumen" || stored === "deudores" || stored === "analisis") return stored;
    } catch { /* localStorage bloqueado */ }
    return "resumen";
  });
  const setTab = (t: FiadoTab) => {
    setActiveTab(t);
    try { localStorage.setItem("fiados-tab", t); } catch { /* ignore */ }
  };

  // Conteos para badges de tabs (se actualizan en vivo con los filtros).
  const vencidosTotales = fiados.filter(f => f.status === "VENCIDO" || (f.fechaVence && new Date(f.fechaVence) < new Date() && f.status === "ACTIVO")).length;
  const FIADOS_TAB_ITEMS: Array<{ id: FiadoTab; label: string; badge?: number }> = [
    { id: "resumen", label: "Resumen" },
    { id: "deudores", label: "Deudores", badge: fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO").length },
    { id: "analisis", label: "Análisis", badge: vencidosTotales > 0 ? vencidosTotales : undefined },
  ];

  // IDEA 1: Libreta Digital — Vista que replica la libreta de fiados de papel.
  // Round 21 cleanup: removed unused _libretaPage state — feature postpuesta
  // sin caller actual. Re-añadir si paginación se prioriza.
  // Audit 2026-05-17 P0-2: removed dead QuickFiado states (showQuickFiado,
  // quickFiadoForm, quickFiadoCreating) + handleQuickFiado handler. El form
  // enviaba `customerId: nombre.trim()` y el backend resolvía por contains →
  // si había 2 clientes con el mismo nombre, la deuda se cargaba al primer
  // match. Eliminado para evitar reactivación accidental.

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

  // Mejora M2: Calendario de vencimientos state. Round 21 cleanup: removed
  // unused _calMes / _calDiaSeleccionado — feature de calendario sin caller
  // actual. Re-añadir cuando se priorice (M2 backlog).

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
          // Brandon 2026-06-17: límite REAL del Customer (antes hardcoded 500).
          // creditLimit 0 = sin tope configurado → la UI lo muestra como "Sin tope".
          let limite = 0;
          try {
            const cRes = await fetch(`/api/customers/${encodeURIComponent(cid)}`).catch(() => null);
            if (cRes && cRes.ok) {
              const cData = await cRes.json();
              limite = Number(cData?.creditLimit ?? 0) || 0;
            }
          } catch {
            /* fallback limite=0 = sin tope; el lookup es best-effort */
          }
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
      } catch (err) {
        // Audit 2026-05-17 P2-4: antes silent; ahora console.warn para que el
        // dueño no tenga el log en blanco si el customer-resumen falla en prod.
        // El fallback (cliente nuevo) es intencional cuando no existe historial.
        console.warn("[FiadosModule] cliente-resumen lookup failed, treating as nuevo", err);
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
    } catch (err) {
      // Audit 2026-05-17 P2-4: console.warn en lugar de silent. El fallback
      // (usar la data del listado) es intencional para que el modal abra
      // igual aunque el detail endpoint falle.
      console.warn("[FiadosModule] detail fetch failed, using list data as fallback", err);
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
      // Mejora 17 / Brandon 2026-06-17: subir la foto DNI server-side. Antes se
      // inyectaba el base64 en descripcion → lo rechazaba el Zod max(500) del API
      // (la foto nunca se guardaba). Ahora sube a /api/upload (Supabase+Sharp) y
      // guarda solo la URL (corta) como [FOTO:url]. Best-effort: si falla, el
      // fiado se crea igual sin la foto (no bloquear la operación).
      let desc = newForm.descripcion.trim();
      if (dniPhoto) {
        try {
          const blob = await (await fetch(dniPhoto)).blob();
          const file = new File([blob], "fiado-dni.jpg", { type: blob.type || "image/jpeg" });
          const fd = new FormData();
          fd.append("file", file);
          fd.append("folder", "general");
          const upRes = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
          if (upRes.ok) {
            const up = (await upRes.json()) as { url?: string };
            if (up.url) desc = `[FOTO:${up.url}] ${desc}`.trim();
          }
        } catch {
          /* upload best-effort: se crea el fiado sin la foto si falla */
        }
      }
      if (desc) body.descripcion = desc;
      if (newForm.fechaVence) body.fechaVence = new Date(newForm.fechaVence).toISOString();

      const res = await fetch("/api/fiados", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  // ── Mejora 19 (ronda 3): Proyección de cobro ─────────────────────────────────
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

  // ── Stats inline para el header ─────────────────────────────────
  const activosCount = fiados.filter((f) => f.status === "ACTIVO").length;
  const vencidosCount = fiados.filter((f) => f.status === "VENCIDO").length;

  // Handlers extraidos para pasar a ModuleActionMenu
  const handleImprimirListaCobro = () => {
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
      return `${i + 1}. ${f.customerName || f.customerId} · ${displayPhone} · S/ ${Number(f.saldo).toFixed(2)} · ${diasPasados} dias [ ]`;
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
  };

  const handleExportarDeudores = () => {
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
  };

  const STATUS_FILTERS = [
    { key: "" as const, label: "Todos" },
    { key: "ACTIVO" as const, label: "Activo" },
    { key: "VENCIDO" as const, label: "Vencido" },
    { key: "PAGADO" as const, label: "Pagado" },
  ];

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        as="h2"
        eyebrow="Cobros · Crédito"
        title="Fiados"
        description="Gestiona los créditos a clientes, cobranza por ruta, riesgo de morosidad y proyección de cobros."
        icon={HandCoins}
      />

      {/* Fiado Digital — toggle self-serve para exhibir "Acepta fiado" en el
          marketplace (badge + filtro en /tiendas). Brandon 2026-07-03. */}
      <FiadoMarketplaceToggle />

      {/* Solicitudes de línea de fiado del vecino (Frente 3) — solo aparece si
          hay pendientes. Aprobar fija la línea → desbloquea checkout. */}
      <CreditRequestsPanel />

      {/* Sub-tabs · Audit 2026-05-17. AdminTabBar = coherencia con el resto
          del admin (reorden por drag, registro en sidebar). */}
      <AdminTabBar
        moduleId={FIADOS_MODULE_ID}
        tabs={FIADOS_TAB_ITEMS}
        activeTab={activeTab}
        onTabChange={(id) => setTab(id as FiadoTab)}
      />

      {/* Fila única — Buscador + filtros + contador + acciones (compacto, 1 row).
          Solo visible en tab Deudores (los filtros afectan la tabla).
          Audit 2026-05-17 (UX): pt-2 para respiro extra entre el border del
          tab nav y los filtros (antes pegados sin separación visual). */}
      {activeTab === "deudores" && <div className="flex flex-wrap items-center gap-2 pt-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fiado o cliente..."
            className="w-full h-12 sm:h-10 pl-10 pr-4 text-sm rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] focus:border-primary/40 focus:ring-1 focus:ring-primary/30 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-semibold border transition-colors",
                statusFilter === f.key
                  ? "bg-primary text-white border-primary"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] bg-white dark:bg-[var(--color-card)] hover:border-primary/40 hover:text-primary"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {totalSaldo > 0 && (
          <div className="hidden md:flex items-center gap-1.5 text-xs pl-2 border-l border-[var(--rule-soft)]">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Pend.</span>
            <span className="text-sm font-bold text-[var(--text-primary)] font-mono">{formatCurrency(totalSaldo)}</span>
            <span className="text-[var(--text-tertiary)]">·</span>
            <span className="font-semibold text-[var(--data-success-500)]">{activosCount}</span>
            {vencidosCount > 0 && (
              <>
                <span className="text-[var(--text-tertiary)]">·</span>
                <span className="font-semibold text-[var(--data-error-500)]">{vencidosCount} venc.</span>
              </>
            )}
          </div>
        )}

        <div className="flex-1" />

        <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
          {fiados.length} {fiados.length === 1 ? "resultado" : "resultados"}
        </span>

        <AdminTooltip content="Recargar la lista de fiados">
          <button onClick={fetchFiados} aria-label="Actualizar" className="p-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-sunken)] transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} aria-hidden />
          </button>
        </AdminTooltip>

        <ModuleActionMenu
          label="Opciones"
          items={[
            { label: "Mapa de deudores", icon: MapPin, onClick: () => setShowDebtorsMap(true), description: "Ver ubicacion de quienes te deben" },
            { label: "Lista de cobro", icon: Printer, onClick: handleImprimirListaCobro, description: "Imprimir hoja de ruta diaria" },
            { label: "Exportar deudores", icon: Download, onClick: handleExportarDeudores, description: "Excel con saldos y dias", dividerBefore: true },
          ]}
        />
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Nuevo fiado
        </button>
      </div>}

      {/* Toolbar compacto para tabs Resumen/Análisis (sin buscador, solo acciones). */}
      {activeTab !== "deudores" && (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <AdminTooltip content="Recargar la lista de fiados">
            <button onClick={fetchFiados} aria-label="Actualizar" className="p-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-sunken)] transition-colors">
              <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} aria-hidden />
            </button>
          </AdminTooltip>
          <ModuleActionMenu
            label="Opciones"
            items={[
              { label: "Mapa de deudores", icon: MapPin, onClick: () => setShowDebtorsMap(true), description: "Ver ubicacion de quienes te deben" },
              { label: "Lista de cobro", icon: Printer, onClick: handleImprimirListaCobro, description: "Imprimir hoja de ruta diaria" },
              { label: "Exportar deudores", icon: Download, onClick: handleExportarDeudores, description: "Excel con saldos y dias", dividerBefore: true },
            ]}
          />
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Nuevo fiado
          </button>
        </div>
      )}

      {/* Panel del tab activo */}
      <div
        role="tabpanel"
        id={`fiados-panel-${activeTab}`}
        aria-labelledby={`fiados-tab-${activeTab}`}
        className="space-y-6"
      >
      {/* Stats — pasa `view` para que FiadoStats renderice solo los widgets de cada tab. */}
      <FiadoStats view={activeTab} fiados={fiados} loading={loading} totalSaldo={totalSaldo} tendenciaMorosidad={tendenciaMorosidad} proyeccionCobro={proyeccionCobro} fiadoMasAntiguo={fiadoMasAntiguo} pagosEstaSemana={pagosEstaSemana} mejorPagadorMes={mejorPagadorMes} openDetail={openDetail} search={search} setSearch={setSearch} setSelected={setSelected} statusFilter={statusFilter} setStatusFilter={setStatusFilter} FiadoTendenciaCobro={FiadoTendenciaCobroChart} />

      {/* UX Mejora 20: Density toggle — solo en tab Deudores */}
      {activeTab === "deudores" && <div className="flex items-center gap-1 mb-2">
        <span className="text-xs font-bold text-[var(--text-tertiary)] mr-1">Densidad:</span>
        {(["compact", "normal", "wide"] as const).map(d => (
          <button
            key={d}
            onClick={() => { setTableDensity(d); try { localStorage.setItem("table-density", d); } catch {} }}
            className={cn("px-2 py-0.5 rounded-full text-xs font-bold transition-colors", tableDensity === d ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]")}
          >
            {d === "compact" ? "Compacta" : d === "normal" ? "Normal" : "Amplia"}
          </button>
        ))}
      </div>}

      {/* Table — UX Mejora 18: Sticky header + Mejora 19: Sortable columns — solo tab Deudores */}
      {activeTab === "deudores" && <div className={cn("bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden ", tableDensity === "compact" ? "table-compact" : tableDensity === "wide" ? "table-wide" : "")}>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
            <p className="text-sm text-[var(--data-error-500)]">{error}</p>
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
              {/* ds-ignore-table — caso legítimo: thead clickable con
                  sort indicators, mobile-aware (hidden sm:table-cell),
                  sticky positioning, sr-only labels. DataTable del DS
                  no soporta esta combinación de features (ADR-075). */}
              <table className="w-full min-w-[700px] sm:min-w-0 text-sm">
                <thead className="sticky top-0 bg-white dark:bg-[var(--color-card)] z-10 shadow-[var(--shadow-sm)]">
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
                        className="border-b border-gray-50 hover:bg-[var(--surface-alt)] cursor-pointer transition-colors"
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
                              const avatarColors = ['var(--accent)','#ff6b5b','#e63946','#457b9d','#6b705c','#9b5de5'];
                              let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
                              const color = avatarColors[Math.abs(h) % avatarColors.length];
                              const initials = name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
                              return <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: color }}>{initials}</div>;
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
                        <td className={cn("px-4 py-3 text-right font-bold font-mono", f.status === "PAGADO" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{formatCurrency(f.saldo)}</td>
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
                                const saldo = Number(f.saldo).toFixed(2);
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
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>}
      </div>
      {/* end tabpanel */}

      {/* ── Detail Sheet (side panel) ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <>
            <m.div
              key="sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-backdrop"
              style={{ zIndex: 40 }}
              onClick={() => setSelected(null)}
            />
            <m.div
              key="sheet-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className={cn("fixed inset-y-0 right-0 z-50 w-full bg-white dark:bg-[var(--color-card)] border-l border-[var(--rule-base)] overflow-y-auto transition-all duration-[var(--dur-base)]", isPanelWide ? "max-w-[500px]" : "max-w-md")}
            >
              <div className="p-4 sm:p-6 space-y-5">
                {/* Sheet header — UX Mejora 16: Width toggle */}
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Detalle del fiado</CardTitle>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { const next = !isPanelWide; setIsPanelWide(next); try { localStorage.setItem("panel-width-preference", next ? "wide" : "normal"); } catch {} }}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors hidden sm:flex"
                      title={isPanelWide ? "Panel normal" : "Panel ancho"}
                    >
                      {isPanelWide ? <Minimize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> : <Maximize2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
                    </button>
                    <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
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
                <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-3">
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
                      <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Total</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(selected.total)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Pagado</p>
                      <p className="text-sm font-bold text-[var(--data-success-500)]">{formatCurrency(selected.total - selected.saldo)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase font-bold text-[var(--text-tertiary)]">Saldo</p>
                      <p className="text-sm font-bold text-[var(--data-error-500)]">{formatCurrency(selected.saldo)}</p>
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
                              <DollarSign className="h-3.5 w-3.5 text-[var(--data-success-500)]" />
                            </div>
                            <div className="flex-1 min-w-0 bg-[var(--surface-alt)] rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-bold text-[var(--text-primary)]">{formatCurrency(c.monto)}</p>
                                <StatusBadge variant="success" label="Pagado" size="sm" />
                              </div>
                              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
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
                            setCompromisoMonto(Number(selected.saldo).toFixed(2));
                            const d = new Date(); d.setDate(d.getDate() + 7);
                            setCompromisoFecha(d.toISOString().slice(0, 10));
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold text-primary border-2 border-primary hover:bg-primary hover:text-white transition-colors"
                        >
                          <PenTool className="h-4 w-4" />
                          Compromiso de Pago
                        </button>
                        <a
                          href={`https://wa.me/${selected.customerId.replace(/\D/g, "").startsWith("51") ? selected.customerId.replace(/\D/g, "") : "51" + selected.customerId.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${selected.customerName || selected.customerId}, te recordamos que tienes un pendiente de S/${Number(selected.saldo).toFixed(2)} en Buleje.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#25D366] hover:bg-[#1da851] transition-colors"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Recordar por WhatsApp
                        </a>
                        <button
                          onClick={async () => {
                            // Genera el link público firmado del estado de cuenta
                            // consolidado y lo comparte por WhatsApp (Brandon 2026-06-17).
                            try {
                              const res = await fetch("/api/fiados/statement-link", {
                                method: "POST",
                                headers: csrfHeaders({ "Content-Type": "application/json" }),
                                body: JSON.stringify({ customerId: selected.customerId }),
                              });
                              if (!res.ok) { alert("No se pudo generar el link"); return; }
                              const { url } = (await res.json()) as { url: string };
                              const digits = selected.customerId.replace(/\D/g, "");
                              const wa = digits.startsWith("51") ? digits : "51" + digits;
                              const msg = `Hola ${selected.customerName || ""}, aquí puedes ver tu estado de cuenta completo: ${url}`;
                              window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
                            } catch {
                              alert("Error al generar el link");
                            }
                          }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold text-primary border-2 border-primary hover:bg-primary hover:text-white transition-colors"
                        >
                          <Share2 className="h-4 w-4" />
                          Compartir estado de cuenta
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => window.print()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] transition-colors"
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
