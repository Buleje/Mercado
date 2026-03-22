export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PurchasesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";

const PatchSchema = z.object({
  status: z.enum(["pendiente", "recibido", "cancelado"]).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const po = await PurchasesDB.getById(id);
    if (!po) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    return NextResponse.json(po);
  } catch (e) {
    console.error("[purchases/id] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json();
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const existing = await PurchasesDB.getById(id);
    if (!existing) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    const statusChanged = parsed.data.status && parsed.data.status !== existing.status;
    const updated = await PurchasesDB.update(id, parsed.data);

    if (!updated) return NextResponse.json({ error: "Error updating" }, { status: 500 });

    if (statusChanged && updated.status === "recibido") {
      try {
        await prisma.$transaction(async (tx) => {
          for (const item of updated.items) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (!product) continue;
            
            const prevStock = product.stock ?? 0;
            const newStock = prevStock + item.quantity;
            
            let avgCost = item.unitCost;
            if (prevStock > 0) {
              const oldVal = prevStock * (product.costPrice ?? 0);
              const newVal = item.quantity * item.unitCost;
              avgCost = (oldVal + newVal) / newStock;
            }

            // Update Product
            await tx.product.update({ 
               where: { id: product.id }, 
               data: { stock: newStock, costPrice: avgCost } 
            });

            // Insert Movement atomicly
            await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                type: "compra",
                quantity: item.quantity,
                previousStock: prevStock,
                newStock: newStock,
                reference: updated.id,
                notes: `Recepción de OC ${updated.id}`,
                createdBy: auth.username,
              }
            });
          }
        });
      } catch (err) {
        console.error("Transaction failed:", err);
        return NextResponse.json({ error: "Fallo de transacción al actualizar stock" }, { status: 500 });
      }
    }

    if (statusChanged) {
       logActivity("Actualizar", "compra", `Estado de orden ${id.slice(-6)} cambiado a ${updated.status}`, id, auth.username).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("[purchases/id] PATCH error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await PurchasesDB.delete(id);
    logActivity("Eliminar", "compra", `Orden de compra ${id.slice(-6)} eliminada`, id, auth.username).catch(() => {});
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[purchases/id] DELETE error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
