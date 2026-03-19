"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calculator, DollarSign, ArrowUp, ArrowDown, Clock,
  Loader2, Check, X, Banknote, History, RefreshCw,
  Lock, Unlock, Printer, AlertTriangle, Scan, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface CashMovement {
  id: string; cashRegisterId: string; type: string;
  amount: number; method: string; description: string;
  saleId?: string; createdAt: string;
}

interface CashRegister {
  id: string; openedAt: string; closedAt?: string;
  openingAmount: number; closingAmount?: number;
  expectedAmount?: number; difference?: number;
  status: "abierta" | "cerrada"; notes?: string;
  movements: CashMovement[];
}

type View = "current" | "history" | "reconcile";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="text-gray-400 hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda sobre Caja Registradora">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-80 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-extrabold text-gray-900 dark:text-foreground text-sm mb-2">💵 Caja Registradora</p>
          <p className="text-gray-600 dark:text-muted mb-3">Controla las aperturas y cierres de caja, registra ingresos y egresos manuales, y consulta el historial de sesiones anteriores.</p>
          <div className="space-y-1.5">
            <p><span className="font-bold text-gray-800 dark:text-foreground">Actual:</span> <span className="text-gray-500 dark:text-muted">muestra la caja abierta ahora (saldo, movimientos del día).</span></p>
            <p><span className="font-bold text-gray-800 dark:text-foreground">Historial:</span> <span className="text-gray-500 dark:text-muted">listado de todas las sesiones cerradas con su diferencia.</span></p>
            <p><span className="font-bold text-gray-800 dark:text-foreground">Ingreso / Egreso:</span> <span className="text-gray-500 dark:text-muted">ejemplo: registrar S/50 de egreso por compra de bolsas.</span></p>
          </div>
          <div className="mt-3 bg-blue-50 dark:bg-blue-950/20 rounded-xl p-2">
            <p className="text-blue-700 dark:text-blue-400 font-semibold">💡 Ejemplo</p>
            <p className="text-blue-600 dark:text-blue-300">Valentina abre caja con S/200, vende durante el turno y al cerrar el sistema le dice si hay faltante o sobrante.</p>
          </div>
        </div>
      )}
    </div>
  );
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function fmtDateShort(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
  catch { return iso; }
}

