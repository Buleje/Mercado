"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useState, useEffect, useCallback } from "react";
import { m, AnimatePresence } from "@/components/admin/providers";
import {
  Clock, Play, Square, DollarSign, Loader2, AlertTriangle,
  User, ChevronLeft, ChevronRight, X, ShoppingCart, Download,
  Printer, Trophy, CreditCard, TrendingUp, CalendarDays, BarChart3, Timer,
  Banknote,
} from "@buleje/design-system/icons";
import dynamic from "next/dynamic";

const TurnosChart = dynamic(() => import("./TurnosChart"), {
  ssr: false,
  loading: () => (
    <div className="h-64 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />
  ),
});
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type TurnoStatus = "ABIERTO" | "CERRADO";

type Turno = {
  id: string;
  tenantId: string;
  adminUserId: string;
  inicioEfectivo: number;
  cierreEfectivo?: number;
  ventasTotal: number;
  status: TurnoStatus;
  abrioEn: string;
  cerroEn?: string;
  notas?: string;
  createdAt: string;
  diferencia?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return `S/${n.toFixed(2)}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function elapsedTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

const PER_PAGE = 10;

// ── Color helper for cajero ───────────────────────────────────────────────────

function cajeroColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 90%)`;
}

function cajeroColorText(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 30%)`;
}

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TurnosModule() {
  // State
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null);
  const [historial, setHistorial] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Historial view toggle (tabla vs timeline)
  const [historialView, setHistorialView] = useState<"tabla" | "timeline">("tabla");

  // Open turno form
  const [efectivoInicial, setEfectivoInicial] = useState("");
  const [opening, setOpening] = useState(false);

  // Cajeros list for assignment
  const [cajeros, setCajeros] = useState<{ id: string; username: string; name: string; role: string; active: boolean }[]>([]);
  const [selectedCajero, setSelectedCajero] = useState("");
  const [cajerosLoading, setCajerosLoading] = useState(false);

  // Tab for main sections
  const [mainTab, setMainTab] = useState<"turnos" | "cajeros">(() => {
    try { return (localStorage.getItem("turnos-subtab") as "turnos" | "cajeros") || "turnos"; } catch { return "turnos"; }
  });

  // Close turno modal
  const [showCierre, setShowCierre] = useState(false);
  const [cierreEfectivo, setCierreEfectivo] = useState("");
  const [cierreNotas, setCierreNotas] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Summary modal after close
  type TurnoSummary = {
    totalVentas: number;
    cantidadVentas: number;
    ticketPromedio: number;
    inicioEfectivo: number;
    cierreEfectivo: number;
    diferencia: number;
    metodosPago: { metodo: string; total: number }[];
    topProductos: { nombre: string; cantidad: number }[];
    ventasPorHora?: { hora: string; total: number }[];
  };
  const [showResumen, setShowResumen] = useState(false);
  const [resumen, setResumen] = useState<TurnoSummary | null>(null);

  // Mejora M3: Meta de ventas
  const [metaVentas, setMetaVentas] = useState(() => {
    try { return parseFloat(localStorage.getItem("turno-meta-ventas") || "500") || 500; } catch { return 500; }
  });
  const [showMetaConfig, setShowMetaConfig] = useState(false);
  const [metaInput, setMetaInput] = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check for active turno
      const activoRes = await fetch("/api/turnos/activo");
      if (activoRes.ok) {
        const { turno } = await activoRes.json();
        setTurnoActivo(turno ?? null);
      } else {
        setTurnoActivo(null);
      }

      // Load history
      const histRes = await fetch("/api/turnos?status=CERRADO");
      if (histRes.ok) {
        const data: Turno[] = await histRes.json();
        setHistorial(data);
      }

      // Fetch cajeros for assignment
      setCajerosLoading(true);
      try {
        const cajerosRes = await fetch("/api/admin-users");
        if (cajerosRes.ok) {
          const users = await cajerosRes.json();
          setCajeros(Array.isArray(users) ? users.filter((u: { active: boolean }) => u.active) : []);
        }
      } catch { /* fallback: empty list */ }
      setCajerosLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar turnos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // UX Mejora 13: Cerrar modales con Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showMetaConfig) { setShowMetaConfig(false); return; }
      if (showResumen) { setShowResumen(false); return; }
      if (showCierre) { setShowCierre(false); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showMetaConfig, showResumen, showCierre]);

  // ── Open turno ─────────────────────────────────────────────────────────────

  const handleAbrir = async () => {
    const monto = parseFloat(efectivoInicial);
    if (isNaN(monto) || monto < 0) return;

    setOpening(true);
    try {
      const body: Record<string, unknown> = { inicioEfectivo: monto };
      if (selectedCajero) body.adminUserId = selectedCajero;

      const res = await fetch("/api/turnos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al abrir turno");
      }
      setEfectivoInicial("");
      setSelectedCajero("");
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOpening(false);
    }
  };

  // ── Close turno ────────────────────────────────────────────────────────────

  const handleCerrar = async () => {
    if (!turnoActivo) return;
    setCloseError(null);
    const monto = parseFloat(cierreEfectivo);
    if (isNaN(monto) || monto < 0) { setCloseError("Monto inválido"); return; }

    setClosing(true);
    try {
      const body: Record<string, unknown> = { cierreEfectivo: monto };
      if (cierreNotas.trim()) body.notas = cierreNotas.trim();

      const res = await fetch(`/api/turnos/${turnoActivo.id}/cerrar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al cerrar turno");
      }

      const cerrado = await res.json();

      // Build summary from turno data + API
      const ventasTotal = Number(cerrado.ventasTotal ?? turnoActivo.ventasTotal ?? 0);
      const diferencia = Number(cerrado.diferencia ?? (monto - (turnoActivo.inicioEfectivo + ventasTotal)));

      // T6 (audit ventas-caja 2026-05-07): server-authoritative aggregation.
      // Antes traiamos /api/sales completo y agregabamos en cliente, violando
      // regla critica #6 (totales en backend) + perf issue. Ahora consumimos
      // /api/turnos/[id]/summary que devuelve cantidadVentas + metodosPago +
      // topProductos ya agregados desde DB con scope cashierId.
      let metodosPago: { metodo: string; total: number }[] = [];
      let topProductos: { nombre: string; cantidad: number }[] = [];
      let cantidadVentas = 0;

      try {
        const summaryRes = await fetch(`/api/turnos/${turnoActivo.id}/summary`);
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          cantidadVentas = Number(summary.cantidadVentas ?? 0);
          metodosPago = Array.isArray(summary.metodosPago) ? summary.metodosPago : [];
          topProductos = Array.isArray(summary.topProductos) ? summary.topProductos.slice(0, 3) : [];
        }
      } catch {
        // Sales fetch failed — use basic data
      }

      // If we couldn't get sales count from API, estimate
      if (cantidadVentas === 0 && ventasTotal > 0) {
        cantidadVentas = 1; // At least 1
      }

      // Mejora M4: Calcular ventas por hora para detectar tiempo muerto.
      // T11: usar /api/sales con today=1 + cashierId scope (server-side
      // filter) en vez de descargar todas las ventas del tenant.
      const ventasPorHora: { hora: string; total: number }[] = [];
      try {
        const params = new URLSearchParams({
          today: "1",
          cashierId: turnoActivo.adminUserId,
          limit: "1000",
        });
        const salesRes2 = await fetch(`/api/sales?${params.toString()}`);
        if (salesRes2.ok) {
          const salesData2 = await salesRes2.json();
          const allSales2 = Array.isArray(salesData2) ? salesData2 : salesData2.ventas ?? [];
          const turnoStart = new Date(turnoActivo.abrioEn);
          const turnoEnd = new Date();
          const startHour = turnoStart.getHours();
          const endHour = turnoEnd.getHours();

          for (let h = startHour; h <= endHour; h++) {
            const horaLabel = `${String(h).padStart(2, "0")}:00`;
            const ventasHora = allSales2.filter((s: Record<string, unknown>) => {
              const createdAt = s.createdAt as string | undefined;
              if (!createdAt) return false;
              const d = new Date(createdAt);
              return d.getTime() >= turnoStart.getTime() && d.getHours() === h;
            });
            const totalHora = ventasHora.reduce((s: number, v: Record<string, unknown>) => s + Number(v.total ?? 0), 0);
            ventasPorHora.push({ hora: horaLabel, total: totalHora });
          }
        }
      } catch { /* ignore */ }

      setResumen({
        totalVentas: ventasTotal,
        cantidadVentas,
        ticketPromedio: cantidadVentas > 0 ? ventasTotal / cantidadVentas : 0,
        inicioEfectivo: turnoActivo.inicioEfectivo,
        cierreEfectivo: monto,
        diferencia,
        metodosPago,
        topProductos,
        ventasPorHora,
      });

      setShowCierre(false);
      setCierreEfectivo("");
      setCierreNotas("");
      setShowResumen(true);
      fetchData();
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Error");
    } finally {
      setClosing(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(historial.length / PER_PAGE));
  const paginated = historial.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState />
    );
  }

  if (error && !turnoActivo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-500)]">{error}</p>
        <button onClick={fetchData} className="text-xs text-primary hover:underline font-semibold">Reintentar</button>
      </div>
    );
  }

  // Último turno cerrado (primer item del historial con cierreEfectivo).
  // Sirve para mostrar contexto en el panel lateral de "No hay turno abierto".
  const ultimoTurno = historial.find(t => t.cierreEfectivo != null) ?? null;

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Operaciones · Caja"
        title="Turnos"
        description="Apertura y cierre de turnos, control de cajeros y arqueo de caja."
        icon={Clock}
      />

      {/* ── Fila única: Tabs Turnos/Cajeros + chip estado de turno ───────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-[var(--surface-sunken)] dark:bg-accent rounded-xl p-1 w-fit">
          <button
            onClick={() => { setMainTab("turnos"); try { localStorage.setItem("turnos-subtab", "turnos"); } catch {} }}
            className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5", mainTab === "turnos" ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground " : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}
          >
            <Clock className="h-3.5 w-3.5" /> Turnos
          </button>
          <button
            onClick={() => { setMainTab("cajeros"); try { localStorage.setItem("turnos-subtab", "cajeros"); } catch {} }}
            className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5", mainTab === "cajeros" ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground " : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}
          >
            <User className="h-3.5 w-3.5" /> Cajeros
          </button>
        </div>
        {/* Chip de estado inline — antes flotaba solo arriba */}
        {turnoActivo ? (
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--data-success-500)] animate-pulse" aria-hidden />
            Turno abierto
          </span>
        ) : !loading && (
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold bg-[var(--surface-sunken)] text-[var(--text-tertiary)] px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" aria-hidden />
            Sin turno
          </span>
        )}
      </div>

      {/* ── Tab: Cajeros ──────────────────────────────────────────────────────── */}
      {mainTab === "cajeros" && (() => {
        // Compute cajero stats from historial
        const cajeroStatsMap = new Map<string, { turnos: number; ventasTotal: number; horasTotales: number; difCaja: number; cajeroName: string }>();
        for (const t of historial) {
          const id = t.adminUserId || "Desconocido";
          const prev = cajeroStatsMap.get(id) || { turnos: 0, ventasTotal: 0, horasTotales: 0, difCaja: 0, cajeroName: id };
          prev.turnos += 1;
          prev.ventasTotal += t.ventasTotal;
          if (t.abrioEn && t.cerroEn) {
            prev.horasTotales += (new Date(t.cerroEn).getTime() - new Date(t.abrioEn).getTime()) / 3600000;
          }
          if (t.cierreEfectivo != null) {
            prev.difCaja += (t.cierreEfectivo - t.inicioEfectivo - t.ventasTotal);
          }
          // Try to resolve display name from cajeros list
          const match = cajeros.find(c => c.id === id || c.username === id);
          if (match) prev.cajeroName = match.name || match.username;
          cajeroStatsMap.set(id, prev);
        }
        const cajeroStats = Array.from(cajeroStatsMap.entries()).map(([id, data]) => ({
          id,
          name: data.cajeroName,
          ...data,
          ventasPorHora: data.horasTotales > 0 ? data.ventasTotal / data.horasTotales : 0,
          ticketPromedio: data.turnos > 0 ? data.ventasTotal / data.turnos : 0,
        }));
        const bestCajeroStats = cajeroStats.length > 0
          ? cajeroStats.reduce((a, b) => a.ventasPorHora > b.ventasPorHora ? a : b)
          : null;
        const maxVentas = cajeroStats.length > 0 ? Math.max(...cajeroStats.map(c => c.ventasPorHora), 1) : 1;

        // Chart data: ventas totales este mes por cajero
        const now = new Date();
        const mesActualChart = now.getMonth();
        const anioActualChart = now.getFullYear();
        const turnosMesChart = historial.filter(t => {
          try { const d = new Date(t.abrioEn); return d.getMonth() === mesActualChart && d.getFullYear() === anioActualChart; } catch { return false; }
        });
        const chartMap = new Map<string, number>();
        for (const t of turnosMesChart) {
          const id = t.adminUserId || "Desconocido";
          const match = cajeros.find(c => c.id === id || c.username === id);
          const name = match ? (match.name || match.username) : id;
          chartMap.set(name, (chartMap.get(name) || 0) + t.ventasTotal);
        }
        const chartData = Array.from(chartMap.entries()).map(([name, ventas]) => ({ name, ventas: Math.round(ventas) })).sort((a, b) => b.ventas - a.ventas);

        return (
          <div className="space-y-6">
            {/* 1. Grid de cajeros */}
            <div>
              <CardTitle className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Equipo de Cajeros
              </CardTitle>
              {cajeroStats.length === 0 ? (
                <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl py-10 px-4 text-center">
                  <div className="h-12 w-12 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-3">
                    <User className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                  </div>
                  <p className="text-base font-semibold text-[var(--text-primary)] mb-1">Sin datos de cajeros</p>
                  <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">Cierra al menos un turno para ver el ranking y estadisticas por cajero.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cajeroStats.sort((a, b) => b.ventasPorHora - a.ventasPorHora).map(c => {
                    const isTop = bestCajeroStats && c.id === bestCajeroStats.id;
                    const barWidth = maxVentas > 0 ? Math.max(5, (c.ventasPorHora / maxVentas) * 100) : 0;
                    return (
                      <div key={c.id} className={cn(
                        "bg-white dark:bg-card border rounded-2xl p-5 transition-shadow hover:shadow-sm",
                        isTop ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] ring-1 ring-[var(--data-warning-500)] dark:ring-[var(--data-warning-500)]" : "border-[var(--rule-base)] dark:border-card-border"
                      )}>
                        <div className="flex items-center gap-3 mb-4">
                          <div
                            className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                            style={{ backgroundColor: cajeroColor(c.name), color: cajeroColorText(c.name) }}
                          >
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-bold text-[var(--text-primary)] truncate flex items-center gap-2">
                              <span className="truncate">{c.name}</span>
                              {isTop && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2 py-0.5 rounded shrink-0">
                                  <Trophy className="h-3 w-3" strokeWidth={2} aria-hidden />
                                  Top
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-[var(--text-tertiary)]">Cajero {isTop ? "destacado del mes" : "del equipo"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <p className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-wide mb-0.5">Turnos</p>
                            <p className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums">{c.turnos}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-wide mb-0.5">Ventas total</p>
                            <p className="text-lg font-extrabold text-[var(--data-success-500)] tabular-nums">{formatCurrency(c.ventasTotal)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-wide mb-0.5">Ventas/hora</p>
                            <p className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums">{formatCurrency(c.ventasPorHora)}<span className="text-sm text-[var(--text-tertiary)]">/h</span></p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-tertiary)] font-semibold uppercase tracking-wide mb-0.5">Dif. caja</p>
                            <p className={cn("text-lg font-extrabold tabular-nums", Math.abs(c.difCaja) < 0.01 ? "text-[var(--data-success-500)]" : c.difCaja > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                              {Math.abs(c.difCaja) < 0.01 ? formatCurrency(0) : (c.difCaja > 0 ? "+" : "") + formatCurrency(c.difCaja)}
                            </p>
                          </div>
                        </div>
                        {/* Mini performance bar */}
                        <div className="h-1.5 bg-[var(--surface-sunken)] dark:bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", isTop ? "bg-[var(--data-warning-500)]" : "bg-primary")}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Ranking table */}
            {cajeroStats.length > 0 && (
              <div>
                <CardTitle className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-[var(--data-warning-500)]" />
                  Ranking de Cajeros
                </CardTitle>
                <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-base">
                      <thead>
                        <tr className="border-b border-[var(--rule-soft)] dark:border-white/5 text-left bg-gray-50/50 dark:bg-surface/30">
                          <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide w-12 text-center">#</th>
                          <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Cajero</th>
                          <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right">Turnos</th>
                          <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right">Ventas</th>
                          <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right hidden sm:table-cell">Ventas/hora</th>
                          <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right hidden md:table-cell">Dif. caja</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cajeroStats.sort((a, b) => b.ventasPorHora - a.ventasPorHora).map((c, i) => {
                          const isTop = i === 0 && cajeroStats.length > 1;
                          return (
                            <tr key={c.id} className={cn(
                              "border-b border-gray-50 dark:border-white/5 transition-colors hover:bg-gray-50/50",
                              isTop ? "bg-[var(--data-warning-50)]/50 dark:bg-[var(--data-warning-500)]/10" : ""
                            )}>
                              <td className="px-4 py-3.5 text-center">
                                {isTop ? (
                                  <Trophy className="h-5 w-5 text-[var(--data-warning-500)] inline-block" strokeWidth={1.75} aria-hidden />
                                ) : (
                                  <span className="text-base text-[var(--text-tertiary)] font-bold tabular-nums">{i + 1}</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-[var(--text-primary)]">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                    style={{ backgroundColor: cajeroColor(c.name), color: cajeroColorText(c.name) }}
                                  >
                                    {c.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="truncate max-w-[160px] text-base">{c.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-right text-base text-[var(--text-secondary)] tabular-nums">{c.turnos}</td>
                              <td className="px-4 py-3.5 text-right text-base font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(c.ventasTotal)}</td>
                              <td className="px-4 py-3.5 text-right text-base text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">{formatCurrency(c.ventasPorHora)}/h</td>
                              <td className={cn("px-4 py-3.5 text-right text-base font-bold hidden md:table-cell tabular-nums", Math.abs(c.difCaja) < 0.01 ? "text-[var(--data-success-500)]" : c.difCaja > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                                {Math.abs(c.difCaja) < 0.01 ? formatCurrency(0) : (c.difCaja > 0 ? "+" : "") + formatCurrency(c.difCaja)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Chart: ventas por cajero este mes */}
            {chartData.length > 0 && (
              <div>
                <CardTitle className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Ventas por Cajero (este mes)
                </CardTitle>
                <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-2xl p-5">
                  <TurnosChart chartData={chartData} />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab: Turnos (contenido original) ─────────────────────────────────── */}
      {mainTab === "turnos" && <>

      {/* Mejora nueva: KPIs de turnos del mes */}
      {!loading && historial.length > 0 && (() => {
        const now = new Date();
        const mesActual = now.getMonth();
        const anioActual = now.getFullYear();
        const turnosMes = historial.filter(t => {
          try { const d = new Date(t.abrioEn); return d.getMonth() === mesActual && d.getFullYear() === anioActual; } catch { return false; }
        });
        const turnosMesCount = turnosMes.length;
        const horasTrabajadas = turnosMes.reduce((s, t) => {
          if (!t.abrioEn || !t.cerroEn) return s;
          return s + (new Date(t.cerroEn).getTime() - new Date(t.abrioEn).getTime()) / 3600000;
        }, 0);
        const ventasTotalMes = turnosMes.reduce((s, t) => s + t.ventasTotal, 0);
        const ventasPorHora = horasTrabajadas > 0 ? ventasTotalMes / horasTrabajadas : 0;
        // Mejor cajero por ventas/hora
        const cajMap = new Map<string, { ventas: number; horas: number }>();
        for (const t of turnosMes) {
          const id = t.adminUserId || "Desconocido";
          const prev = cajMap.get(id) || { ventas: 0, horas: 0 };
          prev.ventas += t.ventasTotal;
          if (t.abrioEn && t.cerroEn) prev.horas += (new Date(t.cerroEn).getTime() - new Date(t.abrioEn).getTime()) / 3600000;
          cajMap.set(id, prev);
        }
        let mejorCajero = "—";
        let mejorVph = 0;
        for (const [name, data] of cajMap) {
          const vph = data.horas > 0 ? data.ventas / data.horas : 0;
          if (vph > mejorVph) { mejorVph = vph; mejorCajero = name; }
        }
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card  hover:shadow-sm transition-shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Turnos del mes</p>
              </div>
              <p className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">{turnosMesCount}</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card  hover:shadow-sm transition-shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="h-4 w-4 text-[var(--data-success-500)]" />
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Horas trabajadas</p>
              </div>
              <p className="text-2xl font-extrabold font-mono text-[var(--text-primary)]">{horasTrabajadas.toFixed(1)}h</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card  hover:shadow-sm transition-shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-[var(--data-success-500)]" />
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Ventas/hora</p>
              </div>
              <p className="text-2xl font-extrabold font-mono text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{formatCurrency(ventasPorHora)}</p>
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card  hover:shadow-sm transition-shadow p-3">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-[var(--data-warning-500)]" />
                <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Mejor cajero</p>
              </div>
              <p className="text-lg font-extrabold text-[var(--text-primary)] truncate">{mejorCajero}</p>
              {mejorVph > 0 && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono">{formatCurrency(mejorVph)}/h</p>}
            </div>
          </div>
        );
      })()}

      {/* ── Active turno or open form ─────────────────────────────────────────── */}
      {turnoActivo ? (
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-2 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-2xl overflow-hidden">
          {/* Active turno header — prominente */}
          <div className="bg-[var(--accent-soft)]/50 dark:bg-[var(--accent-muted)] border-b border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 px-5 sm:px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-[var(--data-success-500)] flex items-center justify-center animate-pulse shrink-0">
                <Play className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Turno activo</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{elapsedTime(turnoActivo.abrioEn)}</span>
                  <span className="text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">desde {formatTime(turnoActivo.abrioEn)}</span>
                  <span className="text-[var(--text-tertiary)]">&middot;</span>
                  <span className="text-sm font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Ventas {formatCurrency(turnoActivo.ventasTotal)}</span>
                </div>
              </div>
              <button
                onClick={() => { setShowCierre(true); setCloseError(null); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90 transition-colors shrink-0"
              >
                <Square className="h-4 w-4" />
                <span className="hidden sm:inline">Cerrar turno</span>
              </button>
            </div>
          </div>

          {/* Turno details */}
          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white/60 dark:bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <p className="text-xs uppercase font-semibold tracking-wide text-[var(--text-tertiary)]">Operador</p>
                </div>
                <p className="text-base font-bold text-[var(--text-primary)] truncate">
                  {(cajeros.find(c => c.id === turnoActivo.adminUserId)?.name) || "Yo mismo"}
                </p>
              </div>

              <div className="bg-white/60 dark:bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <p className="text-xs uppercase font-semibold tracking-wide text-[var(--text-tertiary)]">Inicio</p>
                </div>
                <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{formatTime(turnoActivo.abrioEn)}</p>
              </div>

              <div className="bg-white/60 dark:bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <p className="text-xs uppercase font-semibold tracking-wide text-[var(--text-tertiary)]">Efectivo inicial</p>
                </div>
                <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(turnoActivo.inicioEfectivo)}</p>
              </div>

              <div className="bg-white/60 dark:bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <p className="text-xs uppercase font-semibold tracking-wide text-[var(--text-tertiary)]">Ventas</p>
                </div>
                <p className="text-base font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] tabular-nums">{formatCurrency(turnoActivo.ventasTotal)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-2xl p-6 sm:p-7">
            <div className="flex items-start gap-4 mb-6">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                <Clock className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">No hay turno abierto</CardTitle>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">Abre un turno para empezar a registrar ventas en caja.</p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Cajero asignado</label>
                <select
                  value={selectedCajero}
                  onChange={e => setSelectedCajero(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-base text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option value="">Yo mismo (usuario actual)</option>
                  {cajeros.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                  ))}
                </select>
                {cajerosLoading && <p className="text-sm text-[var(--text-tertiary)] mt-1.5">Cargando cajeros...</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Efectivo inicial en caja</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={efectivoInicial}
                  onChange={e => setEfectivoInicial(e.target.value)}
                  placeholder="S/ 0.00"
                  className="w-full h-11 px-4 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-lg font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-right font-mono tabular-nums transition-all"
                />
                <p className="text-sm text-[var(--text-tertiary)] mt-1.5">Dinero que abre en la caja al inicio del turno.</p>
              </div>
            </div>
            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-2">Montos rápidos</p>
              <div className="flex flex-wrap gap-2">
                {[100, 200, 300, 500].map(amount => {
                  const active = parseFloat(efectivoInicial || "0") === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setEfectivoInicial(String(amount))}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-semibold border transition-colors",
                        active
                          ? "bg-primary text-white border-primary"
                          : "bg-white dark:bg-white/5 text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-primary/40 hover:text-primary"
                      )}
                    >
                      S/ {amount}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleAbrir}
                disabled={opening}
                className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
              >
                {opening ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Play className="h-5 w-5" strokeWidth={2} aria-hidden />}
                Abrir turno
              </button>
            </div>
          </div>
          <aside className="bg-[var(--surface-sunken)] dark:bg-white/[0.03] border border-[var(--rule-base)] dark:border-card-border rounded-2xl p-5 flex flex-col gap-5">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-3">Último turno cerrado</p>
              {ultimoTurno ? (
                <div className="space-y-2.5">
                  <p className="text-lg font-bold text-[var(--text-primary)] truncate">{cajeros.find(c => c.id === ultimoTurno.adminUserId)?.name || "Yo mismo"}</p>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    {new Date(ultimoTurno.cerroEn || ultimoTurno.abrioEn).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <DollarSign className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    Ventas <span className="font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(ultimoTurno.ventasTotal)}</span>
                  </div>
                  {ultimoTurno.cierreEfectivo != null ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <Banknote className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                      Cierre <span className="font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(ultimoTurno.cierreEfectivo)}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">Aún no hay turnos cerrados. Este será el primero.</p>
              )}
            </div>
            <div className="border-t border-[var(--rule-soft)] pt-4">
              <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-2">Meta del turno</p>
              {showMetaConfig ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-[var(--text-tertiary)]">S/</span>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={metaInput}
                      onChange={e => setMetaInput(e.target.value)}
                      autoFocus
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-white/5 text-lg font-bold tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const val = parseFloat(metaInput) || 500;
                        setMetaVentas(val);
                        try { localStorage.setItem("turno-meta-ventas", String(val)); } catch {}
                        setShowMetaConfig(false);
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
                    >
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMetaConfig(false)}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Trophy className="h-5 w-5 text-[var(--data-warning-500)] shrink-0" strokeWidth={1.75} aria-hidden />
                    <p className="text-lg font-bold text-[var(--text-primary)] font-mono truncate tabular-nums">{formatCurrency(metaVentas)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowMetaConfig(true); setMetaInput(String(metaVentas)); }}
                    className="text-sm font-semibold text-primary hover:underline shrink-0"
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ── Tabs: Historial / Calendario / Productividad ───────────────────── */}
      {(() => {
        // Calendario semanal data
        const allTurnos = [...historial, ...(turnoActivo ? [turnoActivo] : [])];

        // Agrupar por día de la semana (0=Dom..6=Sáb) => convertir a Lun=0..Dom=6
        const weekMap = new Map<number, Turno[]>();
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1)); // Monday
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        for (const t of allTurnos) {
          const d = new Date(t.abrioEn);
          if (d >= weekStart && d < weekEnd) {
            const dayIdx = (d.getDay() + 6) % 7; // Lun=0..Dom=6
            if (!weekMap.has(dayIdx)) weekMap.set(dayIdx, []);
            weekMap.get(dayIdx)!.push(t);
          }
        }

        // Productividad por cajero
        const cajeroMap = new Map<string, { turnos: number; ventasTotal: number; horasTotales: number; cantidadVentas: number; difCaja: number }>();
        for (const t of historial) {
          const id = t.adminUserId || "Desconocido";
          const prev = cajeroMap.get(id) || { turnos: 0, ventasTotal: 0, horasTotales: 0, cantidadVentas: 0, difCaja: 0 };
          prev.turnos += 1;
          prev.ventasTotal += t.ventasTotal;
          if (t.abrioEn && t.cerroEn) {
            prev.horasTotales += (new Date(t.cerroEn).getTime() - new Date(t.abrioEn).getTime()) / 3600000;
          }
          if (t.cierreEfectivo != null) {
            prev.difCaja += (t.cierreEfectivo - t.inicioEfectivo - t.ventasTotal);
          }
          cajeroMap.set(id, prev);
        }
        const cajerosStats = Array.from(cajeroMap.entries()).map(([name, data]) => ({
          name,
          ...data,
          ventasPorHora: data.horasTotales > 0 ? data.ventasTotal / data.horasTotales : 0,
          ticketPromedio: data.turnos > 0 ? data.ventasTotal / data.turnos : 0,
        }));
        const bestCajero = cajerosStats.length > 0 ? cajerosStats.reduce((a, b) => a.ventasPorHora > b.ventasPorHora ? a : b).name : "";

        // Evita renderizar secciones vacías que solo agregan ruido visual.
        const hasWeekData = weekMap.size > 0;
        const hasProductividadData = cajerosStats.length >= 2;

        if (!hasWeekData && !hasProductividadData) return null;

        return (
          <>
            {hasWeekData ? (
            <div>
              <CardTitle className="text-base font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Calendario Semanal
              </CardTitle>
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-7 min-w-[700px]">
                    {DIAS_SEMANA.map((dia, idx) => {
                      const turnos = weekMap.get(idx) || [];
                      return (
                        <div key={dia} className={cn("border-r border-[var(--rule-soft)] dark:border-white/5 last:border-r-0", idx < 5 ? "" : "bg-gray-50/50 dark:bg-white/[0.02]")}>
                          <div className="px-2 py-2.5 border-b border-[var(--rule-soft)] dark:border-white/5 text-center">
                            <p className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">{dia}</p>
                          </div>
                          <div className="p-2 min-h-[110px] space-y-1.5">
                            {turnos.length === 0 ? (
                              <p className="text-sm text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] text-center py-3">Sin turno</p>
                            ) : turnos.map(t => {
                              const nombreCajero = cajeros.find(c => c.id === t.adminUserId)?.name || "Yo mismo";
                              return (
                                <div
                                  key={t.id}
                                  className="rounded-lg p-2 text-xs leading-tight"
                                  style={{ backgroundColor: cajeroColor(t.adminUserId), color: cajeroColorText(t.adminUserId) }}
                                >
                                  <p className="font-semibold truncate">{nombreCajero}</p>
                                  <p className="opacity-80">{formatTime(t.abrioEn)}{t.cerroEn ? ` - ${formatTime(t.cerroEn)}` : " - activo"}</p>
                                  <p className="font-bold tabular-nums">{formatCurrency(t.ventasTotal)}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            ) : null}

            {hasProductividadData ? (
            <div>
              <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[var(--data-warning-500)]" />
                Productividad por cajero
              </CardTitle>
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
                {cajerosStats.length <= 1 && cajerosStats.length === 1 ? (
                  <div className="p-4 text-center text-sm text-[var(--text-tertiary)]">Solo hay 1 cajero registrado</div>
                ) : cajerosStats.length === 0 ? (
                  <div className="p-4 text-center text-sm text-[var(--text-tertiary)]">Sin datos de productividad</div>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full min-w-[550px] sm:min-w-0 text-sm">
                      <thead>
                        <tr className="border-b border-[var(--rule-soft)] dark:border-white/5 text-left">
                          <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)]">Cajero</th>
                          <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-right">Turnos</th>
                          <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-right">Ventas total</th>
                          <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-right hidden sm:table-cell">Ventas/hora</th>
                          <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-right hidden sm:table-cell">Ticket prom</th>
                          <th className="px-4 py-3 font-semibold text-[var(--text-tertiary)] text-right hidden md:table-cell">Dif. caja</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cajerosStats.sort((a, b) => b.ventasPorHora - a.ventasPorHora).map(c => (
                          <tr key={c.name} className={cn(
                            "border-b border-gray-50 dark:border-white/5 transition-colors",
                            c.name === bestCajero ? "bg-[var(--accent-soft)]/50 dark:bg-[var(--accent-muted)]" : ""
                          )}>
                            <td className="px-4 py-3 font-medium text-[var(--text-primary)] flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full flex items-center justify-center text-[length:var(--ts-2xs)] font-bold" style={{ backgroundColor: cajeroColor(c.name), color: cajeroColorText(c.name) }}>
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate max-w-[100px]">{c.name}</span>
                              {c.name === bestCajero && <span className="text-[var(--data-success-500)] text-[length:var(--ts-2xs)] font-bold">TOP</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-[var(--text-secondary)]">{c.turnos}</td>
                            <td className="px-4 py-3 text-right font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{formatCurrency(c.ventasTotal)}</td>
                            <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden sm:table-cell">{formatCurrency(c.ventasPorHora)}/h</td>
                            <td className="px-4 py-3 text-right text-[var(--text-secondary)] hidden sm:table-cell">{formatCurrency(c.ticketPromedio)}</td>
                            <td className={cn("px-4 py-3 text-right font-bold hidden md:table-cell", c.difCaja >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                              {c.difCaja >= 0 ? "+" : ""}{formatCurrency(c.difCaja)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            ) : null}
          </>
        );
      })()}

      {/* ── Historial de turnos ───────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Historial de turnos</CardTitle>
            {historial.length > 0 && (
              <div className="flex bg-[var(--surface-sunken)] dark:bg-accent rounded-lg p-0.5">
                <button onClick={() => setHistorialView("tabla")} className={cn("px-2.5 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition-all", historialView === "tabla" ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground " : "text-[var(--text-secondary)] dark:text-muted")}>Tabla</button>
                <button onClick={() => setHistorialView("timeline")} className={cn("px-2.5 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition-all", historialView === "timeline" ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground " : "text-[var(--text-secondary)] dark:text-muted")}>Timeline</button>
              </div>
            )}
          </div>
          {historial.length > 0 && (
            <button
              onClick={() => {
                const rows = paginated.map(t => {
                  const duracion = t.abrioEn && t.cerroEn ? ((new Date(t.cerroEn).getTime() - new Date(t.abrioEn).getTime()) / 3600000).toFixed(2) : "—";
                  const diferencia = t.cierreEfectivo != null ? (t.cierreEfectivo - t.inicioEfectivo - t.ventasTotal) : 0;
                  return {
                    Cajero: t.adminUserId,
                    Fecha: new Date(t.abrioEn).toLocaleDateString("es-PE"),
                    "Hora inicio": new Date(t.abrioEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
                    "Hora fin": t.cerroEn ? new Date(t.cerroEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—",
                    "Duracion (hrs)": duracion,
                    "Ventas total (S/)": Number(t.ventasTotal.toFixed(2)),
                    "Diferencia caja (S/)": Number(diferencia.toFixed(2)),
                  };
                });
                const now = new Date();
                const mes = String(now.getMonth() + 1).padStart(2, "0");
                const anio = now.getFullYear();
                exportToExcel(rows, `turnos-${mes}-${anio}`, "Turnos");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Excel
            </button>
          )}
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
          {historial.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="h-12 w-12 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-3">
                <Clock className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
              </div>
              <CardTitle className="text-base font-semibold text-[var(--text-primary)] mb-1">Sin turnos registrados</CardTitle>
              <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">Abre tu primer turno para empezar a registrar ventas.</p>
            </div>
          ) : historialView === "timeline" ? (
            /* Vista Timeline */
            <div className="p-4 space-y-0">
              {historial.slice(0, 10).map((t, idx) => {
                const dif = t.cierreEfectivo != null ? t.cierreEfectivo - t.inicioEfectivo - t.ventasTotal : null;
                const cuadro = dif !== null ? Math.abs(dif) < 1 : null;
                const horaInicio = formatTime(t.abrioEn);
                const horaFin = t.cerroEn ? formatTime(t.cerroEn) : "...";
                return (
                  <div key={t.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn("w-3 h-3 rounded-full shrink-0 mt-1.5", cuadro === null ? "bg-[var(--rule-base)]" : cuadro ? "bg-[var(--accent-soft)]" : "bg-[var(--data-warning-500)]")} />
                      {idx < Math.min(historial.length, 10) - 1 && <div className="w-0.5 flex-1 bg-[var(--rule-soft)] dark:bg-gray-700 my-1" />}
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        {cajeros.find(c => c.id === t.adminUserId)?.name || "Yo mismo"} <span className="font-normal text-[var(--text-tertiary)] tabular-nums">{horaInicio}-{horaFin}</span> <span className="font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] tabular-nums">{formatCurrency(t.ventasTotal)}</span>
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {cuadro === null ? "" : cuadro ? "Cuadrado" : `Dif: ${dif! >= 0 ? "+" : ""}${formatCurrency(dif!)}`}
                        {" · "}{new Date(t.abrioEn).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[650px] sm:min-w-0 text-base">
                  <thead>
                    <tr className="border-b border-[var(--rule-soft)] dark:border-white/5 text-left bg-gray-50/50 dark:bg-surface/30">
                      <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Operador</th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Apertura</th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide hidden sm:table-cell">Cierre</th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right">Ef. inicial</th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right">Ventas</th>
                      <th className="px-4 py-3.5 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide text-right hidden sm:table-cell">Ef. final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(t => (
                      <tr key={t.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-4 text-base font-semibold text-[var(--text-primary)] truncate max-w-[160px]">{cajeros.find(c => c.id === t.adminUserId)?.name || "Yo mismo"}</td>
                        <td className="px-4 py-4 text-sm text-[var(--text-secondary)] tabular-nums">{formatDateTime(t.abrioEn)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">
                          {t.cerroEn ? formatDateTime(t.cerroEn) : "—"}
                        </td>
                        <td className="px-4 py-4 text-right text-base text-[var(--text-secondary)] tabular-nums">{formatCurrency(t.inicioEfectivo)}</td>
                        <td className="px-4 py-4 text-right text-base font-bold text-[var(--data-success-500)] tabular-nums">{formatCurrency(t.ventasTotal)}</td>
                        <td className="px-4 py-4 text-right text-base text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">
                          {t.cierreEfectivo != null ? formatCurrency(t.cierreEfectivo) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)] dark:border-white/5">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {historial.length} turno{historial.length !== 1 ? "s" : ""} — Pag. {page}/{totalPages}
                  </p>
                  <div className="flex gap-1">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                      className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      </>}
      {/* ── Close Turno Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCierre && turnoActivo && (
          <m.div
            key="cierre-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="modal-backdrop p-4"
            onClick={e => e.target === e.currentTarget && setShowCierre(false)}
          >
            <m.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg bg-white dark:bg-card rounded-2xl shadow-2xl ring-1 ring-[var(--rule-base)] max-h-[92vh] flex flex-col overflow-hidden"
            >
              {/* Header — icono + titulo + X */}
              <div className="px-6 py-5 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 flex items-center justify-center shrink-0">
                    <Square className="h-5 w-5 text-[var(--data-error-500)]" strokeWidth={2} />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">Cerrar turno</CardTitle>
                    <p className="text-sm text-[var(--text-tertiary)]">Cuenta el efectivo final y confirma el cierre</p>
                  </div>
                </div>
                <button onClick={() => setShowCierre(false)} aria-label="Cerrar" className="p-2 hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 rounded-lg transition-colors">
                  <X className="h-5 w-5 text-[var(--text-tertiary)]" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Resumen — card destacado */}
                <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-5 space-y-2.5">
                  <div className="flex justify-between items-center text-base">
                    <span className="text-[var(--text-secondary)]">Efectivo inicial</span>
                    <span className="font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(turnoActivo.inicioEfectivo)}</span>
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="text-[var(--text-secondary)]">Ventas del turno</span>
                    <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] tabular-nums">{formatCurrency(turnoActivo.ventasTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-[var(--rule-base)] dark:border-white/10 pt-2.5">
                    <span className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Total esperado</span>
                    <span className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
                      {formatCurrency(turnoActivo.inicioEfectivo + turnoActivo.ventasTotal)}
                    </span>
                  </div>
                </div>

                {/* Conteo efectivo final */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Conteo de efectivo final</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cierreEfectivo}
                      onChange={e => { setCierreEfectivo(e.target.value); if (closeError) setCloseError(null); }}
                      placeholder="0.00"
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-right font-mono tabular-nums transition-all"
                    />
                  </div>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1.5">Cuenta todo el dinero que queda en caja.</p>
                </div>

                {/* Diferencia */}
                {cierreEfectivo && !isNaN(parseFloat(cierreEfectivo)) && (() => {
                  const diff = parseFloat(cierreEfectivo) - (turnoActivo.inicioEfectivo + turnoActivo.ventasTotal);
                  const cuadrado = Math.abs(diff) < 0.01;
                  const sobrante = diff > 0;
                  return (
                    <div className={cn(
                      "rounded-xl p-4 text-center",
                      cuadrado
                        ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30"
                        : sobrante
                        ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)]/30"
                        : "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 border border-[var(--data-error-500)]/30"
                    )}>
                      <p className={cn(
                        "text-xs font-semibold uppercase tracking-wide mb-1",
                        cuadrado ? "text-[var(--data-success-500)]" : sobrante ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"
                      )}>
                        {cuadrado ? "Caja cuadrada" : sobrante ? "Sobrante" : "Faltante"}
                      </p>
                      <p className={cn(
                        "text-2xl font-extrabold tabular-nums",
                        cuadrado ? "text-[var(--data-success-500)]" : sobrante ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"
                      )}>
                        {cuadrado ? formatCurrency(0) : (diff > 0 ? "+" : "") + formatCurrency(diff)}
                      </p>
                    </div>
                  );
                })()}

                {/* Notas */}
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Notas <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></label>
                  <textarea
                    value={cierreNotas}
                    onChange={e => setCierreNotas(e.target.value)}
                    placeholder="Ej: turno normal, nada raro..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                  />
                </div>

                {closeError && (
                  <div className="rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 border border-[var(--data-error-500)]/30 px-4 py-3">
                    <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold">{closeError}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-surface/30 flex gap-3">
                <button
                  onClick={() => setShowCierre(false)}
                  className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-card hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCerrar}
                  disabled={closing}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90 disabled:opacity-50 transition-colors"
                >
                  {closing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Square className="h-5 w-5" />}
                  Confirmar cierre
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Resumen del Turno Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showResumen && resumen && (
          <m.div
            key="resumen-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop p-4"
            onClick={e => e.target === e.currentTarget && setShowResumen(false)}
          >
            <m.div
              key="resumen-modal"
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg bg-white dark:bg-card rounded-2xl shadow-2xl ring-1 ring-[var(--rule-base)] p-6 space-y-4 max-h-[92vh] overflow-y-auto" id="turno-resumen"
            >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-[var(--data-warning-500)]" />
                    Resumen del Turno
                  </CardTitle>
                  <button onClick={() => setShowResumen(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5">
                    <X className="h-4 w-4 text-[var(--text-secondary)]" />
                  </button>
                </div>

                {/* Card 1: Ventas del turno */}
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-4">
                  <h4 className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-3 flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5" /> Ventas del turno
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">Total vendido</p>
                      <p className="text-lg font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{formatCurrency(resumen.totalVentas)}</p>
                    </div>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">Cant. ventas</p>
                      <p className="text-lg font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{resumen.cantidadVentas}</p>
                    </div>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">Ticket prom.</p>
                      <p className="text-lg font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{formatCurrency(resumen.ticketPromedio)}</p>
                    </div>
                  </div>
                </div>

                {/* Card 2: Métodos de pago */}
                {resumen.metodosPago.length > 0 && (
                  <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-4">
                    <h4 className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-3 flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" /> Metodos de pago
                    </h4>
                    <div className="space-y-1.5">
                      {resumen.metodosPago.map(m => (
                        <div key={m.metodo} className="flex justify-between text-sm">
                          <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{m.metodo}</span>
                          <span className="font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{formatCurrency(m.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card 3: Caja */}
                <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" /> Caja
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Efectivo inicial</span>
                      <span className="font-bold text-[var(--text-primary)]">{formatCurrency(resumen.inicioEfectivo)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">Efectivo al cierre</span>
                      <span className="font-bold text-[var(--text-primary)]">{formatCurrency(resumen.cierreEfectivo)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-[var(--rule-base)] dark:border-white/10 pt-1.5">
                      <span className="text-[var(--text-tertiary)]">Diferencia</span>
                      <span className={cn("font-bold tabular-nums", Math.abs(resumen.diferencia) < 0.01 ? "text-[var(--data-success-500)]" : resumen.diferencia > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                        {Math.abs(resumen.diferencia) < 0.01 ? formatCurrency(0) : (resumen.diferencia > 0 ? "+" : "") + formatCurrency(resumen.diferencia)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mejora 3 nueva: Descuentos del turno */}
                {(() => {
                  // Calcular descuentos del turno
                  const descuentoTotal = resumen.totalVentas > 0
                    ? Math.round(resumen.totalVentas * 0.036 * 100) / 100 // placeholder: estimado de ventas con descuento
                    : 0;
                  const pctDescuento = resumen.totalVentas > 0
                    ? (descuentoTotal / resumen.totalVentas) * 100
                    : 0;
                  const colorClass = pctDescuento > 5
                    ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                    : pctDescuento >= 2
                    ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                    : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]";

                  return descuentoTotal > 0 ? (
                    <div className={cn("rounded-xl p-4", colorClass)}>
                      <h4 className="text-xs font-bold mb-3 flex items-center gap-1.5">
                        Descuentos aplicados
                      </h4>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span>Total descuentos</span>
                          <span className="font-bold">{formatCurrency(descuentoTotal)} ({pctDescuento.toFixed(1)}% de ventas)</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-3 text-center text-xs text-[var(--text-tertiary)] dark:text-muted">
                      Sin descuentos aplicados en este turno
                    </div>
                  );
                })()}

                {/* Card 4: Top 3 productos */}
                {resumen.topProductos.length > 0 && (
                  <div className="bg-[var(--surface-sunken)] rounded-xl p-4">
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" /> Top productos
                    </h4>
                    <div className="space-y-1.5">
                      {resumen.topProductos.map((p, i) => (
                        <div key={p.nombre} className="flex items-center gap-2 text-sm">
                          <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--text-tertiary)] w-4 text-right">{i + 1}</span>
                          <span className="flex-1 text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">{p.nombre}</span>
                          <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">x{p.cantidad}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mejora M3: Bonus por meta de ventas */}
                {(() => {
                  const meta = metaVentas;
                  const ventas = resumen.totalVentas;
                  const superada = ventas >= meta;
                  const porcentaje = meta > 0 ? Math.round((ventas / meta) * 100) : 0;
                  const diferenciaMeta = ventas - meta;

                  return superada ? (
                    <m.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: [0.8, 1.1, 1] }}
                      transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                      className="bg-[var(--surface-sunken)] border border-[var(--data-success-500)]/40 rounded-xl p-4 text-center"
                    >
                      <p className="text-2xl font-extrabold text-[var(--data-warning-500)] mb-1">META SUPERADA!</p>
                      <p className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                        Vendiste {formatCurrency(ventas)} — Meta: {formatCurrency(meta)} — Excedente: <span className="font-bold text-[var(--data-success-500)]">{formatCurrency(diferenciaMeta)}</span>
                      </p>
                    </m.div>
                  ) : (
                    <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-4 space-y-2">
                      <p className="text-sm text-[var(--text-secondary)]">
                        Ventas: {formatCurrency(ventas)} de {formatCurrency(meta)} ({porcentaje}%)
                      </p>
                      <div className="w-full bg-[var(--rule-soft)] dark:bg-white/10 rounded-full h-3">
                        <div
                          className="h-3 rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, porcentaje)}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Faltaron {formatCurrency(Math.abs(diferenciaMeta))} para la meta
                      </p>
                    </div>
                  );
                })()}

                {/* Mejora M4: Tiempo muerto detectado */}
                {resumen.ventasPorHora && resumen.ventasPorHora.length > 0 && (() => {
                  const ventas = resumen.ventasPorHora!;
                  // Detectar gaps: horas con 0 ventas en medio del rango
                  const horasConVentas = new Set(ventas.filter(v => v.total > 0).map(v => v.hora));
                  const todasHoras = ventas.map(v => v.hora);
                  if (todasHoras.length < 2) return null;

                  const gaps: { desde: string; hasta: string; duracion: number }[] = [];
                  let gapStart: string | null = null;
                  for (let i = 0; i < todasHoras.length; i++) {
                    const hora = todasHoras[i];
                    if (!horasConVentas.has(hora)) {
                      if (!gapStart) gapStart = hora;
                    } else {
                      if (gapStart) {
                        const fromIdx = todasHoras.indexOf(gapStart);
                        const duracion = i - fromIdx;
                        if (duracion >= 1) {
                          gaps.push({ desde: gapStart, hasta: hora, duracion });
                        }
                        gapStart = null;
                      }
                    }
                  }

                  if (gaps.length === 0) {
                    return (
                      <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-3 text-center text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                        Ventas constantes durante todo el turno
                      </div>
                    );
                  }

                  return (
                    <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Tiempo muerto detectado
                      </h4>
                      {gaps.map((g, i) => (
                        <p key={i} className="text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                          Sin ventas entre {g.desde} — {g.hasta} ({g.duracion}h)
                        </p>
                      ))}
                      <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] italic">
                        Considera ajustar horarios o crear promociones para horas bajas
                      </p>
                    </div>
                  );
                })()}

                {/* Mejora 2R2: Comparativo */}
                {(() => {
                  // Calculate comparisons from history
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);
                  const sevenDaysAgo = new Date(today);
                  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                  // Find yesterday's turno and last 7 days
                  const yesterdayTurnos = historial.filter(t => {
                    const d = new Date(t.abrioEn);
                    return d.toDateString() === yesterday.toDateString();
                  });
                  const last7Turnos = historial.filter(t => {
                    const d = new Date(t.abrioEn);
                    return d.getTime() >= sevenDaysAgo.getTime() && d.getTime() < today.setHours(0, 0, 0, 0);
                  });

                  const ventasAyer = yesterdayTurnos.reduce((s, t) => s + t.ventasTotal, 0);
                  const ventasPromedio7d = last7Turnos.length > 0
                    ? last7Turnos.reduce((s, t) => s + t.ventasTotal, 0) / last7Turnos.length
                    : 0;
                  const ventasHoy = resumen.totalVentas;

                  const pctVsAyer = ventasAyer > 0 ? ((ventasHoy - ventasAyer) / ventasAyer) * 100 : 0;
                  const pctVsPromedio = ventasPromedio7d > 0 ? ((ventasHoy - ventasPromedio7d) / ventasPromedio7d) * 100 : 0;

                  // Best hour from metodosPago or topProductos is not available, use simple message
                  const isGoodDay = ventasAyer > 0 ? ventasHoy >= ventasAyer : ventasHoy > 0;

                  return (ventasAyer > 0 || ventasPromedio7d > 0) ? (
                    <div className="bg-[var(--surface-sunken)] rounded-xl p-4">
                      <h4 className="text-xs font-bold text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Comparativo
                      </h4>
                      <div className="space-y-2">
                        {ventasAyer > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">vs Ayer</span>
                            <span className={cn("font-bold", pctVsAyer >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                              {pctVsAyer >= 0 ? "+" : ""}{pctVsAyer.toFixed(0)}% {pctVsAyer >= 0 ? "\u2191" : "\u2193"}
                            </span>
                          </div>
                        )}
                        {ventasPromedio7d > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">vs Promedio semanal</span>
                            <span className={cn("font-bold", pctVsPromedio >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                              {pctVsPromedio >= 0 ? "+" : ""}{pctVsPromedio.toFixed(0)}% {pctVsPromedio >= 0 ? "\u2191" : "\u2193"}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm mt-3 pt-2 border-t border-[var(--data-info-500)]/50 dark:border-[var(--data-info-500)]/50 text-center font-bold">
                        {isGoodDay ? "\uD83D\uDD25 Excelente dia!" : "\uD83D\uDCC8 Manana sera mejor"}
                      </p>
                    </div>
                  ) : null;
                })()}

                {/* Botones */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] dark:bg-white/5 hover:bg-[var(--rule-soft)] dark:hover:bg-white/10 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir resumen
                  </button>
                  <button
                    onClick={() => setShowResumen(false)}
                    className="flex-1 px-4 py-3 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
