import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { buildChildrenMap, descendantIds } from "@/lib/documentos/folder-tree";


const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  allowedRoles: z.array(z.string().max(30)).max(10).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:folders:patch");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    // Prevenir loops: no permitir parentId === id, ni asignar el folder a un descendiente
    if (parsed.data.parentId === id) {
      return NextResponse.json({ error: "folder_cannot_parent_itself" }, { status: 400 });
    }
    if (parsed.data.parentId) {
      const all = await DocumentsDB.listFolders(auth.tenantId);
      if (descendantIds(buildChildrenMap(all), id).has(parsed.data.parentId)) {
        return NextResponse.json({ error: "folder_cannot_be_moved_into_descendant" }, { status: 400 });
      }
    }

    const f = await DocumentsDB.updateFolder(auth.tenantId, id, parsed.data);
    if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ folder: f });

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:folders:delete");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const ok = await DocumentsDB.deleteFolder(auth.tenantId, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
