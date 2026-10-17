import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLoteDB, LOTE_STATUSES, type LoteStatus } from "@/lib/db/forest-lote.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/lotes — Lotes de producción / comercialización (ADR-136).
 *
 *   GET  ?stats=1                    → { stats }
 *   GET  ?available=1&excludeLoteId= → { items }  corridas con saldo para empaquetar
 *   GET  ?status=&search=            → { lotes }
 *   POST { productType, ..., miembros[] } → crea el lote (correlativo L-YYYY-NNN, valida L1)
 *   PATCH { id, action: "status"|"anular"|"delete", status?, reason? }
 *
 * Guard: spec:forestal:lotes · rate-limit GENEROUS bucket 'ctp'.
 * Invariantes violadas → 422 con el motivo, no 500.
 */

const miembroSchema = z.object({
  produccionEntryId: z.string().trim().min(1),
  quantity: z.coerce.number().positive().max(9999999),
});

const createSchema = z.object({
  productType: z.string().trim().max(80).nullable().optional(),
  speciesCommon: z.string().trim().max(120).nullable().optional(),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  unit: z.enum(["m3", "kg", "unidad", "pt"]).nullable().optional(),
  grade: z.string().trim().max(60).nullable().optional(),
  destino: z.string().trim().max(200).nullable().optional(),
  // Ventana de trabajo (ADR-327). Fecha date-only: el libro trabaja por día.
  fechaInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  fechaFin: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  titularId: z.string().trim().max(60).nullish(),
  titularNombre: z.string().trim().max(200).nullish(),
  notes: z.string().trim().max(1000).nullable().optional(),
  miembros: z.array(miembroSchema).max(50).optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: z.string().trim().min(1), status: z.enum(["abierto", "cerrado", "despachado"]) }),
  z.object({ action: z.literal("anular"), id: z.string().trim().min(1), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1) }),
]);

function periodFromUrl(url: URL): { fromDate?: Date; toDate?: Date } {
  const dateParam = z.coerce.date();
  const read = (key: string) => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const parsed = dateParam.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };
  return { fromDate: read("from"), toDate: read("to") };
}

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:lotes");
  return ok
    ? null
    : NextResponse.json({ error: "specialization_disabled", message: "El módulo Lotes no está habilitado para este tenant." }, { status: 403 });
}

export const GET = withApiHandler("forestal-lotes-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  const period = periodFromUrl(url);
  try {
    if (url.searchParams.get("stats") === "1") {
      return NextResponse.json({ stats: await ForestLoteDB.stats(auth.tenantId, period) });
    }
    if (url.searchParams.get("available") === "1") {
      return NextResponse.json({
        items: await ForestLoteDB.availableCorridas(auth.tenantId, {
          excludeLoteId: url.searchParams.get("excludeLoteId") ?? undefined,
        }),
      });
    }
    const statusRaw = url.searchParams.get("status");
    const status = statusRaw && (LOTE_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as LoteStatus) : undefined;
    const lotes = await ForestLoteDB.list(auth.tenantId, {
      status,
      search: url.searchParams.get("search") ?? undefined,
      ...period,
    });
    return NextResponse.json({ lotes });
  } catch (err) {
    return ctpErrorResponse(err, "lotes.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-lotes-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);

  try {
    const lote = await ForestLoteDB.create(
      auth.tenantId,
      {
        ...parsed.data,
        // Date-only → medianoche UTC, como el resto del libro (si no, a las
        // 19:00 de Lima la fecha se guardaría con el día siguiente).
        fechaInicio: parsed.data.fechaInicio ? new Date(`${parsed.data.fechaInicio}T00:00:00.000Z`) : null,
        fechaFin: parsed.data.fechaFin ? new Date(`${parsed.data.fechaFin}T00:00:00.000Z`) : null,
        createdBy: auth.username ?? "unknown",
      },
      new Date(),
    );
    return NextResponse.json({ lote });
  } catch (err) {
    return ctpErrorResponse(err, "lotes.POST", auth.tenantId);
  }
});

export const PATCH = withApiHandler("forestal-lotes-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);

  const user = auth.username ?? "unknown";
  try {
    if (parsed.data.action === "delete") {
      await ForestLoteDB.softDelete(auth.tenantId, parsed.data.id, user);
      return NextResponse.json({ ok: true });
    }
    if (parsed.data.action === "anular") {
      const lote = await ForestLoteDB.updateStatus(auth.tenantId, parsed.data.id, "anulado", user, parsed.data.reason);
      return NextResponse.json({ lote });
    }
    const lote = await ForestLoteDB.updateStatus(auth.tenantId, parsed.data.id, parsed.data.status, user);
    return NextResponse.json({ lote });
  } catch (err) {
    return ctpErrorResponse(err, "lotes.PATCH", auth.tenantId);
  }
});
