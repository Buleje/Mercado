"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useEffect, useState } from "react";
import {
  Zap, ShoppingBag, Users, ShoppingCart, Globe, BarChart2,
  CheckCircle2, XCircle, Crown, Loader2, AlertTriangle, CreditCard,
  Link, Trash2, RefreshCw,
} from "@buleje/design-system/icons";
import { PLANS, type PlanId, type PlanDef, type PlanLimits } from "@/lib/plans";
import { tenantFetch } from "@/lib/tenant-fetch";

// ─── Icono SVG de Mercado Pago ────────────────────────────
function MercadoPagoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 28 28"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 0C6.268 0 0 6.268 0 14s6.268 14 14 14 14-6.268 14-14S21.732 0 14 0zm6.576 10.164c-.394 2.61-2.07 4.76-4.34 5.875l2.43 5.797H15.29l-2.13-5.07h-1.498v5.07H8.28V7.164h5.688c2.942 0 5.014 1.274 6.608 3zm-6.608-.558h-2.256v4.046h2.256c1.38 0 2.34-.87 2.34-2.024 0-1.152-.96-2.022-2.34-2.022z" />
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────
interface PlanStatus {
  plan: string;
  planDef: PlanDef;
  limits: PlanLimits;
  usage: {
    products: number;
    users: number;
    ordersThisMonth: number;
  };
  tenant: {
    id?: string;
    slug: string;
    name?: string;
    active?: boolean;
    trialEndsAt?: string | null;
    customDomain?: string | null;
    stripeCustomerId?: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────
function pct(used: number, max: number) {
  if (max === -1) return 0; // unlimited
  return Math.min(100, Math.round((used / max) * 100));
}

function formatLimit(max: number) {
  return max === -1 ? "Ilimitado" : max.toLocaleString("es-PE");
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-200 dark:bg-gray-700 text-[var(--text-primary)]",
  pro: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
  business: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
  enterprise: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
};

const PLAN_BAR_COLOR: Record<string, string> = {
  free: "bg-gray-400",
  pro: "bg-[var(--accent-soft)]",
  business: "bg-[var(--text-primary)]",
  enterprise: "bg-[var(--data-warning-500)]",
};

const WARNING_THRESHOLD = 80; // % usage where we show a warning

// ─── UsageBar ────────────────────────────────────────────
function UsageBar({
  label, icon, used, max, planId,
}: {
  label: string;
  icon: React.ReactNode;
  used: number;
  max: number;
  planId: string;
}) {
  const unlimited = max === -1;
  const percent = pct(used, max);
  const isWarning = !unlimited && percent >= WARNING_THRESHOLD;
  const isFull = !unlimited && percent >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 font-medium">
          {icon}
          {label}
        </div>
        <span className={`text-xs font-semibold ${isFull ? "text-[var(--data-error-500)]" : isWarning ? "text-[var(--data-warning-500)]" : "text-muted"}`}>
          {unlimited ? (
            <span className="text-[var(--data-success-500)] font-bold">∞ ilimitado</span>
          ) : (
            <>{used.toLocaleString("es-PE")} / {max.toLocaleString("es-PE")}</>
          )}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 w-full bg-[var(--surface-sunken)] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-[var(--data-error-500)]" : isWarning ? "bg-[var(--data-warning-500)]" : PLAN_BAR_COLOR[planId] ?? "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {isWarning && !isFull && (
        <p className="text-xs text-[var(--data-warning-500)] flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Cerca del límite ({percent}%)
        </p>
      )}
      {isFull && (
        <p className="text-xs text-[var(--data-error-500)] flex items-center gap-1">
          <XCircle className="w-3 h-3" /> Límite alcanzado — actualiza tu plan
        </p>
      )}
    </div>
  );
}

// ─── FeatureRow ───────────────────────────────────────────
function FeatureRow({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {available ? (
        <CheckCircle2 className="w-4 h-4 text-[var(--data-success-500)] shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] shrink-0" />
      )}
      <span className={available ? "text-foreground" : "text-muted line-through"}>{label}</span>
    </div>
  );
}

// ─── PlanCard ─────────────────────────────────────────────
function PlanCard({
  def,
  isActive,
  onSelectStripe,
  onSelectMP,
  loadingStripe,
  loadingMP,
}: {
  def: PlanDef;
  isActive: boolean;
  onSelectStripe?: () => void;
  onSelectMP?: () => void;
  loadingStripe?: boolean;
  loadingMP?: boolean;
}) {
  const limits = def.limits;
  const isPaid = def.priceMonthly > 0;

  return (
    <div
      className={`rounded-xl border-2 p-3 sm:p-5 space-y-4 transition-all ${
        isActive
          ? "border-primary bg-primary/5"
          : "border-[var(--rule-base)] hover:border-primary/40"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {(def.id === "business" || def.id === "enterprise") && <Crown className={`w-4 h-4 ${def.id === "enterprise" ? "text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`} />}
            <CardTitle className="font-bold text-base">{def.name}</CardTitle>
          </div>
          <div className="mt-1">
            {def.priceMonthly === 0 ? (
              <span className="text-xl sm:text-2xl font-extrabold">Gratis</span>
            ) : (
              <span className="text-xl sm:text-2xl font-extrabold">
                ${def.priceMonthly}
                <span className="text-sm font-normal text-muted">/mes</span>
              </span>
            )}
          </div>
        </div>
        {isActive && (
          <span className="text-xs font-bold px-2 py-1 rounded-full bg-primary text-white">
            Plan actual
          </span>
        )}
      </div>

      {/* Limits */}
      <div className="space-y-1 text-sm text-muted">
        <p className="flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /> {formatLimit(limits.maxProducts)} productos</p>
        <p className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {formatLimit(limits.maxUsers)} usuarios</p>
        <p className="flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> {formatLimit(limits.maxOrdersPerMonth)} pedidos/mes</p>
      </div>

      {/* Features */}
      <div className="space-y-1.5 border-t border-[var(--rule-base)] pt-3">
        <FeatureRow label="Dominio propio" available={limits.customDomain} />
        <FeatureRow label="Analytics avanzado" available={limits.advancedAnalytics} />
        <FeatureRow label="API access" available={limits.apiAccess} />
        <FeatureRow label="Multi-tienda" available={limits.multiStore} />
        <FeatureRow label="Soporte prioritario" available={limits.prioritySupport} />
        <FeatureRow label="White label" available={limits.whiteLabel} />
        <FeatureRow label="Soporte dedicado" available={limits.dedicatedSupport} />
        <FeatureRow label="SLA garantizado" available={limits.sla} />
      </div>

      {/* CTAs — solo si no es el plan actual y es de pago */}
      {!isActive && isPaid && (
        <div className="space-y-2">
          {/* Stripe */}
          <button
            onClick={onSelectStripe}
            disabled={loadingStripe || loadingMP}
            className="w-full py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            {loadingStripe ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            Tarjeta / Stripe
          </button>

          {/* Mercado Pago */}
          <button
            onClick={onSelectMP}
            disabled={loadingStripe || loadingMP}
            className="w-full py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5 min-h-[44px]"
            style={{ backgroundColor: loadingStripe || loadingMP ? "#009ee3cc" : "#009ee3" }}
          >
            {loadingMP ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MercadoPagoIcon className="w-4 h-4" />
            )}
            Yape / BCP / MP
          </button>
        </div>
      )}

      {/* Plan gratuito sin botones de pago */}
      {!isActive && !isPaid && (
        <p className="text-xs text-muted text-center">Plan base — sin costo</p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────
export default function PlanTab() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectingMP, setRedirectingMP] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [now] = useState(() => Date.now());

  // ── Custom domain state ──
  const [domainInput, setDomainInput] = useState("");
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainRemoving, setDomainRemoving] = useState(false);
  const [domainVerifying, setDomainVerifying] = useState(false);
  const [domainVerified, setDomainVerified] = useState<boolean | null>(null);
  const [domainVerifyMsg, setDomainVerifyMsg] = useState("");

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Leer mp_status al regresar del checkout de Mercado Pago
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp_status");
    if (mpStatus === "approved") {
      showToast("Pago con Mercado Pago aprobado. Tu plan se actualizará en breve.");
    } else if (mpStatus === "pending") {
      showToast("Pago pendiente. Te notificaremos cuando se confirme.", true);
    } else if (mpStatus === "failure") {
      showToast("El pago con Mercado Pago no se completó. Intenta de nuevo.", false);
    }
    // Limpiar el parámetro de la URL sin recargar la página
    if (mpStatus) {
      const cleanUrl = window.location.pathname + (window.location.search.replace(/[?&]mp_status=[^&]*/g, "").replace(/^&/, "?") || "");
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((data: PlanStatus) => {
        setStatus(data);
        setDomainInput(data.tenant?.customDomain ?? "");
      })
      .catch(() => showToast("Error al cargar el plan", false))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveDomain = async () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;
    setDomainSaving(true);
    try {
      const res = await fetch("/api/tenant/custom-domain", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ domain }),
      });
      const data = await res.json() as { customDomain?: string; error?: string };
      if (!res.ok) { showToast(data.error ?? "Error al guardar dominio", false); return; }
      setStatus((prev) => prev ? { ...prev, tenant: { ...prev.tenant, customDomain: data.customDomain ?? domain } } : prev);
      setDomainVerified(null);
      setDomainVerifyMsg("");
      showToast("Dominio guardado. Configura el CNAME para activarlo.");
    } finally {
      setDomainSaving(false);
    }
  };

