import { generateText } from "ai";
import { esImagenAnalizable, isAnalyzableMime } from "./analyzable-mime";
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
import { fechaDeVencimientoEnTexto } from "@/lib/documentos/fecha-vencimiento";
import { motivoDeFalloIA } from "./aviso-ia";
import { construirTextoBuscable } from "./texto-buscable";
import { renderizarPaginaPdf } from "./pdf-a-imagen";
/* La extracción vive aparte desde ADR-372: la comparte la clasificación de
   papeles del despacho, y el mismo PDF tiene que leerse igual desde los dos. */
import { extractDocText } from "./extraer-texto";
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

/** Normaliza el texto extraído: espacios colapsados y tope de contexto. */
const normalizar = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 15000);

/**
 * Un reintento que falla NO puede empeorar lo que ya sabíamos. Si el documento
 * ya estaba leído y hoy el servicio no contesta, se devuelve lo de antes con el
 * motivo — en vez de un "no tiene texto" que contradice lo que se ve en la
 * ficha y que haría dudar de datos que estaban bien.
 */
function loQueYaSabiamos(doc: { ocrText: string | null; ocrMetadata: Record<string, unknown> | null }, aviso: string): AnalyzeResult | null {
  const meta = (doc.ocrMetadata ?? {}) as Record<string, unknown>;
  if (!doc.ocrText?.trim() || !meta.analyzedAt) return null;
  const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    ok: true,
    summary: typeof meta.summary === "string" ? meta.summary : "",
    description: typeof meta.description === "string" ? meta.description : "",
    keyFacts: lista(meta.keyFacts),
    tags: lista(meta.tags),
    entities: (meta.entities as DocEntities | null) ?? null,
    structured: (meta.structured as StructuredData | null) ?? null,
    textLength: doc.ocrText.length,
    source: "previo",
    aviso,
  };
}

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
  /** El PDF no tenía texto y hubo que mirarlo: se dice en la ficha. */
  let escaneado = false;

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
      const previo = loQueYaSabiamos(doc, "No pude releerla ahora: queda lo que ya se había leído.");
      if (previo) return previo;
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

    // PDF ESCANEADO: por dentro es una foto, así que extraer texto no devuelve
    // nada. Es como llega media contabilidad peruana. En vez de rendirse, se
    // dibuja la página y se la MIRA, igual que a una foto de celular.
    if (!text && doc.mimeType === "application/pdf") {
      const imagen = await renderizarPaginaPdf(buf, 1);
      if (imagen) {
        const visto = await describirImagenConVision(
          { url: "", mimeType: "image/png", descargar: async () => imagen },
          nombresCarpetas,
        );
        if (visto.ok) {
          ia = visto.datos;
          text = normalizar(ia.ocrText ?? "");
          escaneado = true;
        } else if (visto.motivo !== "sin_proveedor") {
          logger.warn("documents.analyze.pdf_escaneado_sin_leer", { docId, motivo: visto.motivo });
        }
      }
    }

    if (!text) {
      const previo = loQueYaSabiamos(doc, "No pude releerlo ahora: queda lo que ya se había leído.");
      if (previo) return previo;
      return { ok: false, error: "no_text", status: 422 };
    }

    if (!ia && getActiveProvider() !== "none") {
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
    } else if (!ia) {
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

  // Respaldo determinístico: los modelos chicos transcriben bien "VÁLIDA HASTA:
  // 15/01/2027" y dejan el campo vacío igual. La fecha de vencimiento es lo que
  // dispara el aviso —o sea, lo que evita la multa—, así que se lee del texto.
  if (!sugerencias?.expiresAt) {
    const delTexto = fechaDeVencimientoEnTexto(text);
    if (delTexto) sugerencias = { ...(sugerencias ?? {}), expiresAt: delTexto };
  }

  // La descripción escrita a mano sobrevive al re-análisis: es la que corrige a
  // la IA cuando se equivoca, sería absurdo borrarla al volver a describir.
  //
  // Se relee la fila en vez de usar la que se cargó al empezar: el análisis
  // tarda, y quien sube un archivo suele describirlo (o etiquetarlo) en el acto.
  // Con el snapshot viejo, ese texto escrito EN EL MEDIO se pisaba al guardar —
  // el que lo escribió veía cómo desaparecía solo un rato después.
  const fresco = await DocumentsDB.getById(tenantId, docId);
  const meta = ((fresco ?? doc).ocrMetadata ?? {}) as Record<string, unknown>;
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
      analyzedVia: esImagenAnalizable(doc.mimeType) || escaneado ? "vision" : "texto",
      // Un PDF escaneado se leyó MIRÁNDOLO, y sólo su primera página: quien
      // lea la ficha tiene que saber que no es el documento entero.
      ...(escaneado ? { leidoComoEscaneo: true, paginasLeidas: 1 } : {}),
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
