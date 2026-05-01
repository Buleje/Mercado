"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Loader2, Check } from "@buleje/design-system/icons";
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
  HeroDeliveryIllustration,
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

const ZONES = ["Centro", "Manantay", "Callería", "Yarinacocha", "Campo Verde"];

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
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[var(--data-success)] text-white mb-5">
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
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--brand-primary-light)] text-white">
        <div className="absolute -top-40 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-10 lg:py-14 grid lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 h-9 text-sm font-extrabold">
              <LiveSignal className="h-2.5 w-2.5" active />
              Buleje · Pucallpa
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-[1.05] tracking-tight">
              Reparte en tu barrio,<br />
              gana en tu tiempo.
            </h1>
            <p className="mt-3 max-w-xl text-base lg:text-lg text-white/85 leading-relaxed">
              Completa tu inscripción en 4 pasos rápidos. Revisamos tus documentos y te
              activamos en menos de 24 horas.
            </p>
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <div className="text-white/90">
              <HeroDeliveryIllustration className="h-56 w-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Wizard ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
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
              <Field label="Nombre completo" htmlFor="rep-name">
                <input
                  id="rep-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Como aparece en tu DNI"
                  className={inputCls}
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="DNI" htmlFor="rep-dni" hint="8 dígitos sin guiones">
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
                    className={inputCls}
                  />
                </Field>
                <Field
                  label="Fecha de nacimiento"
                  htmlFor="rep-birth"
                  hint="Debes tener al menos 18 años"
                >
                  <input
                    id="rep-birth"
                    type="date"
                    required
                    max={maxBirthDateIso()}
                    value={form.birthDate}
                    onChange={(e) => update("birthDate", e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="WhatsApp" htmlFor="rep-phone" hint="Recibirás aquí los pedidos">
                  <input
                    id="rep-phone"
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="9XX XXX XXX"
                    className={inputCls}
                  />
                </Field>
                <Field label="Email (opcional)" htmlFor="rep-email">
                  <input
                    id="rep-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="tu@correo.com"
                    className={inputCls}
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
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                              active
                                ? "bg-[var(--accent)] text-white"
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
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--text-tertiary)]"
                  }`}
                >
                  <div
                    className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                      form.anyZone
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                    }`}
                  >
                    <MapBadge className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                      Cualquier zona de Pucallpa
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
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
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
                <div className="rounded-2xl bg-[var(--accent-soft)] border-2 border-[var(--accent)] p-5 flex items-start gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
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
                      <Field label="Número de licencia" htmlFor="rep-lic">
                        <input
                          id="rep-lic"
                          type="text"
                          value={form.licenseNumber}
                          onChange={(e) =>
                            update("licenseNumber", e.target.value.toUpperCase().slice(0, 12))
                          }
                          placeholder="Q12345678"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Vencimiento" htmlFor="rep-lic-exp">
                        <input
                          id="rep-lic-exp"
                          type="date"
                          min={todayIso()}
                          value={form.licenseExpiresAt}
                          onChange={(e) => update("licenseExpiresAt", e.target.value)}
                          className={inputCls}
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
                                    ? "bg-[var(--accent-soft)] border-[var(--accent)]"
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
                    <Field label="Placa del vehículo" htmlFor="rep-plate" hint="Ej: A1B-234">
                      <input
                        id="rep-plate"
                        type="text"
                        value={form.vehiclePlate}
                        onChange={(e) =>
                          update("vehiclePlate", e.target.value.toUpperCase().slice(0, 10))
                        }
                        placeholder="A1B-234"
                        className={inputCls}
                      />
                    </Field>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field label="N° de SOAT" htmlFor="rep-soat">
                        <input
                          id="rep-soat"
                          type="text"
                          value={form.soatNumber}
                          onChange={(e) =>
                            update("soatNumber", e.target.value.toUpperCase().slice(0, 30))
                          }
                          placeholder="SOAT-2026-XXXX"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Vencimiento SOAT" htmlFor="rep-soat-exp">
                        <input
                          id="rep-soat-exp"
                          type="date"
                          min={todayIso()}
                          value={form.soatExpiresAt}
                          onChange={(e) => update("soatExpiresAt", e.target.value)}
                          className={inputCls}
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
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--data-success)] text-base font-extrabold text-white shadow-lg shadow-[var(--data-success)]/25 transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
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
        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          ¿Ya eres repartidor?{" "}
          <Link href="/delivery-app/login" className="font-extrabold text-[var(--accent)]">
            Ingresa aquí →
          </Link>
        </p>

        {/* Beneficios — abajo, no compite con el wizard */}
        <div className="mt-12 grid sm:grid-cols-3 gap-4">
          <Benefit
            Icon={ClockBadge}
            title="Tú eliges el horario"
            desc="Sin jefes ni horarios fijos."
          />
          <Benefit
            Icon={CashIcon}
            title="Cobras por entrega"
            desc="Tarifa base + propina al instante."
          />
          <Benefit Icon={ShieldBadge} title="Soporte 24/7" desc="WhatsApp directo con el equipo." />
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
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : done
                  ? "border-[var(--data-success)]/40 bg-[var(--data-success)]/5"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
              } ${!reachable ? "opacity-50 cursor-not-allowed" : "hover:border-[var(--text-tertiary)]"}`}
            >
              <div className="flex items-center gap-2 lg:gap-3">
                <span
                  className={`h-8 w-8 lg:h-10 lg:w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    done
                      ? "bg-[var(--data-success)] text-white"
                      : active
                      ? "bg-[var(--accent)] text-white"
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

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-extrabold text-[var(--text-primary)]">
        {label}
      </label>
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
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
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

function Benefit({
  Icon,
  title,
  desc,
}: {
  Icon: typeof ClockBadge;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 flex gap-3">
      <div className="h-11 w-11 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">{title}</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
