"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorageDraft } from "@/hooks/use-local-storage-draft";

// ── Esquema de validación (safeParse, nunca .parse()) ─────────────────────────

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

const AccountSchema = z.object({
  adminName: z.string().min(2, "Ingresa tu nombre completo"),
  ownerEmail: z.string().email("Correo electrónico inválido"),
  adminUsername: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(32)
    .regex(/^[a-z0-9_.]+$/i, "Solo letras, números, punto o guión bajo"),
  adminPassword: z
    .string()
    .min(10, "Mínimo 10 caracteres")
    .regex(/[A-Z]/, "Debe incluir al menos una mayúscula")
    .regex(/[0-9]/, "Debe incluir al menos un número")
    .regex(/[^A-Za-z0-9]/, "Debe incluir al menos un carácter especial"),
  ownerPhone: z.string().optional(),
});

const StoreSchema = z.object({
  storeName: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(80),
  slug: z
    .string()
    .regex(SLUG_RE, "Solo minúsculas, números y guiones (mín. 4 chars)"),
  plan: z.enum(["free", "pro", "business"]),
  type: z.enum(["store", "supplier", "delivery"]).default("store"),
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Step = "account" | "store" | "confirm";

interface FormData {
  adminName: string;
  ownerEmail: string;
  adminUsername: string;
  adminPassword: string;
  ownerPhone: string;
  storeName: string;
  slug: string;
  plan: "free" | "pro" | "business";
  type: "store" | "supplier" | "delivery";
}

const INITIAL: FormData = {
  adminName: "",
  ownerEmail: "",
  adminUsername: "",
  adminPassword: "",
  ownerPhone: "",
  storeName: "",
  slug: "",
  plan: "free",
  type: "store",
};

const DRAFT_KEY = "signup-draft-v2";

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function inputCls(hasError?: boolean) {
  return [
    "w-full px-3 py-3 text-sm rounded-xl border transition outline-none",
    "dark:bg-gray-800 dark:text-gray-100",
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-red-500"
      : "border-gray-200 focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6] dark:border-gray-600 dark:focus:border-[#00B4A6]",
  ].join(" ");
}

const PLAN_OPTIONS: {
  id: "free" | "pro" | "business";
  label: string;
  price: string;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    id: "free",
    label: "Free",
    price: "S/ 0/mes",
    features: ["Hasta 50 productos", "1 usuario", "Sin delivery"],
  },
  {
    id: "pro",
    label: "Pro",
    price: "S/ 49/mes",
    features: ["Productos ilimitados", "3 usuarios", "Delivery incluido"],
    highlight: true,
  },
  {
    id: "business",
    label: "Business",
    price: "S/ 99/mes",
    features: ["Todo Pro", "10 usuarios", "Multi-tienda", "Soporte prioritario"],
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

export default function SignupPage() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const draft = useLocalStorageDraft<FormData>(DRAFT_KEY);

  const [form, setForm] = useState<FormData>(() => {
    if (typeof window === "undefined") return INITIAL;
    return draft.load() ?? INITIAL;
  });

  const [step, setStep] = useState<Step>("account");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [slugSuggestion, setSlugSuggestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [showPassword, setShowPassword] = useState(false);

  // Persistir borrador en cada cambio
  useEffect(() => {
    draft.save(form);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Verificación de slug (debounced) ──────────────────────────────────────

  const checkSlug = useCallback(async (slug: string) => {
    if (!slug || slug.length < 3) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    try {
      const res = await fetch(
        `/api/onboarding/check-slug?slug=${encodeURIComponent(slug)}`,
      );
      const data = (await res.json()) as { available: boolean; suggestion?: string };
      setSlugStatus(data.available ? "available" : "taken");
      setSlugSuggestion(data.suggestion ?? "");
    } catch {
      setSlugStatus("idle");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (form.slug) void checkSlug(form.slug);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.slug, checkSlug]);

  // Auto-sugerir slug desde nombre de tienda
  useEffect(() => {
    if (form.storeName && !form.slug) {
      setForm((prev) => ({ ...prev, slug: slugify(form.storeName) }));
    }
  }, [form.storeName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validación por paso ───────────────────────────────────────────────────

  function validateAccount(): boolean {
    const result = AccountSchema.safeParse({
      adminName: form.adminName,
      ownerEmail: form.ownerEmail,
      adminUsername: form.adminUsername,
      adminPassword: form.adminPassword,
      ownerPhone: form.ownerPhone,
    });
    if (!result.success) {
      const errs: Partial<Record<keyof FormData, string>> = {};
      result.error.issues.forEach((e) => {
        const field = e.path[0] as keyof FormData;
        if (!errs[field]) errs[field] = e.message;
      });
      setFieldErrors(errs);
      return false;
    }
    setFieldErrors({});
    return true;
  }

  function validateStore(): boolean {
    const result = StoreSchema.safeParse({
      storeName: form.storeName,
      slug: form.slug,
      plan: form.plan,
      type: form.type,
    });
    if (!result.success) {
      const errs: Partial<Record<keyof FormData, string>> = {};
      result.error.issues.forEach((e) => {
        const field = e.path[0] as keyof FormData;
        if (!errs[field]) errs[field] = e.message;
      });
      setFieldErrors(errs);
      return false;
    }
    if (slugStatus === "taken") {
      setFieldErrors({ slug: "Este subdominio ya está en uso" });
      return false;
    }
    setFieldErrors({});
    return true;
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  function handleNext() {
    if (step === "account" && validateAccount()) {
      setStep("store");
    } else if (step === "store" && validateStore()) {
      setStep("confirm");
    }
  }

  function handleBack() {
    if (step === "store") setStep("account");
    else if (step === "confirm") setStep("store");
    setFieldErrors({});
  }

  // ── Submit → POST /api/onboarding ─────────────────────────────────────────

  async function handleSubmit() {
    if (!validateStore()) {
      setStep("store");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          storeName: form.storeName,
          slug: form.slug,
          ownerEmail: form.ownerEmail,
          ownerPhone: form.ownerPhone || undefined,
          plan: form.plan,
          adminName: form.adminName,
          adminUsername: form.adminUsername,
          adminPassword: form.adminPassword,
        }),
      });

      const data = (await res.json()) as {
        tenantId?: string;
        tenantSlug?: string;
        message?: string;
        error?: string;
        issues?: Record<string, string[]>;
      };

      if (!res.ok) {
        if (res.status === 409) {
          toastError(data.error ?? "El subdominio ya está en uso");
          setStep("store");
          setFieldErrors({ slug: data.error ?? "Subdominio no disponible" });
        } else if (res.status === 400) {
          toastError("Revisa los datos del formulario");
          setStep("account");
        } else if (res.status === 429) {
          toastError("Demasiados intentos. Espera unos minutos.");
        } else {
          toastError(data.error ?? "Error al crear la tienda. Intenta nuevamente.");
        }
        return;
      }

      draft.clear();
      toastSuccess(data.message ?? "Tienda creada exitosamente");

      // Redirigir al wizard de setup
      setTimeout(() => router.push("/setup"), 1200);
    } catch {
      toastError("Error de red. Verifica tu conexión e intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Indicador de slug ─────────────────────────────────────────────────────

  const slugIndicator =
    slugStatus === "checking"
      ? { colorCls: "text-yellow-600 dark:text-yellow-400", label: "Verificando..." }
      : slugStatus === "available"
        ? { colorCls: "text-green-600 dark:text-green-400", label: "Disponible" }
        : slugStatus === "taken"
          ? { colorCls: "text-red-500 dark:text-red-400", label: "No disponible" }
          : null;

  const steps: Step[] = ["account", "store", "confirm"];
  const stepIdx = steps.indexOf(step);
  const stepLabels = ["Mi cuenta", "Mi tienda", "Confirmar"];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-linear-to-br from-[#e6f7f6] to-[#f0faf9] dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">

        {/* Header + Stepper */}
        <div
          className="px-6 py-8 text-center"
          style={{ background: "linear-gradient(135deg, #00B4A6 0%, #007a73 100%)" }}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg font-bold">B</span>
            </div>
            <span className="text-white font-semibold text-lg">Buleje ERP</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Crea tu tienda gratis</h1>
          <p className="text-white/80 mt-1 text-sm">
            14 dias de prueba sin tarjeta de credito
          </p>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={[
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                    i < stepIdx
                      ? "bg-white text-[#00B4A6]"
                      : i === stepIdx
                        ? "bg-white text-[#00B4A6] ring-2 ring-white/40"
                        : "bg-white/20 text-white/60",
                  ].join(" ")}
                >
                  {i < stepIdx ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={[
                    "text-xs hidden sm:inline",
                    i <= stepIdx ? "text-white font-medium" : "text-white/50",
                  ].join(" ")}
                >
                  {label}
                </span>
                {i < 2 && <div className="w-6 h-px bg-white/30" />}
              </div>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div className="px-6 py-6">

          {/* Paso 1: Cuenta */}
          {step === "account" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 text-lg">
                Tus datos de acceso
              </h2>

              <FormField label="Tu nombre completo" error={fieldErrors.adminName}>
                <input
                  type="text"
                  placeholder="Juan Perez"
                  value={form.adminName}
                  onChange={(e) => setForm((p) => ({ ...p, adminName: e.target.value }))}
                  className={inputCls(!!fieldErrors.adminName)}
                  autoComplete="name"
                />
              </FormField>

              <FormField label="Correo electrónico" error={fieldErrors.ownerEmail}>
                <input
                  type="email"
                  placeholder="juan@micorreo.com"
                  value={form.ownerEmail}
                  onChange={(e) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))}
                  className={inputCls(!!fieldErrors.ownerEmail)}
                  autoComplete="email"
                />
              </FormField>

              <FormField label="Usuario de acceso" error={fieldErrors.adminUsername}>
                <input
                  type="text"
                  placeholder="juan.perez"
                  value={form.adminUsername}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      adminUsername: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""),
                    }))
                  }
                  className={inputCls(!!fieldErrors.adminUsername)}
                  autoComplete="username"
                />
              </FormField>

              <FormField label="Contrasena" error={fieldErrors.adminPassword}>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 10 chars, 1 mayuscula, 1 número, 1 especial"
                    value={form.adminPassword}
                    onChange={(e) => setForm((p) => ({ ...p, adminPassword: e.target.value }))}
                    className={inputCls(!!fieldErrors.adminPassword) + " pr-10"}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </FormField>

              <FormField label="Teléfono / WhatsApp (opcional)" error={fieldErrors.ownerPhone}>
                <input
                  type="tel"
                  placeholder="+51 961 234 567"
                  value={form.ownerPhone}
                  onChange={(e) => setForm((p) => ({ ...p, ownerPhone: e.target.value }))}
                  className={inputCls(!!fieldErrors.ownerPhone)}
                />
              </FormField>
            </div>
          )}

          {/* Paso 2: Tienda */}
          {step === "store" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 text-lg">
                Datos de tu tienda
              </h2>

              <FormField label="Nombre de tu tienda" error={fieldErrors.storeName}>
                <input
                  type="text"
                  placeholder="Bodega Dona Maria"
                  value={form.storeName}
                  onChange={(e) => {
                    const storeName = e.target.value;
                    setForm((p) => ({
                      ...p,
                      storeName,
                      slug: p.slug || slugify(storeName),
                    }));
                  }}
                  className={inputCls(!!fieldErrors.storeName)}
                />
              </FormField>

              <FormField
                label="Subdominio de tu tienda"
                error={fieldErrors.slug}
                hint={
                  slugIndicator ? (
                    <span className={`text-xs flex items-center gap-1 ${slugIndicator.colorCls}`}>
                      {slugStatus === "checking" && (
                        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin inline-block" />
                      )}
                      {slugStatus === "available" && "✓"}
                      {slugStatus === "taken" && "✗"}
                      {slugIndicator.label}
                      {slugStatus === "taken" && slugSuggestion && (
                        <button
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, slug: slugSuggestion }))}
                          className="ml-1 underline text-[#00B4A6] hover:text-[#008f88]"
                        >
                          Usar &quot;{slugSuggestion}&quot;
                        </button>
                      )}
                    </span>
                  ) : null
                }
              >
                <div
                  className={[
                    "flex items-center rounded-xl border overflow-hidden transition",
                    fieldErrors.slug
                      ? "border-red-400 focus-within:border-red-500"
                      : "border-gray-200 focus-within:border-[#00B4A6] focus-within:ring-1 focus-within:ring-[#00B4A6]",
                    "dark:border-gray-600",
                  ].join(" ")}
                >
                  <span className="px-3 text-gray-400 text-xs bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-600 py-3 shrink-0 select-none">
                    buleje.pe/
                  </span>
                  <input
                    type="text"
                    placeholder="mi-tienda"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                      }))
                    }
                    className="flex-1 px-3 py-3 text-sm outline-none bg-white dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
              </FormField>

              {/* Seleccion de plan */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Elige tu plan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PLAN_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, plan: opt.id }))}
                      className={[
                        "relative rounded-xl border-2 p-3 text-left transition-all",
                        form.plan === opt.id
                          ? "border-[#00B4A6] bg-[#e6f7f6] dark:bg-[#00B4A6]/10"
                          : "border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]/50",
                      ].join(" ")}
                    >
                      {opt.highlight && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#f4a261] text-white text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                          Popular
                        </span>
                      )}
                      <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{opt.label}</p>
                      <p className="text-[#00B4A6] text-xs font-medium mt-0.5">{opt.price}</p>
                      <ul className="mt-1.5 space-y-0.5">
                        {opt.features.map((f) => (
                          <li key={f} className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-gray-400 flex items-start gap-1">
                            <span className="text-[#00B4A6] shrink-0">·</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paso 3: Confirmacion */}
          {step === "confirm" && (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 text-lg">
                Confirma los datos
              </h2>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm space-y-2.5">
                <SummaryRow label="Nombre" value={form.adminName} />
                <SummaryRow label="Email" value={form.ownerEmail} />
                <SummaryRow label="Usuario" value={form.adminUsername} />
                <SummaryRow label="Tienda" value={form.storeName} />
                <SummaryRow label="URL" value={`buleje.pe/${form.slug}`} />
                <SummaryRow
                  label="Plan"
                  value={
                    form.plan === "free"
                      ? "Free (14 dias trial)"
                      : form.plan === "pro"
                        ? "Pro — S/ 49/mes"
                        : "Business — S/ 99/mes"
                  }
                />
                {form.ownerPhone && (
                  <SummaryRow label="Teléfono" value={form.ownerPhone} />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Al registrarte aceptas los terminos de uso y la politica de privacidad.
                Tu tienda incluira <strong>productos de ejemplo</strong> que puedes
                editar de inmediato. El trial incluye todas las funciones sin
                restricciones durante 14 dias.
              </p>
            </div>
          )}

          {/* Botones de navegacion */}
          <div className="flex gap-3 mt-6">
            {step !== "account" && (
              <button
                type="button"
                onClick={handleBack}
                disabled={submitting}
                className="min-h-[44px] flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition"
              >
                Atras
              </button>
            )}

            {step !== "confirm" ? (
              <button
                type="button"
                onClick={handleNext}
                className="min-h-[44px] flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition"
                style={{ backgroundColor: "#00B4A6" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#008f88"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#00B4A6"; }}
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="min-h-[44px] flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition flex items-center justify-center gap-2"
                style={{ backgroundColor: "#00B4A6" }}
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creando tienda...
                  </>
                ) : (
                  "Crear mi tienda gratis"
                )}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
            Ya tienes cuenta?{" "}
            <a
              href="/admin/login"
              className="font-medium hover:underline"
              style={{ color: "#00B4A6" }}
            >
              Inicia sesion
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1">{hint}</div>}
      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0 last:pb-0">
      <span className="text-gray-500 dark:text-gray-400 shrink-0">{label}:</span>
      <span className="font-medium text-gray-800 dark:text-gray-100 text-right break-all">
        {value}
      </span>
    </div>
  );
}
