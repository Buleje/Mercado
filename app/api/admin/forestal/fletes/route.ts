import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ForestFleteDB } from "@/lib/db/forest-flete.db";
import { ESTADOS_PAGO, fleteInputSchema, type EstadoPago } from "@/lib/forestal/fletes";

/**
 * /api/admin/forestal/fletes — los viajes del CTP (ADR-318).
 *
 * GET    lista (`desde`, `hasta` ISO · `estadoPago` · `gtf`) · `?candidatos=1`
 *        trae las guías de ingreso con transportista/placa que aún no tienen
 *        su viaje anotado (ADR-318 addendum, Brandon 2026-08-20)
 * POST   alta/edición (`id` para editar)
 * PATCH  marca pagado/pendiente
 * DELETE baja lógica (`?id=`)
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

/** Fecha ISO del query. Inválida → `undefined` (se ignora el filtro, no se rompe). */
function fecha(v: string | null): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const GET = withApiHandler("forestal-fletes-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const sp = req.nextUrl.searchParams;
  const estadoRaw = (sp.get("estadoPago") ?? "").trim();
  const estadoPago = (ESTADOS_PAGO as readonly string[]).includes(estadoRaw) ? (estadoRaw as EstadoPago) : undefined;

  if (sp.get("candidatos") === "1") {
    try {
      const candidatos = await ForestFleteDB.candidatosSinAnotar(auth.tenantId, {
        desde: fecha(sp.get("desde")),
        hasta: fecha(sp.get("hasta")),
      });
      return NextResponse.json({ candidatos });
    } catch (err) {
      logger.error("[fletes.GET candidatos] failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  }

  try {
    const fletes = await ForestFleteDB.listar(auth.tenantId, {
      desde: fecha(sp.get("desde")),
      hasta: fecha(sp.get("hasta")),
      estadoPago,
      gtfNumber: sp.get("gtf")?.trim() || undefined,
    });
    return NextResponse.json({ fletes });
  } catch (err) {
    logger.error("[fletes.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

const postSchema = fleteInputSchema.extend({ id: z.string().trim().max(40).optional() });

export const POST = withApiHandler("forestal-fletes-post", async (req: NextRequest) => {
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
    const flete = await ForestFleteDB.guardar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ flete });
  } catch (err) {
    // Fecha mal formada es dato del operador, no fallo del server.
    if (err instanceof Error && err.message.startsWith("La fecha")) {
      return NextResponse.json({ error: "fecha_invalida", message: err.message }, { status: 422 });
    }
    logger.error("[fletes.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

const pagoSchema = z.object({
  id: z.string().trim().min(1).max(40),
  estadoPago: z.enum(ESTADOS_PAGO),
});

export const PATCH = withApiHandler("forestal-fletes-pago", async (req: NextRequest) => {
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
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  try {
    const flete = await ForestFleteDB.marcarPago(
      auth.tenantId,
      parsed.data.id,
      parsed.data.estadoPago,
      auth.username ?? "unknown",
    );
    if (!flete) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ flete });
  } catch (err) {
    logger.error("[fletes.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-fletes-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestFleteDB.eliminar(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[fletes.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
