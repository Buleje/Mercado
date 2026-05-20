import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { WholesaleOrdersDB } from "@/lib/db/wholesale-orders.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const COMMISSION_RATE = 0.05; // 5% por defecto

const CreateOrderSchema = z.object({
  sellerTenantId: z.string().min(1),
  notes:          z.string().max(500).optional(),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity:  z.number().int().min(1),
      unitPrice: z.number().positive(),
    }),
  ).min(1),
});

type VolumeTier = { minQty: number; discount: number };

/**
 * Devuelve el porcentaje de descuento por volumen aplicable (0 si ninguno aplica).
 * Los tiers deben estar ordenados de mayor a menor minQty para obtener el mejor tramo.
 */
function resolveVolumeDiscount(tiers: VolumeTier[], quantity: number): number {
  // Buscar el tramo de mayor minQty que no supere la cantidad pedida
  const applicable = [...tiers]
    .sort((a, b) => b.minQty - a.minQty)
    .find((t) => quantity >= t.minQty);
  return applicable?.discount ?? 0;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  try {
    // Audit project-wide 2026-05-19: migrado a WholesaleOrdersDB.
    const orders = await WholesaleOrdersDB.listForTenant(auth.tenantId, 100);

    return NextResponse.json({ data: orders, total: orders.length });
  } catch (err) {
    logger.error("[wholesale/orders] GET error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "wholesale-orders"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  try {
    const body = await req.json();
    const parsed = CreateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { sellerTenantId, items, notes } = parsed.data;

    // No se puede comprar a sí mismo
    if (sellerTenantId === auth.tenantId) {
      return NextResponse.json(
        { error: "No puedes crear una orden mayorista hacia tu propio tenant" },
        { status: 400 },
      );
    }

    // Obtener nombres de productos y tiers de precio por volumen del vendedor
    const productIds = items.map((i) => i.productId);
    // FIX: scoped to sellerTenantId (antes findMany cross-tenant leak posible)
    const products = await WholesaleOrdersDB.getProductNamesForSeller(sellerTenantId, productIds);
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    // Buscar tienda del vendedor para leer sus volumePricingTiers
    const sellerStore = await WholesaleOrdersDB.findSellerStore(sellerTenantId);

    const sellerStoreProducts = sellerStore
      ? await WholesaleOrdersDB.getStoreProductsWithTiers(sellerStore.id, productIds)
      : [];

    const tiersMap = new Map(
      sellerStoreProducts.map((sp) => [
        sp.productId,
        (sp.volumePricingTiers as VolumeTier[] | null) ?? [],
      ]),
    );

    // Calcular items con descuento por volumen aplicado — server-side
    const resolvedItems = items.map((item) => {
      const tiers           = tiersMap.get(item.productId) ?? [];
      const discountPct     = resolveVolumeDiscount(tiers, item.quantity);
      const discountedPrice = item.unitPrice * (1 - discountPct / 100);
      const roundedPrice    = Math.round(discountedPrice * 100) / 100;
      return {
        productId:       item.productId,
        name:            productMap.get(item.productId) ?? `Producto #${item.productId}`,
        quantity:        item.quantity,
        unitPrice:       roundedPrice,
        total:           Math.round(item.quantity * roundedPrice * 100) / 100,
        appliedDiscount: discountPct,
      };
    });

    // Calcular total server-side (nunca confiar en el cliente)
    const total      = resolvedItems.reduce((acc, item) => acc + item.total, 0);
    const commission = Math.round(total * COMMISSION_RATE * 100) / 100;

    const order = await WholesaleOrdersDB.createOrder({
      buyerTenantId: auth.tenantId,
      sellerTenantId,
      total,
      commission,
      notes,
      items: resolvedItems,
    });

    logger.info("[wholesale/orders] POST created", {
      orderId:  order.id,
      buyer:    auth.tenantId,
      seller:   sellerTenantId,
      total,
      traceId,
    });

    logActivity(
      "create",
      "wholesale_order",
      `Orden mayorista creada: ${order.id} (total S/${order.total})`,
      order.id,
      auth.tenantId,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({ data: order }, { status: 201 });
  } catch (err) {
    logger.error("[wholesale/orders] POST error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
