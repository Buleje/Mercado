import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ProductsDB } from "@/lib/db/products.db";
import { invalidate } from "@/lib/cache";
import { invalidateAdminCache } from "@/lib/admin-cache";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/comandos-ia/precios/aplicar — aplica la diferencia que el
 * usuario vio y confirmó (Comandos IA › Precios en bloque).
 *
 * Cada fila lleva lo que se vio (`precioEsperado`/`costoEsperado`): si algo
 * cambió desde la vista previa, NO se escribe nada y vuelve 409 con esas
 * filas. Todo pasa en `ProductsDB.aplicarPreciosEnLote` (una transacción:
 * candado, precios, PriceHistory y el recibo `comando-ia:precios` que el
 * Deshacer necesita).
 */

const Monto = z.number().finite().min(0).max(10_000_000);
const Fila = z.object({
  productId: z.number().int().positive(),
  precioEsperado: Monto,
  costoEsperado: Monto.nullable(),
  precioNuevo: Monto.positive(),
  costoNuevo: Monto.positive().optional(),
});
const Body = z.object({
  filas: z
    .array(Fila)
    .min(1)
    .max(500)
    .refine((f) => new Set(f.map((x) => x.productId)).size === f.length, "Producto repetido"),
  resumen: z.string().trim().min(1).max(200),
  costoIaUsd: z.number().min(0).max(5).optional(),
});

/** Más de ×10 o menos de ÷10 en un clic es un error de tipeo (24,90 → 2490), no una orden. */
const SALTO_MAXIMO = 10;
const salta = (antes: number | null, despues: number | undefined) =>
  antes != null && antes > 0 && despues != null && (despues / antes > SALTO_MAXIMO || antes / despues > SALTO_MAXIMO);

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "comandos-ia-precios-aplicar");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  const { filas, resumen, costoIaUsd = 0 } = parsed.data;

  // El costo también: «Leche 2,805» leído como 805 subiría el precio por «mantener margen».
  const saltos = filas.filter((f) => salta(f.precioEsperado, f.precioNuevo) || salta(f.costoEsperado, f.costoNuevo));
  if (saltos.length) {
    return NextResponse.json(
      { error: "salto", mensaje: "Un precio o costo cambia más de 10 veces: revisa si es un error de tipeo.", productIds: saltos.map((f) => f.productId) },
      { status: 400 },
    );
  }

  try {
    const r = await ProductsDB.aplicarPreciosEnLote(auth.tenantId, filas, {
      recibo: { action: "comando-ia:precios", entityId: null, user: auth.username, detalle: { tipo: "precios", resumen, costoIaUsd } },
    });
    if (r.rechazadas.length) {
      return NextResponse.json(
        { error: "cambio", mensaje: "Cambió desde la vista previa: no apliqué nada.", rechazadas: r.rechazadas },
        { status: 409 },
      );
    }
    if (r.reciboId) {
      invalidate(`dashboard:${auth.tenantId}`);
      invalidateAdminCache.afterProduct(auth.tenantId);
    }
    return NextResponse.json({ aplicadas: r.aplicadas.length, rechazadas: [], reciboId: r.reciboId });
  } catch (e) {
    logger.error("[comandos-ia/precios/aplicar]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pude cambiar los precios" }, { status: 500 });
  }
}
