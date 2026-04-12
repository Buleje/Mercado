"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  Tag,
  FileText,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShoppingBag,
  TrendingUp,
  Users,
  Shield,
} from "lucide-react";

type FormState = {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  storeName: string;
  description: string;
  category: string;
  zone: string;
};

const CATEGORIES = [
  "Bodega",
  "Minimarket",
  "Frutería",
  "Panadería",
  "Licorería",
  "Farmacia",
  "Tienda de abarrotes",
  "Bazar",
  "Carnicería",
  "Otro",
];

export default function MarketplaceApplyPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [storeSlug, setStoreSlug] = useState("");
  const [form, setForm] = useState<FormState>({
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    storeName: "",
    description: "",
    category: "",
    zone: "",
  });

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.ownerName || !form.ownerPhone || !form.storeName) {
      setError("Completa los campos obligatorios: nombre, teléfono y nombre de tienda.");
      return;
    }

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

      setStoreSlug(data.data?.store?.slug || "");
      setStep("success");
    } catch {
      setError("Error de conexión. Revisa tu internet e intenta de nuevo.");
    }
    setLoading(false);
  };

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 mb-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">¡Solicitud enviada!</h1>
          <p className="text-gray-400">
            Tu solicitud para <span className="text-white font-medium">{form.storeName}</span> fue
            recibida. Te contactaremos por WhatsApp al{" "}
            <span className="text-white font-medium">{form.ownerPhone}</span> para confirmar.
          </p>
          <div className="bg-gray-800/50 rounded-xl p-4 text-left space-y-2">
            <p className="text-sm text-gray-400">Próximos pasos:</p>
            <div className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-emerald-400 font-bold">1.</span>
              <span>Revisamos tu solicitud (máximo 24 horas)</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-emerald-400 font-bold">2.</span>
              <span>Te enviamos acceso a tu panel de administración</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-emerald-400 font-bold">3.</span>
              <span>Subes tus productos y empiezas a vender</span>
            </div>
          </div>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={() => router.push("/marketplace")}
              className="px-6 py-2.5 rounded-xl bg-[#00B4A6] text-white font-medium hover:bg-[#00a396] transition-colors"
            >
              Ir al Marketplace
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#00B4A6]/10 via-transparent to-orange-500/10" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00B4A6]/10 border border-[#00B4A6]/20 text-[#00B4A6] text-sm font-medium mb-6">
            <Store className="h-4 w-4" />
            Registro gratuito
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Abre tu tienda en <span className="text-[#00B4A6]">Buleje</span>
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-lg">
            Llega a miles de clientes en Pucallpa. Registra tu bodega, sube tus productos y
            empieza a recibir pedidos por WhatsApp.
          </p>

          {/* Benefits */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-10 max-w-2xl mx-auto">
            {[
              { icon: ShoppingBag, label: "Vende online", desc: "Sin inversión inicial" },
              { icon: TrendingUp, label: "Más clientes", desc: "Visibilidad en marketplace" },
              { icon: Users, label: "Soporte", desc: "Te ayudamos a crecer" },
              { icon: Shield, label: "Seguro", desc: "Pagos protegidos" },
            ].map((b) => (
              <div key={b.label} className="bg-gray-800/30 rounded-xl p-3 border border-gray-800">
                <b.icon className="h-5 w-5 text-[#00B4A6] mx-auto mb-2" />
                <p className="text-sm font-medium text-white">{b.label}</p>
                <p className="text-xs text-gray-500">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-lg mx-auto px-4 pb-20">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <User className="h-5 w-5 text-[#00B4A6]" />
              Datos del dueño
            </h2>

            <Field
              icon={<User className="h-4 w-4" />}
              label="Tu nombre completo *"
              value={form.ownerName}
              onChange={(v) => update("ownerName", v)}
              placeholder="Juan Pérez"
            />
            <Field
              icon={<Phone className="h-4 w-4" />}
              label="WhatsApp / Teléfono *"
              value={form.ownerPhone}
              onChange={(v) => update("ownerPhone", v)}
              placeholder="961234567"
              type="tel"
            />
            <Field
              icon={<Mail className="h-4 w-4" />}
              label="Email (opcional)"
              value={form.ownerEmail}
              onChange={(v) => update("ownerEmail", v)}
              placeholder="juan@email.com"
              type="email"
            />
          </div>

          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Store className="h-5 w-5 text-orange-400" />
              Datos de tu tienda
            </h2>

            <Field
              icon={<Store className="h-4 w-4" />}
              label="Nombre de la tienda *"
              value={form.storeName}
              onChange={(v) => update("storeName", v)}
              placeholder="Bodega Don Juan"
            />
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-4 w-4" />
                  Categoría
                </span>
              </label>
              <select
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6] outline-none transition-colors"
              >
                <option value="">Selecciona una categoría</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <Field
              icon={<MapPin className="h-4 w-4" />}
              label="Zona / Dirección"
              value={form.zone}
              onChange={(v) => update("zone", v)}
              placeholder="Jr. Lima 123, Callería"
            />
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Descripción breve (opcional)
                </span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Cuéntanos sobre tu tienda..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6] outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#00B4A6] text-white font-semibold text-lg hover:bg-[#00a396] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                Enviar solicitud
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-500">
            Al registrarte aceptas nuestros{" "}
            <a href="/terminos" className="text-[#00B4A6] underline">
              términos y condiciones
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1.5">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-[#00B4A6] focus:ring-1 focus:ring-[#00B4A6] outline-none transition-colors"
      />
    </div>
  );
}
