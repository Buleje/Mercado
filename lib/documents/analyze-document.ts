import { generateText } from "ai";
import { z } from "zod";
import { DOCX_MIME, isAnalyzableMime, XLSX_MIME } from "./analyzable-mime";
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

const EntitiesSchema = z
  .object({
    people: z.array(z.string().max(80)).max(12).default([]),
    orgs: z.array(z.string().max(80)).max(12).default([]),
    places: z.array(z.string().max(80)).max(12).default([]),
    dates: z.array(z.string().max(40)).max(12).default([]),
    amounts: z.array(z.string().max(40)).max(12).default([]),
  })
  .partial();

const ResultSchema = z.object({
  summary: z.string(),
  description: z.string().default(""),
  keyFacts: z.array(z.string()).max(14).default([]),
  tags: z.array(z.string()).max(14).default([]),
  entities: EntitiesSchema.nullish(),
  structured: StructuredSchema.nullish(),
});

export type StructuredData = z.infer<typeof StructuredSchema>;
export type DocEntities = z.infer<typeof EntitiesSchema>;

export type AnalyzeResult =
  | {
      ok: true;
      summary: string;
      description: string;
      keyFacts: string[];
      tags: string[];
      entities: DocEntities | null;
      structured: StructuredData | null;
      textLength: number;
      source: string;
    }
  | { ok: false; error: string; status: number };

/** Aplana las entidades en una lista de términos (para buscar). */
function flattenEntities(e: DocEntities | null | undefined): string[] {
  if (!e) return [];
  return [...(e.people ?? []), ...(e.orgs ?? []), ...(e.places ?? []), ...(e.dates ?? []), ...(e.amounts ?? [])].filter(Boolean);
}

export { isAnalyzableMime };

/** Entidades XML básicas → texto (el document.xml viene escapado). */
const desescapar = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/**
 * Texto de un .docx sin DOMParser (no existe en Node): los `<w:t>` de cada
 * párrafo, con salto por párrafo. Suficiente para describir y buscar.
 */
async function extractDocxText(buf: Uint8Array): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return xml
    .split("</w:p>")
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((t) => desescapar(t.replace(/<[^>]+>/g, "")))
      .join(""))
    .filter((linea) => linea.trim() !== "")
    .join("\n");
}

/** Texto de un .xlsx: nombre de hoja + celdas fila por fila (con tope). */
async function extractXlsxText(buf: Uint8Array): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const celda = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      const o = v as { richText?: { text?: string }[]; result?: unknown; text?: unknown };
      if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
      if (o.result !== null && o.result !== undefined) return String(o.result);
      if (o.text !== null && o.text !== undefined) return String(o.text);
      return "";
    }
    return String(v);
  };
  const out: string[] = [];
  let filas = 0;
  wb.eachSheet((ws) => {
    if (filas >= 400) return;
    out.push(`— Hoja: ${ws.name} —`);
    ws.eachRow((row) => {
      if (filas >= 400) return; // tope: para describir alcanza el arranque
      const vals = (Array.isArray(row.values) ? row.values : []).map(celda).filter((s) => s.trim() !== "");
      if (vals.length > 0) { out.push(vals.join(" | ")); filas++; }
    });
  });
  return out.join("\n");
}

async function extractDocText(buf: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (mimeType === DOCX_MIME) return extractDocxText(buf);
  if (mimeType === XLSX_MIME) return extractXlsxText(buf);
  if (mimeType.startsWith("text/")) return new TextDecoder().decode(buf);
  return "";
}

