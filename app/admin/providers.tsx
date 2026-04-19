"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { VocabularyProvider } from "@/contexts/vocabulary-context";
import { ModuleTabsProvider } from "@/contexts/module-tabs-context";
import AdminMotionProvider from "@/components/admin/providers/AdminMotionProvider";
import { UndoToastProvider } from "@/components/admin/shared/UndoToast";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import { KeyboardShortcutsHelp } from "@/components/admin/shared/KeyboardShortcutsHelp";

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

  // Keyboard shortcuts help modal — Ctrl+? / Cmd+?
  const [showShortcuts, setShowShortcuts] = useState(false);
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "?" || e.key === "/")) {
        e.preventDefault();
        toggleShortcuts();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleShortcuts]);

  return (
    <AdminMotionProvider>
      <VocabularyProvider>
        <ModuleTabsProvider>
          <UndoToastProvider>
            <ConfirmDialogProvider>
              {children}
              <NotificationToast />
              {showFab && <QuickActionsFab />}
              <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
            </ConfirmDialogProvider>
          </UndoToastProvider>
        </ModuleTabsProvider>
      </VocabularyProvider>
    </AdminMotionProvider>
  );
}
