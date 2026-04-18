"use client";

import {
  ExternalLink, Mail, XCircle, CheckCircle2, Loader2,
  ArrowDownRight, ArrowUpRight,
  Package, Users, Store, ShoppingBag,
  BarChart3, Trash2, Eraser, LogIn,
} from "lucide-react";
import type { TenantRow } from "@/lib/superadmin-types";
import { ProductBadge, StatCard, WarningAlert, SuccessAlert } from "@buleje/design-system";

interface TenantCardProps {
  tenant: TenantRow;
  onDetail: (t: TenantRow) => void;
  onInvite: (slug: string, name: string) => void;
  onToggleActive: (slug: string, active: boolean) => void;
  actionLoading: string | null;
  onImpersonate: (slug: string) => void;
  onToggleMarketplace: (tenant: TenantRow) => void;
  onLoginAs: (tenant: TenantRow) => void;
  onDelete: (slug: string, name: string) => void;
  onPurge: (slug: string, name: string) => void;
  onViewProducts?: (tenant: TenantRow) => void;
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

/** Computes a health score for the tenant. */
function computeHealth(t: TenantRow): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if ((t.usage?.products ?? 0) === 0) issues.push("Sin productos");
  if ((t._count.AdminUser ?? 0) === 0) issues.push("Sin usuarios admin");
  if (!t.active) issues.push("Tienda inactiva");
  if ((t.stores?.length ?? 0) === 0) issues.push("Sin tienda en marketplace");
  return { ok: issues.length === 0, issues };
}

