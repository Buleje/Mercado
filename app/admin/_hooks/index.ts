/**
 * app/admin/_hooks/index.ts
 *
 * Barrel export de todos los hooks locales del panel admin. Permite que
 * `app/admin/page.tsx` importe con una sola línea en vez de ~30.
 *
 * Nuevos hooks locales deben agregarse aquí para mantener el import
 * centralizado.
 */

export { useAdminTabs } from "./useAdminTabs";
export { useTabFrequency } from "./useTabFrequency";
export { useAdminModals } from "./useAdminModals";
export { useKeyboardShortcuts } from "./useKeyboardShortcuts";
export { useAdminLayout } from "./useAdminLayout";
export { useFavoritesAndRecent } from "./useFavoritesAndRecent";
export { useImpersonation } from "./useImpersonation";
export { useDemoCleanup } from "./useDemoCleanup";
export { useAdminAuth } from "./useAdminAuth";
export { useWebhookPendingCount } from "./useWebhookPendingCount";
export { useChangelogBadge } from "./useChangelogBadge";
export { useHiddenTabs } from "./useHiddenTabs";
export { useCategoryOrder } from "./useCategoryOrder";
export { useOnboardingTrigger } from "./useOnboardingTrigger";
export { useAdminAlerts } from "./useAdminAlerts";
export { useNewOrderNotification } from "./useNewOrderNotification";
export { useNotificationPermissionPrompt } from "./useNotificationPermissionPrompt";
export { useMobileTableCards } from "./useMobileTableCards";
export { useOnboardingTourTrigger } from "./useOnboardingTourTrigger";
export { useDocumentTitle } from "./useDocumentTitle";
export { useSwipeNavigation } from "./useSwipeNavigation";
export { useAdminNavigateEvent } from "./useAdminNavigateEvent";
export { useSidebarShortcuts } from "./useSidebarShortcuts";
export { useClearDataFlow } from "./useClearDataFlow";
export { useCustomShortcuts } from "./useCustomShortcuts";
export { useCommandItems } from "./useCommandItems";
export { useAdminTabsDerived } from "./useAdminTabsDerived";
export { useAdminPageState } from "./useAdminPageState";
export { useAdminTenantPath } from "./useAdminTenantPath";
export { useFuzzyMatch } from "./useFuzzyMatch";
export { useVisibleCategories } from "./useVisibleCategories";
export { useAdminMode } from "./useAdminMode";
export type { AdminMode } from "./useAdminMode";
