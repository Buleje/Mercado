"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PaymentStep, { type RegistrationPayload } from "@/components/marketplace/PaymentStep";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import {
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  Tag,
  FileText,
  Loader2,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  Zap,
  DollarSign,
  Sparkles,
  MessageCircle,
  Check,
  Locate,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "bodega", label: "Bodega" },
  { value: "minimarket", label: "Minimarket" },
  { value: "fruteria", label: "Frutería" },
  { value: "panaderia", label: "Panadería" },
  { value: "licoreria", label: "Licorería" },
  { value: "farmacia", label: "Farmacia" },
  { value: "libreria", label: "Librería" },
  { value: "ferreteria", label: "Ferretería" },
  { value: "restaurante", label: "Restaurante" },
  { value: "otro", label: "Otro" },
];

type FormStep = "info" | "details" | "payment" | "success";

const VALID_PLANS: ReadonlySet<PlanTier> = new Set(["basico", "pro", "enterprise", "max"]);
const VALID_CYCLES = new Set(["mensual", "anual"]);

const INPUT_BASE =
  "w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15 outline-none";

export default function StoreRegistrationForm() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<FormStep>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");

  // Plan + ciclo persistidos desde /abrir-tienda#planes (URL ?plan=&cycle=).
  // Brandon mayo 2026: cuando el cliente clickea un plan, el plan elegido
  // viaja por URL hasta acá y termina en el cobro — sin reselecciones.
  const planParam = (searchParams?.get("plan") ?? "basico") as PlanTier;
  const cycleParam = searchParams?.get("cycle") === "anual" ? "anual" : "mensual";
  const [planTier] = useState<PlanTier>(VALID_PLANS.has(planParam) ? planParam : "basico");
  const [billingCycle] = useState<"mensual" | "anual">(VALID_CYCLES.has(cycleParam) ? (cycleParam as "mensual" | "anual") : "mensual");

  // Step 1: Owner info
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  // Step 2: Store details
  const [storeNameInput, setStoreNameInput] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bodega");
  const [departamento, setDepartamento] = useState("");
  const [provincia, setProvincia] = useState("");
  const [distrito, setDistrito] = useState("");
  const [direccion, setDireccion] = useState("");
  const [departamentos, setDepartamentos] = useState<{ code: string; nombre: string }[]>([]);
  const [provincias, setProvincias] = useState<{ code: string; nombre: string }[]>([]);
  const [distritos, setDistritos] = useState<{ code: string; nombre: string }[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Cargar departamentos al entrar al step de detalles.
  useEffect(() => {
    if (step !== "details" || departamentos.length > 0) return;
    fetch("/api/marketplace/ubigeo")
      .then((r) => r.json())
      .then((d: { items: { code: string; nombre: string }[] }) => setDepartamentos(d.items ?? []))
      .catch((err) => console.warn("[registrar] departamentos load failed", err));
  }, [step, departamentos.length]);

  // Cargar provincias cuando cambia departamento.
  useEffect(() => {
    if (!departamento) {
      setProvincias([]);
      return;
    }
    fetch(`/api/marketplace/ubigeo?dep=${departamento}`)
      .then((r) => r.json())
      .then((d: { items: { code: string; nombre: string }[] }) => setProvincias(d.items ?? []))
      .catch((err) => console.warn("[registrar] provincias load failed", err));
  }, [departamento]);

  // Cargar distritos cuando cambia provincia.
  useEffect(() => {
    if (!departamento || !provincia) {
      setDistritos([]);
      return;
    }
    fetch(`/api/marketplace/ubigeo?dep=${departamento}&prov=${provincia}`)
      .then((r) => r.json())
      .then((d: { items: { code: string; nombre: string }[] }) => setDistritos(d.items ?? []))
      .catch((err) => console.warn("[registrar] distritos load failed", err));
  }, [departamento, provincia]);

  // Botón "Usar mi ubicación actual" — geo + reverse-geocode + match ubigeo.
  const handleUseMyLocation = useCallback(() => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(`/api/marketplace/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          if (!r.ok) throw new Error("geocoder failed");
          const data: {
            departamento: string | null;
            provincia: string | null;
            distrito: string | null;
            direccion: string | null;
          } = await r.json();

          // Buscar codigos correspondientes a los nombres devueltos.
          if (data.departamento) {
            const allDeps = await fetch("/api/marketplace/ubigeo").then((x) => x.json()) as { items: { code: string; nombre: string }[] };
            const dep = allDeps.items.find((d) => d.nombre.toLowerCase() === data.departamento!.toLowerCase());
            if (dep) {
              setDepartamento(dep.code);
              if (data.provincia) {
                const provs = await fetch(`/api/marketplace/ubigeo?dep=${dep.code}`).then((x) => x.json()) as { items: { code: string; nombre: string }[] };
                const prov = provs.items.find((p) => p.nombre.toLowerCase() === data.provincia!.toLowerCase());
                if (prov) {
                  setProvincia(prov.code);
                  if (data.distrito) {
                    const dists = await fetch(`/api/marketplace/ubigeo?dep=${dep.code}&prov=${prov.code}`).then((x) => x.json()) as { items: { code: string; nombre: string }[] };
                    const dist = dists.items.find((d) => d.nombre.toLowerCase() === data.distrito!.toLowerCase());
                    if (dist) setDistrito(dist.code);
                  }
                }
              }
            }
          }
          if (data.direccion) setDireccion(data.direccion);
        } catch {
          setGeoError("No pudimos detectar tu dirección. Llená los campos manualmente.");
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError("Permiso de ubicación denegado. Llená los campos manualmente.");
        } else {
          setGeoError("No pudimos obtener tu ubicación. Llená los campos manualmente.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);

    if (!ownerName.trim() || ownerName.trim().length < 2) {
      setError("Escribe tu nombre completo");
      return;
    }
    if (!ownerPhone.trim() || ownerPhone.replace(/\D/g, "").length < 6) {
      setError("Escribe tu número de teléfono");
      return;
    }
    if (!storeNameInput.trim() || storeNameInput.trim().length < 2) {
      setError("Escribe el nombre de tu tienda");
      return;
    }

    setLoading(true);
    try {
      // Brandon mayo 2026: el flujo viejo creaba una "application" via
      // /api/marketplace/stores/apply. Ahora la creación del tenant se
      // dispara recién cuando el superadmin aprueba el pago — por eso
      // saltamos el apply y vamos directo al paso de pago. El
      // PaymentProof persiste TODOS los datos del registro.
      setStoreName(storeNameInput);
      setStep("payment");
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
    }
    setLoading(false);
  }, [ownerName, ownerPhone, ownerEmail, storeNameInput, description, category, departamento, provincia, distrito, direccion, distritos, provincias]);

  // ── Payment step — Yape/Plin/Transfer/Stripe ──────────────────────────
  if (step === "payment") {
    const distritoName = distritos.find((d) => d.code === distrito)?.nombre ?? null;
    const provinciaName = provincias.find((p) => p.code === provincia)?.nombre ?? null;
    const departamentoName = departamentos.find((d) => d.code === departamento)?.nombre ?? null;
    // Slug auto-derivado del nombre de la tienda. El superadmin puede
    // editarlo después si choca con otro tenant.
    const tenantSlug = storeNameInput
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48);
    const payload: RegistrationPayload = {
      tenantSlug: tenantSlug || `tienda-${Date.now()}`,
      ownerName: ownerName.trim(),
      ownerPhone: ownerPhone.trim(),
      ownerEmail: ownerEmail.trim() || null,
      storeName: storeNameInput.trim(),
      category,
      departamento: departamentoName,
      provincia: provinciaName,
      distrito: distritoName,
      direccion: direccion.trim() || null,
      planTier,
      billingCycle,
    };
    return (
      <div className="min-h-screen bg-[var(--surface-sunken)] py-10">
        <PaymentStep data={payload} onSuccess={() => setStep("success")} />
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[var(--surface-sunken)]">
        <div className="max-w-xl w-full">
          <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-8 sm:p-10 shadow-sm text-center">
            <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]">
              <CheckCircle className="h-10 w-10" strokeWidth={2} />
            </div>
            <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-500)]">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              Solicitud enviada
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
              ¡Listo, <span className="text-[var(--accent)]">{storeName}</span>!
            </h1>
            <p className="mt-3 text-base text-[var(--text-secondary)]">
              Estamos revisando tu tienda. Te avisamos por WhatsApp en cuanto esté lista para vender.
            </p>

            <div className="mt-8 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-5 text-left">
              <p className="mb-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                ¿Qué sigue?
              </p>
              <ol className="space-y-3.5">
                {[
                  "Recibirás un WhatsApp de confirmación",
                  "Revisamos tu solicitud (máximo 24 horas)",
                  "Te damos acceso al panel para subir productos",
                  "Tu tienda aparece en el marketplace",
                ].map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm font-semibold text-[var(--text-primary)]">
                    <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white text-xs font-black tabular-nums">
                      {i + 1}
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>

            <Link
              href="/marketplace"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--text-primary)] px-6 text-sm font-black text-[var(--surface-canvas)] shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
            >
              Volver al Marketplace
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form (steps 1 & 2) ────────────────────────────────────────────────
  const stepIndex = step === "info" ? 1 : 2;
  const stepProgress = step === "info" ? 50 : 100;

  return (
    <div className="min-h-screen bg-[var(--surface-sunken)]">
      {/* Hero compacto */}
      <section className="relative overflow-hidden border-b border-[var(--rule-base)] bg-linear-to-b from-[var(--surface-canvas)] to-[var(--surface-sunken)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="text-center">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-1 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              Sumate gratis al marketplace
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-[var(--ls-tight)] text-[var(--text-primary)] sm:text-5xl lg:text-[3.5rem]">
              Abre tu tienda en{" "}
              <span className="text-[var(--accent)]">5 minutos</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--text-secondary)] leading-relaxed">
              Vendé tus productos a toda Pucallpa desde el marketplace más grande de la ciudad.
              <strong className="font-bold text-[var(--text-primary)]"> Sin tarjeta. Sin permanencia.</strong>
            </p>

            {/* Trust badges */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              {[
                { icon: Zap, label: "Listo en 24h", tone: "amber" as const },
                { icon: DollarSign, label: "Sin costo fijo", tone: "success" as const },
                { icon: ShieldCheck, label: "Pagos seguros", tone: "accent" as const },
              ].map((b) => (
                <span
                  key={b.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-xs font-bold",
                    b.tone === "amber" &&
                      "border-amber-300 bg-amber-50 text-[var(--data-warning-700)] dark:border-[var(--data-warning-500)]/30 dark:bg-[var(--data-warning-500)]/10 dark:text-amber-400",
                    b.tone === "success" &&
                      "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 text-[var(--data-success-500)]",
                    b.tone === "accent" &&
                      "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]",
                  )}
                >
                  <b.icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Layout 2 columnas: form (8) + sidebar (4) */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,_1fr)_340px] lg:gap-8">
          {/* ── Form ──────────────────────────────────────────────── */}
          <div className="order-2 lg:order-1 space-y-5">
            {/* Stepper visual */}
            <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-sm">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Paso {stepIndex} de 2
                </p>
                <p className="text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                  {stepProgress}% completo
                </p>
              </div>
              <div
                role="progressbar"
                aria-valuenow={stepProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] mb-4"
              >
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${stepProgress}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStep("info")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    step === "info"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black tabular-nums",
                      step === "info"
                        ? "bg-[var(--accent-600,var(--accent))] text-white"
                        : stepIndex > 1
                          ? "bg-[var(--data-success-500)] text-white"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                    )}
                  >
                    {stepIndex > 1 ? <Check className="h-4 w-4" strokeWidth={3} /> : "1"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                      Paso 1
                    </p>
                    <p className="mt-0.5 text-sm font-black text-[var(--text-primary)] truncate">
                      Tus datos
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      ownerName.trim().length >= 2 &&
                      ownerPhone.replace(/\D/g, "").length >= 6
                    ) {
                      setStep("details");
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    step === "details"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black tabular-nums",
                      step === "details"
                        ? "bg-[var(--accent-600,var(--accent))] text-white"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                    )}
                  >
                    2
                  </span>
                  <div className="min-w-0">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                      Paso 2
                    </p>
                    <p className="mt-0.5 text-sm font-black text-[var(--text-primary)] truncate">
                      Tu tienda
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Form card */}
            <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 shadow-sm sm:p-8 lg:p-10">
              {/* Step header */}
              <div className="mb-6 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-base font-black tabular-nums text-white shadow-sm">
                  {stepIndex}
                </span>
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                    {step === "info" ? "Empezamos por vos" : "Ahora hablemos del negocio"}
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                    {step === "info" ? "Tus datos de contacto" : "Datos de tu tienda"}
                  </h2>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 px-4 py-3.5 text-sm font-bold text-[var(--data-error-500)]"
                >
                  <span aria-hidden className="text-lg leading-none">!</span>
                  <span>{error}</span>
                </div>
              )}

              {/* ── Step 1: Owner info ──────────────────────────── */}
              {step === "info" && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="reg-owner-name" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <User className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tu nombre completo <span className="text-[var(--data-error-500)]">*</span>
                    </label>
                    <input
                      id="reg-owner-name"
                      type="text"
                      name="ownerName"
                      autoComplete="name"
                      required
                      minLength={2}
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Ej: María García"
                      className={INPUT_BASE}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-owner-phone" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <Phone className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tu WhatsApp <span className="text-[var(--data-error-500)]">*</span>
                    </label>
                    <input
                      id="reg-owner-phone"
                      type="tel"
                      name="ownerPhone"
                      autoComplete="tel"
                      inputMode="tel"
                      required
                      pattern="[0-9 ()+-]{6,}"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="Ej: 961 234 567"
                      className={INPUT_BASE}
                    />
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Te contactaremos por aquí
                    </p>
                  </div>
                  <div>
                    <label htmlFor="reg-owner-email" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <Mail className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Email{" "}
                      <span className="text-xs font-semibold text-[var(--text-tertiary)]">
                        (opcional)
                      </span>
                    </label>
                    <input
                      id="reg-owner-email"
                      type="email"
                      name="ownerEmail"
                      autoComplete="email"
                      inputMode="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="maria@ejemplo.com"
                      className={INPUT_BASE}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      if (ownerName.trim().length < 2) {
                        setError("Escribe tu nombre completo");
                        return;
                      }
                      if (ownerPhone.replace(/\D/g, "").length < 6) {
                        setError("Escribe tu número de WhatsApp");
                        return;
                      }
                      setStep("details");
                    }}
                    className="mt-2 inline-flex w-full h-14 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-black text-white shadow-md transition-all hover:scale-[1.01] hover:shadow-lg"
                  >
                    Siguiente
                    <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* ── Step 2: Store details ──────────────────────── */}
              {step === "details" && (
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <Store className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Nombre de tu tienda <span className="text-[var(--data-error-500)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={storeNameInput}
                      onChange={(e) => setStoreNameInput(e.target.value)}
                      placeholder="Ej: Bodega Don Pedro"
                      className={INPUT_BASE}
                    />
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <Tag className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tipo de negocio
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setCategory(cat.value)}
                          className={cn(
                            "h-12 rounded-xl border-2 px-3 text-sm font-bold transition-all",
                            category === cat.value
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm"
                              : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)]",
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                        <MapPin className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                        Dirección de la tienda
                      </h4>
                      <button
                        type="button"
                        onClick={handleUseMyLocation}
                        disabled={geoLoading}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:scale-[1.02] hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {geoLoading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                            Detectando…
                          </>
                        ) : (
                          <>
                            <Locate className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Usar mi ubicación
                          </>
                        )}
                      </button>
                    </div>

                    {geoError && (
                      <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-[var(--data-error-700)] dark:bg-red-950 dark:text-red-300">
                        {geoError}
                      </p>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                          Departamento
                        </label>
                        <select
                          value={departamento}
                          onChange={(e) => {
                            setDepartamento(e.target.value);
                            setProvincia("");
                            setDistrito("");
                          }}
                          className={INPUT_BASE}
                        >
                          <option value="">Selecciona…</option>
                          {departamentos.map((d) => (
                            <option key={d.code} value={d.code}>{d.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                          Provincia
                        </label>
                        <select
                          value={provincia}
                          onChange={(e) => {
                            setProvincia(e.target.value);
                            setDistrito("");
                          }}
                          disabled={!departamento}
                          className={cn(INPUT_BASE, "disabled:cursor-not-allowed disabled:opacity-50")}
                        >
                          <option value="">Selecciona…</option>
                          {provincias.map((p) => (
                            <option key={p.code} value={p.code}>{p.nombre}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                          Distrito
                        </label>
                        <select
                          value={distrito}
                          onChange={(e) => setDistrito(e.target.value)}
                          disabled={!provincia}
                          className={cn(INPUT_BASE, "disabled:cursor-not-allowed disabled:opacity-50")}
                        >
                          <option value="">Selecciona…</option>
                          {distritos.map((d) => (
                            <option key={d.code} value={d.code}>{d.nombre}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Dirección{" "}
                        <span className="font-semibold normal-case tracking-normal text-[var(--text-tertiary)]">
                          (calle y número)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        placeholder="Ej: Jr. Huáscar 123"
                        className={INPUT_BASE}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <FileText className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Descripción corta{" "}
                      <span className="text-xs font-semibold text-[var(--text-tertiary)]">
                        (opcional)
                      </span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Cuéntanos de tu negocio en 1-2 líneas…"
                      className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] placeholder:font-normal transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15 outline-none resize-none"
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setStep("info")}
                      className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold text-[var(--text-primary)] transition-all hover:border-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={loading}
                      className="inline-flex h-14 flex-[2] items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-base font-black text-white shadow-md transition-all hover:scale-[1.01] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
                          Enviando…
                        </>
                      ) : (
                        <>
                          <Store className="h-5 w-5" strokeWidth={2.25} />
                          Registrar mi tienda
                          <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-[var(--text-tertiary)]">
              Al registrarte aceptas los{" "}
              <Link
                href="/terminos"
                className="font-bold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                términos y condiciones
              </Link>
              .
            </p>
          </div>

          {/* ── Sidebar: value props + testimonio + soporte ─────── */}
          <aside className="order-1 lg:order-2">
            <div className="sticky top-24 space-y-4">
              {/* Stats card */}
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-sm">
                <p className="mb-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Bodegas en Buleje
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                      120<span className="text-[var(--accent)]">+</span>
                    </p>
                    <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                      Tiendas activas
                    </p>
                  </div>
                  <div>
                    <p className="text-3xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                      4.8<span className="text-[var(--accent)]">★</span>
                    </p>
                    <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                      Satisfacción
                    </p>
                  </div>
                  <div>
                    <p className="text-3xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                      24h
                    </p>
                    <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                      Activación
                    </p>
                  </div>
                  <div>
                    <p className="text-3xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                      0%
                    </p>
                    <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                      Costo fijo
                    </p>
                  </div>
                </div>
              </div>

              {/* Por qué Buleje */}
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-sm">
                <p className="mb-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Por qué Buleje
                </p>
                <ul className="space-y-3">
                  {[
                    "Sin costo de inscripción",
                    "Comisión solo sobre ventas reales",
                    "Pagos por Yape, Plin o efectivo",
                    "Soporte WhatsApp 7 días",
                    "Cancelás cuando quieras",
                  ].map((vp) => (
                    <li key={vp} className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {vp}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Testimonio */}
              <div className="rounded-2xl border-2 border-[var(--accent)]/20 bg-[var(--accent-soft)]/30 p-5 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                    Bodegueros felices
                  </p>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-[var(--text-primary)]">
                  &ldquo;En el primer mes recibí <strong>32 pedidos</strong> nuevos
                  sin hacer publicidad. Es lo más simple que probé.&rdquo;
                </p>
                <p className="mt-3 text-xs font-bold text-[var(--text-secondary)]">
                  — Don Pepe, Bodega Don Pepe
                </p>
              </div>

              {/* Soporte */}
              <a
                href="https://wa.me/51929340532?text=Hola%2C%20tengo%20una%20duda%20sobre%20cómo%20abrir%20mi%20tienda"
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