  const handleRemoveDomain = async () => {
    setDomainRemoving(true);
    try {
      const res = await fetch("/api/tenant/custom-domain", { method: "DELETE" });
      if (!res.ok) { showToast("Error al eliminar dominio", false); return; }
      setStatus((prev) => prev ? { ...prev, tenant: { ...prev.tenant, customDomain: null } } : prev);
      setDomainInput("");
      setDomainVerified(null);
      showToast("Dominio eliminado");
    } finally {
      setDomainRemoving(false);
    }
  };

  const handleVerifyDomain = async () => {
    setDomainVerifying(true);
    setDomainVerified(null);
    try {
      const res = await fetch("/api/tenant/custom-domain/verify");
      const data = await res.json() as { verified: boolean; target?: string; expected?: string; error?: string };
      setDomainVerified(data.verified);
      if (data.verified) {
        setDomainVerifyMsg("¡CNAME verificado! Tu dominio ya apunta correctamente.");
      } else if (data.error) {
        setDomainVerifyMsg(data.error);
      } else {
        setDomainVerifyMsg(`CNAME apunta a "${data.target}" pero se esperaba "${data.expected}".`);
      }
    } finally {
      setDomainVerifying(false);
    }
  };

  const handleUpgrade = async (planId: PlanId) => {
    setRedirecting(true);
    try {
      const res = await tenantFetch("/api/billing/checkout", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        showToast(data.error ?? "No se pudo iniciar el pago", false);
        return;
      }
      window.location.href = data.url;
    } catch {
      showToast("Error de red. Intenta de nuevo.", false);
    } finally {
      setRedirecting(false);
    }
  };

