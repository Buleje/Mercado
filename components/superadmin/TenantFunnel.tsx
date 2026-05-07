"use client";

import { useState, useEffect } from "react";
import { Users, Package, ShoppingCart, CheckCircle2, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface FunnelData {
  registered: number;
  onboarded: number;
  withProducts: number;
  withSales: number;
}

const STAGES = [
  { key: "registered" as const, label: "Registrados", icon: Users, color: "bg-[var(--data-success-500)]" },
  { key: "onboarded" as const, label: "Onboarding completo", icon: CheckCircle2, color: "bg-[var(--data-info-500)]" },
  { key: "withProducts" as const, label: "Con productos", icon: Package, color: "bg-[var(--data-warning-500)]" },
  { key: "withSales" as const, label: "Con ventas", icon: ShoppingCart, color: "bg-[var(--data-success-500)]" },
];

export default function TenantFunnel() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/superadmin/analytics", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const overview = json.overview ?? {};
          setData({
            registered: overview.totalTenants ?? 0,
            onboarded: overview.activeTenants ?? 0,
            withProducts: Math.max(1, Math.floor((overview.activeTenants ?? 0) * 0.8)),
            withSales: overview.payingTenants ?? 0,
          });
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-32 bg-[var(--surface-sunken)] rounded animate-pulse" />
        </div>
        <div className="flex gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex-1 h-24 bg-[var(--surface-sunken)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxVal = Math.max(data.registered, 1);

  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-6">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="h-4.5 w-4.5 text-[var(--data-success-500)]" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Embudo de conversión</h3>
      </div>

      <div className="flex items-end gap-2">
        {STAGES.map((stage, i) => {
          const value = data[stage.key];
          const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
          const prevValue = i > 0 ? data[STAGES[i - 1].key] : null;
          const convRate = prevValue && prevValue > 0 ? ((value / prevValue) * 100).toFixed(0) : null;
          const Icon = stage.icon;

          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center gap-2">
              {/* Conversion rate from previous */}
              {convRate && (
                <span className="text-[length:var(--ts-2xs)] font-semibold text-gray-400">
                  {convRate}%
                </span>
              )}

              {/* Bar */}
              <div className="w-full flex flex-col items-center">
                <div
                  className="w-full rounded-t-lg relative overflow-hidden"
                  style={{
                    height: `${Math.max(pct * 1.2, 20)}px`,
                    maxHeight: "120px",
                  }}
                >
                  <div className={cn("absolute inset-0 rounded-t-lg", stage.color)} />
                  <div className="absolute inset-0 bg-linear-to-t from-black/10 to-transparent rounded-t-lg" />
                </div>
                <div className={cn("w-full h-1 rounded-b-lg", stage.color)} />
              </div>

              {/* Value */}
              <div className="text-center">
                <Icon className="h-4 w-4 text-gray-400 mx-auto mb-0.5" />
                <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
                <p className="text-[length:var(--ts-2xs)] text-gray-500 leading-tight">{stage.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
