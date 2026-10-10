import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { revalidateTenantTag } from "@/lib/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { prisma } from "@/lib/prisma";
import { GoodsReceiptsDB } from "@/lib/db/goods-receipts.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { getRecibidoAcumulado, estaCompleta } from "@/lib/compras/recibido-acumulado";
import { costoUnitarioReal } from "@/lib/compras/totales-oc";
import { calcularCreditoRecepcion } from "@/lib/compras/credito-recepcion";
import {
  aplicarCreditoRecepcion, anotarCreditoEnItems, getFaltantesAcreditados, SIN_CREDITO, type ResultadoCredito,
} from "@/lib/compras/aplicar-credito-recepcion";
import { logAudit } from "@/lib/audit-logger";
import { BatchesDB } from "@/lib/db/batches.db";
import { armarLoteDeRecepcion, errorDeVencimiento, pideLote, type LoteDeRecepcion } from "@/lib/compras/lotes-recepcion";

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
  // 09-10: «vence» de lo que llegó (YYYY-MM-DD) y el lote del proveedor. Con
  // fecha, lo que entra a stock vendible nace como lote y alimenta las
  // alertas de vencimiento y los descuentos por vencer.
  expiryDate: z.string().trim().max(10).optional(),
  lote: z.string().trim().max(60).optional(),
}).superRefine((item, ctx) => {
  // Solo se valida si va a nacer un lote: en una línea dañada o vencida la
  // fecha no se usa, y ahí una fecha pasada es justamente lo esperable.
  if (!pideLote(item)) return;
  const problema = errorDeVencimiento(item.expiryDate ?? "");
  if (problema) ctx.addIssue({ code: "custom", path: ["expiryDate"], message: `${item.product}: ${problema}` });
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
  // La columna `notes` existe en `GoodsReceipt` y la DB class ya la escribe,
  // pero el schema no la aceptaba: lo que el usuario anotaba sobre la
  // recepción lo descartaba Zod en silencio.
  notes: z.string().max(1000).optional(),
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
  // Paridad del bloqueo por plan en todo el módulo Compras (ADR-084):
  // recepcionar mercadería mueve stock y costos, igual que crear la OC.
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const tenantId = auth.tenantId;

  try {
    const raw = await req.json();
    const parsed = RecepcionSchema.safeParse(raw);
    if (!parsed.success) {
      // La fecha de vencimiento se explica sola: el modal muestra `error`, y
      // «Datos inválidos» no le decía al encargado qué línea corregir.
      const vence = parsed.error.issues.find((i) => i.path.at(-1) === "expiryDate");
      return NextResponse.json(
        { error: vence?.message ?? "Datos invalidos", issues: parsed.error.issues.map((i) => i.message) },
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
      notes: data.notes ?? null,
    });

    // 2. Best-effort: si hay OC vinculada, actualizar stock (costo promedio
    //    ponderado) + estado de la OC. Se mapea cada item recibido a su
    //    productId buscando por NOMBRE dentro de los items de la OC. Va en
    //    try/catch aparte: un fallo acá NO revierte la recepción ya guardada.
    let stockUpdated = 0;
    /** Unidades que llegaron dañadas o vencidas: se registran, no se venden. */
    let noAptos = 0;
    /** Lo que llegó mal o no llegó, descontado de la cuenta por pagar o reclamado. */
    let credito: ResultadoCredito = SIN_CREDITO;
    /** Lotes con vencimiento que nacieron de esta recepción. */
    let lotesAnotados = 0;
    if (data.orderRef) {
      try {
        const oc = await prisma.purchaseOrder.findFirst({
          where: { id: data.orderRef, tenantId },
          include: { items: true },
        });
        if (oc) {
          const norm = (s: string) => s.trim().toLowerCase();
          await prisma.$transaction(async (tx) => {
            // 2026-08-11: el veredicto parcial/recibido se calcula sobre lo
            // ACUMULADO de todas las recepciones de la OC. Antes comparaba
            // cada tanda contra el total (`4 < 10` → parcial), así que una
            // compra recibida en dos viajes quedaba parcial para siempre y
            // había que cerrarla con el <select> — que duplicaba el stock.
            const ocItemRefs = oc.items.map((i) => ({ productId: i.productId, name: i.name }));
            const recibidoTotal = await getRecibidoAcumulado(tx, tenantId, oc.id, ocItemRefs, receipt.id);
            // ADR-377: flete + otros costos, repartidos por valor entre items.
            const subtotalOrden = oc.items.reduce((s, i) => s + i.quantity * Number(i.unitCost ?? 0), 0);
            const sobrecostos = Number(oc.flete ?? 0) + Number(oc.otrosCostos ?? 0);

            const lotes: LoteDeRecepcion[] = [];
            for (const [indice, item] of data.items.entries()) {
              // Preferir match por productId exacto; caer a nombre si no vino.
              const ocItem = item.productId != null
                ? oc.items.find((i) => i.productId === item.productId)
                : oc.items.find((i) => norm(i.name) === norm(item.product));
              if (!ocItem) continue;
              if (item.receivedQty <= 0) continue;

              recibidoTotal.set(
                ocItem.productId,
                (recibidoTotal.get(ocItem.productId) ?? 0) + item.receivedQty,
              );

              const product = await tx.product.findFirst({ where: { id: ocItem.productId, tenantId } });
              if (!product) continue;

              const previousStock = product.stock ?? 0;

              /**
               * Lo dañado y lo vencido NO entra a stock vendible.
               *
               * El endpoint aceptaba `condition` desde el primer día y después
               * sumaba `receivedQty` al stock sin mirarla: marcar «Dañado» en
               * Recepción servía de acta, pero la mercadería quedaba lista para
               * venderse igual. Sigue contando como recibida frente al
               * proveedor (se anotó arriba en `recibidoTotal`): llegó, y hay
               * que reclamarla. Queda como merma, que es donde se mira lo que
               * se perdió.
               */
              if (item.condition === "dañado" || item.condition === "vencido") {
                await tx.inventoryMovement.create({
                  data: {
                    productId: ocItem.productId, type: "merma", quantity: item.receivedQty,
                    previousStock, newStock: previousStock, reference: `OC-${oc.id}`,
                    notes: `Recepción ${ref}: ${item.receivedQty} ${item.condition}${item.notes ? ` · ${item.notes}` : ""} — no entró a stock vendible`,
                    tenantId, createdBy: auth.username,
                  },
                });
                noAptos += item.receivedQty;
                continue;
              }
              // ADR-377: el costo autorizado incluye la parte de flete que le
              // toca a esta línea. Sin eso el costo promedio del producto
              // ignora lo que costó traerlo.
              const authorizedUnitCost = costoUnitarioReal(ocItem, subtotalOrden, sobrecostos);
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
              // Con «vence», lo que acaba de entrar nace como lote. El stock ya
              // se sumó arriba: el lote no lo vuelve a sumar, lo describe.
              const lote = armarLoteDeRecepcion({
                indice, item, ref,
                productId: ocItem.productId,
                productName: product.name,
                productCategory: product.category,
                unit: ocItem.unit || product.unit,
                costUnit: authorizedUnitCost,
                supplierId: oc.supplierId || null,
                supplierName: oc.supplierName || data.supplier,
              });
              if (lote) lotes.push(lote);
            }
            if (lotes.length > 0) {
              lotesAnotados = await BatchesDB.crearDesdeRecepcionTx(tx, tenantId, receipt.id, lotes);
              await BatchesDB.propagarVenceTx(tx, tenantId, lotes.map((l) => l.productId));
            }
            // 09-10: lo dañado, vencido o faltante no se le paga al proveedor.
            // Antes la merma quedaba registrada y la cuenta seguía por el
            // total pedido. Va en esta misma transacción: stock y plata juntos.
            const lineasOc = oc.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost }));
            const faltantesPrevios = await getFaltantesAcreditados(tx, tenantId, oc.id, lineasOc, receipt.id);
            const calculo = calcularCreditoRecepcion({
              ocItems: lineasOc,
              totalOc: oc.total,
              items: data.items,
              recibidoTotal,
              faltantesYaAcreditados: faltantesPrevios,
            });
            if (calculo.total > 0) {
              credito = await aplicarCreditoRecepcion(tx, tenantId, {
                purchaseOrderId: oc.id, supplierId: oc.supplierId || null, supplierName: oc.supplierName || data.supplier, ref, credito: calculo,
              });
              // Anotado por línea en la recepción: así un segundo viaje no
              // vuelve a acreditar el mismo faltante.
              await tx.goodsReceipt.updateMany({
                where: { id: receipt.id, tenantId },
                data: { itemsJson: anotarCreditoEnItems(data.items, calculo) },
              });
            }
            // Lo que se acreditó como faltante ya no va a llegar: cuenta como
            // cerrado para el veredicto. Sin esto la OC quedaba «parcial» para
            // siempre esperando unidades que el proveedor no va a mandar.
            const cerrado = new Map(recibidoTotal);
            for (const [pid, n] of faltantesPrevios) cerrado.set(pid, (cerrado.get(pid) ?? 0) + n);
            for (const l of calculo.lineas) if (l.motivo === "faltante") cerrado.set(l.productId, (cerrado.get(l.productId) ?? 0) + l.unidades);
            const allComplete = estaCompleta(oc.items, cerrado);
            await tx.purchaseOrder.update({
              where: { id: oc.id },
              data: {
                status: (allComplete ? "recibido" : "parcial") as never,
                // ADR-377: quién recibió y cuándo llegó de verdad. Este camino
                // no lo anotaba, así que la orden cerrada por el botón
                // "Recibir" no decía nada de su recepción.
                ...(allComplete ? { receivedDate: new Date(), receivedBy: auth.username } : {}),
                notes: `${oc.notes ? oc.notes + " | " : ""}Recepción ${ref}${data.invoiceUrl ? ` · Factura: ${data.invoiceUrl}` : ""}`,
              },
            });
            // Una recepción de 30 líneas son ~100 consultas en serie: con el
            // corte por defecto de Prisma (5 s) se revertía entera y el stock
            // no entraba (revisión 09-10).
          }, { timeout: 20_000, maxWait: 5_000 });
        }
      } catch (stockErr) {
        // La transacción se revirtió entera: ni stock, ni crédito, ni lotes.
        // Sin el 0 la respuesta decía «stock actualizado» de algo revertido.
        stockUpdated = 0;
        credito = SIN_CREDITO;
        lotesAnotados = 0;
        logger.warn("[compras/recepciones] actualización de stock falló (recepción sí guardada)", {
          ref, err: stockErr instanceof Error ? stockErr.message : String(stockErr),
        });
      }
    }

    // El stock se escribe acá con `tx.product.update`, salteando ProductsDB, que
    // es quien normalmente invalida. Sin esto, `ProductsDB.getAll` sigue
    // sirviendo su cache de 5 minutos: el encargado recibe 10 unidades, entra a
    // Inventario y ve el stock viejo — el riesgo real es que crea que no entró y
    // recepcione de nuevo, ahora sí duplicando. Lo encontró el e2e del ciclo
    // completo (la recepción informaba stockUpdated:1 y el panel seguía en 0).
    if (stockUpdated > 0) {
      revalidateTenantTag(tenantId, "products");
    }
    if (lotesAnotados > 0) BatchesDB.invalidarVencimientos(tenantId);
    if (credito.total > 0) {
      // La cuenta se tocó con `tx.payable`, salteando PayablesDB (tag `payables`).
      // `expire: 0` y no `"max"`: con «max» el próximo GET todavía sirve la
      // cuenta vieja (medido 09-10: la base decía S/ 40 y la lista S/ 140).
      try { revalidateTag(`tenant:${tenantId}:payables`, { expire: 0 }); } catch { /* fuera de request */ }
      logAudit({
        req, tenantId, user: auth.username, action: "UPDATE", entity: "Purchase", entityId: data.orderRef,
        detail: `Recepción ${ref} (${credito.detalle}): −S/${credito.descontado.toFixed(2)} de la cuenta ${credito.payableId ?? "(sin cuenta)"}, S/${credito.aFavor.toFixed(2)} a favor`,
      });
    }

    return NextResponse.json({ ...toReception(receipt), stockUpdated, noAptos, credito, lotes: lotesAnotados }, { status: 201 });
  } catch (e) {
    logger.error("[compras/recepciones] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error procesando recepcion" }, { status: 500 });
  }
}
