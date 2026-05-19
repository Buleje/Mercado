"use client";

import {
  Building2, Loader2, ExternalLink, XCircle, CheckCircle2,
  Users, Eraser,
} from "@buleje/design-system/icons";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { PlanBadge, StatusBadge } from "@/components/superadmin/_shared";
import { MiniUsageBar } from "./MiniUsageBar";
import { PlanSelect } from "./PlanSelect";
import type { SortField, SortDir } from "./types";

interface TenantTableProps {
  tenants: TenantRow[];
  loading: boolean;
  actionLoading: string | null;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onDetail: (t: TenantRow) => void;
  onToggleActive: (slug: string, active: boolean) => void;
  onImpersonate: (slug: string) => void;
  onInvite: (slug: string, name: string) => void;
  onPurge: (slug: string, name: string) => void;
  onDelete: (slug: string, name: string) => void;
  onPlanChange: (slug: string, plan: PlanId) => void;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  return (
    <span className="text-gray-300 dark:text-gray-600 ml-1">
      {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );
}

export function TenantTable({
  tenants,
  loading,
  actionLoading,
  sortField,
  sortDir,
  onSort,
  onDetail,
  onToggleActive,
  onImpersonate,
  onInvite,
  onPurge,
  onDelete,
  onPlanChange,
}: TenantTableProps) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando tenants…
        </div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          No hay tenants
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)] text-gray-400 text-xs uppercase tracking-wider bg-[var(--surface-canvas)]/60">
                <th className="text-left px-5 py-3 cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none" onClick={() => onSort("name")}>
                  Tienda <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-left px-4 py-3 cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none" onClick={() => onSort("plan")}>
                  Plan <SortIcon field="plan" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Uso</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none" onClick={() => onSort("ordersThisMonth")}>
                  Pedidos/mes <SortIcon field="ordersThisMonth" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-left px-4 py-3 hidden lg:table-cell cursor-pointer hover:text-gray-600 dark:hover:text-gray-200 select-none" onClick={() => onSort("createdAt")}>
                  Creado <SortIcon field="createdAt" sortField={sortField} sortDir={sortDir} />
                </th>
                <th className="text-center px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-teal-50 dark:hover:bg-teal-950/10 transition-colors">
                  {/* Name + slug */}
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => onDetail(tenant)}
                      className="text-left hover:text-[var(--accent-dark)] dark:hover:text-teal-400 transition-colors"
                    >
                      <div className="font-semibold text-[var(--text-primary)]">{tenant.name}</div>
                      <div className="text-xs font-mono text-gray-400 mt-0.5">{tenant.slug}</div>
                      {tenant.ownerEmail && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-48">{tenant.ownerEmail}</div>
                      )}
                    </button>
                  </td>

                  {/* Plan (editable) */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <PlanBadge plan={tenant.plan} />
                      <PlanSelect
                        slug={tenant.slug}
                        current={tenant.plan}
                        onChanged={(p) => onPlanChange(tenant.slug, p)}
                      />
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge active={tenant.active} />
                    {tenant.cancelAtPeriodEnd && (
                      <div className="text-[length:var(--ts-xs)] text-[var(--data-warning-500)] mt-1">Cancela pronto</div>
                    )}
                    {tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date() && (
                      <div className="text-[length:var(--ts-xs)] text-[var(--data-success-500)] mt-1">
                        Trial hasta {fmtDate(tenant.trialEndsAt)}
                      </div>
                    )}
                  </td>

                  {/* Usage bars */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    {tenant.usage && tenant.limits ? (
                      <div className="space-y-1">
                        <MiniUsageBar used={tenant.usage.products} max={tenant.limits.maxProducts} label="Prod." />
                        <MiniUsageBar used={tenant.usage.users} max={tenant.limits.maxUsers} label="Users" />
                      </div>
                    ) : (
                      <span className="text-gray-300 dark:text-gray-700">—</span>
                    )}
                  </td>

                  {/* Orders this month */}
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {tenant.usage?.ordersThisMonth ?? 0}
                    </span>
                    {tenant.limits && tenant.limits.maxOrdersPerMonth !== -1 && (
                      <span className="text-xs text-gray-400 ml-1">/ {tenant.limits.maxOrdersPerMonth}</span>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell whitespace-nowrap">
                    {fmtDate(tenant.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* Toggle active */}
                      <button
                        type="button"
                        disabled={actionLoading === `${tenant.slug}-active`}
                        onClick={() => onToggleActive(tenant.slug, tenant.active)}
                        title={tenant.active ? "Suspender tienda" : "Activar tienda"}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                          tenant.active
                            ? "text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30"
                            : "text-[var(--data-success-500)] hover:bg-[var(--data-success-50)] dark:hover:bg-green-950/30"
                        }`}
                      >
                        {actionLoading === `${tenant.slug}-active` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : tenant.active ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </button>

                      {/* Impersonate */}
                      <button
                        type="button"
                        onClick={() => onImpersonate(tenant.slug)}
                        title="Acceder como admin"
                        className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>

                      {/* Invite user */}
                      <button
                        type="button"
                        onClick={() => onInvite(tenant.slug, tenant.name)}
                        title="Invitar usuario"
                        className="p-1.5 rounded-lg text-[var(--data-success-500)] hover:bg-[var(--data-success-50)] dark:hover:bg-emerald-950/30 transition-colors"
                      >
                        <Users className="w-4 h-4" />
                      </button>

                      {/* Purge data */}
                      <button
                        type="button"
                        disabled={actionLoading === `${tenant.slug}-purge`}
                        onClick={() => onPurge(tenant.slug, tenant.name)}
                        title="Limpiar datos de esta tienda"
                        className="p-1.5 rounded-lg text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/30 transition-colors disabled:opacity-40"
                      >
                        {actionLoading === `${tenant.slug}-purge` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Eraser className="w-4 h-4" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        disabled={actionLoading === `${tenant.slug}-delete` || tenant.slug === "main"}
                        onClick={() => onDelete(tenant.slug, tenant.name)}
                        title={tenant.slug === "main" ? "No se puede eliminar la tienda principal" : "Eliminar tienda"}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                      >
                        {actionLoading === `${tenant.slug}-delete` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
