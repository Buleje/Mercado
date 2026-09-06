"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Calculator, DollarSign, ArrowUp, ArrowDown, Clock,
  Loader2, Check, X, Banknote, History, RefreshCw,
  Lock, Unlock, Printer, AlertTriangle, Scan, Info,
  Settings, Smartphone, CreditCard, Camera,
} from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { CardTitle, EmptyState, LoadingState, WarningAlert } from "@buleje/design-system";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { Field } from "@/components/admin/shared/Field";
import { activateProps } from "@/components/admin/shared/a11y";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { diaLocal, ultimosDiasLocales } from "@/lib/fechas/dia-local";

const CashRegisterChart = dynamic(
  () => import("./cash-register/CashRegisterChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 animate-pulse bg-[var(--surface-sunken)] rounded-xl" />
    ),
  }
);

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

type View = "current" | "history" | "reconcile" | "auditoria";
type MethodFilter = "all" | "efectivo" | "yape" | "plin" | "tarjeta";

function fmt(n: number) { return `S/${n.toFixed(2)}`; }

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]" aria-label="Ayuda sobre Caja Registradora">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-80 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm mb-2">Caja Registradora</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Controla las aperturas y cierres de caja, registra ingresos y egresos manuales, y consulta el historial de sesiones anteriores.</p>
          <div className="space-y-1.5">
            <p><span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Actual:</span> <span className="text-[var(--text-secondary)] dark:text-muted">muestra la caja abierta ahora (saldo, movimientos del día).</span></p>
            <p><span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Historial:</span> <span className="text-[var(--text-secondary)] dark:text-muted">listado de todas las sesiones cerradas con su diferencia.</span></p>
            <p><span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Ingreso / Egreso:</span> <span className="text-[var(--text-secondary)] dark:text-muted">ejemplo: registrar S/50 de egreso por compra de bolsas.</span></p>
          </div>
          <div className="mt-3 bg-primary/10 dark:bg-primary/15 rounded-xl p-2">
            <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">Ejemplo</p>
            <p className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Valentina abre caja con S/200, vende durante el turno y al cerrar el sistema le dice si hay faltante o sobrante.</p>
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
  venta: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12",
  ingreso: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12",
  egreso: "text-[var(--data-error-500)] bg-[var(--data-error-50)]",
  apertura: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]",
  cierre: "text-[var(--text-secondary)] dark:text-muted bg-[var(--surface-sunken)] dark:bg-accent",
};

// ── IDEA 3: Conciliacion Yape/Plin ──────────────────────────────────────────

