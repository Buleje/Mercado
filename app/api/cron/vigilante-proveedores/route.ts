import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { TenantsDB } from "@/lib/db/tenants.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { TelegramDB } from "@/lib/db/telegram.db";
import { ForestVigilanteDB } from "@/lib/db/forest-vigilante.db";
import { botConfigurado, mandarMensaje } from "@/lib/telegram/bot";
import { enviarWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { resumenEnvioWhatsApp } from "@/lib/whatsapp/aviso-plantilla";
import { revisarProveedoresDelNegocio } from "@/lib/forestal/revision-proveedores.server";
import {
  compararConAnterior,
  huellasDeFilas,
  mensajeVigilante,
  type MensajeVigilante,
} from "@/lib/forestal/vigilante-proveedores";
import { GET as puntuarProveedores } from "@/app/api/cron/supplier-scoring/route";

/**
 * GET /api/cron/vigilante-proveedores — el vigilante mensual (04-11-2026).
 *
 * Cada mes repite «Revisar a todos» en cada negocio con proveedores y le avisa
 * al dueño (campana del panel + Telegram + WhatsApp) SOLO si alguno ENTRÓ a la
 * lista de SERFOR u OSINFOR desde la vez anterior. Si nadie entró, no dice nada.
 * La primera vez solo guarda la foto (ver `compararConAnterior`).
 *
 * `?seco=1` arma los mensajes y los devuelve SIN mandar ni guardar (para probar).
 * `?tenant=<id>` revisa un solo negocio.
 *
 * vercel.json `0 14 1 * *` (09:00 de Lima del día 1) + disparador local de la PC.
 * `?con=puntaje` (solo lo pone vercel.json) corre también el puntaje mensual de proveedores
 * (`supplier-scoring`) en paralelo: Vercel admite 100 avisos programados y había 101 (04-11-2026).
 * El disparador de la PC no lo pasa, así el ranking por WhatsApp no sale dos veces.
 * Autorización: `Bearer <CRON_SECRET>`.
 */

/** Por negocio: más holgado que el botón (20 s) porque nadie está esperando la pantalla. */
const PRESUPUESTO_OSINFOR_MS = 60_000;
const MAX_PERMISOS = 200;
/** La función corta a los 300 s: pasado esto no se empieza otro negocio (queda para la próxima vuelta). */
const PRESUPUESTO_TOTAL_MS = 230_000;
const ACCION_URL = "/admin?tab=ctp-libro-operaciones&vista=cumplimiento";

interface Avisos {
  campana: boolean;
  telegram: number;
  whatsapp: string;
}

async function avisar(tenantId: string, m: MensajeVigilante, entityId: string): Promise<Avisos> {
  const { created } = await NotificationCenterDB.createOrReuse({
    tenantId,
    type: "forestal-vigilante-proveedores",
    severity: "HIGH",
    title: m.titulo,
    body: m.cuerpo,
    actionUrl: ACCION_URL,
    actionLabel: "Revisar a todos",
    entityId,
    dedupWindowHours: 20,
  });

  let telegram = 0;
  if (botConfigurado()) {
    for (const chat of await TelegramDB.listar(tenantId)) {
      const id = await mandarMensaje(chat.chatId, m.telegram);
      if (id) telegram += 1;
    }
  }

  const contacto = await TenantsDB.contactoDelDueno(tenantId);
  const phone = contacto?.ownerPhone?.replace(/\D/g, "") ?? "";
  let whatsapp = "sin WhatsApp: el negocio no tiene teléfono cargado";
  if (phone.length >= 9) {
    /* Con el número del negocio si tiene uno activo; si no, con la cuenta del servidor. Nunca tira. */
    const wa = await enviarWhatsAppDelNegocio(tenantId, phone, m.whatsapp, { contexto: "vigilante-proveedores" });
    whatsapp = resumenEnvioWhatsApp(wa);
    if (!wa.ok) logger.error("[cron/vigilante-proveedores] whatsapp NO enviado", { tenantId, constancia: whatsapp });
  }
  return { campana: created, telegram, whatsapp };
}

export const GET = withCronAuth("vigilante-proveedores", async (req) => {
  const sp = req.nextUrl.searchParams;
  const seco = sp.get("seco") === "1";
  const solo = sp.get("tenant")?.trim() || null;
  const inicio = Date.now();
  const ahora = new Date().toISOString();
  const puntaje =
    sp.get("con") === "puntaje" && !seco && !solo
      ? puntuarProveedores(req)
          .then((r) => r.status)
          .catch((err) => {
            logger.error("[cron/vigilante-proveedores] puntaje de proveedores falló", { error: String(err) });
            return 500;
          })
      : null;

  const tenants = solo ? [solo] : await ForestVigilanteDB.tenantsConProveedores();
  const negocios: Array<Record<string, unknown>> = [];
  const sinTiempo: string[] = [];
  let avisados = 0;

  /* En fila, no en paralelo: cada negocio pregunta a OSINFOR de a 4 y SERFOR es una lista en memoria. */
  for (const tenantId of tenants) {
    if (Date.now() - inicio > PRESUPUESTO_TOTAL_MS) {
      sinTiempo.push(tenantId);
      continue;
    }
    try {
      const r = await revisarProveedoresDelNegocio(tenantId, {
        presupuestoOsinforMs: PRESUPUESTO_OSINFOR_MS,
        maxPermisos: MAX_PERMISOS,
      });
      if (!r) {
        // Sin la lista de SERFOR no se compara nada ni se toca la foto: el mes que viene sigue igual.
        negocios.push({ tenantId, resultado: "serfor_no_respondio" });
        continue;
      }
      const anterior = await ForestVigilanteDB.estado(tenantId);
      const actual = huellasDeFilas(r.filas);
      const cmp = compararConAnterior(anterior, actual, { ahora, corteSerfor: r.corteSerfor });

      let mensaje: MensajeVigilante | null = null;
      let avisos: Avisos | null = null;
      if (cmp.nuevas.length > 0) {
        const contacto = await TenantsDB.contactoDelDueno(tenantId);
        mensaje = mensajeVigilante(cmp.nuevas, {
          negocio: contacto?.name ?? null,
          desde: anterior?.revisadoEn ?? null,
          corteSerfor: r.corteSerfor,
        });
        if (!seco) {
          // La clave del aviso lleva QUÉ entró: otro proveedor el mismo día es otro aviso.
          const entityId = `vigilante:${cmp.nuevas.map((h) => h.clave).sort().join("|")}`.slice(0, 190);
          avisos = await avisar(tenantId, mensaje, entityId);
          avisados += 1;
        }
      }
      /* La foto se guarda después de avisar: la campana queda en el panel aunque WhatsApp falle. */
      if (!seco) await ForestVigilanteDB.guardar(tenantId, cmp.estado);

      negocios.push({
        tenantId,
        resultado: cmp.primeraVez ? "primera_vez" : cmp.nuevas.length > 0 ? "entraron" : "sin_novedad",
        revisados: r.resumen.revisados,
        permisos: r.permisos,
        huellas: actual.huellas.length,
        nuevas: cmp.nuevas.length,
        osinforSinDato: actual.osinforSinDato.length,
        ms: r.ms,
        ...(seco && mensaje ? { mensaje } : {}),
        ...(avisos ? { avisos } : {}),
      });
    } catch (err) {
      logger.error("[cron/vigilante-proveedores] negocio falló", { tenantId, error: String(err) });
      negocios.push({ tenantId, resultado: "error" });
    }
  }

  const fallidos = negocios.filter((n) => n.resultado === "error" || n.resultado === "serfor_no_respondio").length;
  const puntajeHttp = puntaje ? await puntaje : null;
  logger.info("[cron/vigilante-proveedores] vuelta del mes", {
    seco,
    negocios: tenants.length,
    avisados,
    fallidos,
    sinTiempo: sinTiempo.length,
    puntaje: puntajeHttp,
    ms: Date.now() - inicio,
  });
  return NextResponse.json({
    ok: fallidos === 0 && (puntajeHttp === null || puntajeHttp < 400),
    seco,
    avisados,
    sinTiempo,
    negocios,
    ...(puntajeHttp !== null ? { puntaje: puntajeHttp } : {}),
  });
});
