"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  User,
  Phone,
  MapPin,
  Bike,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Clock,
  DollarSign,
  Shield,
} from "lucide-react";

type FormState = {
  name: string;
  phone: string;
  zone: string;
  vehicleType: string;
  availability: string;
};

const ZONES = [
  "Centro", "Manantay", "Callería", "Yarinacocha", "Campo Verde",
];

const VEHICLES = [
  { id: "moto", label: "🏍️ Moto", desc: "Ideal para pedidos rápidos" },
  { id: "bicicleta", label: "🚲 Bicicleta", desc: "Ecológico y ágil" },
  { id: "auto", label: "🚗 Auto", desc: "Para pedidos grandes" },
  { id: "a_pie", label: "🚶 A pie", desc: "Para distancias cortas" },
];

export default function RepartidorPage() {
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    zone: "",
    vehicleType: "moto",
    availability: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/marketplace/drivers/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar solicitud");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (success) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 sm:p-12 max-w-md w-full text-center border border-gray-100 dark:border-gray-800 shadow-xl">
          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-3">
            ¡Solicitud enviada!
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Revisaremos tu solicitud y te contactaremos por WhatsApp en las próximas 24 horas.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            Volver al Marketplace
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Hero */}
      <section className="bg-linear-to-br from-orange-500 to-amber-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:py-20 text-center">
          <span className="text-5xl block mb-4">🛵</span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">
            Gana dinero repartiendo pedidos
          </h1>
          <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
            Únete como repartidor en Buleje. Tú eliges tu horario, tu zona y tu vehículo.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-5xl px-4 grid sm:grid-cols-3 gap-6">
          {[
            { icon: Clock, title: "Horario flexible", desc: "Trabaja cuando quieras. Sin jefes, sin horarios fijos." },
            { icon: DollarSign, title: "Ganancias por entrega", desc: "Cobra por cada pedido que entregues. Más entregas, más dinero." },
            { icon: Shield, title: "Soporte 24/7", desc: "Siempre hay alguien para ayudarte si algo sale mal." },
          ].map((b) => (
            <div
              key={b.title}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 text-center"
            >
              <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
                <b.icon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{b.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-lg px-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xl p-6 sm:p-8">
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-6">
              Completa tu solicitud
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Nombre completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Teléfono (WhatsApp)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="999 999 999"
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              {/* Zone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Zona donde quieres repartir
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    required
                    value={form.zone}
                    onChange={(e) => update("zone", e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none appearance-none"
                  >
                    <option value="">Selecciona tu zona</option>
                    {ZONES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vehicle */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Tipo de vehículo
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {VEHICLES.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => update("vehicleType", v.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        form.vehicleType === v.id
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-lg block">{v.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{v.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Availability */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Horario disponible
                </label>
                <div className="relative">
                  <Bike className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    required
                    value={form.availability}
                    onChange={(e) => update("availability", e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none appearance-none"
                  >
                    <option value="">¿Cuándo puedes repartir?</option>
                    <option value="manana">Mañanas (8am - 1pm)</option>
                    <option value="tarde">Tardes (1pm - 7pm)</option>
                    <option value="noche">Noches (7pm - 11pm)</option>
                    <option value="full">Todo el día</option>
                    <option value="fines">Solo fines de semana</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Enviar solicitud
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
