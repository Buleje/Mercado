"use client";

import { useEffect, useState } from "react";
import {
  Zap, ShoppingBag, Users, ShoppingCart, Globe, BarChart2,
  CheckCircle2, XCircle, Crown, Loader2, AlertTriangle, ArrowRight, CreditCard,
  Link, Trash2, RefreshCw,
} from "lucide-react";
import { PLANS, type PlanId, type PlanDef, type PlanLimits } from "@/lib/plans";

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
  free: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200",
  pro: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  business: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300",
  enterprise: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
};

const PLAN_BAR_COLOR: Record<string, string> = {
  free: "bg-gray-400",
  pro: "bg-blue-500",
  business: "bg-violet-500",
  enterprise: "bg-amber-500",
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
        <span className={`text-xs font-semibold ${isFull ? "text-red-500" : isWarning ? "text-amber-500" : "text-muted"}`}>
          {unlimited ? (
            <span className="text-emerald-500 font-bold">∞ ilimitado</span>
          ) : (
            <>{used.toLocaleString("es-PE")} / {max.toLocaleString("es-PE")}</>
          )}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-red-500" : isWarning ? "bg-amber-400" : PLAN_BAR_COLOR[planId] ?? "bg-primary"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {isWarning && !isFull && (
        <p className="text-xs text-amber-500 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Cerca del límite ({percent}%)
        </p>
      )}
      {isFull && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <XCircle className="w-3 h-3" /> Límite alcanzado — actualiza tu plan
        </p>
      )}
    </div>
  );
}

// ─── FeatureRow ───────────────────────────────────────────
function FeatureRow({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {available ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
      )}
      <span className={available ? "text-foreground" : "text-muted line-through"}>{label}</span>
    </div>
  );
}

