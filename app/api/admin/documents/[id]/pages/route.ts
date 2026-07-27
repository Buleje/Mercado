import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { getPdfPageCount } from "@/lib/documents/pdf-pages";
import { editPdfPages } from "@/lib/documents/edit-pdf-document";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

/** GET → cantidad de páginas del PDF (para el editor). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "DRIVE_READ", "documents:pages-info");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const doc = await DocumentsDB.getById(auth.tenantId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (doc.mimeType !== "application/pdf") return NextResponse.json({ error: "only_pdf" }, { status: 415 });
  const buf = await downloadFromStorage(doc.storagePath);
  if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });
  try {
    const pageCount = await getPdfPageCount(new Uint8Array(buf));
    return NextResponse.json({ pageCount });
  } catch (e) {
    logger.error("[documents.pages.count] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

const Body = z.object({
  pages: z.array(z.object({ index: z.number().int().min(0), rotate: z.number().int().optional() })).min(1).max(500),
});

/** POST → reordena/elimina/rota páginas individuales → nueva versión. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "documents:edit-pages");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await editPdfPages(auth.tenantId, id, parsed.data.pages, auth.username, auth.role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ version: result.version });
}
