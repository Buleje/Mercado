import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SalesDB, InventoryMovementsDB, CashRegistersDB, LoyaltyDB } from "@/lib/jsondb";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-logger";
import { deductStockFEFO, hasBatchesWithStock } from "@/lib/inventory/fefo-deduct";
import { applyRateLimit } from "@/lib/rate-limit";

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
  // SECURITY 2026-05-07 (X2): idempotencyKey generada por el POS offline.
  // El server la usa para deduplicar; NUNCA toma el `id` del cliente.
  idempotencyKey: z.string().max(100).optional(),
}).strip(); // Strip unknown fields (e.g. _offlineId from offline queue)

/**
 * GET /api/sales
 *
 * Query params:
 *   - limit (default 500, max 1000)
 *   - page (1-indexed)
 *   - today=1: filtra desde 00:00 de hoy
 *   - from / to: ISO date filters
 *   - cashierId: filtra por cajero (uselo para "mis ventas")
 *   - all=1: bypass del cap default (use con cuidado, util para reportes)
 *
 * Default: 500 ventas mas recientes. Antes devolvia TODAS las ventas
 * del tenant sin limit (perf issue audit ventas-caja P2 #11).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner", "manager", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const pageParam = searchParams.get("page");
    const todayParam = searchParams.get("today");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const cashierIdParam = searchParams.get("cashierId");
    const allParam = searchParams.get("all");

    let data = await withDbRetry(() => SalesDB.getAll(auth.tenantId));

    // Filter: cashierId
    if (cashierIdParam) {
      data = data.filter((s) => s.cashierId === cashierIdParam);
    }

    // Filter: today=1
    if (todayParam === "1") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const cutoff = startOfDay.getTime();
      data = data.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
    }

    // Filter: from / to
    if (fromParam) {
      const fromTs = new Date(fromParam).getTime();
      if (!Number.isNaN(fromTs)) data = data.filter((s) => new Date(s.createdAt).getTime() >= fromTs);
    }
    if (toParam) {
      const toTs = new Date(toParam).getTime();
      if (!Number.isNaN(toTs)) data = data.filter((s) => new Date(s.createdAt).getTime() <= toTs);
    }

    const total = data.length;

    // Pagination — default 500 cap, bypass solo con ?all=1
    if (allParam !== "1") {
      const limit = Math.min(Math.max(parseInt(limitParam ?? "500", 10) || 500, 1), 1000);
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
    logger.error("[sales] GET error", { err: e instanceof Error ? e.message : String(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-05 (audit POS #12): rate-limit STRICT en POST /api/sales.
  // Antes brute-force de creación inflaba reportes y quemaba IDs.
  const rl = await applyRateLimit(req, "STRICT", "sales-post");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "cajero", "owner", "manager", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = SaleSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;

  // SECURITY/CRITICAL 2026-05-06 (pentest H1): los precios deben venir de la
  // DB, NO del cliente. Antes el `total` se calculaba con `i.price` enviado
  // por el cajero — un cajero malicioso podía vender producto de S/100 por
  // S/0.01 simplemente cambiando el body. Ahora hidratamos `price` desde
  // `Product.price` scoped por tenant.
  const pIds = data.items.map(i => i.productId);
  const priceCostMap = new Map<number, { price: number; costPrice: number }>();
  if (pIds.length > 0) {
    const prods = await prisma.product.findMany({
      where: { id: { in: pIds }, tenantId: auth.tenantId, deletedAt: null },
      select: { id: true, costPrice: true, price: true },
    });
    for (const p of prods) {
      const priceNum = toNumOrZero(p.price);
      const costNum = toNumOrZero(p.costPrice);
      priceCostMap.set(p.id, {
        price: priceNum,
        costPrice: costNum || priceNum * 0.7,
      });
    }
  }
  // Reescribir items con precio de DB (rechaza items con productId desconocido).
  const itemsWithCost = data.items
    .filter(i => priceCostMap.has(i.productId))
    .map(i => {
      const dbPrice = priceCostMap.get(i.productId)!;
      return {
        ...i,
        price: dbPrice.price, // ⚠ override: NO confiar en cliente
        costPrice: dbPrice.costPrice,
      };
    });
  if (itemsWithCost.length === 0) {
    return NextResponse.json({ error: "Ningún producto válido" }, { status: 400 });
  }
  const total = itemsWithCost.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalCogs = itemsWithCost.reduce((s, i) => s + (i.costPrice ?? i.price * 0.7) * i.quantity, 0);

  // SECURITY 2026-05-05 (audit POS #3): tope de descuento server-side.
  // Antes el cajero podía aplicar `descuentoMonto = total` y vender a S/0
  // (gratis). Ahora el cajero solo puede descontar hasta 15% del subtotal;
  // descuentos mayores requieren rol admin/owner.
  const requestedDiscount = data.descuentoMonto ?? 0;
  const isPrivilegedRole = auth.role === "admin" || auth.role === "owner";
  const maxCashierDiscount = total * 0.15;
  const discountAmount = isPrivilegedRole
    ? Math.min(requestedDiscount, total) // admin: hasta 100%
    : Math.min(requestedDiscount, maxCashierDiscount); // cajero: hasta 15%
  if (requestedDiscount > maxCashierDiscount && !isPrivilegedRole) {
    return NextResponse.json(
      { error: "Descuento excede 15% — requiere autorización del admin" },
      { status: 403 },
    );
  }
  const finalTotal = Math.max(0, total - discountAmount);

  // Validate customerPhone: only set it if the customer actually exists in DB
  // (the Sale.customerPhone is a FK → Customer.phone; passing an unknown phone throws a FK error)
  let resolvedCustomerPhone: string | undefined = undefined;
  if (data.customerPhone) {
    // SECURITY 2026-05-07 (B1): findUnique({where:{phone}}) es @unique global
    // y puede traer un Customer de otro tenant. findFirst con tenantId garantiza
    // aislamiento multi-tenant.
    const existingCustomer = await prisma.customer.findFirst({
      where: { phone: data.customerPhone, tenantId: auth.tenantId },
      select: { phone: true },
    });
    resolvedCustomerPhone = existingCustomer?.phone ?? undefined;
  }

  // SECURITY 2026-05-07 (X2): id siempre generado server-side.
  // NUNCA usar el id que venga del cliente (evita colisiones/tampering).
  const id = crypto.randomUUID();
  const cashierId = auth.username;

  // Deduplicación por idempotencyKey: si el POS offline reintenta un POST
  // que ya llegó, devolver la Sale existente en vez de crear un duplicado.
  if (data.idempotencyKey) {
    const existing = await prisma.sale.findFirst({
      where: { tenantId: auth.tenantId, idempotencyKey: data.idempotencyKey },
      include: { items: true },
    });
    if (existing) {
      logger.info("[sales] POST deduplicated by idempotencyKey", { tenantId: auth.tenantId, idempotencyKey: data.idempotencyKey, saleId: existing.id });
      return NextResponse.json({
        id: existing.id,
        items: existing.items.map(i => ({ productId: i.productId, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit })),
        total: existing.total,
        payment: existing.payment,
        amountPaid: existing.amountPaid,
        change: existing.change,
        createdAt: existing.createdAt.toISOString(),
        _deduplicated: true,
      }, { status: 200 });
    }
  }

  // ── Transacción ACID: venta + decremento de stock atómicos ──────────────────
  // Si el stock falla, la venta también se revierte. Ninguno queda a medias.
  let sale;
  try {
    const saleRow = await prisma.$transaction(async (tx) => {
      // Pre-validar IDs de producto SCOPED a tenant — sin tenantId aquí un
      // cajero podría vender productos de OTRA tienda si conoce su ID.
      const requestedIds = [...new Set(itemsWithCost.map(i => i.productId))];
      const existingProducts = await tx.product.findMany({
        where: { id: { in: requestedIds }, tenantId: auth.tenantId },
        select: { id: true, stock: true, name: true },
      });
      const productById = new Map(existingProducts.map(p => [p.id, p]));
      const validItems = itemsWithCost.filter(i => productById.has(i.productId));

      // Verificar stock suficiente con datos ya scoped
      for (const item of validItems) {
        const product = productById.get(item.productId)!;
        if (product.stock != null && product.stock < item.quantity) {
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
          idempotencyKey: data.idempotencyKey ?? null,
          items: validItems.length > 0
            ? { create: validItems.map(i => ({ productId: i.productId, name: i.name, price: i.price, costPrice: i.costPrice ?? null, quantity: i.quantity, unit: i.unit ?? "" })) }
            : undefined,
        },
        include: { items: true },
      });

      // 2. Decremento atómico con guardia anti-TOCTOU.
      //    `updateMany` con `stock: { gte: qty }` falla si entre la
      //    pre-validación y este punto otro cajero vendió las mismas
      //    unidades — evita stock negativo bajo concurrencia POS.
      for (const item of validItems) {
        const result = await tx.product.updateMany({
          where: {
            id: item.productId,
            tenantId: auth.tenantId,
            OR: [
              { stock: null },                     // producto sin tracking de stock
              { stock: { gte: item.quantity } },   // suficiente al momento del UPDATE
            ],
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          const p = productById.get(item.productId);
          throw new Error(
            `Stock insuficiente para "${p?.name ?? item.productId}" (concurrencia detectada). Reintentá.`,
          );
        }
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
    logger.error("[sales] POST error", { err: dbErr instanceof Error ? dbErr.message : String(dbErr), tenantId: auth.tenantId });
    return NextResponse.json({ error: msg }, { status: isValidation ? 400 : 500 });
  }

  // ── Generar número de comprobante si no es ticket ──
  let comprobanteNumero: string | undefined;
  if (data.comprobanteTipo && data.comprobanteTipo !== "ticket") {
    try {
      comprobanteNumero = await generarNumeroComprobante(auth.tenantId, data.comprobanteTipo);
      await prisma.sale.update({
        where: { id: sale.id },
        data: { comprobanteNumero },
      });
      // Attach to response object
      (sale as Record<string, unknown>).comprobanteNumero = comprobanteNumero;
    } catch (numErr) {
      logger.error("[sales] Error generando numero comprobante", { err: numErr instanceof Error ? numErr.message : String(numErr), tenantId: auth.tenantId });
    }
  }

  // ── Si es cotización, crear Cotizacion automática ──
  if (data.comprobanteTipo === "cotizacion") {
    try {
      const tenantId = auth.tenantId;
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
      logger.error("[sales] Error creando cotizacion automatica", { err: cotErr instanceof Error ? cotErr.message : String(cotErr) });
    }
  }

  // Registrar movimientos de inventario + descontar lotes FEFO.
  // OBSERVABILITY 2026-05-06 (audit stock #3): si el kardex falla, reportar
  // a Sentry para que no se pierda silenciosamente el desync entre stock y
  // movimientos. Sigue siendo fire-and-forget para no bloquear la venta,
  // pero los fallos quedan visibles para reconciliación manual.
  for (const item of data.items) {
    InventoryMovementsDB.record({
      productId: item.productId,
      type: "venta",
      quantity: item.quantity,
      reference: sale.id,
      notes: `Venta POS: ${item.name}`,
      tenantId: auth.tenantId,
    }).catch((err) => {
      logger.warn("[sales] inventory movement failed", { saleId: sale.id, err: String(err) });
      import("@sentry/nextjs")
        .then((Sentry) => Sentry.captureException(err, { extra: { saleId: sale.id, productId: item.productId, type: "sale-kardex-loss" } }))
        .catch((sentryErr) => logger.warn("[sales] sentry capture failed", { err: String(sentryErr) }));
    });

    // FEFO: si el producto tiene lotes, descontar del más cercano a vencer primero
    hasBatchesWithStock(auth.tenantId, item.productId)
      .then((hasBatches) => {
        if (hasBatches) {
          return deductStockFEFO(auth.tenantId, item.productId, item.quantity);
        }
      })
      .catch((err) => {
        logger.warn("[sales] FEFO deduct failed", { saleId: sale.id, productId: item.productId, err: String(err) });
        import("@sentry/nextjs")
          .then((Sentry) => Sentry.captureException(err, { extra: { saleId: sale.id, productId: item.productId, type: "fefo-deduct-loss" } }))
          .catch((sentryErr) => logger.warn("[sales] sentry capture failed (fefo)", { err: String(sentryErr) }));
      });
  }

  // Register cash movement if a register is open (fire-and-forget)
  CashRegistersDB.getOpen(auth.tenantId).then(async (reg) => {
    if (reg) {
      await CashRegistersDB.addMovement(reg.id, {
        type: "venta",
        amount: finalTotal,
        method: data.payment ?? "efectivo",
        description: `Venta ${sale.id}`,
        saleId: sale.id,
      });
    }
  }).catch((err) => logger.warn("[sales] cash register movement failed", { saleId: sale.id, err: String(err) }));

  // Accrue loyalty points for POS sale (fire-and-forget)
  if (data.customerPhone) {
    LoyaltyDB.accruePoints(auth.tenantId, data.customerPhone, finalTotal).catch((err) => logger.warn("[sales] loyalty accrue failed", { saleId: sale.id, err: String(err) }));
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

// Y3 FIX 2026-05-07: race condition entre 2 boletas/facturas simultáneas.
// Estrategia A — collision detection + retry en P2002 (unique constraint).
// Elegida sobre SELECT FOR UPDATE porque no requiere raw SQL ni tx larga que
// serializa la tabla entera. Con @@unique([tenantId,comprobanteTipo,comprobanteNumero])
// en schema, la colisión se convierte en P2002 detectable → reintento con MAX+1.
async function generarNumeroComprobante(tenantId: string, tipo: string): Promise<string> {
  const prefijos: Record<string, string> = {
    boleta: "B001",
    factura: "F001",
    cotizacion: "COT",
    proforma: "PRO",
  };
  const prefijo = prefijos[tipo] || "DOC";

  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Re-leer el MAX en cada intento: otro proceso pudo haber ganado la carrera
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

    const candidate = `${prefijo}-${String(numero).padStart(8, "0")}`;

    try {
      // Si el unique constraint detecta colisión, Prisma lanza P2002 → retry
      await prisma.sale.updateMany({
        where: { tenantId, comprobanteTipo: tipo, comprobanteNumero: null },
        data: { comprobanteNumero: candidate },
      });
      return candidate;
    } catch (err) {
      const isUnique = err instanceof Error && err.message.includes("P2002");
      if (!isUnique || attempt === MAX_RETRIES - 1) throw err;
      // Pausa escalonada antes del siguiente intento (evita thundering herd)
      await new Promise((r) => setTimeout(r, 10 * (attempt + 1)));
    }
  }

  throw new Error("generarNumeroComprobante: max retries exceeded");
}
