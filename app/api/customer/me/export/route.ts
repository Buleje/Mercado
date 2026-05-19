import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { CustomersDB } from "@/lib/db/customers.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/customer/me/export
 *
 * Brandon 2026-05-18 — Sprint Final Producción · Día 1
 *
 * Ley 29733 Art. 18 — Derecho de acceso. El titular de datos puede
 * solicitar una copia COMPLETA de toda la información personal que
 * la plataforma tiene sobre él, en formato estructurado (JSON) y
 * legible.
 *
 * Auth: cookie httpOnly `buleje-customer-sess` (no admin).
 *
 * Contenido del export:
 *   1. Datos del cliente (Customer record)
 *   2. Histórico de pedidos (Order + items)
 *   3. Histórico de consentimientos (ActivityLog filtrado por
 *      entity = "[L29733] Consent" y entityId = customerPhone)
 *   4. Metadata: tenant, fecha export, política aplicable
 *
 * Rate limit MODERATE — evita scraping por bots con cookie robada.
 *
 * El cliente puede descargar el JSON o pedirlo enviado a su email
 * (vía param ?delivery=email — no implementado todavía, queda en
 * BACKLOG).
 */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "customer-export");
  if (rl) return rl;

  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 },
    );
  }

  const payload = await getCustomerPayload(token);
  if (!payload || !payload.customerId || !payload.tenantId) {
    return NextResponse.json(
      { error: "Sesión inválida" },
      { status: 401 },
    );
  }

  // Brandon Sprint Final 2026-05-19 — pentest P1-001 fix:
  // cross-check tenantId del cookie httpOnly vs el header `x-tenant-id` que
  // setea el middleware tenant. Si no coinciden, el cliente está intentando
  // acceder a datos desde un Host/path de OTRO tenant con su cookie original.
  // Defensa en profundidad — improbable que pase (cookies son path-scoped)
  // pero no cuesta nada y cierra el hallazgo del pentest.
  const requestTenantId = req.headers.get("x-tenant-id");
  if (requestTenantId && requestTenantId !== payload.tenantId) {
    return NextResponse.json(
      { error: "Tenant mismatch — sesión no válida para este tenant" },
      { status: 403 },
    );
  }

  const { customerId, tenantId } = payload;

  try {
    const [customer, orders, consents] = await Promise.all([
      CustomersDB.getByPhone(customerId, tenantId),
      OrdersDB.getByCustomerPhone(tenantId, customerId),
      // ActivityLog: consents persistidos como entity="[L29733] Consent"
      // (compatible con la persistencia actual del POST /api/compliance/consent).
      // @prisma-direct: superadmin-style read scoped a customer + tenant.
      // eslint-disable-next-line no-restricted-properties
      prisma.activityLog.findMany({
        where: {
          tenantId,
          entityId: customerId,
          entity: "[L29733] Consent",
        },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          action: true,
          detail: true,
          createdAt: true,
          ipAddress: true,
        },
      }),
    ]);

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 },
      );
    }

    const exportedAt = new Date().toISOString();
    const parsedConsents = consents.map((c) => {
      let parsedDetail: unknown = null;
      try {
        parsedDetail = c.detail ? JSON.parse(c.detail) : null;
      } catch {
        parsedDetail = c.detail;
      }
      return {
        id: c.id,
        action: c.action,
        detail: parsedDetail,
        recordedAt: c.createdAt.toISOString(),
        ipAddress: c.ipAddress,
      };
    });

    const exportData = {
      meta: {
        ley29733: true,
        article: "Art. 18 — Derecho de acceso",
        policyVersion: "v1.0.0",
        exportedAt,
        format: "JSON",
        platform: "Buleje SaaS",
        contact: "soporte@buleje.pe",
        tenantId,
      },
      customer: {
        phone: customer.phone,
        name: customer.name,
        location: (customer as { location?: string }).location ?? null,
        reference: (customer as { reference?: string }).reference ?? null,
        documento: (customer as { documento?: string | null }).documento ?? null,
        email: (customer as { email?: string | null }).email ?? null,
        loyaltyPoints: customer.loyaltyPoints ?? 0,
        loyaltyTier: (customer as { loyaltyTier?: string }).loyaltyTier ?? null,
        notifPromotions: (customer as { notifPromotions?: boolean }).notifPromotions ?? null,
        notifOrderUpdates: (customer as { notifOrderUpdates?: boolean }).notifOrderUpdates ?? null,
        alertasWhatsapp: (customer as { alertasWhatsapp?: boolean }).alertasWhatsapp ?? null,
        createdAt:
          (customer as { createdAt?: Date | string | null }).createdAt
            ? new Date(
                (customer as { createdAt: Date | string }).createdAt,
              ).toISOString()
            : null,
      },
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
        items: (o.items ?? []).map((it) => ({
          name: it.name,
          quantity: it.quantity,
          price: it.price,
        })),
      })),
      consents: parsedConsents,
    };

    // Log la solicitud de export (no es PII per se, es auditable).
    // eslint-disable-next-line no-restricted-properties
    await prisma.activityLog
      .create({
        data: {
          action: "CUSTOMER_DATA_EXPORT_REQUESTED",
          entity: "[L29733] DataExport",
          entityId: customerId,
          detail: JSON.stringify({
            ley29733: true,
            article: "Art. 18",
            recordsExported: {
              orders: exportData.orders.length,
              consents: exportData.consents.length,
            },
          }),
          user: customerId,
          ipAddress:
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            req.headers.get("x-real-ip") ??
            "unknown",
          userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? "unknown",
          tenantId,
        },
      })
      .catch((err) => {
        logger.warn("[customer/me/export] audit log failed", { err: String(err) });
      });

    return NextResponse.json(exportData, {
      headers: {
        "Content-Disposition": `attachment; filename="buleje-mis-datos-${customerId}-${exportedAt.split("T")[0]}.json"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (err) {
    logger.error("[customer/me/export] failed", {
      error: err instanceof Error ? err.message : String(err),
      customerId,
      tenantId,
    });
    return NextResponse.json(
      { error: "Error al generar export" },
      { status: 500 },
    );
  }
}
