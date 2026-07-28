import { generateText } from "ai";
import { DOCX_MIME, esImagenAnalizable, isAnalyzableMime, XLSX_MIME } from "./analyzable-mime";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage, getSignedUrl } from "@/lib/documents/storage";
import { smartModel, getActiveProvider } from "@/lib/ai/provider";
import { cleanJSONResponse } from "@/lib/ai-json-parser";
import { logger } from "@/lib/logger";
import {
  flattenEntities,
  promptDeDescripcion,
  ResultSchema,
  type DocEntities,
  type ResultadoDescripcion,
  type StructuredData,
} from "./descripcion-schema";
import { motivoDeFalloIA } from "./aviso-ia";
import { construirTextoBuscable } from "./texto-buscable";
import { describirImagenConVision } from "./vision-describe";

/**
 * Analiza el contenido de un documento y responde la pregunta "¿qué es esto?".
 *
 * Dos caminos, un solo resultado:
 *  · TEXTO (PDF vía unpdf, Word, Excel, .txt): se extrae el texto y se lo manda
 *    al modelo.
 *  · VISIÓN (fotos y escaneos): el modelo MIRA la imagen y transcribe lo que se
 *    lee. Antes esto sólo pasaba si la foto entraba por el escáner de cámara;
 *    ahora cualquier imagen del drive se puede describir.
 *
 * Lo que se guarda: el texto buscable en `ocrText` (crudo + descripción +
 * datos + entidades, ver `texto-buscable`) y el detalle en `ocrMetadata`. Así
 * el buscador encuentra un archivo por lo que DICE, no por cómo se llama, y el
 * asistente puede responder con su contenido.
 */

export type { DocEntities, StructuredData };

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
      /** Se guardó el texto pero la IA no pudo describirlo, y por qué. */
      aviso?: string;
    }
  | { ok: false; error: string; status: number };

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

/** Normaliza el texto extraído: espacios colapsados y tope de contexto. */
const normalizar = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 15000);

