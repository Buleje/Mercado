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
const StructuredSchema = z
  .object({
    docType: z.string().max(40).nullish(),
    ruc: z.string().max(20).nullish(),
    razonSocial: z.string().max(160).nullish(),
    numero: z.string().max(40).nullish(),
    fecha: z.string().max(20).nullish(),
    moneda: z.string().max(8).nullish(),
    total: z.union([z.number(), z.string()]).nullish(),
    igv: z.union([z.number(), z.string()]).nullish(),
  })
  .partial();

const ResultSchema = z.object({
  summary: z.string(),
  keyFacts: z.array(z.string()).max(10).default([]),
  tags: z.array(z.string()).max(8).default([]),
  structured: StructuredSchema.nullish(),
});

export type StructuredData = z.infer<typeof StructuredSchema>;

export type AnalyzeResult =
  | { ok: true; summary: string; keyFacts: string[]; tags: string[]; structured: StructuredData | null; textLength: number; source: string }
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
  let structured: StructuredData | null = null;
  if (getActiveProvider() !== "none") {
    try {
      const prompt = `Analizá este documento de una bodega/negocio peruano y devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma:
{"summary": "<resumen en 1-2 frases, español>", "keyFacts": ["<dato clave con su valor, ej. 'Renta: S/1500 mensuales'>", ...máximo 8], "tags": ["<etiqueta corta en minúscula>", ...máximo 6], "structured": {"docType": "<factura|boleta|recibo|contrato|guia|cotizacion|otro>", "ruc": "<RUC 11 dígitos o null>", "razonSocial": "<nombre del emisor o null>", "numero": "<nº de documento o null>", "fecha": "<fecha AAAA-MM-DD o null>", "moneda": "<PEN|USD o null>", "total": <monto total como número o null>, "igv": <IGV como número o null>}}

En "structured" extraé lo que sea un comprobante (factura/boleta/recibo/guía); si el documento no tiene esos datos, poné structured en null. Los montos como número sin símbolo.

Documento:
${text.slice(0, 8000)}`;
      const { text: out } = await generateText({ model: smartModel, prompt, temperature: 0.2 });
      const parsed = ResultSchema.safeParse(JSON.parse(cleanJSONResponse(out)));
      if (parsed.success) {
        summary = parsed.data.summary;
        keyFacts = parsed.data.keyFacts;
        tags = parsed.data.tags;
        // Solo guardamos structured si tiene al menos un campo con valor.
        const s = parsed.data.structured;
        structured = s && Object.values(s).some((v) => v !== null && v !== undefined && v !== "") ? s : null;
      }
    } catch (err) {
      logger.warn("documents.analyze.ai_fail", { err: err instanceof Error ? err.message : String(err) });
    }
  }

  await DocumentsDB.update(tenantId, docId, {
    ocrText: text,
    ocrMetadata: {
      ...(doc.ocrMetadata ?? {}),
      summary,
      keyFacts,
      structured,
      analyzedAt: new Date().toISOString(),
    },
    aiTags: Array.from(new Set([...doc.aiTags, ...tags.map((t) => t.toLowerCase())])).slice(0, 12),
  });

  DocumentsDB.log(tenantId, { documentId: docId, actorId, action: "ai_categorize" }).catch((err) =>
    logger.warn("documents.analyze.audit_fail", { err: String(err) }),
  );

  return { ok: true, summary, keyFacts, tags, structured, textLength: text.length, source: summary ? "ai" : "text-only" };
}
