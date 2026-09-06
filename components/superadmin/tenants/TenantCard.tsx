"use client";

import { useState } from "react";
import {
  ExternalLink,
  Mail,
  XCircle,
  CheckCircle2,
  Loader2,
  ArrowDownRight,
  ArrowUpRight,
  Package,
  Users,
  Store,
  ShoppingBag,
  BarChart3,
  Trash2,
  Eraser,
  LogIn,
  Clock,
  AlertTriangle,
  Bell,
} from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { ProductBadge, StatCard, WarningAlert, SuccessAlert } from "@buleje/design-system";
import { PendingOrdersModal } from "./PendingOrdersModal";

interface TenantCardProps {
  tenant: TenantRow;
  /** Salud calculada en la page — se muestra integrada en el kicker (antes era un badge absoluto superpuesto). */
  health?: "healthy" | "warning" | "critical";
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
  onAddProduct?: (tenant: TenantRow) => void;
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
};

/**
 * Tenants administrativos / demo del owner.
 * No generan alerta "1 PROBLEMA" aunque estén vacíos.
 * Para agregar uno: meter el slug acá. Para hacerlo flag en DB en el futuro,
 * usar migration expand-only `isAdminTenant Boolean @default(false)`.
 */
const ADMIN_TENANT_SLUGS = new Set<string>(["buleje", "main"]);

function isAdminTenant(t: TenantRow): boolean {
  return ADMIN_TENANT_SLUGS.has(t.slug);
}

/** Computes a health score for the tenant. */
function computeHealth(t: TenantRow): { ok: boolean; issues: string[]; isAdmin: boolean } {
  const isAdmin = isAdminTenant(t);
  // Admin tenants: skip alertas de "vacío" pero mantener señal si está inactivo.
  if (isAdmin) {
    const adminIssues: string[] = [];
    if (!t.active) adminIssues.push("Tienda inactiva");
    return { ok: adminIssues.length === 0, issues: adminIssues, isAdmin: true };
  }
  const issues: string[] = [];
  if ((t.usage?.products ?? 0) === 0) issues.push("Sin productos");
  if ((t._count.AdminUser ?? 0) === 0) issues.push("Sin usuarios admin");
  if (!t.active) issues.push("Tienda inactiva");
  if ((t.stores?.length ?? 0) === 0) issues.push("Sin tienda en marketplace");
  return { ok: issues.length === 0, issues, isAdmin: false };
}