function YapePlinConciliation({ breakdown }: { breakdown: Record<string, number> }) {
  const [concilTab, setConcilTab] = useState<"yape" | "plin">(breakdown["yape"] ? "yape" : "plin");
  const [concilAmount, setConcilAmount] = useState("");
  const [concilHistory, setConcilHistory] = useState<{ fecha: string; ventasDigital: number; saldoApp: number; diferencia: number; metodo: string }[]>(() => {
    try { const raw = localStorage.getItem("buleje-concil-history"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });

  const ventasDigital = breakdown[concilTab] ?? 0;
  const saldoIngresado = Number(concilAmount) || 0;
  const diferencia = saldoIngresado - ventasDigital;
  const cuadra = concilAmount ? Math.abs(diferencia) <= 5 : false;

  const guardarConciliacion = () => {
    if (!concilAmount) return;
    const entry = { fecha: new Date().toISOString(), ventasDigital, saldoApp: saldoIngresado, diferencia, metodo: concilTab };
    const updated = [entry, ...concilHistory].slice(0, 5);
    setConcilHistory(updated);
    localStorage.setItem("buleje-concil-history", JSON.stringify(updated));
    setConcilAmount("");
  };

  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4">
      <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
        <Smartphone className="h-4 w-4 text-[var(--text-secondary)]" /> Conciliacion Digital
      </p>
      <div className="flex gap-1 mb-3">
        {(["yape", "plin"] as const).filter(m => breakdown[m]).map(m => (
          <button key={m} onClick={() => { setConcilTab(m); setConcilAmount(""); }}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize", concilTab === m ? (m === "yape" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--data-info-100)] text-[var(--data-info-500)]") : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">Ventas {concilTab} hoy</p>
          <p className={cn("text-xl font-extrabold font-mono", concilTab === "yape" ? "text-[var(--text-secondary)]" : "text-[var(--data-info-500)]")}>{fmt(ventasDigital)}</p>
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">Saldo en tu app</p>
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--text-secondary)]">S/</span>
            <input type="number" value={concilAmount} onChange={e => setConcilAmount(e.target.value)} placeholder="0.00" step="0.50"
              className="w-28 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-mono text-right bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary" />
          </div>
        </div>
      </div>
      {concilAmount && (
        <div className={cn("rounded-lg p-3 mb-3 text-center", cuadra ? "bg-primary/10 dark:bg-primary/15" : "bg-[var(--data-warning-50)] dark:bg-amber-950/20")}>
          {cuadra ? (
            <p className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Cuadra perfecto{diferencia !== 0 ? ` (dif. S/${diferencia.toFixed(2)})` : ""}</p>
          ) : (
            <p className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
              Diferencia de S/{Math.abs(diferencia).toFixed(2)} — {diferencia > 0 ? "sobrante" : "revisa si hay transferencias personales"}
            </p>
          )}
          <button onClick={guardarConciliacion} className="mt-2 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors">
            Anotar conciliacion
          </button>
        </div>
      )}
      {concilHistory.length > 0 && (
        <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-2 mt-2">
          <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-1.5">Ultimas conciliaciones</p>
          <div className="space-y-1">
            {concilHistory.slice(0, 3).map((h, i) => {
              const dateStr = (() => { try { return new Date(h.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return ""; } })();
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">{dateStr} · <span className="capitalize font-medium">{h.metodo}</span></span>
                  <span className={cn("font-bold", Math.abs(h.diferencia) <= 5 ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")}>
                    {h.diferencia >= 0 ? "+" : ""}S/{Number(h.diferencia).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CashRegisterTab() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("current");
  /** Rastro de auditoría: quién abrió, cerró o movió plata, y cuándo. */
  const [trail, setTrail] = useState<{ id: string; action: string; entity: string; detail: string; user: string; createdAt: string }[] | null>(null);
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
  const [mvMotivo, setMvMotivo] = useState("");
  const [mvDescription, setMvDescription] = useState("");
  const [addingMv, setAddingMv] = useState(false);
  // View register detail
  const [detailRegister, setDetailRegister] = useState<CashRegister | null>(null);
  // Movements filter
  const [mvFilter, setMvFilter] = useState<MethodFilter>("all");
  // Expanded movement detail
  const [expandedMovIdx, setExpandedMovIdx] = useState<number | null>(null);
  // History search
  const [historySearch, setHistorySearch] = useState("");
  // Arqueo Express
  const [showArqueo, setShowArqueo] = useState(false);
  const [arqueoAmount, setArqueoAmount] = useState("");
  const [arqueoDenoms, setArqueoDenoms] = useState<Record<string, number>>({});
  const [addingArqueo, setAddingArqueo] = useState(false);
  const [arqueoError, setArqueoError] = useState<string | null>(null);
  // Arqueo Guiado
  const [showArqueoGuiado, setShowArqueoGuiado] = useState(false);
  const [guiadoBilletes, setGuiadoBilletes] = useState<Record<string, number>>({});
  const [guiadoMonedas, setGuiadoMonedas] = useState<Record<string, number>>({});
  const [addingArqueoGuiado, setAddingArqueoGuiado] = useState(false);
  /**
   * Error de abrir caja, cerrar caja o registrar un movimiento.
   *
   * Los tres hacían `await fetch(...)` sin mirar la respuesta, con
   * `catch { /* ignore *\/ }`, y limpiaban el modal igual: el cajero cerraba
   * la caja, veía la pantalla volver a la normalidad y seguía trabajando sin
   * saber que no se había guardado nada.
   */
  const [cajaError, setCajaError] = useState<string | null>(null);
  // Mejora 12: Tolerancia configurable
  const [cashTolerance, setCashTolerance] = useState(() => {
    try { const v = localStorage.getItem("cash-tolerance"); return v ? Number(v) : 5; } catch { return 5; }
  });
  const [showToleranceConfig, setShowToleranceConfig] = useState(false);

  // (Mejora 5 & 6: timeline + breakdown are computed via useMemo below)

  // Mejora 9: Arqueo por metodo
  const [arqueoTab, setArqueoTab] = useState<"efectivo" | "yape" | "plin" | "tarjeta">("efectivo");
  const [arqueoYape, setArqueoYape] = useState("");
  const [arqueoPlin, setArqueoPlin] = useState("");
  const [arqueoTarjeta, setArqueoTarjeta] = useState("");

  // Mejora 10: Foto del arqueo
  const [arqueoFoto, setArqueoFoto] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Umbral de alerta de exceso de efectivo: viene de Settings (cashAlertMax),
  // configurable en Configuración → Caja. Antes se leía de localStorage (default
  // 1000) e IGNORABA el valor que el dueño configuraba. Brandon 2026-06-20.
  const [cashAlertMax, setCashAlertMax] = useState<number>(500);
  useEffect(() => {
    let active = true;
    // credentials same-origin: /api/settings sólo devuelve cashAlertMax al caller
    // con sesión admin (tryAdmin); sin la cookie el campo se strippea (ADMIN_ONLY).
    fetch("/api/settings", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const v = Number(d?.cashAlertMax);
        if (active && Number.isFinite(v) && v > 0) setCashAlertMax(v);
      })
      .catch(() => { /* mantiene el default si falla */ });
    return () => { active = false; };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-registers");
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setRegisters(Array.isArray(data) ? data : data?.items ?? data?.registers ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

   
  useEffect(() => { void fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const currentRegister = useMemo(() => registers.find(r => r.status === "abierta") || null, [registers]);
  const closedRegisters = useMemo(() => registers.filter(r => r.status === "cerrada"), [registers]);

  // Mejora 5: Compute timeline from movements (derived state)
  const computedTimeline = useMemo(() => {
    if (!currentRegister) return [];
    const items: { time: string; type: string; description: string; amount: number; badge: string; method?: string; saleId?: string; movementId?: string }[] = [];
    // QA Brandon 2026-06-10 #7: la DB ya registra un movimiento type "apertura"
    // ("Apertura de caja") al abrir la caja. Antes acá se agregaba SIEMPRE un
    // ítem sintético "Apertura de turno" extra → el timeline mostraba +S/100
    // DOS veces (mismo dinero, dos vistas). El sintético queda solo como
    // fallback para registros legacy sin movimiento de apertura en DB.
    const hasAperturaMovement = currentRegister.movements.some(
      (m) => m.type === "apertura",
    );
    if (!hasAperturaMovement) {
      items.push({
        time: currentRegister.openedAt,
        type: "apertura",
        description: "Apertura de turno",
        amount: currentRegister.openingAmount,
        badge: "Apertura",
      });
    }
    for (const m of currentRegister.movements) {
      items.push({
        time: m.createdAt,
        type: m.type,
        description: m.description || m.type,
        amount: m.amount,
        badge: m.type === "venta" ? "Venta" : m.type === "ingreso" ? "Ingreso" : m.type === "egreso" ? "Retiro" : m.type === "arqueo" ? "Arqueo" : m.type,
        method: m.method,
        saleId: m.saleId,
        movementId: m.id,
      });
    }
    items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return items;
  }, [currentRegister]);

  // Mejora 6: Payment method breakdown (derived state)
  const computedPaymentBreakdown = useMemo(() => {
    if (!currentRegister) return {};
    const sales = currentRegister.movements.filter(m => m.type === "venta");
    const breakdown: Record<string, number> = {};
    for (const s of sales) {
      breakdown[s.method] = (breakdown[s.method] ?? 0) + s.amount;
    }
    return breakdown;
  }, [currentRegister]);

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
    // Hourly sales chart data
    const hourlyData: number[] = Array.from({ length: 24 }, () => 0);
    for (const m of mvs.filter(mv => mv.type === "venta")) {
      try {
        const h = new Date(m.createdAt).getHours();
        hourlyData[h] += m.amount;
      } catch { /* ignore */ }
    }

    return { salesEfectivo, salesDigital, totalIn, totalOut, salesCount, expectedCash, hourlyData };
  }, [currentRegister]);

  // Filtered movements for current register
  const filteredMovements = useMemo(() => {
    if (!currentRegister) return [];
    const mvs = currentRegister.movements;
    if (mvFilter === "all") return mvs;
    return mvs.filter(m => m.method === mvFilter);
  }, [currentRegister, mvFilter]);

  // Filtered closed registers for history search
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return closedRegisters;
    const q = historySearch.toLowerCase();
    return closedRegisters.filter(r => {
      const dateStr = fmtDate(r.openedAt).toLowerCase();
      const closeDateStr = r.closedAt ? fmtDate(r.closedAt).toLowerCase() : "";
      return dateStr.includes(q) || closeDateStr.includes(q) || (r.notes ?? "").toLowerCase().includes(q);
    });
  }, [closedRegisters, historySearch]);

  // ── Open register ──────────────────────────────────────────────────────────

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    setCajaError(null);
    try {
      const res = await fetch("/api/cash-registers", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "open", openingAmount: Number(openAmount) || 0, notes: openNotes || undefined }),
      });
      if (!res.ok) { setCajaError(await mensajeDeError(res, "No se pudo abrir la caja")); return; }
      setShowOpen(false);
      setOpenAmount("");
      setOpenNotes("");
      fetchData();
    } catch (err) {
      console.warn("[CashRegisterTab] abrir caja falló", err);
      setCajaError("Sin conexión con el servidor — la caja NO se abrió.");
    } finally {
      setOpening(false);
    }
  };

  // ── Close register ─────────────────────────────────────────────────────────

  const handleClose = async () => {
    if (!currentRegister || closing) return;
    setClosing(true);
    setCajaError(null);
    try {
      const res = await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: "close", closingAmount: Number(closeAmount) || 0, notes: closeNotes || undefined }),
      });
      // Si el cierre falla, el conteo de billetes NO se borra: volver a
      // contarlo todo por un 503 es lo que hacía que nadie confiara en esto.
      if (!res.ok) { setCajaError(await mensajeDeError(res, "No se pudo cerrar la caja")); return; }
      setShowClose(false);
      setCloseAmount("");
      setCloseNotes("");
      setDenominations({});
      fetchData();
    } catch (err) {
      console.warn("[CashRegisterTab] cerrar caja falló", err);
      setCajaError("Sin conexión con el servidor — la caja NO se cerró y el conteo sigue acá.");
    } finally {
      setClosing(false);
    }
  };

  // ── Add movement ───────────────────────────────────────────────────────────

  const handleAddMovement = async () => {
    if (!currentRegister || addingMv || !mvAmount) return;
    // Egreso requires a description (motivo)
    if (mvType === "egreso" && !mvDescription.trim()) return;
    setAddingMv(true);
    setCajaError(null);
    try {
      const res = await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "movement",
          type: mvType,
          amount: Number(mvAmount),
          method: "efectivo",
          description: [mvMotivo, mvDescription].filter(Boolean).join(" — ") || (mvType === "ingreso" ? "Ingreso manual" : "Egreso manual"),
        }),
      });
      // Un retiro que no se guarda descuadra el arqueo del día entero.
      if (!res.ok) {
        setCajaError(await mensajeDeError(res, `No se pudo registrar el ${mvType}`));
        return;
      }
      setShowMovement(false);
      setMvAmount("");
      setMvMotivo("");
      setMvDescription("");
      fetchData();
    } catch (err) {
      console.warn("[CashRegisterTab] movimiento de caja falló", err);
      setCajaError("Sin conexión con el servidor — el movimiento NO se registró.");
    } finally {
      setAddingMv(false);
    }
  };

  /** El mensaje del servidor, o uno genérico con el código. */
  async function mensajeDeError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => ({}));
    return typeof body?.error === "string" ? body.error : `${fallback} (error ${res.status})`;
  }

  // ── Arqueo Express ──────────────────────────────────────────────────────────

  const handleArqueoExpress = async () => {
    if (!currentRegister || addingArqueo || !arqueoAmount) return;
    setAddingArqueo(true);
    setArqueoError(null);
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

      // El endpoint correcto es /api/cash-registers/[id] con action "arqueo"
      // (mismo contrato que CashAuditTab). La ruta arma el prefijo y dispara la
      // detección de anomalías; le pasamos el detalle como `notes`.
      const res = await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "arqueo",
          closingAmount: counted,
          notes: `${timestamp} | Esperado: S/${expected.toFixed(2)} | Contado: S/${counted.toFixed(2)} | Diferencia: ${diff >= 0 ? "+" : ""}S/${diff.toFixed(2)}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      setShowArqueo(false);
      setArqueoAmount("");
      setArqueoDenoms({});
      fetchData();
    } catch (err) {
      setArqueoError(err instanceof Error ? err.message : "No se pudo registrar el arqueo. Intentá de nuevo.");
    } finally {
      setAddingArqueo(false);
    }
  };

  // ── Arqueo Guiado ──────────────────────────────────────────────────────────

  const BILLETES = [200, 100, 50, 20, 10];
  const MONEDAS = [5, 2, 1, 0.5];

  const guiadoTotalBilletes = BILLETES.reduce((s, b) => s + b * (guiadoBilletes[String(b)] ?? 0), 0);
  const guiadoTotalMonedas = MONEDAS.reduce((s, m) => s + m * (guiadoMonedas[String(m)] ?? 0), 0);
  const guiadoTotal = guiadoTotalBilletes + guiadoTotalMonedas;
  const guiadoExpected = stats?.expectedCash ?? 0;
  const guiadoDiff = guiadoTotal - guiadoExpected;

  const handleArqueoGuiado = async () => {
    if (!currentRegister || addingArqueoGuiado) return;
    /**
     * Esto CIERRA la caja del día (manda `action: "close"`), no es sólo contar.
     * El botón decía «Confirmar arqueo» y el cajero se quedaba sin caja sin
     * haberlo pedido — y sin que nada se lo dijera.
     */
    const ok = window.confirm(
      `Esto CIERRA la caja del día con S/${guiadoTotal.toFixed(2)} contados en efectivo.\n\n` +
      `Esperado: S/${guiadoExpected.toFixed(2)} · Diferencia: ${guiadoDiff >= 0 ? "+" : "−"}S/${Math.abs(guiadoDiff).toFixed(2)}\n\n` +
      "Después de cerrar hay que abrir una caja nueva para seguir vendiendo. ¿Cerrar?",
    );
    if (!ok) return;
    setAddingArqueoGuiado(true);
    setArqueoError(null);
    try {
      const timestamp = new Date().toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

      const digitalTotal = (Number(arqueoYape) || 0) + (Number(arqueoPlin) || 0) + (Number(arqueoTarjeta) || 0);
      const grandTotal = guiadoTotal + digitalTotal;
      const digitalNote = digitalTotal > 0 ? ` | Yape: S/${(Number(arqueoYape) || 0).toFixed(2)} | Plin: S/${(Number(arqueoPlin) || 0).toFixed(2)} | Tarjeta: S/${(Number(arqueoTarjeta) || 0).toFixed(2)}` : "";
      // Brandon 2026-06-17: persiste la foto del arqueo SERVER-SIDE (antes solo
      // quedaba en localStorage + flag de texto "adjunta", se perdía al limpiar).
      // Sube a /api/upload (Supabase + Sharp) y guarda la URL real en notes.
      // Best-effort: si el upload falla, conserva el flag para no bloquear el cierre.
      let fotoNote = "";
      if (arqueoFoto) {
        try {
          const blob = await (await fetch(arqueoFoto)).blob();
          const file = new File([blob], `arqueo-${currentRegister.id}.jpg`, {
            type: blob.type || "image/jpeg",
          });
          const fd = new FormData();
          fd.append("file", file);
          fd.append("folder", "general");
          const upRes = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), body: fd });
          const up = upRes.ok ? ((await upRes.json()) as { url?: string }) : null;
          fotoNote = up?.url ? ` | Foto: ${up.url}` : " | Foto: adjunta";
        } catch {
          fotoNote = " | Foto: adjunta";
        }
      }

      const res = await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "close",
          closingAmount: guiadoTotal,
          notes: `Arqueo Guiado - ${timestamp} | Billetes: S/${guiadoTotalBilletes.toFixed(2)} | Monedas: S/${guiadoTotalMonedas.toFixed(2)} | Total efectivo: S/${guiadoTotal.toFixed(2)}${digitalNote} | Total general: S/${grandTotal.toFixed(2)} | Diferencia: ${guiadoDiff >= 0 ? "+" : ""}S/${guiadoDiff.toFixed(2)}${fotoNote}`,
        }),
      });
      // Antes se limpiaba la pantalla pasara lo que pasara: si el cierre
      // fallaba (409 de otra pestaña, 503 de la base), el conteo de billetes
      // se perdía y la caja quedaba abierta sin que nadie se enterara.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setArqueoError(
          typeof body?.error === "string"
            ? body.error
            : `No se pudo cerrar la caja (error ${res.status}). El conteo sigue acá.`,
        );
        return;
      }

      setShowArqueoGuiado(false);
      setGuiadoBilletes({});
      setGuiadoMonedas({});
      setArqueoYape("");
      setArqueoPlin("");
      setArqueoTarjeta("");
      setArqueoFoto(null);
      setArqueoTab("efectivo");
      fetchData();
    } catch (err) {
      console.warn("[CashRegisterTab] arqueo guiado falló", err);
      setArqueoError("Sin conexión con el servidor. La caja NO se cerró y el conteo sigue acá.");
    } finally {
      setAddingArqueoGuiado(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState message="" size="sm" />;
  }

  return (
    <div className="space-y-4">
      {/* Lo que el servidor rechazó, a la vista. Abrir caja, cerrarla y
          registrar un retiro fallaban en silencio: el modal se cerraba igual y
          el cajero seguía trabajando sobre una caja que no existía. */}
      {cajaError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <p className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{cajaError}</p>
          <button
            type="button"
            onClick={() => setCajaError(null)}
            className="text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Toolbar (sin breadcrumb redundante — el nav ya indica el modulo) */}
      <div className="flex items-center justify-end flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ModuleTooltip />
          {/* Tolerancia configurable */}
          <div className="relative">
            <button
              onClick={() => setShowToleranceConfig(p => !p)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white hover:bg-[var(--surface-alt)] dark:hover:bg-accent text-sm font-medium text-[var(--text-secondary)] transition-colors"
              title={`Tolerancia: ±S/${cashTolerance}`}
            >
              <Settings className="h-4 w-4" />
              Tolerancia <span className="font-bold tabular-nums">&plusmn;S/{cashTolerance}</span>
            </button>
            {showToleranceConfig && (
              <div className="absolute right-0 top-12 z-50 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 w-72 shadow-[var(--shadow-lg)]">
                <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-3">Tolerancia de diferencia</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base font-bold text-[var(--text-tertiary)]">S/</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={cashTolerance}
                    onChange={e => {
                      const v = Math.max(0, Number(e.target.value) || 0);
                      setCashTolerance(v);
                      try { localStorage.setItem("cash-tolerance", String(v)); } catch {}
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-base font-bold tabular-nums text-center text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">Diferencias dentro de este rango se marcan como aceptables.</p>
                <button onClick={() => setShowToleranceConfig(false)} className="mt-3 w-full py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors">
                  Listo
                </button>
              </div>
            )}
          </div>
          <AdminTooltip content="Refrescar datos de caja">
            <button onClick={fetchData} aria-label="Refrescar" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white hover:bg-[var(--surface-alt)] dark:hover:bg-accent text-sm font-medium text-[var(--text-secondary)] transition-colors">
              <RefreshCw className="h-4 w-4" />
              Refrescar
            </button>
          </AdminTooltip>
          <div className="flex bg-[var(--surface-sunken)] dark:bg-accent rounded-xl p-1">
            <button
              onClick={() => setView("current")}
              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all", view === "current" ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}
            >
              Actual
            </button>
            <button
              onClick={() => setView("history")}
              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all", view === "history" ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}
            >
              Historial
            </button>
            <button
              onClick={() => {
                setView("auditoria");
                if (trail === null) {
                  fetch("/api/cash-registers/historial?limit=100", { credentials: "include" })
                    .then((r) => (r.ok ? r.json() : { entries: [] }))
                    .then((j) => setTrail(j.entries ?? []))
                    .catch(() => setTrail([]));
                }
              }}
              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all", view === "auditoria" ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}
            >
              Quién la tocó
            </button>
            <button
              onClick={() => setView("reconcile")}
              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-all", view === "reconcile" ? "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}
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
            /* No open register — layout 2-col consistente con Turnos */
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-2xl p-6 sm:p-7">
                <div className="flex items-start gap-4 mb-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Lock className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Caja cerrada</CardTitle>
                    <p className="text-sm text-[var(--text-tertiary)] mt-1">Abre una caja para registrar ventas en efectivo del día.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark transition-colors shadow-[var(--shadow-sm)]"
                  >
                    <Unlock className="h-5 w-5" strokeWidth={2} aria-hidden />
                    Abrir caja
                  </button>
                </div>
              </div>
              <aside className="bg-[var(--surface-sunken)] dark:bg-white/[0.03] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-2xl p-5 flex flex-col gap-5">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-2">Qué es la caja</p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Registro del efectivo físico del día. Abres con un monto inicial, registras ingresos y egresos durante el turno, y al cerrar comparas lo contado con lo esperado.
                  </p>
                </div>
                <div className="border-t border-[var(--rule-soft)] pt-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-2">Tolerancia actual</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-bold text-[var(--text-primary)] font-mono tabular-nums">&plusmn; S/ {cashTolerance}</p>
                    <button
                      type="button"
                      onClick={() => setShowToleranceConfig(true)}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Ajustar
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1.5">Diferencias dentro del rango se marcan como aceptables.</p>
                </div>
              </aside>
            </div>
          ) : (
            /* Open register */
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase">Apertura</span>
                  </div>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(currentRegister.openingAmount)}</p>
                </div>

                <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      <Banknote className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase">Ventas efectivo</span>
                  </div>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(stats?.salesEfectivo ?? 0)}</p>
                </div>

                <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase">Ventas digital</span>
                  </div>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(stats?.salesDigital ?? 0)}</p>
                </div>

                <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      <Calculator className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase">Esperado caja</span>
                  </div>
                  <p className="text-lg font-extrabold text-primary">{fmt(stats?.expectedCash ?? 0)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setMvType("ingreso"); setMvMotivo(""); setShowMovement(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] font-bold text-xs hover:bg-primary/10 transition-colors"
                >
                  <ArrowUp className="h-4 w-4" /> Ingreso
                </button>
                <button
                  onClick={() => { setMvType("egreso"); setMvMotivo(""); setShowMovement(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error-500)] font-bold text-xs hover:bg-[var(--data-error-100)] transition-colors"
                >
                  <ArrowDown className="h-4 w-4" /> Egreso
                </button>
                <button
                  onClick={() => { setArqueoAmount(""); setArqueoDenoms({}); setArqueoError(null); setShowArqueo(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] font-bold text-xs hover:bg-primary/10 transition-colors"
                  title="Conteo físico del efectivo para verificar que cuadra con las ventas"
                >
                  <Scan className="h-4 w-4" /> Arqueo Express
                </button>
                <button
                  onClick={() => { setGuiadoBilletes({}); setGuiadoMonedas({}); setShowArqueoGuiado(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-bold text-xs hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <Calculator className="h-4 w-4" /> Arqueo Guiado
                </button>
                {/* Mejora 8: Imprimir reporte */}
                <button
                  onClick={() => {
                    const salesMvs = currentRegister.movements.filter(m => m.type === "venta");
                    const byMethod: Record<string, number> = {};
                    for (const s of salesMvs) { byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount; }
                    const totalVentas = salesMvs.reduce((s, m) => s + m.amount, 0);
                    const retiros = currentRegister.movements.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
                    const retirosCount = currentRegister.movements.filter(m => m.type === "egreso").length;
                    const ingresosExtra = currentRegister.movements.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
                    const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
                    const hora = new Date(currentRegister.openedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
                    const methodLines = Object.entries(byMethod).map(([m, t]) => {
                      const pct = totalVentas > 0 ? ((t / totalVentas) * 100).toFixed(0) : "0";
                      return `  ${m.charAt(0).toUpperCase() + m.slice(1)}: S/ ${t.toFixed(2)} (${pct}%)`;
                    }).join("\n");
                    const content = `
<html><head><title>Reporte de Caja</title>
<style>body{font-family:monospace;font-size:12px;max-width:380px;margin:0 auto;padding:20px}h1{font-size:14px;text-align:center;margin:0}p{margin:4px 0}.sep{border-top:1px dashed #999;margin:8px 0}.center{text-align:center}.bold{font-weight:bold}.sign{margin-top:40px;border-top:1px solid #333;width:200px;display:inline-block;text-align:center;padding-top:4px;font-size:10px}</style>
</head><body>
<h1>REPORTE DE CAJA</h1>
<p class="center bold">Buleje</p>
<p class="center">Fecha: ${fecha}</p>
<div class="sep"></div>
<p class="bold">APERTURA</p>
<p>Efectivo inicial: S/ ${Number(currentRegister.openingAmount).toFixed(2)}</p>
<p>Hora: ${hora}</p>
<div class="sep"></div>
<p class="bold">VENTAS DEL DIA</p>
<p>Total ventas: S/ ${totalVentas.toFixed(2)} (${salesMvs.length} transacciones)</p>
<p>Por metodo:</p>
<pre>${methodLines}</pre>
<div class="sep"></div>
<p class="bold">MOVIMIENTOS</p>
<p>Retiros: S/ ${retiros.toFixed(2)} (${retirosCount})</p>
<p>Ingresos extra: S/ ${ingresosExtra.toFixed(2)}</p>
<div class="sep"></div>
<p class="bold">CIERRE</p>
<p>Efectivo esperado: S/ ${(stats?.expectedCash ?? 0).toFixed(2)}</p>
<div class="sep"></div>
<p style="margin-top:30px">Firma cajero: ___________________</p>
<p>Firma supervisor: _______________</p>
</body></html>`;
                    const w = window.open("", "_blank", "width=420,height=600");
                    if (w) { w.document.write(content); w.document.close(); w.print(); }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-primary)] dark:text-[var(--text-primary)] font-bold text-xs hover:bg-[var(--rule-soft)] dark:hover:bg-surface transition-colors"
                >
                  <Printer className="h-4 w-4" /> Imprimir reporte
                </button>
                <div className="ml-auto">
                  <button
                    onClick={() => setShowClose(true)}
                    className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-gray-900 text-white font-bold text-xs hover:bg-gray-800 transition-colors"
                  >
                    <Lock className="h-4 w-4" /> Cerrar caja
                  </button>
                </div>
              </div>

              {/* Info bar */}
              <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] dark:text-muted">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Abierta: {fmtDate(currentRegister.openedAt)}
                </span>
                <span className="font-bold text-[var(--text-secondary)] dark:text-muted">{stats?.salesCount ?? 0} ventas</span>
              </div>

              {/* Mejora 7: Alerta de exceso de efectivo */}
              {(() => {
                const threshold = cashAlertMax;
                const efectivoEnCaja = stats?.expectedCash ?? 0;
                if (efectivoEnCaja <= threshold) return null;
                return (
                  <WarningAlert
                    title={`Hay aproximadamente ${fmt(efectivoEnCaja)} en efectivo en caja`}
                    description="Considera hacer un retiro parcial para seguridad"
                    action={
                      <button
                        onClick={() => { setMvType("egreso"); setMvMotivo(""); setShowMovement(true); }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--data-warning-500)] text-white text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
                      >
                        Registrar retiro
                      </button>
                    }
                  />
                );
              })()}

              {/* Mejora 6: Desglose por metodo de pago */}
              {Object.keys(computedPaymentBreakdown).length > 0 && (() => {
                const totalSales = Object.values(computedPaymentBreakdown).reduce((s, v) => s + v, 0);
                const METHOD_CONFIG: Record<string, { icon: typeof Banknote; bg: string; color: string }> = {
                  efectivo: { icon: Banknote, bg: "bg-primary/10 dark:bg-primary/15", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
                  yape: { icon: Smartphone, bg: "bg-[var(--surface-sunken)]", color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]" },
                  plin: { icon: Smartphone, bg: "bg-[var(--data-info-50)] dark:bg-cyan-950/20", color: "text-[var(--data-info-500)] dark:text-[var(--data-info-500)]" },
                  tarjeta: { icon: CreditCard, bg: "bg-primary/10 dark:bg-primary/15", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
                };
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(computedPaymentBreakdown).map(([method, amount]) => {
                      const config = METHOD_CONFIG[method] ?? { icon: Banknote, bg: "bg-[var(--surface-alt)]", color: "text-[var(--text-primary)]" };
                      const pct = totalSales > 0 ? (amount / totalSales) * 100 : 0;
                      const Icon = config.icon;
                      return (
                        <div key={method} className={cn("rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3", config.bg)}>
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={cn("h-4 w-4", config.color)} />
                            <span className={cn("text-xs font-bold capitalize", config.color)}>{method}</span>
                          </div>
                          <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(amount)}</p>
                          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{pct.toFixed(0)}%</p>
                          <div className="mt-1.5 h-1.5 bg-[var(--rule-soft)] dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* IDEA 3: Conciliacion Yape/Plin — Yape-a-Yape */}
              {Object.keys(computedPaymentBreakdown).some(k => k === "yape" || k === "plin") && (
                <YapePlinConciliation breakdown={computedPaymentBreakdown} />
              )}

              {/* Mejora 5: Timeline del dia */}
              {computedTimeline.length > 0 && (
                <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                  <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" /> Movimientos de hoy
                  </p>
                  <div className="max-h-96 overflow-y-auto space-y-0">
                    {computedTimeline.map((item, idx) => {
                      const isLast = idx === computedTimeline.length - 1;
                      const timeStr = (() => { try { return new Date(item.time).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })();
                      const fullTimeStr = (() => { try { return new Date(item.time).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } })();
                      const isPositive = ["venta", "ingreso", "apertura"].includes(item.type);
                      const badgeColor = item.type === "apertura" ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" :
                        item.type === "venta" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" :
                        item.type === "egreso" ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]" :
                        item.type === "ingreso" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" :
                        "bg-[var(--surface-sunken)] text-[var(--text-primary)]";
                      const isExpanded = expandedMovIdx === idx;
                      return (
                        <div key={idx} className="flex gap-3">
                          {/* Vertical line + dot */}
                          <div className="flex flex-col items-center">
                            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1", isLast ? "bg-primary animate-pulse" : "bg-primary")} />
                            {!isLast && <div className="w-0.5 flex-1 bg-primary/20 min-h-6" />}
                          </div>
                          {/* Content — clickable */}
                          <div
                            className="pb-3 flex-1 min-w-0 cursor-pointer hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 rounded-lg px-1.5 -mx-1.5 transition-colors"
                            {...activateProps(() => setExpandedMovIdx(isExpanded ? null : idx))}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">{timeStr}</span>
                              <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-full", badgeColor)}>{item.badge}</span>
                              {item.method && item.type === "venta" && (
                                <span className="text-xs font-medium text-[var(--text-tertiary)] capitalize">{item.method}</span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{item.description}</p>
                            <p className={cn("text-xs font-bold", isPositive ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                              {isPositive ? "+" : "-"}{fmt(item.amount)}
                            </p>
                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="mt-2 space-y-1 text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)]/50 rounded-lg p-3 border border-[var(--rule-soft)] dark:border-white/5">
                                <p><span className="font-bold text-[var(--text-secondary)]">Hora exacta:</span> {fullTimeStr}</p>
                                <p><span className="font-bold text-[var(--text-secondary)]">Tipo:</span> <span className="capitalize">{item.badge}</span></p>
                                <p><span className="font-bold text-[var(--text-secondary)]">Monto:</span> {fmt(item.amount)}</p>
                                {item.method && (
                                  <p><span className="font-bold text-[var(--text-secondary)]">Metodo:</span> <span className="capitalize">{item.method}</span></p>
                                )}
                                {item.description && item.description !== item.type && (
                                  <p><span className="font-bold text-[var(--text-secondary)]">Descripcion:</span> {item.description}</p>
                                )}
                                {item.type === "egreso" && (
                                  <p><span className="font-bold text-[var(--text-secondary)]">Motivo:</span> {item.description || "Sin especificar"}</p>
                                )}
                                {item.saleId && (
                                  <p><span className="font-bold text-[var(--text-secondary)]">ID Venta:</span> <span className="font-mono text-xs">{item.saleId.slice(0, 8)}...</span></p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Now node */}
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--data-warning-500)] animate-pulse shrink-0 mt-1" />
                      </div>
                      <div className="pb-1">
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted font-mono">ahora</span>
                        <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Efectivo actual: {fmt(stats?.expectedCash ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hourly sales chart */}
              {stats && stats.salesCount > 0 && (() => {
                const hours = stats.hourlyData;
                const maxH = Math.max(...hours, 1);
                // Only show hours with data or around them
                const activeHours = hours.map((v, i) => ({ hour: i, value: v })).filter((_, i) => hours[i] > 0 || (i > 0 && hours[i - 1] > 0) || (i < 23 && hours[i + 1] > 0));
                if (activeHours.length === 0) return null;
                const startH = Math.max(0, activeHours[0].hour - 1);
                const endH = Math.min(23, activeHours[activeHours.length - 1].hour + 1);
                const displayHours = hours.slice(startH, endH + 1).map((v, i) => ({ hour: startH + i, value: v }));
                return (
                  <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3">
                    <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted mb-2">Ventas por hora</p>
                    <div className="flex items-end gap-1 h-16">
                      {displayHours.map(h => (
                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className="w-full bg-primary/80 rounded-t transition-all min-h-[2px]"
                            style={{ height: `${maxH > 0 ? (h.value / maxH) * 48 : 0}px` }}
                            title={`${h.hour}:00 — ${fmt(h.value)}`}
                          />
                          <span className="text-xs text-[var(--text-tertiary)]">{h.hour}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Movements list */}
              <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-3">
                  <History className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex-1">Movimientos</CardTitle>
                  {/* Method filter pills */}
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                    {(["all", "efectivo", "yape", "plin", "tarjeta"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setMvFilter(m)}
                        className={cn(
                          "shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                          mvFilter === m
                            ? "bg-primary text-white"
                            : "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)]"
                        )}
                      >
                        {m === "all" ? "Todos" : m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredMovements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)] dark:text-muted gap-2">
                    <History className="h-7 w-7 opacity-50" />
                    <p className="text-base font-semibold">Sin movimientos</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--rule-soft)] max-h-96 overflow-y-auto">
                    {filteredMovements.map(m => {
                      const isPos = ["venta", "ingreso", "apertura"].includes(m.type);
                      return (
                        <div key={m.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--surface-alt)] dark:hover:bg-surface/50 transition-colors">
                          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", MOVEMENT_COLORS[m.type] || "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted")}>
                            {isPos ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">{m.type}</p>
                            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted truncate">{m.description}{m.method !== "efectivo" ? ` · ${m.method}` : ""}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cn("text-base font-bold tabular-nums", isPos ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                              {isPos ? "+" : "&minus;"}{fmt(m.amount)}
                            </p>
                            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted tabular-nums">{fmtDate(m.createdAt)}</p>
                          </div>
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
          {/* Mejora 11: Sparkline de diferencias con AreaChart + badge de tendencia */}
          {closedRegisters.length > 2 && (() => {
            const last30 = closedRegisters.slice(0, 30);
            const diffs = last30.map(r => r.difference ?? 0).reverse();
            const sparkData = diffs.map((d, i) => ({ idx: i, diff: d, pos: d >= 0 ? d : 0, neg: d < 0 ? d : 0 }));

            // Badge de tendencia (solo si hay 10+ datos)
            let tendencia: { label: string; color: string } | null = null;
            if (diffs.length >= 10) {
              const last5 = diffs.slice(-5).map(d => Math.abs(d));
              const prev5 = diffs.slice(-10, -5).map(d => Math.abs(d));
              const avgLast = last5.reduce((s, v) => s + v, 0) / 5;
              const avgPrev = prev5.reduce((s, v) => s + v, 0) / 5;
              if (avgLast < avgPrev * 0.8) tendencia = { label: "Mejorando", color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]" };
              else if (avgLast > avgPrev * 1.2) tendencia = { label: "Empeorando", color: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" };
              else tendencia = { label: "Estable", color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-zinc-700 dark:text-zinc-400" };
            } else if (diffs.length >= 5) {
              tendencia = { label: "Sin suficientes datos para tendencia", color: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-zinc-700 dark:text-zinc-400" };
            }

            return (
              <CashRegisterChart
                sparkData={sparkData}
                diffsCount={diffs.length}
                tendencia={tendencia}
              />
            );
          })()}

          {/* Search in history */}
          {closedRegisters.length > 0 && (
            <div className="relative">
              <Info className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Buscar por fecha o notas..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:text-[var(--text-primary)]"
              />
            </div>
          )}
          {filteredHistory.length === 0 ? (
            <EmptyState
              icon={History}
              title="Sin historial de cajas"
              description="Los cierres de caja aparecerán aquí."
              className="bg-[var(--surface-raised)] rounded-xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] p-8"
            />
          ) : (
            filteredHistory.map(r => {
              const diff = r.difference ?? 0;
              const withinTolerance = Math.abs(diff) <= cashTolerance;
              return (
                <button
                  key={r.id}
                  onClick={() => setDetailRegister(r)}
                  className="w-full bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4 text-left hover:shadow-[var(--shadow-sm)] transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent flex items-center justify-center">
                        <Lock className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmtDateShort(r.openedAt)} → {r.closedAt ? fmtDateShort(r.closedAt) : "—"}</p>
                        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{r.movements.length} movimientos</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(r.closingAmount ?? 0)}</p>
                      <p className={cn("text-xs font-bold", withinTolerance ? "text-[var(--data-success-500)]" : diff > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                        {diff > 0 ? "+" : ""}{fmt(diff)} diferencia
                      </p>
                    </div>
                  </div>
                  {/* Mejora 12: Tolerance badge */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-[var(--text-tertiary)] dark:text-muted">
                    <span>Apertura: {fmt(r.openingAmount)}</span>
                    <span>Esperado: {fmt(r.expectedAmount ?? 0)}</span>
                    <span>Cierre: {fmt(r.closingAmount ?? 0)}</span>
                    {withinTolerance ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-bold">Dentro de tolerancia (±S/{cashTolerance})</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-bold">Fuera de tolerancia</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Reconciliation view */}
      {view === "auditoria" && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--rule-base)]">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Quién tocó la caja</h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Aperturas, cierres e ingresos o egresos manuales, con el usuario que los hizo. Es un registro de auditoría: no se edita
              ni se borra.
            </p>
          </div>
          {trail === null ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">Cargando el historial…</div>
          ) : trail.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-secondary)]">
              Todavía no hay movimientos registrados. Las aperturas y cierres de caja quedan acá desde ahora.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule-base)]">
              {trail.map((t) => {
                const esApertura = t.action === "Abrir";
                const esCierre = t.action === "Cerrar";
                return (
                  <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
                        esApertura
                          ? "bg-primary/10 text-primary"
                          : esCierre
                            ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                      )}
                    >
                      {esApertura ? "Apertura" : esCierre ? "Cierre" : "Movimiento"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{t.detail}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        <span className="font-semibold">{t.user}</span> ·{" "}
                        {new Date(t.createdAt).toLocaleString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {view === "reconcile" && (() => {
        // Group closed registers by calendar day
        type DayRow = { date: string; count: number; totalExpected: number; totalClosing: number; totalDiff: number; hasAlert: boolean };
        const byDay = new Map<string, DayRow>();
        for (const r of closedRegisters) {
          // Día local: con el ISO crudo, un cierre de las 20:00 aparecía en la
          // fila del día siguiente.
          const day = diaLocal(r.closedAt ?? r.openedAt);
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
        
        /**
         * Flujo de caja de los últimos 7 días. Tres cosas que estaban mal:
         *
         *  1. El día se calculaba en UTC (`toISOString().slice(0,10)` y el
         *     `closedAt` crudo). En Perú son 5 horas de corrimiento: la caja
         *     que se cierra a las 20:00 del lunes caía en el martes.
         *  2. Sumaba `openingAmount` como ingreso. El fondo con el que se abre
         *     no es plata que entró: es la misma que ya estaba.
         *  3. Sumaba TODAS las ventas, también las de Yape y tarjeta, que no
         *     pasan por el cajón. Esto es flujo de EFECTIVO.
         */
        const weekData: Array<{ date: string; income: number; expenses: number; net: number }> = [];
        for (const dateStr of ultimosDiasLocales(7)) {
          const dayRegs = closedRegisters.filter(r =>
            diaLocal(r.closedAt ?? r.openedAt) === dateStr,
          );
          let income = 0;
          let expenses = 0;
          for (const reg of dayRegs) {
            for (const m of reg.movements) {
              if (m.type === "venta") {
                // Sólo lo cobrado en efectivo entra al cajón.
                if ((m.method ?? "efectivo") === "efectivo") income += m.amount;
              } else if (m.type === "ingreso") {
                income += m.amount;
              } else if (m.type === "egreso") {
                expenses += m.amount;
              }
            }
          }
          weekData.push({ date: dateStr, income, expenses, net: income - expenses });
        }
        const weekIncome = weekData.reduce((s, d) => s + d.income, 0);
        const weekExpenses = weekData.reduce((s, d) => s + d.expenses, 0);
        const weekNet = weekIncome - weekExpenses;
        const maxBar = Math.max(...weekData.map(d => Math.max(d.income, d.expenses)), 1);
        
        return (
          <div className="space-y-6">
            {/* Weekly Cash Flow Chart */}
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Flujo de Caja Semanal
                </CardTitle>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-primary/10"></div>
                    <span className="text-[var(--text-secondary)] dark:text-muted">Ingresos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-[var(--data-error-500)]"></div>
                    <span className="text-[var(--text-secondary)] dark:text-muted">Egresos</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
                {weekData.map((day, idx) => {
                  const incomeH = maxBar > 0 ? (day.income / maxBar) * 80 : 0;
                  const expenseH = maxBar > 0 ? (day.expenses / maxBar) * 80 : 0;
                  const dayName = new Date(day.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" });
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="relative w-full h-20 flex flex-wrap items-end justify-center gap-0.5 mb-1">
                        <div
                          className="w-2.5 bg-primary/10 rounded-t transition-all"
                          style={{ height: `${incomeH}px` }}
                          title={`Ingresos: ${fmt(day.income)}`}
                        ></div>
                        <div
                          className="w-2.5 bg-[var(--data-error-500)] rounded-t transition-all"
                          style={{ height: `${expenseH}px` }}
                          title={`Egresos: ${fmt(day.expenses)}`}
                        ></div>
                      </div>
                      <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase">{dayName}</p>
                      <p className={cn("text-xs font-bold", day.net >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                        {fmt(day.net)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="pt-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between text-xs">
                <div className="text-[var(--data-success-500)] font-bold">Ingresos: {fmt(weekIncome)}</div>
                <div className="text-[var(--data-error-500)] font-bold">Egresos: {fmt(weekExpenses)}</div>
                <div className={cn("font-extrabold", weekNet >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                  Neto: {fmt(weekNet)}
                </div>
              </div>
            </div>
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{rows.length}</p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Días con cierres</p>
              </div>
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 text-center">
                <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(rows.reduce((s, r) => s + r.totalClosing, 0))}</p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Total recaudado</p>
              </div>
              <div className={cn("border rounded-xl p-3 text-center", totalDiscrepancy > 10 ? "bg-[var(--data-error-50)] border-[var(--data-error-500)]" : totalDiscrepancy > 0 ? "bg-[var(--data-warning-50)] border-[var(--data-warning-500)]" : "bg-primary/10 border-[var(--data-success-500)]/30")}>
                <p className={cn("text-lg font-extrabold", totalDiscrepancy > 10 ? "text-[var(--data-error-500)]" : totalDiscrepancy > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]")}>{fmt(totalDiscrepancy)}</p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Diferencia acumulada</p>
              </div>
            </div>
            {/* Daily rows */}
            {rows.length === 0 ? (
              <EmptyState
                icon={History}
                title="Sin cajas cerradas"
                description="No hay cierres en el rango seleccionado."
                className="bg-[var(--surface-raised)] rounded-xl border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] p-8"
              />
            ) : (
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-y-hidden overflow-x-auto">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-left">
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted text-right">Esperado</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted text-right">Real</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted text-right">Diferencia</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(row => {
                      const diff = row.totalDiff;
                      const isOk = Math.abs(diff) <= cashTolerance;
                      const isMinor = !isOk && Math.abs(diff) <= cashTolerance * 2;
                      return (
                        <tr key={row.date} className={cn("transition-colors", !isOk && "bg-[var(--data-error-50)]/30")}>
                          <td className="px-2 sm:px-4 py-2 sm:py-3">
                            <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{new Date(row.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}</p>
                            <p className="text-[var(--text-tertiary)] dark:text-muted">{row.count} caja{row.count > 1 ? "s" : ""}</p>
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[var(--text-secondary)] dark:text-muted font-semibold">{fmt(row.totalExpected)}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(row.totalClosing)}</td>
                          <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold", isOk ? "text-[var(--data-success-500)]" : isMinor ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]")}>
                            {diff > 0 ? "+" : ""}{fmt(diff)}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                            {isOk ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-xs font-bold"><Check className="h-4 w-4" />OK</span>
                            ) : isMinor ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] text-xs font-bold"><AlertTriangle className="h-4 w-4" />Menor</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-error-100)] text-[var(--data-error-500)] text-xs font-bold"><AlertTriangle className="h-4 w-4" />Alerta</span>
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
        <div className="modal-backdrop p-4" onClick={e => e.target === e.currentTarget && setShowOpen(false)}>
          <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Unlock className="h-5 w-5 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Abrir caja</CardTitle>
                  <p className="text-sm text-[var(--text-tertiary)]">Registra el efectivo inicial del día</p>
                </div>
              </div>
              <button onClick={() => setShowOpen(false)} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <Field label="Monto de apertura" labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                {(id) => (
                  <>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
                      <input
                        id={id}
                        type="number"
                        min="0"
                        step="0.10"
                        value={openAmount}
                        onChange={e => setOpenAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-white/5 text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal text-right font-mono tabular-nums outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        autoFocus
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[100, 200, 300, 500].map(amount => {
                        const active = parseFloat(openAmount || "0") === amount;
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setOpenAmount(String(amount))}
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
                    <p className="text-sm text-[var(--text-tertiary)] mt-2">Dinero con el que abre la caja al empezar el día.</p>
                  </>
                )}
              </Field>

              <Field label={<>Notas <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                <textarea
                  value={openNotes}
                  onChange={e => setOpenNotes(e.target.value)}
                  placeholder="Ej: caja del turno de la tarde"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-white/5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                />
              </Field>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-alt)]/50 flex gap-3">
              <button
                onClick={() => setShowOpen(false)}
                className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-alt)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleOpen}
                disabled={opening}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Unlock className="h-5 w-5" />}
                Abrir caja
              </button>
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
        <div className="modal-backdrop p-4" onClick={e => e.target === e.currentTarget && setShowClose(false)}>
          <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 flex items-center justify-center shrink-0">
                  <Lock className="h-5 w-5 text-[var(--data-error-500)]" strokeWidth={2} />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Cerrar caja</CardTitle>
                  <p className="text-sm text-[var(--text-tertiary)]">Cuenta el efectivo final y cierra el día</p>
                </div>
              </div>
              <button onClick={() => { setShowClose(false); setDenominations({}); }} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* Shift Summary */}
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-[var(--text-tertiary)] mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Resumen del turno
              </p>
              <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-4 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm text-[var(--text-tertiary)]">Duración</p>
                  <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{durationStr}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)]">Total ventas</p>
                  <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{ventasCount}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)]">Efectivo</p>
                  <p className="text-base font-bold text-[var(--data-success-500)] tabular-nums">{fmt(ventasEfectivo)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)]">Digital</p>
                  <p className="text-base font-bold text-[var(--text-secondary)] tabular-nums">{fmt(ventasDigital)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)]">Ingresos manuales</p>
                  <p className="text-base font-bold text-[var(--data-success-500)] tabular-nums">{fmt(ingresosManual)}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)]">Egresos manuales</p>
                  <p className="text-base font-bold text-[var(--data-error-500)] tabular-nums">{fmt(egresosManual)}</p>
                </div>
                <div className="col-span-2 pt-2 border-t border-[var(--rule-soft)]">
                  <p className="text-sm text-[var(--text-tertiary)]">Promedio por venta</p>
                  <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{fmt(promedioVenta)}</p>
                </div>
              </div>
            </div>

            {/* Esperado card */}
            <div className="bg-primary/10 dark:bg-primary/15 rounded-xl p-4 border border-[var(--data-success-500)]/30">
              <p className="text-xs uppercase tracking-wide font-semibold text-[var(--data-success-500)] mb-1">Esperado en caja</p>
              <p className="text-2xl font-extrabold text-[var(--data-success-500)] tabular-nums mb-2">{fmt(stats?.expectedCash ?? 0)}</p>
              <p className="text-sm text-[var(--data-success-500)]/80">
                Apertura ({fmt(currentRegister.openingAmount)}) + Ventas efectivo ({fmt(stats?.salesEfectivo ?? 0)}) + Ingresos ({fmt(stats?.totalIn ?? 0)}) &minus; Egresos ({fmt(stats?.totalOut ?? 0)})
              </p>
            </div>
            <div className="space-y-4">
              {/* Denomination Helper */}
              <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1">
                    <Banknote className="h-4 w-4 text-primary" />
                    Contador de denominaciones
                  </span>
                  {Object.keys(denominations).length > 0 && (
                    <button
                      onClick={handleDenomReset}
                      className="text-xs text-[var(--data-error-500)] hover:text-[var(--data-error-500)] font-bold"
                    >
                      Resetear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 mb-2">
                  {DENOMS.map(d => (
                    <button
                      key={d}
                      onClick={() => handleDenomClick(d)}
                      className="relative px-2 py-2 rounded-lg bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-all text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                    >
                      S/{d.toFixed(2)}
                      {(denominations[String(d)] ?? 0) > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-white text-xs flex items-center justify-center">
                          {denominations[String(d)]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {denomTotal > 0 && (
                  <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-2 text-center">
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Total contado por denominaciones</p>
                    <p className="text-sm font-extrabold text-primary">{fmt(denomTotal)}</p>
                  </div>
                )}
              </div>
              
              <Field label="Monto contado en caja" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(id) => (
                  <>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] dark:text-muted font-bold text-sm">S/</span>
                      <input
                        id={id}
                        type="number"
                        min="0"
                        step="0.10"
                        value={closeAmount}
                        onChange={e => setCloseAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                        autoFocus
                      />
                    </div>
                    {closeAmount && (
                      <div className={cn(
                        "mt-2 rounded-xl p-2 text-center text-xs font-bold",
                        Number(closeAmount) - (stats?.expectedCash ?? 0) >= 0 ? "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)]"
                      )}>
                        Diferencia: {Number(closeAmount) - (stats?.expectedCash ?? 0) > 0 ? "+" : ""}{fmt(Number(closeAmount) - (stats?.expectedCash ?? 0))}
                      </div>
                    )}
                  </>
                )}
              </Field>
              <Field label="Notas (opcional)" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <input
                  type="text"
                  value={closeNotes}
                  onChange={e => setCloseNotes(e.target.value)}
                  placeholder="Observaciones"
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                />
              </Field>
            </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-alt)]/50 flex gap-3">
              <button
                onClick={() => { setShowClose(false); setDenominations({}); }}
                className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-alt)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={closing || !closeAmount}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90 disabled:opacity-50 transition-colors"
              >
                {closing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                Confirmar cierre
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Add movement modal */}
      {showMovement && (
        <div className="modal-backdrop p-4" onClick={e => e.target === e.currentTarget && setShowMovement(false)}>
          <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                  mvType === "ingreso" ? "bg-primary/10" : "bg-[var(--data-error-500)]/15"
                )}>
                  {mvType === "ingreso"
                    ? <ArrowUp className="h-5 w-5 text-[var(--data-success-500)]" strokeWidth={2} />
                    : <ArrowDown className="h-5 w-5 text-[var(--data-error-500)]" strokeWidth={2} />}
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">
                    {mvType === "ingreso" ? "Registrar ingreso" : "Registrar egreso"}
                  </CardTitle>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {mvType === "ingreso" ? "Dinero que entra a la caja" : "Dinero que sale de la caja"}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowMovement(false)} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <Field label="Monto" labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                {(id) => (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[var(--text-tertiary)]">S/</span>
                    <input
                      id={id}
                      type="number"
                      min="0.01"
                      step="0.10"
                      value={mvAmount}
                      onChange={e => setMvAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-white/5 text-2xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal text-right font-mono tabular-nums outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      autoFocus
                    />
                  </div>
                )}
              </Field>

              <Field label={<>Motivo {mvType === "egreso" && <span className="text-[var(--data-error-500)]">*</span>}</>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                {(id) => (
                  <>
                    <select
                      id={id}
                      value={mvMotivo}
                      onChange={e => setMvMotivo(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-white/5 text-base text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    >
                      {/* QA Brandon 2026-06-10 #8: motivos separados por tipo —
                          antes la lista era única y Egreso ofrecía "Ingreso extra"
                          (y viceversa), mezclando categorías contables. */}
                      <option value="">Selecciona un motivo...</option>
                      {mvType === "egreso" ? (
                        <>
                          <option value="Pago a proveedor">Pago a proveedor</option>
                          <option value="Retiro personal">Retiro personal</option>
                          <option value="Compra de insumos">Compra de insumos</option>
                          <option value="Cambio">Cambio</option>
                          <option value="Otro">Otro</option>
                        </>
                      ) : (
                        <>
                          <option value="Ingreso extra">Ingreso extra</option>
                          <option value="Cobro pendiente">Cobro pendiente</option>
                          <option value="Cambio">Cambio</option>
                          <option value="Otro">Otro</option>
                        </>
                      )}
                    </select>
                    {mvType === "egreso" && !mvMotivo && !mvDescription.trim() && (
                      <p className="text-sm text-[var(--data-error-500)] mt-1.5 font-medium">Motivo obligatorio para egresos</p>
                    )}
                  </>
                )}
              </Field>

              <Field label={<>Descripción <span className="text-[var(--text-tertiary)] font-normal">(opcional)</span></>} labelClassName="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
                <textarea
                  value={mvDescription}
                  onChange={e => setMvDescription(e.target.value)}
                  placeholder="Detalle adicional..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-white/5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none transition-all"
                />
              </Field>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-alt)]/50 flex gap-3">
              <button
                onClick={() => setShowMovement(false)}
                className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-alt)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddMovement}
                disabled={addingMv || !mvAmount || (mvType === "egreso" && !mvMotivo && !mvDescription.trim())}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white disabled:opacity-50 transition-colors",
                  mvType === "ingreso" ? "bg-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/90" : "bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/90"
                )}
              >
                {addingMv ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                Registrar
              </button>
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
          <div className="modal-backdrop p-4" onClick={e => e.target === e.currentTarget && setShowArqueo(false)}>
            <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Scan className="h-5 w-5 text-[var(--data-success-500)]" strokeWidth={2} />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">Arqueo Express</CardTitle>
                    <p className="text-sm text-[var(--text-tertiary)]">Verificación rápida sin cerrar caja</p>
                  </div>
                </div>
                <button onClick={() => { setShowArqueo(false); setArqueoDenoms({}); setArqueoError(null); }} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                  <X className="h-5 w-5 text-[var(--text-tertiary)]" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Summary card */}
                <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-base">
                    <span className="text-[var(--text-secondary)]">Esperado en caja</span>
                    <span className="font-bold text-[var(--data-success-500)] tabular-nums">{fmt(expectedCash)}</span>
                  </div>
                  <div className="flex justify-between items-center text-base">
                    <span className="text-[var(--text-secondary)]">Contado</span>
                    <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmt(countedCash)}</span>
                  </div>
                  <p className="text-sm text-[var(--text-tertiary)] pt-2 border-t border-[var(--rule-soft)]">
                    Apertura ({fmt(currentRegister.openingAmount)}) + Ventas efectivo ({fmt(stats?.salesEfectivo ?? 0)}) + Ingresos ({fmt(stats?.totalIn ?? 0)}) &minus; Egresos ({fmt(stats?.totalOut ?? 0)})
                  </p>
                </div>

                <div className="space-y-4">
                {/* Quick Denomination Counter */}
                <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1">
                      <Banknote className="h-4 w-4 text-primary" />
                      Conteo rápido
                    </span>
                    {Object.keys(arqueoDenoms).length > 0 && (
                      <button
                        onClick={handleArqueoReset}
                        className="text-xs text-[var(--data-error-500)] hover:text-[var(--data-error-500)] font-bold"
                      >
                        Resetear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
                    {ARQUEO_DENOMS.map(d => (
                      <button
                        key={d}
                        onClick={() => handleArqueoDenomClick(d)}
                        className="relative px-3 py-3 rounded-lg bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-all text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                      >
                        S/{d}
                        {(arqueoDenoms[String(d)] ?? 0) > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">
                            {arqueoDenoms[String(d)]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {arqueoTotal > 0 && (
                    <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-2 text-center">
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Total contado</p>
                      <p className="text-base font-extrabold text-primary">{fmt(arqueoTotal)}</p>
                    </div>
                  )}
                </div>
                
                <Field label="Monto total verificado" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                  {(id) => (
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] dark:text-muted font-bold text-sm">S/</span>
                      <input
                        id={id}
                        type="number"
                        min="0"
                        step="0.10"
                        value={arqueoAmount}
                        onChange={e => setArqueoAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                        autoFocus
                      />
                    </div>
                  )}
                </Field>
                
                {/* Difference Badge */}
                {arqueoAmount && (
                  <div className={cn(
                    "rounded-xl p-3 text-center border-2",
                    Math.abs(difference) < 0.5
                      ? "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                      : "bg-[var(--data-error-50)] dark:bg-red-950/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30"
                  )}>
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                      {Math.abs(difference) < 0.5 ? (
                        <Check className="h-5 w-5 text-[var(--data-success-500)]" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
                      )}
                      <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Diferencia</span>
                    </div>
                    <p className={cn(
                      "text-xl sm:text-2xl font-extrabold",
                      Math.abs(difference) < 0.5 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                    )}>
                      {difference >= 0 ? "+" : ""}{fmt(difference)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1">
                      {Math.abs(difference) < 0.5 
                        ? "Cuadra correctamente" 
                        : difference > 0 
                          ? "Hay más efectivo del esperado" 
                          : "Falta efectivo"}
                    </p>
                  </div>
                )}
                
                <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl p-4 border border-[var(--data-warning-500)]/30 flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--data-warning-500)]">
                      Nota importante
                    </p>
                    <p className="text-sm text-[var(--data-warning-500)] mt-0.5">
                      El arqueo express NO cierra la caja. Solo registra una verificación intermedia para control.
                    </p>
                  </div>
                </div>
              </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-alt)]/50 space-y-3">
                {arqueoError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-[var(--data-error-500)]">
                      No se pudo registrar el arqueo: {arqueoError}
                    </p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowArqueo(false); setArqueoDenoms({}); setArqueoError(null); }}
                    className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-alt)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleArqueoExpress}
                    disabled={addingArqueo || !arqueoAmount}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white bg-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/90 disabled:opacity-50 transition-colors"
                  >
                    {addingArqueo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                    Registrar arqueo
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Arqueo Guiado modal */}
      {showArqueoGuiado && currentRegister && (
        <div className="modal-backdrop p-4" onClick={e => e.target === e.currentTarget && setShowArqueoGuiado(false)}>
          <div className="bg-[var(--surface-raised)] rounded-2xl shadow-[var(--shadow-xl)] ring-1 ring-[var(--rule-base)] max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-[var(--dur-fast)]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center shrink-0">
                  <Calculator className="h-5 w-5 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Arqueo guiado</CardTitle>
                  <p className="text-sm text-[var(--text-tertiary)]">Cuenta billetes, monedas y métodos de pago</p>
                </div>
              </div>
              <button onClick={() => setShowArqueoGuiado(false)} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Expected */}
            <div className="bg-[var(--surface-alt)] dark:bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center text-base">
                <span className="text-[var(--text-secondary)]">Saldo esperado</span>
                <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmt(guiadoExpected)}</span>
              </div>
              <div className="flex justify-between items-center text-base border-t border-[var(--rule-soft)] pt-2">
                <span className="text-[var(--text-secondary)]">Total contado</span>
                <span className="font-bold text-[var(--data-success-500)] tabular-nums">{fmt(guiadoTotal)}</span>
              </div>
            </div>

            {/* Billetes section */}
            <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)] mb-3">
              <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1 mb-2">
                <Banknote className="h-4 w-4 text-[var(--data-success-500)]" />
                Billetes
              </span>
              <div className="space-y-2">
                {BILLETES.map(b => (
                  <div key={b} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted w-14 text-right">S/{b}</span>
                    <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">×</span>
                    <input
                      type="number"
                      min="0"
                      value={guiadoBilletes[String(b)] ?? ""}
                      onChange={e => setGuiadoBilletes(prev => ({ ...prev, [String(b)]: Number(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-center text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:border-primary"
                    />
                    <span className="text-xs text-[var(--text-tertiary)] dark:text-muted flex-1 text-right">
                      = {fmt(b * (guiadoBilletes[String(b)] ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs font-bold text-[var(--data-success-500)]">Subtotal: {fmt(guiadoTotalBilletes)}</span>
              </div>
            </div>

            {/* Monedas section */}
            <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)] mb-3">
              <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1 mb-2">
                <DollarSign className="h-4 w-4 text-[var(--data-warning-500)]" />
                Monedas
              </span>
              <div className="space-y-2">
                {MONEDAS.map(m => (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted w-14 text-right">S/{m < 1 ? m.toFixed(2) : m}</span>
                    <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">×</span>
                    <input
                      type="number"
                      min="0"
                      value={guiadoMonedas[String(m)] ?? ""}
                      onChange={e => setGuiadoMonedas(prev => ({ ...prev, [String(m)]: Number(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-center text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-raised)] outline-none focus:border-primary"
                    />
                    <span className="text-xs text-[var(--text-tertiary)] dark:text-muted flex-1 text-right">
                      = {fmt(m * (guiadoMonedas[String(m)] ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs font-bold text-[var(--data-warning-500)]">Subtotal: {fmt(guiadoTotalMonedas)}</span>
              </div>
            </div>

            {/* Mejora 9: Arqueo por metodo de pago */}
            <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)] mb-3">
              <div className="flex gap-1 mb-3">
                {(["efectivo", "yape", "plin", "tarjeta"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setArqueoTab(tab)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-sm font-bold transition-colors capitalize",
                      arqueoTab === tab
                        ? "bg-primary text-white"
                        : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)]"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {arqueoTab === "efectivo" && (
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Usa los conteos de billetes y monedas de arriba para el efectivo.</p>
              )}
              {arqueoTab === "yape" && (
                <Field label="Total en vouchers Yape" labelClassName="text-xs font-bold text-[var(--text-secondary)] mb-1 block">
                  {(id) => (
                    <>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">S/</span>
                        <input id={id} type="number" min="0" step="0.10" value={arqueoYape} onChange={e => setArqueoYape(e.target.value)} placeholder="0.00"
                          className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]" />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">Suma los comprobantes de Yape del dia</p>
                    </>
                  )}
                </Field>
              )}
              {arqueoTab === "plin" && (
                <Field label="Total en vouchers Plin" labelClassName="text-xs font-bold text-[var(--data-info-500)] mb-1 block">
                  {(id) => (
                    <>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">S/</span>
                        <input id={id} type="number" min="0" step="0.10" value={arqueoPlin} onChange={e => setArqueoPlin(e.target.value)} placeholder="0.00"
                          className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-[var(--data-info-500)]" />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">Suma los comprobantes de Plin del dia</p>
                    </>
                  )}
                </Field>
              )}
              {arqueoTab === "tarjeta" && (
                <Field label="Total en vouchers tarjeta" labelClassName="text-xs font-bold text-[var(--data-success-500)] mb-1 block">
                  {(id) => (
                    <>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-xs font-bold">S/</span>
                        <input id={id} type="number" min="0" step="0.10" value={arqueoTarjeta} onChange={e => setArqueoTarjeta(e.target.value)} placeholder="0.00"
                          className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-[var(--data-success-500)]/30" />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">Suma los vouchers de tarjeta del dia</p>
                    </>
                  )}
                </Field>
              )}
              {/* Comparacion por metodo */}
              {(Number(arqueoYape) > 0 || Number(arqueoPlin) > 0 || Number(arqueoTarjeta) > 0) && (
                <div className="mt-3 pt-2 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] space-y-1">
                  <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Comparacion por metodo</p>
                  {[
                    { method: "efectivo", contado: guiadoTotal, esperado: computedPaymentBreakdown["efectivo"] ?? 0 },
                    { method: "yape", contado: Number(arqueoYape) || 0, esperado: computedPaymentBreakdown["yape"] ?? 0 },
                    { method: "plin", contado: Number(arqueoPlin) || 0, esperado: computedPaymentBreakdown["plin"] ?? 0 },
                    { method: "tarjeta", contado: Number(arqueoTarjeta) || 0, esperado: computedPaymentBreakdown["tarjeta"] ?? 0 },
                  ].filter(r => r.contado > 0 || r.esperado > 0).map(r => {
                    const diff = r.contado - r.esperado;
                    const ok = Math.abs(diff) < 1;
                    return (
                      <div key={r.method} className="flex items-center justify-between text-xs">
                        <span className="capitalize text-[var(--text-secondary)] dark:text-muted">{r.method}</span>
                        <span className={cn("font-bold", ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                          {ok ? "OK" : `${diff >= 0 ? "+" : ""}S/${diff.toFixed(2)}`} {ok ? "\u2713" : "\u26A0"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mejora 10: Foto de evidencia */}
            <div className="bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)] mb-3">
              <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1 mb-2">
                <Camera className="h-4 w-4 text-[var(--text-secondary)]" />
                Foto del cajon (opcional, recomendado)
              </span>
              {arqueoFoto ? (
                <div className="relative inline-block">
                  <Image src={arqueoFoto} alt="Foto del cajon" width={200} height={120} className="object-cover rounded-lg border border-[var(--rule-base)]" unoptimized />
                  <button
                    onClick={() => setArqueoFoto(null)}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-[var(--data-error-500)] text-white flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fotoInputRef.current?.click()}
                  className="w-full py-3 rounded-lg border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs text-[var(--text-tertiary)] dark:text-muted hover:border-primary hover:text-primary transition-colors"
                >
                  Toca para tomar foto
                </button>
              )}
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64 = reader.result as string;
                    setArqueoFoto(base64);
                    try {
                      const dateKey = new Date().toISOString().slice(0, 10);
                      localStorage.setItem(`arqueo-foto-${dateKey}`, base64);
                    } catch { /* storage full, ignore */ }
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Total + Difference */}
            <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-3 border border-primary/20 mb-3 text-center">
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Total contado</p>
              <p className="text-2xl font-extrabold text-primary">{fmt(guiadoTotal + (Number(arqueoYape) || 0) + (Number(arqueoPlin) || 0) + (Number(arqueoTarjeta) || 0))}</p>
              {(Number(arqueoYape) > 0 || Number(arqueoPlin) > 0 || Number(arqueoTarjeta) > 0) && (
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Efectivo: {fmt(guiadoTotal)} + Digital: {fmt((Number(arqueoYape) || 0) + (Number(arqueoPlin) || 0) + (Number(arqueoTarjeta) || 0))}</p>
              )}
            </div>

            {guiadoTotal > 0 && (
              <div className={cn(
                "rounded-xl p-3 text-center border-2 mb-3",
                Math.abs(guiadoDiff) < 0.5
                  ? "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                  : "bg-[var(--data-error-50)] dark:bg-red-950/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30"
              )}>
                <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                  {Math.abs(guiadoDiff) < 0.5 ? (
                    <Check className="h-5 w-5 text-[var(--data-success-500)]" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" />
                  )}
                  <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Diferencia</span>
                </div>
                <p className={cn(
                  "text-xl font-extrabold",
                  Math.abs(guiadoDiff) < 0.5 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                )}>
                  {guiadoDiff >= 0 ? "+" : ""}{fmt(guiadoDiff)}
                </p>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1">
                  {Math.abs(guiadoDiff) < 0.5
                    ? "Cuadra correctamente"
                    : guiadoDiff > 0
                      ? "Hay más efectivo del esperado"
                      : "Falta efectivo"}
                </p>
              </div>
            )}

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-alt)]/50 flex gap-3">
              <button
                onClick={() => { setShowArqueoGuiado(false); setGuiadoBilletes({}); setGuiadoMonedas({}); }}
                className="flex-1 py-3 rounded-xl text-base font-semibold text-[var(--text-secondary)] border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-alt)] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleArqueoGuiado}
                disabled={addingArqueoGuiado || guiadoTotal <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                {addingArqueoGuiado ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {/* El botón dice lo que hace: esto cierra la caja del día. */}
                Cerrar caja con este conteo
              </button>
            </div>
            {arqueoError && (
              <p className="mt-3 text-sm font-semibold text-[var(--data-error-500)]" role="alert">
                {arqueoError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Detail register modal (history) */}
      {detailRegister && (
        <div className="modal-backdrop p-4" onClick={() => setDetailRegister(null)}>
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-2 sm:px-4 py-2 sm:py-3 border-b flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Detalle de caja</CardTitle>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{fmtDate(detailRegister.openedAt)} → {detailRegister.closedAt ? fmtDate(detailRegister.closedAt) : "—"}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => window.print()} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent print:hidden" title="Imprimir resumen">
                  <Printer className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
                </button>
                <button onClick={() => setDetailRegister(null)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent print:hidden">
                  <X className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
                </button>
              </div>
            </div>
            {/* Summary */}
            <div className="px-2 sm:px-4 py-2 sm:py-3 border-b bg-[var(--surface-alt)] dark:bg-surface grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-bold">Apertura</p>
                <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(detailRegister.openingAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-bold">Esperado</p>
                <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(detailRegister.expectedAmount ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-bold">Cierre</p>
                <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(detailRegister.closingAmount ?? 0)}</p>
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
                <div className="px-2 sm:px-4 py-1.5 sm:py-2.5 border-b bg-[var(--surface-raised)]">
                  <p className="text-xs font-bold text-[var(--text-tertiary)] dark:text-muted uppercase mb-1.5">Ventas por método</p>
                  <div className="flex flex-wrap gap-3">
                    {methods.map(([m, total]) => (
                      <div key={m} className="flex items-center gap-1.5 text-xs">
                        <span className="text-[var(--text-secondary)] dark:text-muted">{PAY_LABELS[m] ?? m}:</span>
                        <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(total)}</span>
                        <span className="text-[var(--text-tertiary)] dark:text-muted">({sales.filter(s => s.method === m).length})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className={cn(
              "px-2 sm:px-4 py-1.5 sm:py-2 text-center text-xs font-bold border-b",
              (detailRegister.difference ?? 0) >= 0 ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] text-[var(--data-error-500)]"
            )}>
              Diferencia: {(detailRegister.difference ?? 0) > 0 ? "+" : ""}{fmt(detailRegister.difference ?? 0)}
            </div>
            {/* Movements */}
            <div className="flex-1 overflow-y-auto divide-y">
              {detailRegister.movements.map(m => {
                const isPos = ["venta", "ingreso", "apertura"].includes(m.type);
                return (
                  <div key={m.id} className="px-2 sm:px-4 py-1.5 sm:py-2.5 flex flex-wrap items-center gap-3">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", MOVEMENT_COLORS[m.type] || "bg-[var(--surface-sunken)] dark:bg-accent text-[var(--text-secondary)] dark:text-muted")}>
                      {isPos ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">{m.type}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate">{m.description}</p>
                    </div>
                    <p className={cn("text-xs font-bold shrink-0", isPos ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                      {isPos ? "+" : "−"}{fmt(m.amount)}
                    </p>
                    <span className="text-xs text-[var(--text-tertiary)] dark:text-muted shrink-0">{fmtDate(m.createdAt)}</span>
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

