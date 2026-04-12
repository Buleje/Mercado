import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { toNumOrZero } from "@/lib/decimal-utils";

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
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { updates } = parsed.data;
    let updated = 0;
    const failed: { productId: number; error: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        try {
          const product = await tx.product.findFirst({
            where: { id: u.productId, tenantId: auth.tenantId },
            select: { id: true, price: true, costPrice: true },
          });

          if (!product) {
            failed.push({ productId: u.productId, error: "Producto no encontrado" });
            continue;
          }

          // TD-018: product.price es Decimal
          const oldPrice = toNumOrZero(product.price);

          await tx.product.update({
            where: { id: u.productId },
            data: {
              price: u.newPrice,
              ...(u.newCostPrice !== undefined ? { costPrice: u.newCostPrice } : {}),
            },
          });

          if (oldPrice !== u.newPrice) {
            await tx.priceHistory.create({
              data: {
                tenantId: auth.tenantId,
                productId: u.productId,
                oldPrice,
                newPrice: u.newPrice,
              },
            });
          }

          updated++;
        } catch (err) {
          failed.push({ productId: u.productId, error: String(err) });
        }
      }
    });

    return NextResponse.json({ updated, failed });
  } catch (e) {
    console.error("[bulk-price/PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar precios" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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

    return NextResponse.json({
      updated: products.length,
      percentage,
      category: category || "all",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bulk-price] PUT error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
