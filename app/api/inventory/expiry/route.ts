import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

// GET — Returns batches grouped by expiry urgency: expired, 7d, 30d
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const sevenDays = new Date(now);
    sevenDays.setDate(sevenDays.getDate() + 7);

    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    // Fetch all batches with quantity > 0 and expiryDate within 30 days or already expired
    const batches = await withDbRetry(() => prisma.batch.findMany({
      where: {
        tenantId,
        quantity: { gt: 0 },
        expiryDate: { lte: thirtyDays },
      },
      include: {
        product: {
          select: { id: true, name: true, price: true, category: true },
        },
        warehouse: {
          select: { id: true, name: true },
        },
      },
      orderBy: { expiryDate: "asc" },
    }));

    const expired: typeof batches = [];
    const expiresThisWeek: typeof batches = [];
    const expiresThisMonth: typeof batches = [];

    for (const batch of batches) {
      const expiryTime = new Date(batch.expiryDate);
      expiryTime.setHours(0, 0, 0, 0);

      if (expiryTime < now) {
        expired.push(batch);
      } else if (expiryTime <= sevenDays) {
        expiresThisWeek.push(batch);
      } else {
        expiresThisMonth.push(batch);
      }
    }

    const mapBatch = (b: (typeof batches)[number]) => {
      const expiryDate = new Date(b.expiryDate);
      expiryDate.setHours(0, 0, 0, 0);
      const diffMs = expiryDate.getTime() - now.getTime();
      const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
        id: b.id,
        lote: b.lote,
        productName: b.product?.name ?? b.productName,
        productId: b.productId,
        productCategory: b.product?.category ?? b.productCategory,
        quantity: b.quantity,
        unit: b.unit,
        expiryDate: b.expiryDate.toISOString(),
        entryDate: b.entryDate.toISOString(),
        costUnit: b.costUnit,
        salePrice: b.product?.price ?? 0,
        warehouseName: b.warehouse?.name ?? null,
        daysUntilExpiry,
        valorRiesgo: b.quantity * b.costUnit,
      };
    };

    const expiredMapped = expired.map(mapBatch);
    const weekMapped = expiresThisWeek.map(mapBatch);
    const monthMapped = expiresThisMonth.map(mapBatch);

    const valorExpired = expiredMapped.reduce((s, b) => s + b.valorRiesgo, 0);
    const valorWeek = weekMapped.reduce((s, b) => s + b.valorRiesgo, 0);
    const valorMonth = monthMapped.reduce((s, b) => s + b.valorRiesgo, 0);

    return NextResponse.json({
      expired: expiredMapped,
      expiresThisWeek: weekMapped,
      expiresThisMonth: monthMapped,
      summary: {
        expiredCount: expiredMapped.length,
        weekCount: weekMapped.length,
        monthCount: monthMapped.length,
        totalAtRisk: expiredMapped.length + weekMapped.length + monthMapped.length,
        valorExpired: Math.round(valorExpired * 100) / 100,
        valorWeek: Math.round(valorWeek * 100) / 100,
        valorMonth: Math.round(valorMonth * 100) / 100,
        valorTotalRiesgo: Math.round((valorExpired + valorWeek + valorMonth) * 100) / 100,
      },
    });
  } catch (e) {
    console.error("[inventory/expiry/GET]", e);
    return NextResponse.json(
      { error: "Error al obtener datos de vencimiento" },
      { status: 500 },
    );
  }
}

// PATCH — Batch actions: liquidar (mark for discount) or dar de baja (mark as loss)
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { batchId, action } = body as { batchId: string; action: "liquidar" | "baja" };

    if (!batchId || !["liquidar", "baja"].includes(action)) {
      return NextResponse.json(
        { error: "Se requiere batchId y action (liquidar | baja)" },
        { status: 400 },
      );
    }

    const batch = await prisma.batch.findFirst({
      where: { id: batchId, tenantId: auth.tenantId },
    });

    if (!batch) {
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }

    if (action === "baja") {
      // Set quantity to 0 (write off)
      await prisma.batch.update({
        where: { id: batchId },
        data: {
          quantity: 0,
          notes: `${batch.notes} | BAJA: ${new Date().toISOString().slice(0, 10)} por ${auth.username}`.trim(),
        },
      });

      return NextResponse.json({ ok: true, action: "baja", batchId });
    }

    if (action === "liquidar") {
      // Mark in notes as "LIQUIDACION" — the product price discount is handled separately
      await prisma.batch.update({
        where: { id: batchId },
        data: {
          notes: `${batch.notes} | LIQUIDACION: ${new Date().toISOString().slice(0, 10)} por ${auth.username}`.trim(),
        },
      });

      return NextResponse.json({ ok: true, action: "liquidar", batchId });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    console.error("[inventory/expiry/PATCH]", e);
    return NextResponse.json(
      { error: "Error al procesar la acción" },
      { status: 500 },
    );
  }
}
