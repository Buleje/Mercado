"use client";
import { CardTitle } from "@buleje/design-system";
 
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, ArrowLeftRight, CalendarClock, TrendingDown,
  ListChecks, X as XIcon,
} from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Existing tabs ──
const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: S });
const SimpleMovementsTab = dynamic(() => import("@/components/admin/inventario/SimpleMovementsTab"), { loading: S });
const SimpleExpiryTab = dynamic(() => import("@/components/admin/inventario/SimpleExpiryTab"), { loading: S });
// Mermas/Pérdidas: ShrinkageTab estaba huérfano (0 imports) y roto contra /api/mermas
// (GET paginado, cause↔lossType, registeredBy). Reparado + montado. Brandon 2026-06-20.
const ShrinkageTab = dynamic(() => import("@/components/admin/ShrinkageTab"), { loading: S });
const PhysicalCountTab = dynamic(() => import("@/components/admin/PhysicalCountTab"), { loading: S });
const QuickStockCounter = dynamic(() => import("@/components/admin/QuickStockCounter"), { loading: S });

// ── New Upgrade tabs ──
const ConteoFisicoWizard = dynamic(() => import("@/components/admin/inventario/ConteoFisicoWizard"), { loading: S });
const DeclaracionInventarioModule = dynamic(() => import("@/components/admin/DeclaracionInventarioModule"), { loading: S });
const DemandForecast = dynamic(() => import("@/components/admin/inventario/DemandForecast"), { loading: S });
const BarcodeScanner = dynamic(() => import("@/components/admin/inventario/BarcodeScanner"), { ssr: false, loading: S });

const MODULE_ID = "inventario";

const TABS = [
  // ── Grupo 1: Stock ──
  { id: "stock" as const, label: "Stock", icon: Package },
  // ── Grupo 2: Entradas y Salidas ──
  { id: "kardex" as const, label: "Entradas y Salidas", icon: ArrowLeftRight },
  // ── Grupo 3: Vencimientos ──
  { id: "lotes" as const, label: "Vencimientos", icon: CalendarClock },
  // ── Grupo 4: Pérdidas (mermas) ──
  { id: "mermas" as const, label: "Pérdidas", icon: TrendingDown },
];

