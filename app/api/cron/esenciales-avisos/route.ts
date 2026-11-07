import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { DocumentsDB } from "@/lib/db/documents.db";
import { NotificationCenterDB, type ResultadoSincronizar } from "@/lib/db/notification-center.db";
import { avisosDeEsenciales, TIPO_AVISO_ESENCIALES } from "@/lib/documentos/esenciales-avisos";
import { logger } from "@/lib/logger";

/**
 * Avisos de vencimiento de las carpetas Esenciales en la campana (Brandon
 * 23-10). Una vez al día, por negocio con carpetas marcadas: lo vencido o que
 * vence en ≤30 días (etapas vencido / 7 / 30) llega a la campana de la gestión.
 * Sólo AVISA: sin WhatsApp ni correo (eso lo hace `documentos-vencimiento`).
 * Sin duplicar: la etapa es parte del `entityId` (`sincronizarAvisos`).
 */
export const GET = withCronHealth("esenciales-avisos", async () => {
  const hoy = new Date();
  const tenants = await DocumentsDB.tenantsConEsenciales();
  const total: ResultadoSincronizar & { negocios: number; conAvisos: number; fallidos: number } = {
    negocios: tenants.length,
    conAvisos: 0,
    fallidos: 0,
    creados: 0,
    actualizados: 0,
    sinCambios: 0,
    yaLeidos: 0,
    resueltos: 0,
  };

  for (const tenantId of tenants) {
    try {
      const datos = await DocumentsDB.datosParaAvisosEsenciales(tenantId);
      const avisos = avisosDeEsenciales({ ...datos, hoy });
      if (avisos.length > 0) total.conAvisos += 1;
      // También sin avisos: lo renovado desde la última corrida queda leído.
      const r = await NotificationCenterDB.sincronizarAvisos(tenantId, [TIPO_AVISO_ESENCIALES], avisos);
      total.creados += r.creados;
      total.actualizados += r.actualizados;
      total.sinCambios += r.sinCambios;
      total.yaLeidos += r.yaLeidos;
      total.resueltos += r.resueltos;
    } catch (err) {
      total.fallidos += 1;
      logger.error("[cron/esenciales-avisos] negocio falló", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({ ok: true, ...total });
});
