"use client";

/**
 * hooks/use-plan-tier.ts
 *
 * Hook reactivo que devuelve el plan actual del vendor + helpers
 * para verificar si un tab/feature está desbloqueado.
 *
 * Escucha el evento `buleje-plan-change` (disparado por
 * `setCurrentPlan` desde lib/billing/plan-tiers.ts) para actualizar
 * automáticamente cuando el dueño cambia de plan en /admin → Config.
 */

import { useCallback, useEffect, useState } from "react";
import {
  PLAN_CHANGE_EVENT,
  PLANS,
  type PlanFeature,
  type PlanTier,
  getCurrentPlan,
  planHasFeature,
  planIncludesTab,
  setCurrentPlan,
} from "@/lib/billing/plan-tiers";
import { planIdToTier } from "@/lib/billing/plan-mapping";
import { cachedJson } from "@/lib/client-cache-fetch";
import type { Tab } from "@/app/admin/_lib/tabs.types";

export interface UsePlanTierResult {
  plan: PlanTier;
  /** Definición completa (label, price, limits, etc.). */
  definition: (typeof PLANS)[PlanTier];
  /** True si el tab está desbloqueado en el plan actual. */
  hasTab: (tab: Tab) => boolean;
  /** True si la feature está desbloqueada. */
  hasFeature: (feature: PlanFeature) => boolean;
  /** Cambia el plan (actualiza localStorage + dispara evento). */
  setPlan: (next: PlanTier) => void;
}

export function usePlanTier(): UsePlanTierResult {
  const [plan, setPlan] = useState<PlanTier>(() => getCurrentPlan());

  // Sync con el backend al mount: si el superadmin cambió el plan del tenant
  // desde /superadmin/tenants, el cliente lo aprende vía /api/plan.
  // Fire-and-forget: si falla, dejamos el localStorage como source-of-truth.
  useEffect(() => {
    let cancelled = false;
    // cachedJson: dedup en-vuelo + cache 60s → los N componentes que usan este
    // hook comparten 1 sola request (antes: 1 /api/plan por consumidor = 5×).
    // `?tier=1`: endpoint liviano que NO corre las 3 COUNT queries de uso.
    cachedJson<{ plan?: string }>("/api/plan?tier=1", 60_000)
      .then((data) => {
        if (cancelled || !data?.plan) return;
        const serverTier = planIdToTier(data.plan as never);
        const localTier = getCurrentPlan();
        if (serverTier !== localTier) {
          // El backend manda — actualiza localStorage + dispara evento
          setCurrentPlan(serverTier);
        }
      })
      .catch(() => {
        /* sin /api/plan o sesión: silently fall back to localStorage */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ plan: PlanTier }>).detail;
      if (detail?.plan) setPlan(detail.plan);
    };
    window.addEventListener(PLAN_CHANGE_EVENT, onChange);
    // Sync por si otro tab/ventana cambia el plan via storage event.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "buleje:vendor-plan-tier") {
        setPlan(getCurrentPlan());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PLAN_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const hasTab = useCallback(
    (tab: Tab) => planIncludesTab(plan, tab),
    [plan],
  );
  const hasFeature = useCallback(
    (feature: PlanFeature) => planHasFeature(plan, feature),
    [plan],
  );
  const setPlanCb = useCallback((next: PlanTier) => {
    setCurrentPlan(next);
  }, []);

  return {
    plan,
    definition: PLANS[plan],
    hasTab,
    hasFeature,
    setPlan: setPlanCb,
  };
}
