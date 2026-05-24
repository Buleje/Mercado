import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { CouponsDB } from "@/lib/db/coupons.db";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { PTS_PER_SOL } from "@/lib/loyalty-constants";
import { type DbMarketplaceOrder, type DbVendorDashboard } from "./types";
import type { OrderStatus } from "@/lib/generated/prisma/client";

// ─── MarketplaceOrdersDB ──────────────────────────────────────────────────────

type CartItem = {
  storeProductId: string;
  productId: number;
  name: string;
  quantity: number;
  retailPrice: number;
  unit: string;
};

export const MarketplaceOrdersDB = {
  /**
   * Crear un pedido en el sistema del vendedor con source="marketplace".
   * Un pedido por tienda (cada tienda es un tenant distinto).
   */
  async createFromCart(params: {
    storeSlug: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    notes?: string;
    paymentMethod?: string;
    items: CartItem[];
    couponCode?: string;
    loyaltyRedeemPoints?: number;
  }): Promise<DbMarketplaceOrder> {
    // 1. Cargar tienda y verificar que esté publicada
    const store = await prisma.store.findUnique({
      where:  { slug: params.storeSlug },
      select: { id: true, tenantId: true, name: true, slug: true, isPublished: true, commission: true },
    });
    if (!store || !store.isPublished) {
      throw new Error("Tienda no disponible");
    }

    // 2. Verificar que todos los items pertenecen a esta tienda y calcular totales
    const storeProductIds = params.items.map((i) => i.storeProductId);
    const storeProducts = await prisma.storeProduct.findMany({
      where: { id: { in: storeProductIds }, storeId: store.id, isActive: true },
      select: { id: true, productId: true, retailPrice: true, minOrderQty: true },
    });

    if (storeProducts.length !== storeProductIds.length) {
      throw new Error("Uno o más productos no están disponibles en esta tienda");
    }

    // Mapa de precio real (server-side — nunca confiar en el precio del cliente)
    // TD-018: sp.retailPrice es Decimal → convertir a number antes de map
    const priceMap = new Map(storeProducts.map((sp) => [sp.id, toNumOrZero(sp.retailPrice)]));

    const orderItems = params.items.map((item) => {
      // Defense-in-depth: la guarda anterior (line 675) ya garantiza que cada
      // storeProductId existe en priceMap. Si el fallback se dispara, es un
      // bug — lanzamos para evitar aceptar precios cliente-side.
      const unitPrice = priceMap.get(item.storeProductId);
      if (unitPrice === undefined) {
        throw new Error(`Precio server-side no disponible para storeProductId=${item.storeProductId}`);
      }
      return {
        productId: item.productId,
        name:      item.name,
        price:     unitPrice,
        quantity:  item.quantity,
        unit:      item.unit,
        image:     "",
      };
    });

    const subtotal   = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // ── Descuento por tier de cliente (Frecuente/VIP/Embajador) ──
    // Calculado server-side basado en pedidos entregados reales — no se
    // confía en el conteo del cliente (localStorage). Helper local
    // (espejo de tierForCount en /api/marketplace/customer-tier).
    let tierDiscountPct = 0;
    let tierLabel: string | null = null;
    // FIX 2026-05-08 (audit Round 4): catch silencioso no dejaba rastro cuando
    // prisma.order.count fallaba — el pedido se creaba sin descuento de tier
    // y era imposible reconciliar retroactivamente. Ahora se marca en notes/metadata.
    let tierDiscountFailed = false;
    if (params.customerPhone) {
      try {
        // F2 fix: tenantId scoped — tier solo cuenta pedidos entregados
        // en ESTA tienda para evitar que pedidos de otro tenant eleven el tier.
        const deliveredCount = await prisma.order.count({
          where: {
            customerPhone: params.customerPhone,
            tenantId: store.tenantId,
            source: "marketplace",
            deletedAt: null,
            status: "entregado",
          },
        });
        if (deliveredCount >= 25) {
          tierDiscountPct = 10;
          tierLabel = "Cliente Embajador";
        } else if (deliveredCount >= 10) {
          tierDiscountPct = 7;
          tierLabel = "Cliente VIP";
        } else if (deliveredCount >= 5) {
          tierDiscountPct = 5;
          tierLabel = "Cliente Frecuente";
        }
      } catch (e) {
        // Si la query falla (DB error), seguimos sin descuento — nunca
        // bloquear un pedido por la feature de tier.
        // Marcamos tierDiscountFailed=true para reconciliación retroactiva.
        tierDiscountFailed = true;
        logger.error("tier discount query failed — continuing without discount", { err: e instanceof Error ? e.message : String(e), op: "MarketplaceDB.createOrder/tierQuery" });
      }
    }
    const tierDiscount = parseFloat(((subtotal * tierDiscountPct) / 100).toFixed(2));
    // total intermedio (antes de cupón/loyalty) — usado en cálculo de couponDiscount porcentual
    const total = parseFloat((subtotal - tierDiscount).toFixed(2));

    // 2.5. Garantizar que el Customer existe antes de crear el Order.
    //     Order.customerPhone es FK a Customer.phone — sin este upsert, Postgres
    //     rechaza el INSERT con "Foreign key constraint violated on
    //     Order_customerPhone_fkey" (bug descubierto 2026-04-24 en smoke test).
    //     Los marketplace orders son de compradores anónimos que pueden nunca
    //     haber registrado cuenta, asi que garantizamos un Customer minimo.
    if (params.customerPhone) {
      // Race-safe: cuando el carrito tiene productos de 2+ tiendas, el frontend
      // dispara 1 POST por tienda en paralelo. Ambos intentan upsertar el
      // mismo Customer.phone — el primero gana, el segundo fallaria con P2002
      // (unique). Capturamos ese caso como ok ya que el Customer ya existe.
      // F5 fix: NO usar upsert({where:{phone}}) — phone es @unique global y
      // devolvería el Customer de OTRO tenant. Usar findFirst+create scoped.
      // Race-safe: si hay P2002 en el create (carrito multi-tienda paralelo),
      // el Customer ya existe en este tenant — ignoramos.
      try {
        const existingCustomer = await prisma.customer.findFirst({
          where: { phone: params.customerPhone, tenantId: store.tenantId },
          select: { phone: true },
        });
        if (!existingCustomer) {
          // eslint-disable-next-line no-restricted-properties -- aggregate: create scoped a tenantId; refactor a CustomersDB pendiente.
          await prisma.customer.create({
            data: {
              phone:    params.customerPhone,
              name:     params.customerName,
              location: params.customerAddress,
              tenantId: store.tenantId,
            },
          });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== "P2002") throw e; // P2002 = race condition — Customer ya creado
      }
    }

    // 3. Resolver cupón y loyalty server-side (F1)
    // PTS_PER_SOL importado de lib/loyalty-constants — fuente única de verdad (CR-2.3).

    // Pre-validar cupón FUERA de la tx para tener el objeto disponible
    let couponDiscount = 0;
    let resolvedCouponId: string | null = null;
    if (params.couponCode) {
      // eslint-disable-next-line no-restricted-properties -- aggregate: findFirst scoped a tenantId+active; migracion a CouponsDB pendiente.
      const coupon = await prisma.coupon.findFirst({
        where: {
          code:     params.couponCode,
          tenantId: store.tenantId,
          active:   true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        // PENTEST 2026-05-18 Fase 1 CRIT #2: agregar minPurchase al select.
        // Antes el campo NO se traía y NO se validaba → cliente aplicaba
        // cupón de S/50 mínimo comprando S/1 y se aceptaba el descuento.
        select: { id: true, discountType: true, discountValue: true, maxUses: true, usedCount: true, minPurchase: true },
      });
      if (!coupon) {
        throw new Error("Cupón inválido o expirado");
      }
      // Validar cupo disponible (maxUses=0 o null → ilimitado)
      const maxUsesVal = coupon.maxUses ?? 0;
      if (maxUsesVal > 0 && toNumOrZero(coupon.usedCount) >= maxUsesVal) {
        throw new Error("Cupón ya alcanzó el límite de usos");
      }
      // CRIT #2: validar minPurchase contra subtotal (antes de descuento).
      const minPurchase = toNumOrZero(coupon.minPurchase);
      if (minPurchase > 0 && subtotal < minPurchase) {
        throw new Error(
          `Este cupón requiere una compra mínima de S/${minPurchase.toFixed(2)}. Tu carrito es de S/${subtotal.toFixed(2)}.`,
        );
      }
      // PENTEST 2026-05-18 Sprint A #2: check movido DENTRO de la $transaction
      // (ver más abajo). El pre-check aquí era TOCTOU: 2 POST paralelos con
      // mismo cliente + mismo cupón ambos veían prevUses=0 y ambos creaban
      // órdenes con descuento. Ahora el check vive dentro de la tx después de
      // bloquear el cupón con un raw lock implícito del update increment.
      const dv = toNumOrZero(coupon.discountValue);
      if (coupon.discountType === "percent") {
        couponDiscount = parseFloat(Math.min((subtotal * dv) / 100, subtotal).toFixed(2));
      } else {
        couponDiscount = parseFloat(Math.min(dv, subtotal).toFixed(2));
      }
      resolvedCouponId = coupon.id;
    }

    // Loyalty: verificar puntos FUERA de tx (solo lectura previa)
    let loyaltyDiscount = 0;
    const redeemPoints = params.loyaltyRedeemPoints ?? 0;
    if (redeemPoints > 0 && params.customerPhone) {
      // eslint-disable-next-line no-restricted-properties -- aggregate: findFirst scoped a phone+tenantId; migracion a CustomersDB pendiente.
      const cust = await prisma.customer.findFirst({
        where: { phone: params.customerPhone, tenantId: store.tenantId },
        select: { loyaltyPoints: true },
      });
      if (!cust || toNumOrZero(cust.loyaltyPoints) < redeemPoints) {
        throw new Error("Puntos de fidelidad insuficientes");
      }
      loyaltyDiscount = parseFloat((redeemPoints / PTS_PER_SOL).toFixed(2));
    }

    // Total final con todos los descuentos (no puede ser negativo)
    const totalAfterDiscounts = parseFloat(
      Math.max(0, total - couponDiscount - loyaltyDiscount).toFixed(2)
    );

    // P0-1 fix (audit 2026-05-23): unificar motor de comisión usando
    // CommissionsDB.computeVendorTier (tier dinámico 2/3/4/5% por volumen 30d).
    // Antes: `store.commission` legacy fijo en 5% — el sistema de tiers
    // existía pero nunca se aplicaba en el checkout. `Store.commission ≠ 5`
    // sigue ganando como override (preserva configuraciones manuales — ver
    // computeVendorTier).
    // TD-018: store.commission es Decimal → convertir para pasar a tier resolver.
    const overrideRate = toNumOrZero(store.commission);
    const tierInfo = await CommissionsDB.computeVendorTier(
      store.tenantId,
      store.id,
      overrideRate,
    );
    const commissionRate = tierInfo.rate;
    const commission = parseFloat(((totalAfterDiscounts * commissionRate) / 100).toFixed(2));

    // Componer notas con tags de descuentos para audit
    const noteParts: string[] = [];
    if (params.notes) noteParts.push(params.notes);
    if (tierDiscount > 0 && tierLabel) {
      noteParts.push(`[${tierLabel}: -${tierDiscountPct}% = -S/${tierDiscount.toFixed(2)}]`);
    }
    if (couponDiscount > 0 && params.couponCode) {
      noteParts.push(`[Cupón ${params.couponCode}: -S/${couponDiscount.toFixed(2)}]`);
    }
    if (loyaltyDiscount > 0) {
      noteParts.push(`[Loyalty ${redeemPoints}pts: -S/${loyaltyDiscount.toFixed(2)}]`);
    }
    // FIX 2026-05-08 (audit Round 4): inyectar tag de falla de tier en notes
    // para permitir reconciliación retroactiva via findOrdersWithFailedTierDiscount.
    if (tierDiscountFailed) {
      noteParts.push(`[TIER_DISCOUNT_FAILED: descuento Frecuente|VIP|Embajador no aplicado — pendiente reconciliación]`);
    }
    // Round 7 (2026-05-09): pedidos anónimos (sin phone) no pueden calcular tier.
    // Inyectar tag ANONYMOUS_NO_TIER para que la reconciliación los identifique
    // y el admin decida si conceder descuento manual cross-tenant.
    if (!params.customerPhone) {
      noteParts.push(`[ANONYMOUS_NO_TIER: pedido sin phone, tier no calculable]`);
    }
    const composedNotes = noteParts.length > 0 ? noteParts.join(" ") : null;

    const orderId = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    const fullOrderId = `MKT-${orderId}`;

    // Brandon perf P0 #1: pre-fetch stocks en batch ANTES de la tx.
    // Antes: (findFirst + updateMany) × N items = 2xN queries secuenciales dentro de la tx.
    // Ahora: 1 findMany pre-tx + N updateMany en Promise.all dentro de la tx.
    // La guard atomica `stock: { gte: quantity }` en updateMany sigue cerrando la race window.
    const itemsNeedingStock = orderItems
      .map((item) => {
        const sp = storeProducts.find(
          (s) => s.id === params.items.find((pi) => pi.productId === item.productId && pi.name === item.name)?.storeProductId
        );
        return sp?.productId ? { item, productId: sp.productId } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const productIdsForStock = itemsNeedingStock.map((x) => x.productId);

    // eslint-disable-next-line no-restricted-properties -- aggregate: batch pre-fetch de stocks antes de tx para eliminar N+1 en checkout.
    const stockSnapshot = productIdsForStock.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIdsForStock }, tenantId: store.tenantId, deletedAt: null },
          select: { id: true, stock: true, name: true },
        })
      : [];
    const stockMap = new Map(stockSnapshot.map((p) => [p.id, p]));

    // Validar disponibilidad ANTES de abrir la tx (fail-fast, sin round-trips).
    for (const { item, productId } of itemsNeedingStock) {
      const snap = stockMap.get(productId);
      if (!snap) throw new Error(`Producto no disponible: ${item.name}`);
      if (snap.stock !== null && snap.stock < item.quantity) {
        throw new Error(`Stock insuficiente para ${item.name} (quedan ${snap.stock}, pediste ${item.quantity})`);
      }
    }

    // 4. Transacción atómica: stock + order + commission + cupón + loyalty (F4, F1)
    // eslint-disable-next-line no-restricted-properties -- $transaction legítima: operaciones atómicas multi-tabla en marketplace checkout.
    await prisma.$transaction(async (tx) => {
      // F4: decrementar stock con decrements paralelos (stocks pre-validados arriba).
      // El guard atomico `stock: { gte: quantity }` en updateMany cierra la race window
      // entre el snapshot pre-tx y el moment del decrement.
      await Promise.all(
        itemsNeedingStock
          .filter(({ productId }) => {
            // Solo decrementar si el producto controla stock (snap.stock !== null)
            const snap = stockMap.get(productId);
            return snap && snap.stock !== null;
          })
          .map(async ({ item, productId }) => {
            // eslint-disable-next-line no-restricted-properties -- $transaction interna: decrement con guard atomico para cerrar race window.
            const upd = await tx.product.updateMany({
              where: {
                id:        productId,
                tenantId:  store.tenantId,
                stock:     { gte: item.quantity },
                deletedAt: null,
              },
              data: { stock: { decrement: item.quantity } },
            });
            if (upd.count === 0) {
              throw new Error(`Stock insuficiente para ${item.name}`);
            }
          }),
      );

      // PENTEST 2026-05-18 Sprint A #2: re-verificar dentro de la tx que
      // este cliente no haya usado ya el cupón. Antes el check vivía pre-tx
      // y dejaba ventana TOCTOU; además el create NO seteaba
      // appliedCouponCode → countUsesByCustomer siempre retornaba 0 y la
      // protección PENTEST-003 estaba muerta. Ahora: check + write atómicos.
      if (resolvedCouponId && params.customerPhone && params.couponCode) {
        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        // eslint-disable-next-line no-restricted-properties -- $transaction interna: count scoped a tenantId+phone+coupon.
        const prevUses = await tx.order.count({
          where: {
            tenantId:          store.tenantId,
            customerPhone:     params.customerPhone.replace(/\D/g, ""),
            appliedCouponCode: params.couponCode,
            status:            { notIn: ["cancelado"] },
            createdAt:         { gte: since },
            deletedAt:         null,
          },
        });
        if (prevUses >= 1) {
          throw new Error("Cupón ya usado por este cliente");
        }
      }

      // Crear Order
      // eslint-disable-next-line no-restricted-properties -- $transaction interna: order.create scoped a tenantId del vendedor.
      await tx.order.create({
        data: {
          id:               fullOrderId,
          tenantId:         store.tenantId,
          source:           "marketplace",
          customerName:     params.customerName,
          customerPhone:    params.customerPhone,
          customerLocation: params.customerAddress,
          total:            totalAfterDiscounts,
          discountAmount:   (tierDiscount + couponDiscount + loyaltyDiscount) > 0
            ? parseFloat((tierDiscount + couponDiscount + loyaltyDiscount).toFixed(2))
            : null,
          // PENTEST 2026-05-18 Sprint A #2: persistir appliedCouponCode para que
          // countUsesByCustomer (90d window) realmente funcione. Bug previo:
          // el campo nunca se seteaba → protección PENTEST-003 inerte.
          appliedCouponCode: params.couponCode ?? null,
          couponDiscount:    couponDiscount > 0 ? couponDiscount : null,
          notes:            composedNotes,
          paymentMethod:    params.paymentMethod || "marketplace",
          updatedAt:        new Date(),
          items: {
            create: orderItems,
          },
        },
      });

      // Registrar comisión
      // P0-2 fix (audit 2026-05-23): usar enum oficial `marketplace_fee` en lugar
      // del string libre "sale". Mantenerlo silenciaba listLedger/payoutSummary
      // (filtran por `type` typed) y dejaba estas filas invisibles para el
      // settle cron. Ver lib/db/commissions.db.ts → CommissionType.
      // P0-1 fix: `rate` ahora refleja el tier dinámico calculado arriba (no el
      // legacy `store.commission` que era fijo en 5%).
      // eslint-disable-next-line no-restricted-properties -- $transaction interna: commissionLedger.create scoped a tenantId.
      await tx.commissionLedger.create({
        data: {
          id:       crypto.randomUUID(),
          orderId:  fullOrderId,
          storeId:  store.id,
          type:     "marketplace_fee",
          amount:   commission,
          rate:     commissionRate,
          status:   "pending",
          tenantId: store.tenantId,
        },
      });

      // F1: incrementar usedCount del cupón de forma atómica.
      // El check pre-tx validó el cupo; aquí hacemos el increment dentro de la
      // tx y re-verificamos para cerrar la race window entre check y write.
      if (resolvedCouponId) {
        // eslint-disable-next-line no-restricted-properties -- $transaction interna: coupon.update+findUnique atómico para usedCount; refactor a CouponsDB pendiente.
        await tx.coupon.update({
          where: { id: resolvedCouponId },
          data:  { usedCount: { increment: 1 } },
        });
        // Re-verificar dentro de la tx que no se pasó del límite (cierra race window)
        const freshCoupon = await tx.coupon.findUnique({
          where:  { id: resolvedCouponId },
          select: { maxUses: true, usedCount: true },
        });
        const freshMaxUses = freshCoupon?.maxUses ?? 0;
        if (
          freshCoupon &&
          freshMaxUses > 0 &&
          toNumOrZero(freshCoupon.usedCount) > freshMaxUses
        ) {
          throw new Error("Cupón ya consumido");
        }
      }

      // F1: decrementar loyalty points del customer
      if (redeemPoints > 0 && params.customerPhone) {
        // eslint-disable-next-line no-restricted-properties -- $transaction interna: customer.updateMany scoped a phone+tenantId.
        await tx.customer.updateMany({
          where: { phone: params.customerPhone, tenantId: store.tenantId },
          data:  { loyaltyPoints: { decrement: redeemPoints } },
        });
      }
    });

    return {
      id:             fullOrderId,
      storeId:        store.id,
      storeName:      store.name,
      storeSlug:      store.slug,
      sellerTenantId: store.tenantId,
      customerName:   params.customerName,
      customerPhone:  params.customerPhone,
      customerAddress: params.customerAddress,
      notes:           params.notes ?? null,
      total:          totalAfterDiscounts,
      commission,
      status:         "pendiente",
      createdAt:      new Date().toISOString(),
    };
  },

  /**
   * Cancels an order and atomically restores the stock of every item.
   * Prevents stock drift when an order is voided before fulfillment
   * (e.g. PROOF_AMOUNT_MISMATCH detected post-createFromCart).
   *
   * Idempotent: if the order is already "cancelado", returns early without
   * touching stock — safe to call multiple times (retry storms, double-clicks).
   *
   * @param tenantId - Tenant that owns the order (aislamiento multi-tenant).
   * @param orderId  - ID of the order to cancel (must belong to tenantId).
   * @param reason   - Short tag injected into order notes for audit trail.
   */
  async cancelOrderRestoreStock(
    tenantId: string,
    orderId: string,
    reason: string,
  ): Promise<void> {
    // Load order + items scoped to tenantId — cross-tenant guard.
    // eslint-disable-next-line no-restricted-properties -- aggregate: findUnique scoped a tenantId+id antes de la tx.
    const order = await prisma.order.findUnique({
      where:  { id: orderId, tenantId },
      select: {
        status: true,
        items:  { select: { productId: true, quantity: true, name: true } },
      },
    });

    // Idempotency guard: ya cancelado → nada que hacer.
    if (!order || order.status === "cancelado") return;

    try {
      // eslint-disable-next-line no-restricted-properties -- $transaction legítima: atomicidad order.update + stock restore para cerrar PENTEST-001 stock drift.
      await prisma.$transaction(async (tx) => {
        // 1. Marcar orden cancelada con audit tag en notes.
        // eslint-disable-next-line no-restricted-properties -- $transaction interna: order.update scoped a id+tenantId.
        await tx.order.update({
          where: { id: orderId, tenantId },
          data: {
            status:      "cancelado",
            cancelledAt: new Date(),
            notes:       `[${reason}: stock revertido automáticamente]`,
          },
        });

        // 2. Restaurar stock de cada item — solo productos que controlan
        // stock (productId != null). Productos sin productId (nombre libre
        // sin FK) no tienen fila en Product → skip.
        for (const item of order.items) {
          if (!item.productId) continue;
          // eslint-disable-next-line no-restricted-properties -- $transaction interna: product.updateMany scoped a id+tenantId para restore atomico.
          await tx.product.updateMany({
            where: { id: item.productId, tenantId, deletedAt: null },
            data:  { stock: { increment: item.quantity } },
          });
        }
      });
    } catch (err) {
      // Si la compensating falla, la orden queda pendiente pero el stock
      // ya fue decrementado — marcar [STOCK_DRIFT_RISK] para reconciliación.
      logger.error("[MarketplaceOrdersDB] cancelOrderRestoreStock failed — STOCK_DRIFT_RISK", {
        orderId,
        tenantId,
        reason,
        err: err instanceof Error ? err.message : String(err),
      });
      // Lazy-load Sentry (patrón del proyecto — no importar en top-level para
      // mantener el módulo usable en runtimes sin @sentry/nextjs configurado).
      import("@sentry/nextjs")
        .then((Sentry) => {
          Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
            extra: { orderId, tenantId, reason, marker: "STOCK_DRIFT_RISK" },
          });
        })
        .catch(() => { /* Sentry no disponible — logger.error ya capturó */ });
    }
  },

  /**
   * Atomically creates a PaymentApproval and links it to the Order in a single
   * transaction. Prevents the orphan-approval race condition (CR-2.2) where
   * paymentApproval.create succeeds but order.update fails, leaving the proof
   * unlinked and requiring manual intervention.
   *
   * @param tenantId  - Tenant that owns the order (aislamiento multi-tenant).
   * @param orderId   - ID of the order to link (must belong to tenantId).
   * @param approval  - PaymentApproval fields to persist.
   * @returns { approvalId } - ID of the created PaymentApproval.
   */
  async attachPaymentApproval(
    tenantId: string,
    orderId: string,
    approval: {
      approvalId: string;
      customerPhone: string;
      expectedAmount: number;
      imageUrl: string;
      yapeOpCode: string | null;
    },
  ): Promise<{ approvalId: string }> {
    // eslint-disable-next-line no-restricted-properties -- $transaction legítima: atomicidad paymentApproval.create + order.update para cerrar CR-2.2.
    await prisma.$transaction([
      prisma.paymentApproval.create({
        data: {
          id:             approval.approvalId,
          tenantId,
          customerPhone:  approval.customerPhone,
          expectedAmount: approval.expectedAmount,
          imageUrl:       approval.imageUrl,
          yapeOpCode:     approval.yapeOpCode,
          status:         "pending",
        },
      }),
      prisma.order.update({
        // where clause incluye tenantId para garantizar que el orderId
        // pertenece a este tenant — previene cross-tenant update.
        where: { id: orderId, tenantId },
        data:  { paymentApprovalId: approval.approvalId },
      }),
    ]);
    return { approvalId: approval.approvalId };
  },

  /**
   * FIX 2026-05-08 (audit Round 4): query de reconciliación para pedidos
   * donde falló la query de tier discount. Busca el tag TIER_DISCOUNT_FAILED
   * en notes — inyectado por createFromCart cuando prisma.order.count falla.
   * Uso: revisión periódica + reembolso manual del descuento perdido.
   */
  async findOrdersWithFailedTierDiscount(
    tenantId: string,
  ): Promise<Array<{ id: string; customerPhone: string | null; total: number; createdAt: Date; tierAuditTag: "TIER_DISCOUNT_FAILED" | "ANONYMOUS_NO_TIER" }>> {
    const rows = await prisma.order.findMany({
      where: {
        tenantId,
        source:    "marketplace",
        deletedAt: null,
        OR: [
          { notes: { contains: "TIER_DISCOUNT_FAILED" } },
          { notes: { contains: "ANONYMOUS_NO_TIER" } },
        ],
      },
      select: {
        id:            true,
        customerPhone: true,
        total:         true,
        createdAt:     true,
        notes:         true,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id:            r.id,
      customerPhone: r.customerPhone,
      total:         typeof r.total === "number" ? r.total : Number(r.total),
      createdAt:     r.createdAt,
      tierAuditTag:  (r.notes ?? "").includes("ANONYMOUS_NO_TIER")
        ? "ANONYMOUS_NO_TIER" as const
        : "TIER_DISCOUNT_FAILED" as const,
    }));
  },

  /**
   * Dashboard del vendedor: estadísticas de ventas, productos y pedidos recientes.
   * El tenantId del vendedor filtra únicamente sus datos.
   */
  async getVendorDashboard(tenantId: string): Promise<DbVendorDashboard> {
    const cacheKey = `marketplace:vendor:dashboard:${tenantId}`;

    return getOrSet(cacheKey, 60, async () => {
      const [allOrders, store] = await Promise.all([
        prisma.order.findMany({
          where: {
            tenantId,
            source:    "marketplace",
            deletedAt: null,
          },
          select: {
            id:           true,
            customerName: true,
            total:        true,
            status:       true,
            createdAt:    true,
            items: {
              select: { name: true, quantity: true, price: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take:    100,
        }),
        prisma.store.findFirst({
          where:  { tenantId },
          select: { id: true },
        }),
      ]);

      // TD-018: o.total es Decimal → convertir para suma
      const totalRevenue = allOrders.reduce((sum, o) => sum + toNumOrZero(o.total), 0);
      const pendingOrders = allOrders.filter(
        (o) => o.status === "pendiente" || o.status === "confirmado",
      ).length;

      // Agregar ventas por producto
      const productSales = new Map<string, { quantity: number; revenue: number }>();
      for (const order of allOrders) {
        for (const item of order.items) {
          const existing = productSales.get(item.name) ?? { quantity: 0, revenue: 0 };
          // TD-018: item.price es Decimal → convertir para aritmética
          const itemPriceNum = toNumOrZero(item.price);
          productSales.set(item.name, {
            quantity: existing.quantity + item.quantity,
            revenue:  existing.revenue + itemPriceNum * item.quantity,
          });
        }
      }

      const topProducts = Array.from(productSales.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      const totalProducts = store
        ? await prisma.storeProduct.count({ where: { storeId: store.id, isActive: true } })
        : 0;

      return {
        totalOrders:  allOrders.length,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProducts,
        pendingOrders,
        topProducts,
        recentOrders: allOrders.slice(0, 10).map((o) => ({
          id:           o.id,
          customerName: o.customerName,
          // TD-018: total es Decimal → serializar a number
          total:        toNumOrZero(o.total),
          status:       o.status,
          createdAt:    o.createdAt.toISOString(),
        })),
      };
    });
  },

  /**
   * Get today's marketplace orders for a specific tenant (for daily summary).
   */
  async getTodayOrders(tenantId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return prisma.order.findMany({
      where: {
        tenantId,
        source: "marketplace",
        createdAt: { gte: startOfDay },
        deletedAt: null,
      },
      select: {
        id: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
        items: { select: { name: true, quantity: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CR-1.1: métodos nuevos — migración de prisma.* directos en route handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Busca una tienda publicada por slug para el flujo de checkout.
   * Incluye vacationMode + hoursJson para bloquear órdenes fuera de horario.
   * Reemplaza el prisma.store.findFirst directo en POST /api/marketplace/orders.
   *
   * PENTEST 2026-05-18 Sprint C #11: renombrado desde getStoreForCheckout(_tenantId, slug)
   * que tenia un primer parametro tenantId fantasma (ignorado con underscore).
   * Era frágil porque (a) la firma mentia sobre el contrato, (b) cualquier
   * refactor futuro que quitara el guion bajo abria cross-tenant. Ahora el
   * nombre refleja la realidad: lookup público de tienda publicada por slug.
   * La guarda real es isPublished + tenant.active + slug.
   */
  async getPublishedStoreBySlug(
    slug: string,
  ): Promise<{
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    vacationMode: boolean;
    vacationMessage: string | null;
    hoursJson: unknown;
  } | null> {
    const store = await prisma.store.findFirst({
      where: {
        slug,
        isPublished: true,
        tenant: { active: true },
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        slug: true,
        vacationMode: true,
        vacationMessage: true,
      },
    });
    if (!store) return null;

    // hoursJson vive en la DB pero NO en el schema Prisma (expand-migrate-contract
    // en curso, ver app/api/marketplace/stores/route.ts:89). Leer aparte con raw.
    let hoursJson: unknown = null;
    try {
      const rows = await prisma.$queryRaw<Array<{ hoursJson: unknown }>>`
        SELECT "hoursJson" FROM "Store" WHERE id = ${store.id} LIMIT 1
      `;
      hoursJson = rows[0]?.hoursJson ?? null;
    } catch {
      hoursJson = null;
    }

    return { ...store, hoursJson };
  },

  /**
   * Lee una orden del marketplace por id + tenant. Solo retorna ordenes
   * con source="marketplace" y deletedAt=null. Util para pre-checks
   * (validacion de status transitions) sin tener que cargar items.
   *
   * Audit project-wide 2026-05-19 — migracion del pre-check directo
   * en /api/marketplace/orders/[id]/PATCH.
   */
  async getMarketplaceById(
    tenantId: string,
    orderId: string,
  ): Promise<{
    id: string;
    status: string;
    customerPhone: string | null;
    total: number;
  } | null> {
    const row = await prisma.order.findFirst({
      where: { id: orderId, source: "marketplace", tenantId, deletedAt: null },
      select: { id: true, status: true, customerPhone: true, total: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      customerPhone: row.customerPhone,
      total: Number(row.total),
    };
  },

  /**
   * Cambia el estado de una orden del marketplace con validación de transición,
   * historial de estado y reversión de comisiones si aplica.
   *
   * Reemplaza los prisma.order.findFirst / updateMany / findFirst + historial
   * directos en PATCH /api/marketplace/orders/[id].
   *
   * La validación de transición válida (VALID_TRANSITIONS) queda en el route
   * handler — este método es el ejecutor atómico.
   *
   * @param tenantId  - Tenant propietario de la orden (aislamiento multi-tenant).
   * @param orderId   - ID de la orden a modificar.
   * @param newStatus - Estado destino ya validado por el caller.
   * @param by        - Username del admin que ejecuta el cambio (audit trail).
   * @param cancelReason - Motivo de cancelación (solo cuando newStatus === "cancelado").
   */
  async changeStatus(
    tenantId: string,
    orderId: string,
    newStatus: string,
    by: string,
    cancelReason?: string,
  ): Promise<{ id: string; status: string; updatedAt: Date } | null> {
    // 1. Leer orden scoped por tenantId — guarda cross-tenant.
    const order = await prisma.order.findFirst({
      where: { id: orderId, source: "marketplace", tenantId, deletedAt: null },
      select: { id: true, status: true, customerPhone: true, total: true },
    });
    if (!order) return null;

    // 2. Update atómico scoped por tenantId — cierra TOCTOU window.
    const updateResult = await prisma.order.updateMany({
      where: { id: orderId, tenantId, deletedAt: null },
      data: {
        status: newStatus as OrderStatus,
        ...(newStatus === "cancelado" && {
          cancelReason: cancelReason ?? null,
          cancelledAt: new Date(),
        }),
      },
    });
    if (updateResult.count === 0) return null;

    // 3. Historial (fire-and-forget).
    prisma.orderStatusHistory.create({
      data: {
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order.status,
        toStatus: newStatus as OrderStatus,
        changedBy: by,
        note: cancelReason ?? null,
        tenantId,
      },
    }).catch((err) =>
      logger.warn("[MarketplaceOrdersDB.changeStatus] history insert failed", {
        error: String(err), orderId, tenantId,
      }),
    );

    // 4. Comisiones (fire-and-forget).
    if (newStatus === "entregado") {
      // P0-3 fix (audit 2026-05-23): el enum válido en CommissionLedger.status es
      // "settled" (no "cleared"). El cron de settlement filtra por status="settled"
      // — usar "cleared" silenciaba el ledger para payouts y dejaba marketplace_fee
      // en limbo. Ver lib/db/commissions.db.ts → CommissionStatus.
      prisma.commissionLedger
        .updateMany({
          where: { orderId, tenantId, status: "pending" },
          data: { status: "settled", settledAt: new Date() },
        })
        .catch((err) =>
          logger.warn("[MarketplaceOrdersDB.changeStatus] commission settle failed", {
            error: String(err), orderId,
          }),
        );
    } else if (newStatus === "cancelado") {
      prisma.commissionLedger
        .updateMany({
          where: { orderId, tenantId, status: "pending" },
          data: { status: "reversed" },
        })
        .catch((err) =>
          logger.warn("[MarketplaceOrdersDB.changeStatus] commission reverse failed", {
            error: String(err), orderId,
          }),
        );
    }

    // 5. Invalidar cache del tenant.
    invalidateByPrefix(`marketplace:orders:${tenantId}`);

    const updated = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true, status: true, updatedAt: true },
    });
    return updated ?? null;
  },

  /**
   * Cambia el estado de N órdenes del marketplace en lote, validando
   * transiciones individualmente y registrando historial por orden.
   *
   * Reemplaza los prisma.order.findMany / updateMany + historial directos
   * en POST /api/marketplace/orders/bulk.
   *
   * @param tenantId    - Tenant propietario de las órdenes.
   * @param orderIds    - IDs a procesar (max 200 por llamada).
   * @param newStatus   - Estado destino ya validado por el caller.
   * @param by          - Username del admin.
   * @param cancelReason - Motivo de cancelación (opcional).
   * @returns { updatedCount, skipped }
   */
  async bulkChangeStatus(
    tenantId: string,
    orderIds: string[],
    newStatus: string,
    by: string,
    cancelReason?: string,
  ): Promise<{ updatedCount: number; skipped: Array<{ id: string; reason: string }> }> {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      pendiente:  ["confirmado", "cancelado"],
      confirmado: ["preparando", "en_camino", "cancelado"],
      preparando: ["en_camino", "cancelado"],
      en_camino:  ["entregado", "cancelado"],
      entregado:  [],
      cancelado:  [],
    };

    const existing = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        tenantId,
        source: "marketplace",
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    const existingById = new Map(existing.map((o) => [o.id, o]));

    const updatable: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of orderIds) {
      const o = existingById.get(id);
      if (!o) { skipped.push({ id, reason: "no encontrado" }); continue; }
      const allowed = VALID_TRANSITIONS[o.status] ?? [];
      if (!allowed.includes(newStatus)) {
        skipped.push({ id, reason: `no se puede pasar de "${o.status}" a "${newStatus}"` });
        continue;
      }
      updatable.push(id);
    }

    if (updatable.length === 0) return { updatedCount: 0, skipped };

    const result = await prisma.order.updateMany({
      where: { id: { in: updatable }, tenantId, deletedAt: null },
      data: {
        status: newStatus as OrderStatus,
        ...(newStatus === "cancelado" && {
          cancelReason: cancelReason ?? null,
          cancelledAt: new Date(),
        }),
      },
    });

    // Brandon perf P0 #9: batch createMany en vez de N creates individuales.
    // Antes: 1 query × N ordenes (fire-and-forget secuencial en loop).
    // Ahora: 1 sola query para todo el lote — misma semántica fire-and-forget.
    const historyRows = updatable
      .map((id) => {
        const prev = existingById.get(id);
        if (!prev) return null;
        return {
          id: crypto.randomUUID(),
          orderId: id,
          fromStatus: prev.status,
          toStatus: newStatus as OrderStatus,
          changedBy: by,
          note: cancelReason ?? "bulk",
          tenantId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (historyRows.length > 0) {
      prisma.orderStatusHistory
        .createMany({ data: historyRows })
        .catch((err) =>
          logger.warn("[MarketplaceOrdersDB.bulkChangeStatus] history batch failed", {
            error: String(err),
          }),
        );
    }

    // Comisiones bulk (fire-and-forget).
    // P0-3 fix (audit 2026-05-23): enum válido = "settled" (no "cleared"). Ver
    // changeStatus arriba + lib/db/commissions.db.ts → CommissionStatus.
    if (newStatus === "entregado") {
      prisma.commissionLedger
        .updateMany({
          where: { orderId: { in: updatable }, tenantId, status: "pending" },
          data: { status: "settled", settledAt: new Date() },
        })
        .catch((err) =>
          logger.warn("[MarketplaceOrdersDB.bulkChangeStatus] commission clear failed", {
            error: String(err),
          }),
        );
    } else if (newStatus === "cancelado") {
      prisma.commissionLedger
        .updateMany({
          where: { orderId: { in: updatable }, tenantId, status: "pending" },
          data: { status: "reversed" },
        })
        .catch((err) =>
          logger.warn("[MarketplaceOrdersDB.bulkChangeStatus] commission reverse failed", {
            error: String(err),
          }),
        );
    }

    invalidateByPrefix("marketplace:orders");

    return { updatedCount: result.count, skipped };
  },
};
