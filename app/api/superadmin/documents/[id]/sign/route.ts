import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import {
  buildStoragePath,
  downloadFromStorage,
  uploadToStorage,
} from "@/lib/documents/storage";
import { signPdfVisually } from "@/lib/documents/pdf-signer";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";


const SignBody = z.object({
  signerName: z.string().min(2).max(120),
  signerRole: z.string().max(120).optional(),
  signatureImagePngBase64: z.string().max(2_500_000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "sa-documents:sign");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = SignBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const doc = await DocumentsDB.getById(SUPERADMIN_DOCS_TENANT, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (doc.mimeType !== "application/pdf") {
    return NextResponse.json({ error: "only_pdf_signable" }, { status: 415 });
  }

  try {
    const original = await downloadFromStorage(doc.storagePath);
    if (!original) {
      return NextResponse.json({ error: "storage_download_fail" }, { status: 502 });
    }

    const result = await signPdfVisually({
      pdfBytes: original,
      signerName: parsed.data.signerName,
      signerRole: parsed.data.signerRole,
      signatureImagePngBase64: parsed.data.signatureImagePngBase64,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    });

    const newPath = buildStoragePath({
      tenantId: SUPERADMIN_DOCS_TENANT,
      documentId: id,
      versionLabel: "signed",
      originalName: doc.originalName,
    });
    const up = await uploadToStorage(newPath, result.signedBytes, "application/pdf");
    if (!up.ok) {
      return NextResponse.json({ error: "storage_upload_fail", detail: up.error }, { status: 502 });
    }

    const v = await DocumentsDB.addVersion(SUPERADMIN_DOCS_TENANT, id, {
      storagePath: newPath,
      size: result.signedBytes.length,
      mimeType: "application/pdf",
      uploadedById: auth.username,
      changeNote: `Firmado por ${parsed.data.signerName}`,
    });

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: id,
      actorId: auth.username,
      action: "sign",
      metadata: {
        signerName: parsed.data.signerName,
        signerRole: parsed.data.signerRole,
        originalSha256: result.originalSha256,
        signedAt: result.signedAt,
        versionNumber: v?.versionNumber,
      },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    }).catch((err) => logger.warn("sa-documents.audit.fail", { err: String(err) }));

    return NextResponse.json({
      version: v,
      originalSha256: result.originalSha256,
      signedAt: result.signedAt,
    });
  } catch (err) {
    logger.error("sa-documents.sign.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
