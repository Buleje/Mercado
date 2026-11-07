"use client";

/**
 * Configuración › Plan (`?tab=config&vista=plan`).
 *
 * Compactado el 11-10 (patrón del panel, «lo central a la vista»): una
 * tarjeta «Tu plan» con qué plan tienes, el uso del mes, qué te falta y el
 * botón para mejorar; «Comparar planes» y «Dominio propio» plegados con su
 * resumen. Antes eran 6 bloques apilados (2,32 pantallas) y «Funcionalidades
 * incluidas» repetía la lista de la tarjeta de tu plan en «Comparar planes».
 * Las piezas viven en `components/admin/settings/plan/`.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CardTitle, LoadingState } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import Plegable from "@/components/admin/shared/Plegable";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { tenantFetch } from "@/lib/tenant-fetch";
import { PLANS, PLAN_ORDER, type PlanId, type PlanDef, type PlanLimits } from "@/lib/plans";
import { FUNCIONALIDADES, PlanCard, UsageBar, precioPlan } from "@/components/admin/settings/plan/PlanCard";
import { DominioPropio } from "@/components/admin/settings/plan/DominioPropio";
import {
  AlertTriangle, ArrowUpRight, CreditCard, Loader2, ShoppingBag, ShoppingCart, Users, XCircle, Zap,
} from "@buleje/design-system/icons";

interface PlanStatus {
  plan: string;
  planDef: PlanDef;
  limits: PlanLimits;
  usage: { products: number; users: number; ordersThisMonth: number };
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

const CLAVE_COMPARAR = "ajustes-plegable-plan-comparar";
const PRIMERO_CON_DOMINIO = PLAN_ORDER.map((id) => PLANS[id]).find((p) => p.limits.customDomain);

/** Lo que devuelve un checkout: la URL a la que ir, o el error para el toast. */
async function irAlPago(url: string, body: Record<string, unknown> | null, campo: "url" | "init_point", error: string) {
  const res = await tenantFetch(url, {
    method: "POST",
    ...(body ? { headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) } : {}),
  });
  const data = await res.json() as { url?: string; init_point?: string; error?: string };
  const destino = data[campo];
  if (!res.ok || !destino) { toast.error(data.error ?? error); return; }
  window.location.href = destino;
}

