"use client";

/**
 * app/admin/plan/checkout/PlanCheckoutClient.tsx
 *
 * Checkout de upgrade de plan. Flujo:
 *   1. Lee `?plan=` de la URL — si inválido, fallback al básico.
 *   2. Muestra resumen (precio, features) + selector de método de pago.
 *   3. Al "confirmar pago":
 *      - Stripe → llama API `/api/admin/plan/checkout/stripe-session` (mock)
 *        y redirige a Stripe Checkout. Webhook activa el plan.
 *      - Yape/Plin → muestra QR + N° celular destino. El dueño paga y aprieta
 *        "Confirmé el pago" → backend valida (en producción debería verificar
 *        contra historial Yape; aquí simulamos con un endpoint mock).
 *      - Transferencia → muestra cuenta bancaria + permite subir comprobante.
 *      - Efectivo → "Coordinaremos con vos por WhatsApp" (manual, no auto-activa).
 *   4. Al activar el plan: `setCurrentPlan(next)` → sidebar reordena tabs sin reload.
 *
 * Persistencia mock: por ahora el plan se activa localmente (localStorage).
 * En producción, el webhook Stripe actualiza Tenant.plan en la DB.
 */

import { useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Rocket,
  Sparkles,
  Zap,
  ShieldCheck,
  CreditCard,
  Wallet,
  Banknote,
  Building2,
  Loader2,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setCurrentPlan } from "@/lib/billing/plan-tiers";
import {
  PLANS,
  PLAN_ORDER,
  type PlanTier,
} from "@/lib/billing/plan-tiers";

const PLAN_ICONS: Record<PlanTier, typeof Sparkles> = {
  basico: Sparkles,
  pro: Zap,
  enterprise: Rocket,
  max: Crown,
};

const PLAN_HIGHLIGHTS: Record<PlanTier, readonly string[]> = {
  basico: [
    "POS digital y pedidos",
    "Hasta 50 productos",
    "Mi tienda online básica",
  ],
  pro: [
    "Productos ilimitados",
    "Facturación SUNAT (boletas + facturas)",
    "Compras y contratos a proveedor",
    "Analytics Pro + control de tesorería",
    "Marketplace y delivery integrado",
  ],
  enterprise: [
    "Todo lo de Pro + IA Command Center",
    "Forecasting y sugerencias IA",
    "Multi-sucursal (hasta 10)",
    "Subscriptions, gift cards, programa Socio",
    "API y webhooks personalizados",
  ],
  max: [
    "Todo desbloqueado, sin límites",
    "Lives streaming en vivo",
    "White-label / dominio propio",
    "Soporte prioritario 24/7",
  ],
};

type PaymentMethod = "stripe" | "yape" | "plin" | "transfer" | "cash";

interface PaymentMethodMeta {
  id: PaymentMethod;
  label: string;
  desc: string;
  icon: typeof Sparkles;
  recommended?: boolean;
  badge?: string;
}

const METHODS: PaymentMethodMeta[] = [
  {
    id: "yape",
    label: "Yape",
    desc: "Escaneá el QR · activación al confirmar",
    icon: Wallet,
    recommended: true,
    badge: "Más usado",
  },
  {
    id: "plin",
    label: "Plin",
    desc: "Pagás con BCP, Interbank o Scotia",
    icon: Wallet,
  },
  {
    id: "stripe",
    label: "Tarjeta de crédito/débito",
    desc: "Visa · Mastercard · Amex · vía Stripe seguro",
    icon: CreditCard,
  },
  {
    id: "transfer",
    label: "Transferencia bancaria",
    desc: "BCP · Interbank · BBVA · subí el voucher",
    icon: Building2,
  },
  {
    id: "cash",
    label: "Efectivo / coordinar",
    desc: "Te llamamos por WhatsApp para coordinar",
    icon: Banknote,
  },
];

const VALID_PLANS = new Set<PlanTier>(["basico", "pro", "enterprise", "max"]);

