export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { checkPlanLimit } from "@/lib/check-plan-limit";
import { logger } from "@/lib/logger";

const ItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  price: z.number().positive(),
  costPrice: z.number().min(0).optional(),
  unit: z.string().max(20).default("unidad"),
  barcode: z.string().max(50).optional(),
  stock: z.number().int().min(0).default(0),
  stockMin: z.number().int().min(0).optional(),
});

const ImportSchema = z.object({
  items: z.array(ItemSchema).min(1).max(200),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = ImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { items } = parsed.data;
    const tenantId = auth.tenantId;

    // Verificar limite de plan
    const blocked = await checkPlanLimit(tenantId, "products");
    if (blocked) return blocked;

    // Obtener barcodes existentes para evitar duplicados
    const existingBarcodes = new Set(
      (await prisma.product.findMany({
        where: { tenantId, barcode: { not: null } },
        select: { barcode: true },
      })).map((p) => p.barcode).filter(Boolean),
    );

    // Obtener nombres existentes para evitar duplicados
    const existingNames = new Set(
      (await prisma.product.findMany({
        where: { tenantId },
        select: { name: true },
      })).map((p) => p.name.toLowerCase()),
    );

    let created = 0;
    let skipped = 0;
    const errors: { name: string; reason: string }[] = [];

    for (const item of items) {
      // Verificar duplicado por barcode
      if (item.barcode && existingBarcodes.has(item.barcode)) {
        skipped++;
        continue;
      }

      // Verificar duplicado por nombre
      if (existingNames.has(item.name.toLowerCase())) {
        skipped++;
        continue;
      }

      try {
        await prisma.product.create({
          data: {
            tenantId,
            name: item.name,
            category: item.category,
            price: item.price,
            costPrice: item.costPrice,
            unit: item.unit,
            barcode: item.barcode,
            stock: item.stock,
            stockMin: item.stockMin,
            active: true,
          },
        });
        created++;
        existingNames.add(item.name.toLowerCase());
        if (item.barcode) existingBarcodes.add(item.barcode);
      } catch (e) {
        errors.push({ name: item.name, reason: (e as Error).message?.slice(0, 100) ?? "Error desconocido" });
      }
    }

    logger.info("[catalog-import] Importacion completada", { tenantId, created, skipped, errors: errors.length });

    return NextResponse.json({ created, skipped, errors, total: items.length });
  } catch (e) {
    logger.error("[catalog-import] Error", { err: (e as Error).message });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
