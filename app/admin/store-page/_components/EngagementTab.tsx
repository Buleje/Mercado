"use client";

import { useState } from "react";
import {
  Gamepad2,
  Gift,
  Star,
  Trophy,
  Target,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

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
    description:
      "Los clientes giran una ruleta para ganar descuentos, envío gratis o productos. Genera emoción y datos de contacto.",
    enabled: false,
  },
  {
    id: "loyalty_points",
    icon: Star,
    title: "Puntos de fidelidad",
    description:
      "Cada compra acumula puntos canjeables por descuentos. Los clientes vuelven para canjear.",
    enabled: false,
  },
  {
    id: "referral_program",
    icon: Trophy,
    title: "Programa de referidos",
    description:
      "Clientes invitan amigos y ambos ganan descuento. Crecimiento orgánico sin publicidad.",
    enabled: false,
  },
  {
    id: "scratch_card",
    icon: Sparkles,
    title: "Raspa y gana",
    description:
      "Tarjeta virtual que el cliente raspa después de comprar. Sorpresa instantánea con descuento para la próxima compra.",
    enabled: false,
  },
  {
    id: "daily_challenge",
    icon: Target,
    title: "Reto diario",
    description:
      "Compra X producto hoy y gana Y% de descuento. Genera urgencia y visitas diarias.",
    enabled: false,
  },
];

export default function EngagementTab() {
  const [features, setFeatures] = useState(FEATURES);
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (id: string) => {
    setSaving(id);
    setFeatures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
    );
    try {
      await fetch("/api/store-page/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureId: id,
          enabled: !features.find((f) => f.id === id)?.enabled,
        }),
      });
    } catch {
      /* siguiente reload reconcilia */
    }
    setSaving(null);
  };

  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <AdminTabShell
      title="Engagement y juegos"
      description={`Activá mecánicas de juego para que tus clientes vuelvan cada día. ${
        enabledCount > 0
          ? `${enabledCount} activa${enabledCount > 1 ? "s" : ""}`
          : "Ninguna activa aún"
      }.`}
      icon={Gamepad2}
    >
      <div className="space-y-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className={`rounded-xl border p-5 transition-all ${
                feature.enabled
                  ? "border-[var(--accent)]/30 bg-[var(--accent-soft)]/30"
                  : "border-[var(--rule-soft)] bg-[var(--surface-raised)]"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                    feature.enabled
                      ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={ADMIN_TOKENS.headingH3}>{feature.title}</h3>
                    <button
                      type="button"
                      onClick={() => toggle(feature.id)}
                      disabled={saving === feature.id}
                      className="shrink-0"
                      aria-label={
                        feature.enabled
                          ? `Desactivar ${feature.title}`
                          : `Activar ${feature.title}`
                      }
                      aria-pressed={feature.enabled}
                    >
                      {feature.enabled ? (
                        <ToggleRight
                          className="h-8 w-8 text-[var(--accent)]"
                          aria-hidden
                        />
                      ) : (
                        <ToggleLeft
                          className="h-8 w-8 text-[var(--text-tertiary)]"
                          aria-hidden
                        />
                      )}
                    </button>
                  </div>
                  <p className={`${ADMIN_TOKENS.bodyText} mt-1 leading-relaxed`}>
                    {feature.description}
                  </p>
                  {feature.enabled && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[length:var(--ts-2xs)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold uppercase tracking-wider px-2 py-1 rounded-lg">
                        Activa en tu tienda
                      </span>
                      <button
                        type="button"
                        className={ADMIN_TOKENS.btnGhost}
                      >
                        Configurar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Próximamente — empty state suave */}
      <div className={`${ADMIN_TOKENS.cardPadded}`}>
        <div className="flex items-center gap-3">
          <Gamepad2
            className="h-5 w-5 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <h3 className={ADMIN_TOKENS.headingH3}>Más mecánicas próximamente</h3>
        </div>
        <p className={ADMIN_TOKENS.bodyText}>
          Estamos trabajando en: sorteos automáticos, trivias de productos,
          cupones por geolocalización, y gamificación avanzada con niveles.
        </p>
      </div>
    </AdminTabShell>
  );
}
