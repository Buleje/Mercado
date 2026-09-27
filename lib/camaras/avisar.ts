import "server-only";

/**
 * Avisar por WhatsApp cuando la cámara vio a alguien (2026-09-12).
 *
 * Corre DESPUÉS de que la IA leyó la foto y siempre en segundo plano: la cámara
 * ya recibió su 200 y el aviso no puede hacer fallar la ingesta. Si el envío
 * falla, se loguea; la foto y su lectura quedan igual en el historial.
 *
 * Las reglas de «cuándo» viven en `debeAvisar` (puro, testeado): acá sólo se
 * arma el texto, se manda y se anota que se mandó.
 */

import { logger } from "@/lib/logger";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { resumenEnvioWhatsApp } from "@/lib/whatsapp/aviso-plantilla";
import { CamarasDB } from "@/lib/db/camaras.db";
import { debeAvisar, textoDelAviso, type Camara, type Captura } from "./camaras";

export async function avisarSiCorresponde(
  tenantId: string,
  camara: Camara,
  captura: Pick<Captura, "id" | "lectura">,
): Promise<void> {
  const ahora = new Date();
  /* La cámara puede haber cambiado desde que llegó la foto (alguien la
     configuró mientras la IA leía): se relee antes de decidir. */
  const actual = (await CamarasDB.list(tenantId)).find((c) => c.id === camara.id) ?? camara;
  if (!debeAvisar(actual, captura.lectura, ahora) || !captura.lectura || !actual.avisos?.whatsapp) return;

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  const texto = textoDelAviso(actual, captura.lectura, ahora, `${base}/admin?tab=camaras`);
  /* Con el número del negocio (el del bot) si tiene uno activo; si no, con la
     cuenta del servidor. Dos reintentos sólo ante fallas pasajeras (red, 5xx),
     como hacía `sendWhatsAppTextWithRetry`. Nunca tira. */
  const wa = await enviarWhatsAppDelNegocio(tenantId, actual.avisos.whatsapp, texto, {
    contexto: "camaras",
    reintentos: 2,
  });
  const constancia = resumenEnvioWhatsApp(wa);
  if (!wa.ok) {
    logger.warn("[camaras.avisar] no se pudo mandar el WhatsApp", {
      tenantId,
      camaraId: actual.id,
      capturaId: captura.id,
      constancia,
    });
    return;
  }
  await CamarasDB.marcarAvisada(tenantId, actual.id, ahora);
  logger.info("[camaras.avisar] aviso mandado", { tenantId, camaraId: actual.id, capturaId: captura.id, constancia });
}
