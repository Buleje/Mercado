import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothCitesDB } from "@/lib/db/forest-loth-cites.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/cites — catálogo de permisos CITES del Libro TH.
 *
 * GET — lee el catálogo del tenant.
 * PUT — reemplaza el catálogo { permisos: [{ especie, numero, vencimiento }] }.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const putSchema = z.object({
  permisos: z
    .array(
      z.object({
        especie: z.string().trim().max(120).default(""),
        numero: z.string().trim().max(80).default(""),
        vencimiento: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)")
          .or(z.literal(""))
          .default(""),
      }),
    )
    .max(200)
    .default([]),
});

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-cites-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const catalogo = await ForestLothCitesDB.get(auth.tenantId);
    return NextResponse.json({ catalogo });
  } catch (err) {
    logger.error("[loth.cites.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-cites-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const catalogo = await ForestLothCitesDB.set(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ catalogo });
  } catch (err) {
    logger.error("[loth.cites.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
