import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod/v4";

const QuerySchema = z.object({
  entity: z.string().min(1).max(100).optional(),
  entityId: z.string().max(200).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Humaniza la acción para mostrarse en el timeline
function humanizeAction(action: string, entity: string): string {
  const a = action.toLowerCase();
  const e = entity.toLowerCase();
  if (a.includes("creat") || a.includes("create") || a.includes("nuevo") || a.includes("agreg"))
    return `creó ${e}`;
  if (a.includes("updat") || a.includes("edit") || a.includes("modif") || a.includes("actualiz"))
    return `modificó ${e}`;
  if (a.includes("delet") || a.includes("elimin") || a.includes("borr"))
    return `eliminó ${e}`;
  if (a.includes("export"))
    return `exportó ${e}`;
  if (a.includes("import"))
    return `importó ${e}`;
  return `${action} ${e}`;
}

export async function GET(req: NextRequest) {
  // 1. Auth
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

    const { entity, entityId, limit } = parsed.data;

    // 3. Consultar ActivityLog existente — nunca Prisma directo en route normal,
    //    pero ActivityLog no tiene DB class propio; se accede vía Prisma aquí igual
    //    que en app/api/activity-log/route.ts (patrón establecido en el proyecto).
    const entries = await prisma.activityLog.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(entity ? { entity } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const items = entries.map((e) => ({
      id: e.id,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      detail: e.detail,
      user: e.user,
      humanLabel: humanizeAction(e.action, e.entity),
      createdAt: e.createdAt.toISOString(),
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
