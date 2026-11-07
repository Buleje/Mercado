import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { AdminPreferencesDB } from "@/lib/db/admin-preferences.db";
import { DocumentosEsencialesDB } from "@/lib/db/documentos-esenciales.db";
import { ROLES_RESUMEN_ESENCIALES, resumenDeEsenciales } from "@/lib/documentos/esenciales-resumen";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/documents/esenciales/resumen — la tarjeta «Esenciales» del
 * Inicio (Brandon 24-10): por carpeta esencial, sus papeles, cuántos
 * vencieron y cuántos vencen en ≤30 días, y los totales.
 *
 * Sólo la gestión (admin/owner/manager), igual que el aviso `DOC_ESENCIAL_VENCE`
 * de la campana: al cajero no le sirve. Cuenta únicamente lo que el rol ve
 * (cadena de carpetas + candado de dueño + roles del papel), como el Archivo.
 *
 * Sin caché del servidor, como el resto del drive (no hay tag que invalidar y
 * lo escriben ~15 rutas): la tarjeta lo guarda 60 s con `cachedJson`, que se
 * borra solo ante cualquier escritura del panel a `/api/admin/documents/*`.
 */

/** «Mi orden» del negocio (`/api/admin/preferences/esenciales-orden`). */
const Orden = z.array(z.string().min(1).max(64)).max(200);

export async function GET(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "GENEROUS", "documents:esenciales-resumen");
    if (rl) return rl;
    const auth = await requireAdmin(req, ROLES_RESUMEN_ESENCIALES);
    if (auth instanceof NextResponse) return auth;

    const [datos, prefs] = await Promise.all([
      DocumentosEsencialesDB.datosDelResumen(auth.tenantId),
      AdminPreferencesDB.read(auth.tenantId),
    ]);
    const orden = Orden.safeParse(prefs.esencialesOrden);
    const resumen = resumenDeEsenciales({ ...datos, rol: auth.role, orden: orden.success ? orden.data : null });
    return NextResponse.json(resumen);
  } catch (e) {
    logger.error("[documents.esenciales-resumen] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
