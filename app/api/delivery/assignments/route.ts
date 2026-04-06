export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";

const VALID_TRANSITIONS: Record<string, string[]> = {
  assigned: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["delivered"],
};

const AssignmentPostSchema = z.object({
  orderId: z.string().min(1, "orderId requerido"),
  partnerId: z.string().min(1, "partnerId requerido"),
  fee: z.number().nonnegative("La tarifa debe ser >= 0"),
});

const AssignmentPatchSchema = z.object({
  id: z.string().min(1, "id requerido"),
  status: z.enum(["picked_up", "in_transit", "delivered"]),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const partnerId = searchParams.get("partnerId");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (partnerId) where.partnerId = partnerId;
    if (date) {
      const from = new Date(date);
      from.setHours(0, 0, 0, 0);
      const to = new Date(date);
      to.setHours(23, 59, 59, 999);
      where.createdAt = { gte: from, lte: to };
    }

    const assignments = await prisma.deliveryAssignment.findMany({
      where,
      include: {
        order: { select: { id: true, customerName: true, total: true } },
        partner: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(assignments);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = AssignmentPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { orderId, partnerId, fee } = parsed.data;

    // Verificar que la orden existe
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // Verificar que no tiene asignación previa
    const existing = await prisma.deliveryAssignment.findUnique({ where: { orderId } });
    if (existing) {
      return NextResponse.json(
        { error: "La orden ya tiene un delivery asignado" },
        { status: 422 }
      );
    }

    const assignment = await prisma.deliveryAssignment.create({
      data: { orderId, partnerId, fee },
      include: {
        order: { select: { id: true, customerName: true, total: true, customerLocation: true } },
        partner: { select: { id: true, name: true, phone: true } },
      },
    });

    logActivity(
      "Asignar",
      "deliveryAssignment",
      `Delivery asignado a orden ${orderId} — partner ${assignment.partner.name}`,
      assignment.id,
      auth.username
    ).catch(() => {});

    // Fire-and-forget: notificar al repartidor via WhatsApp/email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `http://localhost:3000`;
    fetch(`${baseUrl}/api/delivery/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Reenviar la cookie de sesión para que requireAdmin pueda validar
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        partnerId,
        orderId,
        message: `Nuevo pedido asignado!\nCliente: ${assignment.order.customerName}\nDireccion: ${assignment.order.customerLocation || "Sin direccion"}\nTotal: S/ ${assignment.order.total.toFixed(2)}\nRecoge en: Bodega`,
      }),
    }).catch(() => {});

    return NextResponse.json(assignment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = AssignmentPatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const { id, status } = parsed.data;

    const current = await prisma.deliveryAssignment.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Asignación no encontrada" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Transición inválida: ${current.status} → ${status}` },
        { status: 422 }
      );
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id },
      data: {
        status,
        ...(status === "delivered" && { deliveredAt: new Date() }),
      },
    });

    logActivity(
      "Actualizar",
      "deliveryAssignment",
      `Estado actualizado: ${current.status} → ${status}`,
      id,
      auth.username
    ).catch(() => {});

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
