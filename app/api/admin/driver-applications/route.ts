/**
 * Admin: solicitudes de repartidor — lista + aprobar/rechazar.
 *
 * Cambios v2 (KYC):
 *   - GET enriquece cada notificación con el `kyc` parseado del DeliveryPartner.notes
 *     (usando phone como llave). Permite al admin ver DNI, licencia, SOAT antes
 *     de aprobar.
 *   - PATCH aprobación: en vez de crear un nuevo DeliveryPartner (duplicado),
 *     ahora actualiza `isActive=true` en el partner existente creado por el form
 *     de inscripción y persiste `applicationStatus: "aprobada"` en notes.
 *   - Compatibilidad: si por alguna razón no existe el partner, fallback a crear.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { parseKycNotes } from "@/lib/schemas/driver-apply";

const ActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notificationId: z.string().min(1),
  reviewNotes: z.string().max(500).optional(),
});

function extractPhoneFromBody(bodyStr: string): string | null {
  // v1 legacy: "Name (Phone) - ..."
  const legacy = bodyStr.match(/\((\+?\d[\d\s-]+)\)/);
  if (legacy) return legacy[1].replace(/[\s-]/g, "");
  // v2: "Name · DNI 12345678 | Tel 999333222 | ..."
  const v2 = bodyStr.match(/Tel\s+(\d{6,15})/i);
  if (v2) return v2[1];
  return null;
}

export async function GET(req: NextRequest) {
  const { requireAdmin } = await import("@/lib/require-admin");
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { prisma } = await import("@/lib/prisma");

  try {
    const applications = await prisma.notification.findMany({
      where: { tenantId: auth.tenantId, type: "DRIVER_APPLICATION" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Match cada notif con su DeliveryPartner (por phone) para extraer KYC.
    const phones = applications
      .map((a) => extractPhoneFromBody(a.body ?? ""))
      .filter((p): p is string => !!p);

    const partners = phones.length
      ? await prisma.deliveryPartner.findMany({
          where: { tenantId: auth.tenantId, phone: { in: phones } },
          select: { id: true, phone: true, isActive: true, notes: true, vehicleType: true, zone: true },
        })
      : [];

    const partnerByPhone = new Map(partners.map((p) => [p.phone, p]));

    const enriched = applications.map((a) => {
      const phone = extractPhoneFromBody(a.body ?? "");
      const partner = phone ? partnerByPhone.get(phone) : undefined;
      const kyc = partner ? parseKycNotes(partner.notes) : null;
      return {
        ...a,
        partner: partner
          ? {
              id: partner.id,
              isActive: partner.isActive,
              vehicleType: partner.vehicleType,
              zone: partner.zone,
            }
          : null,
        kyc,
      };
    });

    return NextResponse.json({ data: enriched });
  } catch (err) {
    logger.error("[admin/driver-applications] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar solicitudes" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { requireAdmin } = await import("@/lib/require-admin");
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => {
    logger.error("[admin/driver-applications] parse JSON body failed", { error: String(err) });
    return null;
  });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  try {
    const notification = await prisma.notification.update({
      where: { id: parsed.data.notificationId, tenantId: auth.tenantId },
      data: { readAt: new Date() },
    });

    const bodyStr = notification.body ?? "";
    const phone = extractPhoneFromBody(bodyStr);
    const nameMatch = bodyStr.match(/^([^(·|]+)/);
    const name = nameMatch?.[1]?.trim() || "Repartidor";

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.com";

    // Buscar el partner existente (creado por el form de inscripción).
    const partner = phone
      ? await prisma.deliveryPartner.findFirst({
          where: { tenantId: auth.tenantId, phone },
          select: { id: true, notes: true, name: true },
        })
      : null;

    if (parsed.data.action === "approve") {
      let partnerId: string | null = partner?.id ?? null;

      if (partner) {
        // Activar + actualizar status en notes.
        const existingKyc = parseKycNotes(partner.notes);
        const updatedNotes = existingKyc
          ? {
              ...existingKyc,
              applicationStatus: "aprobada" as const,
              reviewedAt: new Date().toISOString(),
              reviewedBy: auth.username ?? "admin",
              reviewNotes: parsed.data.reviewNotes,
            }
          : null;

        await prisma.deliveryPartner.update({
          where: { id: partner.id },
          data: {
            isActive: true,
            ...(updatedNotes ? { notes: JSON.stringify(updatedNotes) } : {}),
          },
        });
      } else if (phone) {
        // Fallback legacy: crear partner si no existe (no debería pasar con el form nuevo).
        const created = await prisma.deliveryPartner.create({
          data: {
            name,
            phone,
            zone: "Sin zona",
            vehicleType: "moto",
            tenantId: auth.tenantId,
            isActive: true,
          },
          select: { id: true },
        }).catch((err) => {
          logger.error("[admin/driver-applications] fallback create failed", { error: String(err) });
          return null;
        });
        partnerId = created?.id ?? null;
      }

      if (phone && partnerId) {
        const earningsUrl = `${baseUrl}/marketplace/repartidor/ganancias?id=${partnerId}`;
        const message = [
          `¡Felicidades ${name}! Tu solicitud como repartidor fue APROBADA.`,
          "",
          "Siguientes pasos:",
          `1. Revisa tu bienvenida: ${baseUrl}/marketplace/repartidor/bienvenida`,
          `2. Ingresa al panel: ${baseUrl}/delivery-app/login (usa tu número como contraseña la primera vez)`,
          `3. Mira tus ganancias: ${earningsUrl}`,
          "",
          "¡Bienvenido al equipo de Buleje!",
        ].join("\n");
        await sendWhatsAppQueued(phone, message, {
          tenantId: auth.tenantId,
          context: "driver-applications:approve",
        }).catch((err) =>
          logger.error("[admin/driver-applications] whatsapp approve failed", { error: String(err) }),
        );
      }
    } else {
      // Reject: marcar status en notes (mantener partner desactivado).
      if (partner) {
        const existingKyc = parseKycNotes(partner.notes);
        const updatedNotes = existingKyc
          ? {
              ...existingKyc,
              applicationStatus: "rechazada" as const,
              reviewedAt: new Date().toISOString(),
              reviewedBy: auth.username ?? "admin",
              reviewNotes: parsed.data.reviewNotes,
            }
          : null;
        if (updatedNotes) {
          await prisma.deliveryPartner.update({
            where: { id: partner.id },
            data: { isActive: false, notes: JSON.stringify(updatedNotes) },
          });
        }
      }

      if (phone) {
        const reason = parsed.data.reviewNotes ? `\n\nMotivo: ${parsed.data.reviewNotes}` : "";
        const message = `Hola ${name}, tu solicitud como repartidor no fue aprobada en esta oportunidad.${reason}\n\nPuedes volver a postularte cuando reúnas los requisitos. ¡Gracias por tu interés!`;
        await sendWhatsAppQueued(phone, message, {
          tenantId: auth.tenantId,
          context: "driver-applications:reject",
        }).catch((err) =>
          logger.error("[admin/driver-applications] whatsapp reject failed", { error: String(err) }),
        );
      }
    }

    return NextResponse.json({ success: true, action: parsed.data.action });
  } catch (err) {
    logger.error("[admin/driver-applications] PATCH failed", { error: String(err) });
    return NextResponse.json({ error: "Error al procesar solicitud" }, { status: 500 });
  }
}
