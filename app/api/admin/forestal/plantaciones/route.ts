import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestPlantacionesDB } from "@/lib/db/forest-plantaciones.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/plantaciones — Registro de Plantación Forestal (RNPF, ADR-380).
 *
 * GET     — "Mis Registros de Plantación" (listado liviano, sin bloques/vértices).
 * POST    — guarda (crea o actualiza por `id`); reemplaza bloques/vértices/especies enteros.
 * DELETE  — borra por `?id=`.
 *
 * Misma spec que el resto de `forestal-tramites` (`spec:forestal:tramites`):
 * es el mismo módulo, otra vista.
 */

const tipoPersonaEnum = z.enum(["natural", "juridica"]);
const tipoTramiteEnum = z.enum(["inscripcion", "actualizacion"]);
const estadoEnum = z.enum(["borrador", "en_elaboracion", "completo", "pendiente_documentos", "listo_presentar"]);
const fechaSolo = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const txt = (max: number) => z.string().trim().max(max).nullish();

const verticeSchema = z.object({
  id: z.string().trim().max(80).optional(),
  orden: z.number().int().min(0).max(500),
  zonaUtm: txt(20),
  este: z.number().finite(),
  norte: z.number().finite(),
});

const especieSchema = z.object({
  id: z.string().trim().max(80).optional(),
  // Sin `.min(1)` a propósito: "Agregar especie" crea la fila con nombreComun
  // vacío y el autoguardado (debounce 2s) puede disparar antes de que el
  // operador tipee el nombre — la persistencia guarda BORRADORES, la
  // completitud real la exige `validarPlantacion()` en el paso Revisión, no
  // el endpoint. Rechazar acá violaba "nunca bloquea, sólo avisa" (§15).
  nombreComun: z.string().trim().max(120),
  nombreCientifico: txt(150),
  tipoVegetativo: txt(80),
  cantidad: z.number().int().min(0).max(10_000_000).nullish(),
  finalidad: txt(60),
  mesInstalacion: z.number().int().min(1).max(12).nullish(),
  anioInstalacion: z.number().int().min(1900).max(2200).nullish(),
  observaciones: txt(2000),
  cites: z.boolean().optional(),
  citesProcedencia: txt(2000),
  situacionActual: txt(2000),
  produccionCantidad: z.number().finite().nullish(),
  produccionUnidad: txt(20),
});

const bloqueSchema = z.object({
  id: z.string().trim().max(80).optional(),
  numero: z.number().int().min(1).max(9999),
  nombre: txt(120),
  superficieHa: z.number().finite().min(0).max(1_000_000).nullish(),
  vertices: z.array(verticeSchema).max(500),
  especies: z.array(especieSchema).max(200),
});

const documentoSchema = z.object({
  categoria: z.string().trim().min(1).max(60),
  clasificacion: z.enum(["requerido", "opcional", "no_corresponde"]),
  documentId: z.string().trim().max(80).nullish(),
  rotulo: txt(200),
});

const saveSchema = z.object({
  id: z.string().trim().max(80).optional(),
  tipoTramite: tipoTramiteEnum,
  codigoPlantacionSerfor: txt(60),
  estado: estadoEnum.optional(),

  titularTipoPersona: tipoPersonaEnum.nullish(),
  titularTipoDocumento: txt(20),
  titularNumeroDocumento: txt(20),
  titularRazonSocial: txt(200),
  titularApellidoPaterno: txt(80),
  titularApellidoMaterno: txt(80),
  titularNombres: txt(120),
  titularTelefonoFijo: txt(20),
  titularCelular: txt(20),
  titularEmail: txt(150),
  titularDepartamento: txt(80),
  titularProvincia: txt(80),
  titularDistrito: txt(80),
  titularTipoVia: txt(30),
  titularDireccion: txt(200),
  titularNumero: txt(20),
  titularDocumentoAutorizaUso: txt(200),

  repTiene: z.boolean().optional(),
  repTipoDocumento: txt(20),
  repNumeroDocumento: txt(20),
  repApellidoPaterno: txt(80),
  repApellidoMaterno: txt(80),
  repNombres: txt(120),
  repTelefonoFijo: txt(20),
  repCelular: txt(20),
  repEmail: txt(150),
  repDepartamento: txt(80),
  repProvincia: txt(80),
  repDistrito: txt(80),
  repTipoVia: txt(30),
  repDireccion: txt(200),
  repNumero: txt(20),

  predioNombre: txt(200),
  predioAreaTotalHa: z.number().finite().min(0).max(1_000_000).nullish(),
  predioDepartamento: txt(80),
  predioProvincia: txt(80),
  predioDistrito: txt(80),
  predioSectorAnexo: txt(120),
  predioZonaUtm: txt(20),
  predioEste: z.number().finite().nullish(),
  predioNorte: z.number().finite().nullish(),
  predioDatum: z.string().trim().max(20).optional(),

  titularidadTipo: txt(30),
  titularidadTipoPersona: tipoPersonaEnum.nullish(),
  titularidadDocumentoTipo: txt(30),
  titularidadDocumentoNumero: txt(20),
  titularidadNombre: txt(200),
  titularidadDocAcreditaTipo: txt(80),
  titularidadDocAcreditaNumero: txt(80),
  titularidadInscripcionSunarp: txt(80),
  titularidadDocAutorizaUso: txt(200),
  posesionarioNombre: txt(200),
  posesionarioDocumentoAcredita: txt(200),
  posesionarioAniosConduccion: z.number().int().min(0).max(200).nullish(),

  tituloHabilitanteTiene: z.boolean().optional(),
  tituloHabilitanteTipo: txt(40),
  tituloHabilitanteCodigo: txt(80),

  djLugar: txt(120),
  djFecha: fechaSolo.nullish(),
  djTitularNombre: txt(200),
  djDni: txt(20),
  djAceptado: z.boolean().optional(),

  documentos: z.array(documentoSchema).max(30).optional(),
  notas: txt(2000),

  bloques: z.array(bloqueSchema).max(200),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:tramites");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo Trámites y Oficios no está habilitado para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-plantaciones-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const plantaciones = await ForestPlantacionesDB.list(auth.tenantId);
    return NextResponse.json({ plantaciones });
  } catch (err) {
    logger.error("[plantaciones.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-plantaciones-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  try {
    const plantacion = await ForestPlantacionesDB.save(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ plantacion }, { status: parsed.data.id ? 200 : 201 });
  } catch (err) {
    logger.error("[plantaciones.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-plantaciones-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestPlantacionesDB.remove(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[plantaciones.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
