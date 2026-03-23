"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const CRMTab = dynamic(() => import("@/components/admin/CRMTab"), { loading: S });
const DeliveryRoutesTab = dynamic(() => import("@/components/admin/DeliveryRoutesTab"), { loading: S });
const NPSTab = dynamic(() => import("@/components/admin/NPSTab"), { loading: S });
const LoyaltyTab = dynamic(() => import("@/components/admin/LoyaltyTab"), { loading: S });
const ChurnPrediction = dynamic(() => import("@/components/admin/ChurnPrediction"), { loading: S });
const AutoSegments = dynamic(() => import("@/components/admin/AutoSegments"), { loading: S });
const CustomerHeatmap = dynamic(() => import("@/components/admin/CustomerHeatmap"), { loading: S });
const CustomerImporter = dynamic(() => import("@/components/admin/CustomerImporter"), { loading: S });
const MassMessageSender = dynamic(() => import("@/components/admin/MassMessageSender"), { loading: S });

const TABS = [
  { id: "crm" as const, label: "Mis clientes" },
  { id: "delivery" as const, label: "Delivery" },
  { id: "resenas" as const, label: "Opiniones" },
  { id: "fidelizacion" as const, label: "Clientes frecuentes" },
  { id: "segmentos" as const, label: "Segmentos" },
  { id: "riesgo" as const, label: "En riesgo" },
  { id: "mapa" as const, label: "Mapa clientes" },
  { id: "importar" as const, label: "Importar" },
  { id: "mensajes" as const, label: "Mensajes masivos" },
];

export default function CRMClientesModule() {
  const [sub, setSub] = useState(TABS[0].id);
  const [bannerVisible, setBannerVisible] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("banner-clientes");
    if (stored === "hidden") setBannerVisible(false);
  }, []);
  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-clientes", next ? "visible" : "hidden");
  };
  return (
    <div className="space-y-3 sm:space-y-6">
      {bannerVisible && (
        <button onClick={toggleBanner} className="w-full text-left bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#2d6a4f]/10">
          <p className="text-sm text-[#2d6a4f] dark:text-emerald-400">
            <span className="font-semibold">Clientes</span> — Aquí ves quiénes son tus clientes, sus pedidos de delivery, opiniones y puntos de fidelidad.
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
      {sub === "crm" && <CRMTab />}
      {sub === "delivery" && <DeliveryRoutesTab />}
      {sub === "resenas" && <NPSTab />}
      {sub === "fidelizacion" && <LoyaltyTab />}
      {sub === "segmentos" && <AutoSegments />}
      {sub === "riesgo" && <ChurnPrediction />}
      {sub === "mapa" && <CustomerHeatmap />}
      {sub === "importar" && <CustomerImporter />}
      {sub === "mensajes" && <MassMessageSender />}
    </div>
  );
}
