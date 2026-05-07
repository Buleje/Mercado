import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";

const PostSchema = z.object({
  action: z.string().min(1).max(100),
  entity: z.string().min(1).max(100),
  entityId: z.string().max(200).optional(),
  detail: z.string().min(1).max(2000),
  user: z.string().max(200).default("admin"),
});

export type ActivityEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  user: string;
  createdAt: string;
};

// GET – return recent activity (cursor-based pagination)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const PAGE = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const entity = req.nextUrl.searchParams.get("entity") ?? undefined;
  const user = req.nextUrl.searchParams.get("user") ?? undefined;
  const action = req.nextUrl.searchParams.get("action") ?? undefined;

  const rows = await prisma.activityLog.findMany({
    where: {
      tenantId: auth.tenantId,
      ...(entity && { entity }),
      ...(user && { user }),
      ...(action && { action }),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > PAGE;
  const items = hasMore ? rows.slice(0, PAGE) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const entries: ActivityEntry[] = items.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId ?? undefined,
    detail: r.detail,
    user: r.user,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ items: entries, nextCursor });
}

// POST – add a new entry
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "activity-log"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = await prisma.activityLog.create({
    data: {
      action: parsed.data.action,
      entity: parsed.data.entity,
      entityId: parsed.data.entityId ?? null,
      detail: parsed.data.detail,
      user: parsed.data.user,
      tenantId: auth.tenantId,
    },
  });

  const entry: ActivityEntry = {
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId ?? undefined,
    detail: row.detail,
    user: row.user,
    createdAt: row.createdAt.toISOString(),
  };

  return NextResponse.json(entry, { status: 201 });
}

// COMPLIANCE 2026-05-06: DELETE /api/activity-log REMOVIDO. Antes cualquier
// admin del tenant podía borrar TODO el audit log → violación Art. 11 Ley 29733
// (conservación 5 años) + ruptura del hash chain de evidencia. Si en el futuro
// se necesita reset (demos / staging), agregar nuevo endpoint protegido por
// rol "superadmin" con audit trail propio del DELETE.
export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "activity-log"); if (_rl) return _rl;
  return NextResponse.json(
    { error: "endpoint deshabilitado por compliance — Art. 11 Ley 29733" },
    { status: 410 },
  );
}

