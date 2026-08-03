import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { GoodsReceiptsDB } from "@/lib/db/goods-receipts.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// Item del checklist tal como lo arma ReceivingTab. `productId` es opcional: si
// el item se eligió del combobox o vino prefilleado de la OC, trae el id real
// (matching de stock EXACTO); si es texto libre, se cae al matching por nombre.
const RecepcionItemSchema = z.object({
  product: z.string().min(1),
  productId: z.number().int().positive().optional(),
  expectedQty: z.number().nonnegative().default(0),
  receivedQty: z.number().nonnegative().default(0),
  condition: z.enum(["ok", "dañado", "vencido", "faltante"]).default("ok"),
  notes: z.string().max(500).default(""),
});

const RecepcionSchema = z.object({
  // `orderRef` = id de la OC vinculada (opcional: puede ser recepción libre).
  orderRef: z.string().max(120).optional().default(""),
  supplier: z.string().min(1).max(160),
  inspector: z.string().max(120).optional().default(""),
  scheduledDate: z.string().optional(),
  status: z.enum(["programada", "en-proceso", "aceptada", "parcial", "rechazada"]).optional(),
  items: z.array(RecepcionItemSchema).min(1),
  photos: z.number().int().nonnegative().optional().default(0),
  nonConformities: z.number().int().nonnegative().optional().default(0),
  invoiceUrl: z.string().url().max(2048).optional(),
});

// Mapea un registro GoodsReceipt al shape `Reception` que espera ReceivingTab.
function toReception(r: Awaited<ReturnType<typeof GoodsReceiptsDB.list>>[number]) {
  return {
    id: r.id,
    ref: r.ref,
    orderRef: r.purchaseOrderId ?? "",
    supplier: r.supplierName,
    scheduledDate: r.scheduledDate ? r.scheduledDate.toISOString().slice(0, 10) : "",
    receivedDate: r.receivedDate ? r.receivedDate.toISOString() : undefined,
    status: r.status,
    inspector: r.inspector ?? "",
    items: Array.isArray(r.itemsJson) ? r.itemsJson : [],
    photos: r.photos,
    nonConformities: r.nonConformities,
    invoiceUrl: r.invoiceUrl ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const receipts = await GoodsReceiptsDB.list(auth.tenantId);
    return NextResponse.json(receipts.map(toReception));
  } catch (e) {
    logger.error("[compras/recepciones] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al listar recepciones" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compras-recepciones"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    const raw = await req.json();
    const parsed = RecepcionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // 1. Persistir la recepción SIEMPRE (es el registro de auditoría). El
    //    ref legible se deriva de un id aleatorio para no depender de Date.now
    //    (Cache Components) ni de contadores.
    const ref = `REC-${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const scheduledDate = data.scheduledDate ? new Date(data.scheduledDate) : null;
    const receipt = await GoodsReceiptsDB.create(tenantId, {
      ref,
      purchaseOrderId: data.orderRef || null,
      supplierName: data.supplier,
      status: data.status ?? "en-proceso",
      inspector: data.inspector || null,
      scheduledDate: scheduledDate && !Number.isNaN(scheduledDate.getTime()) ? scheduledDate : null,
      receivedDate: new Date(),
      items: data.items,
      photos: data.photos,
      nonConformities: data.nonConformities,
      invoiceUrl: data.invoiceUrl ?? null,
    });

    // 2. Best-effort: si hay OC vinculada, actualizar stock (costo promedio
    //    ponderado) + estado de la OC. Se mapea cada item recibido a su
    //    productId buscando por NOMBRE dentro de los items de la OC. Va en
    //    try/catch aparte: un fallo acá NO revierte la recepción ya guardada.
    let stockUpdated = 0;
    if (data.orderRef) {
      try {
        const oc = await prisma.purchaseOrder.findFirst({
          where: { id: data.orderRef, tenantId },
          include: { items: true },
        });
        if (oc) {
          const norm = (s: string) => s.trim().toLowerCase();
          await prisma.$transaction(async (tx) => {
            let allComplete = true;
            for (const item of data.items) {
              // Preferir match por productId exacto; caer a nombre si no vino.
              const ocItem = item.productId != null
                ? oc.items.find((i) => i.productId === item.productId)
                : oc.items.find((i) => norm(i.name) === norm(item.product));
              if (!ocItem) continue;
              if (item.receivedQty <= 0) {
                if (ocItem.quantity > 0) allComplete = false;
                continue;
              }
              if (item.receivedQty < ocItem.quantity) allComplete = false;

              const product = await tx.product.findFirst({ where: { id: ocItem.productId, tenantId } });
              if (!product) continue;

              const previousStock = product.stock ?? 0;
              const authorizedUnitCost = Number(ocItem.unitCost ?? 0);
              const currentCost = Number(product.costPrice ?? 0);
              const totalQty = previousStock + item.receivedQty;
              const weightedAvgCost =
                totalQty > 0 ? (previousStock * currentCost + item.receivedQty * authorizedUnitCost) / totalQty : authorizedUnitCost;
              const newStock = previousStock + item.receivedQty;

              await tx.product.update({
                where: { id: ocItem.productId },
                data: { stock: newStock, costPrice: authorizedUnitCost > 0 ? weightedAvgCost : undefined },
              });
              await tx.inventoryMovement.create({
                data: {
                  productId: ocItem.productId, type: "compra", quantity: item.receivedQty,
                  previousStock, newStock, reference: `OC-${oc.id}`,
                  notes: item.notes || `Recepción ${ref}`, tenantId, createdBy: auth.username,
                },
              });
              stockUpdated++;
            }
            await tx.purchaseOrder.update({
              where: { id: oc.id },
              data: {
                status: (allComplete ? "recibido" : "parcial") as never,
                notes: `${oc.notes ? oc.notes + " | " : ""}Recepción ${ref}${data.invoiceUrl ? ` · Factura: ${data.invoiceUrl}` : ""}`,
              },
            });
          });
        }
      } catch (stockErr) {
        logger.warn("[compras/recepciones] actualización de stock falló (recepción sí guardada)", {
          ref, err: stockErr instanceof Error ? stockErr.message : String(stockErr),
        });
      }
    }

    return NextResponse.json({ ...toReception(receipt), stockUpdated }, { status: 201 });
  } catch (e) {
    logger.error("[compras/recepciones] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error procesando recepcion" }, { status: 500 });
  }
}