export default function PlanTab() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectingMP, setRedirectingMP] = useState(false);
  const [now] = useState(() => Date.now());
  const [, setCompararAbierto] = useLocalStorage<boolean>(CLAVE_COMPARAR, false);

  // Al volver del checkout de Mercado Pago: aviso y se limpia el parámetro de la URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp_status");
    if (mpStatus === "approved") toast.success("Pago con Mercado Pago aprobado", { description: "Tu plan se actualiza en breve." });
    else if (mpStatus === "pending") toast("Pago pendiente", { description: "Te avisamos cuando se confirme." });
    else if (mpStatus === "failure") toast.error("El pago con Mercado Pago no se completó", { description: "Prueba de nuevo." });
    if (mpStatus) {
      const cleanUrl = window.location.pathname + (window.location.search.replace(/[?&]mp_status=[^&]*/g, "").replace(/^&/, "?") || "");
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: PlanStatus) => setStatus(data))
      .catch(() => toast.error("No se pudo cargar tu plan"))
      .finally(() => setLoading(false));
  }, []);

  const pagar = async (planId: PlanId, medio: "stripe" | "mp") => {
    const set = medio === "stripe" ? setRedirecting : setRedirectingMP;
    set(true);
    try {
      if (medio === "stripe") await irAlPago("/api/billing/checkout", { plan: planId }, "url", "No se pudo iniciar el pago");
      else await irAlPago("/api/billing/mp-checkout", { plan: planId }, "init_point", "No se pudo iniciar el pago con Mercado Pago");
    } catch {
      toast.error("Error de red. Prueba de nuevo.");
    } finally {
      set(false);
    }
  };

  const abrirPortal = async () => {
    setRedirecting(true);
    try { await irAlPago("/api/billing/portal", null, "url", "No se pudo abrir el portal de facturación"); }
    catch { toast.error("Error de red. Prueba de nuevo."); }
    finally { setRedirecting(false); }
  };

  const verPlanes = () => {
    setCompararAbierto(true);
    setTimeout(() => document.getElementById("plan-comparar")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  if (loading) return <LoadingState />;

  if (!status) {
    return (
      <p role="alert" className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden /> No se pudo cargar la información de tu plan.
      </p>
    );
  }

  const { plan, planDef, limits, usage, tenant } = status;
  const trialDaysLeft = tenant.trialEndsAt ? Math.ceil((new Date(tenant.trialEndsAt).getTime() - now) / 86400000) : null;
  const trialActive = trialDaysLeft !== null && trialDaysLeft > 0;
  const faltan = FUNCIONALIDADES.filter((f) => !limits[f.clave]);
  const incluye = FUNCIONALIDADES.filter((f) => limits[f.clave]);
  const puedeMejorar = PLAN_ORDER.indexOf(plan as PlanId) < PLAN_ORDER.length - 1;
  const conPortal = plan !== "free" && Boolean(tenant.stripeCustomerId);
  const dominio = tenant.customDomain ?? null;
  const setDominio = (d: string | null) => setStatus((prev) => (prev ? { ...prev, tenant: { ...prev.tenant, customDomain: d } } : prev));

  return (
    <div className="space-y-4">
      {trialActive && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-semibold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/20">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Período de prueba: te quedan {trialDaysLeft} día{trialDaysLeft !== 1 ? "s" : ""}
          <InfoTip title="Período de prueba" what="Mejora tu plan antes de que venza para no perder el acceso." />
        </p>
      )}

      {/* Tu plan: qué tienes, cuánto usaste, qué te falta y el botón. */}
      <section aria-label="Tu plan" className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-soft)] px-4 py-2.5 sm:px-5 dark:border-[var(--rule-base)]">
          <Zap className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <CardTitle className="text-base font-bold">Tu plan: {planDef.name}</CardTitle>
          <span className="rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-sm font-bold text-[var(--text-primary)]">{precioPlan(planDef)}</span>
          <InfoTip title="Tu plan" what={`Tienda: ${tenant.name ?? tenant.slug}. El uso cuenta los productos y usuarios de hoy y los pedidos de este mes.`} />
          <div className="ml-auto flex flex-wrap gap-2">
            {conPortal && (
              <button type="button" onClick={abrirPortal} disabled={redirecting} title="Cambia tu método de pago, descarga facturas o cancela" className={button({ variant: "secondary", className: "rounded-xl" })}>
                {redirecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}
                Facturación
              </button>
            )}
            {puedeMejorar && (
              <button type="button" onClick={verPlanes} className={button({ variant: "primary", className: "rounded-xl" })}>
                <ArrowUpRight className="h-4 w-4" aria-hidden /> Mejorar plan
              </button>
            )}
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <UsageBar label="Productos" icon={<ShoppingBag className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />} used={usage.products} max={limits.maxProducts} />
            <UsageBar label="Usuarios" icon={<Users className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />} used={usage.users} max={limits.maxUsers} />
            <UsageBar label="Pedidos del mes" icon={<ShoppingCart className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />} used={usage.ordersThisMonth} max={limits.maxOrdersPerMonth} />
          </div>
          {faltan.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span><span className="font-semibold text-[var(--text-primary)]">Te falta:</span> {faltan.map((f) => f.label).join(" · ")}</span>
            </p>
          )}
          {faltan.length === 0 && incluye.length > 0 && (
            <p className="text-sm text-[var(--data-success-ink)]">Tu plan incluye todo: {incluye.map((f) => f.label).join(" · ")}</p>
          )}
        </div>
      </section>

      <div id="plan-comparar" className="scroll-mt-24">
        <Plegable
          clave={CLAVE_COMPARAR}
          titulo="Comparar planes"
          resumen={`${PLAN_ORDER.length} planes · paga con tarjeta o con Yape, BCP y Mercado Pago`}
          acciones={<InfoTip title="Cómo pagar tu plan" what="Paga con tarjeta (Stripe) o con Mercado Pago (Yape, BCP, Plin y más)." />}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PLAN_ORDER.map((id) => PLANS[id]).map((def) => (
              <PlanCard
                key={def.id}
                def={def}
                isActive={def.id === plan}
                onSelectStripe={() => pagar(def.id, "stripe")}
                onSelectMP={() => pagar(def.id, "mp")}
                loadingStripe={redirecting}
                loadingMP={redirectingMP}
              />
            ))}
          </div>
          {(redirecting || redirectingMP) && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {redirecting ? "Te llevamos a pagar con tarjeta…" : "Te llevamos a Mercado Pago…"}
            </p>
          )}
        </Plegable>
      </div>

      <Plegable
        clave="ajustes-plegable-plan-dominio"
        titulo="Dominio propio"
        resumen={dominio ?? (limits.customDomain ? "Sin configurar · www.mitienda.com" : `Desde el plan ${PRIMERO_CON_DOMINIO?.name ?? "Starter"}`)}
      >
        {limits.customDomain ? (
          <DominioPropio dominio={dominio} onDominio={setDominio} />
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            Tu tienda con tu propia dirección (www.mitienda.com) viene desde el plan {PRIMERO_CON_DOMINIO?.name ?? "Starter"}.
            {puedeMejorar && <button type="button" onClick={verPlanes} className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">Ver planes</button>}
          </p>
        )}
      </Plegable>
    </div>
  );
}