  const handleUpgradeMP = async (planId: PlanId) => {
    setRedirectingMP(true);
    try {
      const res = await tenantFetch("/api/billing/mp-checkout", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json() as { init_point?: string; error?: string };
      if (!res.ok || !data.init_point) {
        showToast(data.error ?? "No se pudo iniciar el pago con Mercado Pago", false);
        return;
      }
      window.location.href = data.init_point;
    } catch {
      showToast("Error de red. Intenta de nuevo.", false);
    } finally {
      setRedirectingMP(false);
    }
  };

  const handlePortal = async () => {
    setRedirecting(true);
    try {
      const res = await tenantFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        showToast(data.error ?? "No se pudo abrir el portal de facturación", false);
        return;
      }
      window.location.href = data.url;
    } catch {
      showToast("Error de red. Intenta de nuevo.", false);
    } finally {
      setRedirecting(false);
    }
  };

  if (loading) {
    return (
      <LoadingState />
    );
  }

  if (!status) {
    return (
      <div className="text-center py-16 text-muted text-sm">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        No se pudo cargar la información del plan.
      </div>
    );
  }

  const { plan, planDef, limits, usage, tenant } = status;

  // Trial banner
  const trialDaysLeft = tenant.trialEndsAt
    ? Math.ceil((new Date(tenant.trialEndsAt).getTime() - now) / 86400000)
    : null;
  const trialActive = trialDaysLeft !== null && trialDaysLeft > 0;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-2 sm:px-4 py-2 sm:py-3 rounded-lg text-white text-sm font-medium ${
            toast.ok ? "bg-[var(--accent-soft)]" : "bg-[var(--data-error-500)]"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Trial banner */}
      {trialActive && (
        <div className="flex flex-wrap items-center gap-3 bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-[var(--data-warning-500)] shrink-0" />
          <div>
            <p className="font-semibold text-sm text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
              Período de prueba — {trialDaysLeft} día{trialDaysLeft !== 1 ? "s" : ""} restantes
            </p>
            <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">
              Actualiza tu plan antes de que venza para no perder el acceso.
            </p>
          </div>
        </div>
      )}

