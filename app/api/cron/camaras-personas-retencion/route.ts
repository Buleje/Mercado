import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { DocumentsDB } from "@/lib/db/documents.db";
import { CamarasDB } from "@/lib/db/camaras.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { CamarasMarcadoresDB } from "@/lib/db/camaras-marcadores.db";
import { logActivity } from "@/lib/activity-logger";
import { corteRetencionPersonas } from "@/lib/camaras/personas-retencion";
import { IDS_POR_LOTE } from "@/lib/documents/bulk-limits";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";

/**
 * Retención de las fotos del detector de personas (2026-10-08).
 *
 * Con gente todo el día son ~1.200 fotos por día. Una vez al día, por negocio
 * con cámaras, las fotos con tag `personas` de más de N días (N de Ajustes de
 * Cámaras, default 30; días de Lima) van a la PAPELERA del Drive — nunca se
 * purgan acá: el vaciado de la papelera (`documentos-papelera`) las borra de
 * verdad cuando le toque, y mientras tanto se pueden restaurar.
 *
 * Idempotente: lo que ya está en la papelera no se vuelve a tocar. Tope por
 * corrida y negocio (`TANDAS_MAX` × `IDS_POR_LOTE`): si sobra, mañana sigue.
 * Las carpetas de día que quedan vacías NO se borran: borrar la carpeta
 * movería a la raíz los documentos que están en la papelera (y un restaurar
 * los dejaría fuera de su lugar).
 */

const CLAVE_INDICE = "camaras-token-index";
const TANDAS_MAX = 10;

export const GET = withCronAuth("camaras-personas-retencion", async () => {
  const ahora = new Date();
  const indice = (await PlatformSettingsDB.getFresco<Record<string, { tenantId?: string }>>(CLAVE_INDICE)) ?? {};
  const tenants = [...new Set(Object.values(indice).map((d) => d?.tenantId).filter((t): t is string => !!t))];

  let revisados = 0;
  let enPapelera = 0;
  let conRestos = 0;
  let fallidos = 0;
  let diasMarcadores = 0;
  const hoy = limaDateKey(ahora);

  for (const tenantId of tenants) {
    revisados += 1;
    /* «Trozas a la vista» (ADR-480): las claves de días viejos se borran. Aparte:
       si falla, las fotos se limpian igual. */
    try {
      diasMarcadores += await CamarasMarcadoresDB.purgarDias(tenantId, hoy);
    } catch (err) {
      logger.warn("[cron/camaras-personas-retencion] días de marcadores sin borrar", { tenantId, err: String(err).slice(0, 300) });
    }
    try {
      const dias = await CamarasDB.retencionPersonas(tenantId);
      const corte = corteRetencionPersonas(ahora, dias);
      let delTenant = 0;
      let tanda = 0;
      for (; tanda < TANDAS_MAX; tanda++) {
        const ids = await DocumentsDB.idsFotosPersonasAnteriores(tenantId, corte, IDS_POR_LOTE);
        if (ids.length === 0) break;
        const n = await DocumentsDB.bulkSoftDelete(tenantId, ids);
        if (n === 0) break; // si no movió nada, seguir sería un bucle
        delTenant += n;
        DocumentsDB.logMany(tenantId, ids, {
          actorId: "cron",
          action: "delete",
          metadata: { origen: "camaras-personas-retencion", dias, corte: corte.toISOString() },
        }).catch((err) => logger.warn("[cron/camaras-personas-retencion] audit falló", { tenantId, err: String(err) }));
      }
      if (tanda === TANDAS_MAX) conRestos += 1;
      enPapelera += delTenant;

      logger.info("[cron/camaras-personas-retencion] tenant", { tenantId, dias, corte: corte.toISOString(), enPapelera: delTenant });
      if (delTenant > 0) {
        await logActivity(
          "delete",
          "Documento",
          `Fotos de personas con más de ${dias} días a la papelera: ${delTenant}`,
          undefined,
          "cron",
          undefined,
          tenantId,
        ).catch((err) => logger.warn("[cron/camaras-personas-retencion] activity log falló", { tenantId, err: String(err) }));
      }
    } catch (err) {
      // Un negocio que falla no puede dejar sin limpiar a los demás.
      fallidos += 1;
      logger.error("[cron/camaras-personas-retencion] tenant failed", { tenantId, err: String(err).slice(0, 300) });
    }
  }

  return NextResponse.json({ ok: true, revisados, enPapelera, conRestos, fallidos, diasMarcadores });
});
