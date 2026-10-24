/**
 * POST /api/sales/precio-cliente — vista previa del precio de la clienta en el
 * cobro del POS (ADR-507 en la caja, 20-10).
 *
 * Body: `{ customerPhone, items: [{ productId, quantity }] }`.
 * Responde `{ aplica: false, motivo: "general" }` si no es revendedora de este
 * negocio, o la cotización de la caja (`PrecioRevendedoraCaja`): nivel, total,
 * precio por producto y avisos. Es sólo para MOSTRAR: lo que se cobra lo
 * vuelve a calcular `POST /api/sales` con la misma función
 * (`RevendedorasDB.cotizarEnCaja`).
 *
 * Roles: los mismos que cobran (`RUTAS_PANEL["/api/sales"]`, incluye cajero:
 * `/api/admin/revendedoras` es sólo de gestión). Sin sesión, 401.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { RevendedorasDB } from "@/lib/db/revendedoras.db";
import { LISTA_REVENDEDORA } from "@/lib/revendedoras/reglas";
import type { PrecioDeCliente } from "@/lib/pos/precio-revendedora";

const BodySchema = z.object({
  customerPhone: z.string().trim().min(1).max(20),
  items: z
    .array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive().max(100_000) }))
    .min(1)
    .max(200),
});

const GENERAL: PrecioDeCliente = { aplica: false, motivo: "general" };

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, RUTAS_PANEL["/api/sales"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", `sales-precio-cliente:${auth.tenantId}:${auth.username}`);
  if (rl) return rl;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { customerPhone, items } = parsed.data;
  try {
    const clienta = await RevendedorasDB.clientaDeLaCaja(auth.tenantId, customerPhone);
    if (!clienta || clienta.listaPrecio !== LISTA_REVENDEDORA) return NextResponse.json(GENERAL);
    const precio = await RevendedorasDB.cotizarEnCaja(auth.tenantId, clienta.id, items);
    return NextResponse.json(precio ?? GENERAL);
  } catch (err) {
    logger.error("[sales/precio-cliente] cotización falló", { err: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo calcular el precio de la clienta" }, { status: 503 });
  }
}
