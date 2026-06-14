import { Suspense } from "react";
import SuperAdminMessenger from "@/components/superadmin/chat/SuperAdminMessenger";

export const metadata = {
  title: "Chat — Platform Admin | Buleje",
  robots: "noindex, nofollow",
};

// Messenger de pantalla completa (maneja su propio layout list/hilo/composer).
// La auth + el chrome (sidebar/header) los aporta app/superadmin/layout.tsx.
// Suspense: SuperAdminMessenger usa useSearchParams (deep-link ?tenant/?c).
export default function SuperAdminChatPage() {
  return (
    <Suspense fallback={null}>
      <SuperAdminMessenger />
    </Suspense>
  );
}