export default function PlanCheckoutClient() {
  const router = useRouter();
  const params = useSearchParams();
  const rawPlan = params.get("plan") ?? "pro";
  const targetPlan: PlanTier = VALID_PLANS.has(rawPlan as PlanTier)
    ? (rawPlan as PlanTier)
    : "pro";

  const planDef = PLANS[targetPlan];
  const Icon = PLAN_ICONS[targetPlan];

  const [method, setMethod] = useState<PaymentMethod>("yape");
  const [step, setStep] = useState<"select" | "pay" | "success">("select");
  const [submitting, setSubmitting] = useState(false);
  const [voucher, setVoucher] = useState<File | null>(null);

  // Si llega con plan=basico (no requiere pago), redirige a Config
  useEffect(() => {
    if (targetPlan === "basico") {
      router.replace("/admin?tab=config");
    }
  }, [targetPlan, router]);

  // En producción: descontar IGV / cupón / mostrar prorrateo. Por ahora monto plano.
  const total = useMemo(() => planDef.price, [planDef.price]);

  const handleProceedToPay = () => {
    setStep("pay");
  };

  // Activación del plan tras pago confirmado.
  // En producción: este paso lo hace el webhook Stripe / verificación Yape
  // contra histórico de pagos. Acá simulamos con un endpoint mock para
  // que el flow se sienta real.
  const activatePlan = async () => {
    setSubmitting(true);
    try {
      // SECURITY 2026-05-05 (audit Stripe #5): solo actualizar UI si el
      // backend confirmó la activación. Antes setCurrentPlan se llamaba
      // siempre (incluso con confirm 5xx) → usuario veía plan activo cuando
      // realmente seguía en free.
      const res = await fetch("/api/admin/plan/checkout/confirm", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ plan: targetPlan, method }),
        credentials: "include",
      }).catch(() => null);
      if (res && res.ok) {
        setCurrentPlan(targetPlan);
        setStep("success");
      } else {
        alert("No pudimos confirmar la activación. Intentá nuevamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (method === "cash") {
      // Efectivo no auto-activa. Mostramos pantalla de "te contactamos".
      setStep("success");
      return;
    }
    if (method === "stripe") {
      // Crea Stripe Checkout Session en backend y redirige a la URL.
      // El webhook `checkout.session.completed` activa el plan en DB.
      setSubmitting(true);
      try {
        const res = await fetch("/api/admin/plan/checkout/stripe-session", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ plan: targetPlan }),
          credentials: "include",
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? "No se pudo iniciar el checkout");
        }
        window.location.href = data.url;
      } catch (err) {
        setSubmitting(false);
        alert(
          err instanceof Error
            ? err.message
            : "Error al iniciar Stripe. Intentá otra vez.",
        );
      }
      return;
    }
    // Yape/Plin/Transfer: el dueño hace el pago manualmente y confirma.
    await activatePlan();
  };

  if (targetPlan === "basico") return null;

  // ── Pantalla de éxito ────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="min-h-screen bg-[var(--surface-sunken)] flex items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full">
          <div className="rounded-3xl border-2 border-[var(--data-success-500)]/30 bg-[var(--surface-canvas)] p-8 sm:p-10 shadow-md text-center">
            <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]">
              <Check className="h-10 w-10" strokeWidth={3} />
            </div>
            <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-500)]">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              {method === "cash" ? "Solicitud recibida" : "¡Plan activado!"}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
              {method === "cash" ? (
                <>Te contactamos por <span className="text-[var(--accent)]">WhatsApp</span></>
              ) : (
                <>Bienvenido a <span className="text-[var(--accent)]">{planDef.label}</span></>
              )}
            </h1>
            <p className="mt-3 text-base text-[var(--text-secondary)]">
              {method === "cash"
                ? "Un agente te escribirá en menos de 2 horas para coordinar el pago en efectivo y activar tu plan."
                : `Tu panel ya tiene desbloqueados los ${planDef.unlockedTabs.size} módulos del plan ${planDef.label}. Ingresá a tu panel para empezar.`}
            </p>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/admin?tab=config"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 text-sm font-bold text-[var(--text-primary)] transition-all hover:border-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
              >
                Volver a Config
              </Link>
              <Link
                href="/admin?tab=vendor-dashboard"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-black text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
              >
                Ir al panel
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Layout del checkout ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/admin?tab=config"
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
            Volver
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 px-3 py-1 text-xs font-bold text-[var(--data-success-500)]">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
            Pago seguro
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--surface-canvas)] to-[var(--surface-sunken)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            <span aria-hidden className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]" />
            Confirmar suscripción
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Subí a <span className="text-[var(--accent)]">{planDef.label}</span> en
            menos de un minuto
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-[var(--text-secondary)]">
            Activá tu plan al confirmar el pago. Cancelás cuando quieras, sin permanencia.
          </p>
        </div>
      </section>

      {/* Layout 2 cols: form + resumen */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,_1fr)_360px] lg:gap-8">
          {/* ── Form ───────────────────────────────────────────────── */}
          <div className="order-2 lg:order-1 space-y-5">
            {step === "select" && (
              <>
                {/* Selector de método */}
                <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 sm:p-8 shadow-sm">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-base font-black text-white shadow-sm">
                      1
                    </span>
                    <div>
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                        Paso 1
                      </p>
                      <h2 className="mt-1 text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                        Elegí cómo pagar
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {METHODS.map((m) => {
                      const active = method === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMethod(m.id)}
                          aria-pressed={active}
                          className={cn(
                            "w-full flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all",
                            active
                              ? "border-[var(--accent)] bg-primary/10 shadow-sm"
                              : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)]",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                              active
                                ? "bg-[var(--accent-600,var(--accent))] text-white"
                                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                            )}
                          >
                            <m.icon className="h-5 w-5" strokeWidth={2.25} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-black text-[var(--text-primary)]">
                                {m.label}
                              </p>
                              {m.recommended && (
                                <span className="inline-flex rounded-full bg-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-white">
                                  {m.badge}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                              {m.desc}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                              active
                                ? "border-[var(--accent)] bg-[var(--accent)]"
                                : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
                            )}
                          >
                            {active && (
                              <Check
                                className="h-3.5 w-3.5 text-white"
                                strokeWidth={3}
                              />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleProceedToPay}
                    className="mt-6 inline-flex w-full h-14 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-black text-white shadow-md transition-all hover:scale-[1.01] hover:shadow-lg"
                  >
                    Continuar con {METHODS.find((m) => m.id === method)?.label}
                    <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>
              </>
            )}

            {step === "pay" && (
              <PayInstructions
                method={method}
                planLabel={planDef.label}
                amount={total}
                voucher={voucher}
                onVoucherChange={setVoucher}
                submitting={submitting}
                onConfirm={handleConfirmPayment}
                onBack={() => setStep("select")}
              />
            )}
          </div>

          {/* ── Resumen del plan ──────────────────────────────────── */}
          <aside className="order-1 lg:order-2">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-3xl border-2 border-[var(--accent)]/25 bg-[var(--surface-canvas)] p-6 shadow-sm">
                <p className="mb-3 inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] rounded-full bg-primary/10 border-2 border-[var(--accent)]/25 px-2.5 py-1">
                  <Icon className="h-3 w-3" strokeWidth={2.5} />
                  Plan {planDef.label}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {planDef.tagline}
                </p>
                <div className="mt-4 pt-4 border-t-2 border-[var(--rule-base)]">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
                      {planDef.price}
                    </span>
                    <span className="text-sm font-bold text-[var(--text-tertiary)]">
                      {planDef.period}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold text-[var(--text-secondary)]">
                    {planDef.unlockedTabs.size} módulos · sin permanencia
                  </p>
                </div>

                <ul className="mt-5 space-y-2.5 pt-5 border-t-2 border-[var(--rule-base)]">
                  {PLAN_HIGHLIGHTS[targetPlan].map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <Check
                        className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--accent)]"
                        strokeWidth={3}
                      />
                      <span className="leading-tight">{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 pt-5 border-t-2 border-[var(--rule-base)]">
                  <div className="flex items-center justify-between text-sm font-bold text-[var(--text-secondary)]">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{planDef.price}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-base font-black text-[var(--text-primary)]">
                    <span>Total a pagar</span>
                    <span className="tabular-nums text-2xl text-[var(--accent)]">
                      {planDef.price}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                <ShieldCheck
                  className="h-4 w-4 mt-0.5 shrink-0 text-[var(--data-success-500)]"
                  strokeWidth={2.5}
                />
                <span>
                  <strong className="text-[var(--text-primary)]">
                    Sin permanencia.
                  </strong>{" "}
                  Cancelás cuando quieras desde Config → Plan. Activación
                  automática al confirmar el pago.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ── Sub-componente: instrucciones por método de pago ──────────────────────

interface PayInstructionsProps {
  method: PaymentMethod;
  planLabel: string;
  amount: string;
  voucher: File | null;
  onVoucherChange: (f: File | null) => void;
  submitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

function PayInstructions({
  method,
  planLabel,
  amount,
  voucher,
  onVoucherChange,
  submitting,
  onConfirm,
  onBack,
}: PayInstructionsProps) {
  return (
    <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 sm:p-8 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-base font-black text-white shadow-sm">
          2
        </span>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
            Paso 2
          </p>
          <h2 className="mt-1 text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            {method === "stripe"
              ? "Pagá con tarjeta"
              : method === "yape" || method === "plin"
                ? `Pagá con ${method === "yape" ? "Yape" : "Plin"}`
                : method === "transfer"
                  ? "Transferencia bancaria"
                  : "Coordinamos por WhatsApp"}
          </h2>
        </div>
      </div>

      {/* ── Yape / Plin ──────────────────────────────────────── */}
      {(method === "yape" || method === "plin") && (
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5 text-center">
            <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
              Escaneá este QR desde {method === "yape" ? "Yape" : "Plin"}
            </p>
            <div className="mx-auto h-44 w-44 rounded-2xl bg-[var(--text-primary)] flex items-center justify-center text-white text-xs font-bold p-4">
              QR placeholder · {method === "yape" ? "Yape" : "Plin"}
              <br />
              {amount}
            </div>
            <p className="mt-4 text-sm font-bold text-[var(--text-primary)]">
              o pagá al número{" "}
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[var(--accent)] font-black">
                929 340 532
              </span>
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              A nombre de <strong>Buleje SAC</strong>
            </p>
          </div>
          <ol className="space-y-2 text-sm font-semibold text-[var(--text-primary)]">
            <li className="flex gap-3">
              <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white text-xs font-black">
                1
              </span>
              Pagá <strong>{amount}</strong> con el QR o número
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white text-xs font-black">
                2
              </span>
              Apretá &ldquo;Ya pagué&rdquo; abajo. Verificamos en menos de 5 min.
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white text-xs font-black">
                3
              </span>
              Tu plan {planLabel} se activa automáticamente.
            </li>
          </ol>
        </div>
      )}

      {/* ── Stripe ──────────────────────────────────────────── */}
      {method === "stripe" && (
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Te llevamos a la pasarela segura de{" "}
              <strong className="text-[var(--text-primary)]">Stripe</strong> para
              completar el pago con tu tarjeta. Acepta Visa, Mastercard, Amex y
              Diners.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--text-tertiary)]">
              <ShieldCheck className="h-4 w-4 text-[var(--data-success-500)]" strokeWidth={2.5} />
              Encriptación 256-bit · PCI DSS · Stripe nunca comparte tus datos
            </div>
          </div>
        </div>
      )}

      {/* ── Transferencia ───────────────────────────────────── */}
      {method === "transfer" && (
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5 space-y-3">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Cuenta BCP soles
              </p>
              <p className="mt-1 font-mono text-sm font-black text-[var(--text-primary)]">
                194-2456789-0-12
              </p>
            </div>
            <div className="pt-3 border-t-2 border-[var(--rule-base)]">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Interbancario CCI
              </p>
              <p className="mt-1 font-mono text-sm font-black text-[var(--text-primary)]">
                002-194-002456789012-34
              </p>
            </div>
            <div className="pt-3 border-t-2 border-[var(--rule-base)]">
              <p className="text-xs text-[var(--text-secondary)]">
                A nombre de <strong>Buleje SAC</strong> · RUC <strong>20612345678</strong>
              </p>
            </div>
          </div>
          <div>
            <label className="block mb-2 text-sm font-bold text-[var(--text-primary)]">
              Subí el voucher de tu transferencia
            </label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => onVoucherChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm font-semibold text-[var(--text-primary)] file:mr-4 file:rounded-xl file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white"
            />
            {voucher && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Listo: <strong>{voucher.name}</strong> ({Math.round(voucher.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Efectivo ────────────────────────────────────────── */}
      {method === "cash" && (
        <div className="space-y-5">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5 flex items-start gap-3">
            <Phone className="h-5 w-5 mt-0.5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
            <div className="text-sm leading-relaxed text-[var(--text-primary)]">
              Apretá <strong>&ldquo;Solicitar contacto&rdquo;</strong> y un agente
              te escribirá por WhatsApp en menos de 2 horas para coordinar el pago
              en efectivo. Una vez recibido el monto, activamos tu plan{" "}
              <strong className="text-[var(--accent)]">{planLabel}</strong>.
            </div>
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 text-sm font-bold text-[var(--text-primary)] transition-all hover:border-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Volver
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={
            submitting || (method === "transfer" && !voucher)
          }
          className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-black text-white shadow-md transition-all hover:scale-[1.01] hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
              Procesando…
            </>
          ) : method === "stripe" ? (
            <>
              Ir a Stripe
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </>
          ) : method === "cash" ? (
            <>
              Solicitar contacto
              <Phone className="h-4 w-4" strokeWidth={2.5} />
            </>
          ) : method === "transfer" ? (
            <>
              Confirmar transferencia
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </>
          ) : (
            <>
              Ya pagué — activar mi plan
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
