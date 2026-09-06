"use client";

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { Sparkles } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { logger } from "@/lib/logger";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// Movido desde FinanzasModule (consolidación analytics 2026-06-16): la pestaña
// "Inteligencia" era BI operacional (negocio/clientes/productos), no financiera,
// así que vive en el hub de Análisis junto a Analytics Pro y Predicción.
const ComparativeReportsTab   = dynamic(() => import("@/components/admin/ComparativeReportsTab"),   { ssr: false, loading: () => <S /> });
const BusinessIntelligenceTab = dynamic(() => import("@/components/admin/BusinessIntelligenceTab"), { loading: () => <S /> });
const CustomKPITab            = dynamic(() => import("@/components/admin/CustomKPITab"),            { loading: () => <S /> });
const CompetitorPriceTracker  = dynamic(() => import("@/components/admin/CompetitorPriceTracker"),  { loading: () => <S /> });

// ── IntelligenceKPIStrip — quick KPIs (self-contained, fetch propio) ─────────
function IntelligenceKPIStrip() {
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetch("/api/analytics/kpis-v2", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setKpis({
          margen: d.margenPromedio ?? d.margin ?? 0,
          ventasMes: d.ventasMes ?? d.salesMonth ?? 0,
          ticketPromedio: d.ticketPromedio ?? d.avgTicket ?? 0,
          productos: d.productosActivos ?? d.activeProducts ?? 0,
        });
      })
      .catch((err) => logger.warn("[InteligenciaTab] fetch failed (non-critical)", { err: String(err).slice(0, 120) }));
  }, []);

  if (!kpis) return null;

  const cards = [
    { label: "Margen", value: `${Number(kpis.margen).toFixed(1)}%`, color: "text-primary" },
    { label: "Ventas/mes", value: formatCurrency(kpis.ventasMes, { decimals: 0 }), color: "text-primary" },
    { label: "Ticket prom.", value: formatCurrency(kpis.ticketPromedio, { decimals: 0 }), color: "text-secondary" },
    { label: "Productos", value: String(kpis.productos), color: "text-[var(--text-primary)]" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3  text-center">
          <p className="text-xs text-[var(--text-secondary)] font-semibold">{c.label}</p>
          <p className={cn("text-lg font-extrabold mt-0.5", c.color)}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function InteligenciaTab() {
  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Análisis · Inteligencia"
        title="Inteligencia de Negocio"
        description="Análisis comparativo, KPIs personalizados y precios del mercado."
        icon={Sparkles}
      />
      <Suspense fallback={<S />}>
        <div className="space-y-6">
          <ComparativeReportsTab />
          <IntelligenceKPIStrip />
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 ">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Análisis de Negocio</CardTitle>
            <BusinessIntelligenceTab />
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 ">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">KPIs Personalizados</CardTitle>
            <CustomKPITab />
          </div>
          <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-5 ">
            <CardTitle className="text-sm font-bold text-[var(--text-primary)] mb-3">Precios del Mercado</CardTitle>
            <CompetitorPriceTracker />
          </div>
        </div>
      </Suspense>
    </div>
  );
}
