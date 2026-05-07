import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/compliance/access-log
 *
 * Ley 29733 Art. 18 — Derecho a conocer quién ha accedido a los datos personales.
 *
 * Consulta el audit log (ActivityLog) para mostrar quién, cuándo, desde dónde
 * y por qué se accedieron los datos de un cliente específico.
 *
 * Auth: requireAdmin ["admin"]
 */

const AccessLogSchema = z.object({
  dni: z
    .string()
    .min(8, "DNI debe tener al menos 8 caracteres")
    .max(15, "Documento no puede exceder 15 caracteres"),
  tenantId: z.string().min(1, "tenantId es obligatorio"),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.number().min(1).max(500).optional().default(100),
  offset: z.number().min(0).optional().default(0),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compliance-access-log"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = AccessLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { dni, tenantId, fromDate, toDate, limit, offset } = parsed.data;

  // Enforce tenantId matches session (CLAUDE.md rule #3)
  if (tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  try {
    // Find customer by documento
    const customer = await prisma.customer.findFirst({
      where: { tenantId, documento: dni },
    });

    if (!customer) {
      return NextResponse.json(
        {
          error: "Cliente no encontrado",
          message: `No se encontró un cliente con documento ${dni} en este tenant`,
        },
        { status: 404 },
      );
    }

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    // Query audit log for all accesses to this customer's data
    // Search by entityId (customer phone) across all L29733-tagged entries
    // and also standard ActivityLog entries that reference this customer
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where: {
          tenantId,
          OR: [
            // L29733 compliance entries referencing this customer
            { entityId: customer.phone },
            // Entries that mention the customer's documento in detail
            { detail: { contains: dni } },
            // Entries for Customer entity with this phone
            { entity: "Customer", entityId: customer.phone },
            { entity: "[L29733] Customer", entityId: customer.phone },
          ],
          ...(Object.keys(dateFilter).length > 0
            ? { createdAt: dateFilter }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          detail: true,
          user: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
      prisma.activityLog.count({
        where: {
          tenantId,
          OR: [
            { entityId: customer.phone },
            { detail: { contains: dni } },
            { entity: "Customer", entityId: customer.phone },
            { entity: "[L29733] Customer", entityId: customer.phone },
          ],
          ...(Object.keys(dateFilter).length > 0
            ? { createdAt: dateFilter }
            : {}),
        },
      }),
    ]);

    // Parse and enrich log entries
    const accessRecords = logs.map((log) => {
      let parsedDetail: Record<string, unknown> = {};
      try {
        parsedDetail = JSON.parse(log.detail) as Record<string, unknown>;
      } catch {
        parsedDetail = { rawDetail: log.detail };
      }

      return {
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        action: log.action,
        entity: log.entity,
        actor: log.user,
        ipAddress: log.ipAddress ?? "no registrada",
        userAgent: log.userAgent ?? "no registrado",
        isComplianceEntry: log.entity.startsWith("[L29733]"),
        detail: parsedDetail,
      };
    });

    // Fire-and-forget: log this access-log query itself (CLAUDE.md rule #7)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    prisma.activityLog
      .create({
        data: {
          action: "ACCESS_LOG_QUERY",
          entity: "[L29733] Customer",
          entityId: customer.phone,
          detail: JSON.stringify({
            ley29733: true,
            article: "Art. 18",
            right: "Derecho a conocer accesos",
            documento: dni,
            resultCount: accessRecords.length,
            dateRange: { from: fromDate ?? null, to: toDate ?? null },
          }),
          user: auth.username,
          ipAddress: ip,
          tenantId,
        },
      })
      .catch(() => {});

    logger.info("[COMPLIANCE] Access log queried", {
      tenantId,
      documento: dni,
      resultCount: accessRecords.length,
    });

    return NextResponse.json({
      metadata: {
        legalBasis: "Ley 29733 Art. 18 — Derecho a conocer accesos",
        queryDate: new Date().toISOString(),
        customerDocument: dni,
        tenantId,
        total,
        limit,
        offset,
      },
      accessRecords,
    });
  } catch (error) {
    logger.error("[COMPLIANCE] Access log query failed", {
      tenantId,
      dni,
      error: String(error),
    });
    return NextResponse.json(
      { error: "Error al consultar registro de accesos" },
      { status: 500 },
    );
  }
}
