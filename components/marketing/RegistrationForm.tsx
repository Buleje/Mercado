"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, ArrowRight, ArrowLeft, CheckCircle2, Loader2,
  Eye, EyeOff, Zap, ShoppingBag, Users, ShoppingCart,
  Globe, BarChart2, Crown, AlertTriangle, ExternalLink,
  Package, Truck, Heart, UtensilsCrossed, ChevronDown, ChevronUp,
  Shield, Ticket,
} from "lucide-react";
import { z } from "zod";
import { PLANS, type PlanId, type PlanDef } from "@/lib/plans";
import { STORE_TEMPLATES_LIST, type TemplateId } from "@/lib/store-templates";
import { trackEvent } from "@/lib/analytics";

/** Read csrf-token cookie for double-submit protection */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? m[1] : null;
}

// ─── Zod schema (espejo del schema del servidor) ─────────────
const Step1Schema = z.object({
  storeName:  z.string().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
  slug:       z.string()
                .min(3, "Mínimo 3 caracteres")
                .max(30, "Máximo 30 caracteres")
                .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Solo letras minúsculas, números y guiones"),
  ownerEmail: z.string().email("Email inválido"),
  ownerPhone: z.string().max(20).optional(),
});

const Step2Schema = z.object({
  adminName:     z.string().min(2, "Mínimo 2 caracteres").max(64, "Máximo 64 caracteres"),
  adminUsername: z.string().min(3, "Mínimo 3 caracteres").max(32, "Máximo 32 caracteres").regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z.string().min(8, "Mínimo 8 caracteres"),
  referralCode:  z.string().min(1).max(30).trim().optional().or(z.literal("")),
});

// ─── Types ────────────────────────────────────────────────────
type Step = 0 | 1 | 2 | 3 | 4;
type AccountType = "store" | "supplier" | "delivery";
type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";
type Direction = 1 | -1;

interface FormData {
  storeName:     string;
  slug:          string;
  ownerEmail:    string;
  ownerPhone:    string;
  plan:          PlanId;
  adminName:     string;
  adminUsername: string;
  adminPassword: string;
  referralCode:  string;
  template:      TemplateId | "";
}

interface RegistrationFormProps {
  initialPlan?: PlanId;
}

// ─── Helpers ──────────────────────────────────────────────────
function toSlug(val: string): string {
  return val
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

function toUsername(val: string): string {
  return val
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
}

function formatLimit(max: number): string {
  return max === -1 ? "Ilimitado" : max.toLocaleString("es-PE");
}

// ─── Password strength ────────────────────────────────────────
interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const labels: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: "", 1: "Muy débil", 2: "Débil", 3: "Buena", 4: "Fuerte",
  };
  const colors: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: "", 1: "bg-red-500", 2: "bg-amber-500", 3: "bg-yellow-400", 4: "bg-emerald-500",
  };
  return { score: clamped, label: labels[clamped], color: colors[clamped] };
}

// ─── Plan colors ──────────────────────────────────────────────
const PLAN_BORDER: Record<PlanId, string> = {
  free:       "border-gray-300 dark:border-gray-600",
  pro:        "border-emerald-400",
  business:   "border-violet-400",
  enterprise: "border-amber-400",
};

const PLAN_ACTIVE: Record<PlanId, string> = {
  free:       "border-gray-500 bg-gray-50 dark:bg-gray-900/40 ring-2 ring-gray-400",
  pro:        "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-500",
  business:   "border-violet-500 bg-violet-50 dark:bg-violet-950/30 ring-2 ring-violet-500",
  enterprise: "border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-500",
};

// ─── Framer Motion variants ───────────────────────────────────
const slideVariants = {
  enter: (dir: Direction) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: Direction) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

const slideTransition = { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const };

