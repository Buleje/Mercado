"use client";

/**
 * app/admin/_components/AdminOverlaysLayer.tsx
 *
 * Capa de overlays que siempre viven al final del AdminPage sin importar
 * qué tab esté activa: floating buttons, atajos, bottom bar mobile, morning
 * summary, onboarding wizard y onboarding tour.
 *
 * Extraído de app/admin/page.tsx en el Sprint A final del refactor.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ShortcutsModal } from "@/components/admin/AdminModals";
import { AdminFloatingButtons } from "@/components/admin/AdminFloatingButtons";
import { AdminMobileBottomBar } from "@/components/admin/AdminMobileBottomBar";
import { OnboardingTour } from "@/components/admin/OnboardingTour";

const AIStatusBanner = dynamic(() => import("@/components/admin/AIStatusBanner"), {
  ssr: false,
});
import type { useOnboarding } from "@/hooks/use-onboarding";
import type { Tab } from "../_lib/tabs.types";
import type { AdminRole } from "@/lib/session";

// 2026-05-26: MorningSummaryModal (overlay bloqueante "¡Buenos días!") removido.
// Reemplazado por MorningBriefingCard embebido en el tab Inicio — no bloquea la
// pantalla y solo aparece si hay algo accionable. Ver InicioDashboard.
const OnboardingWizard = dynamic(
  () => import("@/components/admin/OnboardingWizard"),
  { ssr: false },
);

// Burbuja flotante de chat con clientes (estilo FB) — lazy, solo aparece
// cuando hay mensajes sin leer (unreadForSeller > 0).
const AdminChatHead = dynamic(
  () => import("@/components/admin/AdminChatHead"),
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
  // Mismo tipo que entrega useAdminAuth: AIStatusBanner lo exige para el gate de rol.
  userRole: AdminRole;
  // Gate de rol para AIStatusBanner (2026-09-14): pega a una ruta con
  // allowedRoles acotado (ai-assistant/health) — antes se montaba sin saber si
  // el rol logueado podía pedirla y almacenero recibía 403 en cada carga.
  // `false` hasta que useAdminAuth resuelva el rol real evita pedir con el
  // "admin" optimista por default.
  authReady: boolean;
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
  authReady,
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

      <AIStatusBanner userRole={userRole} authReady={authReady} />
      {/* Burbuja flotante de chat (Brandon 2026-06-06): cliente escribe →
          avatar + badge abajo-derecha; responde sin salir del tab actual. */}
      <AdminChatHead />

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
