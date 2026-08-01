import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestCuentaDB, FleteYaCargadoError } from "@/lib/db/forest-cuenta.db";
import { movimientoInputSchema } from "@/lib/forestal/cuenta-corriente";

/**
 * /api/admin/forestal/cuenta — cuenta corriente con las partes (ADR-322).
 * GET lista (`parte` filtra) · POST alta/edición · DELETE baja lógica (`?id=`).
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

export const GET = withApiHandler("forestal-cuenta-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;
  try {
    const movimientos = await ForestCuentaDB.listar(auth.tenantId, {
      parteId: req.nextUrl.searchParams.get("parte")?.trim() || undefined,
    });
    return NextResponse.json({ movimientos });
  } catch (err) {
    logger.error("[cuenta.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

const postSchema = movimientoInputSchema.extend({ id: z.string().trim().max(40).optional() });

export const POST = withApiHandler("forestal-cuenta-post", async (req: NextRequest) => {
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
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  try {
    const movimiento = await ForestCuentaDB.guardar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ movimiento });
  } catch (err) {
    if (err instanceof FleteYaCargadoError) {
      return NextResponse.json({ error: "flete_ya_cargado", message: err.message }, { status: 409 });
    }
    if (err instanceof Error && err.message.startsWith("La fecha")) {
      return NextResponse.json({ error: "fecha_invalida", message: err.message }, { status: 422 });
    }
    logger.error("[cuenta.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-cuenta-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const g = await guard(auth.tenantId);
  if (g) return g;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestCuentaDB.eliminar(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[cuenta.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
