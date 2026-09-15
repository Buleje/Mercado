"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatCard } from "@buleje/design-system";
import {
  Clock,
  AlertTriangle,
  TrendingDown,
  UserPlus,
  Activity,
  ArrowRight,
  Megaphone,
} from "@buleje/design-system/icons";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";

/**
 * Franja de comando del dashboard superadmin (ADR-133 epic → command center).
 * KPIs ACCIONABLES: cada card es un atajo a la vista filtrada que resuelve el
 * problema. Trials por vencer / en riesgo / churn / altas. Datos:
 *  - /api/superadmin/dashboard/command-center → trials + altas
 *  - /api/superadmin/churn (summary) → riesgo + churn (mismo cálculo que /tenants)
 */

type CC = {
  trialsExpiring: { in3d: number; in7d: number };
  newSignups7d: number;
  planDist: Record<string, number>;
};
type ChurnStats = { byRiskLevel: { low: number; medium: number; high: number; critical: number }; churnRateEstimated: number };
// El endpoint usa `stats` en la ruta con datos y `summary` en las ramas vacías
// (inconsistencia histórica) → leemos ambas.
type ChurnResponse = { stats?: ChurnStats; summary?: ChurnStats };

export function CommandCenterStrip() {
  const [cc, setCc] = useState<CC | null>(null);
  const [churn, setChurn] = useState<ChurnStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetchSuperadmin("/api/superadmin/dashboard/command-center"),
          fetchSuperadmin("/api/superadmin/churn?limit=1"),
        ]);
        if (!alive) return;
        if (r1.ok) setCc((await r1.json()) as CC);
        if (r2.ok) {
          const cr = (await r2.json()) as ChurnResponse;
          setChurn(cr.stats ?? cr.summary ?? null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const atRisk = (churn?.byRiskLevel.high ?? 0) + (churn?.byRiskLevel.critical ?? 0);
  const critical = churn?.byRiskLevel.critical ?? 0;
  const in7d = cc?.trialsExpiring.in7d ?? 0;
  const in3d = cc?.trialsExpiring.in3d ?? 0;

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      href: "/superadmin/tenants?qf=trial-expiring",
      label: "Trials por vencer (7d)",
      value: in7d,
      subValue: in3d > 0 ? `${in3d} en ≤3 días — urgente` : "ninguno en ≤3 días",
      emphasis: (in3d > 0 ? "error" : in7d > 0 ? "warning" : "neutral") as "error" | "warning" | "neutral",
      icon: Clock,
    },
    {
      href: "/superadmin/tenants?qf=at-risk",
      label: "Negocios en riesgo",
      value: atRisk,
      subValue: critical > 0 ? `${critical} críticos` : "sin críticos",
      emphasis: (critical > 0 ? "error" : atRisk > 0 ? "warning" : "success") as "error" | "warning" | "success",
      icon: AlertTriangle,
    },
    {
      href: "/superadmin/churn",
      label: "Churn estimado",
      value: `${churn?.churnRateEstimated ?? 0}%`,
      subValue: "high + critical / total",
      emphasis: ((churn?.churnRateEstimated ?? 0) >= 20 ? "error" : (churn?.churnRateEstimated ?? 0) >= 10 ? "warning" : "success") as "error" | "warning" | "success",
      icon: TrendingDown,
    },
    {
      href: "/superadmin/tenants?sort=createdAt",
      label: "Altas (7 días)",
      value: cc?.newSignups7d ?? 0,
      subValue: "nuevos negocios",
      emphasis: "success" as const,
      icon: UserPlus,
    },
  ];

  return (
    <section aria-label="Centro de comando" className="mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-[var(--ls-wider)]">Acción requerida</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/superadmin/chat"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-9 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-strong)] transition-colors"
          >
            <Megaphone className="h-4 w-4" /> Chat masivo
          </Link>
          <Link
            href="/superadmin/churn"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-9 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--rule-strong)] transition-colors"
          >
            <Activity className="h-4 w-4" /> Anti-churn
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            <div className="relative transition-transform group-hover:-translate-y-0.5">
              <StatCard label={c.label} value={c.value} subValue={c.subValue} emphasis={c.emphasis} icon={c.icon} density="compact" />
              <ArrowRight className="absolute bottom-3 right-3 h-4 w-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
