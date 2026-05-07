"use client";

/**
 * TrustBar — barra de confianza scrolling con chips configurables.
 *
 * FIX 2026-05-07 (audit storefront-admin): antes era 100% hardcoded —
 * "Delivery gratis S/50", "45 min", "Yape", etc. Aunque el dueño tuviera
 * delivery desde S/30 con entrega en 25min, las chips mostraban el texto fijo.
 *
 * Ahora lee `storeTheme.trustChips` (array de strings) si el admin configuró
 * desde el customizer. Si NO hay config, usa los defaults editoriales.
 *
 * Cada chip cicla por iconos para que la barra siga siendo visualmente rica
 * sin que el dueño tenga que elegir iconos manualmente.
 */

import { useState, useRef } from "react";
import { Truck, Shield, Clock, CreditCard, Leaf, HeartHandshake } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/settings-context";

const ICON_CYCLE = [Truck, Clock, Shield, CreditCard, Leaf, HeartHandshake];
const COLOR_CYCLE = [
  { color: "text-primary", bg: { background: "rgba(45,106,79,0.08)" } },
  { color: "text-secondary", bg: { background: "rgba(244,162,97,0.08)" } },
  { color: "text-[var(--data-success-600)]", bg: { background: "rgba(16,185,129,0.08)" } },
  { color: "text-purple-600", bg: { background: "rgba(147,51,234,0.08)" } },
  { color: "text-primary", bg: { background: "rgba(45,106,79,0.08)" } },
  { color: "text-[var(--data-error-500)]", bg: { background: "rgba(244,63,94,0.08)" } },
];

const DEFAULT_CHIPS = [
  "Delivery gratis desde S/50",
  "Entrega en menos de 45 min",
  "Productos frescos garantizados",
  "Paga con Yape o efectivo",
  "Productos locales de Ucayali",
  "Atención personalizada",
];

export default function TrustBar() {
  const { storeTheme } = useSettings();
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Si admin configuró trustChips (string[]) las usamos. Sino defaults.
  const adminChips =
    storeTheme && Array.isArray((storeTheme as Record<string, unknown>).trustChips)
      ? ((storeTheme as Record<string, unknown>).trustChips as unknown[])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim())
      : null;

  const chipTexts = adminChips && adminChips.length > 0 ? adminChips : DEFAULT_CHIPS;

  // Mapear cada chip de texto a icon+color via ciclo (modulo) para que la
  // barra siga siendo visualmente rica con N chips configurables.
  const chips = chipTexts.map((text, i) => ({
    text,
    icon: ICON_CYCLE[i % ICON_CYCLE.length],
    color: COLOR_CYCLE[i % COLOR_CYCLE.length].color,
    bgStyle: COLOR_CYCLE[i % COLOR_CYCLE.length].bg,
  }));

  // Duplicar para loop scrolling infinito sin saltos.
  const items = [...chips, ...chips];

  return (
    <div
      className="bg-white dark:bg-card border-y border-gray-100 dark:border-card-border py-4 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={scrollRef}
        className={cn(
          "flex items-center gap-6 sm:gap-10 whitespace-nowrap",
          paused ? "[animation-play-state:paused]" : ""
        )}
        style={{
          animation: "scrollX 35s linear infinite",
          width: "max-content",
        }}
      >
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 shrink-0 group">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-transform group-hover:scale-110")} style={item.bgStyle}>
              <item.icon className={cn("h-4 w-4 shrink-0", item.color)} />
            </span>
            <span className="text-xs sm:text-sm font-semibold text-foreground">
              {item.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
