import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { borrarFirmaPrivada } from "@/lib/adelantos/firma-storage";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";

/**
 * DELETE /api/adelantos/[id]/firmas/[firmaId] — suprimir una HUELLA del
 * registro (ADR-491; Ley 29733, derecho de supresión: la huella es un dato
 * biométrico). Sólo admin o dueño. Sólo tipo HUELLA: la firma es el respaldo
 * de la plata y no se borra (409 `solo_huella`).
 *
 * Borra la fila (con el permiso LOCAL de su transacción; el trigger del
 * registro rechaza cualquier otro DELETE) y después el archivo del bucket
 * privado. La actividad dice qué se suprimió, sin DNI ni ruta.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; firmaId: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-suprimir-huella"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "delete");
  if (sinPermiso) return sinPermiso;
  const prohibido = soloAdminODueno(auth.role, "suprimir la huella de una persona");
  if (prohibido) return prohibido;
  const { id, firmaId } = await params;

  let r: Awaited<ReturnType<typeof AdelantoFirmasDB.suprimirHuella>>;
  try {
    r = await AdelantoFirmasDB.suprimirHuella(auth.tenantId, id, firmaId);
  } catch (e) {
    logger.error("[adelantos/suprimir-huella] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (r === "no-existe") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (r === "no-es-huella") {
    return NextResponse.json({ error: "Sólo se suprime la huella: la firma es el respaldo del adelanto.", code: "solo_huella" }, { status: 409 });
  }
  /* La fila ya no está: el archivo se borra después (si falla, queda en el log
     y la respuesta lo dice, para reintentarlo a mano). */
  const archivoBorrado = await borrarFirmaPrivada(r.ruta);
  logActivity(
    "Suprimir",
    "adelanto",
    `Adelanto ${id}: huella suprimida del registro de firmas (Ley 29733, derecho de supresión)${archivoBorrado ? "" : " — el archivo no se pudo borrar del almacenamiento"}`,
    id,
    auth.username,
    undefined,
    auth.tenantId,
  ).catch((err) => logger.error("[adelantos/suprimir-huella] logActivity failed", { error: String(err) }));
  return NextResponse.json({ ok: true, archivoBorrado });
}
