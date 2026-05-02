"use client";

import Link from "next/link";
import { ChartWrapper, BadgeStatus } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { fmtSoles, type TopStore } from "@/lib/mocks/superadmin-dashboard.mock";

interface Props {
  stores: TopStore[];
}

const PLAN_VARIANT: Record<TopStore["plan"], "success" | "info" | "neutral" | "pending"> = {
  enterprise: "success",
  business: "info",
  pro: "pending",
  free: "neutral",
};

/**
 * Top 5 tiendas por GMV. Render lista compacta con bar proportion inline.
 *
 * MOCK: lista estática TOP_STORES_MOCK. Reemplazar con
 * /api/superadmin/dashboard/top-stores?by=gmv&limit=5.
 */
export function TopStoresList({ stores }: Props) {
  const maxGmv = stores.reduce((max, s) => Math.max(max, s.gmv), 0) || 1;

  return (
    <ChartWrapper
      title="Top 5 tiendas por GMV"
      description="Este mes"
      actions={
        <Link
          href="/superadmin/tenants"
          className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      <ul className="space-y-4">
        {stores.map((store, i) => {
          const pct = (store.gmv / maxGmv) * 100;
          return (
            <li key={store.id}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-[length:var(--ts-sm)] text-[var(--text-secondary)] tabular-nums font-extrabold w-6 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[length:var(--ts-base)] font-bold text-[var(--text-primary)] truncate">
                    {store.name}
                  </span>
                  <BadgeStatus
                    size="sm"
                    variant={PLAN_VARIANT[store.plan]}
                    label={store.plan}
                  />
                </div>
                <span className="text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">
                  {fmtSoles(store.gmv)}
                </span>
              </div>
              <div className="flex items-center gap-3 pl-8">
                <div
                  className="h-2.5 flex-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background:
                        "linear-gradient(90deg, var(--brand-primary, #00B4A6) 0%, #34d4be 100%)",
                    }}
                  />
                </div>
                <span className="text-[length:var(--ts-sm)] shrink-0 tabular-nums font-semibold text-[var(--text-tertiary)]">
                  {store.orders} pedidos
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </ChartWrapper>
  );
}
