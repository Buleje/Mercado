import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { esRolValido, parteInputSchema, type RolParte } from "@/lib/forestal/directorio";

/**
 * /api/admin/forestal/directorio — la libreta de partes del CTP (ADR-317).
 *
 * GET    lista (filtros: `rol`, `q`, `inactivos=1`)
 * POST   alta/edición (upsert por documento; `id` para editar una fila puntual)
 * DELETE baja lógica (`?id=`)
 * PATCH  marca uso — se llama cuando la parte entra en un documento real
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

export const GET = withApiHandler("forestal-directorio-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const sp = req.nextUrl.searchParams;
  const rolRaw = (sp.get("rol") ?? "").trim();
  const rol: RolParte | undefined = esRolValido(rolRaw) ? rolRaw : undefined;
  const incluirInactivos = sp.get("inactivos") === "1";

  try {
    const partes = await ForestDirectorioDB.listarPartes(auth.tenantId, {
      rol,
      q: sp.get("q") ?? undefined,
      incluirInactivos,
    });
    // Los vehículos viajan en la misma respuesta: el selector de la guía los
    // necesita juntos (transportista + placa se eligen en el mismo paso) y son
    // dos listas cortas — dos round-trips para eso es peor.
    const vehiculos = sp.get("vehiculos") === "0"
      ? []
      : await ForestDirectorioDB.listarVehiculos(auth.tenantId, { incluirInactivos });
    return NextResponse.json({ partes, vehiculos });
  } catch (err) {
    logger.error("[directorio.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

const postSchema = parteInputSchema.extend({ id: z.string().trim().max(40).optional() });

export const POST = withApiHandler("forestal-directorio-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
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
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }

  try {
    const parte = await ForestDirectorioDB.guardarParte(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ parte });
  } catch (err) {
    logger.error("[directorio.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-directorio-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestDirectorioDB.eliminarParte(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[directorio.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

const usoSchema = z.object({
  partes: z.array(z.string().trim().max(40)).max(20).optional(),
  vehiculos: z.array(z.string().trim().max(40)).max(20).optional(),
});

export const PATCH = withApiHandler("forestal-directorio-uso", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
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
  const parsed = usoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  try {
    await ForestDirectorioDB.marcarUso(auth.tenantId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Contar usos es conveniencia: que falle no puede tumbar el guardado de la
    // guía que ya ocurrió, pero se loguea.
    logger.error("[directorio.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
});
