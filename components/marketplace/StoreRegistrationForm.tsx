"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import PaymentStep, { type RegistrationPayload } from "@/components/marketplace/PaymentStep";
import type { PlanTier } from "@/lib/billing/plan-tiers";
import { SUPPORTED_INDUSTRIES, VERTICAL_REGISTRY, type Industry } from "@/lib/verticals/registry";
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
  Search,
  ScanLine,
  Building2,
  TreePine,
  UtensilsCrossed,
  Pill,
  Wrench,
  Croissant,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const GeolocationPickerModal = dynamic(
  () => import("@/components/marketplace/GeolocationPickerModal"),
  { ssr: false },
);

// Iconos por vertical (los nombres viven en el registry; aquí se resuelven).
const VERTICAL_ICON: Record<Industry, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  bodega: Store,
  restaurante: UtensilsCrossed,
  madereria: TreePine,
  farmacia: Pill,
  ferreteria: Wrench,
  panaderia: Croissant,
  otro: Building2,
};

// Categorías = verticales REALES soportadas (lib/verticals/registry), no inventadas.
const CATEGORIES = SUPPORTED_INDUSTRIES.map((id) => ({
  value: id,
  label: VERTICAL_REGISTRY[id].label,
  Icon: VERTICAL_ICON[id],
}));

interface RucData {
  ruc: string;
  razonSocial: string | null;
  nombreComercial: string | null;
  estado: string | null;
  direccion: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

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

  // DNI → autocompleta el nombre desde RENIEC (endpoint público /api/reniec/lookup).
  const [dni, setDni] = useState("");
  const [dniLoading, setDniLoading] = useState(false);
  const [dniError, setDniError] = useState<string | null>(null);
  const [dniFilled, setDniFilled] = useState(false);

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
  const [geoModalOpen, setGeoModalOpen] = useState(false);

  // Modo de registro del nombre: "nuevo" (manual) o "sunat" (ya inscrito → por RUC).
  const [regMode, setRegMode] = useState<"nuevo" | "sunat">("nuevo");
  const [ruc, setRuc] = useState("");
  const [rucLoading, setRucLoading] = useState(false);
  const [rucData, setRucData] = useState<RucData | null>(null);
  const [rucError, setRucError] = useState<string | null>(null);

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

