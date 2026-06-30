import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, isMimeAllowed, uploadToStorage } from "@/lib/documents/storage";
import { aiCategorize } from "@/lib/documents/ai-categorize";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

/**
 * /api/superadmin/documents — repositorio de documentos EXCLUSIVO del superadmin.
 *
 * Reutiliza toda la infra de `DocumentsDB` + storage, scopeada al tenant sintético
 * SUPERADMIN_DOCS_TENANT (aislado de cualquier negocio real). Auth = PLATFORM_SESSION.
 *
 * GET  → lista (filtros: category, q, favorite, expiring)
 * POST → upload (multipart/form-data: file, [category])
 */

const ListQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  favorite: z.enum(["1", "0", "true", "false"]).optional(),
  expiring: z.coerce.number().int().min(1).max(365).optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "sa-documents:list");
  if (rl) return rl;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = ListQuery.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const f = parsed.data;

  if (f.expiring) {
    const expiring = await DocumentsDB.listExpiring(SUPERADMIN_DOCS_TENANT, f.expiring);
    return NextResponse.json({ documents: expiring });
  }

  const docs = await DocumentsDB.list(SUPERADMIN_DOCS_TENANT, {
    category: f.category,
    q: f.q,
    favorite: f.favorite ? f.favorite === "1" || f.favorite === "true" : undefined,
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "sa-documents:upload");
  if (rl) return rl;
  // CSRF defense-in-depth para el multipart upload (igual que /api/superadmin/upload).
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "too_large", maxBytes: MAX_UPLOAD_SIZE }, { status: 413 });
    }
    const mime = file.type || "application/octet-stream";
    if (!isMimeAllowed(mime)) {
      return NextResponse.json({ error: "mime_not_allowed", mime }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name || "archivo";

    // 1) Row con storagePath temporal (lo necesitamos para construir el path estable).
    const draft = await DocumentsDB.create(SUPERADMIN_DOCS_TENANT, {
      folderId: null,
      name: originalName,
      originalName,
      mimeType: mime,
      size: file.size,
      storagePath: "pending",
      uploadedById: auth.username,
    });

    const storagePath = buildStoragePath({
      tenantId: SUPERADMIN_DOCS_TENANT,
      documentId: draft.id,
      versionLabel: "v1",
      originalName,
    });

    const up = await uploadToStorage(storagePath, buffer, mime);
    if (!up.ok) {
      await DocumentsDB.hardDelete(SUPERADMIN_DOCS_TENANT, draft.id);
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }

    // 2) Heurística de categoría/tags (mismo motor que el panel admin).
    const heur = await aiCategorize({
      filename: originalName,
      mimeType: mime,
      size: file.size,
      textSnippet: mime.startsWith("text/") ? buffer.slice(0, 4096).toString("utf8") : undefined,
    });

    const updated = await DocumentsDB.update(SUPERADMIN_DOCS_TENANT, draft.id, {
      category: heur.category,
      tags: heur.tags,
      aiCategory: heur.source === "ai" ? heur.category : undefined,
      aiTags: heur.source === "ai" ? heur.tags : undefined,
    });

    await DocumentsDB.setStoragePath(SUPERADMIN_DOCS_TENANT, draft.id, storagePath);

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: draft.id,
      actorId: auth.username,
      action: "upload",
      metadata: { mime, size: file.size, source: heur.source },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }).catch((err) => logger.warn("sa-documents.audit.upload_fail", { err: String(err) }));

    return NextResponse.json({
      document: { ...(updated ?? draft), storagePath, category: heur.category, tags: heur.tags },
    });
  } catch (err) {
    logger.error("sa-documents.upload.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
