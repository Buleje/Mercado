"use client";

import React, { useState, useEffect } from "react";
import { Shield, Zap, Rocket, X, Sparkles, Settings2, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type ModuleTier, TIER_LABELS, MODULE_TIER_MAP } from "@/hooks/useModuleTiers";

const TOUR_KEY = "buleje-tier-tour-seen";

const TIER_ICONS: Record<ModuleTier, React.ElementType> = {
  principal: Shield,
  intermedio: Zap,
  avanzado: Rocket,
};

const TIER_COLORS: Record<ModuleTier, { bg: string; active: string; ring: string }> = {
  principal: {
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    active: "bg-[var(--accent-soft)] text-white ",
    ring: "ring-[var(--data-success-500)]/40 dark:ring-[var(--data-success-500)]/40",
  },
  intermedio: {
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20",
    active: "bg-[var(--data-warning-500)] text-white ",
    ring: "ring-[var(--data-warning-500)] dark:ring-[var(--data-warning-500)]",
  },
  avanzado: {
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    active: "bg-[var(--accent-soft)] text-white ",
    ring: "ring-[var(--data-success-500)]/40 dark:ring-[var(--data-success-500)]/40",
  },
};

const TIERS: ModuleTier[] = ["principal", "intermedio", "avanzado"];

interface TierSelectorProps {
  tier: ModuleTier;
  onTierChange: (tier: ModuleTier) => void;
  collapsed?: boolean;
  stats?: { visible: number; total: number };
  overrides?: Record<string, ModuleTier>;
  onModuleTierChange?: (moduleId: string, tier: ModuleTier) => void;
  onResetOverrides?: () => void;
}

export default function TierSelector({ tier, onTierChange, collapsed, stats, overrides, onModuleTierChange, onResetOverrides }: TierSelectorProps) {
  const [showTour, setShowTour] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        setShowTour(true);
      }
    } catch { /* ignore */ }
  }, []);

  const dismissTour = () => {
    setShowTour(false);
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ }
  };

  if (collapsed) {
    // Compact: just an icon that cycles through tiers
    const Icon = TIER_ICONS[tier];
    const colors = TIER_COLORS[tier];
    return (
      <button
        onClick={() => {
          const idx = TIERS.indexOf(tier);
          onTierChange(TIERS[(idx + 1) % TIERS.length]);
        }}
        title={`Nivel: ${TIER_LABELS[tier].label} — clic para cambiar`}
        className={cn(
          "w-full flex items-center justify-center p-2 rounded-xl transition-all",
          colors.active
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
          Nivel de uso
        </span>
        {stats && (
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {stats.visible} módulos
          </span>
        )}
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-surface rounded-xl">
        {TIERS.map((t) => {
          const Icon = TIER_ICONS[t];
          const isActive = tier === t;
          const colors = TIER_COLORS[t];
          const meta = TIER_LABELS[t];

          return (
            <button
              key={t}
              onClick={() => onTierChange(t)}
              title={meta.description}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[length:var(--ts-xs)] font-bold transition-all",
                isActive
                  ? colors.active
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)] hover:bg-white dark:hover:bg-[var(--surface-raised)]"
              )}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden xl:inline">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] px-1 leading-relaxed">
        {tier === "principal"
          ? "Solo lo esencial — ideal si estás empezando"
          : tier === "intermedio"
            ? "Más herramientas — para cuando ya manejas lo básico"
            : "Todo habilitado — acceso completo a todas las funciones"
        }
      </p>

      {/* First-use tour tooltip */}
      {showTour && (
        <div className="relative mt-2 p-3 bg-primary/10 dark:bg-primary/20 border border-primary/20 rounded-xl">
          <button
            onClick={dismissTour}
            className="absolute top-1.5 right-1.5 p-0.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)]"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                ¡Nuevo! Elige tu nivel
              </p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted mt-0.5 leading-relaxed">
                Si estás empezando, usa <strong>Principal</strong> — solo verás lo básico.
                Cuando te sientas cómodo, sube a <strong>Intermedio</strong>.
                <strong> Avanzado</strong> muestra todo.
              </p>
              <button
                onClick={dismissTour}
                className="mt-1.5 text-[length:var(--ts-2xs)] font-bold text-primary hover:underline"
              >
                Entendido ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customize button */}
      {onModuleTierChange && (
        <button
          onClick={() => setShowCustomize(v => !v)}
          className="flex items-center gap-1 px-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hover:text-primary transition-colors"
        >
          <Settings2 className="h-3 w-3" />
          {showCustomize ? "Cerrar personalización" : "Personalizar módulos"}
          {overrides && Object.keys(overrides).length > 0 && (
            <span className="ml-1 text-[length:var(--ts-2xs)] bg-primary/10 text-primary px-1 rounded-full font-bold">
              {Object.keys(overrides).length}
            </span>
          )}
        </button>
      )}

      {/* Customize panel */}
      {showCustomize && onModuleTierChange && (
        <div className="mt-1 p-2 bg-gray-50 dark:bg-surface rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] max-h-52 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
              Mover módulos entre niveles
            </span>
            {overrides && Object.keys(overrides).length > 0 && onResetOverrides && (
              <button
                onClick={onResetOverrides}
                className="flex items-center gap-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Resetear
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {Object.entries(MODULE_TIER_MAP).sort((a, b) => a[0].localeCompare(b[0])).map(([moduleId, defaultTier]) => {
              const currentTier = overrides?.[moduleId] || defaultTier;
              const isOverridden = overrides?.[moduleId] !== undefined;
              return (
                <div key={moduleId} className="flex items-center justify-between gap-1 py-0.5">
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] truncate flex-1",
                    isOverridden ? "font-bold text-primary" : "text-[var(--text-secondary)] dark:text-muted"
                  )}>
                    {moduleId.replace(/-/g, " ")}
                    {isOverridden && " ✏️"}
                  </span>
                  <div className="flex gap-0.5">
                    {(["principal", "intermedio", "avanzado"] as ModuleTier[]).map(t => {
                      const Icon = TIER_ICONS[t];
                      const isActive = currentTier === t;
                      return (
                        <button
                          key={t}
                          onClick={() => onModuleTierChange(moduleId, t)}
                          title={TIER_LABELS[t].label}
                          className={cn(
                            "p-0.5 rounded transition-colors",
                            isActive
                              ? TIER_COLORS[t].active
                              : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
