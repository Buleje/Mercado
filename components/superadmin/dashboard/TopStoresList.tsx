"use client";

import Link from "next/link";
import { ChartWrapper, BadgeStatus, Caption } from "@buleje/design-system";
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
          className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Ver todas
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      <ul className="space-y-4">
        {stores.map((store, i) => {
          const pct = (store.gmv / maxGmv) * 100;
          return (
            <li key={store.id}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] tabular-nums font-semibold w-5 shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] truncate">
                    {store.name}
                  </span>
                  <BadgeStatus
                    size="sm"
                    variant={PLAN_VARIANT[store.plan]}
                    label={store.plan}
                  />
                </div>
                <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)] shrink-0">
                  {fmtSoles(store.gmv)}
                </span>
              </div>
              <div className="flex items-center gap-3 pl-7">
                <div
                  className="h-1.5 flex-1 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-[var(--text-primary)] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <Caption className="shrink-0 tabular-nums">
                  {store.orders} pedidos
                </Caption>
              </div>
            </li>
          );
        })}
      </ul>
    </ChartWrapper>
  );
}