export async function analyzeDocumentContent(
  tenantId: string,
  docId: string,
  actorId: string,
  viewerRole?: string,
): Promise<AnalyzeResult> {
  const doc = await DocumentsDB.getById(tenantId, docId, viewerRole);
  if (!doc) return { ok: false, error: "not_found", status: 404 };

  const buf = await downloadFromStorage(doc.storagePath);
  if (!buf) return { ok: false, error: "storage_unavailable", status: 502 };

  const raw = await extractDocText(new Uint8Array(buf), doc.mimeType).catch(() => "");
  const text = raw.replace(/\s+/g, " ").trim().slice(0, 15000);
  if (!text) return { ok: false, error: "no_text", status: 422 };

  let summary = "";
  let description = "";
  let keyFacts: string[] = [];
  let tags: string[] = [];
  let entities: DocEntities | null = null;
  let structured: StructuredData | null = null;
  if (getActiveProvider() !== "none") {
    try {
      const prompt = `Sos un archivista experto. Analizá a fondo este documento de una bodega/negocio peruano y devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma:
{"summary": "<resumen en 1-2 frases>", "description": "<DESCRIPCIÓN DETALLADA Y BUSCABLE en 3-5 frases: qué tipo de documento es, quiénes son las partes involucradas, fechas clave, montos, el propósito y cualquier dato que alguien podría usar para encontrarlo después. Escribí en español, natural y completo.>", "keyFacts": ["<dato clave con su valor, ej. 'Renta: S/1500 mensuales'>", ...máximo 12], "tags": ["<etiqueta corta en minúscula; incluí tipo, partes, tema>", ...máximo 12], "entities": {"people": ["<personas mencionadas>"], "orgs": ["<empresas/organizaciones>"], "places": ["<direcciones/lugares>"], "dates": ["<fechas relevantes>"], "amounts": ["<montos, ej. 'S/1500'>"]}, "structured": {"docType": "<factura|boleta|recibo|contrato|guia|cotizacion|carta|otro>", "ruc": "<RUC 11 dígitos o null>", "razonSocial": "<emisor o null>", "numero": "<nº o null>", "fecha": "<AAAA-MM-DD o null>", "moneda": "<PEN|USD o null>", "total": <número o null>, "igv": <número o null>}}

La "description" es lo más importante: tiene que ser rica en términos para que el documento aparezca en búsquedas por nombre de persona, empresa, lugar, fecha o tema. En "structured" completá solo si es un comprobante; si no, structured en null. Montos como número sin símbolo.

Documento:
${text.slice(0, 10000)}`;
      const { text: out } = await generateText({ model: smartModel, prompt, temperature: 0.2 });
      const parsed = ResultSchema.safeParse(JSON.parse(cleanJSONResponse(out)));
      if (parsed.success) {
        summary = parsed.data.summary;
        description = parsed.data.description;
        keyFacts = parsed.data.keyFacts;
        tags = parsed.data.tags;
        const e = parsed.data.entities;
        entities = e && flattenEntities(e).length > 0 ? e : null;
        // Solo guardamos structured si tiene al menos un campo con valor.
        const s = parsed.data.structured;
        structured = s && Object.values(s).some((v) => v !== null && v !== undefined && v !== "") ? s : null;
      }
    } catch (err) {
      logger.warn("documents.analyze.ai_fail", { err: err instanceof Error ? err.message : String(err) });
    }
  }

  // ⭐ Texto buscable = texto crudo + enriquecimiento IA. La búsqueda del listado
  // matchea `ocrText`, así que meter acá la descripción/entidades/datos hace que
  // el documento aparezca al buscar por cualquier término descrito por la IA.
  const entitiesFlat = flattenEntities(entities);
  const searchable = [
    text,
    description ? `\n\n[Descripción] ${description}` : "",
    keyFacts.length ? `\n[Datos] ${keyFacts.join("; ")}` : "",
    entitiesFlat.length ? `\n[Entidades] ${entitiesFlat.join(", ")}` : "",
    tags.length ? `\n[Etiquetas] ${tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 20000);

  await DocumentsDB.update(tenantId, docId, {
    ocrText: searchable,
    ocrMetadata: {
      ...(doc.ocrMetadata ?? {}),
      summary,
      description,
      keyFacts,
      entities,
      structured,
      rawTextLength: text.length,
      analyzedAt: new Date().toISOString(),
    },
    aiTags: Array.from(new Set([...doc.aiTags, ...tags.map((t) => t.toLowerCase())])).slice(0, 14),
  });

  DocumentsDB.log(tenantId, { documentId: docId, actorId, action: "ai_categorize" }).catch((err) =>
    logger.warn("documents.analyze.audit_fail", { err: String(err) }),
  );

  return { ok: true, summary, description, keyFacts, tags, entities, structured, textLength: text.length, source: summary ? "ai" : "text-only" };
}
