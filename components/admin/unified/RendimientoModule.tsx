"use client";

/**
 * RendimientoModule — lo que era la pestaña «Rendimiento»: velocidad, historial
 * real, salud del sistema y soporte técnico.
 *
 * Rework 2026-07-04: score 0-100 con gauge firma (PerfScoreHero) + historial
 * REAL por tenant (RUM de clientes vía /api/admin/perf-history) + salud del
 * sistema + soporte técnico (ficha del dispositivo, ex "Mi Navegador" +
 * "Almacenamiento" fusionados). El historial viejo en localStorage medía la
 * compu del admin con CLS/FID clavados en 0 — se retiró.
 *
 * Plan «panel unificado», ola 2 (2026-10-10): ya no dibuja su propia barra de
 * cuatro pestañas. Las cuatro son sub-vistas de Configuración › Sistema
 * (`?sub=velocidad|historial|salud|soporte`, components/admin/sistema/), que
 * es la que pone la barra; acá sólo queda el contenido de la elegida. Con la
 * barra propia eran tres niveles (Sistema › Rendimiento › Velocidad).
 */

import dynamic from "next/dynamic";
import PerfScoreHero from "@/components/admin/rendimiento/PerfScoreHero";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import type { VistaRendimiento } from "@/components/admin/sistema/subvistas-sistema";

const SystemHealthTab = dynamic(() => import("@/components/admin/SystemHealthTab"), { loading: S });
const HistorialTab = dynamic(() => import("@/components/admin/rendimiento/HistorialTab"), { loading: S });
const SoporteTab = dynamic(() => import("@/components/admin/rendimiento/SoporteTab"), { ssr: false, loading: S });

export default function RendimientoModule({ vista = "velocidad" }: { vista?: VistaRendimiento }) {
  return (
    <div className="space-y-4">
      {vista === "velocidad" && <PerfScoreHero />}
      {vista === "historial" && <HistorialTab />}
      {vista === "salud" && <SystemHealthTab />}
      {vista === "soporte" && <SoporteTab />}
    </div>
  );
}
