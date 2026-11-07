import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applyRateLimitWithTenant } from "@/lib/rate-limit";
import { tenantIdPublico } from "@/lib/resolve-tenant";
import {
  calcularDescuentoAutomatico,
  sesionDelTelefono,
  vistaPublica,
} from "@/lib/pricing/descuento-automatico";
import { logger } from "@/lib/logger";

/**
 * GET /api/orders/cotizar?telefono=&subtotal=&unidades= — público (la tienda
 * lo llama antes de confirmar; GET bajo /api/orders no pide sesión).
 *
 * Devuelve el descuento automático que `POST /api/orders` va a restar,
 * calculado con la MISMA función (`calcularDescuentoAutomatico`). La pantalla
 * lo muestra como línea y lo resta de su vista previa; el POST vuelve a
 * calcular todo con precios de la DB.
 *
 * REGLA DE PRIVACIDAD (Ley 29733, security 2026-10-08). Antes, con solo un
 * teléfono, cualquiera sabía en qué tramo de compras estaba un cliente
 * (0 / 1-4 / 5-19 / 20-49 / 50+). Ahora:
 *  - el historial del teléfono se usa SOLO con la sesión VERIFICADA de ese
 *    teléfono (mismo criterio que `GET /api/orders?phone=`); el token que
 *    deja un pedido de invitado no cuenta;
 *  - sin esa sesión, solo cuenta el descuento por volumen (no depende de la
 *    persona), igual que el POST (`DESCUENTO_PERSONAL_AL_INVITADO`);
 *  - la respuesta nunca trae `motivo` (solo monto, porcentaje y rótulo);
 *  - 10 cotizaciones cada 15 min por IP y negocio (STRICT) y un tope por negocio;
 *  - un negocio inexistente o dado de baja no cotiza (`tenantIdPublico`).
 */
const QuerySchema = z.object({
  telefono: z.string().trim().max(20).optional(),
  subtotal: z.coerce.number().finite().min(0).max(1_000_000),
  unidades: z.coerce.number().int().min(1).max(10_000),
});

/** Por negocio: holgado para una tienda con mucho tráfico, corta un barrido. */
const TOPE_POR_NEGOCIO = { maxReqs: 3_000, windowSec: 10 * 60 };

export async function GET(req: NextRequest) {
  // Sin caer a "main": sin tienda activa no hay cotización.
  const tenantId = await tenantIdPublico(req.headers.get("x-tenant-id"));
  if (!tenantId) {
    return NextResponse.json({ error: "Tienda no identificada" }, { status: 404 });
  }

  // Bucket por IP + negocio (10 / 15 min) y otro por negocio (independiente
  // de la IP). El checkout pide una cotización por cambio de carrito con
  // debounce; si se agota, el POST responde 422 con el total y el checkout
  // reintenta con ese (useCheckoutSubmit).
  const limitado = applyRateLimitWithTenant(
    req,
    "STRICT", // 10 por IP en 15 min
    tenantId,
    `orders-cotizar:${tenantId}`,
    TOPE_POR_NEGOCIO,
  );
  if (limitado) return limitado;

  const sp = req.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    telefono: sp.get("telefono") || undefined,
    subtotal: sp.get("subtotal"),
    unidades: sp.get("unidades"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const conHistorial = await sesionDelTelefono(req, parsed.data.telefono);
    const descuento = await calcularDescuentoAutomatico(tenantId, {
      subtotal: parsed.data.subtotal,
      unidades: parsed.data.unidades,
      telefono: conHistorial ? parsed.data.telefono : null,
      conHistorial,
    });
    return NextResponse.json(
      { descuentoAutomatico: vistaPublica(descuento) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    logger.error("[orders/cotizar] falló", { tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo cotizar" }, { status: 500 });
  }
}
