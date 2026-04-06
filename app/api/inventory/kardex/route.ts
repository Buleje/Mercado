export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// GET /api/inventory/kardex?productId=123&from=2026-01-01&to=2026-12-31
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const productIdRaw = searchParams.get("productId");
    if (!productIdRaw) {
      return NextResponse.json({ error: "productId es requerido" }, { status: 400 });
    }
    const productId = parseInt(productIdRaw, 10);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "productId debe ser un número" }, { status: 400 });
    }

    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }

    // Get product info
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId: auth.tenantId },
      select: { id: true, name: true, unit: true, stock: true, costPrice: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // Get movements
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        productId,
        tenantId: auth.tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // Calculate running balance
    let saldo = 0;
    const ENTRY_TYPES = new Set(["compra", "devolucion", "ajuste_positivo"]);

    const movimientos = movements.map((m) => {
      const isEntry = ENTRY_TYPES.has(m.type);
      const entrada = isEntry ? m.quantity : 0;
      const salida = isEntry ? 0 : m.quantity;
      saldo = saldo + entrada - salida;

      return {
        id: m.id,
        fecha: m.createdAt.toISOString(),
        tipo: m.type,
        cantidad: m.quantity,
        entrada,
        salida,
        saldo,
        referencia: m.reference ?? "",
        usuario: (m as unknown as { createdBy?: string }).createdBy ?? "",
        notas: m.notes ?? "",
      };
    });

    return NextResponse.json({
      producto: product,
      movimientos,
      resumen: {
        totalEntradas: movimientos.reduce((s, m) => s + m.entrada, 0),
        totalSalidas: movimientos.reduce((s, m) => s + m.salida, 0),
        saldoFinal: saldo,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[inventory/kardex] GET error", { error: msg });
    return NextResponse.json({ error: "Error al consultar kardex" }, { status: 500 });
  }
}
