import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  isMimeAllowed,
  uploadToStorage,
} from "@/lib/documents/storage";
import { aiCategorize } from "@/lib/documents/ai-categorize";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import { assertCsrf } from "@/lib/auth/csrf";


const ListQuery = z.object({
  folderId: z.string().nullable().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  tags: z.string().optional(), // CSV
  favorite: z.enum(["1", "0", "true", "false"]).optional(),
  customerId: z.string().optional(),
  orderId: z.string().optional(),
  supplierId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:list");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = ListQuery.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }
  const f = parsed.data;

  const docs = await DocumentsDB.list(auth.tenantId, {
    folderId: f.folderId === "null" ? null : f.folderId,
    category: f.category,
    q: f.q,
    tags: f.tags?.split(",").map((s) => s.trim()).filter(Boolean),
    favorite: f.favorite ? f.favorite === "1" || f.favorite === "true" : undefined,
    customerId: f.customerId,
    orderId: f.orderId,
    supplierId: f.supplierId,
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "documents:upload");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: "too_large", maxBytes: MAX_UPLOAD_SIZE },
        { status: 413 }
      );
    }
    const mime = file.type || "application/octet-stream";
    if (!isMimeAllowed(mime)) {
      return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
    }

    const folderIdRaw = form.get("folderId");
    const folderId =
      folderIdRaw && folderIdRaw !== "null" && folderIdRaw !== ""
        ? String(folderIdRaw)
        : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name || "archivo";

    // 1) Crear row con storagePath temporal (lo necesitamos para el path estable)
    const draft = await DocumentsDB.create(auth.tenantId, {
      folderId,
      name: originalName,
      originalName,
      mimeType: mime,
      size: file.size,
      storagePath: "pending",
      uploadedById: auth.username,
    });

    const storagePath = buildStoragePath({
      tenantId: auth.tenantId,
      documentId: draft.id,
      versionLabel: "v1",
      originalName,
    });

    const up = await uploadToStorage(storagePath, buffer, mime);
    if (!up.ok) {
      await DocumentsDB.hardDelete(auth.tenantId, draft.id);
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }

    // 2) Actualizar con storagePath real + heurística inicial
    const heur = await aiCategorize({
      filename: originalName,
      mimeType: mime,
      size: file.size,
      textSnippet: mime.startsWith("text/") ? buffer.slice(0, 4096).toString("utf8") : undefined,
    });

    const updated = await DocumentsDB.update(auth.tenantId, draft.id, {
      category: heur.category,
      tags: heur.tags,
      aiCategory: heur.source === "ai" ? heur.category : undefined,
      aiTags: heur.source === "ai" ? heur.tags : undefined,
    });

    await DocumentsDB.setStoragePath(auth.tenantId, draft.id, storagePath);

    DocumentsDB.log(auth.tenantId, {
      documentId: draft.id,
      actorId: auth.username,
      action: "upload",
      metadata: { mime, size: file.size, source: heur.source },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }).catch((err) => logger.warn("documents.audit.upload_fail", { err: String(err) }));

    return NextResponse.json({
      document: {
        ...(updated ?? draft),
        storagePath,
        category: heur.category,
        tags: heur.tags,
      },
      ai: { source: heur.source, suggestedCategory: heur.category, suggestedTags: heur.tags },
    });
  } catch (err) {
    logger.error("documents.upload.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
