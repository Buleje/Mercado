"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";

import { useState, useMemo, useEffect, startTransition } from "react";
import {
  Timer, Play, Square, Download, X,
  User, CheckCircle, AlertTriangle, BarChart2, RefreshCw, Printer, Info, ExternalLink,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ShiftStatus = "abierto" | "cerrado" | "revisando";

type ShiftRecord = {
  id: string;
  registerId?: string;   // ID del CashRegister en BD
  userId: string;
  userName: string;
  role: string;
  openedAt: string;      // ISO
  closedAt?: string;     // ISO
  status: ShiftStatus;
  openingCash: number;   // Fondo de caja al inicio
  closingCash?: number;  // Efectivo contado al cierre
  totalSales: number;    // Ventas realizadas en el turno
  totalOrders: number;
  cashSales: number;     // Ventas en efectivo
  digitalSales: number;  // Yape/POS/transferencia
  expenses: number;      // Gastos registrados en turno
  expectedCash: number;  // Calculado: openingCash + cashSales - expenses
  difference?: number;   // closingCash - expectedCash
  notes?: string;
};

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDatetime(iso: string) {
  try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function duration(open: string, close?: string) {
  const start = new Date(open).getTime();
  const end = close ? new Date(close).getTime() : Date.now();
  const mins = Math.floor((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

const SEED_SHIFTS: ShiftRecord[] = [];

// ── ModuleTooltip ─────────────────────────────────────────────────────────────

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-72 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-bold text-[var(--text-primary)] dark:text-foreground mb-2 text-sm flex items-center gap-1.5"><Timer className="h-4 w-4 text-primary" /> ¿Qué es Control de Turnos?</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Registra quién trabaja en caja, cuándo entra y sal, y cuánto vendió durante su turno.</p>
          <p className="font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">Ejemplo:</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Valentina abre turno a las 8am con S/200 de fondo. Cierra a las 2pm. El sistema muestra: S/850 en ventas, S/600 en efectivo, S/250 digital. Diferencia en caja: <span className="text-[var(--data-success)] font-semibold">Conforme</span>.</p>
          <div className="space-y-1 border-t border-[var(--rule-soft)] dark:border-card-border pt-2">
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">KPIs</span> — ventas y pedidos del día en tiempo real.</p>
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Abrir turno</span> — registra cajero, rol y fondo inicial.</p>
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Turnos activos</span> — muestra quién está trabajando ahora.</p>
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Cerrar turno</span> — ingresa el efectivo contado y genera el arqueo automáticamente.</p>
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Historial</span> — todos los turnos pasados con su resumen.</p>
          </div>
          <p className="mt-2 text-[var(--text-tertiary)] italic">Al cerrar un turno, el resultado aparece en <strong>Arqueo de Caja</strong>.</p>
        </div>
      )}
    </div>
  );
}

/** Build shift stats from real sales data for today */
function buildTodayShiftFromSales(sales: Array<{ total: number; totalCogs?: number; payment: string; createdAt: string; cashierId?: string }>): Partial<ShiftRecord> {
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter(s => s.createdAt.slice(0, 10) === today);
  const totalSales = todaySales.reduce((s, x) => s + x.total, 0);
  const cashSales = todaySales.filter(s => s.payment === "efectivo").reduce((sum, x) => sum + x.total, 0);
  const digitalSales = totalSales - cashSales;
  return { totalSales, totalOrders: todaySales.length, cashSales, digitalSales };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShiftControlTab({ onNavigateToArqueo }: { onNavigateToArqueo?: () => void }) {
  const [shifts, setShifts] = useState<ShiftRecord[]>(SEED_SHIFTS);
  const [loadingData, setLoadingData] = useState(true);
  const [selected, setSelected] = useState<ShiftRecord | null>(null);
  const [view, setView] = useState<"activos" | "historial">("activos");
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState<ShiftRecord | null>(null);
  const [openForm, setOpenForm] = useState({ userName: "", role: "cajero", openingCash: "200" });
  const [closeForm, setCloseForm] = useState({ closingCash: "", notes: "" });
  const [printingShift, setPrintingShift] = useState<ShiftRecord | null>(null);
  const [historialVisible, setHistorialVisible] = useState(10);

  // ── Load open cash registers from BD on mount ───────────────────────────
  const loadShiftData = () => {
    Promise.all([
      fetch("/api/cash-registers").then(r => r.ok ? r.json() : []),
      fetch("/api/admin/dashboard").then(r => r.ok ? r.json() : null),
    ])
      .then(([registers, dashboard]: [Array<{ id: string; openedAt: string; closedAt?: string; status: string; openingAmount: number; closingAmount?: number; expectedAmount?: number; difference?: number; notes?: string }>, { sales?: Array<{ total: number; payment: string; createdAt: string }> } | null]) => {
        const todayStats = dashboard?.sales ? buildTodayShiftFromSales(dashboard.sales) : {};
        const mapped: ShiftRecord[] = registers.map(r => {
          const isOpen = r.status === "abierta";
          // Extract cashier name from notes field (set during open)
          const [cashierName, cashierRole] = (r.notes ?? "").split(" (");
          const role = cashierRole ? cashierRole.replace(")", "") : "cajero";
          const rec: ShiftRecord = {
            id: r.id,
            registerId: r.id,
            userId: r.id,
            userName: cashierName || "Cajero",
            role,
            openedAt: r.openedAt,
            closedAt: r.closedAt,
            status: r.status === "abierta" ? "abierto" : "cerrado",
            openingCash: r.openingAmount,
            closingCash: r.closingAmount,
            totalSales: 0,
            totalOrders: 0,
            cashSales: 0,
            digitalSales: 0,
            expenses: 0,
            expectedCash: r.expectedAmount ?? r.openingAmount,
            difference: r.difference,
            notes: isOpen ? undefined : r.notes,
          };
          // Hydrate open registers with today's real sales
          if (isOpen && todayStats.totalSales !== undefined) {
            return { ...rec, ...todayStats, expectedCash: rec.openingCash + (todayStats.cashSales ?? 0) };
          }
          return rec;
        });
        startTransition(() => {
          setShifts(mapped);
          setLoadingData(false);
        });
      })
      .catch(() => startTransition(() => setLoadingData(false)));
  };

  useEffect(() => { loadShiftData(); }, []);

  const activeShifts = shifts.filter(s => s.status === "abierto");
  const closedShifts = shifts.filter(s => s.status !== "abierto").sort((a, b) => (b.openedAt).localeCompare(a.openedAt));
  const visibleHistorial = closedShifts.slice(0, historialVisible);
  const visible = view === "activos" ? activeShifts : visibleHistorial;

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayShifts = shifts.filter(s => s.openedAt.slice(0, 10) === today);
    return {
      totalSalesToday: todayShifts.reduce((s, sh) => s + sh.totalSales, 0),
      totalOrdersToday: todayShifts.reduce((s, sh) => s + sh.totalOrders, 0),
      totalDifference: todayShifts.filter(s => s.difference !== undefined).reduce((s, sh) => s + (sh.difference ?? 0), 0),
      activeCount: activeShifts.length,
    };
  }, [shifts, activeShifts.length]);

  const handleOpenShift = () => {
    if (!openForm.userName.trim()) return;
    const openingCash = parseFloat(openForm.openingCash) || 0;
    const localId = `sh-${Date.now()}`;
    const sh: ShiftRecord = {
      id: localId,
      userId: `u-${Date.now()}`,
      userName: openForm.userName.trim(),
      role: openForm.role,
      openedAt: new Date().toISOString(),
      status: "abierto",
      openingCash,
      totalSales: 0,
      totalOrders: 0,
      cashSales: 0,
      digitalSales: 0,
      expenses: 0,
      expectedCash: openingCash,
      notes: "",
    };
    setShifts(prev => [...prev, sh]);
    setShowOpenForm(false);
    setOpenForm({ userName: "", role: "cajero", openingCash: "200" });
    setView("activos");
    // Persist to DB and store the real registerId
    fetch("/api/cash-registers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", openingAmount: openingCash, notes: `${openForm.userName.trim()} (${openForm.role})` }),
    })
      .then(r => r.ok ? r.json() : null)
      .then((reg: { id?: string } | null) => {
        if (!reg?.id) return;
        startTransition(() => {
          setShifts(prev => prev.map(s => s.id === localId ? { ...s, registerId: reg.id } : s));
        });
      })
      .catch(() => {});
    loadShiftData();
  };

  const handleCloseShift = () => {
    if (!showCloseForm) return;
    const countedCash = parseFloat(closeForm.closingCash) || 0;
    const diff = countedCash - showCloseForm.expectedCash;
    const closedAt = new Date().toISOString();
    startTransition(() => {
      setShifts(prev => prev.map(s => {
        if (s.id !== showCloseForm.id) return s;
        return { ...s, status: "cerrado", closedAt, closingCash: countedCash, difference: diff, notes: closeForm.notes };
      }));
    });
    setShowCloseForm(null);
    setCloseForm({ closingCash: "", notes: "" });
    if (selected?.id === showCloseForm.id) setSelected(null);
    // Persist close to DB if we have a real registerId
    if (showCloseForm.registerId) {
      fetch(`/api/cash-registers/${showCloseForm.registerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", closingAmount: countedCash, notes: closeForm.notes }),
      }).catch(() => {});
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Timer className="h-6 w-6 text-primary" />
            Control de Turnos
            <ModuleTooltip />
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Apertura, cierre y resumen de ventas por turno y cajero</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminTooltip content="Recargar datos de turnos y ventas">
            <button onClick={() => { setLoadingData(true); loadShiftData(); }} disabled={loadingData} aria-label="Actualizar datos" className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-secondary)] hover:text-primary disabled:opacity-40 transition-colors"><RefreshCw className={cn("h-4 w-4", loadingData && "animate-spin")} /></button>
          </AdminTooltip>
          {onNavigateToArqueo && (
            <AdminTooltip content="Ir al módulo de arqueo de caja detallado">
              <button onClick={onNavigateToArqueo} aria-label="Ver Arqueo de Caja" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors">
                <ExternalLink className="h-4 w-4" /> Ver Arqueo
              </button>
            </AdminTooltip>
          )}
          <button onClick={() => exportToCSV(closedShifts.map(s => ({ cajero: s.userName, apertura: s.openedAt, cierre: s.closedAt ?? "", duracion: duration(s.openedAt, s.closedAt), ventas_total: s.totalSales, pedidos: s.totalOrders, efectivo: s.cashSales, digital: s.digitalSales, fondo_inicio: s.openingCash, efectivo_contado: s.closingCash ?? 0, esperado: s.expectedCash, diferencia: s.difference ?? 0 })), "historial-turnos")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowOpenForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Play className="h-4 w-4" /> Abrir turno
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Ventas hoy", value: fmt(stats.totalSalesToday), icon: BarChart2, color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Pedidos hoy", value: String(stats.totalOrdersToday), icon: CheckCircle, color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Turnos activos", value: String(stats.activeCount), icon: Timer, color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Diferencia en caja", value: fmt(Math.abs(stats.totalDifference)), icon: stats.totalDifference === 0 ? CheckCircle : AlertTriangle, color: stats.totalDifference === 0 ? "text-[var(--data-success)]" : stats.totalDifference > 0 ? "text-[var(--data-success)]" : "text-[var(--data-error)]", bg: stats.totalDifference === 0 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "bg-[var(--data-error-50)] dark:bg-red-950/30" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <Icon className={cn("h-5 w-5 mb-2", color)} />
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Open shift form */}
      {showOpenForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2"><Play className="h-4 w-4 text-[var(--data-success)]" /> Abrir nuevo turno</CardTitle>
            <button onClick={() => setShowOpenForm(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Nombre del cajero</label>
              <input type="text" value={openForm.userName} onChange={e => setOpenForm(p => ({ ...p, userName: e.target.value }))} placeholder="Nombre completo" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Rol</label>
              <select value={openForm.role} onChange={e => setOpenForm(p => ({ ...p, role: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                <option value="cajero">Cajero</option>
                <option value="vendedor">Vendedor</option>
                <option value="administrador">Administrador</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Fondo inicial (S/)</label>
              <input type="number" value={openForm.openingCash} onChange={e => setOpenForm(p => ({ ...p, openingCash: e.target.value }))} min="0" step="50" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowOpenForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleOpenShift} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-[var(--accent-soft)] text-white font-semibold hover:bg-[var(--accent-soft)]">Abrir turno</button>
          </div>
        </div>
      )}

      {/* Close shift form */}
      {showCloseForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCloseForm(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2"><Square className="h-4 w-4 text-[var(--data-error)]" /> Cerrar turno</CardTitle>
              <button onClick={() => setShowCloseForm(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--text-secondary)] dark:text-muted">Cajero</span><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{showCloseForm.userName}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)] dark:text-muted">Turno abierto</span><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{fmtDatetime(showCloseForm.openedAt)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)] dark:text-muted">Duración</span><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{duration(showCloseForm.openedAt)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)] dark:text-muted">Ventas</span><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(showCloseForm.totalSales)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-secondary)] dark:text-muted">Efectivo esperado</span><span className="font-extrabold text-[var(--data-success)]">{fmt(showCloseForm.expectedCash)}</span></div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Efectivo contado en caja (S/)</label>
                <input
                  type="number"
                  value={closeForm.closingCash}
                  onChange={e => setCloseForm(p => ({ ...p, closingCash: e.target.value }))}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
              </div>
              {closeForm.closingCash && (
                <div className={cn("flex items-center justify-between rounded-xl px-2 sm:px-4 py-2 sm:py-3 text-sm font-bold", parseFloat(closeForm.closingCash) === showCloseForm.expectedCash ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" : parseFloat(closeForm.closingCash) > showCloseForm.expectedCash ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]" : "bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error)] dark:text-[var(--data-error)]")}>
                  <span>Diferencia:</span>
                  <span>{parseFloat(closeForm.closingCash) >= showCloseForm.expectedCash ? "+" : ""}{fmt(parseFloat(closeForm.closingCash) - showCloseForm.expectedCash)}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Observaciones</label>
                <textarea value={closeForm.notes} onChange={e => setCloseForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Ej: Faltó billete de S/50..." className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground resize-none" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowCloseForm(null)} className="flex-1 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
              <button onClick={handleCloseShift} className="flex-1 py-2.5 text-sm rounded-lg bg-[var(--data-error)] text-white font-semibold hover:bg-[var(--data-error)]">Cerrar turno</button>
            </div>
          </div>
        </div>
      )}

      {/* View tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(["activos", "historial"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-lg transition-colors capitalize", view === v ? "bg-primary text-white" : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
            {v === "activos" ? `Turnos activos (${activeShifts.length})` : `Historial (${closedShifts.length})`}
          </button>
        ))}
      </div>

      {/* Skeleton while loading */}
      {loadingData && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 animate-pulse">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-surface" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-surface rounded w-32" />
                  <div className="h-3 bg-gray-100 dark:bg-surface/50 rounded w-48" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[1,2,3,4].map(j => <div key={j} className="h-12 rounded-xl bg-gray-100 dark:bg-surface/50" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shifts list */}
      {!loadingData && (
      <div className="space-y-6">
        {visible.length === 0 && (
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-8 text-center text-[var(--text-tertiary)] dark:text-muted text-sm">
            {view === "activos" ? "No hay turnos activos en este momento." : "Sin historial de turnos."}
          </div>
        )}
        {visible.map(sh => {
          const isOpen = sh.status === "abierto";
          return (
            <div key={sh.id} className={cn("bg-white dark:bg-card border rounded-xl p-3 sm:p-5 transition-all", isOpen ? "border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 " : "border-[var(--rule-base)] dark:border-card-border")}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0", isOpen ? "bg-[var(--accent-soft)]" : "bg-gray-400 dark:bg-surface")}>
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{sh.userName}</p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted capitalize">{sh.role} · {fmtDatetime(sh.openedAt)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", isOpen ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" : "bg-gray-100 text-[var(--text-secondary)] dark:bg-surface dark:text-muted")}>
                    {isOpen ? "Activo" : sh.status === "revisando" ? "Revisando" : `Cerrado — ${duration(sh.openedAt, sh.closedAt)}`}
                  </span>
                  {isOpen && (
                    <button onClick={() => { setShowCloseForm(sh); setCloseForm({ closingCash: "", notes: "" }); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error)] text-xs font-semibold hover:bg-[var(--data-error-100)] dark:hover:bg-[var(--data-error)]/30 transition-colors">
                      <Square className="h-3.5 w-3.5" /> Cerrar
                    </button>
                  )}
                  {!isOpen && (
                    <button onClick={() => setPrintingShift(sh)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] text-xs font-semibold hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors">
                      <Printer className="h-3.5 w-3.5" /> Recibo
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <SCell label="Ventas totales" value={fmt(sh.totalSales)} accent="blue" />
                <SCell label="Pedidos" value={String(sh.totalOrders)} accent="violet" />
                <SCell label="Ventas efectivo" value={fmt(sh.cashSales)} accent="amber" />
                <SCell label="Ventas digital" value={fmt(sh.digitalSales)} accent="sky" />
              </div>

              {!isOpen && sh.closingCash !== undefined && (
                <div className="mt-3 pt-3 border-t border-[var(--rule-soft)] dark:border-card-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <SCell label="Fondo inicial" value={fmt(sh.openingCash)} />
                  <SCell label="Esperado en caja" value={fmt(sh.expectedCash)} />
                  <SCell label="Contado en caja" value={fmt(sh.closingCash)} />
                  <SCell label="Diferencia" value={(sh.difference ?? 0) >= 0 ? `+${fmt(sh.difference ?? 0)}` : `-${fmt(Math.abs(sh.difference ?? 0))}`} accent={sh.difference === 0 ? "green" : sh.difference! > 0 ? "blue" : "red"} />
                </div>
              )}

              {sh.notes && <p className="mt-3 text-xs text-[var(--text-secondary)] dark:text-muted italic border-t border-[var(--rule-soft)] dark:border-card-border pt-2">Obs: {sh.notes}</p>}
            </div>
          );
        })}
      </div>
      )}

      {/* Cargar más (historial client-side pagination) */}
      {!loadingData && view === "historial" && historialVisible < closedShifts.length && (
        <button onClick={() => setHistorialVisible(v => v + 10)} className="w-full py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          Cargar más — {closedShifts.length - historialVisible} turnos restantes
        </button>
      )}

      {/* Print receipt modal */}
      {printingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPrintingShift(null)}>
          <div id="shift-receipt" className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-xs space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-center border-b border-dashed border-[var(--rule-base)] dark:border-card-border pb-3">
              <p className="text-xs font-bold text-[var(--text-tertiary)]">Buleje</p>
              <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground mt-1">Recibo de Turno</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDatetime(new Date().toISOString())}</p>
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                { label: "Cajero", value: printingShift.userName },
                { label: "Rol", value: printingShift.role },
                { label: "Apertura", value: fmtDatetime(printingShift.openedAt) },
                { label: "Cierre", value: printingShift.closedAt ? fmtDatetime(printingShift.closedAt) : "—" },
                { label: "Duración", value: duration(printingShift.openedAt, printingShift.closedAt) },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[var(--text-secondary)] dark:text-muted">{label}</span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{value}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-[var(--rule-base)] dark:border-card-border pt-3 space-y-1.5 text-sm">
              {[
                { label: "Ventas totales", value: fmt(printingShift.totalSales) },
                { label: "Pedidos", value: String(printingShift.totalOrders) },
                { label: "Efectivo", value: fmt(printingShift.cashSales) },
                { label: "Digital", value: fmt(printingShift.digitalSales) },
                { label: "Fondo inicial", value: fmt(printingShift.openingCash) },
                ...(printingShift.closingCash !== undefined ? [
                  { label: "Esperado", value: fmt(printingShift.expectedCash) },
                  { label: "Contado", value: fmt(printingShift.closingCash) },
                  { label: "Diferencia", value: `${(printingShift.difference ?? 0) >= 0 ? "+" : ""}${fmt(printingShift.difference ?? 0)}` },
                ] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[var(--text-secondary)] dark:text-muted">{label}</span>
                  <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{value}</span>
                </div>
              ))}
            </div>
            {printingShift.notes && <p className="text-xs text-[var(--text-secondary)] italic border-t border-dashed border-[var(--rule-base)] dark:border-card-border pt-2">Obs: {printingShift.notes}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={() => setPrintingShift(null)} className="flex-1 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cerrar</button>
              <button onClick={() => window.print()} className="flex-1 py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 flex items-center justify-center gap-1.5">
                <Printer className="h-4 w-4" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const col = accent === "blue" ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : accent === "violet" ? "text-[var(--text-secondary)] dark:text-[var(--text-primary)]" : accent === "amber" ? "text-amber-600 dark:text-amber-400" : accent === "sky" ? "text-sky-600 dark:text-sky-400" : accent === "green" ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : accent === "red" ? "text-red-500 dark:text-red-400" : "text-[var(--text-primary)] dark:text-foreground";
  return (
    <div className="bg-gray-50 dark:bg-surface/50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-0.5">{label}</p>
      <p className={cn("font-extrabold text-base leading-tight", col)}>{value}</p>
    </div>
  );
}
