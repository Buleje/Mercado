import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RecetasDB } from "@/lib/db/recetas.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

const ProducirSchema = z.object({
  cantidad: z.number().int().positive(),
  notas: z.string().max(1000).optional(),
});

// POST /api/recetas/[id]/producir — register production batch, deduct ingredient stock
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "recetas-X-producir"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const raw = await req.json();
    const parsed = ProducirSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const receta = await RecetasDB.getById(auth.tenantId, id);
    if (!receta) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }
    if (!receta.activa) {
      return NextResponse.json({ error: "La receta está desactivada" }, { status: 422 });
    }

    // Deduct ingredient stock in a transaction
     
    const costoReal = await prisma.$transaction(async (tx) => {
      let totalCosto = 0;

      for (const ing of receta.ingredientes) {
        const cantidadNecesaria = ing.cantidad * parsed.data.cantidad;

        // CRITICAL FIX 2026-05-11 (audit P0 CRIT-2): scope tenantId al
        // findUnique y al update. Antes un admin podía crear receta apuntando
        // a productoId de otro tenant y al "producir" decrementaba stock
        // ajeno (DoS de inventario competidor). El POST/PATCH de recetas
        // también valida ownership ahora.
        const producto = await tx.product.findFirst({
          where: { id: ing.productoId, tenantId: auth.tenantId, deletedAt: null },
        });
        if (!producto) {
          throw new Error(`Producto ${ing.productoId} no encontrado`);
        }

        const prevStock = producto.stock ?? 0;
        if (prevStock < cantidadNecesaria) {
          throw new Error(
            `Stock insuficiente para "${producto.name}": necesita ${cantidadNecesaria}, tiene ${prevStock}`,
          );
        }

        const newStock = prevStock - cantidadNecesaria;
        await tx.product.updateMany({
          where: { id: ing.productoId, tenantId: auth.tenantId },
          data: { stock: newStock },
        });

        // Record inventory movement
        await tx.inventoryMovement.create({
          data: {
            tenantId: auth.tenantId,
            productId: ing.productoId,
            type: "produccion",
            quantity: -cantidadNecesaria,
            previousStock: prevStock,
            newStock,
            reference: id,
            notes: `Producción de "${receta.nombre}" x${parsed.data.cantidad}`,
            createdBy: auth.username,
          },
        });

        // TD-018: costPrice y price son Decimal
        totalCosto += (toNumOrZero(producto.costPrice) || toNumOrZero(producto.price)) * cantidadNecesaria;
      }

      return totalCosto;
    });

    // Register the production batch
    const lote = await RecetasDB.registrarProduccion({
      tenantId: auth.tenantId,
      recetaId: id,
      cantidad: parsed.data.cantidad,
      costoReal,
      notas: parsed.data.notas,
    });

    // If receta is linked to a product, increment its stock
    if (receta.productoId) {
      // SECURITY 2026-05-05 (audit cross-tenant #high): scope tenantId.
      // Antes si receta.productoId apuntaba a producto de otro tenant
      // (configuración corrupta), incrementaba stock ajeno.
       
      const prod = await prisma.product.findFirst({
        where: { id: receta.productoId, tenantId: auth.tenantId },
      });
      if (prod) {
        const prevStock = prod.stock ?? 0;
        const newStock = prevStock + parsed.data.cantidad;
         
        await prisma.product.updateMany({
          where: { id: receta.productoId, tenantId: auth.tenantId },
          data: { stock: newStock },
        });
         
        await prisma.inventoryMovement.create({
          data: {
            tenantId: auth.tenantId,
            productId: receta.productoId,
            type: "produccion",
            quantity: parsed.data.cantidad,
            previousStock: prevStock,
            newStock,
            reference: lote.id,
            notes: `Producción de "${receta.nombre}" — ingreso de producto terminado`,
            createdBy: auth.username,
          },
        });
      }
    }

    logActivity(
      "Producir", "receta",
      `Producción de "${receta.nombre}" x${parsed.data.cantidad} — costo real: S/${costoReal.toFixed(2)}`,
      lote.id, auth.username,
    ).catch((err) => logger.error("[recetas] activity log failed", { err: String(err) }));

    return NextResponse.json(lote, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Stock errors are client-visible
    if (msg.includes("Stock insuficiente") || msg.includes("no encontrado")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    logger.error("[recetas/id/producir] POST error", { err: msg });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
