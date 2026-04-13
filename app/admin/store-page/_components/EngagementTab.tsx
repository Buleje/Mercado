"use client";

import { useState } from "react";
import { Gamepad2, Gift, Star, Trophy, Target, Sparkles, ToggleLeft, ToggleRight } from "lucide-react";

type EngagementFeature = {
  id: string;
  icon: typeof Gift;
  title: string;
  description: string;
  enabled: boolean;
  config?: Record<string, unknown>;
};

const FEATURES: EngagementFeature[] = [
  {
    id: "spin_wheel",
    icon: Gift,
    title: "Ruleta de premios",
    description: "Los clientes giran una ruleta para ganar descuentos, envio gratis o productos. Genera emocion y datos de contacto.",
    enabled: false,
  },
  {
    id: "loyalty_points",
    icon: Star,
    title: "Puntos de fidelidad",
    description: "Cada compra acumula puntos canjeables por descuentos. Los clientes vuelven para canjear.",
    enabled: false,
  },
  {
    id: "referral_program",
    icon: Trophy,
    title: "Programa de referidos",
    description: "Clientes invitan amigos y ambos ganan descuento. Crecimiento organico sin publicidad.",
    enabled: false,
  },
  {
    id: "scratch_card",
    icon: Sparkles,
    title: "Raspa y gana",
    description: "Tarjeta virtual que el cliente raspa despues de comprar. Sorpresa instantanea con descuento para la proxima compra.",
    enabled: false,
  },
  {
    id: "daily_challenge",
    icon: Target,
    title: "Reto diario",
    description: "Compra X producto hoy y gana Y% de descuento. Genera urgencia y visitas diarias.",
    enabled: false,
  },
];

export default function EngagementTab() {
  const [features, setFeatures] = useState(FEATURES);
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (id: string) => {
    setSaving(id);
    setFeatures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
    // Fire-and-forget save
    await fetch("/api/store-page/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureId: id, enabled: !features.find((f) => f.id === id)?.enabled }),
    }).catch(() => {});
    setSaving(null);
  };

  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Engagement y juegos</h2>
        <p className="text-sm text-gray-500">
          Activa mecanicas de juego para que tus clientes vuelvan cada dia. {enabledCount > 0 ? `${enabledCount} activo${enabledCount > 1 ? "s" : ""}` : "Ninguno activo aun"}.
        </p>
      </div>

      <div className="space-y-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className={`rounded-xl border p-5 transition-all ${
                feature.enabled
                  ? "border-primary/30 bg-primary/5"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                  feature.enabled ? "bg-primary/20 text-primary" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                }`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{feature.title}</h3>
                    <button
                      onClick={() => toggle(feature.id)}
                      disabled={saving === feature.id}
                      className="shrink-0"
                    >
                      {feature.enabled ? (
                        <ToggleRight className="h-8 w-8 text-primary" />
                      ) : (
                        <ToggleLeft className="h-8 w-8 text-gray-300" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{feature.description}</p>
                  {feature.enabled && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-1 rounded-lg">Activo en tu tienda</span>
                      <button className="text-xs text-primary font-medium hover:underline">Configurar</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coming soon callout */}
      <div className="rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 border border-violet-200 dark:border-violet-800 p-5">
        <div className="flex items-center gap-3 mb-2">
          <Gamepad2 className="h-5 w-5 text-violet-600" />
          <h3 className="font-semibold text-violet-900 dark:text-violet-300">Mas mecanicas proximamente</h3>
        </div>
        <p className="text-sm text-violet-700 dark:text-violet-400">
          Estamos trabajando en: sorteos automaticos, trivias de productos, cupones por geolocalización, y gamificacion avanzada con niveles.
        </p>
      </div>
    </div>
  );
}