export async function analyzeDocumentContent(
  tenantId: string,
  docId: string,
  actorId: string,
  viewerRole?: string,
): Promise<AnalyzeResult> {
  const doc = await DocumentsDB.getById(tenantId, docId, viewerRole);
  if (!doc) return { ok: false, error: "not_found", status: 404 };

  // Carpetas del drive: la IA elige entre ELLAS (o ninguna) — nunca inventa.
  const carpetas = await DocumentsDB.listFolders(tenantId).catch(() => []);
  const nombresCarpetas = carpetas.map((c) => c.name);

  let text = "";
  let ia: ResultadoDescripcion | null = null;
  let aviso: string | undefined;

  if (esImagenAnalizable(doc.mimeType)) {
    // La visión necesita una URL pública: el modelo baja la imagen desde afuera.
    const url = await getSignedUrl(doc.storagePath);
    if (!url) return { ok: false, error: "storage_unavailable", status: 502 };
    const visto = await describirImagenConVision(
      // Las dos formas de entregar la imagen: la URL para un modelo en la nube
      // y los bytes para uno propio (Ollama local no puede bajar nada de acá).
      { url, mimeType: doc.mimeType, descargar: () => downloadFromStorage(doc.storagePath) },
      nombresCarpetas,
    );
    if (!visto.ok) {
      // Falta configuración vs. se cayó el servicio: son dos problemas
      // distintos y quien mira la pantalla tiene que poder distinguirlos.
      return visto.motivo === "falla"
        ? { ok: false, error: "vision_fail", status: 502 }
        : { ok: false, error: "vision_unavailable", status: 503 };
    }
    ia = visto.datos;
    text = normalizar(ia.ocrText ?? "");
  } else {
    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return { ok: false, error: "storage_unavailable", status: 502 };
    text = normalizar(await extractDocText(new Uint8Array(buf), doc.mimeType).catch(() => ""));
    if (!text) return { ok: false, error: "no_text", status: 422 };

    if (getActiveProvider() !== "none") {
      try {
        const prompt = promptDeDescripcion({ modo: "texto", carpetas: nombresCarpetas, texto: text.slice(0, 10000) });
        const { text: out } = await generateText({ model: smartModel, prompt, temperature: 0.2 });
        const parsed = ResultSchema.safeParse(JSON.parse(cleanJSONResponse(out)));
        if (parsed.success) ia = parsed.data;
        else aviso = "La IA contestó algo que no pude entender. Probá de nuevo.";
      } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err);
        logger.warn("documents.analyze.ai_fail", { err: detalle });
        aviso = motivoDeFalloIA(detalle);
      }
    } else {
      aviso = "No hay ningún servicio de IA configurado, así que sólo se guardó el texto del documento.";
    }
  }

  const summary = ia?.summary ?? "";
  const description = ia?.description ?? "";
  const keyFacts = ia?.keyFacts ?? [];
  const tags = ia?.tags ?? [];
  const entities = ia?.entities && flattenEntities(ia.entities).length > 0 ? ia.entities : null;
  // Solo guardamos structured si tiene al menos un campo con valor.
  const structured =
    ia?.structured && Object.values(ia.structured).some((v) => v !== null && v !== undefined && v !== "")
      ? ia.structured
      : null;

  // Sugerencias de organización: la carpeta debe EXISTIR (se resuelve a su id,
  // sin inventar) y el vencimiento ser una fecha real AAAA-MM-DD.
  let sugerencias: { folderId?: string; folderName?: string; expiresAt?: string } | null = null;
  const sug = ia?.sugerencia;
  if (sug) {
    const out: { folderId?: string; folderName?: string; expiresAt?: string } = {};
    if (sug.carpeta) {
      const carpeta = carpetas.find((c) => c.name.trim().toLowerCase() === sug.carpeta!.trim().toLowerCase());
      if (carpeta) { out.folderId = carpeta.id; out.folderName = carpeta.name; }
    }
    if (sug.vencimiento && /^\d{4}-\d{2}-\d{2}$/.test(sug.vencimiento)) {
      const fecha = new Date(`${sug.vencimiento}T12:00:00Z`);
      if (!Number.isNaN(fecha.getTime())) out.expiresAt = fecha.toISOString();
    }
    if (out.folderId || out.expiresAt) sugerencias = out;
  }

  // La descripción escrita a mano sobrevive al re-análisis: es la que corrige a
  // la IA cuando se equivoca, sería absurdo borrarla al volver a describir.
  const meta = (doc.ocrMetadata ?? {}) as Record<string, unknown>;
  const descripcionPropia = typeof meta.descripcionUsuario === "string" ? meta.descripcionUsuario : "";

  const searchable = construirTextoBuscable({
    texto: text,
    descripcion: description,
    keyFacts,
    entidades: flattenEntities(entities),
    tags,
    descripcionPropia,
  });

  await DocumentsDB.update(tenantId, docId, {
    ocrText: searchable,
    ocrMetadata: {
      ...meta,
      summary,
      description,
      keyFacts,
      entities,
      structured,
      sugerencias,
      rawTextLength: text.length,
      analyzedAt: new Date().toISOString(),
      // De dónde salió: mirar la foto no es lo mismo que leer el texto, y en la
      // ficha conviene decirlo (la visión se equivoca distinto).
      analyzedVia: esImagenAnalizable(doc.mimeType) ? "vision" : "texto",
    },
    aiTags: Array.from(new Set([...doc.aiTags, ...tags.map((t) => t.toLowerCase())])).slice(0, 14),
  });

  DocumentsDB.log(tenantId, { documentId: docId, actorId, action: "ai_categorize" }).catch((err) =>
    logger.warn("documents.analyze.audit_fail", { err: String(err) }),
  );

  return {
    ok: true,
    summary,
    description,
    keyFacts,
    tags,
    entities,
    structured,
    textLength: text.length,
    source: summary ? "ai" : "text-only",
    ...(description ? {} : { aviso }),
  };
}
