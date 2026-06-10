import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/caratula — Carátula del libro LO-TH (Anexo 1, ADR-125)
 *
 * GET   — lista carátulas + carátula activa
 * POST  — crea carátula (tomo / documento de gestión)
 * PATCH — actualiza carátula { id, ...campos }
 */

const caratulaSchema = z.object({
  registroNumber: z.string().trim().max(80).nullable().optional(),
  tomo: z.string().trim().max(80).nullable().optional(),
  titularName: z.string().trim().min(2).max(200),
  representanteLegal: z.string().trim().max(200).nullable().optional(),
  tituloHabilitante: z.string().trim().max(120).nullable().optional(),
  ruc: z.string().trim().max(20).nullable().optional(),
  dni: z.string().trim().max(20).nullable().optional(),
  domicilio: z.string().trim().max(300).nullable().optional(),
  departamento: z.string().trim().max(80).nullable().optional(),
  provincia: z.string().trim().max(80).nullable().optional(),
  distrito: z.string().trim().max(80).nullable().optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  docGestionType: z.enum(["PO", "PMFI", "DEMA"]).nullable().optional(),
  docGestionName: z.string().trim().max(150).nullable().optional(),
  resolucionNumber: z.string().trim().max(120).nullable().optional(),
  resolucionDate: z.coerce.date().nullable().optional(),
});

const patchSchema = caratulaSchema.partial().extend({
  id: z.string().trim().min(1),
});

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled
    ? null
    : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-caratula-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const [caratulas, active] = await Promise.all([
      ForestLothDB.listCaratulas(auth.tenantId),
      ForestLothDB.getActiveCaratula(auth.tenantId),
    ]);
    return NextResponse.json({ caratulas, active });
  } catch (err) {
    logger.error("[loth.caratula.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-caratula-post", async (req: NextRequest) => {
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

  const parsed = caratulaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const caratula = await ForestLothDB.createCaratula(auth.tenantId, {
      ...parsed.data,
      createdBy: auth.username ?? "unknown",
    });
    return NextResponse.json({ caratula }, { status: 201 });
  } catch (err) {
    logger.error("[loth.caratula.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-loth-caratula-patch", async (req: NextRequest) => {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { id, ...patch } = parsed.data;
    const caratula = await ForestLothDB.updateCaratula(auth.tenantId, id, patch);
    return NextResponse.json({ caratula });
  } catch (err) {
    logger.error("[loth.caratula.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
