import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { esRutaRegistroDelAdelanto, sha256Hex } from "@/lib/adelantos/registro-firmas";
import { esRutaFirmaDelAdelanto } from "@/lib/adelantos/recibo-firmado";
import { bajarFirmaPrivada } from "@/lib/adelantos/firma-storage";
import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";

/**
 * GET /api/adelantos/[id]/firmas/[firmaId]/imagen — la imagen de UNA firma o
 * huella del registro (ADR-491). La misma puerta que `…/comprobante`: sesión +
 * lectura de adelantos + la fila de ESTE adelanto de ESTE negocio + la ruta
 * dentro de su carpeta (la del registro, o la hoja vieja si vino del backfill).
 * Devuelve el BINARIO `no-store` (ninguna URL reenviable).
 *
 * `X-Integridad`: recalcula el sha256 de lo que bajó y lo compara con el de la
 * fila. `alterada` = el archivo del bucket no es el que se firmó (queda en el
 * log como error); la imagen se sirve igual, para poder verla.
 */
const DEDUPE_VISTA_SEG = 60 * 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; firmaId: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const rl = await applyRateLimit(req, "DRIVE_READ", "adelantos-firma-imagen");
  if (rl) return rl;
  const { id, firmaId } = await params;
  const noEsta = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let fila: { ruta: string; sha256: string } | null;
  try {
    fila = await AdelantoFirmasDB.rutaDe(auth.tenantId, id, firmaId);
  } catch (e) {
    logger.error("[adelantos/firma-imagen] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (!fila) return noEsta();
  if (!esRutaRegistroDelAdelanto(fila.ruta, auth.tenantId, id) && !esRutaFirmaDelAdelanto(fila.ruta, auth.tenantId, id)) return noEsta();
  const binario = await bajarFirmaPrivada(fila.ruta).catch((e: unknown) => {
    logger.error("[adelantos/firma-imagen] no se pudo bajar", { error: String(e) });
    return null;
  });
  if (!binario) return noEsta();

  const integra = sha256Hex(binario) === fila.sha256;
  if (!integra) logger.error("[adelantos/firma-imagen] el archivo NO coincide con el sha256 del registro", { tenantId: auth.tenantId, adelantoId: id, firmaId });

  const quien = auth.username || "unknown";
  const clave = `adelanto-firma-vista:${auth.tenantId}:${quien}:${firmaId}`;
  if (cacheStore.get<true>(clave) == null) {
    cacheStore.set(clave, true, DEDUPE_VISTA_SEG);
    logActivity("Ver", "adelanto", `Adelanto ${id}: vio una firma o huella del registro`, id, quien, undefined, auth.tenantId).catch((err) =>
      logger.error("[adelantos/firma-imagen] logActivity failed", { error: String(err) }),
    );
  }

  return new NextResponse(new Uint8Array(binario), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(binario.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Integridad": integra ? "ok" : "alterada",
    },
  });
}
