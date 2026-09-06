import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLoteDB } from "@/lib/db/forest-lote.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/lotes/detalle — ficha + miembros de un lote (ADR-136).
 *
 *   GET ?id=…                → { lote, trazabilidad }
 *   PUT { loteId, miembros } → reemplaza los miembros (valida L1; sólo si abierto)
 *
 * Guard: spec:forestal:lotes · rate-limit GENEROUS bucket 'ctp'.
 */

const putSchema = z.object({
  loteId: z.string().trim().min(1),
  miembros: z
    .array(
      z.object({
        produccionEntryId: z.string().trim().min(1),
        quantity: z.coerce.number().positive().max(9999999),
      }),
    )
    .max(50),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:lotes");
  return ok
    ? null
    : NextResponse.json({ error: "specialization_disabled", message: "El módulo Lotes no está habilitado para este tenant." }, { status: 403 });
}

export const GET = withApiHandler("forestal-lotes-detalle-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  try {
    const [lote, trazabilidad] = await Promise.all([
      ForestLoteDB.get(auth.tenantId, id),
      ForestLoteDB.trazabilidadLote(auth.tenantId, id),
    ]);
    if (!lote) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // La cadena completa (ADR-315) viaja con el detalle: es una lectura más,
    // pero el modal la necesita siempre y pedirla aparte duplicaría el round-trip.
    const cadena = (await ForestLoteDB.cadenaDeLote(auth.tenantId, id))?.cadena ?? null;
    return NextResponse.json({ lote, trazabilidad, cadena });
  } catch (err) {
    return ctpErrorResponse(err, "lotes-detalle.GET", auth.tenantId);
  }
});

export const PUT = withApiHandler("forestal-lotes-detalle-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);

  try {
    const miembros = await ForestLoteDB.setMiembros(auth.tenantId, parsed.data.loteId, parsed.data.miembros, auth.username ?? "unknown");
    const trazabilidad = await ForestLoteDB.trazabilidadLote(auth.tenantId, parsed.data.loteId);
    return NextResponse.json({ miembros, trazabilidad });
  } catch (err) {
    return ctpErrorResponse(err, "lotes-detalle.PUT", auth.tenantId);
  }
});
