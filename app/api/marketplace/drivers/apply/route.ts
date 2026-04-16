import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DriverApplySchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(6).max(20),
  zone: z.string().min(1).max(50),
  vehicleType: z.enum(["moto", "bicicleta", "auto", "a_pie"]),
  availability: z.enum(["manana", "tarde", "noche", "full", "fines"]),
});

export async function POST(req: NextRequest) {
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

    // Store driver application in DriverApplication or a generic table
    // Using DeliveryRoute-adjacent pattern — store as a pending application
    await prisma.notification.create({
      data: {
        tenantId: "main",
        title: "Nueva solicitud de repartidor",
        body: `${parsed.data.name} (${parsed.data.phone}) - Zona: ${parsed.data.zone} - Vehículo: ${parsed.data.vehicleType} - Horario: ${parsed.data.availability}`,
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
        .catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Error al procesar solicitud" },
      { status: 500 }
    );
  }
}
