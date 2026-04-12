"use client";

import dynamic from "next/dynamic";
import { VocabularyProvider } from "@/contexts/vocabulary-context";

const NotificationToast = dynamic(
  () => import("@/components/admin/shared/NotificationToast"),
  { ssr: false },
);

export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <VocabularyProvider>
      {children}
      <NotificationToast />
    </VocabularyProvider>
  );
}
