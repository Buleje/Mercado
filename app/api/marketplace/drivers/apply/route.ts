/**
 * Audit project-wide 2026-05-19 — migrado a DB classes:
 *   - DeliveryPartnersDB.upsertApplication para el KYC idempotente
 *   - AdminNotificationsDB.create para la alerta al admin
 *
 * Cumplimiento legal:
 *   - Ley 29733 — recoge consentimiento explicito de tratamiento de datos.
 *   - DS 017-2009-MTC — valida licencia/SOAT vigentes para vehiculos motorizados.
 *   - Edad minima 18 años (Ley 27261 / Codigo del Niño y Adolescente).
 *
 * Persistencia: KYC estructurado en `DeliveryPartner.notes` como JSON.
 * Idempotente por (phone, tenantId): re-aplicar actualiza datos.
 */
import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DeliveryPartnersDB, AdminNotificationsDB } from "@/lib/db/delivery-partners.db";
import {
  DriverApplySchema,
  buildKycNotes,
  MOTORIZED,
} from "@/lib/schemas/driver-apply";

export async function POST(req: NextRequest) {
  // Rate limit anti-spam (5 / 15min / IP).
  const rl = applyRateLimit(req, "STRICT", "marketplace-drivers-apply");
  if (rl) return rl;

  try {
    const body = await req.json();
    const parsed = DriverApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const phoneDigits = data.phone.replace(/\D/g, "");
    const kycNotes = buildKycNotes(data);
    const isMotor = MOTORIZED.includes(data.vehicleType);

    // Audit project-wide 2026-05-19: idempotente upsert via DB class.
    const { partnerId } = await DeliveryPartnersDB.upsertApplication("main", phoneDigits, {
      name: data.name,
      email: data.email || null,
      zone: data.zone,
      vehicleType: data.vehicleType,
      kycNotesJson: JSON.stringify(kycNotes),
    });

    // Notification al admin (incluye campos KYC clave para revision rapida).
    const summaryLines = [
      `${data.name} · DNI ${data.dni}`,
      `Tel ${phoneDigits} · ${data.zone}`,
      `Vehiculo: ${data.vehicleType}${isMotor ? ` · Placa ${data.vehiclePlate}` : ""}`,
      isMotor ? `Licencia ${data.licenseCategory} ${data.licenseNumber} (vence ${data.licenseExpiresAt})` : "",
      isMotor ? `SOAT ${data.soatNumber} (vence ${data.soatExpiresAt})` : "",
      `Horario: ${data.availability}`,
    ].filter(Boolean);

    await AdminNotificationsDB.create({
      tenantId: "main",
      title: "Nueva solicitud de repartidor",
      body: summaryLines.join(" | "),
      type: "DRIVER_APPLICATION",
      severity: "MEDIUM",
    });

    // Audit log: por ahora persistimos consentimientos dentro del JSON `notes`
    // (campo `consents.acceptedAt` + versiones T&C/privacidad). Si en el futuro
    // se introduce un modelo `AuditLog`, replicar acá con resourceId=partnerId.
    logger.info("[drivers/apply] consent recorded", {
      partnerId,
      dni: data.dni,
      termsVersion: kycNotes.consents.termsVersion,
      privacyVersion: kycNotes.consents.privacyVersion,
    });

    // WhatsApp al admin (fire-and-forget).
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    if (adminPhone) {
      const msg = [
        "*Nueva solicitud de repartidor*",
        "",
        `Nombre: ${data.name}`,
        `DNI: ${data.dni}`,
        `Teléfono: ${data.phone}`,
        `Zona: ${data.zone}`,
        `Vehículo: ${data.vehicleType}`,
        isMotor ? `Licencia ${data.licenseCategory} ${data.licenseNumber}` : "",
        isMotor ? `Placa ${data.vehiclePlate}` : "",
        isMotor ? `SOAT ${data.soatNumber}` : "",
        `Horario: ${data.availability}`,
        "",
        "Revisa el panel admin para aprobar o rechazar.",
      ]
        .filter(Boolean)
        .join("\n");
      await (await import("@/lib/whatsapp"))
        .sendWhatsAppQueued(adminPhone, msg, { tenantId: "main", context: "drivers/apply:admin" })
        .catch((err) =>
          logger.error("[marketplace/drivers/apply] whatsapp failed", { error: String(err) }),
        );
    }

    return NextResponse.json({ success: true, partnerId });
  } catch (err) {
    logger.error("[marketplace/drivers/apply] unexpected", { error: String(err) });
    return NextResponse.json({ error: "Error al procesar solicitud" }, { status: 500 });
  }
}
