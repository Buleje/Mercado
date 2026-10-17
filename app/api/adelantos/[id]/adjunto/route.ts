import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { esErrorAdjunto, MAX_BYTES_PEDIDO_ADJUNTO, normalizarAdjunto } from "@/lib/adelantos/adjunto-privado.server";
import { PREFIJO_PRIVADO, rutaAdjuntoPrivada } from "@/lib/adelantos/recibo-firmado";
import { subirArchivoPrivado } from "@/lib/adelantos/firma-storage";
import { AdelantosDB } from "@/lib/db/adelantos.db";

/**
 * POST /api/adelantos/[id]/adjunto — multipart `file`: el comprobante de una
 * ENTREGA o abono de este adelanto (foto o PDF), al bucket PRIVADO (10-10, Ley
 * 29733). Antes iba a `/api/upload` (bucket público `media`): el voucher del
 * Yape, con nombre y monto, quedaba a la vista de quien tuviera la URL.
 *
 * Se sube ANTES de registrar la entrega (la entrega todavía no existe): la
 * respuesta `{ comprobanteUrl: "priv:<ruta>" }` va en el JSON de
 * `POST …/entregas`, que sólo acepta una ruta de la carpeta de ESTE adelanto.
 * Se ve por `GET …/comprobante?entrega=<id>`. Si la entrega nunca se registra,
 * el archivo queda en la carpeta privada del adelanto (nadie lo puede abrir).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-adjunto"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const { id } = await params;

  const leido = await leerMultipartFirma(req, { archivos: ["file"], textos: [], maxBytes: MAX_BYTES_PEDIDO_ADJUNTO });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const file = leido.archivos.file;
  if (!file) return NextResponse.json({ error: "No llegó el comprobante." }, { status: 400 });

  try {
    /* El adelanto de ESTE negocio (tenant del JWT en el WHERE): el de otro → 404. */
    const actual = await AdelantosDB.comprobanteDe(auth.tenantId, id);
    if (!actual) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (actual.status === "CANCELADO") return NextResponse.json({ error: "Este adelanto está anulado.", code: "anulado" }, { status: 409 });
  } catch (e) {
    logger.error("[adelantos/adjunto] lectura error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }

  const adjunto = await normalizarAdjunto(file, "El comprobante");
  if (esErrorAdjunto(adjunto)) return NextResponse.json({ error: adjunto.error, code: adjunto.code }, { status: adjunto.status });

  let ruta: string;
  try {
    ruta = rutaAdjuntoPrivada(auth.tenantId, id, Date.now(), randomBytes(8).toString("hex"), adjunto.ext);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  const subida = await subirArchivoPrivado(ruta, adjunto.cuerpo).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
  if (!subida.ok) return NextResponse.json({ error: "No se pudo guardar el comprobante. Prueba de nuevo." }, { status: 502 });

  return NextResponse.json({ comprobanteUrl: `${PREFIJO_PRIVADO}${ruta}`, tipo: adjunto.ext }, { status: 201 });
}
