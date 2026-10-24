"use client";

import { useState, useEffect, useCallback } from "react";
import type { TenantRow } from "@/lib/superadmin-types";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

/** Carga la lista de tiendas (+ pendientes en vivo y riesgo) y el conteo de módulos a medida. */
export function useTenantsCarga() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moduleOverrideCounts, setModuleOverrideCounts] = useState<Record<string, number>>({});

  const loadTenants = useCallback(async () => {
    setLoading(true); setError("");
    try {
      // Pedidos cacheados (60s) en /tenants. Para que el badge de pendientes
      // se actualice en vivo, cruzamos con /pending-counts (no cacheado).
      // Churn/health por tenant (Brandon 2026-06-14): score + riesgo para la
      // columna Salud + filtro por riesgo. Reusa /api/superadmin/churn.
      const [tenantsRes, countsRes, churnRes] = await Promise.all([
        fetchSuperadmin("/api/superadmin/tenants"),
        fetchSuperadmin("/api/superadmin/tenants/pending-counts"),
        fetchSuperadmin("/api/superadmin/churn?limit=200"),
      ]);
      if (!tenantsRes.ok) { setError("Error al cargar tenants"); return; }
      const data = await tenantsRes.json() as { tenants: TenantRow[] };
      const counts: Record<string, number> = countsRes.ok
        ? ((await countsRes.json()) as { counts: Record<string, number> }).counts
        : {};
      // Mapa slug → riesgo (degrada silencioso si churn falla).
      const riskBySlug = new Map<string, TenantRow["risk"]>();
      if (churnRes.ok) {
        try {
          const cj = (await churnRes.json()) as {
            tenants: { slug: string; healthScore?: { score: number; riskLevel: string; trialDaysLeft: number | null; daysSinceLastLogin: number | null }; activeSignals?: unknown[] }[];
          };
          for (const c of cj.tenants ?? []) {
            if (!c.healthScore) continue;
            riskBySlug.set(c.slug, {
              score: c.healthScore.score,
              level: (c.healthScore.riskLevel as "low" | "medium" | "high" | "critical") ?? "low",
              trialDaysLeft: c.healthScore.trialDaysLeft,
              daysSinceLastLogin: c.healthScore.daysSinceLastLogin,
              signals: Array.isArray(c.activeSignals) ? c.activeSignals.length : 0,
            });
          }
        } catch { /* churn opcional */ }
      }
      // Aplicamos pendingOrders fresh + riesgo sobre el listado cacheado.
      const merged = data.tenants.map((t) => ({
        ...t,
        pendingOrders: (counts[t.id] ?? 0) + (counts[t.slug] ?? 0),
        risk: riskBySlug.get(t.slug) ?? null,
      }));
      setTenants(merged);
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  // Counts de módulos forzados por tenant — pinta la columna "Módulos" de la
  // vista lista (1 request bulk, no N por fila).
  const loadModuleOverrideCounts = useCallback(async () => {
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/module-overrides");
      if (!res.ok) return;
      const data = (await res.json()) as { counts: Record<string, number> };
      setModuleOverrideCounts(data.counts ?? {});
    } catch { /* silencioso — columna muestra "Plantilla" */ }
  }, []);
  useEffect(() => { void loadModuleOverrideCounts(); }, [loadModuleOverrideCounts]);

  return { tenants, setTenants, loading, error, loadTenants, moduleOverrideCounts, setModuleOverrideCounts };
}