export function TenantCard({
  tenant,
  health: healthProp,
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
  onAddProduct,
}: TenantCardProps) {
  const t = tenant;
  const initials = t.name.slice(0, 2).toUpperCase();
  const health = computeHealth(t);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const pendingCount = t.pendingOrders ?? 0;

  const pctFn = (u: number, m: number) => (m === -1 ? 0 : Math.min(100, Math.round((u / m) * 100)));
  const totalUsagePct =
    t.usage && t.limits
      ? Math.round(
          (pctFn(t.usage.products, t.limits.maxProducts) +
            pctFn(t.usage.users, t.limits.maxUsers) +
            pctFn(t.usage.ordersThisMonth, t.limits.maxOrdersPerMonth)) /
            3,
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

  // ── Trial counter ──────────────────────────────────────────────
  // Calcula días de prueba restantes basado en trialEndsAt.
  // Política: 15 días al registrarse. Tras 0, el dueño queda bloqueado
  // hasta que pague o el superadmin lo habilite manualmente.
  // Estados visuales:
  //   - hasPaidPlan: oculta el badge (ya no necesita trial)
  //   - daysLeft > 7: verde "X días"
  //   - 1–7: ámbar "X días"
  //   - 0: rojo "expirado"
  // Snapshot Date.now() en mount — evita re-render storms y satisface la
  // regla react-hooks/purity (Date.now en render = impuro).
  const [now] = useState(() => Date.now());
  const hasPaidPlan = t.plan !== "free";
  const trialEnds = t.trialEndsAt ? new Date(t.trialEndsAt) : null;
  const daysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - now) / 86_400_000))
    : null;
  const trialBadge = (() => {
    if (hasPaidPlan || daysLeft === null) return null;
    if (daysLeft <= 0) {
      return {
        text: "Trial expirado",
        bg: "bg-red-50 dark:bg-red-950/40",
        border: "border-red-300 dark:border-red-800",
        fg: "text-[var(--data-error-700)] dark:text-red-300",
        Icon: AlertTriangle,
      };
    }
    if (daysLeft <= 7) {
      return {
        text: `${daysLeft} día${daysLeft === 1 ? "" : "s"} restantes`,
        bg: "bg-teal-50 dark:bg-teal-950/40",
        border: "border-teal-300 dark:border-teal-800",
        fg: "text-teal-700 dark:text-teal-300",
        Icon: Clock,
      };
    }
    return {
      text: `${daysLeft} días de prueba`,
      bg: "bg-emerald-50 dark:bg-emerald-950/40",
      border: "border-emerald-300 dark:border-emerald-800",
      fg: "text-[var(--data-success-700)] dark:text-emerald-300",
      Icon: Clock,
    };
  })();

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl shadow-[var(--shadow-sm)] hover:border-[var(--rule-strong)] transition-colors overflow-hidden">
      {/* Brandon 2026-05-21 fix mobile: p-4 sm:p-5 — 16px lateral en mobile
          (de 20px) gana ~8px de ancho interno para los KPIs 4-col. */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* Kicker — Brandon 2026-06-05 desaturación: antes acá vivían hasta
            5 badges en flex-wrap (pendientes/trial/Enterprise/Marketplace/
            Admin/problemas) y ADEMÁS la page montaba un badge de salud
            `absolute top-3 right-3` encima → se pisaban entre sí.
            Ahora: fila 1 = plan + salud (1 solo pill, integrado). El resto
            de señales baja a una fila de chips uniforme bajo el nombre. */}
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 whitespace-nowrap text-[length:var(--ts-xs)] uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)] font-semibold">
            Plan {planLabel}
          </span>
          {healthProp && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ring-1 ${
                healthProp === "healthy"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
                  : healthProp === "warning"
                    ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/30"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30"
              }`}
              title={
                healthProp === "healthy"
                  ? "Tenant saludable — activo, sin pendientes excesivos"
                  : healthProp === "warning"
                    ? "Atención — alguna métrica está baja"
                    : "Crítico — suspendido o múltiples problemas"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  healthProp === "healthy"
                    ? "bg-emerald-500 animate-pulse"
                    : healthProp === "warning"
                      ? "bg-teal-500"
                      : "bg-rose-500"
                }`}
                aria-hidden
              />
              {healthProp === "healthy" ? "OK" : healthProp === "warning" ? "Aviso" : "Crítico"}
            </span>
          )}
        </div>

        {/* Avatar + Name + Status */}
        <div className="flex items-start gap-3">
          {t.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo de tenant es URL externa o blob, no se puede usar next/image sin remotePatterns por host
            <img
              src={t.logoUrl}
              alt={`Logo ${t.name}`}
              className="w-12 h-12 rounded-lg object-cover shrink-0 border border-[var(--rule-base)] bg-[var(--surface-sunken)]"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const fallback = el.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className="w-12 h-12 rounded-lg items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-primary)] font-bold text-base shrink-0 border border-[var(--rule-base)]"
            style={{ display: t.logoUrl ? "none" : "flex" }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-bold text-[var(--text-primary)] text-base truncate">
                {t.name}
              </div>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${t.active ? "bg-[var(--data-success-500)]" : "bg-[var(--text-tertiary)]"}`}
                title={t.active ? "Activo" : "Suspendido"}
              />
            </div>
            <div className="text-[var(--text-tertiary)] text-xs font-mono">{t.slug}</div>
            {t.ownerEmail && (
              <div className="text-[var(--text-tertiary)] text-[length:var(--ts-xs)] truncate mt-0.5">
                {t.ownerEmail}
              </div>
            )}
          </div>
        </div>

        {/* Fila de señales — chips uniformes (h-6), una sola línea con wrap
            limpio. Solo se renderiza si hay algo que mostrar. "Enterprise"
            ya NO se repite acá (redundante con "Plan Enterprise" del kicker). */}
        {(pendingCount > 0 || trialBadge || isOnMarketplace || health.isAdmin || !health.ok) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingModalOpen(true);
                }}
                title={`${pendingCount} pedido${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"} — click para ver detalles`}
                className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-bold bg-[var(--data-error-500)] text-white shadow-sm hover:bg-[var(--data-error-600)] transition-colors"
              >
                <Bell className="w-3 h-3" strokeWidth={2.5} />
                <span className="tabular-nums">{pendingCount} pend.</span>
              </button>
            )}
            {trialBadge && (
              <button
                type="button"
                onClick={async () => {
                  const input = window.prompt(
                    `Extender trial de "${t.name}"\n` +
                      `Vence: ${trialEnds ? trialEnds.toLocaleDateString("es-PE") : "—"}\n\n` +
                      `Cuántos días sumar? (negativo = restar)`,
                    "15",
                  );
                  if (input == null) return;
                  const days = Number(input);
                  if (!Number.isFinite(days) || days === 0) return;
                  try {
                    const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
                    const r = await fetch(`/api/superadmin/tenants/${t.slug}/extend-trial`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(csrf ? { "x-csrf-token": csrf } : {}),
                      },
                      credentials: "include",
                      body: JSON.stringify({ days }),
                    });
                    if (!r.ok) {
                      const data = await r.json().catch((_e) => null);
                      window.alert(`Error: ${data?.error ?? r.statusText}`);
                      return;
                    }
                    window.location.reload();
                  } catch (err) {
                    window.alert(`Error de red: ${String(err)}`);
                  }
                }}
                className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-bold transition-all hover:scale-[1.02] ${trialBadge.bg} ${trialBadge.border} ${trialBadge.fg}`}
                title={`${trialEnds ? `Vence ${trialEnds.toLocaleDateString("es-PE")} · ` : ""}Click para extender o reducir el trial`}
              >
                <trialBadge.Icon className="w-3 h-3" strokeWidth={2.25} />
                {trialBadge.text}
              </button>
            )}
            {isOnMarketplace && (
              <ProductBadge intent="fresh">
                <ShoppingBag className="w-2.5 h-2.5 mr-1 inline" />
                Marketplace
              </ProductBadge>
            )}
            {health.isAdmin && <ProductBadge intent="premium">Admin</ProductBadge>}
            {!health.ok && (
              /* Brandon 2026-06-17: "problema" es alerta (rojo), no "oferta" (ámbar).
                 intent="new" (neutro) + override rojo de la familia --data-error. */
              <ProductBadge
                intent="new"
                className="!bg-[var(--data-error-50,#fef2f2)] !text-[var(--data-error-600,#dc2626)] !border-transparent dark:!bg-red-950/30 dark:!text-red-400"
              >
                {health.issues.length} problema{health.issues.length !== 1 ? "s" : ""}
              </ProductBadge>
            )}
          </div>
        )}

        {/* Financial KPIs — Brandon 2026-05-21:
            · mobile: 2x2 con gap-2
            · desktop high-impact: gap-3 (más respiro entre cards angostas
              cuando hay grid de 3 col en el page → los valores "S/144 S/0"
              se veían pegados). */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <StatCard density="compact" label="Ventas" value={fmtMoney(revenue)} />
          <StatCard density="compact" label="Gastos" value={fmtMoney(expenses)} />
          <StatCard density="compact" label="Ganancia" value={fmtMoney(profit)} />
          <StatCard density="compact" label="Pedidos" value={String(t.monthOrders ?? 0)} />
        </div>

        {/* Resources — chips neutros uniformes (3 cols ya cabe en mobile
            con gap-1.5, los labels usan text-xs centered). */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {[
            {
              val: t.usage?.products ?? 0,
              lbl: "Productos",
              icon: Package,
              max: t.limits?.maxProducts ?? -1,
              clickable: true,
            },
            {
              val: t._count.AdminUser,
              lbl: "Usuarios",
              icon: Users,
              max: t.limits?.maxUsers ?? -1,
              clickable: false,
            },
            {
              val: storeInfo?._count.products ?? 0,
              lbl: "En Marketplace",
              icon: Store,
              max: -1,
              clickable: false,
            },
          ].map(({ val, lbl, icon: Icon, max, clickable }) => {
            const usagePct = max === -1 ? 0 : Math.min(100, Math.round((val / max) * 100));
            const isEmpty = val === 0 && lbl !== "Usuarios";
            const canClick = clickable && Boolean(onViewProducts);
            return (
              <div
                key={lbl}
                onClick={canClick ? () => onViewProducts?.(t) : undefined}
                onKeyDown={
                  canClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onViewProducts?.(t);
                        }
                      }
                    : undefined
                }
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                className={`rounded-lg p-2.5 text-center bg-[var(--surface-sunken)] border border-[var(--rule-soft)] ${
                  canClick
                    ? "cursor-pointer hover:border-[var(--rule-strong)] transition-colors"
                    : ""
                }`}
              >
                <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-[var(--text-secondary)]" />
                <div
                  className={`text-base font-bold ${isEmpty ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}
                >
                  {val}
                </div>
                <div className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
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
                              ? "#0d9488"
                              : "var(--accent)",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panel data status — DS Alert. Admin tenants: mensaje neutral, no warning. */}
        {hasVisibleAdminData ? (
          <SuccessAlert
            title="Panel con información"
            description="Esta tienda ya muestra datos en su admin del negocio."
          />
        ) : health.isAdmin ? (
          <SuccessAlert
            title="Tenant administrativo"
            description="Cuenta interna del owner. No requiere productos ni movimientos."
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
            <div className="flex justify-between text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              <span>Uso del plan</span>
              <span
                className={
                  totalUsagePct >= 100
                    ? "text-[var(--data-error-500)]"
                    : totalUsagePct >= 80
                      ? "text-teal-500"
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
                        ? "#0d9488"
                        : "var(--accent)",
                }}
              />
            </div>
          </div>
        )}

        {/* Row 1: Tienda + Panel Admin — Brandon 2026-05-21 high-impact.
            Panel Admin es LA acción principal del superadmin (impersona el
            panel del tenant). Antes: igual peso visual que "Ir a Tienda".
            Ahora:
            · Panel Admin: gradient + altura mayor (h-11 vs h-9) + icono
              full-stroke + texto bold (CTA primario obvio)
            · Ir a Tienda: outline subtle (acción secundaria de preview) */}
        <div className="flex gap-2 pt-1 border-t border-[var(--rule-base)]">
          <a
            href={`/tienda`}
            onClick={(e) => {
              e.preventDefault();
              window.open(`/t/${t.slug}/tienda`, "_blank");
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-xs font-semibold border border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:bg-[var(--rule-soft)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title="Abrir el storefront público del tenant en otra pestaña"
          >
            <Store className="w-3.5 h-3.5" /> Ir a Tienda
          </a>
          <button
            type="button"
            onClick={() => onImpersonate(t.slug)}
            className="flex-[1.5] inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--accent)_55%,transparent)] hover:shadow-[0_6px_16px_-4px_color-mix(in_oklab,var(--accent)_70%,transparent)]"
            style={{
              background:
                "linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 75%, black))",
            }}
            title="Impersonar el panel admin de este tenant"
            aria-label={`Abrir panel admin de ${t.name}`}
          >
            <ExternalLink className="w-4 h-4" strokeWidth={2.5} /> Panel Admin
          </button>
        </div>

        {/* Row CTA: Agregar producto desde superadmin (con modifiers) */}
        {onAddProduct && (
          <button
            type="button"
            onClick={() => onAddProduct(t)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border-2 border-dashed border-[var(--accent)]/40 text-[var(--accent)] hover:bg-primary/10 transition-colors"
          >
            <Package className="w-4 h-4" /> Agregar producto a esta tienda
          </button>
        )}

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
              <>
                <ArrowDownRight className="w-3.5 h-3.5" /> Dar de baja
              </>
            ) : hasStore ? (
              <>
                <ArrowUpRight className="w-3.5 h-3.5" /> Subir a Marketplace
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" /> Sin tienda
              </>
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

        {/* Row 3 — Brandon 2026-05-21 fix mobile: separamos botones con
            label (Invitar/Suspender) de los icon-only (Purge/Delete/Detail).
            Mobile: 2+3 stack (2 botones full text arriba, 3 icons compactos
            abajo). Desktop: 5 en 1 fila como antes. Tap targets h-10 mobile. */}
        <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
          {/* Sub-fila 1: botones con label (full text) */}
          <div className="grid grid-cols-2 sm:flex-1 sm:flex sm:gap-2 gap-2">
            <button
              type="button"
              onClick={() => onInvite(t.slug, t.name)}
              className="sm:flex-1 inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Invitar usuario"
            >
              <Mail className="w-3.5 h-3.5" /> Invitar
            </button>
            <button
              type="button"
              onClick={() => onToggleActive(t.slug, t.active)}
              disabled={actionLoading === `${t.slug}-active`}
              className="sm:flex-1 inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              aria-label={t.active ? "Suspender tienda" : "Activar tienda"}
            >
              {actionLoading === `${t.slug}-active` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : t.active ? (
                <>
                  <XCircle className="w-3.5 h-3.5" /> Suspender
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Activar
                </>
              )}
            </button>
          </div>
          {/* Sub-fila 2: 3 icon-only botones — tap targets h-10 mobile */}
          <div className="grid grid-cols-3 sm:flex gap-2">
            <button
              type="button"
              onClick={() => onPurge(t.slug, t.name)}
              disabled={actionLoading === `${t.slug}-purge`}
              className="inline-flex items-center justify-center h-10 w-full sm:w-10 sm:h-9 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title="Limpiar datos de esta tienda (productos, pedidos, movimientos)"
              aria-label="Limpiar datos"
            >
              {actionLoading === `${t.slug}-purge` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eraser className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onDelete(t.slug, t.name)}
              disabled={actionLoading === `${t.slug}-delete` || t.slug === "main"}
              className="inline-flex items-center justify-center h-10 w-full sm:w-10 sm:h-9 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={
                t.slug === "main" ? "No se puede eliminar la tienda principal" : "Eliminar tienda"
              }
              aria-label="Eliminar tienda"
            >
              {actionLoading === `${t.slug}-delete` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onDetail(t)}
              className="inline-flex items-center justify-center h-10 w-full sm:w-10 sm:h-9 rounded-lg text-xs border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              title="Ver detalle / analytics"
              aria-label="Ver detalle"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {pendingModalOpen && (
        <PendingOrdersModal
          tenantSlug={t.slug}
          tenantName={t.name}
          onClose={() => setPendingModalOpen(false)}
        />
      )}
    </div>
  );
}
