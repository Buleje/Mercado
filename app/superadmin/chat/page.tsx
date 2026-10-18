import { Suspense } from "react";
import { MessageSquare } from "@buleje/design-system/icons";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import SuperAdminMessenger from "@/components/superadmin/chat/SuperAdminMessenger";
import {
  SuperAdminModuleTabs,
  COMUNICACION_TABS,
} from "@/components/superadmin/_shared/ModuleTabs";

export const metadata = {
  title: "Chat — Platform Admin | Buleje",
  robots: "noindex, nofollow",
};

// Messenger de pantalla completa (maneja su propio layout list/hilo/composer).
// La auth + el chrome (sidebar/header) los aporta app/superadmin/layout.tsx.
// Suspense: SuperAdminMessenger usa useSearchParams (deep-link ?tenant/?c).
export default function SuperAdminChatPage() {
  return (
    <>
      <CabeceraConPestanas
        icon={MessageSquare}
        title="Chat"
        kicker="Plataforma · Comunicación"
        info={{
          title: "Chat con los negocios",
          what: "Conversaciones del equipo Buleje con cada negocio, y avisos a varios a la vez (Broadcast).",
          example: "Un negocio pregunta cómo emitir su boleta → le respondes acá y queda el hilo guardado.",
        }}
        pestanas={<SuperAdminModuleTabs enLinea tabs={COMUNICACION_TABS} />}
        className="mb-4"
      />
      <Suspense fallback={null}>
        <SuperAdminMessenger />
      </Suspense>
    </>
  );
}
