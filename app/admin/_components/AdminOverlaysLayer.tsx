"use client";

/**
 * app/admin/_components/AdminOverlaysLayer.tsx
 *
 * Capa de overlays que siempre viven al final del AdminPage sin importar
 * qué tab esté activa: floating buttons, atajos, bottom bar mobile, SSE
 * listener, morning summary, onboarding wizard y onboarding tour.
 *
 * Extraído de app/admin/page.tsx en el Sprint A final del refactor.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ShortcutsModal } from "@/components/admin/AdminModals";
import { AdminFloatingButtons } from "@/components/admin/AdminFloatingButtons";
import { AdminMobileBottomBar } from "@/components/admin/AdminMobileBottomBar";
import { OnboardingTour } from "@/components/admin/OnboardingTour";
import SSEListener from "@/components/admin/SSEListener";
import type { useOnboarding } from "@/hooks/use-onboarding";
import type { Tab } from "../_lib/tabs.types";

const MorningSummaryModal = dynamic(
  () => import("@/components/admin/MorningSummaryModal"),
  { ssr: false },
);
const OnboardingWizard = dynamic(
  () => import("@/components/admin/OnboardingWizard"),
  { ssr: false },
);

type FilteredTabs = ComponentProps<typeof AdminMobileBottomBar>["filteredTabs"];
type OnboardingApi = ReturnType<typeof useOnboarding>;

export interface AdminOverlaysLayerProps {
  // Floating buttons + shortcuts
  focusMode: boolean;
  presentationMode: boolean;
  onToggleFocus: () => void;
  onExitPresentation: () => void;
  showShortcuts: boolean;
  onCloseShortcuts: () => void;

  // Mobile bottom bar
  userRole: string;
  tab: Tab;
  filteredTabs: FilteredTabs;
  alerts: Record<string, number>;
  navigateTab: (tab: Tab) => void;
  onOpenMobileNav: () => void;

  // Onboarding
  showOnboarding: boolean;
  setShowOnboarding: (v: boolean) => void;
  activeTenantSlug: string | null | undefined;
  onboarding: OnboardingApi;
}

export function AdminOverlaysLayer({
  focusMode,
  presentationMode,
  onToggleFocus,
  onExitPresentation,
  showShortcuts,
  onCloseShortcuts,
  userRole,
  tab,
  filteredTabs,
  alerts,
  navigateTab,
  onOpenMobileNav,
  showOnboarding,
  setShowOnboarding,
  activeTenantSlug,
  onboarding,
}: AdminOverlaysLayerProps) {
  return (
    <>
      <AdminFloatingButtons
        focusMode={focusMode}
        presentationMode={presentationMode}
        onToggleFocus={onToggleFocus}
        onExitPresentation={onExitPresentation}
      />

      <ShortcutsModal open={showShortcuts} onClose={onCloseShortcuts} />

      <AdminMobileBottomBar
        userRole={userRole}
        currentTab={tab}
        filteredTabs={filteredTabs}
        alerts={alerts}
        onNavigate={navigateTab}
        onOpenMobileNav={onOpenMobileNav}
      />

      <SSEListener />
      <MorningSummaryModal />

      {showOnboarding && (
        <OnboardingWizard
          tenantSlug={activeTenantSlug ?? "main"}
          onClose={() => setShowOnboarding(false)}
        />
      )}

      <OnboardingTour
        isTourActive={onboarding.isTourActive}
        currentStep={onboarding.currentStep}
        totalSteps={onboarding.totalSteps}
        onNext={onboarding.nextStep}
        onPrev={onboarding.prevStep}
        onSkip={onboarding.skipTour}
        onComplete={onboarding.completeTour}
        onNavigateTab={navigateTab}
      />
    </>
  );
}
