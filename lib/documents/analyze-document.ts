import { generateText } from "ai";
import { z } from "zod";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";

/**
 * Analiza el contenido de un documento: extrae el texto (PDF vía unpdf, o texto
 * plano), lo guarda en `ocrText`, y le pide a la IA un resumen + datos clave + tags
 * (guardados en `ocrMetadata`/`aiTags`). Así el asistente puede responder CON el
 * contenido. Single-source: lo usan el endpoint manual y el auto-análisis al subir.
 */
const ResultSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()).max(10).default([]),
  tags: z.array(z.string()).max(8).default([]),
});

export type AnalyzeResult =
  | { ok: true; summary: string; keyFacts: string[]; tags: string[]; textLength: number; source: string }
  | { ok: false; error: string; status: number };

export function isAnalyzableMime(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("text/");
}

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

export async function analyzeDocumentContent(
  tenantId: string,
  docId: string,
  actorId: string,
): Promise<AnalyzeResult> {
  const doc = await DocumentsDB.getById(tenantId, docId);
  if (!doc) return { ok: false, error: "not_found", status: 404 };

  const buf = await downloadFromStorage(doc.storagePath);
  if (!buf) return { ok: false, error: "storage_unavailable", status: 502 };

  const raw = await extractDocText(new Uint8Array(buf), doc.mimeType).catch(() => "");
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 15000);
  if (!text) return { ok: false, error: "no_text", status: 422 };

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

  await DocumentsDB.update(tenantId, docId, {
    ocrText: text,
    ocrMetadata: { summary, keyFacts, analyzedAt: new Date().toISOString() },
    aiTags: Array.from(new Set([...doc.aiTags, ...tags.map((t) => t.toLowerCase())])).slice(0, 12),
  });

  DocumentsDB.log(tenantId, { documentId: docId, actorId, action: "ai_categorize" }).catch((err) =>
    logger.warn("documents.analyze.audit_fail", { err: String(err) }),
  );

  return { ok: true, summary, keyFacts, tags, textLength: text.length, source: summary ? "ai" : "text-only" };
}