const MOVEMENT_COLORS: Record<string, string> = {
  venta: "text-emerald-600 bg-emerald-50",
  ingreso: "text-blue-600 bg-blue-50",
  egreso: "text-red-600 bg-red-50",
  apertura: "text-indigo-600 bg-indigo-50",
  cierre: "text-gray-600 dark:text-muted bg-gray-100 dark:bg-accent",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function CashRegisterTab() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("current");
  // Open dialog
  const [showOpen, setShowOpen] = useState(false);
  const [openAmount, setOpenAmount] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [opening, setOpening] = useState(false);
  // Close dialog
  const [showClose, setShowClose] = useState(false);
  const [closeAmount, setCloseAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [denominations, setDenominations] = useState<Record<string, number>>({});
  // Add movement dialog
  const [showMovement, setShowMovement] = useState(false);
  const [mvType, setMvType] = useState<"ingreso" | "egreso">("ingreso");
  const [mvAmount, setMvAmount] = useState("");
  const [mvDescription, setMvDescription] = useState("");
  const [addingMv, setAddingMv] = useState(false);
  // View register detail
  const [detailRegister, setDetailRegister] = useState<CashRegister | null>(null);
  // Arqueo Express
  const [showArqueo, setShowArqueo] = useState(false);
  const [arqueoAmount, setArqueoAmount] = useState("");
  const [arqueoDenoms, setArqueoDenoms] = useState<Record<string, number>>({});
  const [addingArqueo, setAddingArqueo] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-registers");
      setRegisters(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchData(); }, [fetchData]);

  const currentRegister = useMemo(() => registers.find(r => r.status === "abierta") || null, [registers]);
  const closedRegisters = useMemo(() => registers.filter(r => r.status === "cerrada"), [registers]);

  // ── Computed stats for current register ────────────────────────────────────

  const stats = useMemo(() => {
    if (!currentRegister) return null;
    const mvs = currentRegister.movements;
    const salesEfectivo = mvs.filter(m => m.type === "venta" && m.method === "efectivo").reduce((s, m) => s + m.amount, 0);
    const salesDigital = mvs.filter(m => m.type === "venta" && m.method !== "efectivo").reduce((s, m) => s + m.amount, 0);
    const totalIn = mvs.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
    const totalOut = mvs.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
    const salesCount = mvs.filter(m => m.type === "venta").length;
    const expectedCash = currentRegister.openingAmount + salesEfectivo + totalIn - totalOut;
    return { salesEfectivo, salesDigital, totalIn, totalOut, salesCount, expectedCash };
  }, [currentRegister]);

  // ── Open register ──────────────────────────────────────────────────────────

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await fetch("/api/cash-registers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", openingAmount: Number(openAmount) || 0, notes: openNotes || undefined }),
      });
      setShowOpen(false);
      setOpenAmount("");
      setOpenNotes("");
      fetchData();
    } catch { /* ignore */ }
    setOpening(false);
  };

  // ── Close register ─────────────────────────────────────────────────────────

  const handleClose = async () => {
    if (!currentRegister || closing) return;
    setClosing(true);
    try {
      await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", closingAmount: Number(closeAmount) || 0, notes: closeNotes || undefined }),
      });
      setShowClose(false);
      setCloseAmount("");
      setCloseNotes("");
      setDenominations({});
      fetchData();
    } catch { /* ignore */ }
    setClosing(false);
  };

  // ── Add movement ───────────────────────────────────────────────────────────

  const handleAddMovement = async () => {
    if (!currentRegister || addingMv || !mvAmount) return;
    setAddingMv(true);
    try {
      await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "movement",
          type: mvType,
          amount: Number(mvAmount),
          method: "efectivo",
          description: mvDescription || (mvType === "ingreso" ? "Ingreso manual" : "Egreso manual"),
        }),
      });
      setShowMovement(false);
      setMvAmount("");
      setMvDescription("");
      fetchData();
    } catch { /* ignore */ }
    setAddingMv(false);
  };

  // ── Arqueo Express ──────────────────────────────────────────────────────────

  const handleArqueoExpress = async () => {
    if (!currentRegister || addingArqueo || !arqueoAmount) return;
    setAddingArqueo(true);
    try {
      const counted = Number(arqueoAmount);
      const expected = stats?.expectedCash ?? 0;
      const diff = counted - expected;
      const timestamp = new Date().toLocaleString("es-PE", { 
        day: "2-digit", 
        month: "short", 
        hour: "2-digit", 
        minute: "2-digit" 
      });
      
      await fetch("/api/cash-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashRegisterId: currentRegister.id,
          type: "arqueo",
          amount: counted,
          method: "efectivo",
          description: `Arqueo Express - ${timestamp} | Esperado: S/${expected.toFixed(2)} | Contado: S/${counted.toFixed(2)} | Diferencia: ${diff >= 0 ? "+" : ""}S/${diff.toFixed(2)}`,
        }),
      });
      
      setShowArqueo(false);
      setArqueoAmount("");
      setArqueoDenoms({});
      fetchData();
    } catch { /* ignore */ }
    setAddingArqueo(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" /> Caja Registradora
          <ModuleTooltip />
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors" title="Refrescar">
            <RefreshCw className="h-4 w-4 text-gray-500 dark:text-muted" />
          </button>
          <div className="flex bg-gray-100 dark:bg-accent rounded-lg p-0.5">
            <button
              onClick={() => setView("current")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all", view === "current" ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted")}
            >
              Actual
            </button>
            <button
              onClick={() => setView("history")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all", view === "history" ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted")}
            >
              Historial
            </button>
            <button
              onClick={() => setView("reconcile")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-all", view === "reconcile" ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm" : "text-gray-500 dark:text-muted")}
            >
              Reconciliación
            </button>
          </div>
        </div>
      </div>

      {/* Current view */}
      {view === "current" && (
        <>
          {!currentRegister ? (
            /* No open register */
            <div className="bg-white dark:bg-card rounded-2xl border-2 border-dashed border-gray-200 dark:border-card-border p-8 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-accent flex items-center justify-center mx-auto mb-4">
                <Lock className="h-7 w-7 text-gray-400 dark:text-muted" />
              </div>
              <h3 className="text-base font-extrabold text-gray-900 dark:text-foreground mb-1">Caja cerrada</h3>
              <p className="text-sm text-gray-500 dark:text-muted mb-6">No hay una caja abierta. Abre una para registrar ventas.</p>
              <button
                onClick={() => setShowOpen(true)}
                className="px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors inline-flex items-center gap-2 shadow-lg shadow-primary/20"
              >
                <Unlock className="h-5 w-5" /> Abrir caja
              </button>
            </div>
          ) : (
            /* Open register */
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600">
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Apertura</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(currentRegister.openingAmount)}</p>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600">
                      <Banknote className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Ventas efectivo</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(stats?.salesEfectivo ?? 0)}</p>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-purple-50 text-purple-600">
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Ventas digital</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(stats?.salesDigital ?? 0)}</p>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                      <Calculator className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Esperado caja</span>
                  </div>
                  <p className="text-lg font-extrabold text-primary">{fmt(stats?.expectedCash ?? 0)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setMvType("ingreso"); setShowMovement(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-colors"
                >
                  <ArrowUp className="h-3.5 w-3.5" /> Ingreso
                </button>
                <button
                  onClick={() => { setMvType("egreso"); setShowMovement(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 font-bold text-xs hover:bg-red-100 transition-colors"
                >
                  <ArrowDown className="h-3.5 w-3.5" /> Egreso
                </button>
                <button
                  onClick={() => { setArqueoAmount(""); setArqueoDenoms({}); setShowArqueo(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs hover:bg-blue-100 transition-colors"
                >
                  <Scan className="h-3.5 w-3.5" /> Arqueo Express
                </button>
                <div className="ml-auto">
                  <button
                    onClick={() => setShowClose(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white font-bold text-xs hover:bg-gray-800 transition-colors"
                  >
                    <Lock className="h-3.5 w-3.5" /> Cerrar caja
                  </button>
                </div>
              </div>

              {/* Info bar */}
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-muted">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Abierta: {fmtDate(currentRegister.openedAt)}
                </span>
                <span className="font-bold text-gray-600 dark:text-muted">{stats?.salesCount ?? 0} ventas</span>
              </div>

              {/* Movements list */}
              <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground">Movimientos</h3>
                </div>
                {currentRegister.movements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-gray-400 dark:text-muted">
                    <History className="h-5 w-5 mb-1" />
                    <p className="text-xs font-semibold">Sin movimientos</p>
                  </div>
                ) : (
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {currentRegister.movements.map(m => {
                      const isPos = ["venta", "ingreso", "apertura"].includes(m.type);
                      return (
                        <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", MOVEMENT_COLORS[m.type] || "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted")}>
                            {isPos ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 dark:text-foreground capitalize">{m.type}</p>
                            <p className="text-[10px] text-gray-400 dark:text-muted truncate">{m.description} {m.method !== "efectivo" ? `• ${m.method}` : ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cn("text-sm font-bold", isPos ? "text-emerald-600" : "text-red-500")}>
                              {isPos ? "+" : "−"}{fmt(m.amount)}
                            </p>
                          </div>
                          <span className="text-[10px] text-gray-400 dark:text-muted shrink-0 hidden sm:block">{fmtDate(m.createdAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* History view */}
      {view === "history" && (
        <div className="space-y-3">
          {closedRegisters.length === 0 ? (
            <div className="bg-white dark:bg-card rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border p-8 text-center text-gray-400 dark:text-muted">
              <History className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm font-semibold">Sin historial de cajas</p>
            </div>
          ) : (
            closedRegisters.map(r => {
              const diff = r.difference ?? 0;
              return (
                <button
                  key={r.id}
                  onClick={() => setDetailRegister(r)}
                  className="w-full bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 text-left hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-accent flex items-center justify-center">
                        <Lock className="h-4 w-4 text-gray-500 dark:text-muted" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900 dark:text-foreground">{fmtDateShort(r.openedAt)} → {r.closedAt ? fmtDateShort(r.closedAt) : "—"}</p>
                        <p className="text-[10px] text-gray-400 dark:text-muted">{r.movements.length} movimientos</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(r.closingAmount ?? 0)}</p>
                      <p className={cn("text-[10px] font-bold", diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400 dark:text-muted")}>
                        {diff > 0 ? "+" : ""}{fmt(diff)} diferencia
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-[10px] text-gray-400 dark:text-muted">
                    <span>Apertura: {fmt(r.openingAmount)}</span>
                    <span>Esperado: {fmt(r.expectedAmount ?? 0)}</span>
                    <span>Cierre: {fmt(r.closingAmount ?? 0)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Reconciliation view */}
      {view === "reconcile" && (() => {
        // Group closed registers by calendar day
        type DayRow = { date: string; count: number; totalExpected: number; totalClosing: number; totalDiff: number; hasAlert: boolean };
        const byDay = new Map<string, DayRow>();
        for (const r of closedRegisters) {
          const day = r.closedAt ? r.closedAt.slice(0, 10) : r.openedAt.slice(0, 10);
          const existing = byDay.get(day) ?? { date: day, count: 0, totalExpected: 0, totalClosing: 0, totalDiff: 0, hasAlert: false };
          existing.count++;
          existing.totalExpected += r.expectedAmount ?? 0;
          existing.totalClosing += r.closingAmount ?? 0;
          existing.totalDiff += r.difference ?? 0;
          existing.hasAlert = existing.hasAlert || Math.abs(r.difference ?? 0) > 1;
          byDay.set(day, existing);
        }
        const rows = Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));
        const totalDiscrepancy = rows.reduce((s, r) => s + Math.abs(r.totalDiff), 0);
        
        // Weekly cash flow computation (last 7 days)
        const today = new Date();
        const weekData: Array<{ date: string; income: number; expenses: number; net: number }> = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const dayRegs = closedRegisters.filter(r => {
            const rDate = r.closedAt ? r.closedAt.slice(0, 10) : r.openedAt.slice(0, 10);
            return rDate === dateStr;
          });
          let income = 0;
          let expenses = 0;
          for (const reg of dayRegs) {
            income += reg.openingAmount;
            for (const m of reg.movements) {
              if (m.type === "venta" || m.type === "ingreso") income += m.amount;
              else if (m.type === "egreso") expenses += m.amount;
            }
          }
          weekData.push({ date: dateStr, income, expenses, net: income - expenses });
        }
        const weekIncome = weekData.reduce((s, d) => s + d.income, 0);
        const weekExpenses = weekData.reduce((s, d) => s + d.expenses, 0);
        const weekNet = weekIncome - weekExpenses;
        const maxBar = Math.max(...weekData.map(d => Math.max(d.income, d.expenses)), 1);
        
        return (
          <div className="space-y-4">
            {/* Weekly Cash Flow Chart */}
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Flujo de Caja Semanal
                </h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                    <span className="text-gray-500 dark:text-muted">Ingresos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-red-500"></div>
                    <span className="text-gray-500 dark:text-muted">Egresos</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-2 mb-3">
                {weekData.map((day, idx) => {
                  const incomeH = maxBar > 0 ? (day.income / maxBar) * 80 : 0;
                  const expenseH = maxBar > 0 ? (day.expenses / maxBar) * 80 : 0;
                  const dayName = new Date(day.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" });
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="relative w-full h-20 flex items-end justify-center gap-0.5 mb-1">
                        <div
                          className="w-2.5 bg-emerald-500 rounded-t transition-all"
                          style={{ height: `${incomeH}px` }}
                          title={`Ingresos: ${fmt(day.income)}`}
                        ></div>
                        <div
                          className="w-2.5 bg-red-500 rounded-t transition-all"
                          style={{ height: `${expenseH}px` }}
                          title={`Egresos: ${fmt(day.expenses)}`}
                        ></div>
                      </div>
                      <p className="text-[9px] font-bold text-gray-400 dark:text-muted uppercase">{dayName}</p>
                      <p className={cn("text-[10px] font-bold", day.net >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {fmt(day.net)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="pt-3 border-t border-gray-100 dark:border-card-border flex items-center justify-between text-xs">
                <div className="text-emerald-600 font-bold">Ingresos: {fmt(weekIncome)}</div>
                <div className="text-red-500 font-bold">Egresos: {fmt(weekExpenses)}</div>
                <div className={cn("font-extrabold", weekNet >= 0 ? "text-emerald-600" : "text-red-500")}>
                  Neto: {fmt(weekNet)}
                </div>
              </div>
            </div>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{rows.length}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted">Días con cierres</p>
              </div>
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(rows.reduce((s, r) => s + r.totalClosing, 0))}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted">Total recaudado</p>
              </div>
              <div className={cn("border rounded-xl p-3 text-center", totalDiscrepancy > 10 ? "bg-red-50 border-red-200" : totalDiscrepancy > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200")}>
                <p className={cn("text-lg font-extrabold", totalDiscrepancy > 10 ? "text-red-600" : totalDiscrepancy > 0 ? "text-amber-600" : "text-emerald-600")}>{fmt(totalDiscrepancy)}</p>
                <p className="text-[10px] text-gray-400 dark:text-muted">Diferencia acumulada</p>
              </div>
            </div>
            {/* Daily rows */}
            {rows.length === 0 ? (
              <div className="bg-white dark:bg-card rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border p-8 text-center text-gray-400 dark:text-muted">
                <History className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm font-semibold">Sin cajas cerradas</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-card-border text-left">
                      <th className="px-4 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Fecha</th>
                      <th className="px-4 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Esperado</th>
                      <th className="px-4 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Real</th>
                      <th className="px-4 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Diferencia</th>
                      <th className="px-4 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(row => {
                      const diff = row.totalDiff;
                      const isOk = Math.abs(diff) <= 1;
                      const isMinor = !isOk && Math.abs(diff) <= 10;
                      return (
                        <tr key={row.date} className={cn("transition-colors", !isOk && "bg-red-50/30")}>
                          <td className="px-4 py-3">
                            <p className="font-bold text-gray-900 dark:text-foreground">{new Date(row.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}</p>
                            <p className="text-gray-400 dark:text-muted">{row.count} caja{row.count > 1 ? "s" : ""}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-muted font-semibold">{fmt(row.totalExpected)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-foreground">{fmt(row.totalClosing)}</td>
                          <td className={cn("px-4 py-3 text-right font-extrabold", isOk ? "text-emerald-600" : isMinor ? "text-amber-600" : "text-red-600")}>
                            {diff > 0 ? "+" : ""}{fmt(diff)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isOk ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold"><Check className="h-3 w-3" />OK</span>
                            ) : isMinor ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold"><AlertTriangle className="h-3 w-3" />Menor</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold"><AlertTriangle className="h-3 w-3" />Alerta</span>
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
        );
      })()}

      {/* Open register modal */}
      {showOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowOpen(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
              <Unlock className="h-4 w-4 text-primary" /> Abrir caja
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">Monto de apertura</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted font-bold text-sm">S/</span>
                  <input
                    type="number"
                    min="0"
                    step="0.10"
                    value={openAmount}
                    onChange={e => setOpenAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">Notas (opcional)</label>
                <input
                  type="text"
                  value={openNotes}
                  onChange={e => setOpenNotes(e.target.value)}
                  placeholder="Observaciones"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowOpen(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
                  Cancelar
                </button>
                <button
                  onClick={handleOpen}
                  disabled={opening}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                  Abrir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Close register modal */}
      {showClose && currentRegister && (() => {
        // Shift summary computation
        const openTime = new Date(currentRegister.openedAt);
        const nowTime = new Date();
        const durationMs = nowTime.getTime() - openTime.getTime();
        const durationH = Math.floor(durationMs / (1000 * 60 * 60));
        const durationM = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const durationStr = `${durationH}h ${durationM}min`;
        const ventasMvs = currentRegister.movements.filter(m => m.type === "venta");
        const ventasCount = ventasMvs.length;
        const ventasEfectivo = ventasMvs.filter(m => m.method === "efectivo").reduce((s, m) => s + m.amount, 0);
        const ventasDigital = ventasMvs.filter(m => m.method !== "efectivo").reduce((s, m) => s + m.amount, 0);
        const ingresosManual = currentRegister.movements.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
        const egresosManual = currentRegister.movements.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
        const totalVentas = ventasEfectivo + ventasDigital;
        const promedioVenta = ventasCount > 0 ? totalVentas / ventasCount : 0;
        
        // Denominations
        const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
        const denomTotal = DENOMS.reduce((s, d) => s + d * (denominations[String(d)] ?? 0), 0);
        const handleDenomClick = (denom: number) => {
          const key = String(denom);
          setDenominations(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
          setCloseAmount(String((denomTotal + denom).toFixed(2)));
        };
        const handleDenomReset = () => {
          setDenominations({});
          setCloseAmount("");
        };
        
        return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowClose(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4 text-gray-900 dark:text-foreground" /> Cerrar caja
            </h3>
            
            {/* Shift Summary */}
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl p-4 mb-4 border border-indigo-100 dark:border-indigo-900/30">
              <h4 className="text-xs font-extrabold text-gray-900 dark:text-foreground mb-2 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                Resumen del turno
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500 dark:text-muted">Duración</p>
                  <p className="font-bold text-gray-900 dark:text-foreground">{durationStr}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-muted">Total ventas</p>
                  <p className="font-bold text-gray-900 dark:text-foreground">{ventasCount}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-muted">Efectivo</p>
                  <p className="font-bold text-emerald-600">{fmt(ventasEfectivo)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-muted">Digital</p>
                  <p className="font-bold text-purple-600">{fmt(ventasDigital)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-muted">Ingresos manuales</p>
                  <p className="font-bold text-blue-600">{fmt(ingresosManual)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-muted">Egresos manuales</p>
                  <p className="font-bold text-red-600">{fmt(egresosManual)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500 dark:text-muted">Promedio por venta</p>
                  <p className="font-bold text-gray-900 dark:text-foreground">{fmt(promedioVenta)}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 mb-4 border border-blue-100 dark:border-blue-900/30">
              <p className="text-xs text-blue-700 dark:text-blue-400">
                <strong>Esperado en caja:</strong> {fmt(stats?.expectedCash ?? 0)}
              </p>
              <p className="text-[10px] text-blue-600 dark:text-blue-500 mt-0.5">
                Apertura ({fmt(currentRegister.openingAmount)}) + Ventas efectivo ({fmt(stats?.salesEfectivo ?? 0)}) + Ingresos ({fmt(stats?.totalIn ?? 0)}) − Egresos ({fmt(stats?.totalOut ?? 0)})
              </p>
            </div>
            <div className="space-y-3">
              {/* Denomination Helper */}
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center gap-1">
                    <Banknote className="h-3.5 w-3.5 text-primary" />
                    Contador de denominaciones
                  </label>
                  {Object.keys(denominations).length > 0 && (
                    <button
                      onClick={handleDenomReset}
                      className="text-[10px] text-red-500 hover:text-red-600 font-bold"
                    >
                      Resetear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {DENOMS.map(d => (
                    <button
                      key={d}
                      onClick={() => handleDenomClick(d)}
                      className="relative px-2 py-2 rounded-lg bg-white dark:bg-card border-2 border-gray-200 dark:border-card-border hover:border-primary hover:bg-primary/5 transition-all text-xs font-bold text-gray-900 dark:text-foreground"
                    >
                      S/{d.toFixed(2)}
                      {(denominations[String(d)] ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-white text-[9px] flex items-center justify-center">
                          {denominations[String(d)]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {denomTotal > 0 && (
                  <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-600 dark:text-muted">Total contado por denominaciones</p>
                    <p className="text-sm font-extrabold text-primary">{fmt(denomTotal)}</p>
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">Monto contado en caja</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted font-bold text-sm">S/</span>
                  <input
                    type="number"
                    min="0"
                    step="0.10"
                    value={closeAmount}
                    onChange={e => setCloseAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                {closeAmount && (
                  <div className={cn(
                    "mt-2 rounded-xl p-2 text-center text-xs font-bold",
                    Number(closeAmount) - (stats?.expectedCash ?? 0) >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600" : "bg-red-50 dark:bg-red-950/20 text-red-500"
                  )}>
                    Diferencia: {Number(closeAmount) - (stats?.expectedCash ?? 0) > 0 ? "+" : ""}{fmt(Number(closeAmount) - (stats?.expectedCash ?? 0))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">Notas (opcional)</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  placeholder="Observaciones"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowClose(false); setDenominations({}); }} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
                  Cancelar
                </button>
                <button
                  onClick={handleClose}
                  disabled={closing || !closeAmount}
                  className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Add movement modal */}
      {showMovement && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowMovement(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
              {mvType === "ingreso" ? <ArrowUp className="h-4 w-4 text-emerald-600" /> : <ArrowDown className="h-4 w-4 text-red-500" />}
              {mvType === "ingreso" ? "Registrar ingreso" : "Registrar egreso"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">Monto</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted font-bold text-sm">S/</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.10"
                    value={mvAmount}
                    onChange={e => setMvAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">Descripción</label>
                <input
                  type="text"
                  value={mvDescription}
                  onChange={e => setMvDescription(e.target.value)}
                  placeholder={mvType === "ingreso" ? "Ej: Cobro pendiente" : "Ej: Pago a proveedor"}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowMovement(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
                  Cancelar
                </button>
                <button
                  onClick={handleAddMovement}
                  disabled={addingMv || !mvAmount}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1",
                    mvType === "ingreso" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-500 hover:bg-red-600"
                  )}
                >
                  {addingMv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Registrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Arqueo Express modal */}
      {showArqueo && currentRegister && (() => {
        const ARQUEO_DENOMS = [100, 50, 20, 10, 5, 1];
        const arqueoTotal = ARQUEO_DENOMS.reduce((s, d) => s + d * (arqueoDenoms[String(d)] ?? 0), 0);
        const handleArqueoDenomClick = (denom: number) => {
          const key = String(denom);
          setArqueoDenoms(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
          setArqueoAmount(String((arqueoTotal + denom).toFixed(2)));
        };
        const handleArqueoReset = () => {
          setArqueoDenoms({});
          setArqueoAmount("");
        };
        const expectedCash = stats?.expectedCash ?? 0;
        const countedCash = Number(arqueoAmount) || 0;
        const difference = countedCash - expectedCash;
        
        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowArqueo(false)}>
            <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
                <Scan className="h-4 w-4 text-blue-600" /> Arqueo Express
              </h3>
              
              <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-4 mb-4 border border-blue-100 dark:border-blue-900/30">
                <h4 className="text-xs font-extrabold text-gray-900 dark:text-foreground mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5 text-blue-600" />
                  Verificación rápida de caja
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-500 dark:text-muted">Esperado en caja</p>
                    <p className="font-bold text-blue-600">{fmt(expectedCash)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-muted">Contado</p>
                    <p className="font-bold text-gray-900 dark:text-foreground">{fmt(countedCash)}</p>
                  </div>
                </div>
                <p className="text-[10px] text-blue-600 dark:text-blue-500 mt-2">
                  Apertura ({fmt(currentRegister.openingAmount)}) + Ventas efectivo ({fmt(stats?.salesEfectivo ?? 0)}) + Ingresos ({fmt(stats?.totalIn ?? 0)}) − Egresos ({fmt(stats?.totalOut ?? 0)})
                </p>
              </div>
              
              <div className="space-y-3">
                {/* Quick Denomination Counter */}
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center gap-1">
                      <Banknote className="h-3.5 w-3.5 text-primary" />
                      Conteo rápido
                    </label>
                    {Object.keys(arqueoDenoms).length > 0 && (
                      <button
                        onClick={handleArqueoReset}
                        className="text-[10px] text-red-500 hover:text-red-600 font-bold"
                      >
                        Resetear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {ARQUEO_DENOMS.map(d => (
                      <button
                        key={d}
                        onClick={() => handleArqueoDenomClick(d)}
                        className="relative px-3 py-3 rounded-lg bg-white dark:bg-card border-2 border-gray-200 dark:border-card-border hover:border-primary hover:bg-primary/5 transition-all text-sm font-bold text-gray-900 dark:text-foreground"
                      >
                        S/{d}
                        {(arqueoDenoms[String(d)] ?? 0) > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
                            {arqueoDenoms[String(d)]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {arqueoTotal > 0 && (
                    <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-gray-600 dark:text-muted">Total contado</p>
                      <p className="text-base font-extrabold text-primary">{fmt(arqueoTotal)}</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-muted">Monto total verificado</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted font-bold text-sm">S/</span>
                    <input
                      type="number"
                      min="0"
                      step="0.10"
                      value={arqueoAmount}
                      onChange={e => setArqueoAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary"
                      autoFocus
                    />
                  </div>
                </div>
                
                {/* Difference Badge */}
                {arqueoAmount && (
                  <div className={cn(
                    "rounded-xl p-3 text-center border-2",
                    Math.abs(difference) < 0.5
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30"
                      : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30"
                  )}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {Math.abs(difference) < 0.5 ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase">Diferencia</span>
                    </div>
                    <p className={cn(
                      "text-2xl font-extrabold",
                      Math.abs(difference) < 0.5 ? "text-emerald-600" : "text-red-500"
                    )}>
                      {difference >= 0 ? "+" : ""}{fmt(difference)}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-muted mt-1">
                      {Math.abs(difference) < 0.5 
                        ? "✓ Cuadra correctamente" 
                        : difference > 0 
                          ? "Hay más efectivo del esperado" 
                          : "Falta efectivo"}
                    </p>
                  </div>
                )}
                
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-200 dark:border-amber-900/30">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Nota importante
                  </p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
                    El arqueo express NO cierra la caja. Solo registra una verificación intermedia para control.
                  </p>
                </div>
                
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setShowArqueo(false); setArqueoDenoms({}); }} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
                    Cancelar
                  </button>
                  <button
                    onClick={handleArqueoExpress}
                    disabled={addingArqueo || !arqueoAmount}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {addingArqueo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Registrar arqueo
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Detail register modal (history) */}
      {detailRegister && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetailRegister(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground">Detalle de caja</h3>
                <p className="text-[10px] text-gray-400 dark:text-muted">{fmtDate(detailRegister.openedAt)} → {detailRegister.closedAt ? fmtDate(detailRegister.closedAt) : "—"}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => window.print()} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent print:hidden" title="Imprimir resumen">
                  <Printer className="h-4 w-4 text-gray-500 dark:text-muted" />
                </button>
                <button onClick={() => setDetailRegister(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent print:hidden">
                  <X className="h-4 w-4 text-gray-500 dark:text-muted" />
                </button>
              </div>
            </div>
            {/* Summary */}
            <div className="px-4 py-3 border-b bg-gray-50 dark:bg-surface grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-gray-400 dark:text-muted font-bold">Apertura</p>
                <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(detailRegister.openingAmount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-muted font-bold">Esperado</p>
                <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(detailRegister.expectedAmount ?? 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 dark:text-muted font-bold">Cierre</p>
                <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{fmt(detailRegister.closingAmount ?? 0)}</p>
              </div>
            </div>
            {/* Payment method breakdown */}
            {(() => {
              const sales = detailRegister.movements.filter(m => m.type === "venta");
              const byMethod: Record<string, number> = {};
              for (const s of sales) {
                byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
              }
              const methods = Object.entries(byMethod);
              if (methods.length === 0) return null;
              const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta" };
              return (
                <div className="px-4 py-2.5 border-b bg-white dark:bg-card">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase mb-1.5">Ventas por método</p>
                  <div className="flex flex-wrap gap-3">
                    {methods.map(([m, total]) => (
                      <div key={m} className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-500 dark:text-muted">{PAY_LABELS[m] ?? m}:</span>
                        <span className="font-bold text-gray-900 dark:text-foreground">{fmt(total)}</span>
                        <span className="text-gray-300 dark:text-muted">({sales.filter(s => s.method === m).length})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className={cn(
              "px-4 py-2 text-center text-xs font-bold border-b",
              (detailRegister.difference ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
            )}>
              Diferencia: {(detailRegister.difference ?? 0) > 0 ? "+" : ""}{fmt(detailRegister.difference ?? 0)}
            </div>
            {/* Movements */}
            <div className="flex-1 overflow-y-auto divide-y">
              {detailRegister.movements.map(m => {
                const isPos = ["venta", "ingreso", "apertura"].includes(m.type);
                return (
                  <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", MOVEMENT_COLORS[m.type] || "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted")}>
                      {isPos ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-foreground capitalize">{m.type}</p>
                      <p className="text-[10px] text-gray-400 dark:text-muted truncate">{m.description}</p>
                    </div>
                    <p className={cn("text-xs font-bold shrink-0", isPos ? "text-emerald-600" : "text-red-500")}>
                      {isPos ? "+" : "−"}{fmt(m.amount)}
                    </p>
                    <span className="text-[10px] text-gray-400 dark:text-muted shrink-0">{fmtDate(m.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

