export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// GET — Lista items del conteo con info del producto
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const conteo = await prisma.conteoFisico.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!conteo) {
      return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
    }

    const items = await prisma.conteoFisicoItem.findMany({
      where: { conteoId: id },
      orderBy: { id: "asc" },
    });

    // Fetch product details for each item
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, barcode: true, category: true, image: true, stock: true },
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const enriched = items.map(item => {
      const prod = productMap.get(item.productId);
      return {
        ...item,
        product: prod ?? null,
      };
    });

    return NextResponse.json({
      conteoId: id,
      status: conteo.status,
      items: enriched,
      total: items.length,
      contados: items.filter(i => i.stockContado !== null).length,
    });
  } catch (e) {
    console.error("[conteo/items/GET]", e);
    return NextResponse.json({ error: "Error al obtener items" }, { status: 500 });
  }
}

const PatchSchema = z.object({
  itemId: z.string().min(1),
  stockContado: z.number().int().min(0),
});

// PATCH — Actualizar stockContado de un item
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { itemId, stockContado } = parsed.data;

    // Verify ownership
    const conteo = await prisma.conteoFisico.findFirst({
      where: { id, tenantId: auth.tenantId },
    });
    if (!conteo) {
      return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
    }
    if (conteo.status === "CERRADO") {
      return NextResponse.json({ error: "El conteo ya está cerrado" }, { status: 400 });
    }

    const item = await prisma.conteoFisicoItem.findFirst({
      where: { id: itemId, conteoId: id },
    });
    if (!item) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    const diferencia = stockContado - item.stockSistema;

    const updated = await prisma.conteoFisicoItem.update({
      where: { id: itemId },
      data: {
        stockContado,
        diferencia,
        ajustado: diferencia !== 0, // default to adjusting if there's a difference
      },
    });

    // Update conteo status to EN_PROGRESO if needed
    if (conteo.status === "INICIADO") {
      await prisma.conteoFisico.update({
        where: { id },
        data: { status: "EN_PROGRESO" },
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[conteo/items/PATCH]", e);
    return NextResponse.json({ error: "Error al actualizar item" }, { status: 500 });
  }
}
