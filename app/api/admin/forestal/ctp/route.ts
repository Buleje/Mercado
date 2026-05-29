import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpDB, CTP_SECTIONS } from "@/lib/db/forest-ctp.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/ctp — Libro CTP: producción + despacho + saldos (ADR-127)
 * GET (lista ?section · ?saldos=1) · POST (crea) · PATCH { id, action:"annul", reason } · DELETE ?id
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'
 */

const sectionEnum = z.enum(CTP_SECTIONS);
const createSchema = z.object({
  section: sectionEnum,
  entryDate: z.coerce.date().optional(),
  gtfIngreso: z.string().trim().max(60).nullable().optional(),
  materiaPrimaRef: z.string().trim().max(120).nullable().optional(),
  speciesCommon: z.string().trim().max(120).nullable().optional(),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  productType: z.string().trim().max(80).nullable().optional(),
  volumeInputM3: z.coerce.number().nonnegative().max(99999).nullable().optional(),
  rendimientoPct: z.coerce.number().nonnegative().max(100).nullable().optional(),
  quantity: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  unit: z.enum(["m3", "kg", "unidad", "pt"]).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),
  gtfNumber: z.string().trim().max(60).nullable().optional(),
  destino: z.string().trim().max(200).nullable().optional(),
  observations: z.string().trim().max(1000).nullable().optional(),
});
const patchSchema = z.object({ id: z.string().trim().min(1), action: z.literal("annul"), reason: z.string().trim().min(3).max(500) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("saldos") === "1") {
      return NextResponse.json({ saldos: await ForestCtpDB.saldos(auth.tenantId) });
    }
    const s = url.searchParams.get("section");
    const section = s && (CTP_SECTIONS as readonly string[]).includes(s) ? (s as (typeof CTP_SECTIONS)[number]) : undefined;
    const { entries, total } = await ForestCtpDB.list(auth.tenantId, {
      section,
      search: url.searchParams.get("search") ?? undefined,
      includeAnnulled: url.searchParams.get("includeAnnulled") === "1",
    });
    return NextResponse.json({ entries, total });
  } catch (err) {
    logger.error("[ctp.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    const entry = await ForestCtpDB.create(auth.tenantId, { ...parsed.data, createdBy: auth.username ?? "unknown" });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    logger.error("[ctp.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({ entry: await ForestCtpDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason) });
  } catch (err) {
    logger.error("[ctp.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await ForestCtpDB.softDelete(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[ctp.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
