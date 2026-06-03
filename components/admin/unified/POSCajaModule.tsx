"use client";
import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { m } from "@/components/admin/providers";
import {
  ShoppingCart, Wallet, CreditCard, Scale, HandCoins,
  Banknote, History, ArrowRight, Clock, Users, BarChart3,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

const MODULE_ID = "ventas-caja";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const VentasOverviewTab      = dynamic(() => import("@/components/admin/VentasOverviewTab"),      { loading: S });
const POSView                = dynamic(() => import("@/components/admin/POSView"),                { loading: S });
const SalesHistoryTab        = dynamic(() => import("@/components/admin/SalesHistoryTab"),        { loading: S });
const CashRegisterTab        = dynamic(() => import("@/components/admin/CashRegisterTab"),        { loading: S });
const CashAuditTab           = dynamic(() => import("@/components/admin/CashAuditTab"),           { loading: S });
const FiadosModule           = dynamic(() => import("@/components/admin/FiadosModule"),           { loading: S });
const TurnosModule           = dynamic(() => import("@/components/admin/TurnosModule"),           { loading: S });
const OfflineIndicator       = dynamic(() => import("@/components/admin/OfflineIndicator"),       { ssr: false });
const CommissionCalculator   = dynamic(() => import("@/components/admin/CommissionCalculator"),   { loading: S });

import { usePOSOffline } from "@/components/admin/pos/usePOSOffline";


// ── Tabs reordenados en flujo lógico del día ──────────────────────────────────
const TABS = [
  { id: "tablero"           as const, label: "Tablero",           shortLabel: "Tablero",   hint: "Resumen por canal",   icon: BarChart3,     desc: "Ventas e ingresos: marketplace, tienda y punto de venta" },
  { id: "pos"               as const, label: "Vender",            shortLabel: "POS",       hint: "Punto de venta",      icon: ShoppingCart,  desc: "Busca productos, cobra y genera comprobantes" },
  { id: "historial"         as const, label: "Historial",         shortLabel: "Historial", hint: "Todas las ventas",    icon: History,       desc: "POS + tienda + marketplace en un solo lugar" },
  { id: "turnos"            as const, label: "Turnos",            shortLabel: "Turnos",    hint: "Control de personal", icon: Clock,         desc: "Abre y cierra turnos de trabajo del equipo" },
  { id: "caja-registradora" as const, label: "Caja Registradora", shortLabel: "Caja",      hint: "Gestión de efectivo", icon: Wallet,        desc: "Movimientos de efectivo, retiros e ingresos" },
  { id: "cuentas-cobrar"    as const, label: "Me deben",          shortLabel: "Fiados",    hint: "Créditos a clientes", icon: HandCoins,     desc: "Créditos otorgados, cobros y seguimiento" },
  { id: "arqueo"            as const, label: "Cuadrar Caja",      shortLabel: "Cuadre",    hint: "Cierre del día",      icon: Scale,         desc: "Conteo de billetes y cierre del día" },
  { id: "comisiones"        as const, label: "Comisiones",        shortLabel: "Comisiones", hint: "Cálculo comisiones", icon: Users,         desc: "Calcula comisiones de vendedores" },
];

// Índices tras los cuales insertar separador visual (entre grupos lógicos)
const _SEPARATOR_AFTER_INDICES = [1, 3, 4]; // Después de Dashboard (idx 1), Turnos (idx 3), Caja Registradora (idx 4)

type TabId = typeof TABS[number]["id"];

function normalizeVentasCajaTab(savedTab: string | null): TabId {
  if (savedTab === "resumen" || savedTab === "dashboard") {
    return "tablero";
  }
  if (savedTab === "pedidos") {
    return "pos";
  }

  return TABS.some(tab => tab.id === savedTab) ? (savedTab as TabId) : TABS[0].id;
}

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
      const res = await fetch("/api/sales?today=1&limit=1000");
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
      await fetch("/api/cash-registers/close-shift", { method: "POST", headers: csrfHeaders() });
    } catch {
      // ignore — shift close is optional
    }
    setConfirming(false);
    onConfirm();
  };

  const fmt = (n: number) => `S/${n.toFixed(2)}`;

  return (
    <div className="modal-backdrop flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-4">
          <CardTitle className="text-lg font-extrabold text-white">Cerrar Turno</CardTitle>
          <p className="text-sm text-white/80">Resumen del día antes de cerrar</p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-[var(--data-error-500)] bg-[var(--data-error-50)] rounded-xl p-4 text-center">
              {error}
              <button onClick={fetchSummary} className="block mx-auto mt-2 text-xs font-bold underline">Reintentar</button>
            </div>
          ) : summary ? (
            <>
              {/* Big total */}
              <div className="text-center pb-2 border-b border-[var(--rule-soft)]">
                <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">Total vendido en el turno</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-4xl font-extrabold text-primary tracking-tight">{fmt(summary.totalVendido)}</p>
                </div>
                <div className="inline-flex items-center gap-1.5 mt-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
                  <History className="h-3.5 w-3.5" />
                  {summary.numVentas} {summary.numVentas === 1 ? "operación" : "operaciones"} de venta
                </div>
              </div>

              {/* Payment breakdown - Premium Grid */}
              <div className="space-y-3">
                <p className="text-xs font-extrabold text-[var(--text-tertiary)] pl-1">Desglose de ingresos</p>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="col-span-2 bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 rounded-xl p-4 flex items-center justify-between group relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 h-16 w-16 bg-[var(--accent-soft)] rounded-full blur-xl group-hover:bg-[var(--accent-soft)] transition-all" />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="h-10 w-10 bg-[var(--accent-soft)] rounded-full flex items-center justify-center">
                        <Banknote className="h-5 w-5 text-[var(--data-success-500)]" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--data-success-500)]/80">Efectivo (Caja)</p>
                        <p className="text-lg font-extrabold text-[var(--data-success-500)]">{fmt(summary.efectivo)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />
                      <p className="text-xs font-bold text-[var(--text-secondary)]/80">Yape</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--text-secondary)]">{fmt(summary.yape)}</p>
                  </div>

                  <div className="bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-[var(--accent-soft)]" />
                      <p className="text-xs font-bold text-[var(--data-success-500)]/80">Plin</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--data-success-500)]">{fmt(summary.plin)}</p>
                  </div>

                  <div className="bg-[var(--accent-soft)] border border-[var(--data-success-500)]/30 rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-3 w-3 text-[var(--data-success-500)]" />
                      <p className="text-xs font-bold text-[var(--data-success-500)]/80">Tarjeta / POS</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--data-success-500)]">{fmt(summary.tarjeta)}</p>
                  </div>

                  <div className="bg-[var(--data-warning-50)] border border-[var(--data-warning-500)] rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-3 w-3 text-[var(--data-warning-500)]" />
                      <p className="text-xs font-bold text-[var(--data-warning-500)]/80">Fiado</p>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-[var(--data-warning-500)]">{fmt(summary.fiado)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !!error || confirming}
            className="flex-1 py-2.5 rounded-lg bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] disabled:opacity-50 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            {confirming ? "Cerrando..." : "Confirmar Cierre"}
            {!confirming && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Module ─────────────────────────────────────────────────────────────

export default function POSCajaModule() {
  const [sub, setSub] = useState<TabId>(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return normalizeVentasCajaTab(localStorage.getItem(`admin-last-tab-${MODULE_ID}`));
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);
  const [showShiftClose, setShowShiftClose] = useState(false);
  const { pendingCount, isOnline: _isOnline } = usePOSOffline();

  // ── Estado de turno abierto ──────────────────────────────────────────────
  const [turnoAbierto, setTurnoAbierto] = useState(false);

  // Fetch turno activo al montar y al cambiar de tab (por si se abrió/cerró)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/turnos/activo")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setTurnoAbierto(!!data.turnoActivo); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [sub]);

  const handleOpenCloseModal = () => {
    if (pendingCount > 0) {
      alert(`Tienes ${pendingCount} ventas pendientes de sincronizar en modo Offline.\nPor favor, conecta a internet y pulsa "Sincronizar ahora" en la barra azul antes de cerrar el turno. De lo contrario esas ventas no se reflejarán en el corte.`);
      return;
    }
    setShowShiftClose(true);
  };

  const handleShiftClosed = () => {
    setShowShiftClose(false);
    setTurnoAbierto(false);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <OfflineIndicator />

      <AdminModuleHeader
        eyebrow="Operaciones · Punto de venta"
        title="Ventas y Caja"
        description="Vende, cobra, gestiona tu turno y cierra caja. Todo el flujo del mostrador en un solo lugar."
        icon={ShoppingCart}
      />

      {/* La barra flotante 'Sin turno/Abrir Turno' se movio:
          - Chip de status es ahora rightSlot del AdminTabBar (micro, inline)
          - El boton CTA full se renderiza dentro de POSView/TurnosModule
            donde pertenece contextualmente.
          Gano ~60px verticales + accion en su contexto correcto. */}

      <AdminTabBar
        tabs={TABS.map(t => ({
          id: t.id,
          label: t.label,
          shortLabel: t.shortLabel,
          icon: t.icon,
        }))}
        activeTab={sub}
        onTabChange={(id) => setSub(id as TabId)}
        moduleId="pos-caja"
        rightSlot={
          /* Chip micro de status — visible desde cualquier sub-tab.
             - Turno abierto: abre modal para cerrar (accion mas frecuente).
             - Turno cerrado: navega a Turnos (donde se abre con el form). */
          <button
            type="button"
            onClick={() => {
              if (turnoAbierto) handleOpenCloseModal();
              else setSub("turnos");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors",
              turnoAbierto
                ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] hover:bg-[var(--accent-soft)]/80"
                : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200",
            )}
            title={turnoAbierto ? "Turno abierto — click para cerrar" : "Sin turno — click para abrir uno"}
          >
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              turnoAbierto ? "bg-[var(--data-success-500)] animate-pulse" : "bg-[var(--text-tertiary)]",
            )} aria-hidden />
            {turnoAbierto ? "Turno abierto" : "Sin turno"}
          </button>
        }
      >

      {/* ── Mobile Cerrar/Abrir Turno button — fixed at bottom ───────── */}
      <div className="sm:hidden fixed bottom-16 right-4 z-40">
        {turnoAbierto ? (
          <button
            onClick={handleOpenCloseModal}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors flex items-center gap-1.5"
          >
            <span className="h-2 w-2 rounded-full bg-white/70 animate-pulse" />
            Cerrar Turno
          </button>
        ) : (
          <button
            onClick={() => setSub("turnos")}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary-dark transition-colors flex items-center gap-1.5"
          >
            Abrir Turno
          </button>
        )}
      </div>

      {/* ── CAMBIO 7: Renderizado de contenido por tab ───────────────── */}
      {sub === "tablero"           && <VentasOverviewTab />}
      {sub === "pos"               && <POSView />}
      {sub === "historial"         && <SalesHistoryTab />}
      {sub === "turnos"            && <TurnosModule />}
      {sub === "caja-registradora" && <CashRegisterTab />}
      {sub === "cuentas-cobrar"    && <FiadosModule />}
      {sub === "arqueo"            && <CashAuditTab onNavigateToTurnos={() => setSub("caja-registradora")} />}
      {sub === "comisiones"        && <CommissionCalculator />}

      {/* Shift close modal */}
      {showShiftClose && (
        <ShiftCloseModal
          onClose={() => setShowShiftClose(false)}
          onConfirm={handleShiftClosed}
        />
      )}
      </AdminTabBar>
    </div>
  );
}
