import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/wood-entries/[id]
 *
 * GET    — obtener detalle de un entry
 * PATCH  — { action: "validate" | "reject" | "delete", reason? }
 *          Solo admin/owner. Cambia status, registra validatedBy/At.
 */

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("validate") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(500) }),
  // Anular un ingreso YA validado (con motivo). Distinto de reject (pre-validación).
  z.object({ action: z.literal("annul"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("delete") }),
]);

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  if (!ok) {
    return NextResponse.json(
      { error: "specialization_disabled" },
      { status: 403 },
    );
  }
  return null;
}

// ─── GET ─────────────────────────────────────────────────────────────────

export const GET = withApiHandler("forestal-wood-entries-id-get", async (req: NextRequest, ctx: RouteCtx) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await ctx.params;
  const entry = await WoodEntriesDB.getById(auth.tenantId, id);
  if (!entry) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ entry });
});

// ─── PATCH ───────────────────────────────────────────────────────────────

export const PATCH = withApiHandler("forestal-wood-entries-id-patch", async (req: NextRequest, ctx: RouteCtx) => {
  // Validate y delete solo admin/owner. Almacenero no puede validar
  // sus propios ingresos (separation of duties — CTP requiere doble check).
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    let entry;
    if (parsed.data.action === "validate") {
      entry = await WoodEntriesDB.validate(auth.tenantId, id, auth.username);
    } else if (parsed.data.action === "reject") {
      entry = await WoodEntriesDB.reject(
        auth.tenantId,
        id,
        auth.username,
        parsed.data.reason,
      );
    } else if (parsed.data.action === "annul") {
      entry = await WoodEntriesDB.annul(auth.tenantId, id, auth.username ?? "unknown", parsed.data.reason);
    } else {
      entry = await WoodEntriesDB.softDelete(auth.tenantId, id, auth.username ?? "unknown");
    }

    logger.info("[wood-entries.PATCH] action", {
      tenantId: auth.tenantId,
      id,
      action: parsed.data.action,
      actor: auth.username,
    });

    return NextResponse.json({ entry });
  } catch (err) {
    logger.error("[wood-entries.PATCH] failed", { error: String(err), id });
    // El guard de anular (ingreso ya consumido) es un error de negocio → 422 con motivo.
    if (parsed.data.action === "annul") {
      return NextResponse.json({ error: "annul_blocked", message: err instanceof Error ? err.message : "No se pudo anular el ingreso." }, { status: 422 });
    }
    // Editar un ingreso de un mes cerrado también es un invariante, no un bug.
    return ctpErrorResponse(err, "wood-entries.PATCH", auth.tenantId);
  }
});
