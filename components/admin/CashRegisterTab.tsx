"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Calculator, DollarSign, ArrowUp, ArrowDown, Clock,
  Loader2, Check, X, Banknote, History, RefreshCw,
  Lock, Unlock, Printer, AlertTriangle, Scan, Info,
  Settings, Smartphone, CreditCard, Camera,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const CashRegisterChart = dynamic(
  () => import("./cash-register/CashRegisterChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />
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

type View = "current" | "history" | "reconcile";
type MethodFilter = "all" | "efectivo" | "yape" | "plin" | "tarjeta";

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

// ── IDEA 3: Conciliacion Yape/Plin ──────────────────────────────────────────

function YapePlinConciliation({ breakdown }: { breakdown: Record<string, number> }) {
  const [concilTab, setConcilTab] = useState<"yape" | "plin">(breakdown["yape"] ? "yape" : "plin");
  const [concilAmount, setConcilAmount] = useState("");
  const [concilHistory, setConcilHistory] = useState<{ fecha: string; ventasDigital: number; saldoApp: number; diferencia: number; metodo: string }[]>(() => {
    try { const raw = localStorage.getItem("bsm-concil-history"); return raw ? JSON.parse(raw) : []; } catch { return []; }
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
    localStorage.setItem("bsm-concil-history", JSON.stringify(updated));
    setConcilAmount("");
  };

  return (
    <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4">
      <p className="text-xs font-bold text-gray-900 dark:text-foreground mb-3 flex items-center gap-1.5">
        <Smartphone className="h-3.5 w-3.5 text-purple-600" /> Conciliacion Digital
      </p>
      <div className="flex gap-1 mb-3">
        {(["yape", "plin"] as const).filter(m => breakdown[m]).map(m => (
          <button key={m} onClick={() => { setConcilTab(m); setConcilAmount(""); }}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize", concilTab === m ? (m === "yape" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700") : "bg-gray-100 text-gray-500")}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Ventas {concilTab} hoy</p>
          <p className={cn("text-xl font-extrabold font-mono", concilTab === "yape" ? "text-purple-700" : "text-cyan-700")}>{fmt(ventasDigital)}</p>
        </div>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Saldo en tu app</p>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">S/</span>
            <input type="number" value={concilAmount} onChange={e => setConcilAmount(e.target.value)} placeholder="0.00" step="0.50"
              className="w-28 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm font-mono text-right bg-white dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary" />
          </div>
        </div>
      </div>
      {concilAmount && (
        <div className={cn("rounded-lg p-3 mb-3 text-center", cuadra ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-amber-50 dark:bg-amber-950/20")}>
          {cuadra ? (
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Cuadra perfecto{diferencia !== 0 ? ` (dif. S/${diferencia.toFixed(2)})` : ""}</p>
          ) : (
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              Diferencia de S/{Math.abs(diferencia).toFixed(2)} — {diferencia > 0 ? "sobrante" : "revisa si hay transferencias personales"}
            </p>
          )}
          <button onClick={guardarConciliacion} className="mt-2 px-4 py-1.5 rounded-lg bg-[#0f766e] text-white text-xs font-bold hover:bg-[#245a41] transition-colors">
            Anotar conciliacion
          </button>
        </div>
      )}
      {concilHistory.length > 0 && (
        <div className="border-t border-gray-100 dark:border-card-border pt-2 mt-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">Ultimas conciliaciones</p>
          <div className="space-y-1">
            {concilHistory.slice(0, 3).map((h, i) => {
              const dateStr = (() => { try { return new Date(h.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); } catch { return ""; } })();
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{dateStr} · <span className="capitalize font-medium">{h.metodo}</span></span>
                  <span className={cn("font-bold", Math.abs(h.diferencia) <= 5 ? "text-emerald-600" : "text-amber-600")}>
                    {h.diferencia >= 0 ? "+" : ""}S/{h.diferencia.toFixed(2)}
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
  // Arqueo Guiado
  const [showArqueoGuiado, setShowArqueoGuiado] = useState(false);
  const [guiadoBilletes, setGuiadoBilletes] = useState<Record<string, number>>({});
  const [guiadoMonedas, setGuiadoMonedas] = useState<Record<string, number>>({});
  const [addingArqueoGuiado, setAddingArqueoGuiado] = useState(false);
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

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-registers");
      setRegisters(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    items.push({
      time: currentRegister.openedAt,
      type: "apertura",
      description: "Apertura de turno",
      amount: currentRegister.openingAmount,
      badge: "Apertura",
    });
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
    const hourlyData: number[] = new Array(24).fill(0);
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
    // Egreso requires a description (motivo)
    if (mvType === "egreso" && !mvDescription.trim()) return;
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
          description: [mvMotivo, mvDescription].filter(Boolean).join(" — ") || (mvType === "ingreso" ? "Ingreso manual" : "Egreso manual"),
        }),
      });
      setShowMovement(false);
      setMvAmount("");
      setMvMotivo("");
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
    setAddingArqueoGuiado(true);
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
      const fotoNote = arqueoFoto ? " | Foto: adjunta" : "";

      await fetch(`/api/cash-registers/${currentRegister.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          closingAmount: guiadoTotal,
          notes: `Arqueo Guiado - ${timestamp} | Billetes: S/${guiadoTotalBilletes.toFixed(2)} | Monedas: S/${guiadoTotalMonedas.toFixed(2)} | Total efectivo: S/${guiadoTotal.toFixed(2)}${digitalNote} | Total general: S/${grandTotal.toFixed(2)} | Diferencia: ${guiadoDiff >= 0 ? "+" : ""}S/${guiadoDiff.toFixed(2)}${fotoNote}`,
        }),
      });

      setShowArqueoGuiado(false);
      setGuiadoBilletes({});
      setGuiadoMonedas({});
      setArqueoYape("");
      setArqueoPlin("");
      setArqueoTarjeta("");
      setArqueoFoto(null);
      setArqueoTab("efectivo");
      fetchData();
    } catch { /* ignore */ }
    setAddingArqueoGuiado(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" /> Caja Registradora
          <ModuleTooltip />
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Mejora 12: Tolerancia configurable */}
          <div className="relative">
            <button
              onClick={() => setShowToleranceConfig(p => !p)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors"
              title={`Tolerancia: ±S/${cashTolerance}`}
            >
              <Settings className="h-4 w-4 text-gray-500 dark:text-muted" />
            </button>
            {showToleranceConfig && (
              <div className="absolute right-0 top-10 z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-xl p-3 w-56">
                <p className="text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wide mb-2">Tolerancia de diferencia</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-gray-600 dark:text-muted">S/</span>
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
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-center text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                  />
                </div>
                <p className="text-[9px] text-gray-400 dark:text-muted">Diferencias dentro de este rango se marcaran como aceptables</p>
                <button onClick={() => setShowToleranceConfig(false)} className="mt-2 w-full py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors">
                  Listo
                </button>
              </div>
            )}
          </div>
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
                className="px-3 sm:px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors inline-flex items-center gap-2 shadow-lg shadow-primary/20"
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
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600">
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Apertura</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(currentRegister.openingAmount)}</p>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600">
                      <Banknote className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Ventas efectivo</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(stats?.salesEfectivo ?? 0)}</p>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-purple-50 text-purple-600">
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase">Ventas digital</span>
                  </div>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(stats?.salesDigital ?? 0)}</p>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
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
                  title="Conteo físico del efectivo para verificar que cuadra con las ventas"
                >
                  <Scan className="h-3.5 w-3.5" /> Arqueo Express
                </button>
                <button
                  onClick={() => { setGuiadoBilletes({}); setGuiadoMonedas({}); setShowArqueoGuiado(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 text-violet-600 font-bold text-xs hover:bg-violet-100 transition-colors"
                >
                  <Calculator className="h-3.5 w-3.5" /> Arqueo Guiado
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
<p>Efectivo inicial: S/ ${currentRegister.openingAmount.toFixed(2)}</p>
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-accent text-gray-700 dark:text-foreground font-bold text-xs hover:bg-gray-200 dark:hover:bg-surface transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimir reporte
                </button>
                <div className="ml-auto">
                  <button
                    onClick={() => setShowClose(true)}
                    className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gray-900 text-white font-bold text-xs hover:bg-gray-800 transition-colors"
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

              {/* Mejora 7: Alerta de exceso de efectivo */}
              {(() => {
                const threshold = (() => { try { const v = localStorage.getItem("cash-alert-threshold"); return v ? Number(v) : 1000; } catch { return 1000; } })();
                const efectivoEnCaja = stats?.expectedCash ?? 0;
                if (efectivoEnCaja <= threshold) return null;
                return (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3 flex flex-wrap items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Hay aproximadamente {fmt(efectivoEnCaja)} en efectivo en caja</p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500">Considera hacer un retiro parcial para seguridad</p>
                    </div>
                    <button
                      onClick={() => { setMvType("egreso"); setShowMovement(true); }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors shrink-0"
                    >
                      Registrar retiro
                    </button>
                  </div>
                );
              })()}

              {/* Mejora 6: Desglose por metodo de pago */}
              {Object.keys(computedPaymentBreakdown).length > 0 && (() => {
                const totalSales = Object.values(computedPaymentBreakdown).reduce((s, v) => s + v, 0);
                const METHOD_CONFIG: Record<string, { icon: typeof Banknote; bg: string; color: string }> = {
                  efectivo: { icon: Banknote, bg: "bg-green-50 dark:bg-green-950/20", color: "text-green-700 dark:text-green-400" },
                  yape: { icon: Smartphone, bg: "bg-purple-50 dark:bg-purple-950/20", color: "text-purple-700 dark:text-purple-400" },
                  plin: { icon: Smartphone, bg: "bg-cyan-50 dark:bg-cyan-950/20", color: "text-cyan-700 dark:text-cyan-400" },
                  tarjeta: { icon: CreditCard, bg: "bg-blue-50 dark:bg-blue-950/20", color: "text-blue-700 dark:text-blue-400" },
                };
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(computedPaymentBreakdown).map(([method, amount]) => {
                      const config = METHOD_CONFIG[method] ?? { icon: Banknote, bg: "bg-gray-50", color: "text-gray-700" };
                      const pct = totalSales > 0 ? (amount / totalSales) * 100 : 0;
                      const Icon = config.icon;
                      return (
                        <div key={method} className={cn("rounded-xl border border-gray-100 dark:border-card-border p-3", config.bg)}>
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={cn("h-4 w-4", config.color)} />
                            <span className={cn("text-xs font-bold capitalize", config.color)}>{method}</span>
                          </div>
                          <p className="text-lg font-extrabold font-mono text-gray-900 dark:text-foreground">{fmt(amount)}</p>
                          <p className="text-[10px] text-gray-400 dark:text-muted">{pct.toFixed(0)}%</p>
                          <div className="mt-1.5 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-[#0f766e] rounded-full transition-all" style={{ width: `${pct}%` }} />
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
                <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                  <p className="text-xs font-bold text-gray-900 dark:text-foreground mb-3 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-primary" /> Movimientos de hoy
                  </p>
                  <div className="max-h-96 overflow-y-auto space-y-0">
                    {computedTimeline.map((item, idx) => {
                      const isLast = idx === computedTimeline.length - 1;
                      const timeStr = (() => { try { return new Date(item.time).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })();
                      const fullTimeStr = (() => { try { return new Date(item.time).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return ""; } })();
                      const isPositive = ["venta", "ingreso", "apertura"].includes(item.type);
                      const badgeColor = item.type === "apertura" ? "bg-indigo-100 text-indigo-700" :
                        item.type === "venta" ? "bg-emerald-100 text-emerald-700" :
                        item.type === "egreso" ? "bg-red-100 text-red-700" :
                        item.type === "ingreso" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700";
                      const isExpanded = expandedMovIdx === idx;
                      return (
                        <div key={idx} className="flex gap-3">
                          {/* Vertical line + dot */}
                          <div className="flex flex-col items-center">
                            <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1", isLast ? "bg-[#0f766e] animate-pulse" : "bg-[#0f766e]")} />
                            {!isLast && <div className="w-0.5 flex-1 bg-[#0f766e]/20 min-h-6" />}
                          </div>
                          {/* Content — clickable */}
                          <div
                            className="pb-3 flex-1 min-w-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg px-1.5 -mx-1.5 transition-colors"
                            onClick={() => setExpandedMovIdx(isExpanded ? null : idx)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] text-gray-400 dark:text-muted font-mono">{timeStr}</span>
                              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", badgeColor)}>{item.badge}</span>
                              {item.method && item.type === "venta" && (
                                <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 capitalize">{item.method}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-700 dark:text-foreground truncate">{item.description}</p>
                            <p className={cn("text-xs font-bold", isPositive ? "text-emerald-600" : "text-red-500")}>
                              {isPositive ? "+" : "-"}{fmt(item.amount)}
                            </p>
                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-white/5">
                                <p><span className="font-bold text-gray-700 dark:text-gray-300">Hora exacta:</span> {fullTimeStr}</p>
                                <p><span className="font-bold text-gray-700 dark:text-gray-300">Tipo:</span> <span className="capitalize">{item.badge}</span></p>
                                <p><span className="font-bold text-gray-700 dark:text-gray-300">Monto:</span> {fmt(item.amount)}</p>
                                {item.method && (
                                  <p><span className="font-bold text-gray-700 dark:text-gray-300">Metodo:</span> <span className="capitalize">{item.method}</span></p>
                                )}
                                {item.description && item.description !== item.type && (
                                  <p><span className="font-bold text-gray-700 dark:text-gray-300">Descripcion:</span> {item.description}</p>
                                )}
                                {item.type === "egreso" && (
                                  <p><span className="font-bold text-gray-700 dark:text-gray-300">Motivo:</span> {item.description || "Sin especificar"}</p>
                                )}
                                {item.saleId && (
                                  <p><span className="font-bold text-gray-700 dark:text-gray-300">ID Venta:</span> <span className="font-mono text-[10px]">{item.saleId.slice(0, 8)}...</span></p>
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
                        <div className="w-2.5 h-2.5 rounded-full bg-[#f97316] animate-pulse shrink-0 mt-1" />
                      </div>
                      <div className="pb-1">
                        <span className="text-[10px] text-gray-400 dark:text-muted font-mono">ahora</span>
                        <p className="text-xs font-bold text-gray-900 dark:text-foreground">Efectivo actual: {fmt(stats?.expectedCash ?? 0)}</p>
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
                  <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-3">
                    <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wide mb-2">Ventas por hora</p>
                    <div className="flex items-end gap-1 h-16">
                      {displayHours.map(h => (
                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className="w-full bg-primary/80 rounded-t transition-all min-h-[2px]"
                            style={{ height: `${maxH > 0 ? (h.value / maxH) * 48 : 0}px` }}
                            title={`${h.hour}:00 — ${fmt(h.value)}`}
                          />
                          <span className="text-[8px] text-gray-400">{h.hour}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Movements list */}
              <div className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border overflow-hidden">
                <div className="px-2 sm:px-4 py-2 sm:py-3 border-b flex flex-wrap items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground flex-1">Movimientos</h3>
                  {/* Method filter pills */}
                  <div className="flex gap-1 overflow-x-auto scrollbar-none">
                    {(["all", "efectivo", "yape", "plin", "tarjeta"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setMvFilter(m)}
                        className={cn(
                          "shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors",
                          mvFilter === m
                            ? "bg-primary text-white"
                            : "bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted hover:bg-gray-200"
                        )}
                      >
                        {m === "all" ? "Todos" : m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredMovements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-gray-400 dark:text-muted">
                    <History className="h-5 w-5 mb-1" />
                    <p className="text-xs font-semibold">Sin movimientos</p>
                  </div>
                ) : (
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {filteredMovements.map(m => {
                      const isPos = ["venta", "ingreso", "apertura"].includes(m.type);
                      return (
                        <div key={m.id} className="px-2 sm:px-4 py-1.5 sm:py-2.5 flex flex-wrap items-center gap-3 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
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
          {/* Mejora 11: Sparkline de diferencias con AreaChart + badge de tendencia */}
          {closedRegisters.length > 2 && (() => {
            const last30 = closedRegisters.slice(0, 30);
            const diffs = [...last30.map(r => r.difference ?? 0)].reverse();
            const sparkData = diffs.map((d, i) => ({ idx: i, diff: d, pos: d >= 0 ? d : 0, neg: d < 0 ? d : 0 }));

            // Badge de tendencia (solo si hay 10+ datos)
            let tendencia: { label: string; color: string } | null = null;
            if (diffs.length >= 10) {
              const last5 = diffs.slice(-5).map(d => Math.abs(d));
              const prev5 = diffs.slice(-10, -5).map(d => Math.abs(d));
              const avgLast = last5.reduce((s, v) => s + v, 0) / 5;
              const avgPrev = prev5.reduce((s, v) => s + v, 0) / 5;
              if (avgLast < avgPrev * 0.8) tendencia = { label: "Mejorando", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
              else if (avgLast > avgPrev * 1.2) tendencia = { label: "Empeorando", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
              else tendencia = { label: "Estable", color: "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-400" };
            } else if (diffs.length >= 5) {
              tendencia = { label: "Sin suficientes datos para tendencia", color: "bg-gray-100 text-gray-500 dark:bg-zinc-700 dark:text-zinc-400" };
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
              <Info className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Buscar por fecha o notas..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 dark:text-foreground"
              />
            </div>
          )}
          {filteredHistory.length === 0 ? (
            <div className="bg-white dark:bg-card rounded-xl border-2 border-dashed border-gray-200 dark:border-card-border p-8 text-center text-gray-400 dark:text-muted">
              <History className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm font-semibold">Sin historial de cajas</p>
            </div>
          ) : (
            filteredHistory.map(r => {
              const diff = r.difference ?? 0;
              const withinTolerance = Math.abs(diff) <= cashTolerance;
              return (
                <button
                  key={r.id}
                  onClick={() => setDetailRegister(r)}
                  className="w-full bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 text-left hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-wrap items-center gap-2">
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
                      <p className={cn("text-[10px] font-bold", withinTolerance ? "text-emerald-600" : diff > 0 ? "text-amber-600" : "text-red-500")}>
                        {diff > 0 ? "+" : ""}{fmt(diff)} diferencia
                      </p>
                    </div>
                  </div>
                  {/* Mejora 12: Tolerance badge */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] text-gray-400 dark:text-muted">
                    <span>Apertura: {fmt(r.openingAmount)}</span>
                    <span>Esperado: {fmt(r.expectedAmount ?? 0)}</span>
                    <span>Cierre: {fmt(r.closingAmount ?? 0)}</span>
                    {withinTolerance ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold">Dentro de tolerancia (±S/{cashTolerance})</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold">Fuera de tolerancia</span>
                    )}
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
                <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Flujo de Caja Semanal
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-[10px]">
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
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
                {weekData.map((day, idx) => {
                  const incomeH = maxBar > 0 ? (day.income / maxBar) * 80 : 0;
                  const expenseH = maxBar > 0 ? (day.expenses / maxBar) * 80 : 0;
                  const dayName = new Date(day.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" });
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="relative w-full h-20 flex flex-wrap items-end justify-center gap-0.5 mb-1">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-y-hidden overflow-x-auto">
                <table className="w-full min-w-[600px] text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-card-border text-left">
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Fecha</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Esperado</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Real</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-right">Diferencia</th>
                      <th className="px-2 sm:px-4 py-1.5 sm:py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wide text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(row => {
                      const diff = row.totalDiff;
                      const isOk = Math.abs(diff) <= cashTolerance;
                      const isMinor = !isOk && Math.abs(diff) <= cashTolerance * 2;
                      return (
                        <tr key={row.date} className={cn("transition-colors", !isOk && "bg-red-50/30")}>
                          <td className="px-2 sm:px-4 py-2 sm:py-3">
                            <p className="font-bold text-gray-900 dark:text-foreground">{new Date(row.date + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}</p>
                            <p className="text-gray-400 dark:text-muted">{row.count} caja{row.count > 1 ? "s" : ""}</p>
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-gray-600 dark:text-muted font-semibold">{fmt(row.totalExpected)}</td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-gray-900 dark:text-foreground">{fmt(row.totalClosing)}</td>
                          <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold", isOk ? "text-emerald-600" : isMinor ? "text-amber-600" : "text-red-600")}>
                            {diff > 0 ? "+" : ""}{fmt(diff)}
                          </td>
                          <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
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
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-3 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-4 flex flex-wrap items-center gap-2">
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
              <div className="flex flex-wrap gap-2 pt-1">
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
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-3 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3 flex flex-wrap items-center gap-2">
              <Lock className="h-4 w-4 text-gray-900 dark:text-foreground" /> Cerrar caja
            </h3>
            
            {/* Shift Summary */}
            <div className="bg-linear-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl p-4 mb-4 border border-indigo-100 dark:border-indigo-900/30">
              <h4 className="text-xs font-extrabold text-gray-900 dark:text-foreground mb-2 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                Resumen del turno
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 mb-2">
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
              <div className="flex flex-wrap gap-2 pt-1">
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
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-sm w-full p-3 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-4 flex flex-wrap items-center gap-2">
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
                <label className="text-xs font-bold text-gray-600 dark:text-muted">
                  Motivo {mvType === "egreso" && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={mvMotivo}
                  onChange={e => setMvMotivo(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary bg-white dark:bg-card"
                >
                  <option value="">Seleccionar motivo...</option>
                  <option value="Cambio">Cambio</option>
                  <option value="Pago a proveedor">Pago a proveedor</option>
                  <option value="Retiro personal">Retiro personal</option>
                  <option value="Ingreso extra">Ingreso extra</option>
                  <option value="Cobro pendiente">Cobro pendiente</option>
                  <option value="Compra de insumos">Compra de insumos</option>
                  <option value="Otro">Otro</option>
                </select>
                {mvType === "egreso" && !mvMotivo && !mvDescription.trim() && (
                  <p className="text-[10px] text-red-500 mt-1">Motivo obligatorio para egresos</p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted">
                  Descripcion (opcional)
                </label>
                <textarea
                  value={mvDescription}
                  onChange={e => setMvDescription(e.target.value)}
                  placeholder="Detalle adicional..."
                  rows={2}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-gray-900 dark:text-foreground outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => setShowMovement(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
                  Cancelar
                </button>
                <button
                  onClick={handleAddMovement}
                  disabled={addingMv || !mvAmount || (mvType === "egreso" && !mvMotivo && !mvDescription.trim())}
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
            <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-3 sm:p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3 flex flex-wrap items-center gap-2">
                <Scan className="h-4 w-4 text-blue-600" /> Arqueo Express
              </h3>
              
              <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl p-4 mb-4 border border-blue-100 dark:border-blue-900/30">
                <h4 className="text-xs font-extrabold text-gray-900 dark:text-foreground mb-2 flex items-center gap-1">
                  <Calculator className="h-3.5 w-3.5 text-blue-600" />
                  Verificación rápida de caja
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
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
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                      {Math.abs(difference) < 0.5 ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase">Diferencia</span>
                    </div>
                    <p className={cn(
                      "text-xl sm:text-2xl font-extrabold",
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
                
                <div className="flex flex-wrap gap-2 pt-1">
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

      {/* Arqueo Guiado modal */}
      {showArqueoGuiado && currentRegister && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowArqueoGuiado(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-3 sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-3 flex flex-wrap items-center gap-2">
              <Calculator className="h-4 w-4 text-violet-600" /> Arqueo Guiado
            </h3>

            {/* Expected */}
            <div className="bg-linear-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20 rounded-xl p-4 mb-4 border border-violet-100 dark:border-violet-900/30">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500 dark:text-muted">Saldo esperado</p>
                  <p className="font-bold text-violet-600">{fmt(guiadoExpected)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-muted">Total contado</p>
                  <p className="font-bold text-gray-900 dark:text-foreground">{fmt(guiadoTotal)}</p>
                </div>
              </div>
            </div>

            {/* Billetes section */}
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border mb-3">
              <label className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center gap-1 mb-2">
                <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                Billetes
              </label>
              <div className="space-y-2">
                {BILLETES.map(b => (
                  <div key={b} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-600 dark:text-muted w-14 text-right">S/{b}</span>
                    <span className="text-gray-300 dark:text-gray-600">×</span>
                    <input
                      type="number"
                      min="0"
                      value={guiadoBilletes[String(b)] ?? ""}
                      onChange={e => setGuiadoBilletes(prev => ({ ...prev, [String(b)]: Number(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-center text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                    />
                    <span className="text-xs text-gray-400 dark:text-muted flex-1 text-right">
                      = {fmt(b * (guiadoBilletes[String(b)] ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs font-bold text-emerald-600">Subtotal: {fmt(guiadoTotalBilletes)}</span>
              </div>
            </div>

            {/* Monedas section */}
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border mb-3">
              <label className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center gap-1 mb-2">
                <DollarSign className="h-3.5 w-3.5 text-amber-500" />
                Monedas
              </label>
              <div className="space-y-2">
                {MONEDAS.map(m => (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-600 dark:text-muted w-14 text-right">S/{m < 1 ? m.toFixed(2) : m}</span>
                    <span className="text-gray-300 dark:text-gray-600">×</span>
                    <input
                      type="number"
                      min="0"
                      value={guiadoMonedas[String(m)] ?? ""}
                      onChange={e => setGuiadoMonedas(prev => ({ ...prev, [String(m)]: Number(e.target.value) || 0 }))}
                      placeholder="0"
                      className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border text-sm text-center text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
                    />
                    <span className="text-xs text-gray-400 dark:text-muted flex-1 text-right">
                      = {fmt(m * (guiadoMonedas[String(m)] ?? 0))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right">
                <span className="text-xs font-bold text-amber-500">Subtotal: {fmt(guiadoTotalMonedas)}</span>
              </div>
            </div>

            {/* Mejora 9: Arqueo por metodo de pago */}
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border mb-3">
              <div className="flex gap-1 mb-3">
                {(["efectivo", "yape", "plin", "tarjeta"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setArqueoTab(tab)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors capitalize",
                      arqueoTab === tab
                        ? "bg-[#0f766e] text-white"
                        : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:bg-gray-100"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {arqueoTab === "efectivo" && (
                <p className="text-[10px] text-gray-400 dark:text-muted">Usa los conteos de billetes y monedas de arriba para el efectivo.</p>
              )}
              {arqueoTab === "yape" && (
                <div>
                  <label className="text-xs font-bold text-purple-600 mb-1 block">Total en vouchers Yape</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">S/</span>
                    <input type="number" min="0" step="0.10" value={arqueoYape} onChange={e => setArqueoYape(e.target.value)} placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-purple-500" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Suma los comprobantes de Yape del dia</p>
                </div>
              )}
              {arqueoTab === "plin" && (
                <div>
                  <label className="text-xs font-bold text-cyan-600 mb-1 block">Total en vouchers Plin</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">S/</span>
                    <input type="number" min="0" step="0.10" value={arqueoPlin} onChange={e => setArqueoPlin(e.target.value)} placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-cyan-500" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Suma los comprobantes de Plin del dia</p>
                </div>
              )}
              {arqueoTab === "tarjeta" && (
                <div>
                  <label className="text-xs font-bold text-blue-600 mb-1 block">Total en vouchers tarjeta</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">S/</span>
                    <input type="number" min="0" step="0.10" value={arqueoTarjeta} onChange={e => setArqueoTarjeta(e.target.value)} placeholder="0.00"
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground outline-none focus:border-blue-500" />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Suma los vouchers de tarjeta del dia</p>
                </div>
              )}
              {/* Comparacion por metodo */}
              {(Number(arqueoYape) > 0 || Number(arqueoPlin) > 0 || Number(arqueoTarjeta) > 0) && (
                <div className="mt-3 pt-2 border-t border-gray-200 dark:border-card-border space-y-1">
                  <p className="text-[10px] font-bold text-gray-500 dark:text-muted uppercase">Comparacion por metodo</p>
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
                        <span className="capitalize text-gray-600 dark:text-muted">{r.method}</span>
                        <span className={cn("font-bold", ok ? "text-emerald-600" : "text-red-500")}>
                          {ok ? "OK" : `${diff >= 0 ? "+" : ""}S/${diff.toFixed(2)}`} {ok ? "\u2713" : "\u26A0"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mejora 10: Foto de evidencia */}
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-200 dark:border-card-border mb-3">
              <label className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center gap-1 mb-2">
                <Camera className="h-3.5 w-3.5 text-gray-500" />
                Foto del cajon (opcional, recomendado)
              </label>
              {arqueoFoto ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={arqueoFoto} alt="Foto del cajon" className="max-w-[200px] max-h-[120px] object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => setArqueoFoto(null)}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fotoInputRef.current?.click()}
                  className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-card-border text-xs text-gray-400 dark:text-muted hover:border-primary hover:text-primary transition-colors"
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
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">Total contado</p>
              <p className="text-2xl font-extrabold text-primary">{fmt(guiadoTotal + (Number(arqueoYape) || 0) + (Number(arqueoPlin) || 0) + (Number(arqueoTarjeta) || 0))}</p>
              {(Number(arqueoYape) > 0 || Number(arqueoPlin) > 0 || Number(arqueoTarjeta) > 0) && (
                <p className="text-[10px] text-gray-400 mt-1">Efectivo: {fmt(guiadoTotal)} + Digital: {fmt((Number(arqueoYape) || 0) + (Number(arqueoPlin) || 0) + (Number(arqueoTarjeta) || 0))}</p>
              )}
            </div>

            {guiadoTotal > 0 && (
              <div className={cn(
                "rounded-xl p-3 text-center border-2 mb-3",
                Math.abs(guiadoDiff) < 0.5
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30"
                  : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30"
              )}>
                <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                  {Math.abs(guiadoDiff) < 0.5 ? (
                    <Check className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-xs font-bold text-gray-500 dark:text-muted uppercase">Diferencia</span>
                </div>
                <p className={cn(
                  "text-xl font-extrabold",
                  Math.abs(guiadoDiff) < 0.5 ? "text-emerald-600" : "text-red-500"
                )}>
                  {guiadoDiff >= 0 ? "+" : ""}{fmt(guiadoDiff)}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-muted mt-1">
                  {Math.abs(guiadoDiff) < 0.5
                    ? "Cuadra correctamente"
                    : guiadoDiff > 0
                      ? "Hay más efectivo del esperado"
                      : "Falta efectivo"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => { setShowArqueoGuiado(false); setGuiadoBilletes({}); setGuiadoMonedas({}); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                onClick={handleArqueoGuiado}
                disabled={addingArqueoGuiado || guiadoTotal <= 0}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {addingArqueoGuiado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar Arqueo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail register modal (history) */}
      {detailRegister && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setDetailRegister(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-2 sm:px-4 py-2 sm:py-3 border-b flex items-center justify-between">
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
            <div className="px-2 sm:px-4 py-2 sm:py-3 border-b bg-gray-50 dark:bg-surface grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-center">
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
                <div className="px-2 sm:px-4 py-1.5 sm:py-2.5 border-b bg-white dark:bg-card">
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
              "px-2 sm:px-4 py-1.5 sm:py-2 text-center text-xs font-bold border-b",
              (detailRegister.difference ?? 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
            )}>
              Diferencia: {(detailRegister.difference ?? 0) > 0 ? "+" : ""}{fmt(detailRegister.difference ?? 0)}
            </div>
            {/* Movements */}
            <div className="flex-1 overflow-y-auto divide-y">
              {detailRegister.movements.map(m => {
                const isPos = ["venta", "ingreso", "apertura"].includes(m.type);
                return (
                  <div key={m.id} className="px-2 sm:px-4 py-1.5 sm:py-2.5 flex flex-wrap items-center gap-3">
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

