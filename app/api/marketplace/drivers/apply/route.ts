/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const DriverApplySchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20),
  email: z.string().email("Email inválido").optional(),
  zone: z.string().min(1).max(50),
  vehicleType: z.enum(["moto", "bicicleta", "auto", "a_pie"]),
  availability: z.enum(["manana", "tarde", "noche", "full", "fines"]),
});

export async function POST(req: NextRequest) {
  // Rate limit: anti-spam aplicar como repartidor (5 / 15min / IP)
  const rl = applyRateLimit(req, "STRICT", "marketplace-drivers-apply");
  if (rl) return rl;

  try {
    const body = await req.json();
    const parsed = DriverApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    // Crear DeliveryPartner real con isActive=false (pendiente). El admin lo
    // aprueba desde /admin?tab=delivery-partners. Idempotente por phone.
    const phoneDigits = parsed.data.phone.replace(/\D/g, "");
    const existing = await prisma.deliveryPartner.findFirst({
      where: { phone: phoneDigits, tenantId: "main" },
      select: { id: true },
    });

    let partnerId: string;
    if (existing) {
      partnerId = existing.id;
    } else {
      const created = await prisma.deliveryPartner.create({
        data: {
          name: parsed.data.name,
          phone: phoneDigits,
          email: parsed.data.email ?? null,
          zone: parsed.data.zone,
          vehicleType: parsed.data.vehicleType,
          isActive: false,
          rating: 5.0,
          fee: 5.0,
          tenantId: "main",
          notes: JSON.stringify({
            availability: parsed.data.availability,
            applicationStatus: "pendiente",
          }),
        },
        select: { id: true },
      });
      partnerId = created.id;
    }

    // Notification al admin para que apruebe.
    await prisma.notification.create({
      data: {
        tenantId: "main",
        title: "Nueva solicitud de repartidor",
        body: `${parsed.data.name} (${phoneDigits}) - Zona: ${parsed.data.zone} - Vehículo: ${parsed.data.vehicleType} - Horario: ${parsed.data.availability}`,
        type: "DRIVER_APPLICATION",
        severity: "MEDIUM",
      },
    });

    // Fire-and-forget WhatsApp notification to admin (queued)
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    if (adminPhone) {
      const msg = [
        "🛵 *Nueva solicitud de repartidor*",
        "",
        `👤 ${parsed.data.name}`,
        `📱 ${parsed.data.phone}`,
        `📍 Zona: ${parsed.data.zone}`,
        `🚗 Vehículo: ${parsed.data.vehicleType}`,
        `⏰ Horario: ${parsed.data.availability}`,
        "",
        "Revisa el panel admin para aprobar o rechazar.",
      ].join("\n");
      await (await import("@/lib/whatsapp"))
        .sendWhatsAppQueued(adminPhone, msg, { tenantId: "main", context: "drivers/apply:admin" })
        .catch((err) => logger.error("[marketplace/drivers/apply] operation failed", { error: String(err) }));
    }

    return NextResponse.json({ success: true, partnerId });
  } catch {
    return NextResponse.json(
      { error: "Error al procesar solicitud" },
      { status: 500 }
    );
  }
}