export default function InventarioAlmacenesModule() {
  const [sub, setSub] = useState(() => {
    if (typeof window === "undefined") return TABS[0].id;
    return (localStorage.getItem(`admin-last-tab-${MODULE_ID}`) as typeof TABS[number]["id"]) || TABS[0].id;
  });
  useEffect(() => { localStorage.setItem(`admin-last-tab-${MODULE_ID}`, sub); }, [sub]);
  const [conteoMode, setConteoMode] = useState<"wizard" | "manual" | "scanner">("wizard");
  const [showConteoModal, setShowConteoModal] = useState(false);
  const [showDeclaracionModal, setShowDeclaracionModal] = useState(false);

  // Auto-refresh: increment key to force child remount/re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  const { paused, togglePause, secondsLeft, refreshNow, isActive } = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: () => setRefreshKey(k => k + 1),
    enabled: sub === "stock",
  });

  const [forecastProductId, setForecastProductId] = useState<number | null>(null);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showPriceLabels, setShowPriceLabels] = useState(false);
  const [labelProducts, setLabelProducts] = useState<{ id: number; name: string; price: number; barcode?: string | null }[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<number>>(new Set());
  const [labelLoading, setLabelLoading] = useState(false);

  const loadLabelProducts = useCallback(async () => {
    setLabelLoading(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (Array.isArray(data)) setLabelProducts(data.filter((p: { active: boolean }) => p.active));
    } catch { /* ignore */ }
    setLabelLoading(false);
  }, []);

  const toggleLabelId = (id: number) => {
    setSelectedLabelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePrintLabels = () => {
    const selected = labelProducts.filter(p => selectedLabelIds.has(p.id));
    if (selected.length === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const labelsHtml = selected.map(p => `
      <div class="label">
        <div class="label-name">${p.name}</div>
        <div class="label-price">S/ ${Number(p.price).toFixed(2)}</div>
        ${p.barcode ? `<div class="label-barcode">${p.barcode}</div>` : ""}
      </div>
    `).join("");
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Etiquetas de Precio</title><style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
      .label { width: 60mm; height: 40mm; border: 1px dashed #ccc; padding: 3mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-inside: avoid; }
      .label-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; overflow: hidden; max-height: 2.4em; line-height: 1.2em; }
      .label-price { font-weight: bold; font-size: 18px; color: var(--color-primary); }
      .label-barcode { font-family: monospace; font-size: 10px; color: #666; margin-top: 4px; }
    </style></head><body><div class="grid">${labelsHtml}</div><script>window.print();window.onafterprint=()=>window.close();</script></body></html>`);
    printWindow.document.close();
  };



  // Exposed for InventoryTab: open forecast for a product
  // This is set via a global callback so InventoryTab can trigger it
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__openForecast = (productId: number) => {
      setForecastProductId(productId);
    };
    (window as unknown as Record<string, unknown>).__openBarcodeScanner = () => {
      setShowBarcode(true);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__openForecast;
      delete (window as unknown as Record<string, unknown>).__openBarcodeScanner;
    };
  }, []);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Inventario"
        description="Stock, movimientos, vencimientos y análisis"
        icon={Package}
        bgTint="bg-amber-50 dark:bg-amber-900/20"
        iconColorClass="text-[var(--data-warning-600)] dark:text-amber-400"
      >
        {sub === "stock" && (
          <AutoRefreshControl
            secondsLeft={secondsLeft}
            paused={paused}
            isActive={isActive}
            onTogglePause={togglePause}
            onRefreshNow={refreshNow}
          />
        )}
        {/* Mejora 7: Price labels button */}
        <button
          onClick={() => { setShowPriceLabels(true); void loadLabelProducts(); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-alt)] transition-colors"
        >
          Imprimir etiquetas
        </button>
      </AdminModuleHeader>



      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={(id) => setSub(id as typeof sub)}
        moduleId="inventario"
      >

      {/* Tab 1: Existencias — Conteo físico y Declaración viven dentro del
          menú "Más acciones" de InventoryTab (se pasan como headerActions). */}
      {sub === "stock" && (
        <div key={refreshKey} className="space-y-6">
          <InventoryTab
            headerActions={[
              {
                label: "Conteo físico",
                icon: ListChecks,
                onClick: () => setShowConteoModal(true),
                description: "Contar y conciliar el stock real",
              },
              {
                label: "Generar declaración",
                icon: LayoutDashboard,
                onClick: () => setShowDeclaracionModal(true),
                description: "Declaración jurada de inventario",
              },
            ]}
          />
        </div>
      )}

      {/* Tab 2: Entradas y Salidas (simplificado) */}
      {sub === "kardex" && <SimpleMovementsTab />}

      {/* Tab 3: Vencimientos (simplificado) */}
      {sub === "lotes" && <SimpleExpiryTab />}
      {sub === "mermas" && <ShrinkageTab />}

      </AdminTabBar>

      {/* ── Modal: Conteo Físico ── */}
      {showConteoModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowConteoModal(false)}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-4xl sm:rounded-xl rounded-t-2xl overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] sticky top-0 bg-[var(--surface-raised)] z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Conteo Físico</CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <button onClick={() => setConteoMode("wizard")} className={cn("px-3 py-1 rounded-lg text-xs font-medium", conteoMode === "wizard" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Guiado</button>
                  <button onClick={() => setConteoMode("manual")} className={cn("px-3 py-1 rounded-lg text-xs font-medium", conteoMode === "manual" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Manual</button>
                  <button onClick={() => setConteoMode("scanner")} className={cn("px-3 py-1 rounded-lg text-xs font-medium", conteoMode === "scanner" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Escáner</button>
                </div>
                <button onClick={() => setShowConteoModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
                  <XIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {conteoMode === "wizard" && <ConteoFisicoWizard />}
              {conteoMode === "manual" && <PhysicalCountTab />}
              {conteoMode === "scanner" && <QuickStockCounter />}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Declaración de Inventario ── */}
      {showDeclaracionModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => e.target === e.currentTarget && setShowDeclaracionModal(false)}>
          <div className="bg-[var(--surface-raised)] w-full sm:max-w-5xl sm:rounded-xl rounded-t-2xl overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] sticky top-0 bg-[var(--surface-raised)] z-10">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Declaración de Inventario</CardTitle>
              <button onClick={() => setShowDeclaracionModal(false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
                <XIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <DeclaracionInventarioModule />
            </div>
          </div>
        </div>
      )}

      {/* ── Demand Forecast Modal ── */}
      {forecastProductId !== null && (
        <div className="modal-backdrop p-4">
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <DemandForecast
              productId={forecastProductId}
              onClose={() => setForecastProductId(null)}
            />
          </div>
        </div>
      )}

      {/* ── Barcode Scanner overlay ── */}
      {showBarcode && (
        <BarcodeScanner
          onScan={(code: string) => {
            setShowBarcode(false);
            if (process.env.NODE_ENV === "development") console.log("[BarcodeScanner] scanned:", code);
          }}
          onClose={() => setShowBarcode(false)}
        />
      )}

      {/* ── Mejora 7: Price Labels Modal ── */}
      {showPriceLabels && (
        <div className="modal-backdrop p-4" onClick={() => setShowPriceLabels(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <CardTitle className="font-bold text-[var(--text-primary)] text-sm">Imprimir Etiquetas de Precio</CardTitle>
              <button onClick={() => setShowPriceLabels(false)} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
                <span className="text-[var(--text-tertiary)] text-lg">&times;</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {labelLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => {
                        if (selectedLabelIds.size === labelProducts.length) setSelectedLabelIds(new Set());
                        else setSelectedLabelIds(new Set(labelProducts.map(p => p.id)));
                      }}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      {selectedLabelIds.size === labelProducts.length ? "Deseleccionar todos" : "Seleccionar todos"}
                    </button>
                    <span className="text-xs text-[var(--text-tertiary)]">{selectedLabelIds.size} seleccionados</span>
                  </div>
                  {labelProducts.map(p => (
                    <label key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--surface-alt)] cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedLabelIds.has(p.id)}
                        onChange={() => toggleLabelId(p.id)}
                        className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                      />
                      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">{p.name}</span>
                      <span className="text-sm font-bold text-[var(--color-primary)]" style={{ color: "var(--color-primary)" }}>S/{Number(p.price).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)]">
              <button onClick={handlePrintLabels} disabled={selectedLabelIds.size === 0} className="w-full py-2.5 rounded-lg text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--color-primary)]" style={{ backgroundColor: "var(--color-primary)" }}>
                Generar etiquetas ({selectedLabelIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
