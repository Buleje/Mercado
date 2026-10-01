import "server-only";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

const MAX_EXPORT_DOCS = 500;

/** GET /api/superadmin/documents/export → ZIP con todos los docs del vault. */
export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "sa-documents:export");
    if (rl) return rl;

    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const allDocs = await DocumentsDB.list(SUPERADMIN_DOCS_TENANT);
    if (allDocs.length === 0) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }

    // Cap de seguridad: evitamos OOM en vaults muy grandes.
    const docs = allDocs.slice(0, MAX_EXPORT_DOCS);

    const zip = new JSZip();
    let exported = 0;

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const bytes = await downloadFromStorage(doc.storagePath);
      if (bytes === null) {
        logger.warn("sa-documents.export.skip_null", { docId: doc.id, path: doc.storagePath });
        continue;
      }
      const safeName = `${String(i + 1).padStart(3, "0")}-${doc.name.replace(/[/\\]/g, "_")}`;
      zip.file(safeName, bytes);
      exported++;
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    // Copia a un Uint8Array respaldado por un ArrayBuffer real → BodyInit estricto.
    const body = new Uint8Array(zipBytes.length);
    body.set(zipBytes);

    // Audit best-effort: si documentId="*" causa FK error, el catch lo absorbe.
    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: "*",
      actorId: auth.username,
      action: "download",
      metadata: { export: true, count: exported },
    }).catch((err) => logger.warn("sa-documents.export.audit_fail", { err: String(err) }));

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="vault-superadmin-${Date.now()}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("sa-documents.export.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
