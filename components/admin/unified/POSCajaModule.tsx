"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";


const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const POSView                = dynamic(() => import("@/components/admin/POSView"),                { loading: S });
const CashRegisterTab        = dynamic(() => import("@/components/admin/CashRegisterTab"),        { loading: S });
const CashAuditTab           = dynamic(() => import("@/components/admin/CashAuditTab"),           { loading: S });
const SalesOrdersTab         = dynamic(() => import("@/components/admin/SalesOrdersTab"),         { loading: S });
const AccountsReceivableTab  = dynamic(() => import("@/components/admin/AccountsReceivableTab"),  { loading: S });
const OfflineIndicator       = dynamic(() => import("@/components/admin/OfflineIndicator"),       { ssr: false });

const TABS = [
  { id: "pos"               as const, label: "Vender",           shortLabel: "Vender",  hint: "Cobrar y buscar" },
  { id: "caja-registradora" as const, label: "Caja Registradora", shortLabel: "Caja",   hint: "Apertura y cierre" },
  { id: "arqueo"            as const, label: "Cuadrar la Caja",  shortLabel: "Cuadre",  hint: "Cuadre rápido" },
  { id: "pedidos"           as const, label: "Pedidos",          shortLabel: "Pedidos", hint: "Pedidos activos" },
  { id: "cuentas-cobrar"    as const, label: "Me deben (fiado)", shortLabel: "Fiado",   hint: "Cuentas por cobrar" },
];

// ── Shift Close Modal Types ─────────────────────────────────────────────────

interface ShiftSummary {
  totalVendido: number;
  numVentas: number;
  efectivo: number;
  yape: number;
  plin: number;
  tarjeta: number;
  fiado: number;
}

function ShiftCloseModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sales?today=1");
      if (!res.ok) throw new Error("No se pudo cargar las ventas");
      const sales = await res.json();
      const arr = Array.isArray(sales) ? sales : [];

      const data: ShiftSummary = {
        totalVendido: 0,
        numVentas: arr.length,
        efectivo: 0,
        yape: 0,
        plin: 0,
        tarjeta: 0,
        fiado: 0,
      };

      for (const sale of arr) {
        const total = typeof sale.total === "number" ? sale.total : 0;
        data.totalVendido += total;
        const pm = (sale.payment ?? "").toLowerCase();
        if (pm.includes("efectivo")) data.efectivo += total;
        else if (pm.includes("yape")) data.yape += total;
        else if (pm.includes("plin")) data.plin += total;
        else if (pm.includes("tarjeta")) data.tarjeta += total;
        else if (pm.includes("fiado")) data.fiado += total;
        else data.efectivo += total; // default bucket
      }

      setSummary(data);
    } catch {
      setError("Error al cargar el resumen de ventas");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleConfirm = async () => {
    setConfirming(true);
    // Attempt to close shift via API (best-effort)
    try {
      await fetch("/api/cash-registers/close-shift", { method: "POST" });
    } catch {
      // ignore — shift close is optional
    }
    setConfirming(false);
    onConfirm();
  };

  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-4">
          <h3 className="text-lg font-extrabold text-white">Cerrar Turno</h3>
          <p className="text-sm text-white/80">Resumen del dia antes de cerrar</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-xl p-4 text-center">
              {error}
              <button onClick={fetchSummary} className="block mx-auto mt-2 text-xs font-bold underline">Reintentar</button>
            </div>
          ) : summary ? (
            <>
              {/* Big total */}
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-500 dark:text-muted">Total vendido hoy</p>
                <p className="text-3xl font-extrabold text-primary mt-1">{fmt(summary.totalVendido)}</p>
                <p className="text-sm text-gray-500 dark:text-muted mt-1">{summary.numVentas} venta{summary.numVentas !== 1 ? "s" : ""}</p>
              </div>

              {/* Payment breakdown */}
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Desglose por metodo de pago</p>
                {[
                  { label: "Efectivo", value: summary.efectivo, color: "bg-emerald-500" },
                  { label: "Yape",     value: summary.yape,     color: "bg-purple-500" },
                  { label: "Plin",     value: summary.plin,     color: "bg-cyan-500" },
                  { label: "Tarjeta",  value: summary.tarjeta,  color: "bg-blue-500" },
                  { label: "Fiado",    value: summary.fiado,    color: "bg-amber-500" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                      <span className="text-sm font-semibold text-gray-700 dark:text-foreground">{item.label}</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-foreground">{fmt(item.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !!error || confirming}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-sm font-bold text-white transition-colors"
          >
            {confirming ? "Cerrando..." : "Confirmar Cierre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Module ─────────────────────────────────────────────────────────────

export default function POSCajaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [showShiftClose, setShowShiftClose] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("banner-pos");
    if (stored === "hidden") setBannerVisible(false);
  }, []);
  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-pos", next ? "visible" : "hidden");
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <OfflineIndicator />
      {bannerVisible && (
        <button onClick={toggleBanner} className="w-full text-left bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#2d6a4f]/10">
          <p className="text-sm text-[#2d6a4f] dark:text-emerald-400">
            <span className="font-semibold">Vender y Caja</span> — Aquí cobras a tus clientes, controlas los turnos de caja y cuadras el dinero al final del día.
          </p>
        </button>
      )}
      {!bannerVisible && (
        <button onClick={toggleBanner} className="text-xs text-gray-400 hover:text-[#2d6a4f] transition-colors">
          Mostrar descripción
        </button>
      )}
      {/* Mobile tabs — pills (5 tabs, grid ajustado) */}
      <div className="grid grid-cols-3 gap-2 sm:hidden">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`relative rounded-2xl border px-2 py-2.5 text-left transition-all ${
              sub === t.id
                ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                : "border-gray-200 bg-white text-gray-600 dark:border-card-border dark:bg-card dark:text-muted"
            }`}
            aria-current={sub === t.id ? "page" : undefined}
          >
            <span className="block text-xs font-extrabold leading-tight">{t.shortLabel}</span>
            <span className={`mt-1 block text-[10px] leading-tight ${sub === t.id ? "text-white/80" : "text-gray-400 dark:text-muted"}`}>
              {t.hint}
            </span>
            {sub === t.id && <span className="absolute inset-x-3 bottom-0 h-1 rounded-full bg-white/70" />}
          </button>
        ))}
      </div>

      {/* Desktop tabs (underline — estándar) + Cerrar Turno button */}
      <div className="hidden sm:flex items-center gap-1 border-b border-gray-200 dark:border-card-border -mx-1 px-1">
        <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none flex-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`shrink-0 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
                sub === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowShiftClose(true)}
          className="shrink-0 ml-auto px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/30 transition-colors"
        >
          Cerrar Turno
        </button>
      </div>

      {/* Mobile Cerrar Turno button — fixed at bottom */}
      <div className="sm:hidden fixed bottom-16 right-4 z-40">
        <button
          onClick={() => setShowShiftClose(true)}
          className="px-4 py-2.5 rounded-2xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/30 transition-colors flex items-center gap-1.5"
        >
          <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
          Cerrar Turno
        </button>
      </div>

      {sub === "pos"               && <POSView />}
      {sub === "caja-registradora" && <CashRegisterTab />}
      {sub === "arqueo"            && <CashAuditTab onNavigateToTurnos={() => setSub("caja-registradora")} />}
      {sub === "pedidos"           && <SalesOrdersTab />}
      {sub === "cuentas-cobrar"    && <AccountsReceivableTab />}

      {/* Shift close modal */}
      {showShiftClose && (
        <ShiftCloseModal
          onClose={() => setShowShiftClose(false)}
          onConfirm={() => setShowShiftClose(false)}
        />
      )}
    </div>
  );
}
