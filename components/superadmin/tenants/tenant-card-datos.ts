import { Clock, AlertTriangle } from "@buleje/design-system/icons";
import type { TenantRow } from "@/lib/superadmin-types";
import { etiquetaDePlan } from "@/lib/billing/plan-tiers";

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
export function computeHealth(t: TenantRow): { ok: boolean; issues: string[]; isAdmin: boolean } {
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

/** Cifras y señales derivadas de una tienda para su tarjeta (puro: `now` llega del montaje). */
export function datosDeTarjeta(t: TenantRow, now: number) {
  const initials = t.name.slice(0, 2).toUpperCase();
  const health = computeHealth(t);
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
  const planLabel = etiquetaDePlan(t.plan);

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
      bg: "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/40",
      border: "border-[var(--data-success-500)] dark:border-[var(--data-success-700)]",
      fg: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
      Icon: Clock,
    };
  })();

  return {
    initials, health, pendingCount, totalUsagePct, fmtMoney, storeInfo, isOnMarketplace, hasStore,
    revenue, expenses, profit, hasVisibleAdminData, planLabel, hasPaidPlan, daysLeft, trialBadge, trialEnds,
  };
}

export type DatosDeTarjeta = ReturnType<typeof datosDeTarjeta>;
