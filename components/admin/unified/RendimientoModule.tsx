"use client";

/**
 * RendimientoModule — sub-tab "Rendimiento" del hub Sistema.
 *
 * Rework 2026-07-04: score 0-100 con gauge firma (PerfScoreHero) + historial
 * REAL por tenant (RUM de clientes vía /api/admin/perf-history) + salud del
 * sistema + soporte técnico (ficha del dispositivo, ex "Mi Navegador" +
 * "Almacenamiento" fusionados). El historial viejo en localStorage medía la
 * compu del admin con CLS/FID clavados en 0 — se retiró.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Gauge, HeartPulse, BarChart3, Wrench } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import PerfScoreHero from "@/components/admin/rendimiento/PerfScoreHero";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const SystemHealthTab = dynamic(() => import("@/components/admin/SystemHealthTab"), { loading: S });
const HistorialTab = dynamic(() => import("@/components/admin/rendimiento/HistorialTab"), { loading: S });
const SoporteTab = dynamic(() => import("@/components/admin/rendimiento/SoporteTab"), { ssr: false, loading: S });

const MODULE_ID = "rendimiento";

const TABS = [
  { id: "velocidad", label: "Velocidad", icon: Gauge },
  { id: "historial", label: "Historial real", icon: BarChart3 },
  { id: "salud", label: "Salud del Sistema", icon: HeartPulse },
  { id: "soporte", label: "Soporte técnico", icon: Wrench },
];

export default function RendimientoModule() {
  const [sub, setSub] = useState(TABS[0].id);

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        title="Rendimiento"
        description="Qué tan rápida se siente tu tienda — para vos y para tus clientes"
        icon={Gauge}
      />

      <AdminTabBar tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "velocidad" && <PerfScoreHero />}
        {sub === "historial" && <HistorialTab />}
        {sub === "salud" && <SystemHealthTab />}
        {sub === "soporte" && <SoporteTab />}
      </AdminTabBar>
    </div>
  );
}
