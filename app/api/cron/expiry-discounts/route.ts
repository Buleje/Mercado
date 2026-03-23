export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { BatchesDB } from "@/lib/db/batches.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";

const DESCUENTO_VENCIMIENTO = 0.20; // 20%
const DIAS_ALERTA = 15;

/**
 * GET /api/cron/expiry-discounts
 *
 * Busca lotes que vencen en los próximos 15 días y sugiere
 * aplicar un descuento del 20% en cada producto afectado.
 *
 * Sugerencia vercel.json: "0 7 * * *" (07:00 cada día)
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("expiry-discounts", async () => {
      const now = new Date();

      // Obtener todos los tenants activos
      const tenants = await prisma.tenant.findMany({
        where: { active: true },
        select: { id: true, slug: true },
      });

      const sugerencias: Array<{
        tenantId: string;
        tenantSlug: string;
        productoNombre: string;
        productoId: number | null;
        lote: string;
        cantidad: number;
        unidad: string;
        fechaVencimiento: string;
        diasRestantes: number;
        precioOriginal: number | null;
        precioSugerido: number | null;
      }> = [];

      for (const tenant of tenants) {
        const lotesPorVencer = await BatchesDB.getExpiring(tenant.id, DIAS_ALERTA);

        for (const lote of lotesPorVencer) {
          const expiry = new Date(lote.expiryDate);
          const diasRestantes = Math.ceil(
            (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Buscar precio actual del producto si está vinculado
          let precioOriginal: number | null = null;
          let precioSugerido: number | null = null;

          if (lote.productId) {
            const producto = await prisma.product.findUnique({
              where: { id: lote.productId },
              select: { price: true },
            });
            if (producto) {
              precioOriginal = producto.price;
              precioSugerido = Math.round(
                producto.price * (1 - DESCUENTO_VENCIMIENTO) * 100
              ) / 100;
            }
          }

          sugerencias.push({
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            productoNombre: lote.productName,
            productoId: lote.productId ?? null,
            lote: lote.lote,
            cantidad: lote.quantity,
            unidad: lote.unit,
            fechaVencimiento: lote.expiryDate,
            diasRestantes,
            precioOriginal,
            precioSugerido,
          });
        }
      }

      logger.info("[cron/expiry-discounts] Sugerencias de descuento por vencimiento", {
        total: sugerencias.length,
        tenants: tenants.length,
      });

      if (sugerencias.length > 0) {
        logActivity(
          "expiry-discounts",
          "Batch",
          `${sugerencias.length} lote(s) próximos a vencer (${DIAS_ALERTA} días) — descuento ${DESCUENTO_VENCIMIENTO * 100}% sugerido`,
          undefined,
          "cron"
        ).catch(() => {});
      }

      return {
        ok: true,
        descuento: `${DESCUENTO_VENCIMIENTO * 100}%`,
        diasAlerta: DIAS_ALERTA,
        total: sugerencias.length,
        sugerencias,
        generadoA: now.toISOString(),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/expiry-discounts] Fatal error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
