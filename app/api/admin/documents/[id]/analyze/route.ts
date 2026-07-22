import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/[id]/analyze — lee el contenido del documento (texto de
 * PDFs vía unpdf, o texto plano), lo guarda en ocrText (para que el asistente pueda
 * responder con la info) y le pide a la IA un resumen + datos clave + etiquetas, que
 * se guardan en ocrMetadata / aiTags. Sin IA → guarda solo el texto extraído.
 */
type Ctx = { params: Promise<{ id: string }> };

const ResultSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()).max(10).default([]),
  tags: z.array(z.string()).max(8).default([]),
});

async function extractDocText(buf: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (mimeType.startsWith("text/")) return new TextDecoder().decode(buf);
  return "";
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:analyze");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const raw = await extractDocText(new Uint8Array(buf), doc.mimeType).catch(() => "");
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 15000);
    if (!text) {
      return NextResponse.json(
        { error: "no_text", message: "No pude extraer texto. Si es una imagen o un escaneo, usá el botón Escanear (OCR)." },
        { status: 422 },
      );
    }

    let summary = "";
    let keyFacts: string[] = [];
    let tags: string[] = [];
    if (getActiveProvider() !== "none") {
      try {
        const prompt = `Analizá este documento de una bodega/negocio peruano y devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma:
{"summary": "<resumen en 1-2 frases, español>", "keyFacts": ["<dato clave con su valor, ej. 'Renta: S/1500 mensuales'>", ...máximo 8], "tags": ["<etiqueta corta en minúscula>", ...máximo 6]}

Documento:
${text.slice(0, 8000)}`;
        const { text: out } = await generateText({ model: smartModel, prompt, temperature: 0.2 });
        const parsed = ResultSchema.safeParse(JSON.parse(cleanJSONResponse(out)));
        if (parsed.success) {
          summary = parsed.data.summary;
          keyFacts = parsed.data.keyFacts;
          tags = parsed.data.tags;
        }
      } catch (err) {
        logger.warn("documents.analyze.ai_fail", { err: err instanceof Error ? err.message : String(err) });
      }
    }

    await DocumentsDB.update(auth.tenantId, id, {
      ocrText: text,
      ocrMetadata: { summary, keyFacts, analyzedAt: new Date().toISOString() },
      aiTags: Array.from(new Set([...doc.aiTags, ...tags.map((t) => t.toLowerCase())])).slice(0, 12),
    });

    DocumentsDB.log(auth.tenantId, { documentId: id, actorId: auth.username, action: "ai_categorize" }).catch((err) =>
      logger.warn("documents.analyze.audit_fail", { err: String(err) }),
    );

    return NextResponse.json({
      summary,
      keyFacts,
      tags,
      textLength: text.length,
      source: summary ? "ai" : "text-only",
    });
  } catch (e) {
    logger.error("[documents.analyze] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
