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
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Store } from "@buleje/design-system/icons";
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
        headers: { "Content-Type": "application/json" },
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
    <div className="min-h-screen bg-[var(--surface-raised)]">
      {/* Top bar simple — solo logo + exit */}
      <header className="sticky top-0 z-40 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/vender"
            className="flex items-center gap-2 text-[var(--text-primary)]"
            aria-label="Volver al inicio"
          >
            <BulejeWordmark size={28} strokeWidth={1.75} textSize={16} />
            <span className="hidden text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] sm:inline">
              Seller
            </span>
          </Link>
          <Link
            href="/vender"
            className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Salir del registro
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,_1fr)_280px]">
          {/* ── Contenido paso ── */}
          <div className="order-2 space-y-6 lg:order-1">
            <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 sm:p-8">
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
              <div className="rounded-xl border border-[var(--data-error)] bg-[var(--data-error)]/5 px-4 py-3 text-sm text-[var(--data-error)]">
                {submitError}
              </div>
            )}

            {/* Nav buttons */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBack}
                disabled={step === 1 || submitting}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Atrás
              </button>
              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2 text-sm font-bold text-[var(--surface-canvas)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <Store className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      Enviar solicitud
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2 text-sm font-bold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
                >
                  Siguiente
                  <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* ── Stepper rail ── */}
          <aside className="order-1 lg:order-2">
            <div className="sticky top-20 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5">
              <WizardStepNav
                current={step}
                highestCompleted={highestCompleted}
                onNavigate={handleNavigate}
              />
              <div className="mt-5 border-t border-[var(--rule-base)] pt-4">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                  En este paso
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {currentStepMeta.label}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