  // DNI → RENIEC: al tener 8 dígitos, consulta y autocompleta el nombre (debounce).
  useEffect(() => {
    setDniError(null);
    setDniFilled(false);
    if (dni.length !== 8) return;
    let cancelled = false;
    setDniLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/reniec/lookup?dni=${dni}`)
        .then(async (r) => {
          const j = await r.json();
          if (cancelled) return;
          if (!r.ok || !j.nombreCompleto) {
            setDniError(j.error ?? "No encontramos ese DNI. Escribe tu nombre manualmente.");
          } else {
            setOwnerName(j.nombreCompleto as string);
            setDniFilled(true);
          }
        })
        .catch(() => {
          if (!cancelled) setDniError("No pudimos consultar el DNI. Escribe tu nombre manualmente.");
        })
        .finally(() => {
          if (!cancelled) setDniLoading(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [dni]);

  // Rellena los selects de ubigeo a partir de NOMBRES (departamento/provincia/
  // distrito) matcheando contra el padrón. Reusado por geolocalización Y por el
  // lookup de RUC de SUNAT.
  const applyUbigeoNames = useCallback(
    async (
      depName: string | null,
      provName: string | null,
      distName: string | null,
      direccionTxt: string | null,
    ) => {
      // SUNAT/Nominatim devuelven mayúsculas/acentos variables → normalizar.
      const norm = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      try {
        if (depName) {
          const allDeps = (await fetch("/api/marketplace/ubigeo").then((x) => x.json())) as { items: { code: string; nombre: string }[] };
          const dep = allDeps.items.find((d) => norm(d.nombre) === norm(depName));
          if (dep) {
            setDepartamento(dep.code);
            if (provName) {
              const provs = (await fetch(`/api/marketplace/ubigeo?dep=${dep.code}`).then((x) => x.json())) as { items: { code: string; nombre: string }[] };
              const prov = provs.items.find((p) => norm(p.nombre) === norm(provName));
              if (prov) {
                setProvincia(prov.code);
                if (distName) {
                  const dists = (await fetch(`/api/marketplace/ubigeo?dep=${dep.code}&prov=${prov.code}`).then((x) => x.json())) as { items: { code: string; nombre: string }[] };
                  const dist = dists.items.find((d) => norm(d.nombre) === norm(distName));
                  if (dist) setDistrito(dist.code);
                }
              }
            }
          }
        }
        if (direccionTxt) setDireccion(direccionTxt);
      } catch {
        setGeoError("No pudimos autocompletar la dirección. Llená los campos manualmente.");
      }
    },
    [],
  );

  // Confirmación del modal de mapa: reverse-geocode de las coords → ubigeo.
  const applyLocation = useCallback(
    async (lat: number, lng: number) => {
      setGeoError(null);
      setGeoLoading(true);
      try {
        const r = await fetch(`/api/marketplace/reverse-geocode?lat=${lat}&lng=${lng}`);
        if (!r.ok) throw new Error("geocoder failed");
        const data: {
          departamento: string | null;
          provincia: string | null;
          distrito: string | null;
          direccion: string | null;
        } = await r.json();
        await applyUbigeoNames(data.departamento, data.provincia, data.distrito, data.direccion);
      } catch {
        setGeoError("No pudimos detectar tu dirección. Llená los campos manualmente.");
      } finally {
        setGeoLoading(false);
      }
    },
    [applyUbigeoNames],
  );

  // Lookup de RUC (debounced) cuando el modo es "sunat" y hay 11 dígitos válidos.
  useEffect(() => {
    if (regMode !== "sunat") return;
    const digits = ruc.replace(/\D/g, "");
    setRucError(null);
    if (digits.length !== 11) {
      setRucData(null);
      return;
    }
    if (!/^[12]/.test(digits)) {
      setRucData(null);
      setRucError("El RUC debe empezar en 1 o 2.");
      return;
    }
    let cancelled = false;
    setRucLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/marketplace/ruc-lookup?ruc=${digits}`)
        .then(async (r) => {
          const j = await r.json();
          if (cancelled) return;
          if (!r.ok) {
            setRucData(null);
            setRucError(j.error ?? "No se encontró el RUC en SUNAT.");
          } else {
            setRucData(j as RucData);
          }
        })
        .catch(() => {
          if (!cancelled) setRucError("No se pudo consultar SUNAT. Escribe el nombre manualmente.");
        })
        .finally(() => {
          if (!cancelled) setRucLoading(false);
        });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [ruc, regMode]);

  // Aplica los datos del RUC al formulario: nombre + dirección (ubigeo).
  const applyRucData = useCallback(async () => {
    if (!rucData) return;
    const name = rucData.nombreComercial?.trim() || rucData.razonSocial?.trim() || "";
    if (name) setStoreNameInput(name);
    await applyUbigeoNames(rucData.departamento, rucData.provincia, rucData.distrito, rucData.direccion);
  }, [rucData, applyUbigeoNames]);

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

  // Validez por campo — para el check sutil de "campo listo".
  const nameOk = ownerName.trim().length >= 2;
  const phoneOk = ownerPhone.replace(/\D/g, "").length >= 6;
  const storeOk = storeNameInput.trim().length >= 2;

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
              Vendé tus productos a toda Ciudad Constitución desde el marketplace más grande de la ciudad.
              <strong className="font-bold text-[var(--text-primary)]"> Sin tarjeta. Sin permanencia.</strong>
            </p>

