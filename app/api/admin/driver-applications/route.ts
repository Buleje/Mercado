import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

const ActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  notificationId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const { requireAdmin } = await import("@/lib/require-admin");
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { prisma } = await import("@/lib/prisma");

  try {
    const applications = await prisma.notification.findMany({
      where: {
        tenantId: auth.tenantId,
        type: "DRIVER_APPLICATION",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: applications });
  } catch {
    return NextResponse.json({ error: "Error al cargar solicitudes" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { requireAdmin } = await import("@/lib/require-admin");
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
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

    // Parse application data from notification body: "Name (Phone) - Zona: zone - Vehículo: type - Horario: avail"
    const bodyStr = notification.body ?? "";
    const phoneMatch = bodyStr.match(/\((\+?\d[\d\s-]+)\)/);
    const phone = phoneMatch?.[1]?.replace(/[\s-]/g, "");
    const nameMatch = bodyStr.match(/^([^(]+)/);
    const name = nameMatch?.[1]?.trim() || "Repartidor";
    const zoneMatch = bodyStr.match(/Zona:\s*([^-]+)/);
    const zone = zoneMatch?.[1]?.trim() || "Sin zona";
    const vehicleMatch = bodyStr.match(/Vehículo:\s*([^-]+)/);
    const vehicle = vehicleMatch?.[1]?.trim() || "moto";

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.com";

    if (parsed.data.action === "approve") {
      // Create DeliveryPartner record on approval
      const partner = await prisma.deliveryPartner.create({
        data: {
          name,
          phone: phone || "sin-telefono",
          zone,
          vehicleType: vehicle,
          tenantId: auth.tenantId,
          isActive: true,
        },
        select: { id: true },
      }).catch(() => null); // Don't fail if duplicate

      if (phone) {
        const earningsUrl = partner ? `${baseUrl}/marketplace/repartidor/ganancias?id=${partner.id}` : "";
        const message = `✅ ¡Felicidades ${name}! Tu solicitud como repartidor ha sido APROBADA. 🎉\n\n📋 Siguiente paso: entra aquí para ver tus instrucciones de bienvenida:\n${baseUrl}/marketplace/repartidor/bienvenida\n\n💰 Tu panel de ganancias:\n${earningsUrl}\n\n¡Bienvenido al equipo de Buleje!`;
        sendWhatsAppText(phone, message).catch((err) => logger.error("[driver-applications] WhatsApp approve notify failed", { error: String(err) }));
      }
    } else {
      if (phone) {
        const message = `❌ Hola ${name}, lamentamos informarte que tu solicitud como repartidor no fue aprobada en esta oportunidad. Puedes volver a postularte más adelante. ¡Gracias por tu interés!`;
        sendWhatsAppText(phone, message).catch((err) => logger.error("[driver-applications] WhatsApp reject notify failed", { error: String(err) }));
      }
    }

    return NextResponse.json({ success: true, action: parsed.data.action });
  } catch {
    return NextResponse.json({ error: "Error al procesar solicitud" }, { status: 500 });
  }
}
