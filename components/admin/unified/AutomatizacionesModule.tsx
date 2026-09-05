"use client";

/**
 * AutomatizacionesModule — por dónde entran y salen las operaciones.
 *
 * Dos puentes con el mundo de afuera, en el orden en que se usan:
 *
 *   1. **WhatsApp** — el número que ya usás. No hay que instalar nada ni abrir
 *      otra app: le escribís al negocio y anota. Sólo los teléfonos habilitados
 *      hablan con el bot; el resto sigue con la tienda.
 *   2. **Telegram** — el otro canal directo, también con audio.
 *   3. **n8n** — para lo que ninguno de los dos cubre: un correo, una planilla;
 *      y disparar flujos ya armados desde el chat del panel.
 *
 * Los dos terminan en el mismo lugar (`lib/asistente/conversar`) y con la misma
 * confirmación: cambia el canal, no la regla.
 */

import dynamic from "next/dynamic";
import { Webhook } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// `ssr: false`: los dos paneles leen credenciales y estado en vivo del servidor
// de Telegram — no hay nada que renderizar de antemano.
const WhatsAppAnotarPanel = dynamic(() => import("@/components/admin/automatizaciones/WhatsAppAnotarPanel"), { loading: S, ssr: false });
const TelegramPanel = dynamic(() => import("@/components/admin/automatizaciones/TelegramPanel"), { loading: S, ssr: false });
const N8nPanel = dynamic(() => import("@/components/admin/automatizaciones/N8nPanel"), { loading: S, ssr: false });

export default function AutomatizacionesModule() {
  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Asistente · Automatizaciones"
        title="Anotar desde afuera"
        description="Dictale por WhatsApp o Telegram, o conectá n8n para que tus flujos anoten en Buleje."
        icon={Webhook}
      />
      <WhatsAppAnotarPanel />
      <TelegramPanel />
      <N8nPanel />
    </div>
  );
}