export function TenantCard({
  tenant,
  onDetail,
  onInvite,
  onToggleActive,
  actionLoading,
  onImpersonate,
  onToggleMarketplace,
  onLoginAs,
  onDelete,
  onPurge,
  onViewProducts,
}: TenantCardProps) {
  const t = tenant;
  const initials = t.name.slice(0, 2).toUpperCase();
  const health = computeHealth(t);

  const pctFn = (u: number, m: number) => (m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100)));
  const totalUsagePct =
    t.usage && t.limits
      ? Math.round(
          (pctFn(t.usage.products, t.limits.maxProducts) +
            pctFn(t.usage.users, t.limits.maxUsers) +
            pctFn(t.usage.ordersThisMonth, t.limits.maxOrdersPerMonth)) /
            3
        )
      : 0;

  const fmtMoney = (n: number) => `S/${n.toFixed(0)}`;
  const storeInfo = t.stores?.[0];
  const isOnMarketplace = storeInfo?.isPublished === true;
  const hasStore = (t.stores?.length ?? 0) > 0;
  const revenue = t.monthRevenue ?? 0;
  const expenses = t.monthExpenses ?? 0;
  const profit = t.monthProfit ?? 0;
  const hasVisibleAdminData =
    (t.usage?.products ?? 0) > 0 ||
    (t.monthOrders ?? 0) > 0 ||
    revenue > 0 ||
    (storeInfo?._count.products ?? 0) > 0;
  const planLabel = PLAN_LABEL[t.plan] ?? t.plan;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl shadow-[var(--shadow-sm)] hover:border-[var(--rule-strong)] transition-colors overflow-hidden">
      <div className="p-5 space-y-4">
        {/* Kicker: plan label + status pill, sin gradient */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-semibold">
            Plan {planLabel}
          </span>
          <div className="flex items-center gap-1.5">
            {t.plan === "enterprise" ? (
              <ProductBadge intent="premium">Enterprise</ProductBadge>
            ) : null}
            {isOnMarketplace && (
              <ProductBadge intent="fresh">
                <ShoppingBag className="w-2.5 h-2.5 mr-1 inline" />Marketplace
              </ProductBadge>
            )}
            {!health.ok && (
              <ProductBadge intent="offer">
                {health.issues.length} problema{health.issues.length !== 1 ? "s" : ""}
              </ProductBadge>
            )}
          </div>
        </div>

        {/* Avatar + Name + Status */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-primary)] font-bold text-base shrink-0 border border-[var(--rule-base)]">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-bold text-[var(--text-primary)] text-base truncate">{t.name}</div>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${t.active ? "bg-[var(--data-success)]" : "bg-[var(--text-tertiary)]"}`}
                title={t.active ? "Activo" : "Suspendido"}
              />
            </div>
            <div className="text-[var(--text-tertiary)] text-xs font-mono">{t.slug}</div>
            {t.ownerEmail && (
              <div className="text-[var(--text-tertiary)] text-[length:var(--ts-2xs)] truncate mt-0.5">
                {t.ownerEmail}
              </div>
            )}
          </div>
        </div>

        {/* Financial KPIs — uniformes via StatCard density=compact, sin icon
            para no comprimir el label en grid 4-col estrecho. */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard density="compact" label="Ventas" value={fmtMoney(revenue)} />
          <StatCard density="compact" label="Gastos" value={fmtMoney(expenses)} />
          <StatCard density="compact" label="Ganancia" value={fmtMoney(profit)} />
          <StatCard density="compact" label="Pedidos" value={String(t.monthOrders ?? 0)} />
        </div>

        {/* Resources — chips neutros uniformes */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: t.usage?.products ?? 0, lbl: "Productos", icon: Package, max: t.limits?.maxProducts ?? -1, clickable: true },
            { val: t._count.AdminUser, lbl: "Usuarios", icon: Users, max: t.limits?.maxUsers ?? -1, clickable: false },
            { val: storeInfo?._count.products ?? 0, lbl: "En Marketplace", icon: Store, max: -1, clickable: false },
          ].map(({ val, lbl, icon: Icon, max, clickable }) => {
            const usagePct = max === -1 ? 0 : Math.min(100, Math.round((val / max) * 100));
            const isEmpty = val === 0 && lbl !== "Usuarios";
            const canClick = clickable && Boolean(onViewProducts);
            return (
              <div
                key={lbl}
                onClick={canClick ? () => onViewProducts?.(t) : undefined}
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                className={`rounded-lg p-2.5 text-center bg-[var(--surface-sunken)] border border-[var(--rule-soft)] ${
                  canClick
                    ? "cursor-pointer hover:border-[var(--rule-strong)] transition-colors"
                    : ""
                }`}
              >
                <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-[var(--text-secondary)]" />
                <div className={`text-base font-bold ${isEmpty ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                  {val}
                </div>
                <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {canClick ? (isEmpty ? "Sin datos ▸" : `${lbl} ▸`) : isEmpty ? "Sin datos" : lbl}
                </div>
                {max !== -1 && !isEmpty && (
                  <div className="h-1 bg-[var(--rule-soft)] rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usagePct}%`,
                        background:
                          usagePct >= 100
                            ? "var(--data-error)"
                            : usagePct >= 80
                              ? "var(--data-warning)"
                              : "var(--accent)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panel data status — DS Alert */}
        {hasVisibleAdminData ? (
          <SuccessAlert
            title="Panel con información"
            description="Esta tienda ya muestra datos en su admin del negocio."
          />
        ) : (
          <WarningAlert
            title="Panel sin información útil"
            description="Faltan productos o movimientos; revisar la carga inicial de la tienda."
          />
        )}

        {/* Plan usage bar */}
        {t.usage && t.limits && (
          <div className="space-y-1">
            <div className="flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <span>Uso del plan</span>
              <span
                className={
                  totalUsagePct >= 100
                    ? "text-[var(--data-error)]"
                    : totalUsagePct >= 80
                      ? "text-[var(--data-warning)]"
                      : "text-[var(--text-secondary)]"
                }
              >
                {totalUsagePct}%
              </span>
            </div>
            <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${totalUsagePct}%`,
                  background:
                    totalUsagePct >= 100
                      ? "var(--data-error)"
                      : totalUsagePct >= 80
                        ? "var(--data-warning)"
                        : "var(--accent)",
                }}
              />
            </div>
          </div>
        )}

        {/* Row 1: Tienda + Panel Admin */}
        <div className="flex gap-2 pt-1 border-t border-[var(--rule-base)]">
          <a
            href={`/tienda`}
            onClick={(e) => { e.preventDefault(); window.open(`/t/${t.slug}/tienda`, "_blank"); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            <Store className="w-3.5 h-3.5" /> Ir a Tienda
          </a>
          <button
            type="button"
            onClick={() => onImpersonate(t.slug)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] hover:bg-[var(--accent-600)] text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Panel Admin
          </button>
        </div>

        {/* Row 2: Marketplace + Login — outline neutros */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleMarketplace(t)}
            disabled={actionLoading === `${t.slug}-marketplace`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--rule-base)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === `${t.slug}-marketplace` ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isOnMarketplace ? (
              <><ArrowDownRight className="w-3.5 h-3.5" /> Dar de baja</>
            ) : hasStore ? (
              <><ArrowUpRight className="w-3.5 h-3.5" /> Subir a Marketplace</>
            ) : (
              <><ShoppingBag className="w-3.5 h-3.5" /> Sin tienda</>
            )}
          </button>
          <button
            type="button"
            onClick={() => onLoginAs(t)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--rule-base)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
          </button>
        </div>

        {/* Row 3: Invite + Suspend + Purge + Delete + Detail — neutros */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onInvite(t.slug, t.name)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Mail className="w-3.5 h-3.5" /> Invitar
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(t.slug, t.active)}
            disabled={actionLoading === `${t.slug}-active`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            {actionLoading === `${t.slug}-active`
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : t.active
              ? <><XCircle className="w-3.5 h-3.5" /> Suspender</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> Activar</>
            }
          </button>
          <button
            type="button"
            onClick={() => onPurge(t.slug, t.name)}
            disabled={actionLoading === `${t.slug}-purge`}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            title="Limpiar datos de esta tienda (productos, pedidos, movimientos)"
          >
            {actionLoading === `${t.slug}-purge` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDelete(t.slug, t.name)}
            disabled={actionLoading === `${t.slug}-delete` || t.slug === "main"}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.slug === "main" ? "No se puede eliminar la tienda principal" : "Eliminar tienda"}
          >
            {actionLoading === `${t.slug}-delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDetail(t)}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
