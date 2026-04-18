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

import { useCallback } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { MOCK_DASHBOARD } from "@/lib/customer-dashboard.mock";
import { Breadcrumbs } from "@/components/ui-system/Breadcrumbs";
import WelcomeHero from "@/components/customer/cuenta-dashboard/WelcomeHero";
import QuickActionsGrid from "@/components/customer/cuenta-dashboard/QuickActionsGrid";
import SectionsGrid from "@/components/customer/cuenta-dashboard/SectionsGrid";
import PersonalizedRecommendations from "@/components/customer/cuenta-dashboard/PersonalizedRecommendations";
import ActivityFeed from "@/components/customer/cuenta-dashboard/ActivityFeed";
import CuentaFooter from "@/components/customer/cuenta-dashboard/CuentaFooter";

export function CuentaDashboardClient() {
  const { customer, clear } = useCustomer();
  const data = MOCK_DASHBOARD;

  // Si hay customer en contexto, usamos su nombre real. Si no, fallback a mock.
  const firstName =
    customer?.name?.split(" ")[0] ?? data.profile.firstName;
  const isAuthenticated = Boolean(customer);

  const handleSignOut = useCallback(() => {
    clear();
  }, [clear]);

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: "Mi cuenta" }]} />

      <WelcomeHero
        firstName={firstName}
        data={data}
        isAuthenticated={isAuthenticated}
      />

      <QuickActionsGrid data={data} />

      <SectionsGrid data={data} />

      <PersonalizedRecommendations data={data} />

      <ActivityFeed data={data} />

      <CuentaFooter onSignOut={handleSignOut} />
    </div>
  );
}

export default CuentaDashboardClient;
