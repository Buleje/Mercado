"use client";

/**
 * TrialExpiredGuard — bloquea el panel admin cuando:
 *   - plan === "free"
 *   - trialEndsAt en el pasado
 *   - sin subscripción pagada (stripeCustomerId/mpSubscriptionId null)
 *
 * Renderiza una pantalla "Trial terminado" con CTAs a los planes de
 * Stripe / Mercado Pago. El acceso se restablece cuando se paga o el
 * superadmin habilita manualmente el tenant (active=true + plan no-free
 * o trialEndsAt extendido).
 *
 * El componente envuelve el panel:
 *
 *   <TrialExpiredGuard>
 *     <AdminUI ... />
 *   </TrialExpiredGuard>
 *
 * Mientras el guard carga el plan, renderiza children (no flicker). Si el
 * fetch falla, también renderiza children — el guard no debe bloquear
 * por errores de red.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Sparkles, ArrowRight, CheckCircle2, ShoppingCart } from "@buleje/design-system/icons";
import { PageTitle, CardTitle } from "@buleje/design-system";
import { cachedJson } from "@/lib/client-cache-fetch";

// MODO GRACIA 2026-07-08 (decisión Brandon, reporte ventas-caja bug 1): aunque
// el trial expire, el TILL sigue operativo — una bodega real necesita seguir
// cobrando en el mostrador. Estos son los `tab` top-level que renderean el
// Punto de Venta / Turnos / Caja / Cuadre (POSCajaModule). El resto del panel
// (productos, reportes, etc.) sí queda bloqueado hasta activar un plan.
const TILL_TABS = new Set(["ventas-caja", "turnos"]);

interface PlanResponse {
  plan: string;
  tenant: {
    trialEndsAt: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId?: string | null;
    mpSubscriptionId?: string | null;
  };
}

type Status = "loading" | "ok" | "expired";

export function TrialExpiredGuard({
  children,
  activeTab,
}: {
  children: React.ReactNode;
  /** `tab` top-level activo del panel. Si es un tab del till, en modo gracia
   *  se deja operar (con banner) en vez de bloquear la pantalla completa. */
  activeTab?: string;
}) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    // cachedJson: comparte 1 sola /api/plan con TrialCountdownBannerLoader +
    // demás consumidores (antes cada uno disparaba la suya). Perf 2026-05-29.
    cachedJson<PlanResponse>("/api/plan", 60_000)
      .then((j) => {
        if (cancelled) return;
        if (!j) {
          setStatus("ok");
          return;
        }
        const hasPaidPlan = j.plan && j.plan !== "free";
        const hasSub = !!(j.tenant.stripeSubscriptionId || j.tenant.mpSubscriptionId);
        const trialEnd = j.tenant.trialEndsAt ? new Date(j.tenant.trialEndsAt).getTime() : null;
        const trialActive = trialEnd !== null && trialEnd > Date.now();
        if (hasPaidPlan || hasSub || trialActive) {
          setStatus("ok");
        } else {
          setStatus("expired");
        }
      })
      .catch(() => setStatus("ok"));
    return () => { cancelled = true; };
  }, []);

  if (status !== "expired") return <>{children}</>;

  // MODO GRACIA: si el usuario está en un tab del till, dejamos operar el POS
  // con un banner persistente en vez de bloquear todo. El resto de tabs ven la
  // pantalla de trial terminado (con un CTA para saltar al POS).
  if (activeTab && TILL_TABS.has(activeTab)) {
    return (
      <>
        <TrialGraceBanner />
        {children}
      </>
    );
  }
  return <TrialExpiredScreen />;
}

/**
 * Banner rojo persistente que corona el panel mientras el trial está expirado
 * pero el till sigue operativo (modo gracia). No es descartable a propósito.
 */
function TrialGraceBanner() {
  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[var(--data-error-500)] px-4 py-2 text-center text-white">
      <span className="inline-flex items-center gap-2 text-sm font-bold">
        <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        Trial expirado — podés seguir vendiendo.
      </span>
      <span className="text-sm text-white/90">
        Activá tu plan para recuperar el panel completo.
      </span>
      <Link
        href="/admin?tab=plan"
        className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/25"
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
        Activar plan
      </Link>
    </div>
  );
}

function TrialExpiredScreen() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--data-error-500)]/10">
          <ShieldAlert className="h-8 w-8 text-[var(--data-error-500)]" strokeWidth={2.25} />
        </div>

        <PageTitle className="text-center">Tu período de prueba ha terminado</PageTitle>
        <p className="mt-3 max-w-xl text-center text-base text-[var(--text-secondary)]">
          Los 15 días gratuitos para probar Buleje se agotaron. Para seguir
          gestionando tu negocio, elegí un plan o esperá a que el equipo de
          soporte habilite tu cuenta manualmente.
        </p>

        <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <PlanCard
            name="Pro"
            price="S/ 179"
            period="/mes"
            tagline="Sweet spot: bodega establecida que ya vende online"
            features={[
              "Productos ilimitados · 2 sucursales · 5 admins",
              "SUNAT facturacion + cotizaciones",
              "Promociones, fidelizacion y chat",
              "Marketplace destacado",
            ]}
            highlighted
          />
          <PlanCard
            name="Business"
            price="S/ 349"
            period="/mes"
            tagline="Cadenas, productores y mayoristas · sin limites"
            features={[
              "Sucursales y admins ilimitados",
              "Forecasting IA + sugerencias",
              "Lives streaming + ventas en vivo",
              "Soporte 24/7 con account manager",
            ]}
          />
        </div>

        {/* MODO GRACIA (bug 1): la caja física nunca se congela — desde la
            pantalla de bloqueo se puede saltar al Punto de Venta y seguir
            cobrando. Al entrar a ?tab=ventas-caja el guard muestra el POS con
            el banner de gracia en vez de esta pantalla. */}
        <a
          href="/admin?tab=ventas-caja"
          className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-[var(--data-success-500)] bg-[var(--accent-soft)] px-6 py-3 text-sm font-bold text-[var(--data-success-500)] transition-all hover:scale-[1.02]"
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
          Seguir vendiendo en el Punto de Venta
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
        </a>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/admin?tab=plan"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.25} />
            Ver todos los planes
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Link>
          <a
            href="https://wa.me/51929340532?text=Hola+Buleje%2C+mi+trial+termin%C3%B3+y+quiero+activar+un+plan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-strong)] bg-[var(--surface-raised)] px-6 py-3 text-sm font-bold text-[var(--text-primary)] transition-all hover:bg-[var(--surface-sunken)]"
          >
            Hablar por WhatsApp
          </a>
        </div>

        <p className="mt-8 text-center text-xs text-[var(--text-tertiary)]">
          Tus datos están seguros — no se borrará nada. Cuando actives un plan
          recuperarás el acceso completo al panel.
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  name, price, period, tagline, features, highlighted,
}: {
  name: string; price: string; period: string; tagline: string;
  features: string[]; highlighted?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border-2 p-6 ${
        highlighted
          ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-lg"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
          Recomendado
        </span>
      )}
      <CardTitle>{name}</CardTitle>
      <p className="mt-1 text-xs font-semibold text-[var(--text-tertiary)]">{tagline}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-[var(--text-primary)]">{price}</span>
        <span className="text-sm font-semibold text-[var(--text-tertiary)]">{period}</span>
      </div>
      <ul className="mt-4 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-500)]" strokeWidth={2.25} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
