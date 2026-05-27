/**
 * GET  /api/customer/consent
 * POST /api/customer/consent
 *
 * Ley 29733 Art. 13-14 — Gestión de consentimientos por el propio titular.
 *
 * Auth: cookie `buleje-customer-sess` (httpOnly, HMAC firmada).
 * El cliente puede ver y revocar sus propios consentimientos sin pasar por admin.
 *
 * POST body: { consentType, granted, ip?, source? }
 * GET  response: { consents: [{type, granted, grantedAt, revokedAt, description}] }
 *
 * Persiste en ActivityLog (entity "[L29733] Consent") — mismo patrón
 * que /api/compliance/consent (admin-facing). No requiere schema drift.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { logger } from "@/lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_CONSENT_TYPES = [
  "data_processing",
  "marketing",
  "whatsapp_notifications",
  "third_party_sharing",
  "loyalty_program",
  "credit_evaluation",
] as const;

type ConsentType = (typeof VALID_CONSENT_TYPES)[number];

const CONSENT_DESCRIPTIONS: Record<ConsentType, string> = {
  data_processing:
    "Tratamiento de datos personales conforme a la Ley 29733",
  marketing:
    "Recibir promociones, ofertas y comunicaciones comerciales",
  whatsapp_notifications:
    "Recibir notificaciones de pedidos y alertas por WhatsApp",
  third_party_sharing:
    "Compartir datos con proveedores de servicios (delivery, pasarela de pagos)",
  loyalty_program:
    "Participar en el programa de fidelización y acumular puntos",
  credit_evaluation:
    "Evaluación crediticia para el sistema de fiados digitales",
};

// ── Zod schema ────────────────────────────────────────────────────────────────

const PostConsentSchema = z.object({
  consentType: z.enum(VALID_CONSENT_TYPES, {
    message: `Tipo inválido. Válidos: ${VALID_CONSENT_TYPES.join(", ")}`,
  }),
  granted: z.boolean(),
  ip: z.string().optional(),
  source: z.string().optional().default("self_service_web"),
});

// ── Auth helper ───────────────────────────────────────────────────────────────

async function resolveCustomerSession(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getCustomerPayload(token);
}

// ── POST ──────────────────────────────────────────────────────────────────────

/**
 * Registra o revoca un consentimiento del cliente autenticado.
 * El cliente debe estar logueado (cookie `buleje-customer-sess` válida).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "customer-consent");
  if (_rl) return _rl;

  const session = await resolveCustomerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "No autenticado. Inicia sesión para gestionar tus consentimientos." },
      { status: 401 },
    );
  }

  const tenantId = getTenantIdFromRequest(req);

  // Verificar que el tenant del token coincide con el tenant del request
  if (session.tenantId !== tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = PostConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { consentType, granted, source } = parsed.data;

  // customerId es el phone del cliente en este sistema
  const customerId = session.customerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "Sesión sin customerId. Vuelve a iniciar sesión." },
      { status: 422 },
    );
  }

  try {
    // Verificar que el cliente existe en este tenant
    // eslint-disable-next-line no-restricted-properties -- lookup previo a write, no hay DB class con este scope
    const customer = await prisma.customer.findFirst({
      where: { tenantId, phone: customerId },
      select: { phone: true, name: true, documento: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado en este tenant" },
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

    // Persiste en ActivityLog — mismo patrón que /api/compliance/consent
    // eslint-disable-next-line no-restricted-properties -- ActivityLog no tiene DB class wrapper
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
          source,
          collectionMethod: "self_service_web",
          customerPhone: customerId,
          customerDocument: customer.documento,
          customerName: customer.name,
          ipAddress,
          userAgent,
          registeredBy: `customer:${session.email}`,
          timestamp: now.toISOString(),
        }),
        user: `customer:${session.email}`,
        ipAddress: ipAddress,
        userAgent: userAgent,
        tenantId,
      },
    });

    // Fire-and-forget: sync Customer.notif fields si aplica (CLAUDE.md rule #7)
     
    if (consentType === "marketing") {
      // eslint-disable-next-line no-restricted-properties -- fire-and-forget sync notif prefs, ver comentario arriba
      prisma.customer
        .update({
          where: { phone: customerId },
          data: { notifPromotions: granted },
        })
        .catch((e: unknown) => {
          logger.warn("[COMPLIANCE/customer] notifPromotions sync failed", { error: String(e) });
        });
    } else if (consentType === "whatsapp_notifications") {
      // eslint-disable-next-line no-restricted-properties -- fire-and-forget sync notif prefs, ver comentario arriba
      prisma.customer
        .update({
          where: { phone: customerId },
          data: {
            notifOrderUpdates: granted,
            alertasWhatsapp: granted,
          },
        })
        .catch((e: unknown) => {
          logger.warn("[COMPLIANCE/customer] alertasWhatsapp sync failed", { error: String(e) });
        });
    }

    logger.info("[COMPLIANCE/customer] Consent self-service", {
      tenantId,
      customerId: customerId.slice(0, 4) + "***",
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
    logger.error("[COMPLIANCE/customer] Consent write failed", {
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

// ── GET ───────────────────────────────────────────────────────────────────────

/**
 * Devuelve los consentimientos vigentes del cliente autenticado.
 * No necesita query params — lee customerId del cookie de sesión.
 */
export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "customer-consent");
  if (_rl) return _rl;

  const session = await resolveCustomerSession(req);
  if (!session) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 },
    );
  }

  const tenantId = getTenantIdFromRequest(req);

  if (session.tenantId !== tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  const customerId = session.customerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "Sesión sin customerId" },
      { status: 422 },
    );
  }

  try {
    // Obtiene todos los registros de consent de este cliente, más recientes primero
    // eslint-disable-next-line no-restricted-properties -- ActivityLog sin DB class wrapper
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
      },
    });

    // Construye estado actual: primer registro por tipo (más reciente) gana
    const seenTypes = new Set<string>();
    const statusMap: Record<
      string,
      { granted: boolean; lastUpdated: string; consentId: string }
    > = {};

    for (const log of consentLogs) {
      try {
        const detail = JSON.parse(log.detail) as {
          consentType: string;
          granted: boolean;
        };
        if (detail.consentType && !seenTypes.has(detail.consentType)) {
          seenTypes.add(detail.consentType);
          statusMap[detail.consentType] = {
            granted: detail.granted,
            lastUpdated: log.createdAt.toISOString(),
            consentId: log.id,
          };
        }
      } catch {
        // Skip entradas malformadas
      }
    }

    // Lista completa de tipos con estado: granted | revoked | not_collected
    const consents = VALID_CONSENT_TYPES.map((type) => ({
      type,
      description: CONSENT_DESCRIPTIONS[type],
      granted: statusMap[type]?.granted ?? null,
      status: statusMap[type]
        ? statusMap[type].granted
          ? "granted"
          : "revoked"
        : "not_collected",
      grantedAt:
        statusMap[type]?.granted ? statusMap[type].lastUpdated : null,
      revokedAt:
        statusMap[type] && !statusMap[type].granted
          ? statusMap[type].lastUpdated
          : null,
      lastUpdated: statusMap[type]?.lastUpdated ?? null,
    }));

    return NextResponse.json({
      consents,
      customerId,
      tenantId,
      complianceNote:
        "Ley 29733 Art. 13-14 — tienes derecho a retirar tu consentimiento en cualquier momento.",
    });
  } catch (error) {
    logger.error("[COMPLIANCE/customer] Consent read failed", {
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
