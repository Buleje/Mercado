import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { ProductsDB, type FilaPrecioLote } from "@/lib/db/products.db";
import { invalidate } from "@/lib/cache";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/comandos-ia/precios/deshacer {reciboId} — vuelve los precios
 * de un recibo `comando-ia:precios` a su `antes`.
 *
 * Sólo toca la fila que sigue EXACTAMENTE como la dejó el comando (`despues`):
 * si alguien la cambió después, gana ese cambio y se informa. Un recibo se
 * deshace una vez (`comando-ia:precios-deshecho` con `entityId = reciboId`);
 * dos clics a la vez: el segundo espera el candado, encuentra los precios ya
 * vueltos y no escribe nada.
 */

const Body = z.object({ reciboId: z.string().trim().min(1).max(64) });
const PrecioCosto = z.object({ productId: z.number().int().positive(), precio: z.number(), costo: z.number().nullable() });
const Detalle = z.object({
  resumen: z.string().max(400).optional(),
  antes: z.array(PrecioCosto).max(500),
  despues: z.array(PrecioCosto).max(500),
});

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comandos-ia-precios-deshacer");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { reciboId } = parsed.data;

  try {
    const { logs } = await ActivityLogDB.listPaginated(auth.tenantId, { action: "comando-ia:precios", limit: 200 });
    const recibo = logs.find((l) => l.id === reciboId);
    if (!recibo) return NextResponse.json({ error: "No encontré ese cambio de precios" }, { status: 404 });

    const previos = await ActivityLogDB.list(auth.tenantId, { entity: "comando-ia", entityId: reciboId, limit: 20 });
    if (previos.some((p) => p.action === "comando-ia:precios-deshecho")) {
      return NextResponse.json({ error: "ya-deshecho", mensaje: "Ese cambio ya se deshizo." }, { status: 409 });
    }

    let crudo: unknown = null;
    try {
      crudo = JSON.parse(recibo.detail);
    } catch {
      crudo = null;
    }
    const detalle = Detalle.safeParse(crudo);
    if (!detalle.success) return NextResponse.json({ error: "El recibo no trae los precios de antes" }, { status: 422 });

    const antesPorId = new Map(detalle.data.antes.map((a) => [a.productId, a]));
    const filas: FilaPrecioLote[] = detalle.data.despues.flatMap((d) => {
      const a = antesPorId.get(d.productId);
      return a ? [{ productId: d.productId, precioEsperado: d.precio, costoEsperado: d.costo, precioNuevo: a.precio, costoNuevo: a.costo }] : [];
    });
    const resumen = `Deshice: ${detalle.data.resumen ?? "cambio de precios"}`.slice(0, 200);

    const r = await ProductsDB.aplicarPreciosEnLote(auth.tenantId, filas, {
      parcial: true,
      recibo: { action: "comando-ia:precios-deshecho", entityId: reciboId, user: auth.username, detalle: { tipo: "precios-deshecho", resumen } },
    });

    const nombres = new Map((await ProductsDB.getAll(auth.tenantId)).map((p) => [p.id, p.name]));
    const noDeshechas = r.rechazadas.map((x) => ({ ...x, nombre: nombres.get(x.productId) ?? `#${x.productId}` }));
    if (!r.reciboId) {
      return NextResponse.json(
        { error: "nada-que-deshacer", mensaje: "Todos esos precios cambiaron después: no toqué ninguno.", noDeshechas },
        { status: 409 },
      );
    }
    invalidate(`dashboard:${auth.tenantId}`);
    invalidateAdminCache.afterProduct(auth.tenantId);
    return NextResponse.json({ deshechas: r.aplicadas.length, noDeshechas, reciboId: r.reciboId });
  } catch (e) {
    logger.error("[comandos-ia/precios/deshacer]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pude deshacer el cambio" }, { status: 500 });
  }
}
