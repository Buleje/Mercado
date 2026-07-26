"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Loader2, Check, ChevronDown } from "@buleje/design-system/icons";
import {
  MotoIcon,
  BiciIcon,
  CarIcon,
  WalkIcon,
  PinIcon,
  CashIcon,
  ClockBadge,
  ShieldBadge,
  CheckBadge,
  LiveSignal,
  MapBadge,
  PackageIcon,
} from "@/components/delivery/icons";

// ─── Tipos ────────────────────────────────────────────────────────────────

type VehicleType = "moto" | "bicicleta" | "auto" | "a_pie";
type LicenseCategory =
  | ""
  | "A-I"
  | "A-IIa"
  | "A-IIb"
  | "B-IIa"
  | "B-IIb"
  | "B-IIc";

type FormState = {
  // Identidad
  name: string;
  dni: string;
  birthDate: string;
  phone: string;
  email: string;
  // Operación
  zones: string[];
  zoneOther: string;
  anyZone: boolean;
  vehicleType: VehicleType;
  availability: string;
  // KYC vehicular
  licenseNumber: string;
  licenseCategory: LicenseCategory;
  licenseExpiresAt: string;
  vehiclePlate: string;
  soatNumber: string;
  soatExpiresAt: string;
  // Consentimientos
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  confirmAdult: boolean;
};

// ─── Datos estáticos ──────────────────────────────────────────────────────

const ZONES = ["Centro", "Norte", "Sur", "Este", "Oeste"];

// ─── Contenido de venta (landing de reclutamiento) ────────────────────────
const HOW_STEPS: { n: string; title: string; desc: string }[] = [
  { n: "1", title: "Inscribite", desc: "Completá el formulario en 4 pasos. Toma 2 minutos." },
  { n: "2", title: "Validamos tus datos", desc: "Revisamos tu DNI y documentos. Te activamos en menos de 24 h." },
  { n: "3", title: "Recibí pedidos", desc: "Te llegan pedidos de tiendas cercanas directo a la app." },
  { n: "4", title: "Entregá y cobrá", desc: "Llevás el pedido y cobrás tarifa + propina al instante." },
];

const REQUISITOS: string[] = [
  "Ser mayor de 18 años y tener DNI vigente.",
  "Un smartphone con internet para usar la app.",
  "Una movilidad: moto, bicicleta, auto o a pie (según tu zona).",
  "Para moto o auto: licencia de conducir y SOAT vigentes.",
];

const REPARTIDOR_FAQS: { q: string; a: string }[] = [
  { q: "¿Cuánto puedo ganar?", a: "Depende de cuántos pedidos tomes. Cobrás una tarifa base por entrega y te quedás con el 100% de las propinas. Mientras más repartís, más ganás." },
  { q: "¿Cuándo y cómo cobro?", a: "Cobrás por cada entrega. Los pagos en efectivo los recibís directo del cliente y se liquidan según el esquema de tu zona." },
  { q: "¿Necesito tener moto?", a: "No. Podés repartir en moto, bicicleta, auto o incluso a pie, según la zona y el tipo de pedido." },
  { q: "¿Qué documentos necesito?", a: "Tu DNI vigente. Si usás moto o auto, además te pedimos tu licencia de conducir y SOAT vigentes." },
  { q: "¿Cuánto tarda la activación?", a: "Revisamos tus datos y te activamos en menos de 24 horas hábiles. Te avisamos por WhatsApp." },
  { q: "¿Tiene algún costo inscribirme?", a: "No. La inscripción es totalmente gratis y sin compromiso." },
];

const VEHICLES: { id: VehicleType; label: string; desc: string; Icon: typeof MotoIcon }[] = [
  { id: "moto", label: "Moto", desc: "Pedidos rápidos · zona amplia", Icon: MotoIcon },
  { id: "bicicleta", label: "Bicicleta", desc: "Ágil · centro y barrios", Icon: BiciIcon },
  { id: "auto", label: "Auto", desc: "Pedidos grandes · 4+ km", Icon: CarIcon },
  { id: "a_pie", label: "A pie", desc: "Distancias cortas", Icon: WalkIcon },
];

