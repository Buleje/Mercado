import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SalesDB, InventoryMovementsDB, CashRegistersDB, LoyaltyDB } from "@/lib/jsondb";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";

const SaleItemSchema = z.object({
  productId: z.number().int().positive(),
  price: z.number().nonnegative(),
  quantity: z.number().positive(),
  name: z.string().max(200),
  unit: z.string().max(50).default(""),
});

const SaleSchema = z.object({
  items: z.array(SaleItemSchema).min(1, "at least one item required"),
  payment: z.enum(["efectivo", "yape", "plin", "tarjeta", "MIXTO", "fiado"]).optional().default("efectivo"),
  amountPaid: z.number().nonnegative().optional(),
  customerPhone: z.string().max(20).optional(),
  paymentDetails: z.string().optional(),
  // Mejora 1: Tipo de comprobante
  comprobanteTipo: z.enum(["ticket", "boleta", "factura", "cotizacion", "proforma"]).optional().default("ticket"),
  comprobanteRuc: z.string().max(11).optional(),
  // Mejora 4: Descuento global
  descuentoMonto: z.number().nonnegative().optional(),
  descuentoPorcentaje: z.number().nonnegative().optional(),
}).strip(); // Strip unknown fields (e.g. _offlineId from offline queue)

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const pageParam = searchParams.get("page");

    let data = await withDbRetry(() => SalesDB.getAll(auth.tenantId));
    const total = data.length;

    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 1000);
      const page = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      data = data.slice(start, start + limit);

      return NextResponse.json(data, {
        headers: {
          "X-Total-Count": String(total),
          "X-Page": String(page),
          "X-Limit": String(limit),
        },
      });
    }

    return NextResponse.json(data, {
      headers: { "X-Total-Count": String(total) },
    });
  } catch (e) {
    console.error("[sales] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = SaleSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const total = data.items.reduce((s, i) => s + i.price * i.quantity, 0);

  // Look up costPrice for each product to capture COGS at sale time
  // TD-018: product.costPrice / price son Decimal
  const pIds = data.items.map(i => i.productId);
  const costMap = new Map<number, number>();
  if (pIds.length > 0) {
    const prods = await prisma.product.findMany({ where: { id: { in: pIds } }, select: { id: true, costPrice: true, price: true } });
    for (const p of prods) {
      const costNum = toNumOrZero(p.costPrice);
      const priceNum = toNumOrZero(p.price);
      costMap.set(p.id, costNum || priceNum * 0.7);
    }
  }
  const itemsWithCost = data.items.map(i => ({ ...i, costPrice: costMap.get(i.productId) }));
  const totalCogs = itemsWithCost.reduce((s, i) => s + (i.costPrice ?? i.price * 0.7) * i.quantity, 0);

  // Apply global discount to total
  const discountAmount = data.descuentoMonto ?? 0;
  const finalTotal = Math.max(0, total - discountAmount);

  // Validate customerPhone: only set it if the customer actually exists in DB
  // (the Sale.customerPhone is a FK → Customer.phone; passing an unknown phone throws a FK error)
  let resolvedCustomerPhone: string | undefined = undefined;
  if (data.customerPhone) {
    const existingCustomer = await prisma.customer.findUnique({
      where: { phone: data.customerPhone },
      select: { phone: true },
    });
    resolvedCustomerPhone = existingCustomer?.phone ?? undefined;
  }

  const id = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cashierId = !( auth instanceof NextResponse) ? auth.username : undefined;

  // ── Transacción ACID: venta + decremento de stock atómicos ──────────────────
  // Si el stock falla, la venta también se revierte. Ninguno queda a medias.
  let sale;
  try {
    const saleRow = await prisma.$transaction(async (tx) => {
      // Pre-validar IDs de producto para evitar violaciones FK
      const requestedIds = [...new Set(itemsWithCost.map(i => i.productId))];
      const existingProducts = await tx.product.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true },
      });
      const validIds = new Set(existingProducts.map(p => p.id));
      const validItems = itemsWithCost.filter(i => validIds.has(i.productId));

      // Verificar stock suficiente para todos los items
      for (const item of validItems) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { stock: true, name: true },
        });
        if (product?.stock != null && product.stock < item.quantity) {
          throw new Error(`Stock insuficiente para "${product.name}": disponible ${product.stock}, solicitado ${item.quantity}`);
        }
      }

      // 1. Crear la venta
      const created = await tx.sale.create({
        data: {
          id,
          tenantId: auth.tenantId,
          total: finalTotal,
          totalCogs: totalCogs ?? null,
          payment: data.payment ?? "efectivo",
          amountPaid: data.amountPaid ?? finalTotal,
          change: (data.amountPaid ?? finalTotal) - finalTotal,
          customerPhone: resolvedCustomerPhone ?? null,
          cashierId: cashierId ?? null,
          comprobanteTipo: data.comprobanteTipo || "ticket",
          comprobanteRuc: data.comprobanteRuc ?? null,
          descuentoMonto: data.descuentoMonto ?? null,
          descuentoPorcentaje: data.descuentoPorcentaje ?? null,
          paymentDetails: data.paymentDetails ?? null,
          items: validItems.length > 0
            ? { create: validItems.map(i => ({ productId: i.productId, name: i.name, price: i.price, costPrice: i.costPrice ?? null, quantity: i.quantity, unit: i.unit ?? "" })) }
            : undefined,
        },
        include: { items: true },
      });

      // 2. Decrementar stock de cada producto vendido (dentro de la misma transacción)
      for (const item of validItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return created;
    });

    // Mapear a DbSale para mantener la misma forma de respuesta
    sale = {
      id: saleRow.id,
      items: saleRow.items.map(i => ({ productId: i.productId, name: i.name, price: i.price, ...(i.costPrice != null && { costPrice: i.costPrice }), quantity: i.quantity, unit: i.unit })),
      total: saleRow.total,
      ...(saleRow.totalCogs != null && { totalCogs: saleRow.totalCogs }),
      payment: saleRow.payment as typeof data.payment,
      amountPaid: saleRow.amountPaid,
      change: saleRow.change,
      ...(saleRow.customerPhone != null && { customerPhone: saleRow.customerPhone }),
      ...(saleRow.cashierId != null && { cashierId: saleRow.cashierId }),
      createdAt: saleRow.createdAt.toISOString(),
      ...(saleRow.comprobanteTipo != null && { comprobanteTipo: saleRow.comprobanteTipo }),
      ...(saleRow.comprobanteRuc != null && { comprobanteRuc: saleRow.comprobanteRuc }),
      ...(saleRow.descuentoMonto != null && { descuentoMonto: Number(saleRow.descuentoMonto) }),
      ...(saleRow.descuentoPorcentaje != null && { descuentoPorcentaje: Number(saleRow.descuentoPorcentaje) }),
      ...(saleRow.paymentDetails != null && { paymentDetails: saleRow.paymentDetails }),
    };
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : "Error al procesar venta";
    const isValidation = msg.startsWith("Stock insuficiente");
    console.error("[sales] POST error:", dbErr);
    return NextResponse.json({ error: msg }, { status: isValidation ? 400 : 500 });
  }

  // ── Generar número de comprobante si no es ticket ──
  let comprobanteNumero: string | undefined;
  if (data.comprobanteTipo && data.comprobanteTipo !== "ticket") {
    try {
      comprobanteNumero = await generarNumeroComprobante(
        !(auth instanceof NextResponse) ? auth.tenantId : "main",
        data.comprobanteTipo
      );
      await prisma.sale.update({
        where: { id: sale.id },
        data: { comprobanteNumero },
      });
      // Attach to response object
      (sale as Record<string, unknown>).comprobanteNumero = comprobanteNumero;
    } catch (numErr) {
      console.error("[sales] Error generando número comprobante:", numErr);
    }
  }

  // ── Si es cotización, crear Cotizacion automática ──
  if (data.comprobanteTipo === "cotizacion") {
    try {
      const tenantId = !(auth instanceof NextResponse) ? auth.tenantId : "main";
      const cotNumero = comprobanteNumero || `COT-${Date.now()}`;
      const subtotal = finalTotal / 1.18;
      const igv = finalTotal - subtotal;
      await prisma.cotizacion.create({
        data: {
          tenantId,
          numero: cotNumero,
          clienteNombre: resolvedCustomerPhone || "Cliente POS",
          clienteRuc: data.comprobanteRuc || undefined,
          validoHasta: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 días
          status: "ENVIADA",
          subtotal,
          igv,
          total: finalTotal,
          notas: `Generada automáticamente desde venta POS ${sale.id}`,
          createdBy: cashierId || "system",
          items: {
            create: data.items.map((item) => ({
              descripcion: item.name,
              cantidad: item.quantity,
              precioUnit: item.price,
              descuento: 0,
              subtotal: item.price * item.quantity,
            })),
          },
        },
      });
    } catch (cotErr) {
      console.error("[sales] Error creando cotización automática:", cotErr);
    }
  }

  // Decrement stock for each item sold (fire-and-forget)
  for (const item of data.items) {
    InventoryMovementsDB.record({
      productId: item.productId,
      type: "venta",
      quantity: item.quantity,
      reference: sale.id,
      notes: `Venta POS: ${item.name}`,
    }).catch(() => {});
  }

  // Register cash movement if a register is open (fire-and-forget)
  CashRegistersDB.getOpen().then(async (reg) => {
    if (reg) {
      await CashRegistersDB.addMovement(reg.id, {
        type: "venta",
        amount: finalTotal,
        method: data.payment ?? "efectivo",
        description: `Venta ${sale.id}`,
        saleId: sale.id,
      });
    }
  }).catch(() => {});

  // Accrue loyalty points for POS sale (fire-and-forget)
  if (data.customerPhone) {
    LoyaltyDB.accruePoints(data.customerPhone, finalTotal).catch(() => {});
  }

  // AUDIT LOG
  logAudit({
    req,
    action: "CREATE",
    entity: "Sale",
    entityId: sale.id,
    detail: `Venta POS creada por ${fmtCurrent(finalTotal)} con método ${data.payment ?? "efectivo"}${data.comprobanteTipo !== "ticket" ? ` (${data.comprobanteTipo})` : ""}.`,
    user: cashierId || "system",
  });

  // Asegurar que comprobanteNumero se incluya en la respuesta
  const response = { ...sale, ...(comprobanteNumero ? { comprobanteNumero } : {}) };
  return NextResponse.json(response, { status: 201 });
}

function fmtCurrent(n: number) { return `S/${n.toFixed(2)}`; }

async function generarNumeroComprobante(tenantId: string, tipo: string): Promise<string> {
  const prefijos: Record<string, string> = {
    boleta: "B001",
    factura: "F001",
    cotizacion: "COT",
    proforma: "PRO",
  };
  const prefijo = prefijos[tipo] || "DOC";

  // Buscar último número de ese tipo
  const last = await prisma.sale.findFirst({
    where: { tenantId, comprobanteTipo: tipo, comprobanteNumero: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { comprobanteNumero: true },
  });

  let numero = 1;
  if (last?.comprobanteNumero) {
    const match = last.comprobanteNumero.match(/(\d+)$/);
    if (match) numero = parseInt(match[1]) + 1;
  }

  return `${prefijo}-${String(numero).padStart(8, "0")}`;
}
