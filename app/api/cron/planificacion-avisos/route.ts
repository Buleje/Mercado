import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { PlanEmpresaDB } from "@/lib/db/plan-empresa.db";
import { NotificationCenterDB, type ResultadoSincronizar } from "@/lib/db/notification-center.db";
import { avisosParaCampana, SECCIONES_CON_AVISO, TIPOS_AVISO_PLAN } from "@/lib/planificacion/avisos";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";

/**
 * ADR-497 — Avisos del plan de la empresa en la campana (Brandon 16-10:
 * «licencias por vencer, objetivos atrasados y políticas por revisar llegan a
 * la campana, no sólo al Resumen»).
 *
 * Corre una vez al día. Sólo AVISA: no toca el plan. Recorre los negocios que
 * tienen guardada alguna de esas secciones y les pone en la campana lo mismo
 * que dice el Resumen (`avisosParaCampana` usa la misma regla), con el enlace a
 * donde se arregla. Licencias a 30 días, a 7 y vencidas; objetivos atrasados;
 * políticas cuya fecha de revisión llegó. Socios e inversión, nunca.
 *
 * Sin duplicar: `sincronizarAvisos` usa la etapa como clave, así que correrlo
 * dos veces el mismo día no crea nada y lo ya leído no vuelve hasta la etapa
 * siguiente. Lo arreglado (licencia renovada, objetivo cerrado) queda leído.
 * Lo ven sólo admin/owner/manager (filtro por `type` en la campana).
 */
export const GET = withCronHealth("planificacion-avisos", async () => {
  const hoy = limaDateKey();
  const planes = await PlanEmpresaDB.seccionesDeTodos(SECCIONES_CON_AVISO);

  const total: ResultadoSincronizar & { negocios: number; conAvisos: number; fallidos: number } = {
    negocios: planes.size,
    conAvisos: 0,
    fallidos: 0,
    creados: 0,
    actualizados: 0,
    sinCambios: 0,
    yaLeidos: 0,
    resueltos: 0,
  };

  for (const [tenantId, plan] of planes) {
    try {
      const avisos = avisosParaCampana(plan, hoy);
      if (avisos.length > 0) total.conAvisos += 1;
      // También sin avisos: así lo que se arregló desde la última corrida queda leído.
      const r = await NotificationCenterDB.sincronizarAvisos(tenantId, TIPOS_AVISO_PLAN, avisos);
      total.creados += r.creados;
      total.actualizados += r.actualizados;
      total.sinCambios += r.sinCambios;
      total.yaLeidos += r.yaLeidos;
      total.resueltos += r.resueltos;
    } catch (err) {
      total.fallidos += 1;
      logger.error("[cron/planificacion-avisos] negocio falló", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({ ok: true, hoy, ...total });
});
