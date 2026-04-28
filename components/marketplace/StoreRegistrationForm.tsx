"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
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

// Zonas del catálogo canónico (lib/marketplace-zones.ts).
// "Otra zona" se mantiene como escape-hatch para zones libre que no estén
// en el catálogo (ej. distrito nuevo o ciudad fuera de cobertura).
import { MARKETPLACE_ZONES } from "@/lib/marketplace-zones";

const ZONES: string[] = [
  ...MARKETPLACE_ZONES.map((z) => `${z.label}${z.city ? ` (${z.city})` : ""}`),
  "Otra zona",
];

type FormStep = "info" | "details" | "success";

export default function StoreRegistrationForm() {
  const [step, setStep] = useState<FormStep>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");

  // Step 1: Owner info
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  // Step 2: Store details
  const [storeNameInput, setStoreNameInput] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bodega");
  const [zone, setZone] = useState("");
  const [address, setAddress] = useState("");

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
      const res = await fetch("/api/marketplace/stores/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: ownerName.trim(),
          ownerPhone: ownerPhone.trim(),
          ownerEmail: ownerEmail.trim() || undefined,
          storeName: storeNameInput.trim(),
          description: description.trim() || undefined,
          category,
          zone: zone || undefined,
          address: address.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al registrar. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      setStoreName(data.data?.name || storeNameInput);
      setStep("success");
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
    }
    setLoading(false);
  }, [ownerName, ownerPhone, ownerEmail, storeNameInput, description, category, zone, address]);

  // Success screen
  if (step === "success") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">
            ¡Solicitud enviada!
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Tu tienda <strong>{storeName}</strong> está siendo revisada.
            Te avisaremos por WhatsApp cuando esté lista para vender.
          </p>
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-left space-y-3">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-gray-400">
              ¿Qué sigue?
            </p>
            <ol className="space-y-2.5">
              {[
                "Recibirás un WhatsApp de confirmación",
                "Revisamos tu solicitud (máximo 24 horas)",
                "Te damos acceso a tu panel para subir productos",
                "Tu tienda aparece en el marketplace",
              ].map((step, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm text-gray-600 dark:text-gray-300"
                >
                  <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[length:var(--ts-2xs)] font-extrabold tabular-nums">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
          >
            Volver al Marketplace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-lg w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Store className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
            Abre tu tienda gratis
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Vende tus productos a toda Pucallpa desde el marketplace más grande de la ciudad.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Zap, label: "Listo en 24h", color: "text-amber-500" },
            { icon: DollarSign, label: "Sin costo fijo", color: "text-emerald-500" },
            { icon: ShieldCheck, label: "Pagos seguros", color: "text-emerald-500" },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="text-center p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <Icon className={cn("h-5 w-5 mx-auto mb-1", color)} />
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</p>
            </div>
          ))}
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setStep("info")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              step === "info"
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            )}
          >
            <span>1</span> Tus datos
          </button>
          <div className="w-6 h-px bg-gray-300 dark:bg-gray-700" />
          <button
            onClick={() => {
              if (ownerName.trim().length >= 2 && ownerPhone.replace(/\D/g, "").length >= 6) {
                setStep("details");
              }
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              step === "details"
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            )}
          >
            <span>2</span> Tu tienda
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Step 1: Owner info */}
        {step === "info" && (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <User className="h-4 w-4" /> Tu nombre completo *
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ej: María García"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Phone className="h-4 w-4" /> Tu WhatsApp *
              </label>
              <input
                type="tel"
                value={ownerPhone}
                onChange={(e) => setOwnerPhone(e.target.value)}
                placeholder="Ej: 961234567"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
              <p className="text-xs text-gray-400 mt-1">Te contactaremos por aquí</p>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Mail className="h-4 w-4" /> Email (opcional)
              </label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="maria@ejemplo.com"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <button
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
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
            >
              Siguiente
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Store details */}
        {step === "details" && (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Store className="h-4 w-4" /> Nombre de tu tienda *
              </label>
              <input
                type="text"
                value={storeNameInput}
                onChange={(e) => setStoreNameInput(e.target.value)}
                placeholder="Ej: Bodega Don Pedro"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Tag className="h-4 w-4" /> Tipo de negocio
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                      category === cat.value
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-primary/30"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <MapPin className="h-4 w-4" /> Zona
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              >
                <option value="">Selecciona tu zona</option>
                {ZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <MapPin className="h-4 w-4" /> Dirección (opcional)
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ej: Jr. Huáscar 123, Pucallpa"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <FileText className="h-4 w-4" /> Descripción corta (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Cuéntanos de tu negocio en 1-2 líneas..."
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("info")}
                className="flex-1 px-6 py-3 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-2 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Registrar mi tienda
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Al registrarte aceptas los{" "}
          <Link href="/terminos" className="text-primary hover:underline">
            términos y condiciones
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
