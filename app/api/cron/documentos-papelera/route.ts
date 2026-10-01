import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { DocumentsDB } from "@/lib/db/documents.db";
import { deleteFromStorage } from "@/lib/documents/storage";
import { logActivity } from "@/lib/activity-logger";
import { corteRetencion, DIAS_RETENCION_PAPELERA } from "@/lib/documents/papelera-retencion";
import { IDS_POR_LOTE } from "@/lib/documents/bulk-limits";
import { logger } from "@/lib/logger";

/**
 * Vaciado automático de la papelera del drive.
 *
 * Lo borrado se quedaba en la papelera para siempre: seguía ocupando el bucket y
 * contando para la cuota del tenant, y nadie entra a "eliminar definitivamente"
 * archivo por archivo. Con la retención de `DIAS_RETENCION_PAPELERA` días, el
 * usuario tiene un plazo claro para arrepentirse (la papelera se lo dice en cada
 * fila) y después el espacio se libera solo.
 *
 * Corre una vez al día. Por tenant y en tandas: primero los objetos del storage
 * —documento y versiones históricas— y después las filas, porque una vez borrada
 * la fila ya no hay de dónde sacar la ruta del archivo.
 */

/** Techo de tandas por tenant en una corrida: si sobra, mañana sigue. */
const TANDAS_MAX = 20;

export const GET = withCronAuth("documentos-papelera", async () => {
  const corte = corteRetencion();
  const tenants = await DocumentsDB.tenantsConPapeleraVencida(corte);

  let revisados = 0;
  let purgados = 0;
  let archivosStorage = 0;
  let conRestos = 0;

  for (const tenantId of tenants) {
    revisados += 1;
    try {
      let delTenant = 0;
      let tanda = 0;
      for (; tanda < TANDAS_MAX; tanda++) {
        const ids = await DocumentsDB.idsPapeleraVencida(tenantId, corte, IDS_POR_LOTE);
        if (ids.length === 0) break;

        const { ids: existentes, paths } = await DocumentsDB.storagePathsOfDeleted(tenantId, ids);
        if (existentes.length === 0) break;
        await deleteFromStorage(paths).catch((e) =>
          logger.warn("[cron/documentos-papelera] storage cleanup falló", {
            tenantId,
            n: paths.length,
            e: String(e).slice(0, 200),
          }),
        );
        const n = await DocumentsDB.bulkHardDelete(tenantId, existentes);
        delTenant += n;
        archivosStorage += paths.length;
        // Si la tanda no borró nada, seguir sería un bucle: cortamos y queda
        // para mañana con el error ya logueado.
        if (n === 0) break;
      }
      if (tanda === TANDAS_MAX) conRestos += 1;
      purgados += delTenant;

      if (delTenant > 0) {
        // La auditoría por documento se va con el documento (FK en cascada): el
        // rastro del vaciado automático queda en el ActivityLog del tenant.
        await logActivity(
          "purge",
          "Documento",
          `Papelera vaciada automáticamente: ${delTenant} documento(s) con más de ${DIAS_RETENCION_PAPELERA} días`,
          undefined,
          "cron",
          undefined,
          tenantId,
        ).catch((err) =>
          logger.warn("[cron/documentos-papelera] activity log falló", { tenantId, err: String(err) }),
        );
      }
    } catch (err) {
      // Un tenant que falla no puede dejar sin limpiar a los demás.
      logger.error("[cron/documentos-papelera] tenant failed", {
        tenantId,
        err: String(err).slice(0, 300),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    diasRetencion: DIAS_RETENCION_PAPELERA,
    revisados,
    purgados,
    archivosStorage,
    conRestos,
  });
});
