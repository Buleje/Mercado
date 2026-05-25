import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

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
  try {
    const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const PAGE = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const entity = req.nextUrl.searchParams.get("entity") ?? undefined;
    const user = req.nextUrl.searchParams.get("user") ?? undefined;
    const action = req.nextUrl.searchParams.get("action") ?? undefined;

    // Audit project-wide 2026-05-19: migrado a ActivityLogDB.listWithCursor.
    const { items, nextCursor } = await ActivityLogDB.listWithCursor(auth.tenantId, {
      entity,
      user,
      action,
      limit: PAGE,
      cursor,
    });

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

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST – add a new entry
export async function POST(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "activity-log"); if (_rl) return _rl;
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Audit project-wide 2026-05-19: migrado a ActivityLogDB.create.
    const row = await ActivityLogDB.create(auth.tenantId, {
      action: parsed.data.action,
      entity: parsed.data.entity,
      entityId: parsed.data.entityId,
      detail: parsed.data.detail,
      user: parsed.data.user,
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

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// COMPLIANCE 2026-05-06: DELETE /api/activity-log REMOVIDO. Antes cualquier
// admin del tenant podía borrar TODO el audit log → violación Art. 11 Ley 29733
// (conservación 5 años) + ruptura del hash chain de evidencia. Si en el futuro
// se necesita reset (demos / staging), agregar nuevo endpoint protegido por
// rol "superadmin" con audit trail propio del DELETE.
export async function DELETE(req: NextRequest) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "activity-log"); if (_rl) return _rl;
    return NextResponse.json(
      { error: "endpoint deshabilitado por compliance — Art. 11 Ley 29733" },
      { status: 410 },
    );

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

