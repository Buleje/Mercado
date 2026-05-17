import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { notifyDriverInternal } from "@/lib/delivery/notify-driver";

// SECURITY 2026-05-06 (audit delivery #11): cap de tamaño en photo+signature
// para evitar inflar la DB con base64 grandes (5+MB cada uno → bloat). Cada
// imagen base64 ≤ ~7.5MB de string (≈5MB de imagen real).
const MAX_BASE64_SIZE = 7_500_000;

const BodySchema = z.object({
  orderId: z.string().min(1, "orderId requerido"),
  photo: z.string().max(MAX_BASE64_SIZE, "photo excede el tamaño máximo (5MB)").optional(),
  signature: z.string().max(MAX_BASE64_SIZE, "signature excede el tamaño máximo (5MB)").optional(),
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
  // Round 15 M004: audit log de Order entregado + DeliveryAssignment delivered.
  return runWithAuditContext(req, auth.username, () => confirmHandler(req, auth));
}

async function confirmHandler(
  req: NextRequest,
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
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

    // SECURITY 2026-05-05 (pentest delivery H004): tenant scope. Antes admin
    // de A podía marcar como entregado un pedido de B con WhatsApp engañoso.
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: { orderId, tenantId: auth.tenantId },
      include: {
        order: {
          select: {
            id: true,
            tenantId: true,
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
    // SECURITY 2026-05-07 (CRM-SEC F1): tenantId en ambos updates para evitar
    // que admin de tenant A confirme entregas de tenant B con orderId conocido.
    const [updatedAssignment] = await prisma.$transaction([
      prisma.deliveryAssignment.update({
        where: { orderId, tenantId: auth.tenantId },
        data: {
          status: "delivered",
          deliveredAt: new Date(),
          notes: evidenceJson,
        },
        select: { id: true, status: true, deliveredAt: true },
      }),
      prisma.order.update({
        where: { id: orderId, tenantId: auth.tenantId },
        data: { status: "entregado" },
      }),
    ]);

    // Audit 2026-05-17 03-P2-1: SSRF mitigation — fetch HTTP a /api/delivery/notify
    // con cookie forward es vector de leak si NEXT_PUBLIC_BASE_URL fuera
    // manipulada en build (env-injection). Reemplazado por llamada directa
    // a notifyDriverInternal (misma defensa que ya se aplicó en assignments).
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    if (assignment.order.customerPhone) {
      notifyDriverInternal({
        tenantId: auth.tenantId,
        partnerId: assignment.partnerId,
        orderId,
        message: `Tu pedido fue entregado por ${assignment.partner.name}. Gracias por tu compra!`,
      }).catch((err) =>
        logger.error("[delivery/confirm] notify-driver failed", {
          error: String(err),
          orderId,
        }),
      );

      // Fire-and-forget: enviar link de calificación por WhatsApp (30s delay via setTimeout no disponible en serverless, se envía inmediato en segundo mensaje)
      const ratingUrl = `${baseUrl}/marketplace/calificar-entrega?id=${updatedAssignment.id}`;
      const customerName = assignment.order.customerName?.split(" ")[0] ?? "vecino";
      (await import("@/lib/whatsapp")).sendWhatsAppQueued(
        assignment.order.customerPhone!,
        `⭐ ¡Hola ${customerName}! ¿Cómo fue tu entrega con ${assignment.partner.name}?\n\nCalifica aquí en 10 segundos 👉 ${ratingUrl}\n\nTu opinión nos ayuda a mejorar 🙏`,
        { tenantId: assignment.order.tenantId ?? "main", context: "delivery-confirm-rating" },
      ).catch((err) => logger.warn("[crm-sec] op failed", { err: String(err) }));
    }

    // Fire-and-forget: log de actividad
    logActivity(
      "Entregar",
      "deliveryAssignment",
      `Entrega confirmada por ${auth.username} — orden ${orderId}`,
      assignment.id,
      auth.username
    ).catch((err) => logger.error("[delivery/confirm] operation failed", { error: String(err) }));

    return NextResponse.json({
      success: true,
      assignmentId: updatedAssignment.id,
      deliveredAt: updatedAssignment.deliveredAt,
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
