/**
 * /api/admin/forestal/operaciones — las operaciones hermanas de esta planta (ADR-395).
 *
 *   GET            → { actual, grupo, puedeCrear }  el grupo, con qué hermanas puede
 *                    entrar quien pregunta
 *   POST { nombre, nombreActual? } → crea la hermana (dueño/admin): tenant nuevo con
 *                    la misma gente, los mismos módulos y la Ficha copiada
 *   DELETE ?slug=  → la desactiva y la saca del grupo (no la borra)
 *
 * Guard: spec:forestal:ctp-libro · rate limit STRICT en lo que escribe.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCtpOperacionesDB } from "@/lib/db/forest-ctp-operaciones.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { NOMBRE_OPERACION_MAX } from "@/lib/forestal/ctp-operaciones";

const crearSchema = z.object({
  nombre: z.string().trim().min(2).max(NOMBRE_OPERACION_MAX),
  nombreActual: z.string().trim().min(2).max(NOMBRE_OPERACION_MAX).optional(),
});

async function sinLibro(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-operaciones-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const guard = await sinLibro(auth.tenantId);
  if (guard) return guard;
  try {
    const [actual, grupo] = await Promise.all([
      ForestCtpOperacionesDB.identidad(auth.tenantId),
      ForestCtpOperacionesDB.grupoDe(auth.tenantId, auth.username),
    ]);
    return NextResponse.json({
      actual: { slug: actual.slug, nombre: actual.nombre },
      grupo,
      puedeCrear: auth.role === "admin" || auth.role === "owner",
    });
  } catch (err) {
    return ctpErrorResponse(err, "operaciones.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-operaciones-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "STRICT", "ctp-operaciones");
  if (rl) return rl;
  const guard = await sinLibro(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  try {
    const operacion = await ForestCtpOperacionesDB.crearHermana(auth.tenantId, {
      nombre: parsed.data.nombre,
      nombreActual: parsed.data.nombreActual,
      user: auth.username ?? "unknown",
    });
    return NextResponse.json({ operacion }, { status: 201 });
  } catch (err) {
    return ctpErrorResponse(err, "operaciones.POST", auth.tenantId);
  }
});

export const DELETE = withApiHandler("forestal-operaciones-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "STRICT", "ctp-operaciones");
  if (rl) return rl;
  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "slug_required" }, { status: 400 });
  try {
    await ForestCtpOperacionesDB.quitarHermana(auth.tenantId, slug, auth.username ?? "unknown");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return ctpErrorResponse(err, "operaciones.DELETE", auth.tenantId);
  }
});
