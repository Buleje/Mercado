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

import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import dynamic from "next/dynamic";
import { Gauge, HeartPulse, BarChart3, Wrench } from "@buleje/design-system/icons";
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
const TAB_IDS = TABS.map((t) => t.id);

export default function RendimientoModule() {
  // La sub-vista vive en `?sub=` (useSubvistaModulo): este módulo se muestra dentro de un hub
  // que ya usa `?vista=`. Link compartible y «atrás» del navegador (antes era estado local).
  const { vista: sub, irA: setSub } = useSubvistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0]);

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla. Recupera ~90px verticales,
          que en una laptop de 677px útiles es la diferencia entre ver los
          datos o sólo los encabezados.
          El `eyebrow` se fue con el header: decía la categoría del sidebar
          («Abastecimiento · Compras» sobre un título «Compras») — el mismo
          dato tres veces contando el ítem marcado en el sidebar. */}
      <AdminTabBar
        heading={{ title: "Rendimiento", description: "Qué tan rápida se siente tu tienda — para vos y para tus clientes", icon: Gauge }} tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "velocidad" && <PerfScoreHero />}
        {sub === "historial" && <HistorialTab />}
        {sub === "salud" && <SystemHealthTab />}
        {sub === "soporte" && <SoporteTab />}
      </AdminTabBar>
    </div>
  );
}
