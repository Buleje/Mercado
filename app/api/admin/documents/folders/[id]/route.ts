import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";


const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:folders:patch");
  if (rl) return rl;
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

  const f = await DocumentsDB.updateFolder(auth.tenantId, id, parsed.data);
  if (!f) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ folder: f });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:folders:delete");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const ok = await DocumentsDB.deleteFolder(auth.tenantId, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
