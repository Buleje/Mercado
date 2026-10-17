import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { parseWaybackConfig, releasesPorAnio, WAYBACK_CONFIG_URL } from "@/lib/forestal/loth-wayback";

/**
 * /api/admin/forestal/loth/wayback — catálogo de imágenes satelitales históricas
 * (Esri World Imagery Wayback) para el comparador EUDR del mapa.
 *
 * POR QUÉ ES UN PROXY Y NO UN FETCH DEL CLIENTE:
 * el catálogo vive en S3 (`config.maptiles.arcgis.com`) y nuestra CSP no lo
 * tiene en `connect-src`. Agregarlo abriría ese dominio para TODO el sitio por
 * una herramienta de un tab; se pide desde el server y listo. De paso se cachea:
 * el catálogo cambia unas pocas veces al año.
 *
 * Las TESELAS sí van directo del navegador a Esri (`img-src https:` ya las
 * permite), así que esto es una sola llamada por sesión, no por tesela.
 */

export const GET = withApiHandler("forestal-loth-wayback-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro");
  if (!enabled) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

  try {
    const res = await fetch(WAYBACK_CONFIG_URL, { next: { revalidate: 86_400 } });
    if (!res.ok) {
      // El servicio de Esri no responde: la herramienta se deshabilita sola.
      logger.warn("[loth.wayback] catálogo no disponible", { status: res.status, tenantId: auth.tenantId });
      return NextResponse.json({ releases: [] });
    }
    const releases = releasesPorAnio(parseWaybackConfig(await res.json()));
    return NextResponse.json({ releases });
  } catch (err) {
    logger.warn("[loth.wayback] fetch falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ releases: [] });
  }
});
