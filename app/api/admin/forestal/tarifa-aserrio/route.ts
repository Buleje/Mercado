import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestTarifaAserrioDB, TarifaAserrioError } from "@/lib/db/forest-tarifa-aserrio.db";
import { versionTarifaInputSchema } from "@/lib/forestal/tarifa-aserrio";

/**
 * /api/admin/forestal/tarifa-aserrio — la tarifa del aserrío por encargo (ADR-412).
 * GET `{ tarifario }` · PUT guarda una versión · DELETE `?id=` la quita.
 * Guard: `spec:forestal:ctp-libro` · rate-limit GENEROUS bucket 'ctp'.
 */

async function guard(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-tarifa-aserrio-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;
  try {
    /* `?borrador=1`: la tarifa armada con la producción real, con los precios
       en 0. No guarda nada — guardarla sin precios la rechaza el PUT. */
    if (req.nextUrl.searchParams.get("borrador") === "1") {
      return NextResponse.json(await ForestTarifaAserrioDB.borrador(auth.tenantId));
    }
    return NextResponse.json({ tarifario: await ForestTarifaAserrioDB.leer(auth.tenantId) });
  } catch (err) {
    logger.error("[tarifa-aserrio.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-tarifa-aserrio-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = versionTarifaInputSchema.safeParse(body);
  if (!parsed.success) {
    const primero = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: "validation_error",
        message: primero?.message ?? "Los datos de la tarifa no son válidos.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }
  try {
    const tarifario = await ForestTarifaAserrioDB.guardar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ tarifario });
  } catch (err) {
    if (err instanceof TarifaAserrioError) {
      return NextResponse.json({ error: "tarifa_invalida", message: err.message }, { status: 422 });
    }
    logger.error("[tarifa-aserrio.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-tarifa-aserrio-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const tarifario = await ForestTarifaAserrioDB.quitar(auth.tenantId, id, auth.username ?? "unknown");
    if (!tarifario) {
      return NextResponse.json({ error: "not_found", message: "Esa versión de la tarifa ya no existe." }, { status: 404 });
    }
    return NextResponse.json({ tarifario });
  } catch (err) {
    logger.error("[tarifa-aserrio.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