      {/* Current plan header */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-base sm:text-xl font-bold flex flex-wrap items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Plan actual
          </SectionTitle>
          <p className="text-muted text-sm mt-1">Tienda: <strong>{tenant.name ?? tenant.slug}</strong></p>
        </div>
        <span className={`text-sm font-bold px-4 py-1.5 rounded-full ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
          {planDef.name}
          {plan !== "free" && ` — $${planDef.priceMonthly}/mes`}
        </span>
      </div>

      {/* Usage meters */}
      <div className="bg--(--color-card) border border-(--color-card-border) rounded-xl p-3 sm:p-6 space-y-3 sm:space-y-6">
        <CardTitle className="font-semibold text-sm text-muted">Uso del mes actual</CardTitle>
        <UsageBar
          label="Productos"
          icon={<ShoppingBag className="w-4 h-4 text-muted" />}
          used={usage.products}
          max={limits.maxProducts}
          planId={plan}
        />
        <UsageBar
          label="Usuarios activos"
          icon={<Users className="w-4 h-4 text-muted" />}
          used={usage.users}
          max={limits.maxUsers}
          planId={plan}
        />
        <UsageBar
          label="Pedidos este mes"
          icon={<ShoppingCart className="w-4 h-4 text-muted" />}
          used={usage.ordersThisMonth}
          max={limits.maxOrdersPerMonth}
          planId={plan}
        />
      </div>

      {/* Features enabled */}
      <div className="bg--(--color-card) border border-(--color-card-border) rounded-xl p-3 sm:p-6 space-y-3">
        <CardTitle className="font-semibold text-sm text-muted flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4" /> Funcionalidades incluidas
        </CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FeatureRow label="Analytics avanzado" available={limits.advancedAnalytics} />
          <FeatureRow label="API Access" available={limits.apiAccess} />
          <FeatureRow label="Multi-tienda" available={limits.multiStore} />
          <FeatureRow label="Soporte prioritario" available={limits.prioritySupport} />
          <FeatureRow label="White label" available={limits.whiteLabel} />
          <FeatureRow label="Soporte dedicado" available={limits.dedicatedSupport} />
          <FeatureRow label="SLA garantizado" available={limits.sla} />
        </div>
      </div>

      {/* Custom domain management */}
      <div className="bg--(--color-card) border border-(--color-card-border) rounded-xl p-3 sm:p-6 space-y-4">
        <CardTitle className="font-semibold text-sm text-muted flex items-center gap-1.5">
          <Globe className="w-4 h-4" /> Dominio personalizado
        </CardTitle>
        {!limits.customDomain ? (
          <div className="flex flex-wrap items-start gap-3 text-sm text-muted">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--data-warning-500)]" />
            <span>El dominio personalizado está disponible en los planes <strong>Pro</strong>, <strong>Business</strong> y <strong>Enterprise</strong>. Actualiza tu plan para configurarlo.</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Input row */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="www.mitienda.com"
                  className="w-full bg-transparent border border-(--color-card-border) rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={handleSaveDomain}
                disabled={domainSaving || !domainInput.trim()}
                className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
              >
                {domainSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Guardar
              </button>
              {tenant.customDomain && (
                <button
                  onClick={handleRemoveDomain}
                  disabled={domainRemoving}
                  title="Eliminar dominio"
                  className="p-2.5 rounded-lg border border-[var(--data-error-500)] text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950 disabled:opacity-50"
                >
                  {domainRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* DNS instructions */}
            {tenant.customDomain && (
              <div className="bg--(--color-surface) rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold">Configura tu DNS</p>
                <p className="text-xs text-muted">En el panel de tu proveedor de dominio, añade el siguiente registro:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs font-mono bg-muted/10 rounded-lg p-3">
                  <div><span className="text-muted">Tipo</span><br /><strong>CNAME</strong></div>
                  <div><span className="text-muted">Nombre</span><br /><strong>{tenant.customDomain.split(".")[0]}</strong></div>
                  <div className="truncate"><span className="text-muted">Apunta a</span><br /><strong>{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "bodegasaas.com"}</strong></div>
                </div>
                <p className="text-xs text-muted">Los cambios de DNS pueden tardar hasta 48 horas en propagarse.</p>

                {/* Verify */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleVerifyDomain}
                    disabled={domainVerifying}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-(--color-card-border) hover:bg-(--color-surface) disabled:opacity-50"
                  >
                    {domainVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Verificar CNAME
                  </button>
                  {domainVerified === true && (
                    <span className="flex items-center gap-1 text-xs text-[var(--data-success-500)] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verificado
                    </span>
                  )}
                  {domainVerified === false && (
                    <span className="flex items-center gap-1 text-xs text-[var(--data-error-500)]">
                      <XCircle className="w-3.5 h-3.5" /> No verificado
                    </span>
                  )}
                </div>
                {domainVerifyMsg && (
                  <p className={`text-xs mt-1 ${domainVerified ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"}`}>{domainVerifyMsg}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manage subscription (only when on a paid plan with Stripe) */}
      {plan !== "free" && tenant.stripeCustomerId && (
        <div className="flex items-center justify-between bg--(--color-card) border border-(--color-card-border) rounded-xl px-5 py-4">
          <div>
            <p className="font-semibold text-sm">Gestionar facturación</p>
            <p className="text-xs text-muted mt-0.5">Cambia tu método de pago, descarga facturas o cancela.</p>
          </div>
          <button
            onClick={handlePortal}
            disabled={redirecting}
            className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-(--color-card-border) text-sm font-semibold hover:bg-(--color-surface) disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Portal de facturación
          </button>
        </div>
      )}

      {/* Plan comparison cards */}
      <div>
        <CardTitle className="font-semibold text-base mb-4">Comparar planes</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {(Object.values(PLANS) as PlanDef[]).map((def) => (
            <PlanCard
              key={def.id}
              def={def}
              isActive={def.id === plan}
              onSelectStripe={() => handleUpgrade(def.id)}
              onSelectMP={() => handleUpgradeMP(def.id)}
              loadingStripe={redirecting}
              loadingMP={redirectingMP}
            />
          ))}
        </div>

        {/* Mensajes de redirección */}
        {redirecting && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo a Stripe…
          </div>
        )}
        {redirectingMP && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#009ee3" }} />
            <span>Redirigiendo a Mercado Pago…</span>
          </div>
        )}

        <p className="text-xs text-muted mt-4 text-center">
          Paga con Stripe (tarjeta internacional) o Mercado Pago (Yape, BCP, Plin y más).
        </p>
      </div>
    </div>
  );
}
