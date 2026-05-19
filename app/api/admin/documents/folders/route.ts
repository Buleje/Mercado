import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";


const CreateBody = z.object({
  name: z.string().min(1).max(80),
  parentId: z.string().nullable().optional(),
  color: z.string().max(20).optional(),
  icon: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:folders:list");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const folders = await DocumentsDB.listFolders(auth.tenantId);
  return NextResponse.json({ folders });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:folders:create");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const folder = await DocumentsDB.createFolder(auth.tenantId, parsed.data);
  return NextResponse.json({ folder });
}
