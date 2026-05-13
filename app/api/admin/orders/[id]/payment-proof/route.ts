/**
 * @prisma-direct ok — endpoint cross-tenant para superadmin + admin del
 * mismo tenant. El guard `auth.tenantId !== order.tenantId` se valida en
 * runtime antes de la lectura del PaymentApproval. Migrar a clase
 * `lib/db/payment-approvals.db.ts` cuando se centralice el patrón.
 *
 * GET /api/admin/orders/[id]/payment-proof
 *
 * Retorna el PaymentApproval (captura del Yape/Plin/Transfer) asociado
 * a la Order. Usado por:
 *   - components/admin/OrdersTab/OrdersDetailPanel.tsx
 *   - components/admin/unified/marketplace/OrderDetailDrawer.tsx
 *   - components/superadmin/orders/...
 *
 * El admin que consulte debe pertenecer al mismo tenant que la Order
 * (excepto superadmin que puede ver cualquiera).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    // eslint-disable-next-line no-restricted-properties -- cross-tenant: superadmin + admin del mismo tenant, validado abajo
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        paymentApprovalId: true,
        paymentMethod: true,
        yapeOperationNumber: true,
        total: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    // Multi-tenant guard: solo admin del mismo tenant (superadmin pasa porque
    // tenantId === "main" o role especial)
    const isSuperadmin =
      auth.tenantId === "main" ||
      ("role" in auth && (auth as { role?: string }).role === "superadmin");
    if (!isSuperadmin && order.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!order.paymentApprovalId) {
      return NextResponse.json({ proof: null });
    }

    // eslint-disable-next-line no-restricted-properties -- ya validamos tenant arriba; PaymentApproval no tiene clase DB dedicada todavía
    const approval = await prisma.paymentApproval.findUnique({
      where: { id: order.paymentApprovalId },
      select: {
        id: true,
        imageUrl: true,
        status: true,
        expectedAmount: true,
        detectedAmount: true,
        yapeOpCode: true,
        yapeLast4: true,
        yapeDate: true,
        rejectionReason: true,
        reviewedBy: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    if (!approval) {
      return NextResponse.json({ proof: null });
    }

    return NextResponse.json({
      proof: {
        id: approval.id,
        imageUrl: approval.imageUrl,
        status: approval.status,
        method: order.paymentMethod ?? null,
        expectedAmount: Number(approval.expectedAmount),
        detectedAmount: approval.detectedAmount
          ? Number(approval.detectedAmount)
          : null,
        opCode: approval.yapeOpCode ?? order.yapeOperationNumber ?? null,
        last4: approval.yapeLast4 ?? null,
        paidAt: approval.yapeDate?.toISOString() ?? null,
        rejectionReason: approval.rejectionReason ?? null,
        reviewedBy: approval.reviewedBy ?? null,
        reviewedAt: approval.reviewedAt?.toISOString() ?? null,
        createdAt: approval.createdAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[admin/orders/payment-proof] GET failed", {
      error: String(err),
      orderId: id,
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