// ─── Sub-components ───────────────────────────────────────────
function StepDot({ n, current }: { n: number; current: Step }) {
  const done   = n < current;
  const active = n === current;
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-200 ${
        done   ? "bg-emerald-500 border-emerald-500 text-white" :
        active ? "bg-[#00B4A6] border-[#00B4A6] text-white" :
                 "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-400"
      }`}
    >
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, className = "", ...rest } = props;
  return (
    <>
      <input
        {...rest}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-900 text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 ${
          error
            ? "border-red-400 bg-red-50 dark:bg-red-950/20"
            : "border-gray-200 dark:border-gray-700"
        } ${className}`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </>
  );
}

// ─── Template icons ───────────────────────────────────────────
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  Store:           <Store className="w-5 h-5" />,
  ShoppingCart:    <ShoppingCart className="w-5 h-5" />,
  Heart:           <Heart className="w-5 h-5" />,
  UtensilsCrossed: <UtensilsCrossed className="w-5 h-5" />,
};

// ─── Main component ───────────────────────────────────────────
export function RegistrationForm({ initialPlan = "free" }: RegistrationFormProps) {
  const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "buleje.pe";

  const [step,        setStep]        = useState<Step>(0);
  const [direction,   setDirection]   = useState<Direction>(1);
  const [accountType, setAccountType] = useState<AccountType>("store");
  const [form,        setForm]        = useState<FormData>({
    storeName:     "",
    slug:          "",
    ownerEmail:    "",
    ownerPhone:    "",
    plan:          initialPlan,
    adminName:     "",
    adminUsername: "",
    adminPassword: "",
    referralCode:  "",
    template:      "",
  });
  const [errors,       setErrors]       = useState<Partial<Record<keyof FormData, string>>>({});
  const [slugStatus,   setSlugStatus]   = useState<SlugStatus>("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [serverError,  setServerError]  = useState<string | null>(null);
  const [result,       setResult]       = useState<{ tenantSlug: string; storeName: string } | null>(null);
  const [checkoutUrl,  setCheckoutUrl]  = useState<string | null>(null);

  const slugAbortRef = useRef<AbortController | null>(null);
  const slugTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passwordStrength = getPasswordStrength(form.adminPassword);

  // ── Cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
      if (slugAbortRef.current) slugAbortRef.current.abort();
    };
  }, []);

  // ── Analytics: registration_start ────────────────────────────
  useEffect(() => {
    trackEvent("registration_start");
  }, []);

  // ── Auto-generate slug from store name ───────────────────────
  function handleStoreName(val: string) {
    const suggested = toSlug(val);
    setForm((f) => ({ ...f, storeName: val, slug: suggested }));
    setErrors((e) => ({ ...e, storeName: undefined, slug: undefined }));
    triggerSlugCheck(suggested);
  }

  // ── Slug availability check (debounce 500ms + AbortController) ─
  function triggerSlugCheck(slug: string) {
    if (slugTimerRef.current) clearTimeout(slugTimerRef.current);
    if (slugAbortRef.current) slugAbortRef.current.abort();
    if (!slug || slug.length < 3) { setSlugStatus("idle"); return; }
    setSlugStatus("checking");
    slugTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      slugAbortRef.current = controller;
      try {
        const res  = await fetch(`/api/onboarding/check-slug?slug=${encodeURIComponent(slug)}`, { signal: controller.signal });
        const data = await res.json() as { available: boolean; reason?: string };
        if (!data.available && data.reason?.includes("Formato")) {
          setSlugStatus("invalid");
        } else {
          setSlugStatus(data.available ? "available" : "taken");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSlugStatus("idle");
      }
    }, 500);
  }

  // ── Field updater ─────────────────────────────────────────────
  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  // ── Auto-suggest username from adminName ──────────────────────
  function handleAdminName(val: string) {
    set("adminName", val);
    if (!form.adminUsername || form.adminUsername === toUsername(form.adminName)) {
      setForm((f) => ({ ...f, adminName: val, adminUsername: toUsername(val) }));
      setErrors((e) => ({ ...e, adminName: undefined, adminUsername: undefined }));
    }
  }

  // ── Step navigation ───────────────────────────────────────────
  function goTo(target: Step) {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  }

  function next() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;

    // Analytics: paso completado
    if (step === 1) {
      trackEvent("registration_step_1_complete", {
        template: form.template || "none",
        type: accountType,
      });
    } else if (step === 2) {
      trackEvent("registration_step_2_complete");
    } else if (step === 3) {
      trackEvent("registration_step_3_complete", { plan: form.plan });
    }

    goTo((step + 1) as Step);
  }

  function back() {
    trackEvent("registration_step_back", {
      from_step: step,
      to_step: step - 1,
    });
    goTo((step - 1) as Step);
  }

  // ── Per-step Zod validation ───────────────────────────────────
  function validateStep1(): boolean {
    const result = Step1Schema.safeParse({
      storeName:  form.storeName,
      slug:       form.slug,
      ownerEmail: form.ownerEmail,
      ownerPhone: form.ownerPhone || undefined,
    });
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormData;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    if (slugStatus === "taken")   { setErrors((e) => ({ ...e, slug: "Este subdominio ya está en uso" })); return false; }
    if (slugStatus === "invalid") { setErrors((e) => ({ ...e, slug: "Formato inválido" })); return false; }
    if (slugStatus === "checking") { setErrors((e) => ({ ...e, slug: "Espera mientras verificamos la disponibilidad" })); return false; }
    return true;
  }

  function validateStep2(): boolean {
    const result = Step2Schema.safeParse({
      adminName:     form.adminName,
      adminUsername: form.adminUsername,
      adminPassword: form.adminPassword,
      referralCode:  form.referralCode || undefined,
    });
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormData;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    return true;
  }

  // ── Submit ─────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(getCsrfToken() && { "x-csrf-token": getCsrfToken()! }) },
        body: JSON.stringify({
          type:          accountType,
          storeName:     form.storeName,
          slug:          form.slug,
          ownerEmail:    form.ownerEmail,
          ownerPhone:    form.ownerPhone  || undefined,
          plan:          form.plan,
          adminName:     form.adminName,
          adminUsername: form.adminUsername,
          adminPassword: form.adminPassword,
          referralCode:  form.referralCode || undefined,
          template:      form.template    || undefined,
        }),
      });
      const data = await res.json() as {
        tenantSlug?: string; storeName?: string; trialEndsAt?: string;
        redirectUrl?: string; tenantId?: string;
        error?: string; message?: string;
      };

      if (!res.ok) {
        const errorMsg = data.error ?? data.message ?? "Error inesperado. Intenta de nuevo.";
        setServerError(errorMsg);
        trackEvent("registration_error", { error_message: errorMsg });
        return;
      }

      trackEvent("registration_complete", {
        plan: form.plan,
        type: accountType,
        template: form.template || "none",
      });
      setResult({ tenantSlug: data.tenantSlug ?? data.tenantId ?? form.slug, storeName: data.storeName ?? form.storeName });
      setDirection(1);
      setStep(4);

      // Redirect automático si la API lo provee
      if (data.redirectUrl) {
        setTimeout(() => { window.location.href = data.redirectUrl!; }, 1500);
        return;
      }

      // Para planes de pago, obtener URL de Stripe
      if (form.plan !== "free" && (data.tenantSlug ?? data.tenantId)) {
        try {
          const checkoutRes  = await fetch("/api/onboarding/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(getCsrfToken() && { "x-csrf-token": getCsrfToken()! }) },
            body: JSON.stringify({ tenantSlug: data.tenantSlug ?? data.tenantId, plan: form.plan }),
          });
          const checkoutData = await checkoutRes.json() as { url?: string };
          if (checkoutRes.ok && checkoutData.url) setCheckoutUrl(checkoutData.url);
        } catch { /* El usuario puede actualizar después */ }
      }
    } catch {
      const networkError = "Error de red. Revisa tu conexión e intenta de nuevo.";
      setServerError(networkError);
      trackEvent("registration_error", { error_message: networkError });
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Step labels (para el indicador) ─────────────────────────
  const STEP_LABELS = ["Tu negocio", "Tu cuenta", "Tu plan"];

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50/40 dark:from-gray-950 dark:to-gray-900 flex flex-col items-center justify-center p-4 py-12">

      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-[#00B4A6] flex items-center justify-center">
          <Store className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-extrabold tracking-tight text-foreground">Buleje</span>
      </div>

      {/* Step indicators (pasos 1–3) */}
      {step !== 0 && step !== 4 && (
        <div className="flex items-center gap-2 mb-8">
          {([1, 2, 3] as const).map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <StepDot n={n} current={step} />
                <span className={`text-xs font-medium hidden sm:block transition-colors ${n === step ? "text-[#00B4A6]" : "text-gray-400"}`}>
                  {STEP_LABELS[n - 1]}
                </span>
              </div>
              {i < 2 && (
                <div className={`w-10 sm:w-16 h-0.5 mb-4 transition-all duration-300 ${step > n ? "bg-emerald-400" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ─── Step 0: Tipo de cuenta ──────────────────────── */}
          {step === 0 && (
            <motion.div
              key="step-0"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="p-8 space-y-6"
            >
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Registra tu negocio</h1>
                <p className="text-muted-foreground text-sm mt-1">Elige el perfil que mejor describe tu negocio.</p>
              </div>

              <div className="space-y-3">
                {(
                  [
                    { value: "store"    as AccountType, icon: <Store className="w-6 h-6" />,   label: "Tienda",    description: "Gestiona tu bodega, vende online y en mostrador" },
                    { value: "supplier" as AccountType, icon: <Package className="w-6 h-6" />, label: "Proveedor", description: "Vende al por mayor a las tiendas de la plataforma" },
                    { value: "delivery" as AccountType, icon: <Truck className="w-6 h-6" />,   label: "Delivery",  description: "Ofrece servicios de reparto a las tiendas" },
                  ] as const
                ).map((opt) => {
                  const active = accountType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setAccountType(opt.value);
                        goTo(1);
                      }}
                      className={`w-full text-left rounded-2xl border-2 p-5 transition-all flex items-center gap-4 min-h-[72px] ${
                        active
                          ? "border-[#00B4A6] bg-[#00B4A6]/5 ring-2 ring-[#00B4A6]/30"
                          : "border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]/40"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                        {opt.icon}
                      </div>
                      <div>
                        <p className="font-bold text-base text-foreground">{opt.label}</p>
                        <p className="text-muted-foreground text-sm mt-0.5">{opt.description}</p>
                      </div>
                      {active && <CheckCircle2 className="w-5 h-5 text-[#00B4A6] ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ─── Step 1: Datos del negocio ───────────────────── */}
          {step === 1 && (
            <motion.div
              key="step-1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="p-8 space-y-6"
            >
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Tu negocio</h1>
                <p className="text-muted-foreground text-sm mt-1">Solo toma 2 minutos. Sin tarjeta de crédito.</p>
              </div>

              <div className="space-y-4">
                {/* Nombre de la tienda */}
                <Field label="Nombre de la tienda" hint="Ej: Buleje, Minimarket El Sol">
                  <Input
                    type="text"
                    value={form.storeName}
                    onChange={(e) => handleStoreName(e.target.value)}
                    placeholder="Mi Bodega"
                    error={errors.storeName}
                    autoFocus
                  />
                </Field>

                {/* Slug */}
                <Field label="Subdominio" hint={`Tu tienda estará en: ${form.slug || "mi-tienda"}.${ROOT_DOMAIN}`}>
                  <div className="space-y-1">
                    <div className="flex items-center border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#00B4A6]/40 transition-all border-gray-200 dark:border-gray-700">
                      <span className="px-3 py-2.5 text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 select-none whitespace-nowrap">
                        buleje.pe/
                      </span>
                      <input
                        type="text"
                        value={form.slug}
                        onChange={(e) => {
                          const v = toSlug(e.target.value);
                          set("slug", v);
                          triggerSlugCheck(v);
                        }}
                        placeholder="mi-tienda"
                        className="flex-1 px-3 py-2.5 text-sm bg-white dark:bg-gray-900 text-foreground focus:outline-none"
                      />
                    </div>
                    {errors.slug && <p className="text-xs text-red-500">{errors.slug}</p>}
                    {/* Estado del slug */}
                    {slugStatus !== "idle" && !errors.slug && (
                      <div className="flex items-center gap-1.5 text-xs">
                        {slugStatus === "checking"  && <><Loader2 className="w-3 h-3 animate-spin text-gray-400" /><span className="text-gray-400">Verificando…</span></>}
                        {slugStatus === "available" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600 font-medium">Disponible</span></>}
                        {slugStatus === "taken"     && <><AlertTriangle className="w-3 h-3 text-red-500" /><span className="text-red-500 font-medium">Ya está en uso</span></>}
                        {slugStatus === "invalid"   && <><AlertTriangle className="w-3 h-3 text-amber-500" /><span className="text-amber-600">Formato inválido</span></>}
                      </div>
                    )}
                  </div>
                </Field>

                {/* Email */}
                <Field label="Email del dueño">
                  <Input
                    type="email"
                    value={form.ownerEmail}
                    onChange={(e) => set("ownerEmail", e.target.value)}
                    placeholder="correo@ejemplo.com"
                    error={errors.ownerEmail}
                  />
                </Field>

                {/* Teléfono */}
                <Field label="Teléfono (opcional)">
                  <Input
                    type="tel"
                    value={form.ownerPhone}
                    onChange={(e) => set("ownerPhone", e.target.value)}
                    placeholder="+51 987 654 321"
                  />
                </Field>

                {/* Tipo de negocio / Template (solo para tiendas) */}
                {accountType === "store" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-foreground">
                      Tipo de negocio <span className="text-muted-foreground font-normal">(opcional)</span>
                    </label>
                    <p className="text-xs text-muted-foreground -mt-1">Precargamos las categorías para que empieces más rápido.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {STORE_TEMPLATES_LIST.map((tmpl) => {
                        const active = form.template === tmpl.id;
                        return (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => set("template", active ? "" : tmpl.id as TemplateId)}
                            className={`text-left rounded-xl border-2 p-3 transition-all flex items-center gap-2.5 min-h-[56px] ${
                              active
                                ? "border-[#00B4A6] bg-[#00B4A6]/5 ring-2 ring-[#00B4A6]/20"
                                : "border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]/40"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                              {TEMPLATE_ICONS[tmpl.icon]}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold leading-tight truncate text-foreground">{tmpl.name}</p>
                              <p className="text-muted-foreground" style={{ fontSize: "0.65rem" }}>{tmpl.categories.length} categorías</p>
                            </div>
                            {active && <CheckCircle2 className="w-4 h-4 text-[#00B4A6] ml-auto shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={back}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  onClick={next}
                  className="flex-[2] px-6 py-3 rounded-2xl bg-[#00B4A6] text-white font-bold text-sm hover:bg-[#00a196] flex items-center justify-center gap-2 min-h-[48px]"
                >
                  Siguiente <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2: Datos de la cuenta ─────────────────── */}
          {step === 2 && (
            <motion.div
              key="step-2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="p-8 space-y-6"
            >
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Tu cuenta</h1>
                <p className="text-muted-foreground text-sm mt-1">Usarás estas credenciales para entrar al panel.</p>
              </div>

              <div className="space-y-4">
                {/* Nombre del admin */}
                <Field label="Tu nombre completo">
                  <Input
                    type="text"
                    value={form.adminName}
                    onChange={(e) => handleAdminName(e.target.value)}
                    placeholder="María García"
                    error={errors.adminName}
                    autoFocus
                  />
                </Field>

                {/* Username (auto-sugerido) */}
                <Field label="Nombre de usuario" hint="Solo letras, números, punto o guión bajo">
                  <Input
                    type="text"
                    value={form.adminUsername}
                    onChange={(e) => set("adminUsername", e.target.value.toLowerCase())}
                    placeholder="admin"
                    error={errors.adminUsername}
                  />
                </Field>

                {/* Password con indicador de fortaleza */}
                <Field label="Contraseña" hint="Mínimo 8 caracteres">
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={form.adminPassword}
                        onChange={(e) => set("adminPassword", e.target.value)}
                        placeholder="••••••••"
                        error={errors.adminPassword}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        tabIndex={-1}
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Indicador de fortaleza */}
                    {form.adminPassword.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex gap-1">
                          {([1, 2, 3, 4] as const).map((bar) => (
                            <div
                              key={bar}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                bar <= passwordStrength.score ? passwordStrength.color : "bg-gray-200 dark:bg-gray-700"
                              }`}
                            />
                          ))}
                        </div>
                        {passwordStrength.label && (
                          <p className={`text-xs font-medium ${
                            passwordStrength.score <= 1 ? "text-red-500" :
                            passwordStrength.score === 2 ? "text-amber-500" :
                            passwordStrength.score === 3 ? "text-yellow-500" :
                            "text-emerald-500"
                          }`}>
                            {passwordStrength.label}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Field>

                {/* Código de referido (colapsado) */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowReferral((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Ticket className="w-4 h-4" />
                      Tengo un código de referido
                    </span>
                    {showReferral ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showReferral && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800">
                      <Input
                        type="text"
                        value={form.referralCode}
                        onChange={(e) => set("referralCode", e.target.value.trim())}
                        placeholder="AMIGO2024"
                        error={errors.referralCode}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={back}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  onClick={next}
                  className="flex-[2] px-6 py-3 rounded-2xl bg-[#00B4A6] text-white font-bold text-sm hover:bg-[#00a196] flex items-center justify-center gap-2 min-h-[48px]"
                >
                  Siguiente <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Selección de plan ───────────────────── */}
          {step === 3 && (
            <motion.div
              key="step-3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="p-8 space-y-6"
            >
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Elige tu plan</h1>
                <p className="text-muted-foreground text-sm mt-1">Todos incluyen 14 días de prueba gratis.</p>
              </div>

              <div className="space-y-3">
                {(Object.values(PLANS) as PlanDef[]).map((def) => {
                  const active = form.plan === def.id;
                  const l      = def.limits;
                  return (
                    <button
                      key={def.id}
                      onClick={() => set("plan", def.id)}
                      className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                        active ? PLAN_ACTIVE[def.id] : PLAN_BORDER[def.id] + " hover:border-[#00B4A6]/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {(def.id === "business" || def.id === "enterprise") && (
                            <Crown className={`w-4 h-4 shrink-0 ${def.id === "enterprise" ? "text-amber-500" : "text-violet-500"}`} />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-foreground">{def.name}</p>
                              {def.popular && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#00B4A6] text-white">Popular</span>
                              )}
                            </div>
                            <p className="text-muted-foreground text-xs mt-0.5">
                              {def.priceMonthly === 0 ? "Gratis para siempre" : `$${def.priceMonthly}/mes tras la prueba`}
                            </p>
                          </div>
                        </div>
                        {active && <CheckCircle2 className="w-5 h-5 text-[#00B4A6] shrink-0 mt-0.5" />}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> {formatLimit(l.maxProducts)} productos</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {formatLimit(l.maxUsers)} usuarios</span>
                        <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> {formatLimit(l.maxOrdersPerMonth)} pedidos/mes</span>
                        {l.customDomain       && <span className="flex items-center gap-1 text-emerald-600"><Globe className="w-3 h-3" /> Dominio propio</span>}
                        {l.advancedAnalytics  && <span className="flex items-center gap-1 text-emerald-600"><BarChart2 className="w-3 h-3" /> Analytics</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={back}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  onClick={next}
                  className="flex-[2] px-6 py-3 rounded-2xl bg-[#00B4A6] text-white font-bold text-sm hover:bg-[#00a196] flex items-center justify-center gap-2 min-h-[48px]"
                >
                  Siguiente <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 4 (índice 4): Confirmar y crear ───────── */}
          {step === 4 && !result && (
            <motion.div
              key="step-confirm"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="p-8 space-y-6"
            >
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Confirmar registro</h1>
                <p className="text-muted-foreground text-sm mt-1">Revisa los datos antes de crear tu tienda.</p>
              </div>

              {/* Resumen */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl divide-y divide-gray-100 dark:divide-gray-700/50 overflow-hidden text-sm">
                <SummaryRow icon={<Store className="w-4 h-4" />}     label="Tienda"     value={form.storeName} />
                <SummaryRow icon={<Globe className="w-4 h-4" />}     label="URL"        value={`${form.slug}.${ROOT_DOMAIN}`} mono />
                <SummaryRow icon={<Shield className="w-4 h-4" />}    label="Admin"      value={`${form.adminName} (@${form.adminUsername})`} />
                <SummaryRow icon={<ShoppingBag className="w-4 h-4" />} label="Plan"     value={PLANS[form.plan]?.name ?? form.plan} />
                {form.template && (
                  <SummaryRow icon={<Store className="w-4 h-4" />}   label="Plantilla"  value={form.template} />
                )}
                {form.referralCode && (
                  <SummaryRow icon={<Ticket className="w-4 h-4" />}  label="Referido"   value={form.referralCode} />
                )}
              </div>

              {serverError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  {serverError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={back}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-[2] px-6 py-3 rounded-2xl bg-[#00B4A6] text-white font-bold text-sm hover:bg-[#00a196] disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {submitting ? "Creando tienda…" : "Crear mi tienda"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Al crear tu tienda aceptas nuestros{" "}
                <a href="/terminos" className="underline hover:text-foreground">Términos de servicio</a> y{" "}
                <a href="/privacidad" className="underline hover:text-foreground">Política de privacidad</a>.
              </p>
            </motion.div>
          )}

          {/* ─── Step 5 (success) ────────────────────────────── */}
          {step === 4 && result && (
            <motion.div
              key="step-success"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="p-8 text-center space-y-6 py-12"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>

              <div>
                <h1 className="text-2xl font-extrabold text-foreground">¡Tienda creada!</h1>
                <p className="text-muted-foreground text-sm mt-2">
                  <strong className="text-foreground">{result.storeName}</strong> ya está lista. Tu período de prueba de 14 días ha comenzado.
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Tu tienda</p>
                <p className="font-mono font-bold text-[#00B4A6] text-base">{result.tenantSlug}.{ROOT_DOMAIN}</p>
              </div>

              <div className="space-y-3">
                {checkoutUrl && (
                  <a
                    href={checkoutUrl}
                    className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 flex items-center justify-center gap-2 min-h-[48px]"
                  >
                    Activar suscripción {PLANS[form.plan]?.name} <Zap className="w-4 h-4" />
                  </a>
                )}
                <a
                  href="/onboarding"
                  className="w-full py-3 rounded-2xl bg-[#00B4A6] text-white font-bold text-sm hover:bg-[#00a196] flex items-center justify-center gap-2 min-h-[48px]"
                >
                  Configurar mi tienda <ExternalLink className="w-4 h-4" />
                </a>
                <a
                  href={`/t/${result.tenantSlug}`}
                  className="w-full py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2 min-h-[48px]"
                >
                  Ver mi tienda <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      {step !== 4 && (
        <p className="text-xs text-muted-foreground mt-6">
          ¿Ya tienes cuenta?{" "}
          <a href="/admin" className="underline font-medium hover:text-foreground">Inicia sesión</a>
        </p>
      )}
    </div>
  );
}

// ─── Summary row helper ───────────────────────────────────────
function SummaryRow({ icon, label, value, mono = false }: {
  icon:   React.ReactNode;
  label:  string;
  value:  string;
  mono?:  boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground w-20 shrink-0 text-xs">{label}</span>
      <span className={`font-medium text-foreground truncate ${mono ? "font-mono text-[#00B4A6]" : ""}`}>{value}</span>
    </div>
  );
}
