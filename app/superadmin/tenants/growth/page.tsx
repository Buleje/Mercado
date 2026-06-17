"use client";

/**
 * /superadmin/tenants/growth — Crecimiento de tiendas (movido fuera de la tab
 * de /superadmin/tenants, Brandon 2026-06-14). Mismas funciones: ranking por
 * crecimiento (podio + sparklines + delta%) y la tabla detallada por tienda.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { TrendingUp, ArrowLeft } from "@buleje/design-system/icons";
import { AdminTabShell } from "../../_components/_shared";
import { SuperAdminModuleTabs, TENANTS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import type { GrowthEntry } from "@/components/superadmin/tenants/types";

const TenantGrowthTab = dynamic(
  () => import("@/components/superadmin/tenants/TenantGrowthTab").then((m) => ({ default: m.TenantGrowthTab })),
  { ssr: false, loading: () => <div className="h-64 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" /> },
);
const TenantsGrowthRanking = dynamic(
  () => import("@/components/superadmin/dashboard/TenantsGrowthRanking"),
  { ssr: false, loading: () => <div className="h-64 animate-pulse bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" /> },
);

export default function TenantsGrowthPage() {
  const [growthData, setGrowthData] = useState<GrowthEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchSuperadmin("/api/superadmin/tenants/growth");
      if (res.ok) {
        const json = (await res.json()) as { data: GrowthEntry[] };
        setGrowthData(json.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <SuperAdminModuleTabs tabs={TENANTS_TABS} />
    <AdminTabShell
      title="Crecimiento de tiendas"
      kicker="Plataforma · Tiendas"
      description="Ranking por crecimiento y evolución mensual de cada tienda (ingresos y pedidos)."
      icon={TrendingUp}
      actions={
        <Link
          href="/superadmin/tenants"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Tiendas
        </Link>
      }
    >
      <div className="space-y-6">
        <TenantsGrowthRanking />
        <TenantGrowthTab growthData={growthData} loading={loading} />
      </div>
    </AdminTabShell>
    </>
  );
}
