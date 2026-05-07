"use client";

/**
 * RegistroClient — wizard vendor 5 pasos completo.
 *
 * Flujo:
 *   1. Datos del negocio (StepDatosNegocio)
 *   2. Contacto (StepContacto)
 *   3. Verificación (StepVerificacion)
 *   4. Horarios y delivery (StepHorariosDelivery)
 *   5. Plan (StepPlan)
 *   → Submit a /api/vendor/registration → redirige a /vender/registro/completo
 *
 * Persistencia local: localStorage key "buleje:vendor-registration:v1" para
 * que el usuario no pierda el progreso si recarga el navegador.
 */

import { useCallback, useMemo, useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Store } from "@buleje/design-system/icons";
import { Check, ShieldCheck, Zap, BadgeCheck, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  datosNegocioSchema,
  contactoSchema,
  verificacionSchema,
  horariosDeliverySchema,
  planSchema,
  vendorRegistrationSchema,
  defaultRegistrationState,
  type DatosNegocioForm,
  type ContactoForm,
  type VerificacionForm,
  type HorariosDeliveryForm,
  type PlanForm,
} from "@/lib/validators/vendor-registration";
import WizardStepNav, {
  WIZARD_STEPS,
  type WizardStep,
} from "@/components/vender/registro/WizardStepNav";
import StepDatosNegocio from "@/components/vender/registro/StepDatosNegocio";
import StepContacto from "@/components/vender/registro/StepContacto";
import StepVerificacion from "@/components/vender/registro/StepVerificacion";
import StepHorariosDelivery from "@/components/vender/registro/StepHorariosDelivery";
import StepPlan from "@/components/vender/registro/StepPlan";
import { BulejeWordmark } from "@/components/ui-system/illustrations";

const STORAGE_KEY = "buleje:vendor-registration:v1";

type WizardState = ReturnType<typeof defaultRegistrationState>;

type StepErrors = {
  datosNegocio: Partial<Record<keyof DatosNegocioForm, string>>;
  contacto: Partial<Record<keyof ContactoForm, string>>;
  verificacion: Partial<Record<keyof VerificacionForm, string>>;
  horariosDelivery: Partial<Record<keyof HorariosDeliveryForm, string>>;
  plan: Partial<Record<keyof PlanForm, string>>;
};

function emptyErrors(): StepErrors {
  return {
    datosNegocio: {},
    contacto: {},
    verificacion: {},
    horariosDelivery: {},
    plan: {},
  };
}