const AVAILABILITIES = [
  { id: "manana", label: "Mañanas", hint: "8 am – 1 pm" },
  { id: "tarde", label: "Tardes", hint: "1 pm – 7 pm" },
  { id: "noche", label: "Noches", hint: "7 pm – 11 pm" },
  { id: "full", label: "Todo el día", hint: "Más entregas, más ingresos" },
  { id: "fines", label: "Fines de semana", hint: "Solo sábado y domingo" },
];

const LICENSE_OPTIONS_MOTO: { id: Exclude<LicenseCategory, "">; label: string; hint: string }[] = [
  { id: "A-I", label: "A-I", hint: "Hasta 250 cc" },
  { id: "A-IIa", label: "A-IIa", hint: "250–500 cc" },
  { id: "A-IIb", label: "A-IIb", hint: "Más de 500 cc" },
];

const LICENSE_OPTIONS_AUTO: { id: Exclude<LicenseCategory, "">; label: string; hint: string }[] = [
  { id: "B-IIa", label: "B-IIa", hint: "Particular" },
  { id: "B-IIb", label: "B-IIb", hint: "Profesional" },
  { id: "B-IIc", label: "B-IIc", hint: "Taxi" },
];

const STEPS = [
  { id: 1, label: "Identidad", subtitle: "Quién eres", Icon: PackageIcon },
  { id: 2, label: "Operación", subtitle: "Cómo trabajas", Icon: MapBadge },
  { id: 3, label: "Documentos", subtitle: "Requisitos legales", Icon: ShieldBadge },
  { id: 4, label: "Confirmar", subtitle: "Revisa y envía", Icon: CheckBadge },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildZoneString(state: FormState): string {
  if (state.anyZone) return "Cualquier zona";
  const parts = [...state.zones];
  const other = state.zoneOther.trim();
  if (other) parts.push(other);
  return parts.join(", ").slice(0, 80);
}

function maxBirthDateIso(): string {
  return new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Página ───────────────────────────────────────────────────────────────

export default function RepartidorPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<FormState>({
    name: "",
    dni: "",
    birthDate: "",
    phone: "",
    email: "",
    zones: [],
    zoneOther: "",
    anyZone: false,
    vehicleType: "moto",
    availability: "",
    licenseNumber: "",
    licenseCategory: "",
    licenseExpiresAt: "",
    vehiclePlate: "",
    soatNumber: "",
    soatExpiresAt: "",
    acceptedTerms: false,
    acceptedPrivacy: false,
    confirmAdult: false,
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMotor = form.vehicleType === "moto" || form.vehicleType === "auto";

  // Validaciones por paso (memoizadas, llaman a stepIsValid en cada cambio)
  const validations = useMemo(() => {
    const step1 =
      form.name.trim().length >= 2 &&
      /^\d{8}$/.test(form.dni) &&
      !!form.birthDate &&
      new Date(form.birthDate) <= new Date(maxBirthDateIso()) &&
      form.phone.trim().length >= 6;
    const zoneOk =
      form.anyZone || form.zones.length > 0 || form.zoneOther.trim().length > 0;
    const step2 = zoneOk && !!form.vehicleType && !!form.availability;
    const step3 = !isMotor || (
      form.licenseNumber.trim().length >= 6 &&
      !!form.licenseCategory &&
      !!form.licenseExpiresAt &&
      new Date(form.licenseExpiresAt) > new Date() &&
      form.vehiclePlate.trim().length >= 5 &&
      form.soatNumber.trim().length >= 4 &&
      !!form.soatExpiresAt &&
      new Date(form.soatExpiresAt) > new Date()
    );
    const step4 = form.acceptedTerms && form.acceptedPrivacy && form.confirmAdult;
    return { step1, step2, step3, step4 };
  }, [form, isMotor]);

  const currentValid = validations[`step${step}` as keyof typeof validations];
  const allValid =
    validations.step1 && validations.step2 && validations.step3 && validations.step4;

  // Validez por campo (feedback ✓ en vivo) + progreso del formulario.
  const fld = {
    name: form.name.trim().length >= 2,
    dni: /^\d{8}$/.test(form.dni),
    birth: !!form.birthDate && new Date(form.birthDate) <= new Date(maxBirthDateIso()),
    phone: form.phone.trim().length >= 6,
    email: form.email.trim() !== "" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email),
    licenseNumber: form.licenseNumber.trim().length >= 6,
    plate: form.vehiclePlate.trim().length >= 5,
    soatNumber: form.soatNumber.trim().length >= 4,
    licenseExp: !!form.licenseExpiresAt && new Date(form.licenseExpiresAt) > new Date(),
    soatExp: !!form.soatExpiresAt && new Date(form.soatExpiresAt) > new Date(),
  };
  const completedSteps = [validations.step1, validations.step2, validations.step3, validations.step4].filter(Boolean).length;
  const progressPct = Math.round((completedSteps / 4) * 100);

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleZone = (z: string) =>
    setForm((prev) => {
      const has = prev.zones.includes(z);
      return {
        ...prev,
        zones: has ? prev.zones.filter((x) => x !== z) : [...prev.zones, z],
        anyZone: false,
      };
    });

  const toggleAnyZone = () =>
    setForm((prev) => ({
      ...prev,
      anyZone: !prev.anyZone,
      zones: !prev.anyZone ? [] : prev.zones,
      zoneOther: !prev.anyZone ? "" : prev.zoneOther,
    }));

  const goNext = () => {
    if (!currentValid) {
      setError("Completa los campos resaltados antes de continuar.");
      return;
    }
    setError(null);
    setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goPrev = () => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allValid) {
      setError("Faltan datos en pasos anteriores. Revisa cada paso.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1];
      const payload = {
        name: form.name.trim(),
        dni: form.dni.trim(),
        birthDate: form.birthDate,
        phone: form.phone.trim(),
        zone: buildZoneString(form),
        vehicleType: form.vehicleType,
        availability: form.availability,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(isMotor
          ? {
              licenseNumber: form.licenseNumber.trim().toUpperCase(),
              licenseCategory: form.licenseCategory,
              licenseExpiresAt: form.licenseExpiresAt,
              vehiclePlate: form.vehiclePlate.trim().toUpperCase(),
              soatNumber: form.soatNumber.trim().toUpperCase(),
              soatExpiresAt: form.soatExpiresAt,
            }
          : {}),
        acceptedTerms: form.acceptedTerms,
        acceptedPrivacy: form.acceptedPrivacy,
        confirmAdult: form.confirmAdult,
      };
      const res = await fetch("/api/marketplace/drivers/apply", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar la solicitud");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────
  if (success) {
    return (
      <main className="min-h-screen bg-[var(--surface-canvas)] flex items-center justify-center px-4 py-10">
        <div className="rounded-3xl border-2 border-[var(--accent)] bg-gradient-to-br from-[var(--accent-soft)] to-[var(--surface-raised)] p-8 sm:p-12 max-w-md w-full text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white mb-5">
            <CheckBadge className="h-12 w-12" />
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2">
            ¡Solicitud enviada!
          </h1>
          <p className="text-base text-[var(--text-secondary)] mb-6 leading-relaxed">
            Revisamos tus documentos y te contactamos por WhatsApp en máximo 24 horas.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/25 hover:translate-y-[-1px] transition-transform"
          >
            Volver al Marketplace
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Top: info (izq) + formulario (der), lado a lado ── */}
      <section id="inscripcion" className="mx-auto max-w-7xl scroll-mt-20 px-4 sm:px-6 lg:px-10 py-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-12">
          {/* Info — izquierda (sticky en desktop) */}
          <div className="lg:sticky lg:top-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-primary/10 px-3.5 py-1.5 text-sm font-bold text-[var(--accent)]">
              <LiveSignal className="h-2.5 w-2.5" active />
              Repartí con Buleje
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[2.75rem]">
              Gana repartiendo en tu tiempo.
            </h1>
            <p className="mt-4 max-w-sm text-lg leading-relaxed text-[var(--text-secondary)]">
              Tu moto, tu horario, tu zona. Te quedás con el{" "}
              <strong className="text-[var(--text-primary)]">100% de tus propinas</strong>.
            </p>
            <ul className="mt-8 space-y-4">
              {(
                [
                  { Icon: ClockBadge, label: "Horario libre, sin jefe" },
                  { Icon: CashIcon, label: "Cobrás por entrega + propina" },
                  { Icon: ShieldBadge, label: "Activación en menos de 24 h" },
                ] as const
              ).map(({ Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-base font-semibold text-[var(--text-primary)]">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Formulario — derecha */}
          <div>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">
                Inscribite en 4 pasos
              </h2>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-[var(--accent)]">
                Gratis · 2 min
              </span>
            </div>

            {/* Barra de progreso en vivo */}
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
                <span className="text-[var(--text-tertiary)]">Tu progreso</span>
                <span className="text-[var(--accent)] tabular-nums">{completedSteps} de 4 pasos · {progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <Stepper currentStep={step} validations={validations} onStepClick={(n) => setStep(n)} />

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-7 lg:p-9 space-y-6"
          aria-labelledby="wizard-title"
        >
          <header>
            <p className="text-sm font-extrabold uppercase tracking-wider text-[var(--accent)]">
              Paso {step} de 4
            </p>
            <h2 id="wizard-title" className="mt-1 text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)]">
              {STEPS[step - 1].label}
            </h2>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              {STEPS[step - 1].subtitle}
            </p>
          </header>

          {/* ── Paso 1 — Identidad ──────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <Field label="Nombre completo" htmlFor="rep-name" valid={fld.name}>
                <input
                  id="rep-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Como aparece en tu DNI"
                  className={fld.name ? inputClsOk : inputCls}
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="DNI" htmlFor="rep-dni" hint="8 dígitos sin guiones" valid={fld.dni}>
                  <input
                    id="rep-dni"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{8}"
                    maxLength={8}
                    required
                    value={form.dni}
                    onChange={(e) => update("dni", e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="12345678"
                    className={fld.dni ? inputClsOk : inputCls}
                  />
                </Field>
                <Field
                  label="Fecha de nacimiento"
                  htmlFor="rep-birth"
                  hint="Debes tener al menos 18 años"
                  valid={fld.birth}
                >
                  <input
                    id="rep-birth"
                    type="date"
                    required
                    max={maxBirthDateIso()}
                    value={form.birthDate}
                    onChange={(e) => update("birthDate", e.target.value)}
                    className={fld.birth ? inputClsOk : inputCls}
                  />
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="WhatsApp" htmlFor="rep-phone" hint="Recibirás aquí los pedidos" valid={fld.phone}>
                  <input
                    id="rep-phone"
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="9XX XXX XXX"
                    className={fld.phone ? inputClsOk : inputCls}
                  />
                </Field>
                <Field label="Email (opcional)" htmlFor="rep-email" valid={fld.email}>
                  <input
                    id="rep-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="tu@correo.com"
                    className={fld.email ? inputClsOk : inputCls}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* ── Paso 2 — Operación ──────────────────── */}
          {step === 2 && (
            <div className="space-y-6">
              <Field label="Tipo de vehículo" htmlFor="">
                <div className="grid grid-cols-2 gap-3">
                  {VEHICLES.map((v) => {
                    const active = form.vehicleType === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => update("vehicleType", v.id)}
                        aria-pressed={active}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${
                          active
                            ? "border-[var(--accent)] bg-primary/10"
                            : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                              active
                                ? "bg-[var(--accent-600,var(--accent))] text-white"
                                : "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                            }`}
                          >
                            <v.Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                              {v.label}
                            </p>
                            <p className="text-xs font-semibold text-[var(--text-secondary)] leading-tight mt-0.5">
                              {v.desc}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Zonas donde puedes repartir"
                htmlFor=""
                hint="Marca varias o elige 'Cualquier zona'"
              >
                <button
                  type="button"
                  onClick={toggleAnyZone}
                  aria-pressed={form.anyZone}
                  className={`w-full rounded-2xl border-2 p-4 inline-flex items-center gap-4 text-left transition-all mb-3 ${
                    form.anyZone
                      ? "border-[var(--accent)] bg-primary/10"
                      : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]"
                  }`}
                >
                  <div
                    className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                      form.anyZone
                        ? "bg-[var(--accent-600,var(--accent))] text-white"
                        : "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                    }`}
                  >
                    <MapBadge className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                      Cualquier zona de Ciudad Constitución
                    </p>
                    <p className="text-sm font-semibold text-[var(--text-secondary)] mt-0.5">
                      Recibe pedidos de toda la ciudad
                    </p>
                  </div>
                  <span
                    className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      form.anyZone ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--rule-base)]"
                    }`}
                  >
                    {form.anyZone && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                  </span>
                </button>

                <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  O elige zonas específicas
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {ZONES.map((z) => {
                    const active = !form.anyZone && form.zones.includes(z);
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => toggleZone(z)}
                        disabled={form.anyZone}
                        aria-pressed={active}
                        className={`h-12 rounded-2xl border-2 inline-flex items-center justify-center gap-2 text-sm font-extrabold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          active
                            ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                            : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]"
                        }`}
                      >
                        <PinIcon className="h-4 w-4" />
                        {z}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={form.zoneOther}
                  onChange={(e) => update("zoneOther", e.target.value.slice(0, 30))}
                  disabled={form.anyZone}
                  placeholder="Otra zona o referencia (opcional)"
                  maxLength={30}
                  className={`${inputCls} mt-3 disabled:opacity-40 disabled:cursor-not-allowed`}
                />
              </Field>

              <Field label="Horario disponible" htmlFor="">
                <div className="space-y-2">
                  {AVAILABILITIES.map((a) => {
                    const active = form.availability === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => update("availability", a.id)}
                        aria-pressed={active}
                        className={`w-full h-14 px-4 rounded-2xl border-2 inline-flex items-center justify-between gap-3 text-left transition-all ${
                          active
                            ? "border-[var(--accent)] bg-primary/10"
                            : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--rule-base)]"
                            }`}
                          >
                            {active && <span className="h-2 w-2 rounded-full bg-white" />}
                          </span>
                          <span className="text-base font-extrabold text-[var(--text-primary)]">
                            {a.label}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-[var(--text-tertiary)] shrink-0">
                          {a.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}

          {/* ── Paso 3 — Documentos ──────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              {!isMotor ? (
                <div className="rounded-2xl bg-primary/10 border-2 border-[var(--accent)] p-5 flex items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-[var(--accent-600,var(--accent))] text-white flex items-center justify-center shrink-0">
                    <CheckBadge className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-extrabold text-[var(--text-primary)]">
                      No necesitas documentos vehiculares
                    </p>
                    <p className="mt-1 text-base text-[var(--text-secondary)] leading-relaxed">
                      Para {form.vehicleType === "bicicleta" ? "bicicleta" : "reparto a pie"} no
                      pedimos licencia ni SOAT. Pasa al siguiente paso.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl bg-[var(--brand-secondary)]/10 border-2 border-[var(--brand-secondary)]/30 px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                    Por ley necesitamos verificar tu licencia y SOAT antes de aprobarte. Tus
                    datos se guardan cifrados y solo los ve el equipo de aprobación (Ley 29733).
                  </div>

                  <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 space-y-4">
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                      <ShieldBadge className="h-5 w-5 text-[var(--accent)]" />
                      Licencia de conducir
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="Número de licencia" htmlFor="rep-lic" valid={fld.licenseNumber}>
                        <input
                          id="rep-lic"
                          type="text"
                          value={form.licenseNumber}
                          onChange={(e) =>
                            update("licenseNumber", e.target.value.toUpperCase().slice(0, 12))
                          }
                          placeholder="Q12345678"
                          className={fld.licenseNumber ? inputClsOk : inputCls}
                        />
                      </Field>
                      <Field label="Vencimiento" htmlFor="rep-lic-exp" valid={fld.licenseExp}>
                        <input
                          id="rep-lic-exp"
                          type="date"
                          min={todayIso()}
                          value={form.licenseExpiresAt}
                          onChange={(e) => update("licenseExpiresAt", e.target.value)}
                          className={fld.licenseExp ? inputClsOk : inputCls}
                        />
                      </Field>
                    </div>
                    <Field label="Categoría" htmlFor="">
                      <div className="grid grid-cols-3 gap-2">
                        {(form.vehicleType === "moto" ? LICENSE_OPTIONS_MOTO : LICENSE_OPTIONS_AUTO).map(
                          (opt) => {
                            const active = form.licenseCategory === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => update("licenseCategory", opt.id)}
                                aria-pressed={active}
                                className={`h-16 rounded-2xl border-2 px-3 text-left transition-colors ${
                                  active
                                    ? "bg-primary/10 border-[var(--accent)]"
                                    : "bg-[var(--surface-raised)] border-[var(--rule-base)] hover:border-[var(--text-tertiary)]"
                                }`}
                              >
                                <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                                  {opt.label}
                                </p>
                                <p className="text-xs font-semibold text-[var(--text-secondary)] mt-0.5 leading-tight">
                                  {opt.hint}
                                </p>
                              </button>
                            );
                          },
                        )}
                      </div>
                    </Field>
                  </div>

                  <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 space-y-4">
                    <h3 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                      <ShieldBadge className="h-5 w-5 text-[var(--accent)]" />
                      Vehículo y SOAT
                    </h3>
                    <Field label="Placa del vehículo" htmlFor="rep-plate" hint="Ej: A1B-234" valid={fld.plate}>
                      <input
                        id="rep-plate"
                        type="text"
                        value={form.vehiclePlate}
                        onChange={(e) =>
                          update("vehiclePlate", e.target.value.toUpperCase().slice(0, 10))
                        }
                        placeholder="A1B-234"
                        className={fld.plate ? inputClsOk : inputCls}
                      />
                    </Field>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="N° de SOAT" htmlFor="rep-soat" valid={fld.soatNumber}>
                        <input
                          id="rep-soat"
                          type="text"
                          value={form.soatNumber}
                          onChange={(e) =>
                            update("soatNumber", e.target.value.toUpperCase().slice(0, 30))
                          }
                          placeholder="SOAT-2026-XXXX"
                          className={fld.soatNumber ? inputClsOk : inputCls}
                        />
                      </Field>
                      <Field label="Vencimiento SOAT" htmlFor="rep-soat-exp" valid={fld.soatExp}>
                        <input
                          id="rep-soat-exp"
                          type="date"
                          min={todayIso()}
                          value={form.soatExpiresAt}
                          onChange={(e) => update("soatExpiresAt", e.target.value)}
                          className={fld.soatExp ? inputClsOk : inputCls}
                        />
                      </Field>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Paso 4 — Confirmación ──────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 space-y-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Resumen de tu solicitud
                </h3>
                <SummaryRow label="Nombre" value={form.name || "—"} />
                <SummaryRow label="DNI" value={form.dni || "—"} />
                <SummaryRow label="WhatsApp" value={form.phone || "—"} />
                <SummaryRow label="Vehículo" value={form.vehicleType} />
                <SummaryRow label="Zona" value={buildZoneString(form) || "—"} />
                <SummaryRow
                  label="Horario"
                  value={AVAILABILITIES.find((a) => a.id === form.availability)?.label ?? "—"}
                />
                {isMotor && (
                  <>
                    <SummaryRow label="Licencia" value={`${form.licenseCategory} ${form.licenseNumber}`} />
                    <SummaryRow label="Placa" value={form.vehiclePlate || "—"} />
                    <SummaryRow label="SOAT" value={form.soatNumber || "—"} />
                  </>
                )}
              </div>

              <div className="space-y-3">
                <Consent
                  checked={form.confirmAdult}
                  onChange={(v) => update("confirmAdult", v)}
                  label="Tengo 18 años o más."
                  hint="Requisito legal para trabajar como repartidor (Ley 27261)."
                />
                <Consent
                  checked={form.acceptedTerms}
                  onChange={(v) => update("acceptedTerms", v)}
                  label={
                    <>
                      Acepto los{" "}
                      <Link
                        href="/legal/terminos-repartidor"
                        target="_blank"
                        className="font-extrabold text-[var(--accent)] underline"
                      >
                        términos y condiciones del repartidor
                      </Link>
                      .
                    </>
                  }
                  hint="Cubre tarifas, responsabilidades, seguros y cancelaciones."
                />
                <Consent
                  checked={form.acceptedPrivacy}
                  onChange={(v) => update("acceptedPrivacy", v)}
                  label={
                    <>
                      Autorizo el tratamiento de mis datos según la{" "}
                      <Link
                        href="/legal/privacidad"
                        target="_blank"
                        className="font-extrabold text-[var(--accent)] underline"
                      >
                        Política de Privacidad
                      </Link>{" "}
                      (Ley 29733).
                    </>
                  }
                  hint="Solo usamos tu información para el servicio. Puedes solicitar borrado cuando quieras."
                />
              </div>
            </div>
          )}

          {/* ── Errores ─────────────────────── */}
          {error && (
            <div role="alert" className="rounded-2xl bg-[var(--brand-danger)]/10 border-2 border-[var(--brand-danger)]/30 px-4 py-3 text-sm font-bold text-[var(--brand-danger)]">
              {error}
            </div>
          )}

          {/* ── Navegación ─────────────────── */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={step === 1}
              className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-extrabold text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--surface-sunken)]"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
              Atrás
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!currentValid}
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/25 transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
              >
                Siguiente
                <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !allValid}
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--data-success-500)] text-base font-extrabold text-white shadow-lg shadow-[var(--data-success)]/25 transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Enviar solicitud
                    <Check className="h-5 w-5" strokeWidth={2.5} />
                  </>
                )}
              </button>
            )}
          </div>

          {step === 4 && (
            <p className="text-center text-xs text-[var(--text-tertiary)] pt-2">
              Revisamos tu solicitud en máximo 24 h y te avisamos por WhatsApp.
            </p>
          )}
        </form>

            {/* Acceso secundario */}
            <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
              ¿Ya eres repartidor?{" "}
              <Link href="/delivery-app/login" className="font-extrabold text-[var(--accent)]">
                Ingresa aquí →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────────────── */}
      <section className="border-y border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 py-12 lg:py-16">
          <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
            Cómo funciona
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl">
            De cero a repartiendo en menos de 24 horas
          </h2>
          <ol className="relative mt-8 grid gap-8 sm:grid-cols-4">
            <div className="pointer-events-none absolute inset-x-0 top-6 hidden h-px bg-[var(--rule-soft)] sm:block" />
            {HOW_STEPS.map((s) => (
              <li key={s.n} className="relative">
                <span className="relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-lg font-extrabold text-[var(--accent)] shadow-[var(--shadow-sm)]">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-extrabold text-[var(--text-primary)]">{s.title}</h3>
                <p className="mt-1 text-base leading-relaxed text-[var(--text-secondary)]">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Requisitos ────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 py-12 lg:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              Requisitos
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl">
              Lo que necesitás para empezar
            </h2>
            <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
              Sin inversión inicial ni costo de inscripción. Solo lo básico para repartir seguro.
            </p>
            <a
              href="#inscripcion"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
            >
              Empezar mi inscripción <ArrowRight className="h-5 w-5" />
            </a>
          </div>
          <ul className="space-y-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-sm)]">
            {REQUISITOS.map((r) => (
              <li key={r} className="flex gap-3 text-base leading-relaxed text-[var(--text-secondary)]">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Check className="h-4 w-4" />
                </span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ repartidores ─────────────────────────────────── */}
      <section className="border-t border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 lg:px-10 py-12 lg:py-16 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              Preguntas frecuentes
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl">
              Lo que todo repartidor pregunta
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
              ¿No encontrás tu duda?{" "}
              <a
                href="https://wa.me/51929340532?text=Hola%20Buleje%2C%20quiero%20ser%20repartidor%20y%20tengo%20una%20duda."
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[var(--accent)] hover:underline"
              >
                Escribinos por WhatsApp
              </a>{" "}
              y te ayudamos.
            </p>
          </div>
          <ul className="space-y-3">
            {REPARTIDOR_FAQS.map(({ q, a }) => (
              <li key={q}>
                <details className="group rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] transition-colors open:border-[var(--accent)]/30 open:shadow-[var(--shadow-sm)] [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-base font-bold text-[var(--text-primary)] sm:text-lg">
                    {q}
                    <ChevronDown className="h-5 w-5 shrink-0 text-[var(--accent)] transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-base leading-relaxed text-[var(--text-secondary)]">{a}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────

function Stepper({
  currentStep,
  validations,
  onStepClick,
}: {
  currentStep: 1 | 2 | 3 | 4;
  validations: Record<string, boolean>;
  onStepClick: (n: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 lg:gap-3">
      {STEPS.map((s) => {
        const Icon = s.Icon;
        const done = currentStep > s.id && validations[`step${s.id}`];
        const active = currentStep === s.id;
        const reachable = s.id <= currentStep || done;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => reachable && onStepClick(s.id as 1 | 2 | 3 | 4)}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              className={`w-full text-left rounded-2xl border-2 p-2.5 lg:p-3 transition-colors ${
                active
                  ? "border-[var(--accent)] bg-primary/10"
                  : done
                  ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/5"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
              } ${!reachable ? "opacity-50 cursor-not-allowed" : "hover:border-[var(--text-tertiary)]"}`}
            >
              <div className="flex items-center gap-2 lg:gap-3">
                <span
                  className={`h-8 w-8 lg:h-10 lg:w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    done
                      ? "bg-[var(--data-success-500)] text-white"
                      : active
                      ? "bg-[var(--accent-600,var(--accent))] text-white"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {done ? (
                    <Check className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={3} />
                  ) : (
                    <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
                  )}
                </span>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-[10px] lg:text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums leading-none">
                    Paso {s.id}
                  </p>
                  <p
                    className={`mt-1 text-sm lg:text-base font-extrabold leading-tight truncate ${
                      active || done ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const inputCls =
  "w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] outline-none transition-colors";
/** Variante del input cuando el valor es válido (borde + tinte verde sutil). */
const inputClsOk =
  inputCls + " border-[var(--data-success-500)] bg-[var(--data-success-50)] focus:border-[var(--data-success-500)]";

function Field({
  label,
  htmlFor,
  hint,
  valid,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  /** Muestra un ✓ "Listo" en vivo cuando el campo es válido. */
  valid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-extrabold text-[var(--text-primary)]">
          {label}
        </label>
        {valid && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-success-600)]">
            <Check className="h-3.5 w-3.5" /> Listo
          </span>
        )}
      </div>
      {hint && <p className="mb-2 text-xs font-semibold text-[var(--text-tertiary)]">{hint}</p>}
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--rule-base)] last:border-0">
      <span className="text-sm font-semibold text-[var(--text-tertiary)]">{label}</span>
      <span className="text-base font-extrabold text-[var(--text-primary)] truncate max-w-[60%] text-right">
        {value}
      </span>
    </div>
  );
}

function Consent({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-colors ${
        checked
          ? "border-[var(--accent)] bg-primary/10"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        className={`h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
          checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--rule-base)]"
        }`}
        aria-hidden
      >
        {checked && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-extrabold text-[var(--text-primary)] leading-tight">
          {label}
        </span>
        <span className="mt-1 block text-sm font-semibold text-[var(--text-secondary)] leading-relaxed">
          {hint}
        </span>
      </span>
    </label>
  );
}

