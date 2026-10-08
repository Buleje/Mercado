import { NextRequest, NextResponse } from "next/server";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { esComprobantePrivado, esFotoDelNegocio, esRutaFirmaDelAdelanto, PREFIJO_PRIVADO } from "@/lib/adelantos/recibo-firmado";
import { bajarFirmaPrivada } from "@/lib/adelantos/firma-storage";

/**
 * GET /api/adelantos/[id]/comprobante — la foto del comprobante de un adelanto.
 *
 * La puerta del recibo firmado PRIVADO (08-10, Ley 29733: DNI + firma + monto):
 * sesión del panel + permiso de LECTURA de adelantos (los mismos roles que ven
 * el adelanto) + el adelanto de ESTE negocio (tenant del JWT) + la ruta guardada
 * dentro de la carpeta de ese adelanto. Devuelve el BINARIO, no un enlace
 * firmado: no queda ninguna URL que se pueda reenviar. `?v=` lo ignora (es para
 * que el navegador no muestre la hoja anterior tras volver a firmar).
 *
 * Otro negocio, sin foto o una ruta rara → 404 (no se confirma que exista).
 * La foto vieja en el bucket público (voucher del alta) → 302 a esa URL, sólo
 * si es de la carpeta de este negocio.
 *
 * Cada vista del recibo privado queda en la actividad, una vez por persona y
 * adelanto por hora (la ficha pide la miniatura en cada apertura).
 */
const DEDUPE_VISTA_SEG = 60 * 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  const rl = await applyRateLimit(req, "DRIVE_READ", "adelantos-comprobante");
  if (rl) return rl;
  const { id } = await params;
  const noEsta = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let url: string | null;
  try {
    url = (await AdelantosDB.comprobanteDe(auth.tenantId, id))?.comprobanteUrl ?? null;
  } catch (e) {
    logger.error("[adelantos/comprobante] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (!url) return noEsta();

  if (!esComprobantePrivado(url)) {
    return esFotoDelNegocio(url, { tenantId: auth.tenantId, origenStorage: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "" })
      ? NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } })
      : noEsta();
  }

  const ruta = url.slice(PREFIJO_PRIVADO.length);
  if (!esRutaFirmaDelAdelanto(ruta, auth.tenantId, id)) return noEsta();
  const binario = await bajarFirmaPrivada(ruta).catch((e: unknown) => {
    logger.error("[adelantos/comprobante] no se pudo bajar la hoja", { error: String(e) });
    return null;
  });
  if (!binario) return noEsta();

  const quien = auth.username || "unknown";
  const clave = `adelanto-recibo-vista:${auth.tenantId}:${quien}:${id}`;
  if (cacheStore.get<true>(clave) == null) {
    cacheStore.set(clave, true, DEDUPE_VISTA_SEG);
    logActivity("Ver", "adelanto", `Adelanto ${id}: vio el recibo firmado (nombre, DNI y firma)`, id, quien, undefined, auth.tenantId).catch((err) =>
      logger.error("[adelantos/comprobante] logActivity failed", { error: String(err) }),
    );
  }

  return new NextResponse(new Uint8Array(binario), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(binario.length),
      "Content-Disposition": "inline",
      /* `no-store`: ni el disco del navegador guarda la hoja (DNI + firma +
         monto) — en una PC compartida quedaba 5 min al alcance del siguiente.
         CORP: otro sitio no la puede incrustar con la cookie de quien la mira. */
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
