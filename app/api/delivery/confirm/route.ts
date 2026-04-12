import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  orderId: z.string().min(1, "orderId requerido"),
  photo: z.string().optional(),     // base64 PNG/JPEG
  signature: z.string().optional(), // base64 PNG
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/delivery/confirm
 * Confirma la entrega de un pedido.
 * Actualiza DeliveryAssignment a "delivered" y Order a "entregado".
 * Guarda foto y firma como texto en el campo notes del assignment (JSON).
 * Fire-and-forget: notificación al cliente + logActivity.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues.map((i) => i.message),
        },
        { status: 400 }
      );
    }

    const { orderId, photo, signature, notes } = parsed.data;

    // Verificar que la orden y su asignación existen
    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { orderId },
      include: {
        order: {
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            total: true,
            status: true,
          },
        },
        partner: { select: { id: true, name: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Asignación no encontrada para esta orden" },
        { status: 404 }
      );
    }

    if (assignment.status === "delivered") {
      return NextResponse.json(
        { error: "Esta entrega ya fue confirmada" },
        { status: 422 }
      );
    }

    // Serializar evidencia como JSON en el campo notes del assignment
    const evidenceJson = JSON.stringify({
      confirmedAt: new Date().toISOString(),
      confirmedBy: auth.username,
      notes: notes ?? null,
      hasPhoto: Boolean(photo),
      hasSignature: Boolean(signature),
      // Guardar las imágenes directamente en el campo.
      // En producción con muchos pedidos, migrar a Vercel Blob.
      photo: photo ?? null,
      signature: signature ?? null,
    });

    // Transacción: actualizar assignment + orden en paralelo atómico
    const [updatedAssignment] = await prisma.$transaction([
      prisma.deliveryAssignment.update({
        where: { orderId },
        data: {
          status: "delivered",
          deliveredAt: new Date(),
          notes: evidenceJson,
        },
        select: { id: true, status: true, deliveredAt: true },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: "entregado" },
      }),
    ]);

    // Fire-and-forget: notificar al cliente por WhatsApp
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    if (assignment.order.customerPhone) {
      fetch(`${baseUrl}/api/delivery/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({
          partnerId: assignment.partnerId,
          orderId,
          message: `Tu pedido fue entregado por ${assignment.partner.name}. Gracias por tu compra!`,
        }),
      }).catch(() => {});

      // Fire-and-forget: enviar link de calificación por WhatsApp (30s delay via setTimeout no disponible en serverless, se envía inmediato en segundo mensaje)
      const ratingUrl = `${baseUrl}/marketplace/calificar-entrega?id=${updatedAssignment.id}`;
      const customerName = assignment.order.customerName?.split(" ")[0] ?? "vecino";
      import("@/lib/whatsapp").then(({ sendWhatsAppText }) => {
        sendWhatsAppText(
          assignment.order.customerPhone!,
          `⭐ ¡Hola ${customerName}! ¿Cómo fue tu entrega con ${assignment.partner.name}?\n\nCalifica aquí en 10 segundos 👉 ${ratingUrl}\n\nTu opinión nos ayuda a mejorar 🙏`
        ).catch(() => {});
      }).catch(() => {});
    }

    // Fire-and-forget: log de actividad
    logActivity(
      "Entregar",
      "deliveryAssignment",
      `Entrega confirmada por ${auth.username} — orden ${orderId}`,
      assignment.id,
      auth.username
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      assignmentId: updatedAssignment.id,
      deliveredAt: updatedAssignment.deliveredAt,
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
