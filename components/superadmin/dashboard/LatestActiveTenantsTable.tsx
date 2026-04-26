"use client";

import Link from "next/link";
import { ChartWrapper, DataTable, BadgeStatus } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import {
  fmtSoles,
  fmtRelativeTime,
  type LatestActiveTenant,
} from "@/lib/mocks/superadmin-dashboard.mock";

interface Props {
  tenants: LatestActiveTenant[];
}

const PLAN_VARIANT: Record<LatestActiveTenant["plan"], "success" | "info" | "pending" | "neutral"> = {
  enterprise: "success",
  business: "info",
  pro: "pending",
  free: "neutral",
};

/**
 * Tabla de últimas tiendas activas — ordenada por lastActiveAt desc.
 *
 * MOCK: LATEST_ACTIVE_TENANTS. Reemplazar con
 * /api/superadmin/dashboard/latest-active?limit=10.
 */
export function LatestActiveTenantsTable({ tenants }: Props) {
  return (
    <ChartWrapper
      title="Últimas tiendas activas"
      description="Ordenadas por actividad reciente"
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
      <DataTable>
        <thead>
          <tr>
            <th>Tienda</th>
            <th>Plan</th>
            <th className="text-right">Órdenes (mes)</th>
            <th className="text-right">Revenue (mes)</th>
            <th>Última actividad</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id}>
              <td>
                <Link
                  href={`/superadmin/tenants/${t.slug}`}
                  className="font-semibold text-[var(--text-primary)] hover:underline"
                >
                  {t.name}
                </Link>
              </td>
              <td>
                <BadgeStatus size="sm" variant={PLAN_VARIANT[t.plan]} label={t.plan} />
              </td>
              <td className="text-right tabular-nums">{t.ordersThisMonth}</td>
              <td className="text-right tabular-nums font-semibold">
                {fmtSoles(t.revenueThisMonth)}
              </td>
              <td className="text-[var(--text-tertiary)] tabular-nums">
                {fmtRelativeTime(t.lastActiveAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </ChartWrapper>
  );
}
