import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { DocumentsDB } from "@/lib/db/documents.db";
import { NotificationCenterDB, type ResultadoSincronizar } from "@/lib/db/notification-center.db";
import { avisoCodigoFisico, TIPO_AVISO_CODIGO_FISICO } from "@/lib/documentos/codigo-fisico-avisos";
import { logger } from "@/lib/logger";

/**
 * ADR-516 — «N papeles sin el código puesto en el físico» en la campana de la
 * gestión. Una vez al día, por negocio con pendientes; sólo si alguno lleva
 * `DIAS_AVISO_CODIGO_FISICO` días o más. Sin WhatsApp ni correo. La fecha va
 * en el `entityId`: máximo uno por día y el de ayer queda resuelto solo.
 * Recorre todo negocio que ya numera sus papeles: el que se puso al día no
 * recibe nada y su aviso sin leer queda resuelto (se sincroniza con la lista vacía).
 */
export const GET = withCronHealth("documentos-codigo-avisos", async () => {
  const hoy = new Date();
  const tenants = await DocumentsDB.tenantsConCodigos();
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
      const conteo = await DocumentsDB.conteoCodigoPendiente(tenantId);
      const avisos = avisoCodigoFisico({ ...conteo, hoy });
      if (avisos.length > 0) total.conAvisos += 1;
      const r = await NotificationCenterDB.sincronizarAvisos(tenantId, [TIPO_AVISO_CODIGO_FISICO], avisos);
      total.creados += r.creados;
      total.actualizados += r.actualizados;
      total.sinCambios += r.sinCambios;
      total.yaLeidos += r.yaLeidos;
      total.resueltos += r.resueltos;
    } catch (err) {
      total.fallidos += 1;
      logger.error("[cron/documentos-codigo-avisos] negocio falló", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({ ok: true, ...total });
});
