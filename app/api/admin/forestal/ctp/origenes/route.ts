import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/ctp/origenes — de qué corridas salió un despacho (ADR-135).
 * Espejo de `/ctp/consumos`, del otro lado de la cadena.
 *
 *   GET  ?despachoEntryId=…          → { origenes, trazabilidad }
 *   PUT  { despachoEntryId, origenes } → reemplaza la atribución (valida I4/I5)
 *
 * `trazabilidad` responde si la cadena está completa (ADR-135 D3): el libro
 * admite huecos, el certificado no — este endpoint informa, no bloquea.
 *
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'.
 * Invariantes violadas → 422 con el motivo, no 500.
 */

const putSchema = z.object({
  despachoEntryId: z.string().trim().min(1),
  origenes: z
    .array(
      z.object({
        produccionEntryId: z.string().trim().min(1),
        quantity: z.coerce.number().positive().max(9999999),
      }),
    )
    .max(50),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-ctp-origenes-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const despachoEntryId = new URL(req.url).searchParams.get("despachoEntryId");
  if (!despachoEntryId) return NextResponse.json({ error: "despachoEntryId_required" }, { status: 400 });

  try {
    const [origenes, trazabilidad] = await Promise.all([
      ForestCtpDespachoDB.listByDespacho(auth.tenantId, despachoEntryId),
      ForestCtpDespachoDB.trazabilidadCompleta(auth.tenantId, despachoEntryId),
    ]);
    return NextResponse.json({ origenes, trazabilidad });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-origenes.GET", auth.tenantId);
  }
});

export const PUT = withApiHandler("forestal-ctp-origenes-put", async (req: NextRequest) => {
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
    const origenes = await ForestCtpDespachoDB.setOrigenes(
      auth.tenantId,
      parsed.data.despachoEntryId,
      parsed.data.origenes,
      auth.username ?? "unknown",
    );
    const trazabilidad = await ForestCtpDespachoDB.trazabilidadCompleta(
      auth.tenantId,
      parsed.data.despachoEntryId,
    );
    return NextResponse.json({ origenes, trazabilidad });
  } catch (err) {
    return ctpErrorResponse(err, "ctp-origenes.PUT", auth.tenantId);
  }
});
