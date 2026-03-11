export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export type ActivityEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  user: string;
  createdAt: string;
};

// GET – return recent activity
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 500);
  const entity = req.nextUrl.searchParams.get("entity") ?? undefined;
  const user = req.nextUrl.searchParams.get("user") ?? undefined;

  const rows = await prisma.activityLog.findMany({
    where: {
      ...(entity && { entity }),
      ...(user && { user }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const entries: ActivityEntry[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId ?? undefined,
    detail: r.detail,
    user: r.user,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json(entries);
}

// POST – add a new entry
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { action, entity, entityId, detail, user } = body;
  if (!action || !entity || !detail) {
    return NextResponse.json({ error: "action, entity, detail requeridos" }, { status: 400 });
  }

  const row = await prisma.activityLog.create({
    data: {
      action,
      entity,
      entityId: entityId ?? null,
      detail,
      user: user ?? "admin",
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

// DELETE – clear all entries (admin only)
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  await prisma.activityLog.deleteMany({});
  return NextResponse.json({ ok: true });
}

