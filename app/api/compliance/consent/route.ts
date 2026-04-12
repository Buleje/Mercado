import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * POST /api/compliance/consent
 *
 * Ley 29733 Art. 13-14 — Consentimiento para tratamiento de datos personales.
 *
 * Registra el consentimiento explícito del titular de datos para cada
 * tipo de tratamiento. El consentimiento debe ser: libre, previo, expreso,
 * informado e inequívoco.
 *
 * Types of consent:
 *   - data_processing: Tratamiento general de datos personales
 *   - marketing: Envío de promociones y ofertas
 *   - whatsapp_notifications: Notificaciones por WhatsApp
 *   - third_party_sharing: Compartir datos con terceros (delivery, pagos)
 *   - loyalty_program: Programa de fidelización
 *   - credit_evaluation: Evaluación crediticia para fiados
 *
 * Auth: requireAdmin ["admin"]
 *
 * GET /api/compliance/consent?customerId=...&tenantId=...
 * Consulta los consentimientos vigentes de un cliente.
 */

const VALID_CONSENT_TYPES = [
  "data_processing",
  "marketing",
  "whatsapp_notifications",
  "third_party_sharing",
  "loyalty_program",
  "credit_evaluation",
] as const;

const ConsentSchema = z.object({
  customerId: z.string().min(1, "customerId (phone) es obligatorio"),
  tenantId: z.string().min(1, "tenantId es obligatorio"),
  consentType: z.enum(VALID_CONSENT_TYPES, {
    message: `Tipo de consentimiento inválido. Válidos: ${VALID_CONSENT_TYPES.join(", ")}`,
  }),
  granted: z.boolean(),
  ip: z.string().optional(),
  collectionMethod: z
    .enum(["web_form", "whatsapp", "in_person", "phone", "api"])
    .optional()
    .default("api"),
});

const CONSENT_DESCRIPTIONS: Record<string, string> = {
  data_processing:
    "Consentimiento para el tratamiento de datos personales conforme a la Ley 29733",
  marketing:
    "Consentimiento para recibir promociones, ofertas y comunicaciones comerciales",
  whatsapp_notifications:
    "Consentimiento para recibir notificaciones de pedidos y alertas por WhatsApp",
  third_party_sharing:
    "Consentimiento para compartir datos con proveedores de servicios (delivery, pasarela de pagos)",
  loyalty_program:
    "Consentimiento para participar en el programa de fidelización y acumular puntos",
  credit_evaluation:
    "Consentimiento para evaluación crediticia en el sistema de fiados digitales",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = ConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { customerId, tenantId, consentType, granted, collectionMethod } =
    parsed.data;

  // Enforce tenantId matches session (CLAUDE.md rule #3)
  if (tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  try {
    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone: customerId },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 },
      );
    }

    const ipAddress =
      parsed.data.ip ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const now = new Date();

    // Record consent as an ActivityLog entry with structured metadata
    // (Using ActivityLog since it already exists and has the right structure)
    const consentRecord = await prisma.activityLog.create({
      data: {
        action: granted ? "CONSENT_GRANTED" : "CONSENT_REVOKED",
        entity: "[L29733] Consent",
        entityId: customerId,
        detail: JSON.stringify({
          ley29733: true,
          article: "Art. 13-14",
          consentType,
          consentDescription: CONSENT_DESCRIPTIONS[consentType],
          granted,
          collectionMethod,
          customerPhone: customerId,
          customerDocument: customer.documento,
          customerName: customer.name,
          ipAddress,
          userAgent,
          registeredBy: auth.username,
          timestamp: now.toISOString(),
        }),
        user: auth.username,
        ipAddress: ipAddress,
        userAgent: userAgent,
        tenantId,
      },
    });

    // If consent is for marketing/whatsapp, update customer preferences
    if (consentType === "marketing") {
      prisma.customer
        .update({
          where: { phone: customerId },
          data: { notifPromotions: granted },
        })
        .catch(() => {});
    } else if (consentType === "whatsapp_notifications") {
      prisma.customer
        .update({
          where: { phone: customerId },
          data: {
            notifOrderUpdates: granted,
            alertasWhatsapp: granted,
          },
        })
        .catch(() => {});
    }

    logger.info("[COMPLIANCE] Consent recorded", {
      tenantId,
      customerId,
      consentType,
      granted,
    });

    return NextResponse.json({
      success: true,
      consentId: consentRecord.id,
      consentType,
      granted,
      description: CONSENT_DESCRIPTIONS[consentType],
      timestamp: now.toISOString(),
      message: granted
        ? "Consentimiento registrado exitosamente"
        : "Revocación de consentimiento registrada exitosamente",
    });
  } catch (error) {
    logger.error("[COMPLIANCE] Consent recording failed", {
      tenantId,
      customerId,
      error: String(error),
    });
    return NextResponse.json(
      { error: "Error al registrar consentimiento" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/compliance/consent?customerId=...&tenantId=...
 *
 * Retrieves all consent records for a customer.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = await Promise.resolve(req.nextUrl);
  const customerId = searchParams.get("customerId");
  const tenantId = searchParams.get("tenantId") ?? auth.tenantId;

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId es obligatorio" },
      { status: 400 },
    );
  }

  // Enforce tenantId matches session (CLAUDE.md rule #3)
  if (tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  try {
    // Get all consent records for this customer
    const consentLogs = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entity: "[L29733] Consent",
        entityId: customerId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        detail: true,
        createdAt: true,
        ipAddress: true,
      },
    });

    // Build current consent status from most recent entries per type
    const consentStatus: Record<
      string,
      {
        granted: boolean;
        lastUpdated: string;
        consentId: string;
      }
    > = {};

    for (const log of consentLogs) {
      try {
        const detail = JSON.parse(log.detail) as {
          consentType: string;
          granted: boolean;
        };
        if (detail.consentType && !(detail.consentType in consentStatus)) {
          consentStatus[detail.consentType] = {
            granted: detail.granted,
            lastUpdated: log.createdAt.toISOString(),
            consentId: log.id,
          };
        }
      } catch {
        // Skip malformed entries
      }
    }

    // Add missing consent types as "not_collected"
    const fullStatus = VALID_CONSENT_TYPES.map((type) => ({
      type,
      description: CONSENT_DESCRIPTIONS[type],
      status: consentStatus[type]
        ? consentStatus[type].granted
          ? "granted"
          : "revoked"
        : "not_collected",
      lastUpdated: consentStatus[type]?.lastUpdated ?? null,
      consentId: consentStatus[type]?.consentId ?? null,
    }));

    return NextResponse.json({
      customerId,
      tenantId,
      consents: fullStatus,
      totalHistory: consentLogs.length,
      complianceNote:
        "Ley 29733 Art. 13-14 requiere consentimiento libre, previo, expreso, informado e inequívoco para cada tipo de tratamiento.",
    });
  } catch (error) {
    logger.error("[COMPLIANCE] Consent query failed", {
      tenantId,
      customerId,
      error: String(error),
    });
    return NextResponse.json(
      { error: "Error al consultar consentimientos" },
      { status: 500 },
    );
  }
}
