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
 *
 * Audit project-wide 2026-05-19: queries prisma migradas a AdminDriverApplicationsDB.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { parseKycNotes } from "@/lib/schemas/driver-apply";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { AdminDriverApplicationsDB } from "@/lib/db/admin-driver-applications.db";

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

  try {
    const applications = await AdminDriverApplicationsDB.listApplications(auth.tenantId);

    // Match cada notif con su DeliveryPartner (por phone) para extraer KYC.
    const phones = applications
      .map((a) => extractPhoneFromBody(a.body ?? ""))
      .filter((p): p is string => !!p);

    const partners = await AdminDriverApplicationsDB.getPartnersByPhones(auth.tenantId, phones);

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

    // AUDIT 2026-05-06: log el acceso al listado de KYC (DNI/licencia/SOAT
    // visible). Trazabilidad ante admin malicioso descargando PII sin
    // contexto operacional. Fire-and-forget, no bloquea response.
    if (enriched.length > 0) {
      const { logActivity } = await import("@/lib/activity-logger");
      logActivity(
        "ViewKYC",
        "DriverApplication",
        `Listado KYC consultado (${enriched.length} solicitudes)`,
        undefined,
        auth.username,
      ).catch((err) => logger.error("[admin/driver-applications] audit log failed", { error: String(err) }));
    }

    return NextResponse.json({ data: enriched });
  } catch (err) {
    logger.error("[admin/driver-applications] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Error al cargar solicitudes" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-driver-applications"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
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

  try {
    const notification = await AdminDriverApplicationsDB.markNotificationRead(
      auth.tenantId,
      parsed.data.notificationId,
    );

    const bodyStr = notification.body ?? "";
    const phone = extractPhoneFromBody(bodyStr);
    const nameMatch = bodyStr.match(/^([^(·|]+)/);
    const name = nameMatch?.[1]?.trim() || "Repartidor";

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.com";

    // Buscar el partner existente (creado por el form de inscripción).
    const partner = phone
      ? await AdminDriverApplicationsDB.findPartnerByPhone(auth.tenantId, phone)
      : null;

    if (parsed.data.action === "approve") {
      let partnerId: string | null = partner?.id ?? null;

      if (partner) {
        // Audit 2026-05-17 03-P1-5: re-validar SOAT/licencia al aprobar.
        // El form Zod valida fechas al inscribirse, pero al aprobar N días
        // después un admin podía habilitar partners con documentos vencidos.
        // Ley 29733 + DS 017-2009-MTC: liability legal si rider sin SOAT
        // vigente atropella a alguien. Rechazamos approve si vencido.
        const existingKyc = parseKycNotes(partner.notes);
        if (existingKyc?.kyc) {
          const now = new Date();
          const licenseExp = existingKyc.kyc.license?.expiresAt
            ? new Date(existingKyc.kyc.license.expiresAt)
            : null;
          const soatExp = existingKyc.kyc.vehicle?.soatExpiresAt
            ? new Date(existingKyc.kyc.vehicle.soatExpiresAt)
            : null;
          const expired: string[] = [];
          if (licenseExp && licenseExp < now) expired.push("licencia");
          if (soatExp && soatExp < now) expired.push("SOAT");
          if (expired.length > 0) {
            logger.warn("[admin/driver-applications] approve refused — KYC expired", {
              partnerId: partner.id,
              expired,
              licenseExp: licenseExp?.toISOString(),
              soatExp: soatExp?.toISOString(),
              reviewer: auth.username,
            });
            return NextResponse.json(
              {
                error: "documentos_vencidos",
                message: `No se puede aprobar: ${expired.join(", ")} vencido(s). Solicita renovación al repartidor.`,
                expired,
              },
              { status: 422 },
            );
          }
        }

        // Activar + actualizar status en notes (reutiliza existingKyc ya declarado).
        const updatedNotes = existingKyc
          ? {
              ...existingKyc,
              applicationStatus: "aprobada" as const,
              reviewedAt: new Date().toISOString(),
              reviewedBy: auth.username ?? "admin",
              reviewNotes: parsed.data.reviewNotes,
            }
          : null;

        await AdminDriverApplicationsDB.approvePartner(
          partner.id,
          updatedNotes ? JSON.stringify(updatedNotes) : null,
        );
      } else if (phone) {
        // Fallback legacy: crear partner si no existe (no debería pasar con el form nuevo).
        const created = await AdminDriverApplicationsDB.createPartnerFallback(
          auth.tenantId,
          name,
          phone,
        );
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
          await AdminDriverApplicationsDB.rejectPartner(partner.id, JSON.stringify(updatedNotes));
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
