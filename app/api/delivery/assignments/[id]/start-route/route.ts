import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";

/**
 * POST /api/delivery/assignments/[id]/start-route
 *
 * El repartidor inicia la ruta hacia el cliente.
 * Transicion de estado del assignment: assigned | picked_up → in_transit.
 * Persiste routeStartedAt en DeliveryAssignment.
 * El Order.status se actualiza a "en_camino" via prisma (OrdersDB no expone
 * este estado desde delivery — la transicion la controla el admin panel).
 *
 * Auth: cookie buleje-partner-sess (DeliveryPartner).
 * Ownership: assignment.partnerId === session.partnerId.
 */

const ParamsSchema = z.object({ id: z.string().min(1) });

const ALLOWED_FROM_STATES = ["assigned", "picked_up"];

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const rawParams = await ctx.params;
  const parsedParams = ParamsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Params inválidos" }, { status: 400 });
  }
  const { id: assignmentId } = parsedParams.data;

  // Round 11 M004: audit log de Order status update + DeliveryAssignment.
  return runWithAuditContext(req, `partner:${session.partnerId}`, () =>
    startRouteHandler(assignmentId, session.partnerId),
  );
}

async function startRouteHandler(
  assignmentId: string,
  partnerId: string,
): Promise<NextResponse> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-properties -- DeliveryAssignmentsDB pendiente
      const assignment = await tx.deliveryAssignment.findUnique({
        where: { id: assignmentId },
        select: {
          id: true,
          partnerId: true,
          orderId: true,
          status: true,
          tenantId: true,
          routeStartedAt: true,
        },
      });

      if (!assignment) return { error: "Assignment no encontrado", code: 404 };
      if (assignment.partnerId !== partnerId) {
        return { error: "Assignment no es tuyo", code: 403 };
      }
      if (!ALLOWED_FROM_STATES.includes(assignment.status)) {
        return {
          error: `No podés iniciar ruta desde estado "${assignment.status}"`,
          code: 409,
        };
      }

      const now = new Date();

      // eslint-disable-next-line no-restricted-properties -- DeliveryAssignmentsDB pendiente
      await tx.deliveryAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "in_transit",
          routeStartedAt: assignment.routeStartedAt ?? now,
        },
      });

      // Sincronizar Order.status → "en_camino"
      // eslint-disable-next-line no-restricted-properties -- OrdersDB.updateStatus no expone delivery transitions
      await tx.order.update({
        where: { id: assignment.orderId },
        data: { status: "en_camino" },
      });

      return {
        ok: true,
        orderId: assignment.orderId,
        tenantId: assignment.tenantId,
      };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }

    logger.info("[delivery/start-route]", {
      partnerId,
      assignmentId,
      orderId: result.orderId,
    });

    logActivity(
      "delivery_start_route",
      "DeliveryAssignment",
      JSON.stringify({ assignmentId, orderId: result.orderId }),
      assignmentId,
      partnerId,
      undefined,
      result.tenantId,
    ).catch((err) => {
      logger.error("[delivery/start-route] logActivity failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    return NextResponse.json({ ok: true, status: "en_camino" });
  } catch (err) {
    logger.error("[delivery/start-route] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al iniciar ruta" }, { status: 500 });
  }
}
