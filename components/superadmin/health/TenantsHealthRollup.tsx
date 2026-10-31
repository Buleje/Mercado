"use client";

/**
 * TenantsHealthRollup — resumen REAL de las tiendas (Brandon 2026-06-19): total,
 * activas, publicadas en el marketplace, pedidos de hoy y productos. Datos
 * medidos en /api/superadmin/health/metrics (counts de Prisma). Va arriba del
 * monitor de integridad por tienda.
 */

import { useCallback, useEffect, useState } from "react";
import { Store, CheckCircle2, Globe, ShoppingBag, Package } from "@buleje/design-system/icons";
import { SAKpiCard } from "@/components/superadmin/_shared/SAKpiCard";
import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";

type Rollup = { total: number; active: number; published: number; ordersToday: number; products: number };

export function TenantsHealthRollup() {
  const [t, setT] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/health/metrics", { credentials: "include", cache: "no-store" });
      if (res.ok) setT(((await res.json()).tenants ?? null) as Rollup | null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useVisiblePolling(() => void load(), 30_000);

  if (loading && !t) return <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] mb-4" />;
  if (!t) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      <SAKpiCard icon={Store} label="Tiendas" value={t.total} sub="total en la plataforma" />
      <SAKpiCard icon={CheckCircle2} label="Activas" value={t.active} sub={`${t.total - t.active} inactivas`} tone="good" />
      <SAKpiCard icon={Globe} label="Publicadas" value={t.published} sub="visibles en marketplace" />
      <SAKpiCard icon={ShoppingBag} label="Pedidos hoy" value={t.ordersToday} sub="todas las tiendas" tone={t.ordersToday > 0 ? "good" : "default"} />
      <SAKpiCard icon={Package} label="Productos" value={t.products.toLocaleString("es-PE")} sub="catálogo total" />
    </div>
  );
}
