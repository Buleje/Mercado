import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError, ForbiddenError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

// Máquina de estados de transiciones válidas
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ["approved", "cancelled"],
  approved:   ["processing", "cancelled"],
  processing: ["shipped"],
  shipped:    ["delivered"],
  delivered:  [],
  cancelled:  [],
};

// Quién puede realizar cada transición
// seller: pending→approved, approved→processing, processing→shipped
// buyer:  shipped→delivered, cualquiera→cancelled
const SELLER_TRANSITIONS = new Set(["approved", "processing", "shipped"]);
const BUYER_TRANSITIONS  = new Set(["delivered", "cancelled"]);

const PatchSchema = z.object({
  status: z.enum(["approved", "processing", "shipped", "delivered", "cancelled"]),
  notes:  z.string().max(500).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  try {
    const { id } = await params;

    const order = await prisma.wholesaleOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) throw new NotFoundError("Orden mayorista");

    // Solo buyer o seller pueden ver la orden
    if (
      order.buyerTenantId  !== auth.tenantId &&
      order.sellerTenantId !== auth.tenantId
    ) {
      throw new ForbiddenError("No tienes acceso a esta orden");
    }

    return NextResponse.json({ data: order });
  } catch (err) {
    logger.error("[wholesale/orders/:id] GET error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();
  try {
    const { id } = await params;

    const body = await req.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { status: newStatus, notes } = parsed.data;

    const order = await prisma.wholesaleOrder.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundError("Orden mayorista");

    // Solo buyer o seller tienen acceso
    const isSeller = order.sellerTenantId === auth.tenantId;
    const isBuyer  = order.buyerTenantId  === auth.tenantId;
    if (!isSeller && !isBuyer) {
      throw new ForbiddenError("No tienes acceso a esta orden");
    }

    // Validar transición de estado
    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Transición inválida: ${order.status} → ${newStatus}`,
          allowedTransitions: allowed,
        },
        { status: 422 },
      );
    }

    // Validar quién puede hacer la transición
    if (SELLER_TRANSITIONS.has(newStatus) && !isSeller) {
      throw new ForbiddenError("Solo el vendedor puede realizar esta transición");
    }
    if (BUYER_TRANSITIONS.has(newStatus) && !isBuyer) {
      throw new ForbiddenError("Solo el comprador puede realizar esta transición");
    }

    const updated = await prisma.wholesaleOrder.update({
      where: { id },
      data: {
        status:    newStatus,
        updatedAt: new Date(),
        ...(notes !== undefined && { notes }),
      },
      include: { items: true },
    });

    logger.info("[wholesale/orders/:id] PATCH status updated", {
      orderId:   id,
      from:      order.status,
      to:        newStatus,
      tenantId:  auth.tenantId,
      traceId,
    });

    logActivity(
      "update",
      "wholesale_order",
      `Estado actualizado: ${order.status} → ${newStatus}`,
      id,
      auth.tenantId,
    ).catch(() => {});

    return NextResponse.json({ data: updated });
  } catch (err) {
    logger.error("[wholesale/orders/:id] PATCH error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
