import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { leerMultipartFirma, jsonDe } from "@/lib/adelantos/imagen-firma.server";
import { esErrorAdjunto, MAX_BYTES_PEDIDO_ADJUNTO, normalizarAdjunto } from "@/lib/adelantos/adjunto-privado.server";
import { MAX_ADELANTOS_POR_HOJA, REGEX_CODIGO_HOJA } from "@/lib/adelantos/hoja-firmas";
import { AdelantosAjenosError, AdelantosHojaFirmasDB, SubidaHojaFallidaError } from "@/lib/db/adelantos-hoja-firmas.db";

/**
 * GET /api/adelantos/hoja-firmas — los adelantos abiertos que el negocio dio y
 * todavía no tienen firma ni hoja firmada: lo que se puede poner en la hoja del
 * sábado. Mismos roles que leen adelantos.
 */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "adelantos-hoja-firmas"); if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    const adelantos = await AdelantosHojaFirmasDB.pendientes(auth.tenantId);
    // El encargado imprime pero no sube: la carpeta de las hojas es sólo de dueño y administrador.
    const puedeSubir = soloAdminODueno(auth.role) === null;
    return NextResponse.json({ adelantos, puedeSubir }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/hoja-firmas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer los adelantos sin firma." }, { status: 503 });
  }
}

const DatosSchema = z.object({
  codigo: z.string().regex(REGEX_CODIGO_HOJA),
  adelantoIds: z.array(z.string().min(1).max(40)).min(1).max(MAX_ADELANTOS_POR_HOJA),
});

/**
 * POST /api/adelantos/hoja-firmas — multipart `datos` ({ codigo, adelantoIds }) +
 * `file` (foto o PDF de la hoja firmada, hasta 4 MB). Se guarda UNA vez en el
 * Archivo (carpeta «Adelantos › Hojas de firmas», sólo dueño/admin) y queda
 * atada a cada adelanto por etiqueta. No toca el registro de firmas.
 */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const rl = await applyRateLimit(req, "MODERATE", "adelantos-hoja-firmas"); if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  const soloDuenos = soloAdminODueno(auth.role, "subir la hoja firmada");
  if (soloDuenos) return soloDuenos;

  const leido = await leerMultipartFirma(req, { archivos: ["file"], textos: ["datos"], maxBytes: MAX_BYTES_PEDIDO_ADJUNTO });
  if (!leido.ok) return NextResponse.json({ error: leido.error, ...(leido.issues ? { issues: leido.issues } : {}) }, { status: leido.status });
  const datos = DatosSchema.safeParse(jsonDe(leido.textos.datos));
  if (!datos.success) return NextResponse.json({ error: "Datos inválidos", issues: datos.error.issues.map((i) => i.message) }, { status: 400 });
  const file = leido.archivos.file;
  if (!file) return NextResponse.json({ error: "No llegó la foto de la hoja." }, { status: 400 });

  const adjunto = await normalizarAdjunto(file, "La hoja");
  if (esErrorAdjunto(adjunto)) return NextResponse.json({ error: adjunto.error, code: adjunto.code }, { status: adjunto.status });

  try {
    const documentoId = await AdelantosHojaFirmasDB.adjuntarFoto(auth.tenantId, {
      adelantoIds: datos.data.adelantoIds,
      codigo: datos.data.codigo,
      cuerpo: adjunto.cuerpo,
      ext: adjunto.ext,
      usuario: auth.username,
      rol: auth.role,
    });
    await Promise.all(
      [...new Set(datos.data.adelantoIds)].map((id) =>
        logActivity("hoja_firmas", "adelanto", `Hoja de firmas ${datos.data.codigo} firmada en papel (foto en el Archivo)`, id, auth.username, undefined, auth.tenantId),
      ),
    );
    return NextResponse.json({ documentoId, codigo: datos.data.codigo, adelantos: new Set(datos.data.adelantoIds).size }, { status: 201 });
  } catch (e) {
    if (e instanceof AdelantosAjenosError) return NextResponse.json({ error: "Alguno de los adelantos no existe o está anulado. Vuelve a abrir la hoja." }, { status: 404 });
    if (e instanceof SubidaHojaFallidaError) return NextResponse.json({ error: "No se pudo guardar la foto. Prueba de nuevo." }, { status: 502 });
    logger.error("[adelantos/hoja-firmas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo guardar la hoja." }, { status: 503 });
  }
}
