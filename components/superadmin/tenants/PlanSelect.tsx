"use client";

/**
 * components/superadmin/tenants/PlanSelect.tsx
 *
 * Dropdown rico para que el superadmin asigne plan a un tenant manualmente.
 *
 * Diferencias con el original:
 *   - Usa los 4 nombres nuevos (Básico / Pro / Enterprise / Max)
 *     mapeados al `PlanId` legacy (free/pro/business/enterprise) que la DB
 *     entiende (vía lib/billing/plan-mapping.ts).
 *   - Pill colorido por tier para identificar el plan de un vistazo.
 *   - Click abre dropdown con cards (no `<select>` plano nativo).
 *   - Labels y precios visibles en cada opción.
 *
 * Mantiene el mismo contrato: `(slug, plan: PlanId) => void`.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Check, Sparkles, Zap, Rocket, Crown } from "@buleje/design-system/icons";
import type { PlanId } from "@/lib/superadmin-types";
import { PLAN_ID_LABEL, planIdToTier, tierToPlanId } from "@/lib/billing/plan-mapping";
import { PLANS, PLAN_ORDER, type PlanTier } from "@/lib/billing/plan-tiers";
import { cn } from "@/lib/utils";

interface PlanSelectProps {
  slug: string;
  current: PlanId;
  onChanged: (newPlan: PlanId) => void;
}

const TIER_COLOR: Record<PlanTier, { bg: string; text: string; ring: string; icon: typeof Sparkles }> = {
  basico: {
    bg: "bg-[var(--surface-sunken)]",
    text: "text-[var(--text-secondary)]",
    ring: "ring-[var(--rule-base)]",
    icon: Sparkles,
  },
  pro: {
    bg: "bg-[var(--accent-soft)]",
    text: "text-[var(--accent)]",
    ring: "ring-[var(--accent)]/30",
    icon: Zap,
  },
  enterprise: {
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
    text: "text-[var(--text-primary)]",
    ring: "ring-indigo-500/30",
    icon: Rocket,
  },
  max: {
    bg: "bg-amber-50 dark:bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/30",
    icon: Crown,
  },
};

export function PlanSelect({ slug, current, onChanged }: PlanSelectProps) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const currentTier = planIdToTier(current);
  const colors = TIER_COLOR[currentTier];
  const CurrentIcon = colors.icon;

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleChange = async (tier: PlanTier) => {
    const plan = tierToPlanId(tier);
    if (plan === current) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) onChanged(plan);
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-sunken)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Guardando…
      </span>
    );
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-black ring-1 transition-all hover:ring-2",
          colors.bg,
          colors.text,
          colors.ring,
        )}
      >
        <CurrentIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        {PLAN_ID_LABEL[current]}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1.5 w-[280px] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-xl p-1.5"
        >
          {PLAN_ORDER.map((tier) => {
            const def = PLANS[tier];
            const tierColors = TIER_COLOR[tier];
            const Icon = tierColors.icon;
            const isCurrent = planIdToTier(current) === tier;

            return (
              <button
                key={tier}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => void handleChange(tier)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors",
                  isCurrent
                    ? cn(tierColors.bg, "ring-2", tierColors.ring)
                    : "hover:bg-[var(--surface-sunken)]",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    tierColors.bg,
                    tierColors.text,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-[var(--text-primary)] truncate">
                      {def.label}
                    </p>
                    {isCurrent && (
                      <Check
                        className="h-3.5 w-3.5 text-[var(--data-success)] shrink-0"
                        strokeWidth={3}
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-bold text-[var(--text-tertiary)] truncate">
                    {def.price}
                    {def.period} · {def.unlockedTabs.size} módulos
                  </p>
                </div>
              </button>
            );
          })}
          <div className="mt-1 px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] border-t-2 border-[var(--rule-base)]">
            Cambio inmediato · sin cobro
          </div>
        </div>
      )}
    </div>
  );
}