// ─── PlanCard ─────────────────────────────────────────────
function PlanCard({
  def, isActive, onSelect,
}: {
  def: PlanDef;
  isActive: boolean;
  onSelect?: () => void;
}) {
  const limits = def.limits;
  return (
    <div
      className={`rounded-2xl border-2 p-5 space-y-4 transition-all ${
        isActive
          ? "border-primary bg-primary/5 shadow-lg"
          : "border-gray-200 dark:border-gray-700 hover:border-primary/40"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {(def.id === "business" || def.id === "enterprise") && <Crown className={`w-4 h-4 ${def.id === "enterprise" ? "text-amber-500" : "text-violet-500"}`} />}
            <h3 className="font-bold text-base">{def.name}</h3>
          </div>
          <div className="mt-1">
            {def.priceMonthly === 0 ? (
              <span className="text-2xl font-extrabold">Gratis</span>
            ) : (
              <span className="text-2xl font-extrabold">
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
      <div className="space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3">
        <FeatureRow label="Dominio propio" available={limits.customDomain} />
        <FeatureRow label="Analytics avanzado" available={limits.advancedAnalytics} />
        <FeatureRow label="API access" available={limits.apiAccess} />
        <FeatureRow label="Multi-tienda" available={limits.multiStore} />
        <FeatureRow label="Soporte prioritario" available={limits.prioritySupport} />
        <FeatureRow label="White label" available={limits.whiteLabel} />
        <FeatureRow label="Soporte dedicado" available={limits.dedicatedSupport} />
        <FeatureRow label="SLA garantizado" available={limits.sla} />
      </div>

      {/* CTA */}
      {!isActive && (
        <button
          onClick={onSelect}
          className="w-full py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-1"
        >
          Cambiar a {def.name} <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────
export default function PlanTab() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
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

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then((data: PlanStatus) => {
        setStatus(data);
        setDomainInput(data.tenant.customDomain ?? "");
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
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const handlePortal = async () => {
    setRedirecting(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
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
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
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
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg ${
            toast.ok ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Trial banner */}
      {trialActive && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">
              Período de prueba — {trialDaysLeft} día{trialDaysLeft !== 1 ? "s" : ""} restantes
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Actualiza tu plan antes de que venza para no perder el acceso.
            </p>
          </div>
        </div>
      )}

      {/* Current plan header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Plan actual
          </h2>
          <p className="text-muted text-sm mt-1">Tienda: <strong>{tenant.name ?? tenant.slug}</strong></p>
        </div>
        <span className={`text-sm font-bold px-4 py-1.5 rounded-full ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
          {planDef.name}
          {plan !== "free" && ` — $${planDef.priceMonthly}/mes`}
        </span>
      </div>

      {/* Usage meters */}
      <div className="bg--(--color-card) border border-(--color-card-border) rounded-2xl p-6 space-y-6">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted">Uso del mes actual</h3>
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
      <div className="bg--(--color-card) border border-(--color-card-border) rounded-2xl p-6 space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4" /> Funcionalidades incluidas
        </h3>
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
      <div className="bg--(--color-card) border border-(--color-card-border) rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted flex items-center gap-1.5">
          <Globe className="w-4 h-4" /> Dominio personalizado
        </h3>
        {!limits.customDomain ? (
          <div className="flex items-start gap-3 text-sm text-muted">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <span>El dominio personalizado está disponible en los planes <strong>Pro</strong>, <strong>Business</strong> y <strong>Enterprise</strong>. Actualiza tu plan para configurarlo.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Input row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="www.mitienda.com"
                  className="w-full bg-transparent border border-(--color-card-border) rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                onClick={handleSaveDomain}
                disabled={domainSaving || !domainInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
              >
                {domainSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Guardar
              </button>
              {tenant.customDomain && (
                <button
                  onClick={handleRemoveDomain}
                  disabled={domainRemoving}
                  title="Eliminar dominio"
                  className="p-2.5 rounded-xl border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
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
                <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-muted/10 rounded-lg p-3">
                  <div><span className="text-muted">Tipo</span><br /><strong>CNAME</strong></div>
                  <div><span className="text-muted">Nombre</span><br /><strong>{tenant.customDomain.split(".")[0]}</strong></div>
                  <div className="truncate"><span className="text-muted">Apunta a</span><br /><strong>{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "bodegasaas.com"}</strong></div>
                </div>
                <p className="text-xs text-muted">Los cambios de DNS pueden tardar hasta 48 horas en propagarse.</p>

                {/* Verify */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleVerifyDomain}
                    disabled={domainVerifying}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-(--color-card-border) hover:bg-(--color-surface) disabled:opacity-50"
                  >
                    {domainVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Verificar CNAME
                  </button>
                  {domainVerified === true && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Verificado
                    </span>
                  )}
                  {domainVerified === false && (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="w-3.5 h-3.5" /> No verificado
                    </span>
                  )}
                </div>
                {domainVerifyMsg && (
                  <p className={`text-xs mt-1 ${domainVerified ? "text-emerald-500" : "text-red-500"}`}>{domainVerifyMsg}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manage subscription (only when on a paid plan with Stripe) */}
      {plan !== "free" && tenant.stripeCustomerId && (
        <div className="flex items-center justify-between bg--(--color-card) border border-(--color-card-border) rounded-2xl px-5 py-4">
          <div>
            <p className="font-semibold text-sm">Gestionar facturación</p>
            <p className="text-xs text-muted mt-0.5">Cambia tu método de pago, descarga facturas o cancela.</p>
          </div>
          <button
            onClick={handlePortal}
            disabled={redirecting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-(--color-card-border) text-sm font-semibold hover:bg-(--color-surface) disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Portal de facturación
          </button>
        </div>
      )}

      {/* Plan comparison cards */}
      <div>
        <h3 className="font-semibold text-base mb-4">Comparar planes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(Object.values(PLANS) as PlanDef[]).map((def) => (
            <PlanCard
              key={def.id}
              def={def}
              isActive={def.id === plan}
              onSelect={() => handleUpgrade(def.id)}
            />
          ))}
        </div>
        {redirecting && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo a Stripe…
          </div>
        )}
        <p className="text-xs text-muted mt-4 text-center">
          Los pagos son procesados de forma segura por Stripe. Puedes cancelar en cualquier momento.
        </p>
      </div>
    </div>
  );
}
