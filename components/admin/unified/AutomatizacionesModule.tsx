"use client";

/**
 * AutomatizacionesModule — por dónde entran y salen las operaciones.
 *
 * Dos puentes con el mundo de afuera, en el orden en que se usan:
 *
 *   1. **Telegram** — le hablás al bot y anota. Es el camino directo: no hay
 *      nada que instalar del otro lado, y aguanta audio.
 *   2. **n8n** — para lo que Telegram no cubre: enganchar WhatsApp, un correo,
 *      una planilla; y disparar flujos ya armados desde el chat del panel.
 *
 * Los dos terminan en el mismo lugar (`lib/plata/anotar`) y con la misma
 * confirmación: cambia el canal, no la regla.
 */

import dynamic from "next/dynamic";
import { Webhook } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// `ssr: false`: los dos paneles leen credenciales y estado en vivo del servidor
// de Telegram — no hay nada que renderizar de antemano.
const TelegramPanel = dynamic(() => import("@/components/admin/automatizaciones/TelegramPanel"), { loading: S, ssr: false });
const N8nPanel = dynamic(() => import("@/components/admin/automatizaciones/N8nPanel"), { loading: S, ssr: false });

export default function AutomatizacionesModule() {
  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Asistente · Automatizaciones"
        title="Anotar desde afuera"
        description="Dictale al bot de Telegram, o conectá n8n para que WhatsApp y tus flujos anoten en Buleje."
        icon={Webhook}
      />
      <TelegramPanel />
      <N8nPanel />
    </div>
  );
}
