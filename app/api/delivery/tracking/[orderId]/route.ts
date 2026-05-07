import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_SESSION, getCustomerPayload } from "@/lib/auth/customer-session";
import { tryAdmin } from "@/lib/require-admin";

/**
 * GET /api/delivery/tracking/[orderId]
 *
 * SECURITY 2026-05-06 (audit delivery #4): autorización requerida. Antes el
 * endpoint era totalmente público — cualquiera con un orderId enumerable
 * obtenía nombre + teléfono del repartidor + GPS en vivo. PII filtrable a
 * scrapers o competidores. Ahora exige una de:
 *   1. Sesión admin del tenant del order
 *   2. Sesión customer cuyo phone matchee el del order
 *   3. Token compartido HMAC vía /tracking/share (caso público controlado)
 *
 * Este endpoint NO maneja tokens compartidos (ese flujo va por
 * /api/delivery/tracking/share/[token]). Solo cliente+admin.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    // 1. Validar order existe
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tenantId: true, customerPhone: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: "No hay delivery asignado para esta orden" },
        { status: 404 },
      );
    }

    // 2. Autorizar caller
    const admin = await tryAdmin(req);
    let authorized = false;
    if (admin && admin.tenantId === order.tenantId) {
      authorized = true;
    } else {
      const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
      if (sessionToken) {
        const payload = await getCustomerPayload(sessionToken);
        const sessionPhone = (payload?.customerId ?? "").replace(/\D/g, "");
        const orderPhone = (order.customerPhone ?? "").replace(/\D/g, "");
        if (sessionPhone && orderPhone && sessionPhone === orderPhone) {
          authorized = true;
        }
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId },
      include: {
        partner: { select: { name: true, phone: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "No hay delivery asignado para esta orden" },
        { status: 404 }
      );
    }

    // Leer coordenadas GPS almacenadas en notes (JSON temporal sin migración)
    let trackingLat: number | null = null;
    let trackingLng: number | null = null;
    let trackingUpdatedAt: string | null = null;
    try {
      if (assignment.notes) {
        const notesData = JSON.parse(assignment.notes);
        trackingLat = typeof notesData.trackingLat === "number" ? notesData.trackingLat : null;
        trackingLng = typeof notesData.trackingLng === "number" ? notesData.trackingLng : null;
        trackingUpdatedAt = notesData.trackingUpdatedAt ?? null;
      }
    } catch {
      // notes no es JSON válido — ignorar
    }

    return NextResponse.json({
      status: assignment.status,
      partnerName: assignment.partner.name,
      partnerPhone: assignment.partner.phone,
      fee: assignment.fee,
      pickedUpAt: assignment.pickedUpAt,
      deliveredAt: assignment.deliveredAt,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      trackingLat,
      trackingLng,
      trackingUpdatedAt,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
