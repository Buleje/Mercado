import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestCorridaCompraDB } from "@/lib/db/forest-corrida-compra.db";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";

/**
 * /api/admin/forestal/ctp/corrida-compra — «Corrida con su compra» (ADR-485).
 *
 *   GET  ?ctpEntryId=…          → { propuesta }  de qué ingreso(s) sale la madera
 *                                 que a la corrida le falta atribuir (FIFO, misma
 *                                 especie, llegada ≤ corrida, con saldo). No escribe.
 *   POST { ctpEntryId, firma }  → { propuesta, costo }  confirma la propuesta que
 *                                 se vio; el servidor la recalcula y escribe por
 *                                 `setConsumos` (I1, I2, mes cerrado, congelado).
 *
 * Roles: los de «Editar atribución» (PUT /ctp/consumos). Corrida de otro tenant
 * = 404, igual que una que no existe.
 */
const ROLES = ["admin", "almacenero", "owner"] as const;
const getSchema = z.object({ ctpEntryId: z.string().trim().min(1).max(64) });
const postSchema = z.object({
  ctpEntryId: z.string().trim().min(1).max(64),
  firma: z.string().min(1).max(8000),
});

/** La sesión, o la respuesta con la que cortar (401/403/429). */
async function guard(req: NextRequest): Promise<Exclude<Awaited<ReturnType<typeof requireAdmin>>, NextResponse> | Response> {
  const auth = await requireAdmin(req, [...ROLES]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }
  return auth;
}

const noExiste = () => NextResponse.json({ error: "not_found", message: "Esa corrida no existe en este negocio." }, { status: 404 });

export const GET = withApiHandler("forestal-ctp-corrida-compra-get", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof Response) return auth;
  const q = getSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return ctpValidationResponse(q.error);
  try {
    const propuesta = await ForestCorridaCompraDB.propuesta(auth.tenantId, q.data.ctpEntryId);
    return propuesta ? NextResponse.json({ propuesta }) : noExiste();
  } catch (err) {
    return ctpErrorResponse(err, "ctp-corrida-compra.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-ctp-corrida-compra-post", async (req: NextRequest) => {
  const auth = await guard(req);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    const r = await ForestCorridaCompraDB.ligar(auth.tenantId, parsed.data.ctpEntryId, parsed.data.firma, auth.username ?? "unknown");
    return r ? NextResponse.json(r) : noExiste();
  } catch (err) {
    return ctpErrorResponse(err, "ctp-corrida-compra.POST", auth.tenantId);
  }
});