            {/* Trust inline — minimal */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
              {[
                { icon: Zap, label: "Listo en 24h" },
                { icon: DollarSign, label: "Sin costo fijo" },
                { icon: ShieldCheck, label: "Pagos seguros" },
              ].map((b) => (
                <span
                  key={b.label}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]"
                >
                  <b.icon className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
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
          <div className="order-1 space-y-5">
            {/* Indicador de pasos — minimalista */}
            <ol className="flex items-center gap-2 px-1">
              {([
                { n: 1, label: "Tus datos", go: () => setStep("info") },
                {
                  n: 2,
                  label: "Tu tienda",
                  go: () => {
                    if (ownerName.trim().length >= 2 && ownerPhone.replace(/\D/g, "").length >= 6) {
                      setStep("details");
                    }
                  },
                },
              ] as const).map((s, i) => {
                const active = stepIndex === s.n;
                const done = stepIndex > s.n;
                return (
                  <li key={s.n} className="flex flex-1 items-center gap-2">
                    <button type="button" onClick={s.go} className="group flex items-center gap-2.5 text-left">
                      <span
                        className={cn(
                          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums transition-colors",
                          done
                            ? "bg-[var(--data-success-500)] text-white"
                            : active
                              ? "bg-[var(--accent)] text-white shadow-[var(--shadow-sm)]"
                              : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)] ring-1 ring-[var(--rule-base)] group-hover:ring-[var(--accent)]/40",
                        )}
                      >
                        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : s.n}
                      </span>
                      <span className="hidden sm:block">
                        <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] leading-none">
                          Paso {s.n}
                        </span>
                        <span
                          className={cn(
                            "mt-1 block text-sm font-bold leading-none",
                            active || done ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                          )}
                        >
                          {s.label}
                        </span>
                      </span>
                    </button>
                    {i === 0 && (
                      <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--rule-base)]">
                        <span
                          className={cn(
                            "block h-full rounded-full bg-[var(--accent)] transition-all duration-500",
                            done ? "w-full" : "w-0",
                          )}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Form card */}
            <div className="rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 shadow-[var(--shadow-sm)] sm:p-8 lg:p-10">
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
                  {/* DNI → autocompleta el nombre desde RENIEC */}
                  <div>
                    <label htmlFor="reg-dni" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <ScanLine className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tu DNI{" "}
                      <span className="text-xs font-semibold text-[var(--text-tertiary)]">— autocompleta tu nombre</span>
                    </label>
                    <div className="relative">
                      <input
                        id="reg-dni"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={dni}
                        onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="Ej: 70123456"
                        className={cn(INPUT_BASE, (dniLoading || dniFilled) && "pr-11")}
                      />
                      {dniLoading ? (
                        <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-[var(--accent)]" />
                      ) : dniFilled ? (
                        <CheckCircle
                          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--data-success-500)]"
                          strokeWidth={2.25}
                        />
                      ) : null}
                    </div>
                    {dniError && (
                      <p className="mt-1.5 text-xs font-semibold text-[var(--text-tertiary)]">{dniError}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="reg-owner-name" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <User className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tu nombre completo <span className="text-[var(--data-error-500)]">*</span>
                      {dniFilled && (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
                          <ScanLine className="h-3 w-3" strokeWidth={2.5} />
                          Desde tu DNI
                        </span>
                      )}
                    </label>
                    <div className="relative">
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
                        className={cn(INPUT_BASE, nameOk && "pr-11")}
                      />
                      {nameOk && (
                        <CheckCircle
                          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--data-success-500)]"
                          strokeWidth={2.25}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="reg-owner-phone" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <Phone className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tu WhatsApp <span className="text-[var(--data-error-500)]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="reg-owner-phone"
                        type="tel"
                        name="ownerPhone"
                        autoComplete="tel"
                        inputMode="tel"
                        required
                        pattern="[0-9 \(\)+\-]{6,}"
                        value={ownerPhone}
                        onChange={(e) => setOwnerPhone(e.target.value)}
                        placeholder="Ej: 961 234 567"
                        className={cn(INPUT_BASE, phoneOk && "pr-11")}
                      />
                      {phoneOk && (
                        <CheckCircle
                          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--data-success-500)]"
                          strokeWidth={2.25}
                        />
                      )}
                    </div>
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

