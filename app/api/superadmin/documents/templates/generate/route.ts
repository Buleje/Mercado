import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { ensureSystemTemplatesSeeded } from "@/lib/documents/templates-seed";
import { renderTemplateToPdf } from "@/lib/documents/template-renderer";
import {
  buildStoragePath,
  uploadToStorage,
} from "@/lib/documents/storage";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";


const GenBody = z.object({
  templateKey: z.string().min(1),
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  filename: z.string().min(1).max(120).optional(),
  folderId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "sa-documents:templates:generate");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => {
    logger.warn("sa-documents.templates.generate.body_parse_fail", { err: String(err) });
    return {};
  });
  const parsed = GenBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    await ensureSystemTemplatesSeeded();
    const tpl = await DocumentsDB.getTemplate(SUPERADMIN_DOCS_TENANT, parsed.data.templateKey);
    if (!tpl) return NextResponse.json({ error: "template_not_found" }, { status: 404 });

    // Validar fields required
    for (const f of tpl.fields) {
      if (f.required && (parsed.data.values[f.name] === undefined || parsed.data.values[f.name] === "")) {
        return NextResponse.json(
          { error: "missing_required_field", field: f.name, label: f.label },
          { status: 400 }
        );
      }
    }

    const pdfBytes = await renderTemplateToPdf({
      title: tpl.name,
      body: tpl.body,
      values: parsed.data.values,
    });

    const filename = parsed.data.filename ?? `${tpl.key}-${Date.now()}.pdf`;
    const draft = await DocumentsDB.create(SUPERADMIN_DOCS_TENANT, {
      folderId: parsed.data.folderId ?? null,
      name: filename,
      originalName: filename,
      mimeType: "application/pdf",
      size: pdfBytes.length,
      storagePath: "pending",
      category: tpl.key.startsWith("contrato") ? "contratos" : tpl.key === "cotizacion" ? "facturas" : "otros",
      tags: ["generado", tpl.key],
      uploadedById: auth.username,
    });

    const storagePath = buildStoragePath({
      tenantId: SUPERADMIN_DOCS_TENANT,
      documentId: draft.id,
      versionLabel: "v1",
      originalName: filename,
    });
    const up = await uploadToStorage(storagePath, pdfBytes, "application/pdf");
    if (!up.ok) {
      await DocumentsDB.hardDelete(SUPERADMIN_DOCS_TENANT, draft.id);
      return NextResponse.json({ error: "storage_fail", detail: up.error }, { status: 502 });
    }

    await DocumentsDB.setStoragePath(SUPERADMIN_DOCS_TENANT, draft.id, storagePath);

    DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
      documentId: draft.id,
      actorId: auth.username,
      action: "upload",
      metadata: { templateKey: tpl.key, generated: true },
    }).catch((err) => logger.warn("sa-documents.audit.template_fail", { err: String(err) }));

    return NextResponse.json({
      document: { ...draft, storagePath, size: pdfBytes.length },
    });
  } catch (err) {
    logger.error("sa-documents.templates.generate.exception", { err: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