export default function RegistroClient() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep["n"]>(1);
  const [highestCompleted, setHighestCompleted] = useState<WizardStep["n"] | 0>(0);
  const [state, setState] = useState<WizardState>(() => defaultRegistrationState());
  const [errors, setErrors] = useState<StepErrors>(emptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Hydrate draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WizardState;
        if (parsed && typeof parsed === "object") {
          setState((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist draft on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  // ── Validators ────────────────────────────────────────────────────────────
  const validateStep = useCallback(
    (n: WizardStep["n"]): boolean => {
      const fieldErrors: Partial<Record<string, string>> = {};
      let ok = false;

      if (n === 1) {
        const result = datosNegocioSchema.safeParse(state.datosNegocio);
        ok = result.success;
        if (!ok && !result.success) {
          for (const issue of result.error.issues) {
            const key = issue.path[0] as string;
            fieldErrors[key] = issue.message;
          }
        }
        setErrors((e) => ({ ...e, datosNegocio: fieldErrors }));
      } else if (n === 2) {
        const result = contactoSchema.safeParse(state.contacto);
        ok = result.success;
        if (!ok && !result.success) {
          for (const issue of result.error.issues) {
            fieldErrors[issue.path[0] as string] = issue.message;
          }
        }
        setErrors((e) => ({ ...e, contacto: fieldErrors }));
      } else if (n === 3) {
        const result = verificacionSchema.safeParse(state.verificacion);
        ok = result.success;
        if (!ok && !result.success) {
          for (const issue of result.error.issues) {
            fieldErrors[issue.path[0] as string] = issue.message;
          }
        }
        setErrors((e) => ({ ...e, verificacion: fieldErrors }));
      } else if (n === 4) {
        const result = horariosDeliverySchema.safeParse(state.horariosDelivery);
        ok = result.success;
        if (!ok && !result.success) {
          for (const issue of result.error.issues) {
            fieldErrors[issue.path[0] as string] = issue.message;
          }
        }
        setErrors((e) => ({ ...e, horariosDelivery: fieldErrors }));
      } else if (n === 5) {
        const result = planSchema.safeParse(state.plan);
        ok = result.success;
        if (!ok && !result.success) {
          for (const issue of result.error.issues) {
            fieldErrors[issue.path[0] as string] = issue.message;
          }
        }
        setErrors((e) => ({ ...e, plan: fieldErrors }));
      }

      return ok;
    },
    [state],
  );

  const handleNext = useCallback(() => {
    if (!validateStep(step)) return;
    setHighestCompleted((prev) => (step > prev ? step : prev));
    if (step < 5) {
      setStep((s) => (s + 1) as WizardStep["n"]);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [step, validateStep]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      setStep((s) => (s - 1) as WizardStep["n"]);
    }
  }, [step]);

  const handleNavigate = useCallback(
    (target: WizardStep["n"]) => {
      if (target <= highestCompleted + 1) {
        setStep(target);
      }
    },
    [highestCompleted],
  );

  const handleSubmit = useCallback(async () => {
    // Validate everything one more time
    if (!validateStep(5)) return;
    const full = vendorRegistrationSchema.safeParse({
      datosNegocio: state.datosNegocio,
      contacto: state.contacto,
      verificacion: state.verificacion,
      horariosDelivery: state.horariosDelivery,
      plan: state.plan,
    });
    if (!full.success) {
      setSubmitError("Revisa los datos anteriores, hay campos incompletos.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/vendor/registration", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(full.data),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "No se pudo enviar la solicitud");
      }
      const payload = (await res.json()) as { id: string };
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      const qs = new URLSearchParams({
        id: payload.id,
        nombre: state.datosNegocio.nombreNegocio ?? "",
      });
      router.push(`/vender/registro/completo?${qs.toString()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [state, validateStep, router]);

  // ── Patch handlers por step ───────────────────────────────────────────────
  const patchDatosNegocio = useCallback((patch: Partial<DatosNegocioForm>) => {
    setState((s) => ({ ...s, datosNegocio: { ...s.datosNegocio, ...patch } }));
  }, []);
  const patchContacto = useCallback((patch: Partial<ContactoForm>) => {
    setState((s) => ({ ...s, contacto: { ...s.contacto, ...patch } }));
  }, []);
  const patchVerificacion = useCallback((patch: Partial<VerificacionForm>) => {
    setState((s) => ({ ...s, verificacion: { ...s.verificacion, ...patch } }));
  }, []);
  const patchHorarios = useCallback((patch: Partial<HorariosDeliveryForm>) => {
    setState((s) => ({
      ...s,
      horariosDelivery: { ...s.horariosDelivery, ...patch },
    }));
  }, []);
  const patchPlan = useCallback((patch: Partial<PlanForm>) => {
    setState((s) => ({ ...s, plan: { ...s.plan, ...patch } }));
  }, []);

  const currentStepMeta = useMemo(
    () => WIZARD_STEPS.find((s) => s.n === step)!,
    [step],
  );

  const isLastStep = step === 5;

  return (
    <div className="min-h-screen bg-[var(--surface-sunken)]">
      {/* ── Top bar — logo + trust badges + exit ──────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/vender"
            className="flex items-center gap-2 text-[var(--text-primary)]"
            aria-label="Volver al inicio"
          >
            <BulejeWordmark size={32} strokeWidth={1.75} textSize={18} />
            <span className="hidden rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] sm:inline">
              Seller
            </span>
          </Link>
          <div className="hidden items-center gap-4 md:flex">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
              <ShieldCheck className="h-4 w-4 text-[var(--data-success-500)]" strokeWidth={2.25} />
              Registro 100% gratis
            </span>
            <span className="h-4 w-px bg-[var(--rule-base)]" />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
              <Zap className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
              Activación en 48h
            </span>
          </div>
          <Link
            href="/vender"
            className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
          >
            Salir
          </Link>
        </div>
      </header>

      {/* ── Hero compacto: contexto + reassurance ─────────────────────── */}
      <section className="border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--surface-canvas)] to-[var(--surface-sunken)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
                Sumate al marketplace
              </p>
              <h1 className="text-3xl font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)] sm:text-4xl lg:text-[2.75rem]">
                Registrá tu tienda en <span className="text-[var(--accent)]">5 minutos</span>
              </h1>
              <p className="mt-3 text-base text-[var(--text-secondary)]">
                Publicá productos, recibí pedidos por WhatsApp y sumate a más de
                <strong className="font-bold text-[var(--text-primary)]"> 800 clientes activos</strong> en Pucallpa. Sin tarjeta. Sin permanencia.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 md:hidden">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3 py-1 text-xs font-bold text-[var(--data-success-500)]">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                Gratis
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
                <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
                48h
              </span>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,_1fr)_320px] lg:gap-8">
          {/* ── Contenido paso ──────────────────────────────────────── */}
          <div className="order-2 space-y-5 lg:order-1">
            {/* Stepper mobile + título compacto */}
            <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-sm lg:hidden">
              <WizardStepNav
                current={step}
                highestCompleted={highestCompleted}
                onNavigate={handleNavigate}
              />
            </div>

            {/* Card del formulario — más generoso, mejor contraste */}
            <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 shadow-sm sm:p-8 lg:p-10">
              {/* Eyebrow + step badge */}
              <div className="mb-6 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-base font-black tabular-nums text-white shadow-sm">
                  {step}
                </span>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                    Paso {step} de 5
                  </p>
                  <p className="mt-1 text-base font-black text-[var(--text-primary)]">
                    {currentStepMeta.label}
                  </p>
                </div>
              </div>

              {step === 1 && (
                <StepDatosNegocio
                  value={state.datosNegocio}
                  errors={errors.datosNegocio}
                  onChange={patchDatosNegocio}
                />
              )}
              {step === 2 && (
                <StepContacto
                  value={state.contacto}
                  errors={errors.contacto}
                  onChange={patchContacto}
                />
              )}
              {step === 3 && (
                <StepVerificacion
                  value={state.verificacion}
                  errors={errors.verificacion}
                  onChange={patchVerificacion}
                />
              )}
              {step === 4 && (
                <StepHorariosDelivery
                  value={state.horariosDelivery}
                  errors={errors.horariosDelivery}
                  onChange={patchHorarios}
                />
              )}
              {step === 5 && (
                <StepPlan value={state.plan} onChange={patchPlan} />
              )}
            </div>

            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 px-4 py-3.5 text-sm font-bold text-[var(--data-error-500)]"
              >
                <span aria-hidden className="text-lg">!</span>
                <span>{submitError}</span>
              </div>
            )}

            {/* Botones de navegación — más grandes, mejor jerarquía */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 shadow-sm">
              <button
                type="button"
                onClick={handleBack}
                disabled={step === 1 || submitting}
                className="inline-flex h-12 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 text-sm font-bold text-[var(--text-primary)] transition-all hover:border-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                Atrás
              </button>
              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-sm font-black text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} aria-hidden="true" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                      Enviar solicitud
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-6 text-sm font-black text-[var(--surface-canvas)] shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
                >
                  Siguiente
                  <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* ── Sidebar: stepper + value props + testimonio ─────────── */}
          <aside className="order-1 hidden lg:order-2 lg:block">
            <div className="sticky top-24 space-y-4">
              {/* Stepper desktop */}
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-sm">
                <WizardStepNav
                  current={step}
                  highestCompleted={highestCompleted}
                  onNavigate={handleNavigate}
                />
              </div>

              {/* Value props */}
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-sm">
                <p className="mb-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Por qué Buleje
                </p>
                <ul className="space-y-3">
                  {[
                    { icon: Check, label: "Sin costo de inscripción" },
                    { icon: Check, label: "Comisión solo sobre ventas reales" },
                    { icon: Check, label: "Pagos por Yape, Plin o efectivo" },
                    { icon: Check, label: "Soporte WhatsApp 7 días" },
                    { icon: Check, label: "Cancelás cuando quieras" },
                  ].map((vp) => (
                    <li key={vp.label} className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]">
                        <vp.icon className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {vp.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Testimonio social proof */}
              <div className="rounded-2xl border-2 border-[var(--accent)]/20 bg-[var(--accent-soft)]/30 p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.25} />
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                    Tienda verificada
                  </p>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-[var(--text-primary)]">
                  &ldquo;En el primer mes recibí <strong>32 pedidos</strong> nuevos sin
                  hacer publicidad. Es lo más simple que probé.&rdquo;
                </p>
                <p className="mt-3 text-xs font-bold text-[var(--text-secondary)]">
                  — Don Pepe, Bodega Don Pepe
                </p>
              </div>

              {/* Soporte */}
              <a
                href="https://wa.me/51916409675?text=Hola%2C%20tengo%20una%20duda%20sobre%20el%20registro%20de%20tienda"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    ¿Necesitás ayuda?
                  </p>
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    Escribinos por WhatsApp
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={2.25} />
              </a>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
