"use client";

import dynamic from "next/dynamic";
import { VocabularyProvider } from "@/contexts/vocabulary-context";
import { ModuleTabsProvider } from "@/contexts/module-tabs-context";

const NotificationToast = dynamic(
  () => import("@/components/admin/shared/NotificationToast"),
  { ssr: false },
);

export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <VocabularyProvider>
      <ModuleTabsProvider>
        {children}
        <NotificationToast />
      </ModuleTabsProvider>
    </VocabularyProvider>
  );
}
