import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { type DbMarketplaceOrder, type DbVendorDashboard } from "./types";

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
    // Constante: 100 puntos = S/1
    const LOYALTY_POINTS_PER_SOL = 100;

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
        select: { id: true, discountType: true, discountValue: true, maxUses: true, usedCount: true },
      });
      if (!coupon) {
        throw new Error("Cupón inválido o expirado");
      }
      // Validar cupo disponible (maxUses=0 o null → ilimitado)
      const maxUsesVal = coupon.maxUses ?? 0;
      if (maxUsesVal > 0 && toNumOrZero(coupon.usedCount) >= maxUsesVal) {
        throw new Error("Cupón ya alcanzó el límite de usos");
      }
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
      loyaltyDiscount = parseFloat((redeemPoints / LOYALTY_POINTS_PER_SOL).toFixed(2));
    }

    // Total final con todos los descuentos (no puede ser negativo)
    const totalAfterDiscounts = parseFloat(
      Math.max(0, total - couponDiscount - loyaltyDiscount).toFixed(2)
    );

    // TD-018: store.commission es Decimal → convertir para toFixed()
    const commissionRate = toNumOrZero(store.commission);
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

    // 4. Transacción atómica: stock + order + commission + cupón + loyalty (F4, F1)
    // eslint-disable-next-line no-restricted-properties -- $transaction legítima: operaciones atómicas multi-tabla en marketplace checkout.
    await prisma.$transaction(async (tx) => {
      // F4: decrementar stock — SKIP cuando producto no controla stock (null).
      // Semantica:
      //   - stock IS NULL → restaurante/servicio sin inventario → permitido, no decrement.
      //   - stock = 0   → agotado → throw 409 (frontend debe haberlo bloqueado antes).
      //   - stock > 0   → decrementar con guard atomico (stock >= quantity).
      for (const item of orderItems) {
        const storeProduct = storeProducts.find(
          (sp) => sp.id === params.items.find((pi) => pi.productId === item.productId && pi.name === item.name)?.storeProductId
        );
        if (!storeProduct?.productId) continue;

        // Lookup stock actual para distinguir null (no controla) vs 0 (agotado).
        // eslint-disable-next-line no-restricted-properties -- $transaction interna: lookup scoped a productId+tenantId para stock semantics.
        const current = await tx.product.findFirst({
          where: { id: storeProduct.productId, tenantId: store.tenantId, deletedAt: null },
          select: { stock: true },
        });
        if (!current) {
          throw new Error(`Producto no disponible: ${item.name}`);
        }
        if (current.stock == null) {
          // No controla stock → permitido sin decrement.
          continue;
        }
        if (current.stock < item.quantity) {
          throw new Error(
            `Stock insuficiente para ${item.name} (quedan ${current.stock}, pediste ${item.quantity})`,
          );
        }

        // eslint-disable-next-line no-restricted-properties -- $transaction interna: decrement con guard atomico para cerrar race window.
        const upd = await tx.product.updateMany({
          where: {
            id:        storeProduct.productId,
            tenantId:  store.tenantId,
            stock:     { gte: item.quantity },
            deletedAt: null,
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (upd.count === 0) {
          // Otro pedido tomó el stock entre el lookup y este update.
          throw new Error(`Stock insuficiente para ${item.name}`);
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
          notes:            composedNotes,
          paymentMethod:    params.paymentMethod || "marketplace",
          updatedAt:        new Date(),
          items: {
            create: orderItems,
          },
        },
      });

      // Registrar comisión
      // eslint-disable-next-line no-restricted-properties -- $transaction interna: commissionLedger.create scoped a tenantId.
      await tx.commissionLedger.create({
        data: {
          id:       crypto.randomUUID(),
          orderId:  fullOrderId,
          storeId:  store.id,
          type:     "sale",
          amount:   commission,
          rate:     store.commission,
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
};
