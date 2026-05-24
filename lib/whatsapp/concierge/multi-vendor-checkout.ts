import "server-only";
import { prisma } from "@/lib/prisma";
import { OrdersDB } from "@/lib/db/orders.db";
import { calculateCommission, recordCommission } from "@/lib/commissions";
import { logger } from "@/lib/logger";
import type { CartItem } from "./types";

// TODO F3: PaymentApproval model will be added by agent F3.
// Fields assumed: id, status, expectedAmount, customerPhone, conversationId.
// Until then, we access via $queryRaw / raw SQL so TypeScript does not reject
// the missing Prisma client binding.  Mark call sites with // TODO F3.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VendorOrderResult {
  orderId: string;
  storeName: string;
  storeId: string;
  subtotal: number;
  commission: number;
}

export interface MultiVendorCheckoutResult {
  orders: VendorOrderResult[];
  totalAmount: number;
  /** cuid() of the PaymentApproval row — client sends Yape capture referencing this */
  paymentApprovalId: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Groups cart items by storeId. Skips items missing storeId — caller is
 *  expected to filter those out before invoking checkoutMultiVendor. */
function groupByStore(cart: CartItem[]): Map<string, CartItem[]> {
  const map = new Map<string, CartItem[]>();
  for (const item of cart) {
    if (!item.storeId) continue;
    const bucket = map.get(item.storeId) ?? [];
    bucket.push(item);
    map.set(item.storeId, bucket);
  }
  return map;
}

/** Recompute subtotal server-side — never trust client-sent totals (CLAUDE.md rule #6). */
function computeSubtotal(items: CartItem[]): number {
  return items.reduce((acc, i) => {
    const modifierExtra = (i.modifiers ?? []).reduce(
      (s, m) => s + m.priceAdjustment,
      0,
    );
    return acc + (i.price + modifierExtra) * i.quantity;
  }, 0);
}

/** Round to 2 decimals — matches Decimal(12,2) DB column. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── PaymentApproval helpers (TODO F3) ────────────────────────────────────────

interface PaymentApprovalRow {
  id: string;
  status: string;
}

/**
 * Looks for an existing pending PaymentApproval for this conversation.
 * Returns null if not found or if the table does not yet exist (pre-F3).
 * TODO F3: replace raw SQL with prisma.paymentApproval.findFirst(...)
 */
async function findPendingApproval(
  conversationId: string,
): Promise<PaymentApprovalRow | null> {
  try {
    const rows = await prisma.$queryRaw<PaymentApprovalRow[]>`
      SELECT id, status
      FROM "PaymentApproval"
      WHERE "conversationId" = ${conversationId}
        AND status = 'pending'
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch (err) {
    // Table does not exist yet (pre-F3 deploy) — treat as no approval found
    logger.warn("[multi-vendor-checkout] PaymentApproval table not ready", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Creates a PaymentApproval and links it to the given order IDs.
 * Returns the new approval id.
 * TODO F3: replace raw SQL with prisma.paymentApproval.create(...)
 */
async function createPaymentApproval(params: {
  conversationId: string;
  customerPhone: string;
  expectedAmount: number;
  orderIds: string[];
}): Promise<string> {
  const id: string = crypto.randomUUID();

  // Audit 2026-05-02 #7: do NOT swallow INSERT failures. Returning a
  // ghost approvalId silently meant Orders linked to a row that did not
  // exist — customer pays, Orders orphaned with no approval to review.
  // Throw → caller (checkoutMultiVendor) propagates the error so the
  // conversation handler can show a friendly "intentá de nuevo" message
  // and the customer is NOT told the order is confirmed.
  // TODO F3: switch to prisma.paymentApproval.create(...)
  try {
    await prisma.$executeRaw`
      INSERT INTO "PaymentApproval" (id, status, "expectedAmount", "customerPhone", "conversationId", "createdAt", "updatedAt")
      VALUES (${id}, 'pending', ${params.expectedAmount}, ${params.customerPhone}, ${params.conversationId}, NOW(), NOW())
    `;
  } catch (err) {
    logger.error("[multi-vendor-checkout] createPaymentApproval insert failed", {
      error: err instanceof Error ? err.message : String(err),
      conversationId: params.conversationId,
      customerPhone: params.customerPhone.slice(-6),
    });
    throw new Error("createPaymentApproval-insert-failed");
  }

  // Link each orderId to this approval via a junction or direct column update.
  // TODO F3: if PaymentApproval has a one-to-many relation with Order, update
  // Order.paymentApprovalId for each orderId here.
  if (params.orderIds.length > 0) {
    for (const orderId of params.orderIds) {
      await prisma.$executeRaw`
        UPDATE "Order"
        SET "paymentApprovalId" = ${id}
        WHERE id = ${orderId}
      `.catch((err) => {
        // Audit 2026-05-17 01-P0-2: antes silent. Si la columna no existe en
        // prod (migration_add_payment_approval_link no aplicada), las
        // órdenes WhatsApp quedan sin paymentApprovalId y superadmin no
        // puede trazarlas para aprobar el pago Yape — dinero en limbo.
        // Ahora logger.warn para que el error quede visible en Sentry.
        logger.warn("[multi-vendor-checkout] UPDATE Order.paymentApprovalId failed", {
          orderId,
          approvalId: id,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  return id;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * checkoutMultiVendor — splits a mixed cart into per-vendor orders, records
 * commissions, and creates a PaymentApproval awaiting the customer's Yape
 * capture.
 *
 * Idempotency: if a pending PaymentApproval already exists for this
 * conversationId, it is reused and no duplicate orders are created.
 *
 * @param conversationId - WhatsAppConversation.id (used as idempotency scope)
 * @param cart           - Current cart items (must have storeId / storeName)
 * @param deliveryAddress - Confirmed delivery address from conversation
 * @param customerPhone  - Customer phone in E.164 without '+' (e.g. "51987654321")
 * @param tenantId       - Platform tenant (for audit trail)
 */
export async function checkoutMultiVendor(
  conversationId: string,
  cart: CartItem[],
  deliveryAddress: string,
  customerPhone: string,
  tenantId: string,
): Promise<MultiVendorCheckoutResult> {
  if (cart.length === 0) {
    throw new Error("checkoutMultiVendor called with empty cart");
  }

  // ── Idempotency guard ────────────────────────────────────────────────────
  // If a pending approval already exists for this conversation, return it
  // without creating duplicate orders.
  const existing = await findPendingApproval(conversationId);
  if (existing) {
    logger.info("[multi-vendor-checkout] reusing existing PaymentApproval", {
      conversationId,
      approvalId: existing.id,
    });

    // Audit 2026-05-17 01-P1-8: el reuse path antes recomputaba subtotales
    // desde el cart cliente sin revalidar precios contra DB. Si el cliente
    // modificó cantidades entre intentos (mismo conversationId), recibía
    // totales reflejando el cart NUEVO pero pagaba contra el approval VIEJO
    // → totales rotos. Ahora cargamos precios live de StoreProduct y
    // recomputamos contra cantidades del cart actual. Si un producto ya
    // no existe en el catálogo, se omite del cálculo.
    const vendorGroups = groupByStore(cart);
    const orders: VendorOrderResult[] = [];
    let totalAmount = 0;

    for (const [storeId, items] of vendorGroups) {
      const firstItem = items[0];

      // Cargar precios live por productId. StoreProduct usa retailPrice +
      // discountPrice (Decimal); priorizamos discount si está vigente.
      const productIds = items.map((i) => i.productId).filter(Boolean);
      type DecOrNum = number | { toNumber: () => number } | null;
      const storeProducts = productIds.length > 0
        ? await prisma.storeProduct
            .findMany({
              where: { storeId, productId: { in: productIds }, isActive: true },
              select: {
                productId: true,
                retailPrice: true,
                discountPrice: true,
                discountUntil: true,
              },
            })
            .catch(
              () =>
                [] as Array<{
                  productId: number;
                  retailPrice: DecOrNum;
                  discountPrice: DecOrNum;
                  discountUntil: Date | null;
                }>,
            )
        : [];
      const toNum = (v: DecOrNum): number =>
        typeof v === "number" ? v : (v?.toNumber?.() ?? 0);
      const livePriceById = new Map<number, number>();
      for (const sp of storeProducts) {
        const discountActive =
          sp.discountUntil != null && new Date(sp.discountUntil) > new Date();
        const live = discountActive && sp.discountPrice != null
          ? toNum(sp.discountPrice)
          : toNum(sp.retailPrice);
        livePriceById.set(sp.productId, live);
      }

      // Recompute subtotal usando precios live (no los del cart cliente).
      let subtotal = 0;
      for (const it of items) {
        const livePrice = livePriceById.get(it.productId);
        if (typeof livePrice !== "number") continue;
        const modifierExtra = (it.modifiers ?? []).reduce(
          (s, m) => s + m.priceAdjustment,
          0,
        );
        subtotal += (livePrice + modifierExtra) * it.quantity;
      }
      subtotal = round2(subtotal);

      // Fetch live commission rate
      const store = await prisma.store
        .findUnique({ where: { id: storeId }, select: { commission: true } })
        .catch(() => null);
      // P0 schema fix 2026-05-24: Store.commission ahora es Decimal — normalizamos a number.
      const rate = store?.commission ? store.commission.toNumber() : 5;
      const commission = round2(calculateCommission(subtotal, rate));

      orders.push({
        orderId: "reused",
        storeName: firstItem.storeName ?? "Tienda",
        storeId,
        subtotal,
        commission,
      });
      totalAmount = round2(totalAmount + subtotal);
    }

    return { orders, totalAmount, paymentApprovalId: existing.id };
  }

  // ── Group cart by vendor ─────────────────────────────────────────────────
  const vendorGroups = groupByStore(cart);
  const orders: VendorOrderResult[] = [];
  const createdOrderIds: string[] = [];
  let totalAmount = 0;

  for (const [storeId, items] of vendorGroups) {
    const firstItem = items[0];
    const subtotal = round2(computeSubtotal(items));

    // Audit 2026-05-17 01-P1-7: validar que la tienda esté publicada antes
    // de aceptar el checkout. Sin esto, una tienda con isPublished:false
    // (en draft, suspendida o pending approval) recibiría órdenes WhatsApp
    // sin estar lista para fulfillment — pérdida de ventas y mala reputación
    // cuando el vendor no responde. Bloqueante merge a master.
    const store = await prisma.store
      .findUnique({
        where: { id: storeId },
        select: { commission: true, isPublished: true, name: true },
      })
      .catch(() => null);

    if (!store || !store.isPublished) {
      logger.warn("[multi-vendor-checkout] store not published — refusing order", {
        storeId,
        storeName: firstItem.storeName ?? store?.name ?? "?",
        isPublished: store?.isPublished ?? null,
        conversationId,
      });
      throw new Error(`store-not-published:${storeId}`);
    }

    // P0 schema fix 2026-05-24: Store.commission ahora es Decimal — normalizamos a number.
    const rate = store.commission ? store.commission.toNumber() : 5;
    const commission = round2(calculateCommission(subtotal, rate));

    // Build idempotency key scoped to (conversationId + storeId)
    const idempotencyKey = `wachat:${conversationId}:${storeId}`;

    // Check if an order with this idempotency key already exists
    const existingOrder = await prisma.order
      .findUnique({ where: { idempotencyKey }, select: { id: true } })
      .catch(() => null);

    let orderId: string;

    if (existingOrder) {
      // Reuse — do not duplicate (CLAUDE.md rule: idempotency)
      orderId = existingOrder.id;
      logger.info("[multi-vendor-checkout] reusing existing order", {
        orderId,
        storeId,
        idempotencyKey,
      });
    } else {
      orderId = crypto.randomUUID();
      const now = new Date().toISOString();

      await OrdersDB.add(
        {
          id: orderId,
          customer: {
            name: customerPhone,
            phone: customerPhone,
            location: deliveryAddress,
            reference: "",
          },
          items: items.map((i) => ({
            id: i.productId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            unit: i.unit,
            image: "",
          })),
          total: subtotal,
          status: "pendiente",
          paymentMethod: "yape",
          notes: `[WhatsApp Multi-vendor] Tienda: ${firstItem.storeName} | Dirección: ${deliveryAddress}`,
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        },
        // Each order is created scoped to the vendor's tenantId (storeId = tenantId
        // in multi-vendor model). For platform-level tenants, pass the platform tenantId.
        storeId,
      );
    }

    createdOrderIds.push(orderId);
    totalAmount = round2(totalAmount + subtotal);

    orders.push({
      orderId,
      storeName: firstItem.storeName ?? "Tienda",
      storeId,
      subtotal,
      commission,
    });

    // Fire-and-forget commission ledger (CLAUDE.md rule #7)
    recordCommission({
      orderId,
      storeId,
      type: "marketplace_fee",
      amount: commission,
      rate,
      tenantId,
    }).catch((err) =>
      logger.warn("[multi-vendor-checkout] recordCommission failed", {
        orderId,
        storeId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // ── Create PaymentApproval ───────────────────────────────────────────────
  const paymentApprovalId = await createPaymentApproval({
    conversationId,
    customerPhone,
    expectedAmount: totalAmount,
    orderIds: createdOrderIds,
  });

  return { orders, totalAmount, paymentApprovalId };
}
