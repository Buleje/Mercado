import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothCartografiaDB } from "@/lib/db/forest-loth-cartografia.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/cartografia — contexto del plano del Libro TH:
 * referencias georreferenciadas (centros poblados, campamentos, ingreso a la
 * UMF…) y el cuadro de ACCESOS (tramo · tiempo · movilidad).
 *
 * GET — lee la cartografía del tenant.
 * PUT — la reemplaza { referencias[], vias[], accesos[], nota }.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const putSchema = z.object({
  referencias: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        nombre: z.string().trim().max(80),
        tipo: z.string().trim().max(30),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        nota: z.string().trim().max(160).optional(),
      }),
    )
    .max(120)
    .default([]),
  vias: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        nombre: z.string().trim().max(80),
        tipo: z.string().trim().max(20),
        puntos: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).max(500),
      }),
    )
    .max(40)
    .default([]),
  accesos: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        lugar: z.string().trim().max(120),
        tiempo: z.string().trim().max(40).optional(),
        movilidad: z.string().trim().max(40).optional(),
      }),
    )
    .max(20)
    .default([]),
  nota: z.string().trim().max(300).default(""),
});

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-cartografia-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    return NextResponse.json({ cartografia: await ForestLothCartografiaDB.get(auth.tenantId) });
  } catch (err) {
    logger.error("[loth.cartografia.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-cartografia-put", async (req: NextRequest) => {
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
    const cartografia = await ForestLothCartografiaDB.set(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ cartografia });
  } catch (err) {
    logger.error("[loth.cartografia.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
