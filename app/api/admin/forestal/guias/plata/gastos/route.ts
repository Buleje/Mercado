import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { GuiaPlataDB, PlataGuiaError } from "@/lib/db/guia-plata.db";
import { gastoGuiaSchema } from "@/lib/forestal/plata-de-guia";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * /api/admin/forestal/guias/plata/gastos — gastos de una guía (ADR-437 §8):
 * estiba, descarga, carguío, cubicación, vigilancia, otro. Son `Expense` con
 * `gtfNumber`: entran al P&L y a Mi Plata, nunca al costo de la madera.
 *
 * POST `gastoGuiaSchema` (con `id` = corrección) → `{ gasto }` · DELETE `?id=` → `{ ok }`.
 * `requireAdmin` → CSRF → rate limit → guard `spec:forestal:ctp-libro` → `safeParse`.
 */

const ESCRIBIR = ["admin", "owner"] as const;

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este negocio." },
        { status: 403 },
      );
}

export const POST = withApiHandler("forestal-guias-plata-gastos-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ESCRIBIR);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role);
  if (rol) return rol;
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
  const parsed = gastoGuiaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  try {
    const gasto = await GuiaPlataDB.guardarGasto(auth.tenantId, parsed.data, { username: auth.username });
    return NextResponse.json({ gasto });
  } catch (err) {
    if (err instanceof PlataGuiaError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    logger.error("[guias/plata/gastos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-guias-plata-gastos-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ESCRIBIR);
  if (auth instanceof NextResponse) return auth;
  const rol = soloAdminODueno(auth.role);
  if (rol) return rol;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id || id.length > 40) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await GuiaPlataDB.eliminarGasto(auth.tenantId, id, { username: auth.username });
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[guias/plata/gastos.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
