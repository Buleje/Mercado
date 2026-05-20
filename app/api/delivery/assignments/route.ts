import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { DeliveryAssignmentsDB } from "@/lib/db/delivery-assignments.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { notifyDriverInternal } from "@/lib/delivery/notify-driver";

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

    // Audit project-wide 2026-05-19: migrado a DeliveryAssignmentsDB.
    // SECURITY 2026-05-05 (CT-06): scope tenantId obligatorio en la clase.
    const assignments = await DeliveryAssignmentsDB.listByTenant(auth.tenantId, {
      status: status ?? undefined,
      partnerId: partnerId ?? undefined,
      date: date ?? undefined,
    });

    return NextResponse.json(assignments);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[delivery/assignments] GET failed", {
      error: detail,
      stack: err instanceof Error ? err.stack : undefined,
      tenantId: auth.tenantId,
    });
    // En dev exponemos el error real en el body para diagnosticar desde el browser.
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
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

    // SECURITY 2026-05-05 (pentest delivery H010): scope tenant en order + partner.
    const order = await DeliveryAssignmentsDB.findOrderInTenant(auth.tenantId, orderId);
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const partnerOk = await DeliveryAssignmentsDB.findActivePartnerInTenant(auth.tenantId, partnerId);
    if (!partnerOk) {
      return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
    }

    // Verificar que no tiene asignación previa
    const existing = await DeliveryAssignmentsDB.findAssignmentByOrder(orderId);
    if (existing) {
      return NextResponse.json(
        { error: "La orden ya tiene un delivery asignado" },
        { status: 422 }
      );
    }

    const assignment = await DeliveryAssignmentsDB.createAssignment({
      tenantId: auth.tenantId,
      orderId,
      partnerId,
      fee,
    });

    logActivity(
      "Asignar",
      "deliveryAssignment",
      `Delivery asignado a orden ${orderId} — partner ${assignment.partner.name}`,
      assignment.id,
      auth.username
    ).catch((err) => logger.error("[delivery/assignments] operation failed", { error: String(err), tenantId: auth.tenantId }));

    // Fire-and-forget: notificar al repartidor via WhatsApp/email.
    // SECURITY fix 2026-05-07 (SSRF + cookie leak): llamada directa a la
    // función interna en lugar de fetch HTTP con cookie forwarding.
    notifyDriverInternal({
      tenantId: auth.tenantId,
      partnerId,
      orderId,
      message: `Nuevo pedido asignado!\nCliente: ${assignment.order.customerName}\nDireccion: ${assignment.order.customerLocation || "Sin direccion"}\nTotal: S/ ${assignment.order.total.toFixed(2)}\nRecoge en: Bodega`,
    }).catch((err) => logger.error("[delivery/assignments] notify-driver failed", { error: String(err), tenantId: auth.tenantId }));

    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    logger.error("[delivery/assignments] POST failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      tenantId: auth.tenantId,
    });
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

    // SECURITY 2026-05-05 (pentest delivery H010): scope tenant en lookup.
    const current = await DeliveryAssignmentsDB.findAssignmentInTenant(auth.tenantId, id);
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

    const updated = await DeliveryAssignmentsDB.updateAssignmentStatus(
      id,
      status,
      status === "delivered" ? { deliveredAt: new Date() } : undefined,
    );

    logActivity(
      "Actualizar",
      "deliveryAssignment",
      `Estado actualizado: ${current.status} → ${status}`,
      id,
      auth.username
    ).catch((err) => logger.error("[delivery/assignments] operation failed", { error: String(err) }));

    // Fire-and-forget: WhatsApp tracking update to customer
    if (updated.order?.customerPhone) {
      const customerName = updated.order.customerName?.split(" ")[0] ?? "vecino";
      const driverName = updated.partner?.name ?? "tu repartidor";
      const trackingMessages: Record<string, string> = {
        picked_up: `📦 ¡Hola ${customerName}! ${driverName} ya recogió tu pedido de la tienda. Pronto estará en camino hacia ti. 🏃`,
        in_transit: `🛵 ¡${customerName}, tu pedido va en camino! ${driverName} ya salió hacia tu dirección. Prepárate para recibirlo.`,
        delivered: `✅ ¡Listo! Tu pedido ha sido entregado. ¡Gracias por tu compra! 🎉`,
      };
      const msg = trackingMessages[status];
      if (msg) {
        await sendWhatsAppQueued(updated.order.customerPhone, msg, { tenantId: auth.tenantId, context: `delivery/assignments:${status}` }).catch((err) => logger.error("[delivery/assignments] WhatsApp enqueue fallback failed", { error: String(err), tenantId: auth.tenantId }));
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    logger.error("[delivery/assignments] PATCH failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
