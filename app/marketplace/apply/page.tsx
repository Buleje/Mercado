"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { m, AnimatePresence } from "framer-motion";
import {
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  Tag,
  FileText,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Check,
  Sparkles,
  ShoppingBasket,
  ShoppingCart,
  Apple,
  CroissantIcon,
  Wine,
  Pill,
  Beef,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PucallpaZoneMap from "@/components/apply/PucallpaZoneMap";

type FormState = {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  storeName: string;
  description: string;
  category: string;
  zone: string;
};

const CATEGORIES: { id: string; icon: React.ElementType }[] = [
  { id: "Bodega", icon: Store },
  { id: "Minimarket", icon: ShoppingCart },
  { id: "Frutería", icon: Apple },
  { id: "Panadería", icon: CroissantIcon },
  { id: "Licorería", icon: Wine },
  { id: "Farmacia", icon: Pill },
  { id: "Carnicería", icon: Beef },
  { id: "Bazar", icon: ShoppingBasket },
  { id: "Otro", icon: Package },
];

const STORAGE_KEY = "buleje:apply-draft:v1";

type Step = 1 | 2 | 3 | 4;

export default function MarketplaceApplyPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    storeName: "",
    description: "",
    category: "",
    zone: "",
  });

  // Hydrate draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setForm((p) => ({ ...p, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Save draft
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      /* ignore */
    }
  }, [form]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    if (error) setError("");
  };

  const canAdvance = useMemo(() => {
    if (step === 1) return form.ownerName.trim().length > 1 && form.ownerPhone.trim().length >= 6;
    if (step === 2) return form.storeName.trim().length > 1 && form.category.length > 0;
    if (step === 3) return form.zone.length > 0;
    return true;
  }, [step, form]);

  const next = () => {
    if (!canAdvance) {
      setError("Completá los campos para continuar");
      return;
    }
    if (step < 4) setStep((s) => (s + 1) as Step);
  };

  const back = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const fireConfetti = async () => {
    const confetti = (await import("canvas-confetti")).default;
    const end = Date.now() + 1500;
    const colors = ["#00B4A6", "#F59E0B", "#EC4899", "#8B5CF6"];
    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/marketplace/stores/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError("Ya existe una tienda registrada con este número de teléfono.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Error al registrar. Intenta de nuevo.");
        setLoading(false);
        return;
      }
      setSubmitted(true);
      fireConfetti();
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      setError("Error de conexión. Revisa tu internet e intenta de nuevo.");
    }
    setLoading(false);
  };

  // Success
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-950 dark:via-gray-950 dark:to-emerald-950/20 flex items-center justify-center p-4">
        <m.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-md w-full text-center space-y-6 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-8 shadow-2xl"
        >
          <m.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 260 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10"
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          </m.div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">
            ¡Solicitud enviada!
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Recibimos la información de{" "}
            <strong className="text-gray-900 dark:text-white">{form.storeName}</strong>.
            Te contactamos por WhatsApp al{" "}
            <strong className="text-gray-900 dark:text-white">{form.ownerPhone}</strong>.
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-left space-y-2">
            {[
              "Revisamos tu solicitud (máximo 24 horas)",
              "Te enviamos acceso a tu panel de administración",
              "Subís tus productos y empezás a vender",
            ].map((t, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xs font-extrabold">
                  {i + 1}
                </span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <a
              href={`https://wa.me/51916409675?text=${encodeURIComponent(
                `Hola! Acabo de registrar mi tienda "${form.storeName}" en Buleje. Mi teléfono es ${form.ownerPhone}.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 transition-colors"
            >
              Contactar por WhatsApp
            </a>
            <button
              onClick={() => router.push("/marketplace")}
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Ir al marketplace
            </button>
          </div>
        </m.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 py-8 sm:py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header + progress */}
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
            <Sparkles className="h-3 w-3" />
            Registro gratuito · 3 minutos
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Abrí tu tienda en <span className="gradient-text">Buleje</span>
          </h1>
        </div>

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {([1, 2, 3, 4] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-extrabold transition-all",
                  step === s
                    ? "bg-primary text-white scale-110 shadow-lg shadow-primary/30"
                    : step > s
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400",
                )}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 4 && (
                <div
                  className={cn(
                    "w-8 sm:w-16 h-0.5 rounded-full transition-colors",
                    step > s ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-8">
          {/* Steps */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 min-h-[440px] flex flex-col">
              <AnimatePresence mode="wait">
                {/* ── STEP 1: Vos ── */}
                {step === 1 && (
                  <m.div
                    key="step-1"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 space-y-6"
                  >
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Paso 1 de 4
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
                        Primero, contanos quién sos
                      </h2>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                        <User className="h-3.5 w-3.5 inline mr-1.5" />
                        ¿Cómo te llamás?
                      </label>
                      <input
                        type="text"
                        value={form.ownerName}
                        onChange={(e) => update("ownerName", e.target.value)}
                        placeholder="Ej: Juan Pérez"
                        autoFocus
                        className="w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent text-lg font-semibold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-primary/60 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                        <Phone className="h-3.5 w-3.5 inline mr-1.5" />
                        WhatsApp (te llamamos por acá)
                      </label>
                      <input
                        type="tel"
                        value={form.ownerPhone}
                        onChange={(e) =>
                          update("ownerPhone", e.target.value.replace(/[^\d+]/g, ""))
                        }
                        placeholder="Ej: 916409675"
                        className="w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent text-lg font-semibold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-primary/60 transition-all tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                        <Mail className="h-3.5 w-3.5 inline mr-1.5" />
                        Correo (opcional)
                      </label>
                      <input
                        type="email"
                        value={form.ownerEmail}
                        onChange={(e) => update("ownerEmail", e.target.value)}
                        placeholder="tu@email.com"
                        className="w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent text-lg font-semibold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-primary/60 transition-all"
                      />
                    </div>
                  </m.div>
                )}

                {/* ── STEP 2: Tu negocio ── */}
                {step === 2 && (
                  <m.div
                    key="step-2"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 space-y-6"
                  >
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Paso 2 de 4
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
                        Ahora, tu negocio
                      </h2>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                        <Store className="h-3.5 w-3.5 inline mr-1.5" />
                        ¿Cómo se llama tu tienda?
                      </label>
                      <input
                        type="text"
                        value={form.storeName}
                        onChange={(e) => update("storeName", e.target.value)}
                        placeholder="Ej: Buleje"
                        autoFocus
                        className="w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent text-lg font-semibold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-primary/60 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                        <Tag className="h-3.5 w-3.5 inline mr-1.5" />
                        ¿Qué tipo de negocio es?
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {CATEGORIES.map((cat) => {
                          const Icon = cat.icon;
                          const active = form.category === cat.id;
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => update("category", cat.id)}
                              className={cn(
                                "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                                active
                                  ? "bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900"
                                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-white",
                              )}
                            >
                              <Icon
                                className="h-5 w-5"
                                strokeWidth={active ? 2 : 1.5}
                                aria-hidden="true"
                              />
                              <span className="text-[length:var(--ts-2xs)] font-bold">
                                {cat.id}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-2">
                        <FileText className="h-3.5 w-3.5 inline mr-1.5" />
                        Describí tu tienda (opcional)
                      </label>
                      <textarea
                        rows={2}
                        value={form.description}
                        onChange={(e) => update("description", e.target.value)}
                        placeholder="Ej: Bodega familiar con más de 10 años en el barrio..."
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-primary/60 resize-none transition-all"
                      />
                    </div>
                  </m.div>
                )}

                {/* ── STEP 3: Ubicación ── */}
                {step === 3 && (
                  <m.div
                    key="step-3"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 space-y-6"
                  >
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Paso 3 de 4
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
                        ¿En qué zona estás?
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        Tocá la zona donde está tu tienda en Pucallpa.
                      </p>
                    </div>

                    <PucallpaZoneMap
                      value={form.zone}
                      onChange={(z) => update("zone", z)}
                    />
                  </m.div>
                )}

                {/* ── STEP 4: Review ── */}
                {step === 4 && (
                  <m.div
                    key="step-4"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="flex-1 space-y-6"
                  >
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                        Paso 4 de 4
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mt-1">
                        Revisá y listo
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                        Si todo se ve bien, enviá tu solicitud.
                      </p>
                    </div>

                    <dl className="space-y-3">
                      {[
                        { label: "Dueño", value: form.ownerName },
                        { label: "WhatsApp", value: form.ownerPhone },
                        ...(form.ownerEmail ? [{ label: "Email", value: form.ownerEmail }] : []),
                        { label: "Tienda", value: form.storeName },
                        { label: "Categoría", value: form.category },
                        { label: "Zona", value: form.zone },
                        ...(form.description
                          ? [{ label: "Descripción", value: form.description }]
                          : []),
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        >
                          <dt className="text-xs font-bold text-gray-400 uppercase tracking-wide shrink-0">
                            {row.label}
                          </dt>
                          <dd className="text-sm font-semibold text-gray-900 dark:text-white text-right">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </m.div>
                )}
              </AnimatePresence>

              {/* Error */}
              {error && (
                <m.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 text-sm text-red-500 font-semibold"
                >
                  {error}
                </m.p>
              )}

              {/* Controls */}
              <div className="mt-auto pt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={back}
                  disabled={step === 1}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                    step === 1
                      ? "opacity-0 pointer-events-none"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-white",
                  )}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>

                {step < 4 ? (
                  <button
                    type="button"
                    onClick={next}
                    disabled={!canAdvance}
                    className={cn(
                      "inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all",
                      canAdvance
                        ? "bg-gray-900 text-white hover:bg-gray-800 active:scale-95"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed",
                    )}
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-70"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        Abrir mi tienda
                        <Sparkles className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Preview lateral en vivo */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">
                Vista previa en vivo
              </p>
              <m.div
                key={form.storeName + form.category + form.zone}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
              >
                {/* Mock de cover — minimal grid pattern */}
                <div
                  className="relative aspect-[16/10] bg-gray-50 dark:bg-gray-950 flex items-center justify-center border-b border-gray-200 dark:border-gray-800"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                >
                  <div className="h-16 w-16 rounded-xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                    {(() => {
                      const Icon =
                        CATEGORIES.find((c) => c.id === form.category)?.icon ?? Store;
                      return <Icon className="h-7 w-7" strokeWidth={1.5} />;
                    })()}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white truncate">
                    {form.storeName || "Tu nombre de tienda"}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {form.zone || "Zona"}
                  </p>
                  {form.category && (
                    <span className="inline-flex mt-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[length:var(--ts-2xs)] font-bold">
                      {form.category}
                    </span>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 line-clamp-3 min-h-[3rem]">
                    {form.description || "Tu descripción aparecerá acá — contale a los vecinos qué hace tu tienda especial."}
                  </p>
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[length:var(--ts-2xs)]">
                    <span className="inline-flex items-center gap-1 text-amber-500 font-bold">
                      ★ Nueva
                    </span>
                    <span className="text-gray-400">Próximamente en Buleje</span>
                  </div>
                </div>
              </m.div>
              <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-3 text-center">
                Así va a verse tu tienda en el marketplace
              </p>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}
