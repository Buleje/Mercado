"use client";

/**
 * AutomatizacionesModule — los canales para anotar desde afuera del panel.
 *
 * Una cabecera en una fila (título · estado de la IA · volver a preguntar ·
 * Indicadores) y los tres canales plegados, cada uno con su estado y su último
 * uso en una línea:
 *
 *   1. **WhatsApp**: el número que ya usas. Le escribes al negocio y anota.
 *      Sólo los teléfonos habilitados hablan con el bot; el resto sigue con la
 *      tienda. El número del negocio se conecta en Mensajes › Bot WhatsApp.
 *   2. **Telegram**: el otro canal directo, también con audio.
 *   3. **n8n**: lo que ninguno de los dos cubre (un correo, una planilla) y los
 *      flujos que el asistente dispara desde el chat.
 *
 * Los tres terminan en el mismo lugar (`lib/asistente/conversar`) y con la
 * misma confirmación: cambia el canal, no la regla.
 *
 * El estado de la IA va en la cabecera: cuando el proveedor da de baja un
 * modelo, los canales siguen recibiendo mensajes y contestan «no pude
 * responder» —parece un problema de conexión y es un 404—.
 *
 * Los cuatro endpoints se leen UNA vez acá y se reparten: la cabecera, los
 * indicadores y cada canal hablan del mismo dato.
 */

import { Loader2, RefreshCw, Webhook } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import EstadoIA from "@/components/admin/automatizaciones/EstadoIA";
import IASaludPanel from "@/components/admin/automatizaciones/IASaludPanel";
import { useIndicadoresCanales } from "@/components/admin/automatizaciones/IndicadoresCanales";
import N8nPanel from "@/components/admin/automatizaciones/N8nPanel";
import TelegramPanel from "@/components/admin/automatizaciones/TelegramPanel";
import WhatsAppAnotarPanel from "@/components/admin/automatizaciones/WhatsAppAnotarPanel";
import { icono48 } from "@/components/admin/automatizaciones/piezas-canal";
import { useCanal, useSaludIA } from "@/components/admin/automatizaciones/shared";
import {
  API_N8N,
  API_SALUD,
  API_TELEGRAM,
  API_WHATSAPP,
  type ConfigN8n,
  type Diagnostico,
  type EstadoTelegram,
  type EstadoWhatsApp,
} from "@/components/admin/automatizaciones/tipos";

export default function AutomatizacionesModule() {
  const salud = useSaludIA<Diagnostico>(API_SALUD);
  const wa = useCanal<EstadoWhatsApp>(API_WHATSAPP, "No se pudo leer el estado del WhatsApp del negocio");
  const tg = useCanal<EstadoTelegram>(API_TELEGRAM, "No se pudo leer el estado del bot");
  const n8n = useCanal<ConfigN8n>(API_N8N, "No se pudo leer la configuración de n8n");
  const { boton, panel, abierto } = useIndicadoresCanales({
    salud: salud.dato,
    saludCargando: salud.cargando,
    wa,
    tg,
    n8n,
  });

  return (
    <div className="space-y-4">
      {/* Dentro del hub no se dibuja (la pestaña ya nombra la vista); queda por el estándar del módulo. */}
      <AdminModuleHeader eyebrow="Asistente · Automatizaciones" title="Canales para anotar" icon={Webhook} />

      {/* Una fila desde 1280 (si no entra, el chip se recorta: su texto sigue en el ⓘ). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-1.5">
          <SectionTitle>Canales para anotar</SectionTitle>
          <InfoTip
            title="Canales para anotar"
            what="WhatsApp, Telegram y n8n anotan en los mismos libros y con la misma confirmación: te muestran qué se va a anotar y recién al confirmar queda."
            affects="Lo de arriba es el estado de la IA: si un modelo se cae, los canales siguen recibiendo mensajes pero contestan «no pude responder»."
            side="bottom"
          />
        </div>
        <EstadoIA dato={salud.dato} cargando={salud.cargando} error={salud.error} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={salud.preguntar}
            disabled={salud.preguntando}
            aria-label="Volver a preguntar a la IA"
            title="Volver a preguntar a la IA"
            className={icono48}
          >
            {salud.preguntando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
          {boton}
        </div>
      </div>

      {abierto && (
        <div className="space-y-3">
          {panel}
          {salud.dato && <IASaludPanel dato={salud.dato} />}
        </div>
      )}

      <WhatsAppAnotarPanel canal={wa} />
      <TelegramPanel canal={tg} />
      <N8nPanel canal={n8n} />
    </div>
  );
}
