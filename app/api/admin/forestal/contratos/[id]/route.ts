import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";

/**
 * /api/admin/forestal/contratos/[id] — la ficha del permiso y su balance (ADR-421).
 *
 * GET    el contrato · `?balance=1` agrega madera, producción, gastos, fletes,
 *        adelantos y cuenta corriente. `desde`/`hasta` acotan el período; sin
 *        ellos es la vida entera del permiso, que es como se mira un contrato.
 * PATCH  edita los datos del papel, o `{ accion: "vincular" }` ata todo lo que
 *        ya trae ese código escrito en el libro.
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

/** Fecha ISO del query. Inválida → `undefined`: se ignora el filtro, no se rompe. */
function fecha(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const patchSchema = z.union([
  z.object({ accion: z.literal("vincular") }),
  z.object({
    accion: z.undefined().optional(),
    codigo: z.string().trim().min(3).optional(),
    alias: z.string().trim().max(120).nullish(),
    titularNombre: z.string().trim().min(1).optional(),
    titularId: z.string().trim().nullish(),
    titularDoc: z.string().trim().max(20).nullish(),
    titularDocTipo: z.string().trim().max(12).nullish(),
    resolucionNumero: z.string().trim().max(120).nullish(),
    resolucionFecha: z.string().trim().nullish(),
    tipo: z.enum(["PER-FMP", "PER-FMC", "REG-PLT", "CONCESION", "CONTRATO", "DEMA", "PMFI", "PO", "otro"]).nullish(),
    arffs: z.string().trim().max(120).nullish(),
    region: z.string().trim().max(80).nullish(),
    provincia: z.string().trim().max(80).nullish(),
    distrito: z.string().trim().max(80).nullish(),
    areaHa: z.number().nonnegative().nullish(),
    vigenciaDesde: z.string().trim().nullish(),
    vigenciaHasta: z.string().trim().nullish(),
    estado: z.enum(["vigente", "vencido", "cerrado", "suspendido"]).optional(),
    planId: z.string().trim().nullish(),
    notas: z.string().trim().max(2000).nullish(),
  }),
]);

export const GET = withApiHandler("forestal-contrato-get", async (req: NextRequest, ctx) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const url = new URL(req.url);
  try {
    const contrato = await ForestContratoDB.get(auth.tenantId, id);
    if (!contrato) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (url.searchParams.get("balance") !== "1") return NextResponse.json({ contrato });
    const balance = await ForestContratoDB.balance(auth.tenantId, id, {
      desde: fecha(url.searchParams.get("desde")),
      hasta: fecha(url.searchParams.get("hasta")),
    });
    return NextResponse.json({ contrato, balance });
  } catch (err) {
    logger.error("[contrato.GET] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-contrato-patch", async (req: NextRequest, ctx) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    if ("accion" in parsed.data && parsed.data.accion === "vincular") {
      const vinculado = await ForestContratoDB.vincularPorCodigo(auth.tenantId, id, auth.username ?? "unknown");
      if (!vinculado) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ vinculado });
    }
    const { accion: _accion, ...datos } = parsed.data as Record<string, unknown>;
    const contrato = await ForestContratoDB.actualizar(auth.tenantId, id, datos, auth.username ?? "unknown");
    if (!contrato) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ contrato });
  } catch (err) {
    logger.error("[contrato.PATCH] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
