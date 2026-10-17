import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { ForestLothGuiaPermisoDB } from "@/lib/db/forest-loth-guia-permiso.db";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * /api/admin/forestal/loth/guia-permiso — asignarle el permiso a una guía que
 * salió sin él (15-10: las trozas anotadas a mano en «Despachar con guía»).
 *
 *   GET  ?gtfId&planId     → la vista previa: por especie, lo que trae la guía
 *                            contra lo autorizado de ese permiso (T7 + T6,
 *                            `ForestLothGuiaPermisoDB.saldo`). Sólo lee.
 *   GET  ?trozasAManoDe=id → las trozas anotadas a mano que anular la guía anula
 *                            con ella (`trozasAManoQueAnula`), para el modal de anular.
 *   POST { gtfId, planId } → ata la guía, sus despachos y los trozados sin plan
 *                            de sus trozas (`ForestLothGuiaPermisoDB.asignar`).
 *                            Re-chequea T7/T6 en la transacción: 422 con el
 *                            mismo mensaje del despacho si no entra.
 *
 * Cambia el saldo de un permiso: sólo admin/dueño (como «atar líneas sin permiso»).
 * Las lecturas, los mismos roles que leen el despacho con guía.
 */

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "El identificador no es válido.");
const postSchema = z.object({
  gtfId: id,
  planId: z.string().trim().min(1, "Elige el permiso de la guía.").max(64).regex(/^[A-Za-z0-9_-]+$/, "El permiso no es válido."),
});

const getSchema = z.union([
  z.object({ gtfId: id, planId: id }),
  z.object({ trozasAManoDe: id }),
]);

export const GET = withApiHandler("forestal-loth-guia-permiso-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  const parsed = getSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    if ("trozasAManoDe" in parsed.data) {
      const r = await ForestLothGuiaPermisoDB.trozasAManoQueAnula(auth.tenantId, parsed.data.trozasAManoDe);
      if (!r) return NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });
      return NextResponse.json(r);
    }
    const r = await ForestLothGuiaPermisoDB.saldo(auth.tenantId, parsed.data.gtfId, parsed.data.planId);
    if (!r) return NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });
    return NextResponse.json(r);
  } catch (err) {
    return lothErrorResponse(err, "loth.guia-permiso.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-loth-guia-permiso-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "asignarle el permiso a una guía");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    const r = await ForestLothGuiaPermisoDB.asignar(auth.tenantId, parsed.data.gtfId, parsed.data.planId, auth.username ?? "unknown");
    if (!r) return NextResponse.json({ error: "not_found", message: "No encontramos esa guía." }, { status: 404 });
    return NextResponse.json(r);
  } catch (err) {
    return lothErrorResponse(err, "loth.guia-permiso.POST", auth.tenantId);
  }
});
