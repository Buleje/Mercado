"use client";

/**
 * TrialCountdownBannerLoader — wrapper que hace fetch a /api/plan y renderiza
 * el TrialCountdownBanner si corresponde.
 *
 * Reglas de visibilidad:
 *  - plan === "free" && trialEndsAt set → renderiza el banner (la severidad
 *    interna decide si oculta a >7 días)
 *  - plan pagado → no renderiza
 *  - error de fetch → silencioso (no romper el panel)
 *
 * Ver ADR-084.
 */

import { useEffect, useState } from "react";
import { TrialCountdownBanner } from "./TrialCountdownBanner";
import { cachedJson } from "@/lib/client-cache-fetch";

interface PlanResponse {
  plan: string;
  tenant: {
    trialEndsAt: string | null;
    stripeCustomerId: string | null;
  };
}

export function TrialCountdownBannerLoader() {
  const [data, setData] = useState<PlanResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    // cachedJson: comparte la /api/plan con TrialExpiredGuard (misma carga).
    cachedJson<PlanResponse>("/api/plan", 60_000)
      .then((j) => {
        if (!cancelled && j) setData(j);
      })
      .catch(() => {
        // Silencioso — el banner es opcional, no debe romper el panel.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;
  if (data.plan !== "free") return null;
  if (!data.tenant.trialEndsAt) return null;

  return <TrialCountdownBanner trialEndsAt={data.tenant.trialEndsAt} />;
}
