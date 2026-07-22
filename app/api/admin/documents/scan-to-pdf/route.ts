import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, uploadToStorage } from "@/lib/documents/storage";
import { mergeToPdf, type MergeItem } from "@/lib/documents/pdf-merge";

/**
 * POST /api/admin/documents/scan-to-pdf — recibe varias imágenes (fotos de las
 * páginas de un documento, tomadas con la cámara) y las combina en UN PDF, una
 * página por foto. Crea un documento nuevo. Reusa `mergeToPdf` (pdf-lib + sharp).
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:scan-to-pdf");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const form = await req.formData();
    const files = form.getAll("pages").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "no_pages" }, { status: 400 });
    if (files.length > 30) return NextResponse.json({ error: "too_many_pages" }, { status: 400 });

    const items: MergeItem[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      items.push({ bytes: new Uint8Array(await f.arrayBuffer()), mimeType: f.type, name: f.name || "foto" });
    }
    if (items.length === 0) return NextResponse.json({ error: "no_image_pages" }, { status: 400 });

    const merged = await mergeToPdf(items);
    if (merged.pageCount === 0) return NextResponse.json({ error: "empty" }, { status: 422 });

    const nameRaw = String(form.get("name") || "").trim();
    const folderIdRaw = form.get("folderId");
    const folderId = folderIdRaw && folderIdRaw !== "null" && folderIdRaw !== "" ? String(folderIdRaw) : null;
    const name = (nameRaw || `Escaneo ${merged.pageCount} pág.`).slice(0, 120);
    const fileName = `${name.replace(/[^\w.-]+/g, "_")}.pdf`;

    const draft = await DocumentsDB.create(auth.tenantId, {
      folderId,
      name,
      originalName: fileName,
      mimeType: "application/pdf",
      size: merged.bytes.length,
      storagePath: "pending",
      category: "otros",
      uploadedById: auth.username,
    });
    const storagePath = buildStoragePath({ tenantId: auth.tenantId, documentId: draft.id, versionLabel: "v1", originalName: fileName });
    const up = await uploadToStorage(storagePath, merged.bytes, "application/pdf");
    if (!up.ok) {
      await DocumentsDB.hardDelete(auth.tenantId, draft.id);
      return NextResponse.json({ error: "storage_upload_fail" }, { status: 502 });
    }
    await DocumentsDB.setStoragePath(auth.tenantId, draft.id, storagePath);

    DocumentsDB.log(auth.tenantId, {
      documentId: draft.id,
      actorId: auth.username,
      action: "upload",
      metadata: { via: "scan-to-pdf", pages: merged.pageCount },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }).catch((err) => logger.warn("documents.scan_to_pdf.audit_fail", { err: String(err) }));

    return NextResponse.json({ document: { ...draft, storagePath }, pageCount: merged.pageCount });
  } catch (e) {
    logger.error("[documents.scan-to-pdf] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "scan_failed" }, { status: 500 });
  }
}
