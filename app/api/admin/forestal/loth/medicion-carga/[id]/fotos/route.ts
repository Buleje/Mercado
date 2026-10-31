import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ClaveOcupadaError } from "@/lib/db/platform-settings.db";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ForestMedicionCargaDB } from "@/lib/db/forest-medicion-carga.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { esInlineSeguro, getSignedUrl } from "@/lib/documents/storage";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { prepararArchivo } from "@/lib/forestal/documentos-guia-server";
import { MAX_FOTOS_POR_CARGA } from "@/lib/forestal/medicion-carga";
import { esFotoDeLaCarga, guardarFotoDeCarga, type PermisoDeCarga } from "@/lib/forestal/medicion-carga-server";
import { ROLES_MEDICION_CARGA, especializacionLoth, ocupado } from "../../_comun";

/**
 * /api/admin/forestal/loth/medicion-carga/[id]/fotos — las fotos de una carga.
 *
 * POST multipart `{ tipo: "original" | "anotada", file }` → 201 `{ foto, carga }`.
 *      Se guarda en el Drive AL GUARDAR LA CARGA (carpeta del permiso ›
 *      «Cargas medidas»): si nadie registra la guía, la foto no se pierde. Si
 *      el storage falla → 502 con el mensaje para la pantalla (antes sólo
 *      quedaba en el log). Si la carga ya no acepta fotos, el archivo subido
 *      va a la papelera: no queda un huérfano.
 * GET  `?doc=<id>` → 302 a la URL firmada, sólo si el documento es una foto de
 *      ESTA carga de ESTE tenant.
 */

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(64);
const tipoSchema = z.enum(["original", "anotada"]);
const TTL_SEG = 10 * 60;

const noEncontrada = () => NextResponse.json({ error: "no_existe", message: "Esa carga ya no está." }, { status: 404 });

/** Titular y permiso del plan de la carga, para la carpeta. Un plan borrado → «Sin permiso». */
async function permisoDe(tenantId: string, planId: string | null): Promise<PermisoDeCarga | null> {
  if (!planId) return null;
  const p = await ForestPlanDB.getPlan(tenantId, planId);
  return p ? { titular: p.titularName, permiso: p.tituloHabilitante ?? p.planNumber ?? null } : null;
}

export const POST = withApiHandler("forestal-loth-medicion-carga-foto-post", async (req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdmin(req, ROLES_MEDICION_CARGA);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "DRIVE", "loth-medicion-carga-fotos");
  if (rl) return rl;
  const guard = await especializacionLoth(auth.tenantId);
  if (guard) return guard;
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return noEncontrada();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "Manda la foto como multipart/form-data." }, { status: 400 });
  }
  const tipo = tipoSchema.safeParse(form.get("tipo"));
  if (!tipo.success) return NextResponse.json({ error: "validation_error", message: "Falta el tipo de foto." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "sin_archivo", message: "No llegó ninguna foto." }, { status: 400 });

  const user = auth.username || "unknown";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  try {
    const carga = await ForestMedicionCargaDB.get(auth.tenantId, id.data);
    if (!carga) return noEncontrada();
    if (carga.estado !== "medida") {
      return NextResponse.json({ error: "cerrada", message: "Esa carga ya se usó o se descartó: no recibe fotos." }, { status: 409 });
    }
    if (carga.fotos.length >= MAX_FOTOS_POR_CARGA) {
      return NextResponse.json({ error: "tope_fotos", message: `La carga ya tiene ${MAX_FOTOS_POR_CARGA} fotos.` }, { status: 409 });
    }
    const archivo = await prepararArchivo(file);
    if (!archivo.ok) return NextResponse.json({ error: archivo.error, message: archivo.message }, { status: archivo.status });
    if (archivo.mime !== "image/webp") {
      return NextResponse.json({ error: "tipo_no_permitido", message: "Acá va la foto de la carga, no un PDF." }, { status: 415 });
    }
    const doc = await guardarFotoDeCarga({
      tenantId: auth.tenantId,
      user,
      carga,
      permiso: await permisoDe(auth.tenantId, carga.planId),
      tipo: tipo.data,
      archivo,
      ip,
    });
    if (!doc) {
      return NextResponse.json(
        { error: "storage", message: "No se pudo guardar la foto en el Drive. La carga quedó guardada: reintenta la foto." },
        { status: 502 },
      );
    }
    const foto = { docId: doc.id, tipo: tipo.data, subida: { en: new Date().toISOString(), por: user } };
    let r: Awaited<ReturnType<typeof ForestMedicionCargaDB.agregarFoto>>;
    try {
      r = await ForestMedicionCargaDB.agregarFoto(auth.tenantId, carga.id, foto, user);
    } catch (err) {
      /* La foto subió pero no quedó atada: a la papelera, o el reintento la duplica. */
      await DocumentsDB.softDelete(auth.tenantId, doc.id);
      throw err;
    }
    if (!r.ok) {
      await DocumentsDB.softDelete(auth.tenantId, doc.id);
      const status = r.motivo === "no_existe" ? 404 : 409;
      return NextResponse.json({ error: r.motivo, message: status === 404 ? "Esa carga ya no está." : "La carga ya no recibe fotos." }, { status });
    }
    auditCtp({
      tenantId: auth.tenantId,
      action: "loth_medicion_carga_foto",
      entity: "ForestMedicionCarga",
      entityId: carga.id,
      detail: `Foto ${tipo.data} de la carga guardada en el Drive (${r.carga.fotos.length} de ${Math.max(r.carga.fotosEsperadas, r.carga.fotos.length)})`,
      user,
    });
    return NextResponse.json({ foto, carga: r.carga }, { status: 201 });
  } catch (err) {
    if (err instanceof ClaveOcupadaError) return ocupado();
    logger.error("[loth.medicion-carga.fotos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const GET = withApiHandler("forestal-loth-medicion-carga-foto-get", async (req: NextRequest, ctx: Ctx) => {
  const auth = await requireAdmin(req, ROLES_MEDICION_CARGA);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "DRIVE_READ", "loth-medicion-carga-fotos");
  if (rl) return rl;
  const guard = await especializacionLoth(auth.tenantId);
  if (guard) return guard;
  const id = idSchema.safeParse((await ctx.params).id);
  const docId = idSchema.safeParse(req.nextUrl.searchParams.get("doc"));
  if (!id.success || !docId.success) return noEncontrada();
  try {
    const carga = await ForestMedicionCargaDB.get(auth.tenantId, id.data);
    if (!carga || !carga.fotos.some((f) => f.docId === docId.data)) return noEncontrada();
    const doc = await DocumentsDB.getById(auth.tenantId, docId.data, auth.role);
    if (!doc || !esFotoDeLaCarga(doc, carga.id)) return noEncontrada();
    const firmada = await getSignedUrl(doc.storagePath, TTL_SEG, esInlineSeguro(doc.mimeType, doc.name) ? undefined : { download: doc.name });
    if (!firmada) return noEncontrada();
    return new NextResponse(null, {
      status: 302,
      headers: { Location: firmada, "Cache-Control": "private, max-age=300", "Referrer-Policy": "no-referrer" },
    });
  } catch (err) {
    logger.error("[loth.medicion-carga.fotos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
