"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Store, ArrowRight, ArrowLeft, CheckCircle2, Loader2,
  Eye, EyeOff, Zap, ShoppingBag, Users, ShoppingCart,
  Globe, BarChart2, Crown, AlertTriangle, ExternalLink,
} from "lucide-react";
import { PLANS, type PlanId, type PlanDef } from "@/lib/plans";

// ─── Step types ──────────────────────────────────────────
type Step = 1 | 2 | 3 | 4; // 4 = success

interface FormData {
  storeName: string;
  slug: string;
  ownerEmail: string;
  ownerPhone: string;
  plan: PlanId;
  adminName: string;
  adminUsername: string;
  adminPassword: string;
}

// ─── Helpers ─────────────────────────────────────────────
function toSlug(val: string) {
  return val
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

const PLAN_COLORS: Record<PlanId, string> = {
  free: "border-gray-300 dark:border-gray-600",
  pro: "border-blue-400",
  business: "border-violet-400",
  enterprise: "border-amber-400",
};

const PLAN_ACTIVE: Record<PlanId, string> = {
  free: "border-gray-500 bg-gray-50 dark:bg-gray-900/40 ring-2 ring-gray-400",
  pro: "border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-500",
  business: "border-violet-500 bg-violet-50 dark:bg-violet-950/30 ring-2 ring-violet-500",
  enterprise: "border-amber-500 bg-amber-50 dark:bg-amber-950/30 ring-2 ring-amber-500",
};

function formatLimit(max: number) {
  return max === -1 ? "Ilimitado" : max.toLocaleString("es-PE");
}

// ─── Step indicator ──────────────────────────────────────
function StepDot({ n, current }: { n: number; current: Step }) {
  const done = n < current;
  const active = n === current;
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
        done ? "bg-emerald-500 border-emerald-500 text-white" :
        active ? "bg-primary border-primary text-white" :
        "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-muted"
      }`}
    >
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, ...rest } = props;
  return (
    <>
      <input
        {...rest}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          error
            ? "border-red-400 bg-red-50 dark:bg-red-950/20"
            : "border-(--color-card-border) bg-(--color-surface)"
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────
export default function RegistroPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(() => {
    const planParam = (typeof window !== "undefined" ? searchParams.get("plan") : null) as PlanId | null;
    const validPlans: PlanId[] = ["free", "pro", "business", "enterprise"];
    return {
      storeName: "", slug: "", ownerEmail: "", ownerPhone: "",
      plan: planParam && validPlans.includes(planParam) ? planParam : "free",
      adminName: "", adminUsername: "", adminPassword: "",
    };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tenantSlug: string; storeName: string; trialEndsAt: string } | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const slugTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Auto-generate slug from store name ──────────────────
  function handleStoreName(val: string) {
    const suggested = toSlug(val);
    setForm((f) => ({ ...f, storeName: val, slug: suggested }));
    triggerSlugCheck(suggested);
  }

  // ── Slug availability check (debounced) ─────────────────
  function triggerSlugCheck(slug: string) {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    if (!slug || slug.length < 4) { setSlugStatus("idle"); return; }
    setSlugStatus("checking");
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboarding/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json() as { available: boolean; reason?: string };
        if (!data.available && data.reason?.includes("Formato")) {
          setSlugStatus("invalid");
        } else {
          setSlugStatus(data.available ? "available" : "taken");
        }
      } catch {
        setSlugStatus("idle");
      }
    }, 500);
  }

  useEffect(() => {
    return () => { if (slugTimer.current) clearTimeout(slugTimer.current); };
  }, []);

  // ── Field updater ────────────────────────────────────────
  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  // ── Per-step validation ──────────────────────────────────
  function validateStep1(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.storeName.trim()) e.storeName = "El nombre de la tienda es obligatorio";
    if (form.slug.length < 4) e.slug = "El subdominio debe tener al menos 4 caracteres";
    if (slugStatus === "taken") e.slug = "Este subdominio ya está en uso";
    if (slugStatus === "invalid") e.slug = "Formato inválido";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.ownerEmail)) e.ownerEmail = "Email inválido";
    if (Object.keys(e).length) { setErrors(e); return false; }
    return true;
  }

  function validateStep3(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.adminName.trim()) e.adminName = "El nombre es obligatorio";
    if (form.adminUsername.length < 3) e.adminUsername = "Mínimo 3 caracteres";
    if (!/^[a-z0-9_.]+$/i.test(form.adminUsername)) e.adminUsername = "Solo letras, números, punto o guión bajo";
    if (form.adminPassword.length < 8) e.adminPassword = "Mínimo 8 caracteres";
    if (Object.keys(e).length) { setErrors(e); return false; }
    return true;
  }

  // ── Navigation ───────────────────────────────────────────
  function next() {
    if (step === 1 && !validateStep1()) return;
    setStep((s) => (s + 1) as Step);
  }
  function back() { setStep((s) => (s - 1) as Step); }

  // ── Submit ───────────────────────────────────────────────
  async function handleSubmit() {
    if (!validateStep3()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { message?: string; tenantSlug?: string; storeName?: string; trialEndsAt?: string; error?: string };
      if (!res.ok) {
        setServerError(data.error ?? "Error inesperado. Intenta de nuevo.");
        return;
      }
      setResult({ tenantSlug: data.tenantSlug!, storeName: data.storeName!, trialEndsAt: data.trialEndsAt! });
      setStep(4);

      // For paid plans, auto-redirect to Stripe Checkout
      if (form.plan !== "free" && data.tenantSlug) {
        try {
          const checkoutRes = await fetch("/api/onboarding/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantSlug: data.tenantSlug, plan: form.plan }),
          });
          const checkoutData = await checkoutRes.json() as { url?: string };
          if (checkoutRes.ok && checkoutData.url) {
            setCheckoutUrl(checkoutData.url);
          }
        } catch { /* Stripe checkout optional — user can upgrade later */ }
      }
    } catch {
      setServerError("Error de red. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────
  const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "mitienda.com";

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-blue-50 dark:from-gray-950 dark:to-gray-900 flex flex-col items-center justify-center p-4">
      {/* Logo / Brand */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
          <Store className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-extrabold tracking-tight">MiTienda SaaS</span>
      </div>

      {/* Step indicators (not on success) */}
      {step !== 4 && (
        <div className="flex items-center gap-2 mb-8">
          {([1, 2, 3] as const).map((n, i) => (
            <div key={n} className="flex items-center gap-2">
              <StepDot n={n} current={step} />
              {i < 2 && <div className={`w-12 h-0.5 transition-all ${step > n ? "bg-emerald-400" : "bg-gray-200 dark:bg-gray-700"}`} />}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 space-y-6">

        {/* ─── Step 1: Store info ────────────────────────── */}
        {step === 1 && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold">Crea tu tienda</h1>
              <p className="text-muted text-sm mt-1">Solo toma 2 minutos. Sin tarjeta de crédito.</p>
            </div>

            <div className="space-y-4">
              <Field label="Nombre de tu tienda" hint="Ej: Bodega San Martín, Minimarket El Sol">
                <Input
                  type="text"
                  value={form.storeName}
                  onChange={(e) => handleStoreName(e.target.value)}
                  placeholder="Bodega San Martín"
                  error={errors.storeName}
                  autoFocus
                />
              </Field>

              <Field label="Subdominio" hint={`Tu tienda estará en: ${form.slug || "mi-tienda"}.${ROOT_DOMAIN}`}>
                <div className="relative">
                  <Input
                    type="text"
                    value={form.slug}
                    onChange={(e) => {
                      const v = toSlug(e.target.value);
                      set("slug", v);
                      triggerSlugCheck(v);
                    }}
                    placeholder="mi-tienda"
                    error={errors.slug}
                  />
                  {/* Slug status indicator */}
                  {slugStatus !== "idle" && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      {slugStatus === "checking" && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
                      {slugStatus === "available" && <><CheckCircle2 className="w-3 h-3 text-emerald-500" /><span className="text-emerald-600 font-medium">¡Disponible!</span></>}
                      {slugStatus === "taken" && <><AlertTriangle className="w-3 h-3 text-red-500" /><span className="text-red-500 font-medium">Ya está en uso</span></>}
                      {slugStatus === "invalid" && <><AlertTriangle className="w-3 h-3 text-amber-500" /><span className="text-amber-600">Formato inválido</span></>}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Email del dueño">
                <Input
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => set("ownerEmail", e.target.value)}
                  placeholder="correo@ejemplo.com"
                  error={errors.ownerEmail}
                />
              </Field>

              <Field label="Teléfono (opcional)">
                <Input
                  type="tel"
                  value={form.ownerPhone}
                  onChange={(e) => set("ownerPhone", e.target.value)}
                  placeholder="987 654 321"
                />
              </Field>
            </div>

            <button
              onClick={next}
              className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:opacity-90 flex items-center justify-center gap-2"
            >
              Siguiente <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* ─── Step 2: Plan selection ────────────────────── */}
        {step === 2 && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold">Elige tu plan</h1>
              <p className="text-muted text-sm mt-1">Todos incluyen 14 días de prueba gratis.</p>
            </div>

            <div className="space-y-3">
              {(Object.values(PLANS) as PlanDef[]).map((def) => {
                const active = form.plan === def.id;
                const l = def.limits;
                return (
                  <button
                    key={def.id}
                    onClick={() => set("plan", def.id)}
                    className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                      active ? PLAN_ACTIVE[def.id] : PLAN_COLORS[def.id] + " hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {(def.id === "business" || def.id === "enterprise") && (
                          <Crown className={`w-4 h-4 ${def.id === "enterprise" ? "text-amber-500" : "text-violet-500"} shrink-0`} />
                        )}
                        <div>
                          <p className="font-bold">{def.name}</p>
                          <p className="text-muted text-xs mt-0.5">
                            {def.priceMonthly === 0 ? "Gratis para siempre" : `$${def.priceMonthly}/mes tras la prueba`}
                          </p>
                        </div>
                      </div>
                      {active && <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> {formatLimit(l.maxProducts)} productos</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {formatLimit(l.maxUsers)} usuarios</span>
                      <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> {formatLimit(l.maxOrdersPerMonth)} pedidos/mes</span>
                      {l.customDomain && <span className="flex items-center gap-1 text-emerald-600"><Globe className="w-3 h-3" /> Dominio propio</span>}
                      {l.advancedAnalytics && <span className="flex items-center gap-1 text-emerald-600"><BarChart2 className="w-3 h-3" /> Analytics avanzado</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={back} className="flex-1 py-3 rounded-2xl border border-(--color-card-border) text-sm font-semibold hover:bg-(--color-surface) flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Atrás
              </button>
              <button onClick={next} className="flex-2 px-6 py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:opacity-90 flex items-center justify-center gap-2">
                Siguiente <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* ─── Step 3: Admin account ─────────────────────── */}
        {step === 3 && (
          <>
            <div>
              <h1 className="text-2xl font-extrabold">Tu cuenta de admin</h1>
              <p className="text-muted text-sm mt-1">Usarás estas credenciales para entrar al panel.</p>
            </div>

            <div className="space-y-4">
              <Field label="Tu nombre completo">
                <Input
                  type="text"
                  value={form.adminName}
                  onChange={(e) => set("adminName", e.target.value)}
                  placeholder="María García"
                  error={errors.adminName}
                  autoFocus
                />
              </Field>

              <Field label="Nombre de usuario" hint="Solo letras minúsculas, números, punto o guión bajo">
                <Input
                  type="text"
                  value={form.adminUsername}
                  onChange={(e) => set("adminUsername", e.target.value.toLowerCase())}
                  placeholder="admin"
                  error={errors.adminUsername}
                />
              </Field>

              <Field label="Contraseña" hint="Mínimo 8 caracteres">
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.adminPassword}
                    onChange={(e) => set("adminPassword", e.target.value)}
                    placeholder="••••••••"
                    error={errors.adminPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-2.5 text-muted"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            </div>

            {serverError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {serverError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={back} className="flex-1 py-3 rounded-2xl border border-(--color-card-border) text-sm font-semibold hover:bg-(--color-surface) flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-2 px-6 py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {submitting ? "Creando tienda…" : "Crear mi tienda"}
              </button>
            </div>

            <p className="text-xs text-muted text-center">
              Al crear tu tienda aceptas nuestros{" "}
              <span className="underline cursor-pointer">Términos de servicio</span> y{" "}
              <span className="underline cursor-pointer">Política de privacidad</span>.
            </p>
          </>
        )}

        {/* ─── Step 4: Success ───────────────────────────── */}
        {step === 4 && result && (
          <div className="text-center space-y-6 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9 text-emerald-500" />
            </div>

            <div>
              <h1 className="text-2xl font-extrabold">¡Tienda creada!</h1>
              <p className="text-muted text-sm mt-2">
                <strong>{result.storeName}</strong> ya está lista. Tu período de prueba de 14 días ha comenzado.
              </p>
            </div>

            {/* URL card */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 space-y-1">
              <p className="text-xs text-muted uppercase tracking-wide font-semibold">Tu subdominio</p>
              <p className="font-mono font-bold text-primary text-base">
                {result.tenantSlug}.{ROOT_DOMAIN}
              </p>
            </div>

            <div className="space-y-3">
              {checkoutUrl && (
                <a
                  href={checkoutUrl}
                  className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 flex items-center justify-center gap-2"
                >
                  Activar suscripción {form.plan.charAt(0).toUpperCase() + form.plan.slice(1)} <Zap className="w-4 h-4" />
                </a>
              )}
              <a
                href={`http://${result.tenantSlug}.${ROOT_DOMAIN}/admin`}
                className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm hover:opacity-90 flex items-center justify-center gap-2"
              >
                Ir al panel de administración <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={`http://${result.tenantSlug}.${ROOT_DOMAIN}`}
                className="w-full py-3 rounded-2xl border border-(--color-card-border) text-sm font-semibold hover:bg-(--color-surface) flex items-center justify-center gap-2"
              >
                Ver mi tienda <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <p className="text-xs text-muted">
              Guarda estos datos. Los necesitarás para iniciar sesión.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {step !== 4 && (
        <p className="text-xs text-muted mt-6">
          ¿Ya tienes cuenta?{" "}
          <a href="/admin" className="underline font-medium hover:text-foreground">Inicia sesión</a>
        </p>
      )}
    </div>
  );
}
