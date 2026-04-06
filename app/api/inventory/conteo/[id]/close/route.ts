export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

// POST — Cerrar conteo y aplicar ajustes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const conteo = await prisma.conteoFisico.findFirst({
      where: { id, tenantId: auth.tenantId },
      include: { items: true },
    });

    if (!conteo) {
      return NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 });
    }
    if (conteo.status === "CERRADO") {
      return NextResponse.json({ error: "El conteo ya está cerrado" }, { status: 400 });
    }

    const contados = conteo.items.filter(i => i.stockContado !== null);
    const conDiferencia = contados.filter(i => i.diferencia !== null && i.diferencia !== 0);
    const aAjustar = conDiferencia.filter(i => i.ajustado);

    // Apply adjustments in a transaction
    await prisma.$transaction(async (tx) => {
      for (const item of aAjustar) {
        if (item.stockContado === null || item.diferencia === null) continue;

        // Update product stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: item.stockContado },
        });

        // Create inventory movement for the adjustment
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: item.diferencia > 0 ? "ajuste_positivo" : "ajuste_negativo",
            quantity: Math.abs(item.diferencia),
            previousStock: item.stockSistema,
            newStock: item.stockContado,
            reference: `Conteo-${id.slice(0, 8)}`,
            notes: `Conteo físico: sistema=${item.stockSistema}, contado=${item.stockContado}`,
            createdBy: auth.username,
            tenantId: auth.tenantId,
          },
        });
      }

      // Close the conteo
      await tx.conteoFisico.update({
        where: { id },
        data: {
          status: "CERRADO",
          fechaCierre: new Date(),
        },
      });
    });

    return NextResponse.json({
      message: "Conteo cerrado exitosamente",
      resumen: {
        totalItems: conteo.items.length,
        contados: contados.length,
        conDiferencia: conDiferencia.length,
        ajustados: aAjustar.length,
      },
    });
  } catch (e) {
    console.error("[conteo/close/POST]", e);
    return NextResponse.json({ error: "Error al cerrar conteo" }, { status: 500 });
  }
}
