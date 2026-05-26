import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod/v4";
import { applyRateLimit } from "@/lib/rate-limit";

const CreateSchema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(2000),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

const QuerySchema = z.object({
  status: z.enum(["open", "replied", "closed"]).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  // 1. Auth — cualquier rol admin puede ver sus tickets
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { status, limit } = parsed.data;

    // SuperAdmin (tenantId === "superadmin") ve todos los tickets
    const isSuperAdmin = auth.tenantId === "superadmin";

    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...(isSuperAdmin ? {} : { tenantId: auth.tenantId }),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ tickets, total: tickets.length });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "support-tickets"); if (_rl) return _rl;
  // 1. Auth
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Beneficio "Soporte VIP" (superadmin > Beneficios): si la tienda del
    // tenant lo tiene activo, todo ticket entra como prioridad ALTA — así el
    // superadmin los ve arriba. El flag vive en la columna jsonb benefits
    // (fuera de schema.prisma — zona peligrosa) → raw SQL parametrizado.
    // Fail-safe: si la query falla, se respeta la prioridad enviada.
    let priority = parsed.data.priority;
    try {
      const vip = await prisma.$queryRawUnsafe<Array<{ one: number }>>(
        `SELECT 1 AS one FROM "Store"
         WHERE "tenantId" = $1
           AND COALESCE((benefits->>'prioritySupport')::boolean, false) = true
         LIMIT 1`,
        auth.tenantId,
      );
      if (vip.length > 0) priority = "high";
    } catch {
      /* sin beneficio detectable → prioridad enviada por el usuario */
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        subject: parsed.data.subject,
        message: parsed.data.message,
        priority,
        tenantId: auth.tenantId,
        createdBy: auth.username,
        status: "open",
      },
    });

    // 4. Fire-and-forget — notificar al SuperAdmin
    logActivity(
      "create",
      "support_ticket",
      `Nuevo ticket: "${parsed.data.subject}" (${parsed.data.priority})`,
      ticket.id,
      auth.username,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
