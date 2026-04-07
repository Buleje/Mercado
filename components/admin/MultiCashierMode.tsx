"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, X, LogOut, BarChart2, Clock, ShoppingBasket,
  CheckCircle, AlertCircle, ChevronRight, User, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CashierSale {
  id: string;
  total: number;
  items: number;
  payment: string;
  createdAt: string;
}

interface CashierSession {
  id: string;
  name: string;
  startedAt: string;
  closedAt?: string;
  sales: CashierSale[];
}

type ViewMode = "selector" | "active" | "admin";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "bodega_cashier_sessions";
const ACTIVE_CASHIER_KEY = "bodega_active_cashier";

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
  catch { return iso; }
}

function loadSessions(): CashierSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: CashierSession[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function getActiveCashierId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_CASHIER_KEY);
}

function setActiveCashierId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_CASHIER_KEY, id);
  else localStorage.removeItem(ACTIVE_CASHIER_KEY);
}

function sessionStats(session: CashierSession) {
  const total = session.sales.reduce((s, sale) => s + sale.total, 0);
  const count = session.sales.length;
  const avg = count > 0 ? total / count : 0;
  return { total, count, avg };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/50">
      <span className="text-base font-black text-primary">{value}</span>
      <span className="text-xs text-gray-500 dark:text-muted">{label}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface MultiCashierModeProps {
  /** Called when a cashier is selected — host POS can use active cashier info */
  onCashierChange?: (cashierId: string | null, cashierName: string | null) => void;
  className?: string;
}

export default function MultiCashierMode({ onCashierChange, className }: MultiCashierModeProps) {
  const [sessions, setSessions] = useState<CashierSession[]>([]);
  const [activeCashierId, setActiveCashierIdState] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("selector");
  const [newName, setNewName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [closingSummary, setClosingSummary] = useState<CashierSession | null>(null);

  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    const activeId = getActiveCashierId();
    if (activeId && loaded.find((s) => s.id === activeId && !s.closedAt)) {
      setActiveCashierIdState(activeId);
      setView("active");
    }
  }, []);

  const persist = useCallback((updated: CashierSession[]) => {
    setSessions(updated);
    saveSessions(updated);
  }, []);

  // Active sessions (not closed)
  const openSessions = sessions.filter((s) => !s.closedAt);
  const activeSession = sessions.find((s) => s.id === activeCashierId);

  // Select cashier
  const selectCashier = (session: CashierSession) => {
    setActiveCashierIdState(session.id);
    setActiveCashierId(session.id);
    setView("active");
    onCashierChange?.(session.id, session.name);
  };

  // Add new cashier
  const addCashier = () => {
    const name = newName.trim();
    if (!name) return;

    const session: CashierSession = {
      id: Date.now().toString(),
      name,
      startedAt: new Date().toISOString(),
      sales: [],
    };
    const updated = [session, ...sessions];
    persist(updated);
    setNewName("");
    setShowAddForm(false);
    selectCashier(session);
  };

  // Close shift
  const closeShift = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    setClosingSummary(session);
    const updated = sessions.map((s) =>
      s.id === sessionId ? { ...s, closedAt: new Date().toISOString() } : s
    );
    persist(updated);
    if (activeCashierId === sessionId) {
      setActiveCashierIdState(null);
      setActiveCashierId(null);
      onCashierChange?.(null, null);
      setView("selector");
    }
  };

  // Register sale (called externally via ref or from parent)
  const registerSale = useCallback((cashierId: string, sale: Omit<CashierSale, "id">) => {
    const updated = sessions.map((s) => {
      if (s.id !== cashierId) return s;
      return { ...s, sales: [...s.sales, { ...sale, id: Date.now().toString() }] };
    });
    persist(updated);
  }, [sessions, persist]);

  // Expose for parent usage
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as typeof window & { __multiCashierRegisterSale?: typeof registerSale }).__multiCashierRegisterSale = registerSale;
    }
  }, [registerSale]);

  return (
    <div className={cn("rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-card-border bg-gray-50 dark:bg-gray-900/50">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-gray-900 dark:text-foreground">Multi-Cajero</span>
        <div className="ml-auto flex items-center gap-2">
          {openSessions.length > 0 && (
            <span className="text-xs font-medium text-gray-500 dark:text-muted">{openSessions.length} activo{openSessions.length !== 1 ? "s" : ""}</span>
          )}
          <button type="button" onClick={() => setView("admin")}
            className={cn("text-xs px-2 py-1 rounded-lg font-medium transition-colors",
              view === "admin" ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-muted hover:bg-gray-200"
            )}>
            <BarChart2 className="h-3.5 w-3.5 inline mr-1" />
            Resumen
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Closing summary overlay ── */}
        {closingSummary && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Turno cerrado — {closingSummary.name}</span>
              </div>
              <button type="button" onClick={() => setClosingSummary(null)}>
                <X className="h-4 w-4 text-emerald-400" />
              </button>
            </div>
            {(() => {
              const { total, count, avg } = sessionStats(closingSummary);
              return (
                <div className="grid grid-cols-3 gap-2">
                  <StatBadge label="Ventas" value={count.toString()} />
                  <StatBadge label="Total" value={`S/${total.toFixed(0)}`} />
                  <StatBadge label="Ticket avg" value={`S/${avg.toFixed(0)}`} />
                </div>
              );
            })()}
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Inicio: {fmtTime(closingSummary.startedAt)} — Cierre: {fmtTime(closingSummary.closedAt ?? new Date().toISOString())}
            </p>
          </div>
        )}

        {/* ── Selector view ── */}
        {view === "selector" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-muted">Quien esta cobrando?</p>

            {/* Open sessions */}
            {openSessions.length > 0 && (
              <div className="space-y-2">
                {openSessions.map((session) => {
                  const { total, count } = sessionStats(session);
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => selectCashier(session)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 dark:border-card-border hover:border-primary bg-white dark:bg-card transition-all group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-800 dark:text-foreground">{session.name}</p>
                        <p className="text-xs text-gray-500 dark:text-muted">
                          Desde {fmtTime(session.startedAt)} · {count} venta{count !== 1 ? "s" : ""} · {fmt(total)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Add new cashier */}
            {showAddForm ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCashier(); if (e.key === "Escape") setShowAddForm(false); }}
                  placeholder="Nombre del cajero"
                  autoFocus
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-foreground focus:outline-none focus:border-primary"
                />
                <button type="button" onClick={addCashier}
                  className="px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border text-gray-500 hover:text-gray-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border text-sm text-gray-500 dark:text-muted hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar cajero
              </button>
            )}
          </div>
        )}

        {/* ── Active session view ── */}
        {view === "active" && activeSession && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-foreground">{activeSession.name}</p>
                <p className="text-xs text-gray-500 dark:text-muted">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Turno desde {fmtTime(activeSession.startedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setView("selector"); setActiveCashierIdState(null); setActiveCashierId(null); onCashierChange?.(null, null); }}
                className="ml-auto text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:border-gray-300 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Cambiar
              </button>
            </div>

            {/* Stats */}
            {(() => {
              const { total, count, avg } = sessionStats(activeSession);
              return (
                <div className="grid grid-cols-3 gap-2">
                  <StatBadge label="Ventas" value={count.toString()} />
                  <StatBadge label="Total" value={`S/${total.toFixed(0)}`} />
                  <StatBadge label="Ticket avg" value={avg > 0 ? `S/${avg.toFixed(0)}` : "—"} />
                </div>
              );
            })()}

            {/* Recent sales */}
            {activeSession.sales.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">Ultimas ventas</p>
                {[...activeSession.sales].reverse().slice(0, 5).map((sale) => (
                  <div key={sale.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 dark:border-card-border last:border-0">
                    <ShoppingBasket className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    <span className="text-gray-500 dark:text-muted">{fmtTime(sale.createdAt)}</span>
                    <span className="text-gray-600 dark:text-muted flex-1">{sale.items} item{sale.items !== 1 ? "s" : ""}</span>
                    <span className="font-semibold text-primary">{fmt(sale.total)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Close shift */}
            <button
              type="button"
              onClick={() => closeShift(activeSession.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar turno
            </button>
          </div>
        )}

        {/* ── Admin view ── */}
        {view === "admin" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-foreground">Sesiones de hoy</p>
              <button type="button" onClick={() => setView(activeCashierId ? "active" : "selector")}
                className="text-xs text-primary hover:underline">
                Volver
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-gray-300 dark:text-gray-600">
                <Users className="h-8 w-8" />
                <p className="text-sm">Sin sesiones registradas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const { total, count, avg } = sessionStats(session);
                  return (
                    <div key={session.id} className="rounded-xl border border-gray-100 dark:border-card-border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-semibold text-gray-800 dark:text-foreground flex-1">{session.name}</span>
                        {session.closedAt ? (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-muted">Cerrado</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">Activo</span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="text-center">
                          <p className="text-sm font-bold text-primary">{count}</p>
                          <p className="text-xs text-gray-400 dark:text-muted">ventas</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-primary">S/{total.toFixed(0)}</p>
                          <p className="text-xs text-gray-400 dark:text-muted">total</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-primary">{avg > 0 ? `S/${avg.toFixed(0)}` : "—"}</p>
                          <p className="text-xs text-gray-400 dark:text-muted">ticket</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-muted">
                        {fmtDate(session.startedAt)} {fmtTime(session.startedAt)}
                        {session.closedAt ? ` → ${fmtTime(session.closedAt)}` : " (en curso)"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Grand total */}
            {sessions.length > 0 && (() => {
              const grandTotal = sessions.reduce((s, sess) => s + sessionStats(sess).total, 0);
              const grandCount = sessions.reduce((s, sess) => s + sessionStats(sess).count, 0);
              return (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20">
                  <span className="text-sm font-semibold text-gray-700 dark:text-foreground">Total del dia</span>
                  <div className="text-right">
                    <p className="text-base font-black text-primary">{fmt(grandTotal)}</p>
                    <p className="text-xs text-gray-500 dark:text-muted">{grandCount} ventas</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
