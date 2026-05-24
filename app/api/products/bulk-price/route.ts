import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const PatchItemSchema = z.object({
  productId: z.number().int().positive(),
  newPrice: z.number().positive(),
  newCostPrice: z.number().positive().optional(),
});

const PatchSchema = z.object({
  updates: z.array(PatchItemSchema).min(1).max(500),
});

// PATCH — Actualizar precios individuales masivamente (con historial)
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-bulk-price"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { updates } = parsed.data;
    const failed: { productId: number; error: string }[] = [];

    // PERF 2026-05-24: antes era N+1 (findFirst + update + priceHistory.create
    // por item dentro de un for, hasta 500 items = ~1500 queries seriales).
    // Ahora: 1 findMany para ownership + ops en batch dentro de 1 transacción.
    const ids = updates.map((u) => u.productId);
    const existing = await prisma.product.findMany({
      where: { id: { in: ids }, tenantId: auth.tenantId },
      select: { id: true, price: true },
    });
    const priceById = new Map(existing.map((p) => [p.id, toNumOrZero(p.price)]));

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let updated = 0;

    for (const u of updates) {
      const oldPrice = priceById.get(u.productId);
      if (oldPrice === undefined) {
        // No existe en el tenant del solicitante (ownership) → no se toca.
        failed.push({ productId: u.productId, error: "Producto no encontrado" });
        continue;
      }
      ops.push(
        prisma.product.update({
          where: { id: u.productId },
          data: {
            price: u.newPrice,
            ...(u.newCostPrice !== undefined ? { costPrice: u.newCostPrice } : {}),
          },
        }),
      );
      if (oldPrice !== u.newPrice) {
        ops.push(
          prisma.priceHistory.create({
            data: {
              tenantId: auth.tenantId,
              productId: u.productId,
              oldPrice,
              newPrice: u.newPrice,
            },
          }),
        );
      }
      updated++;
    }

    if (ops.length > 0) {
      await prisma.$transaction(ops);
      // Invalidar el cache de getAll (productos cambiaron de precio).
      revalidateTag(`tenant:${auth.tenantId}:products`, "max");
    }

    return NextResponse.json({ updated, failed });
  } catch (e) {
    logger.error("[bulk-price/PATCH]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al actualizar precios" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "products-bulk-price"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { tenantId } = auth;
    const body = await req.json();
    const { percentage, category } = body;

    if (typeof percentage !== "number" || percentage === 0) {
      return NextResponse.json({ error: "Porcentaje inválido" }, { status: 400 });
    }
    if (Math.abs(percentage) > 100) {
      return NextResponse.json({ error: "Porcentaje máximo: ±100%" }, { status: 400 });
    }

    const where: Record<string, unknown> = { tenantId, active: true };
    if (category && category !== "all" && category !== "") {
      where.category = category;
    }

    const products = await prisma.product.findMany({
      where,
      select: { id: true, price: true, name: true },
    });

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron productos", updated: 0 },
        { status: 404 },
      );
    }

    const multiplier = 1 + percentage / 100;
    // TD-018: p.price es Decimal
    const updates = products.map((p) =>
      prisma.product.update({
        where: { id: p.id },
        data: { price: Math.round(toNumOrZero(p.price) * multiplier * 100) / 100 },
      }),
    );

    await prisma.$transaction(updates);
    revalidateTag(`tenant:${tenantId}:products`, "max");

    return NextResponse.json({
      updated: products.length,
      percentage,
      category: category || "all",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bulk-price] PUT error", { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
