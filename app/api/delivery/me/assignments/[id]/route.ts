import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DeliveryNotifyDB } from "@/lib/db/delivery.db";

/**
 * GET /api/delivery/me/assignments/[id]
 * Devuelve el assignment del partner autenticado con datos del order.
 * 404 si no es del partner (anti cross-partner peek).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  // eslint-disable-next-line no-restricted-properties -- TODO: extraer a DeliveryAssignmentsDB
  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true, customerName: true, customerPhone: true,
          customerLocation: true, customerReference: true,
          total: true, notes: true, status: true, createdAt: true,
          items: { select: { name: true, quantity: true, unit: true } },
        },
      },
    },
  });

  if (!assignment || assignment.partnerId !== session.partnerId) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  // Re-firmar proofPhotoUrl si existe — las signed URLs de Supabase expiran en
  // 1h. Sin esto el admin/rider ve imagen rota al abrir el assignment horas
  // después de la entrega.
  let notesObj: Record<string, unknown> | null = null;
  if (assignment.notes) {
    try {
      const parsed = JSON.parse(assignment.notes) as Record<string, unknown>;
      if (
        typeof parsed.proofPhotoPath === "string" &&
        typeof parsed.proofPhotoUrl === "string"
      ) {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.storage
          .from("media")
          .createSignedUrl(parsed.proofPhotoPath, 3600);
        if (!error && data?.signedUrl) {
          parsed.proofPhotoUrl = data.signedUrl;
          parsed.proofPhotoUrlExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
        }
      }
      notesObj = parsed;
    } catch {
      // notes no era JSON — devolvemos el string original sin modificar
    }
  }

  return NextResponse.json({
    assignment: {
      ...assignment,
      notes: notesObj !== null ? JSON.stringify(notesObj) : assignment.notes,
      fee: Number(assignment.fee),
      order: { ...assignment.order, total: Number(assignment.order.total) },
    },
  });
}

/**
 * PATCH /api/delivery/me/assignments/[id]
 * Body: { status: "picked_up" | "in_transit" | "delivered" | "cancelled" }
 *
 * Transiciones permitidas:
 *   assigned → picked_up | cancelled
 *   picked_up → in_transit | delivered | cancelled
 *   in_transit → delivered | cancelled
 *   delivered/cancelled → terminal (no más transiciones)
 *
 * Al pasar a delivered/cancelled libera el currentOrderId del partner.
 */
const PatchSchema = z.object({
  status: z.enum(["picked_up", "in_transit", "delivered", "cancelled"]),
});

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  assigned: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "delivered", "cancelled"],
  in_transit: ["delivered", "cancelled"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line no-restricted-properties -- TODO: extraer a DeliveryAssignmentsDB
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findUnique({
        where: { id },
        select: { id: true, partnerId: true, orderId: true, status: true, tenantId: true, notes: true },
      });
      if (!assignment) return { error: "Assignment no encontrado", code: 404 };
      if (assignment.partnerId !== session.partnerId) {
        return { error: "Assignment no es tuyo", code: 403 };
      }

      const allowed = ALLOWED_TRANSITIONS[assignment.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return {
          error: `No podés pasar de ${assignment.status} a ${parsed.data.status}`,
          code: 409,
        };
      }

      // Gate "delivered" — exige photo proof guardado en notes.proofPhotoUrl.
      // Brandon mayo 2026: anti-fraude, repartidor debe entregar la foto
      // ANTES de marcar como entregado (mismo flujo que Rappi/PedidosYa).
      if (parsed.data.status === "delivered") {
        let hasProof = false;
        if (assignment.notes) {
          try {
            const parsedNotes = JSON.parse(assignment.notes);
            hasProof = typeof parsedNotes?.proofPhotoUrl === "string" && parsedNotes.proofPhotoUrl.length > 0;
          } catch {
            // Notes no era JSON — sin proof.
          }
        }
        if (!hasProof) {
          return {
            error: "Tomá la foto de entrega antes de marcar como entregado.",
            code: 400,
          };
        }
      }

      const data: Record<string, unknown> = { status: parsed.data.status };
      if (parsed.data.status === "picked_up") data.pickedUpAt = new Date();
      if (parsed.data.status === "delivered") data.deliveredAt = new Date();

      await tx.deliveryAssignment.update({
        where: { id },
        data,
      });

      // Libera el partner si terminó.
      if (parsed.data.status === "delivered" || parsed.data.status === "cancelled") {
        await tx.deliveryPartner.update({
          where: { id: session.partnerId },
          data: { currentOrderId: null },
        });
      }

      // ── Auto-sync Order.status según el estado del DeliveryAssignment ──
      // Sprint 3: el dueño quiere ver el pedido pasar de "preparando" a
      // "en_camino" cuando el repartidor inicia ruta, y de "en_camino" a
      // "entregado" cuando entrega con foto. Esto mantiene Order.status
      // alineado con DeliveryAssignment.status sin tocar el frontend.
      const ASSIGN_TO_ORDER_STATUS: Record<string, string> = {
        picked_up: "en_camino",
        in_transit: "en_camino",
        nearby: "en_camino",
        delivered: "entregado",
        cancelled: "cancelado",
      };
      const nextOrderStatus = ASSIGN_TO_ORDER_STATUS[parsed.data.status];
      if (nextOrderStatus) {
        await tx.order.update({
          where: { id: assignment.orderId },
          data: {
            status: nextOrderStatus as "en_camino" | "entregado" | "cancelado",
            ...(nextOrderStatus === "entregado"
              ? { deliveredAt: new Date() }
              : {}),
          },
        });
      }

      return { ok: true, orderId: assignment.orderId, newStatus: parsed.data.status };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }
    logger.info("[delivery/me/assignment-status]", {
      partnerId: session.partnerId,
      assignmentId: id,
      newStatus: result.newStatus,
    });

    // Notificar al cliente — fire-and-forget. Crea entry en DeliveryTracking
    // y envia WhatsApp con CTA al tracking publico.
    // F3: migrado a DeliveryNotifyDB (lib/db/delivery.db.ts).
    DeliveryNotifyDB.notifyCustomerOnStatusChange(
      session.tenantId,
      result.orderId,
      result.newStatus,
    ).catch((err) =>
      logger.warn("[delivery/me/assignment-status] notify failed", {
        error: String(err),
        orderId: result.orderId,
      }),
    );

    return NextResponse.json({ ok: true, status: result.newStatus });
  } catch (err) {
    logger.error("[delivery/me/assignment-status] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// F3 (sprint cleanup): notifyCustomerOfStatusChange migrado a
// DeliveryNotifyDB.notifyCustomerOnStatusChange en lib/db/delivery.db.ts.
