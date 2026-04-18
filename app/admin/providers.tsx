"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { VocabularyProvider } from "@/contexts/vocabulary-context";
import { ModuleTabsProvider } from "@/contexts/module-tabs-context";
import AdminMotionProvider from "@/components/admin/providers/AdminMotionProvider";

const NotificationToast = dynamic(
  () => import("@/components/admin/shared/NotificationToast"),
  { ssr: false },
);

// Ola 4 v4.1 — QuickActionsFab global. Lazy loaded para no afectar TBT.
const QuickActionsFab = dynamic(
  () => import("@/components/admin/ux/QuickActionsFab").then((m) => ({ default: m.QuickActionsFab })),
  { ssr: false },
);

/** Rutas donde NO montar el FAB (login, kiosk, pos-mobile) */
const FAB_EXCLUDED_PATHS = [
  "/admin/login",
  "/admin/kiosk",
  "/admin/pos-mobile",
];

export function AdminProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showFab = !FAB_EXCLUDED_PATHS.some((p) => pathname?.startsWith(p));

  return (
    <AdminMotionProvider>
      <VocabularyProvider>
        <ModuleTabsProvider>
          {children}
          <NotificationToast />
          {showFab && <QuickActionsFab />}
        </ModuleTabsProvider>
      </VocabularyProvider>
    </AdminMotionProvider>
  );
}
