export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

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
    const updates = products.map((p) =>
      prisma.product.update({
        where: { id: p.id },
        data: { price: Math.round(p.price * multiplier * 100) / 100 },
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
