import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { AcomodarTrozasDB, AlcanceNoEncontrado, type AlcanceAcomodo } from "@/lib/db/acomodar-trozas.db";

/**
 * «Acomodar trozas en su especie» (ADR-435).
 *
 *  GET  ?woodEntryId=… | ?contratoId=… | ?todas=1 → la VISTA PREVIA: qué troza
 *       pasa de qué fila a cuál, qué no se mueve y por qué, y el cuadre de cada
 *       fila (trozas vs piezas declaradas, m³ de trozas vs m³ declarado).
 *  POST { woodEntryId | contratoId | todas, movimientos? } → aplica. `movimientos`
 *       (troza → fila de destino) son
 *       las que el operador vio: lo que apareció después no se mueve sin verse.
 *
 * El `tenantId` sale SIEMPRE de la sesión: un `woodEntryId` de otro negocio da
 * 404 (la guía no existe en tu libro) y un `contratoId` ajeno, un plan vacío.
 */

const id = z.string().trim().min(1).max(64);

const alcanceQuery = z
  .object({
    woodEntryId: id.optional(),
    contratoId: id.optional(),
    todas: z.enum(["1", "true"]).optional(),
  })
  .refine((q) => [q.woodEntryId, q.contratoId, q.todas].filter(Boolean).length === 1, {
    message: "Elige UNA: la guía (woodEntryId), el permiso (contratoId) o todas.",
  });

const alcanceBody = z
  .object({
    woodEntryId: id.optional(),
    contratoId: id.optional(),
    todas: z.literal(true).optional(),
    /**
     * Lo que se vio en la vista previa: cada troza con la fila a la que iba.
     * Si el destino de una cambió, no se mueve nada. Tope holgado: Blas entero
     * son 46 trozas.
     */
    movimientos: z.array(z.object({ trozaId: id, haciaId: id })).max(5000).optional(),
  })
  .refine((q) => [q.woodEntryId, q.contratoId, q.todas].filter(Boolean).length === 1, {
    message: "Elige UNA: la guía (woodEntryId), el permiso (contratoId) o todas.",
  });

const aAlcance = (q: { woodEntryId?: string; contratoId?: string; todas?: unknown }): AlcanceAcomodo =>
  q.woodEntryId ? { woodEntryId: q.woodEntryId } : q.contratoId ? { contratoId: q.contratoId } : { todas: true };

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-acomodar-trozas-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const q = alcanceQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) {
    return NextResponse.json({ error: "validation_error", issues: q.error.issues }, { status: 400 });
  }
  try {
    const plan = await AcomodarTrozasDB.planear(auth.tenantId, aAlcance(q.data));
    return NextResponse.json({ plan });
  } catch (err) {
    if (err instanceof AlcanceNoEncontrado) return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    return ctpErrorResponse(err, "acomodar-trozas.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-acomodar-trozas-post", async (req: NextRequest) => {
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
  const b = alcanceBody.safeParse(body);
  if (!b.success) {
    return NextResponse.json({ error: "validation_error", issues: b.error.issues }, { status: 400 });
  }
  try {
    const r = await AcomodarTrozasDB.aplicar(auth.tenantId, aAlcance(b.data), auth.username ?? "unknown", {
      movimientos: b.data.movimientos,
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof AlcanceNoEncontrado) return NextResponse.json({ error: "not_found", message: err.message }, { status: 404 });
    return ctpErrorResponse(err, "acomodar-trozas.POST", auth.tenantId);
  }
});
