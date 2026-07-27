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
import { analyzeDocumentContent, isAnalyzableMime } from "@/lib/documents/analyze-document";
import { MAX_UPLOAD_SIZE } from "@/lib/types/documents";
import { resolverMime } from "@/lib/documents/tipos-archivo";
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
  // ADR-119 — "por vencer": documentos que vencen dentro de N días (def. 30).
  expiring: z.coerce.number().int().min(1).max(365).optional(),
  // ADR-119 — búsqueda semántica IA (expande la query antes de buscar).
  semantic: z.enum(["1", "true"]).optional(),
  // Vista "Papelera": sólo documentos soft-deleted.
  deleted: z.enum(["1", "true"]).optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "DRIVE_READ", "documents:list");
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

  // ADR-119 — vista "Por vencer": atajo dedicado, ignora el resto de filtros.
  if (f.expiring) {
    const expiring = await DocumentsDB.listExpiring(auth.tenantId, f.expiring);
    return NextResponse.json({ documents: expiring });
  }

  // ADR-119 — búsqueda semántica: expandimos la query a términos y los OR-eamos.
  let qAny: string[] | undefined;
  let semanticTerms: string[] | undefined;
  if (f.semantic && f.q?.trim()) {
    const { expandSearchTerms } = await import("@/lib/documents/ai-search");
    qAny = await expandSearchTerms(f.q);
    semanticTerms = qAny;
  }

  const deletedOnly = f.deleted === "1" || f.deleted === "true";
  const docs = await DocumentsDB.list(auth.tenantId, {
    // En la papelera no aplicamos folder (mostramos TODO lo eliminado del tenant).
    folderId: deletedOnly ? undefined : f.folderId === "null" ? null : f.folderId,
    category: f.category,
    q: qAny ? undefined : f.q,
    qAny,
    tags: f.tags?.split(",").map((s) => s.trim()).filter(Boolean),
    favorite: f.favorite ? f.favorite === "1" || f.favorite === "true" : undefined,
    customerId: f.customerId,
    orderId: f.orderId,
    supplierId: f.supplierId,
    deletedOnly,
  }, auth.role);

  return NextResponse.json({ documents: docs, ...(semanticTerms ? { semanticTerms } : {}) });
}

export async function POST(req: NextRequest) {
  // DRIVE y no STRICT: cada archivo es un request y el drive recibe carpetas
  // enteras — con 10 cada 15 min el importador moría al décimo (ADR-306).
  const rl = await applyRateLimit(req, "DRIVE", "documents:upload");
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
    // El navegador deja en blanco (u octet-stream) todo lo que su tabla no
    // conoce: HEIC del iPhone, .ods de LibreOffice, un .dwg. Guardar ESO hace
    // que después el drive no sepa ni qué ícono poner. Se resuelve por extensión.
    const mime = resolverMime(file.name, file.type);
    // El NOMBRE importa: la extensión es la que decide qué hace el sistema
    // operativo al abrirlo, y es más difícil de disfrazar que el MIME.
    if (!isMimeAllowed(mime, file.name)) {
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

    // Auto-análisis de contenido (fire-and-forget): los PDFs/texto se indexan solos
    // para que el asistente los pueda leer sin apretar "Analizar con IA".
    if (isAnalyzableMime(mime)) {
      analyzeDocumentContent(auth.tenantId, draft.id, auth.username, auth.role).catch((err) =>
        logger.warn("documents.autoanalyze_fail", { err: String(err) }),
      );
    }

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
