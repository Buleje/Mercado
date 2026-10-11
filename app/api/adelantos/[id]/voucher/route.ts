import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { esErrorImagen, leerMultipartFirma, normalizarImagen } from "@/lib/adelantos/imagen-firma.server";
import { PREFIJO_PRIVADO, rutaVoucherPrivada } from "@/lib/adelantos/recibo-firmado";
import { borrarFirmaPrivada, subirFirmaPrivada } from "@/lib/adelantos/firma-storage";
import { AdelantosDB } from "@/lib/db/adelantos.db";

/**
 * POST /api/adelantos/[id]/voucher — multipart `file`: el voucher del alta, en
 * el bucket PRIVADO (V, ADR-491). Antes iba a `/api/upload` (bucket público
 * `media`): la foto del Yape o de la transferencia quedaba a la vista de quien
 * tuviera la URL. Sólo si el adelanto todavía no tiene foto (compara-y-cambia
 * `comprobanteUrl IS NULL`); reemplazar una es el PATCH de siempre. Se ve por
 * `GET …/comprobante`.
 */
const MAX_BYTES_VOUCHER = 4 * 1024 * 1024;
const MAX_PIXELES_VOUCHER = 24_000_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-voucher"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;

  const leido = await leerMultipartFirma(req, { archivos: ["file"], textos: [] });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const file = leido.archivos.file;
  if (!file) return NextResponse.json({ error: "No llegó la foto del comprobante." }, { status: 400 });

  try {
    const actual = await AdelantosDB.comprobanteDe(auth.tenantId, id);
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (actual.status === "CANCELADO") return NextResponse.json({ error: "Este adelanto está anulado.", code: "anulado" }, { status: 409 });
    if (actual.comprobanteUrl) return NextResponse.json({ error: "Este adelanto ya tiene una foto del comprobante.", code: "cambio" }, { status: 409 });
  } catch (e) {
    logger.error("[adelantos/voucher] lectura error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }

  const imagen = await normalizarImagen(file, { maxBytes: MAX_BYTES_VOUCHER, maxPixeles: MAX_PIXELES_VOUCHER, ancho: 1600, nombre: "La foto del comprobante" });
  if (esErrorImagen(imagen)) return NextResponse.json({ error: imagen.error, code: imagen.code }, { status: imagen.status });

  let ruta: string;
  try {
    ruta = rutaVoucherPrivada(auth.tenantId, id, Date.now(), randomBytes(8).toString("hex"));
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const subida = await subirFirmaPrivada(ruta, imagen.webp).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
  if (!subida.ok) return NextResponse.json({ error: "No se pudo guardar la foto. Prueba de nuevo." }, { status: 502 });

  const comprobanteUrl = `${PREFIJO_PRIVADO}${ruta}`;
  let r: Awaited<ReturnType<typeof AdelantosDB.adjuntarComprobante>>;
  try {
    r = await AdelantosDB.adjuntarComprobante(auth.tenantId, id, comprobanteUrl, null);
  } catch (e) {
    await borrarFirmaPrivada(ruta);
    logger.error("[adelantos/voucher] guardar error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  if (r !== "ok") {
    await borrarFirmaPrivada(ruta);
    if (r === "no-existe") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (r === "anulado") return NextResponse.json({ error: "Este adelanto está anulado.", code: "anulado" }, { status: 409 });
    return NextResponse.json({ error: "Alguien adjuntó otra foto mientras subías esta.", code: "cambio" }, { status: 409 });
  }
  logActivity("Adjuntar", "adelanto", `Adelanto ${id}: foto del comprobante guardada en privado`, id, auth.username, undefined, auth.tenantId).catch((err) =>
    logger.error("[adelantos/voucher] logActivity failed", { error: String(err) }),
  );
  return NextResponse.json({ comprobanteUrl }, { status: 201 });
}
