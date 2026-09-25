import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestContratoDB, PlanAjenoError } from "@/lib/db/forest-contrato.db";
import { ESTADOS_CONTRATO, TIPOS_CONTRATO } from "@/lib/forestal/contratos";

/**
 * /api/admin/forestal/contratos — el permiso bajo el que se trabaja (ADR-421).
 *
 * GET   lista · `?candidatos=1` devuelve los códigos que ya están escritos en el
 *       libro y todavía no son contrato (con su titular sugerido y cuántas filas
 *       los usan), para sembrarlos sin tipear.
 * POST  alta. `?vincular=1` ata además todo lo que ya trae ese código escrito.
 *
 * Guard: `spec:forestal:ctp-libro` · rate-limit GENEROUS bucket 'ctp'.
 */

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

// La lista vive en `lib/forestal/contratos` (single source): acá se valida
// contra ella para que la ruta y el selector nunca ofrezcan cosas distintas.
const estados = ESTADOS_CONTRATO;
const tipos = TIPOS_CONTRATO;

const contratoSchema = z.object({
  codigo: z.string().trim().min(3, "El código del permiso es lo que lo identifica"),
  alias: z.string().trim().max(120).nullish(),
  titularNombre: z.string().trim().min(1, "Falta el dueño del permiso"),
  titularId: z.string().trim().nullish(),
  titularDoc: z.string().trim().max(20).nullish(),
  titularDocTipo: z.string().trim().max(12).nullish(),
  resolucionNumero: z.string().trim().max(120).nullish(),
  resolucionFecha: z.string().trim().nullish(),
  tipo: z.enum(tipos).nullish(),
  arffs: z.string().trim().max(120).nullish(),
  region: z.string().trim().max(80).nullish(),
  provincia: z.string().trim().max(80).nullish(),
  distrito: z.string().trim().max(80).nullish(),
  areaHa: z.number().nonnegative().nullish(),
  vigenciaDesde: z.string().trim().nullish(),
  vigenciaHasta: z.string().trim().nullish(),
  estado: z.enum(estados).optional(),
  planId: z.string().trim().nullish(),
  notas: z.string().trim().max(2000).nullish(),
});

export const GET = withApiHandler("forestal-contratos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  try {
    if (url.searchParams.get("candidatos") === "1") {
      return NextResponse.json({ candidatos: await ForestContratoDB.candidatos(auth.tenantId) });
    }
    const contratos = await ForestContratoDB.list(auth.tenantId, {
      incluirInactivos: url.searchParams.get("todos") === "1",
    });
    /* `?balances=1`: la tabla necesita la plata de cada fila. Va en una tanda
       de seis agregaciones agrupadas, no en una llamada por contrato. */
    if (url.searchParams.get("balances") !== "1") return NextResponse.json({ contratos });
    const mapa = await ForestContratoDB.balances(auth.tenantId);
    return NextResponse.json({
      contratos,
      balances: Object.fromEntries([...mapa.entries()]),
    });
  } catch (err) {
    logger.error("[contratos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-contratos-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
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
  const parsed = contratoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    // El código ya existente gana: dos altas del mismo permiso son el mismo
    // papel, y duplicarlo partiría el balance en dos mitades que no suman.
    const yaEsta = await ForestContratoDB.porCodigo(auth.tenantId, parsed.data.codigo);
    if (yaEsta) {
      return NextResponse.json(
        { error: "duplicado", message: `Ese permiso ya está cargado como «${yaEsta.codigo}».`, contrato: yaEsta },
        { status: 409 },
      );
    }
    const contrato = await ForestContratoDB.crear(auth.tenantId, parsed.data, auth.username ?? "unknown");
    const vincular = new URL(req.url).searchParams.get("vincular") === "1";
    const vinculado = vincular
      ? await ForestContratoDB.vincularPorCodigo(auth.tenantId, contrato.id, auth.username ?? "unknown")
      : null;
    return NextResponse.json({ contrato, vinculado }, { status: 201 });
  } catch (err) {
    if (err instanceof PlanAjenoError) {
      return NextResponse.json({ error: "plan_ajeno", message: err.message }, { status: 400 });
    }
    logger.error("[contratos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
