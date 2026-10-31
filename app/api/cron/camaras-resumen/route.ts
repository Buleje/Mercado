import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { CamarasDB } from "@/lib/db/camaras.db";
import { MembreteDB } from "@/lib/db/membrete.db";
import { fechaDeLima, textoResumen } from "@/lib/camaras/resumen";
import { armarResumen } from "@/lib/camaras/resumen.server";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { resumenEnvioWhatsApp, telefonoParaWa } from "@/lib/whatsapp/aviso-plantilla";
import { logger } from "@/lib/logger";

/**
 * Resumen del día del patio por WhatsApp (corre a las 7 pm de Lima).
 *
 * Para cada negocio con cámaras arma el resumen de HOY y lo manda a los
 * WhatsApp configurados en sus cámaras (sin repetir número), por el mismo canal
 * que los avisos de cámara: número del negocio con caída a la cuenta del
 * servidor. Un día sin fotos también se manda — con el texto honesto de «la
 * cámara no mandó nada»: callar sería lo contrario de avisar.
 *
 * Idempotente: `interno:camaras-resumen-enviado:<tenantId>` guarda la fecha del último
 * envío aceptado; un segundo disparo el mismo día no manda nada.
 *
 * Respuesta: `enviados` = mensajes que Meta/servidor aceptó.
 */
const CLAVE_INDICE = "camaras-token-index";
/** `interno:` — es estado de trabajo: no invalida la configuración de toda la plataforma. */
const CLAVE_ENVIADO = (tenantId: string) => `interno:camaras-resumen-enviado:${tenantId}`;
/** Una reserva «enviando» más vieja que esto se da por muerta (el proceso cayó). */
const RESERVA_VIVA_MS = 10 * 60_000;

interface MarcaEnvio {
  fecha?: string | null;
  estado?: "enviando" | "enviado";
  en?: string;
}

export const GET = withCronAuth("camaras-resumen", async () => {
  const hoy = fechaDeLima(new Date());
  const indice = (await PlatformSettingsDB.getFresco<Record<string, { tenantId?: string }>>(CLAVE_INDICE)) ?? {};
  const tenants = [...new Set(Object.values(indice).map((d) => d?.tenantId).filter((t): t is string => !!t))];

  let enviados = 0;
  let sinNumero = 0;
  let sinFotos = 0;
  let fallidos = 0;
  let yaEnviados = 0;

  for (const tenantId of tenants) {
    let reservado = false;
    let previa: MarcaEnvio | null = null;
    let algunoSalio = false;
    try {
      const camaras = (await CamarasDB.list(tenantId)).filter((c) => c.activa);
      const numeros = new Map<string, string>();
      for (const c of camaras) {
        const a = c.avisos;
        if (!a?.whatsapp || a.cuando === "nunca") continue;
        const wa = telefonoParaWa(a.whatsapp);
        if (wa && !numeros.has(wa)) numeros.set(wa, a.whatsapp);
      }
      if (numeros.size === 0) {
        sinNumero += 1;
        continue;
      }

      /* Reservar el día CON candado antes de mandar: dos llamadas a la vez
         (reintento del túnel, doble disparo) no mandan doble. */
      const ahora = Date.now();
      const r = await PlatformSettingsDB.actualizar<MarcaEnvio, { ya: boolean; previa: MarcaEnvio | null }>(
        CLAVE_ENVIADO(tenantId),
        (actual) => {
          const viva =
            actual?.fecha === hoy &&
            (actual.estado !== "enviando" || ahora - Date.parse(actual.en ?? "") < RESERVA_VIVA_MS);
          if (viva) return { resultado: { ya: true, previa: actual } };
          return {
            valor: { fecha: hoy, estado: "enviando", en: new Date(ahora).toISOString() } satisfies MarcaEnvio,
            resultado: { ya: false, previa: actual },
          };
        },
        "cron",
      );
      if (r.ya) {
        yaEnviados += 1;
        continue;
      }
      reservado = true;
      previa = r.previa;

      /* El libro y la asistencia se leen AHORA, al armar el resumen. */
      const [{ resumen }, membrete] = await Promise.all([armarResumen(tenantId, hoy), MembreteDB.del(tenantId)]);
      if (resumen.fotos === 0) sinFotos += 1;
      const texto = textoResumen(resumen, membrete.nombre ?? "");

      for (const telefono of numeros.values()) {
        const wa = await enviarWhatsAppDelNegocio(tenantId, telefono, texto, {
          contexto: "camaras-resumen",
          reintentos: 2,
        });
        if (wa.ok) {
          algunoSalio = true;
          enviados += 1;
        } else {
          fallidos += 1;
          logger.warn("[cron/camaras-resumen] no se pudo mandar el WhatsApp", {
            tenantId,
            constancia: resumenEnvioWhatsApp(wa),
          });
        }
      }
    } catch (err) {
      fallidos += 1;
      logger.error("[cron/camaras-resumen] falló un negocio", { tenantId, error: String(err) });
    } finally {
      if (reservado) {
        /* Salió al menos uno: el día queda sellado. Si todos fallaron, se
           libera para que el próximo disparo del día reintente. */
        const final: MarcaEnvio = algunoSalio
          ? { fecha: hoy, estado: "enviado", en: new Date().toISOString() }
          : { fecha: previa?.fecha ?? null, estado: previa?.estado ?? "enviado", en: previa?.en };
        await PlatformSettingsDB.set(CLAVE_ENVIADO(tenantId), final, "cron").catch((err) =>
          logger.error("[cron/camaras-resumen] no se pudo cerrar la marca del día", { tenantId, error: String(err) }),
        );
      }
    }
  }

  const resultado = { tenants: tenants.length, enviados, sinNumero, sinFotos, fallidos, yaEnviados, fecha: hoy };
  /* Todo falló = 502: quien dispara el cron (el túnel) marca el día como hecho
     con un 200 y no reintenta. */
  return NextResponse.json(resultado, { status: fallidos > 0 && enviados === 0 ? 502 : 200 });
});
