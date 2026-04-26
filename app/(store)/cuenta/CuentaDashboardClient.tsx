"use client";

/**
 * CuentaDashboardClient — orquestador del dashboard unificado /cuenta.
 *
 * Compone las secciones del dashboard:
 *   1. WelcomeHero
 *   2. QuickActionsGrid
 *   3. SectionsGrid (todas las satellite)
 *   4. PersonalizedRecommendations
 *   5. ActivityFeed
 *   6. CuentaFooter
 */

import { useCallback, useMemo } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { useCustomerIntelligence } from "@/hooks/use-customer-intelligence";
import { useTenantPath } from "@/hooks/use-tenant-path";
import { MOCK_DASHBOARD } from "@/lib/customer-dashboard.mock";
import { Breadcrumbs } from "@/components/ui-system/Breadcrumbs";
import WelcomeHero from "@/components/customer/cuenta-dashboard/WelcomeHero";
import QuickActionsGrid from "@/components/customer/cuenta-dashboard/QuickActionsGrid";
import SectionsGrid from "@/components/customer/cuenta-dashboard/SectionsGrid";
import PersonalizedRecommendations from "@/components/customer/cuenta-dashboard/PersonalizedRecommendations";
import ActivityFeed from "@/components/customer/cuenta-dashboard/ActivityFeed";
import CuentaFooter from "@/components/customer/cuenta-dashboard/CuentaFooter";
import LoyaltyPointsWidget from "@/components/ui-system/LoyaltyPointsWidget";

// Threshold de puntos por tier — consistente con hooks/use-customer-intelligence.ts.
const TIER_THRESHOLDS: Record<"bronce" | "plata" | "oro" | "diamante", number> = {
  bronce: 0,
  plata: 500,
  oro: 2000,
  diamante: 5000,
};
const TIER_ORDER: Array<"bronce" | "plata" | "oro" | "diamante"> = [
  "bronce",
  "plata",
  "oro",
  "diamante",
];

function nextTierInfo(
  currentTier: "bronce" | "plata" | "oro" | "diamante",
  points: number,
): { nextTierName: string | null; pointsToNextTier: number | null } {
  const idx = TIER_ORDER.indexOf(currentTier);
  const next = TIER_ORDER[idx + 1];
  if (!next) return { nextTierName: null, pointsToNextTier: null };
  const threshold = TIER_THRESHOLDS[next];
  return {
    nextTierName: next.charAt(0).toUpperCase() + next.slice(1),
    pointsToNextTier: Math.max(0, threshold - points),
  };
}

function prefixHrefs<T>(node: T, prefix: (path: string) => string): T {
  if (Array.isArray(node)) {
    return node.map((item) => prefixHrefs(item, prefix)) as unknown as T;
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "href" && typeof v === "string") out[k] = prefix(v);
      else out[k] = prefixHrefs(v, prefix);
    }
    return out as T;
  }
  return node;
}

export function CuentaDashboardClient() {
  const { customer, clear } = useCustomer();
  const { data: intelligence } = useCustomerIntelligence();
  const tenantPath = useTenantPath();
  const data = useMemo(() => prefixHrefs(MOCK_DASHBOARD, tenantPath), [tenantPath]);

  // Si hay customer en contexto, usamos su nombre real. Si no, fallback a mock.
  const firstName =
    customer?.name?.split(" ")[0] ?? data.profile.firstName;
  const isAuthenticated = Boolean(customer);

  const handleSignOut = useCallback(() => {
    clear();
  }, [clear]);

  // Loyalty widget visible solo si el user es socio o tiene puntos
  const showLoyalty =
    isAuthenticated && intelligence.loyaltyTier !== null && intelligence.loyaltyPoints > 0;
  const tierForWidget = intelligence.loyaltyTier ?? "bronce";
  const { nextTierName, pointsToNextTier } = nextTierInfo(
    tierForWidget,
    intelligence.loyaltyPoints,
  );

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: "Mi cuenta" }]} />

      <WelcomeHero
        firstName={firstName}
        data={data}
        isAuthenticated={isAuthenticated}
      />

      {showLoyalty && (
        <LoyaltyPointsWidget
          points={intelligence.loyaltyPoints}
          tier={tierForWidget}
          nextTierName={nextTierName}
          pointsToNextTier={pointsToNextTier}
          href={tenantPath("/cuenta/socio-buleje")}
          variant="full"
        />
      )}

      <QuickActionsGrid data={data} />

      <SectionsGrid data={data} />

      <PersonalizedRecommendations data={data} />

      <ActivityFeed data={data} />

      <CuentaFooter onSignOut={handleSignOut} />
    </div>
  );
}

export default CuentaDashboardClient;
