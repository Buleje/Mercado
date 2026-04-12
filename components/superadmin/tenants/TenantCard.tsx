"use client";

import {
  ExternalLink, Mail, XCircle, CheckCircle2, Loader2,
  DollarSign, ArrowDownRight, ArrowUpRight, TrendingUp,
  ShoppingCart, Package, Users, Store, ShoppingBag,
  BarChart3, Trash2, Eraser, LogIn, AlertCircle,
} from "lucide-react";
import type { TenantRow, PlanId } from "@/lib/superadmin-types";
import { PlanBadge } from "@/components/superadmin/_shared";

const CARD_BG: Record<PlanId, string> = {
  free: "#6b7280",
  pro: "#00B4A6",
  business: "#7c3aed",
  enterprise: "#d97706",
};

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
  const planColor = CARD_BG[t.plan] ?? CARD_BG.free;
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

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:border-teal-300 dark:hover:border-teal-700 transition-all hover:shadow-md overflow-hidden">
      {/* Gradient strip */}
      <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${planColor}, ${planColor}88)` }} />

      <div className="p-5 space-y-4">
        {/* Avatar + Name + Status */}
        <div className="flex items-start gap-3">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${planColor}, ${planColor}99)` }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-bold text-gray-900 dark:text-white text-base truncate">{t.name}</div>
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.active ? "bg-green-500" : "bg-red-500"}`} />
            </div>
            <div className="text-gray-400 text-xs font-mono">{t.slug}</div>
            {t.ownerEmail && <div className="text-gray-400 text-[10px] truncate mt-0.5">{t.ownerEmail}</div>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <PlanBadge plan={t.plan} />
            {isOnMarketplace && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-[9px] font-semibold text-teal-700 dark:text-teal-300">
                <ShoppingBag className="w-2.5 h-2.5" /> Marketplace
              </span>
            )}
            {/* Health badge */}
            {health.ok ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-[9px] font-semibold text-green-700 dark:text-green-300" title="Tienda configurada correctamente">
                <CheckCircle2 className="w-2.5 h-2.5" /> OK
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-[9px] font-semibold text-red-700 dark:text-red-300 cursor-help"
                title={health.issues.join(", ")}
              >
                <AlertCircle className="w-2.5 h-2.5" /> {health.issues.length} problema{health.issues.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Financial KPIs */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { val: fmtMoney(revenue), lbl: "Ventas mes", icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
            { val: fmtMoney(expenses), lbl: "Gastos mes", icon: ArrowDownRight, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
            { val: fmtMoney(profit), lbl: "Ganancia", icon: TrendingUp, color: profit >= 0 ? "text-teal-600" : "text-red-500", bg: profit >= 0 ? "bg-teal-50 dark:bg-teal-950/30" : "bg-red-50 dark:bg-red-950/30" },
            { val: String(t.monthOrders ?? 0), lbl: "Pedidos mes", icon: ShoppingCart, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          ].map(({ val, lbl, icon: Icon, color, bg }) => (
            <div key={lbl} className={`${bg} rounded-xl p-2 text-center`}>
              <Icon className={`w-3 h-3 mx-auto mb-0.5 ${color}`} />
              <div className={`text-sm font-extrabold ${color}`}>{val}</div>
              <div className="text-[9px] text-gray-400 leading-tight">{lbl}</div>
            </div>
          ))}
        </div>

        {/* Resources */}
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
                className={`rounded-xl p-2.5 text-center ${
                  isEmpty
                    ? "bg-gray-50 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-700"
                    : "bg-gray-50 dark:bg-gray-800/50"
                } ${canClick ? "cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:border-teal-200 dark:hover:border-teal-800 border border-transparent transition-colors" : ""}`}
              >
                <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${isEmpty ? "text-gray-300 dark:text-gray-600" : "text-gray-400"}`} />
                <div className={`text-base font-bold ${isEmpty ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-white"}`}>{val}</div>
                <div className={`text-[9px] ${isEmpty ? "text-gray-300 dark:text-gray-600" : "text-gray-400"}`}>
                  {canClick ? (isEmpty ? "Sin datos ▸" : `${lbl} ▸`) : isEmpty ? "Sin datos" : lbl}
                </div>
                {max !== -1 && !isEmpty && (
                  <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
                    <div className={`h-full rounded-full ${usagePct >= 100 ? "bg-red-500" : usagePct >= 80 ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${usagePct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panel data status */}
        <div
          className={`rounded-xl border px-3 py-2 ${
            hasVisibleAdminData
              ? "border-green-200 dark:border-green-800 bg-green-50/70 dark:bg-green-950/20"
              : "border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-950/20"
          }`}
        >
          <div
            className={`flex items-center gap-1.5 text-[11px] font-semibold ${
              hasVisibleAdminData ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
            }`}
          >
            {hasVisibleAdminData ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {hasVisibleAdminData ? "Panel con información" : "Panel sin información útil"}
          </div>
          <p
            className={`mt-0.5 text-[10px] ${
              hasVisibleAdminData ? "text-green-700/80 dark:text-green-300/80" : "text-red-700/80 dark:text-red-300/80"
            }`}
          >
            {hasVisibleAdminData
              ? "Esta tienda ya muestra datos en su admin del negocio."
              : "Faltan productos o movimientos; revisar la carga inicial de la tienda."}
          </p>
        </div>

        {/* Plan usage bar */}
        {t.usage && t.limits && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Uso del plan</span>
              <span className={totalUsagePct >= 100 ? "text-red-500" : totalUsagePct >= 80 ? "text-amber-500" : "text-teal-500"}>{totalUsagePct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${totalUsagePct >= 100 ? "bg-red-500" : totalUsagePct >= 80 ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${totalUsagePct}%` }} />
            </div>
          </div>
        )}

        {/* Row 1: Tienda + Panel Admin */}
        <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <a
            href={`/tienda`}
            onClick={(e) => { e.preventDefault(); window.open(`/t/${t.slug}/tienda`, "_blank"); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
          >
            <Store className="w-3.5 h-3.5" /> Ir a Tienda
          </a>
          <button
            type="button"
            onClick={() => onImpersonate(t.slug)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}
          >
            <ExternalLink className="w-3.5 h-3.5" /> Panel Admin
          </button>
        </div>

        {/* Row 2: Marketplace + Login */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onToggleMarketplace(t)}
            disabled={actionLoading === `${t.slug}-marketplace`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${
              isOnMarketplace
                ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                : hasStore
                ? "border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950"
                : "border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed"
            }`}
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
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" /> Iniciar sesión
          </button>
        </div>

        {/* Row 3: Invite + Suspend + Purge + Delete + Detail */}
        <div className="flex gap-2">
          <button type="button" onClick={() => onInvite(t.slug, t.name)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Invitar
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(t.slug, t.active)}
            disabled={actionLoading === `${t.slug}-active`}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${t.active ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950" : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"}`}
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
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors disabled:opacity-50"
            title="Limpiar datos de esta tienda (productos, pedidos, movimientos)"
          >
            {actionLoading === `${t.slug}-purge` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDelete(t.slug, t.name)}
            disabled={actionLoading === `${t.slug}-delete` || t.slug === "main"}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.slug === "main" ? "No se puede eliminar la tienda principal" : "Eliminar tienda"}
          >
            {actionLoading === `${t.slug}-delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDetail(t)}
            className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
