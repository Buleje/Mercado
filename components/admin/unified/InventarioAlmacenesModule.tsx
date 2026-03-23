"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const InventoryTab = dynamic(() => import("@/components/admin/InventoryTab"), { loading: S });
const KardexTab = dynamic(() => import("@/components/admin/KardexTab"), { loading: S });
const BatchesTab = dynamic(() => import("@/components/admin/BatchesTab"), { loading: S });
const ShrinkageTab = dynamic(() => import("@/components/admin/ShrinkageTab"), { loading: S });
const AutoReorderTab = dynamic(() => import("@/components/admin/AutoReorderTab"), { loading: S });
const PhysicalCountTab = dynamic(() => import("@/components/admin/PhysicalCountTab"), { loading: S });
const QuickStockCounter = dynamic(() => import("@/components/admin/QuickStockCounter"), { loading: S });
const StaleProductAlert = dynamic(() => import("@/components/admin/StaleProductAlert"), { loading: S });
const WarehouseLayoutEditor = dynamic(() => import("@/components/admin/WarehouseLayoutEditor"), { loading: S });
const StockPredictionWidget = dynamic(() => import("@/components/admin/StockPredictionWidget"), { loading: S });
const SeasonalityInsights = dynamic(() => import("@/components/admin/SeasonalityInsights"), { loading: S });

const TABS = [
  { id: "stock" as const, label: "Existencias" },
  { id: "kardex" as const, label: "Movimientos" },
  { id: "lotes" as const, label: "Vencimientos" },
  { id: "mermas" as const, label: "Pérdidas" },
  { id: "alertas-stock" as const, label: "Alertas de existencias" },
  { id: "conteo" as const, label: "Conteo físico" },
  { id: "conteo-rapido" as const, label: "Escáner rápido" },
  { id: "sin-movimiento" as const, label: "Sin movimiento" },
  { id: "prediccion" as const, label: "Predicción stock" },
  { id: "almacen" as const, label: "Mapa almacén" },
  { id: "temporada" as const, label: "Temporada" },
];

export default function InventarioAlmacenesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [bannerVisible, setBannerVisible] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("banner-inventario");
    if (stored === "hidden") setBannerVisible(false);
  }, []);
  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-inventario", next ? "visible" : "hidden");
  };
  return (
    <div className="space-y-3 sm:space-y-6">
      {bannerVisible && (
        <button onClick={toggleBanner} className="w-full text-left bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#2d6a4f]/10">
          <p className="text-sm text-[#2d6a4f] dark:text-emerald-400">
            <span className="font-semibold">Inventario</span> — Aquí ves cuánto tienes de cada producto, qué entró, qué salió y qué se perdió.
          </p>
        </button>
      )}
      {!bannerVisible && (
        <button onClick={toggleBanner} className="text-xs text-gray-400 hover:text-[#2d6a4f] transition-colors">
          Mostrar descripción
        </button>
      )}
      <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none border-b border-gray-200 dark:border-card-border -mx-1 px-1">
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
      {sub === "stock" && <InventoryTab />}
      {sub === "kardex" && <KardexTab />}
      {sub === "lotes" && <BatchesTab />}
      {sub === "mermas" && <ShrinkageTab />}
      {sub === "alertas-stock" && <AutoReorderTab />}
      {sub === "conteo" && <PhysicalCountTab />}
      {sub === "conteo-rapido" && <QuickStockCounter />}
      {sub === "sin-movimiento" && <StaleProductAlert />}
      {sub === "prediccion" && <StockPredictionWidget />}
      {sub === "almacen" && <WarehouseLayoutEditor />}
      {sub === "temporada" && <SeasonalityInsights />}
    </div>
  );
}