                    {/* Toggle: negocio nuevo vs ya inscrito en SUNAT */}
                    <div className="mb-3 inline-flex w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
                      {([
                        { id: "nuevo", label: "Negocio nuevo", icon: Sparkles },
                        { id: "sunat", label: "Ya inscrito (SUNAT)", icon: ShieldCheck },
                      ] as const).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setRegMode(mode.id)}
                          aria-pressed={regMode === mode.id}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all",
                            regMode === mode.id
                              ? "bg-[var(--surface-canvas)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                          )}
                        >
                          <mode.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {regMode === "nuevo" ? (
                      <div className="relative">
                        <input
                          type="text"
                          value={storeNameInput}
                          onChange={(e) => setStoreNameInput(e.target.value)}
                          placeholder="Ej: Bodega Don Pedro"
                          className={cn(INPUT_BASE, storeOk && "pr-11")}
                        />
                        {storeOk && (
                          <CheckCircle
                            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--data-success-500)]"
                            strokeWidth={2.25}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={2.25} />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={ruc}
                            onChange={(e) => setRuc(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
                            placeholder="Ingresa tu RUC (11 dígitos)"
                            className={cn(INPUT_BASE, "pl-10", rucLoading && "pr-11")}
                          />
                          {rucLoading && (
                            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-[var(--accent)]" />
                          )}
                        </div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                          Escribe tu RUC y traemos tu razón social y dirección desde SUNAT.
                        </p>

                        {rucError && (
                          <p className="rounded-lg bg-[var(--data-error-50)] px-3 py-2 text-xs font-semibold text-[var(--data-error-700)]">
                            {rucError}
                          </p>
                        )}

                        {rucData && (
                          <button
                            type="button"
                            onClick={() => void applyRucData()}
                            className="w-full rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3.5 text-left transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow-sm)]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                                  {rucData.razonSocial ?? "Empresa"}
                                </p>
                                <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                                  RUC {rucData.ruc}
                                  {rucData.estado ? ` · ${rucData.estado}` : ""}
                                </p>
                                {rucData.direccion && (
                                  <p className="mt-1 text-xs text-[var(--text-tertiary)] truncate">{rucData.direccion}</p>
                                )}
                              </div>
                              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-white">
                                <Check className="h-3 w-3" strokeWidth={3} />
                                Usar
                              </span>
                            </div>
                          </button>
                        )}

                        {storeOk && (
                          <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-success-500)]">
                            <CheckCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                            Nombre cargado: {storeNameInput}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                      <Tag className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                      Tipo de negocio
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CATEGORIES.map((cat) => {
                        const active = category === cat.value;
                        return (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setCategory(cat.value)}
                            aria-pressed={active}
                            className={cn(
                              "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-bold transition-all",
                              active
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-[var(--shadow-sm)]"
                                : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-sunken)]",
                            )}
                          >
                            <cat.Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                            <span className="leading-tight">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                        <MapPin className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} />
                        Dirección de la tienda
                      </h4>
                      <button
                        type="button"
                        onClick={() => setGeoModalOpen(true)}
                        disabled={geoLoading}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:scale-[1.02] hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {geoLoading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                            Aplicando…
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
          <aside className="order-2">
            <div className="lg:sticky lg:top-24 space-y-4">
              {/* Confianza: stats + por qué (consolidado) */}
              <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 shadow-[var(--shadow-sm)]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  {[
                    { v: "120", suffix: "+", l: "Tiendas activas" },
                    { v: "4.8", suffix: "★", l: "Satisfacción" },
                    { v: "24h", suffix: "", l: "Activación" },
                    { v: "0%", suffix: "", l: "Costo fijo" },
                  ].map((s) => (
                    <div key={s.l}>
                      <p className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                        {s.v}
                        <span className="text-[var(--accent)]">{s.suffix}</span>
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">{s.l}</p>
                    </div>
                  ))}
                </div>
                <div className="my-5 h-px bg-[var(--rule-soft)]" />
                <ul className="space-y-2.5">
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
                      <span className="text-sm font-medium text-[var(--text-primary)]">{vp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Testimonio */}
              <figure className="rounded-2xl border border-[var(--accent)]/15 bg-[var(--accent-soft)]/40 p-5">
                <blockquote className="text-sm font-medium leading-relaxed text-[var(--text-primary)]">
                  &ldquo;En el primer mes recibí <strong className="font-bold">32 pedidos</strong> nuevos
                  sin hacer publicidad. Lo más simple que probé.&rdquo;
                </blockquote>
                <figcaption className="mt-3 flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[length:var(--ts-2xs)] font-black text-white">
                    DP
                  </span>
                  Don Pepe · Bodega Don Pepe
                </figcaption>
              </figure>

              {/* Soporte */}
              <a
                href="https://wa.me/51929340532?text=Hola%2C%20tengo%20una%20duda%20sobre%20cómo%20abrir%20mi%20tienda"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 shadow-[var(--shadow-sm)] transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)]">¿Necesitás ayuda?</p>
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Escribinos por WhatsApp</p>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={2.25} />
              </a>
            </div>
          </aside>
        </div>
      </main>

      {/* Modal de ubicación con mapa (pin draggable) */}
      <GeolocationPickerModal
        open={geoModalOpen}
        onClose={() => setGeoModalOpen(false)}
        onConfirm={(lat, lng) => applyLocation(lat, lng)}
      />
    </div>
  );
}
