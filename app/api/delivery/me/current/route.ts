import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";

/**
 * GET /api/delivery/me/current
 * Devuelve el assignment activo (status != delivered/cancelled) del partner
 * autenticado. Null si no tiene pedido en curso.
 */
export async function GET(req: NextRequest) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const assignment = await prisma.deliveryAssignment.findFirst({
    where: {
      partnerId: session.partnerId,
      status: { in: ["assigned", "picked_up", "in_transit"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        select: {
          id: true, customerName: true, customerPhone: true,
          customerLocation: true, customerReference: true,
          total: true, notes: true, status: true,
          items: { select: { name: true, quantity: true, unit: true } },
        },
      },
    },
  });

  if (!assignment) return NextResponse.json({ assignment: null });

  return NextResponse.json({
    assignment: {
      ...assignment,
      fee: Number(assignment.fee),
      order: { ...assignment.order, total: Number(assignment.order.total) },
    },
  });
}
