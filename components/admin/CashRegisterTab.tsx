﻿"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calculator, DollarSign, ArrowUp, ArrowDown, Clock,
  Loader2, Check, X, Banknote, History, RefreshCw,
  Lock, Unlock, Printer,
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

type View = "current" | "history";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }
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
  // Add movement dialog
  const [showMovement, setShowMovement] = useState(false);
  const [mvType, setMvType] = useState<"ingreso" | "egreso">("ingreso");
  const [mvAmount, setMvAmount] = useState("");
  const [mvDescription, setMvDescription] = useState("");
  const [addingMv, setAddingMv] = useState(false);
  // View register detail
  const [detailRegister, setDetailRegister] = useState<CashRegister | null>(null);

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
      {showClose && currentRegister && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowClose(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-2 flex items-center gap-2">
              <Lock className="h-4 w-4 text-gray-900 dark:text-foreground" /> Cerrar caja
            </h3>
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700">
                <strong>Esperado en caja:</strong> {fmt(stats?.expectedCash ?? 0)}
              </p>
              <p className="text-[10px] text-blue-500 mt-0.5">
                Apertura ({fmt(currentRegister.openingAmount)}) + Ventas efectivo ({fmt(stats?.salesEfectivo ?? 0)}) + Ingresos ({fmt(stats?.totalIn ?? 0)}) − Egresos ({fmt(stats?.totalOut ?? 0)})
              </p>
            </div>
            <div className="space-y-3">
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
                    Number(closeAmount) - (stats?.expectedCash ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
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
                <button onClick={() => setShowClose(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
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
      )}

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
