import "server-only";

import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { logger } from "@/lib/logger";
import { errorSinDatos } from "@/lib/error-sin-datos";
import { enlaceAlPanelDeCamaras, mandarWhatsAppDeCamara } from "@/lib/camaras/avisar";
import type { AvisosCamara } from "@/lib/camaras/camaras";

/**
 * Avisar al dueño cuando alguien DESARMA una cámara (security 05-10, ADR-472):
 * apagar la detección deja de detectar y avisar, apagar el micrófono deja el
 * vivo y la grabación sin sonido. Prenderlos no avisa.
 *
 * Dos canales: SIEMPRE una notificación del panel (severidad HIGH: la ven
 * admin, dueño y encargado, no cajero ni almacenero) y, si la cámara tiene
 * un WhatsApp de avisos, también por ahí. Si el WhatsApp está caído queda la
 * del panel. Nunca tira: el cambio ya se hizo.
 */

export type DesarmeCamara = "deteccion" | "microfono";

const ROL_LEGIBLE: Record<string, string> = {
  admin: "administrador",
  owner: "dueño",
  manager: "encargado",
  almacenero: "almacenero",
};

const HORA = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function textoDelDesarme(
  que: DesarmeCamara,
  quien: { usuario: string; rol: string },
  camara: string,
  ahora: Date,
): { titulo: string; cuerpo: string } {
  const persona = `${quien.usuario} (${ROL_LEGIBLE[quien.rol] ?? quien.rol})`;
  const hora = HORA.format(ahora);
  return que === "deteccion"
    ? {
        titulo: `Apagaron la detección de «${camara}»`,
        cuerpo: `${persona} la apagó a las ${hora}. Mientras siga apagada, la cámara no detecta ni avisa y puede dejar de grabar por evento.`,
      }
    : {
        titulo: `Apagaron el micrófono de «${camara}»`,
        cuerpo: `${persona} lo apagó a las ${hora}. Mientras siga apagado, el vivo y la grabación no tienen sonido.`,
      };
}

export async function avisarDesarme(
  tenantId: string,
  quien: { usuario: string; rol: string },
  camara: { id: string; nombre: string; avisos?: AvisosCamara | null },
  que: DesarmeCamara,
  ahora: Date = new Date(),
): Promise<void> {
  const { titulo, cuerpo } = textoDelDesarme(que, quien, camara.nombre, ahora);
  const log = { camaraId: camara.id, que };

  const panel = NotificationCenterDB.create({
    tenantId,
    type: "camaras",
    severity: "HIGH",
    title: titulo,
    body: cuerpo,
    actionUrl: "/admin?tab=camaras",
    actionLabel: "Ver cámaras",
    entityId: camara.id,
  }).catch((err: unknown) =>
    logger.error("[camaras] el aviso del panel no se guardó", {
      tenantId,
      ...log,
      error: errorSinDatos(err),
    }),
  );

  const numero = camara.avisos?.cuando !== "nunca" ? camara.avisos?.whatsapp : null;
  const whatsapp = numero
    ? mandarWhatsAppDeCamara(
        tenantId,
        numero,
        `Cámaras: ${titulo}. ${cuerpo} Si no lo pediste, revisa: ${enlaceAlPanelDeCamaras()}`,
        log,
      ).catch((err: unknown) => {
        logger.warn("[camaras] el WhatsApp del desarme no salió", {
          tenantId,
          ...log,
          error: errorSinDatos(err),
        });
        return false;
      })
    : null;

  await Promise.all([panel, whatsapp]);
}
