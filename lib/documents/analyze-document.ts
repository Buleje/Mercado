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
import {
  esComprobanteDePago,
  leerVencimiento,
  VERSION_LECTOR_VENCIMIENTO,
  type VencimientoLeido,
} from "@/lib/documentos/fecha-vencimiento";
import { motivoDeFalloIA } from "./aviso-ia";
import { construirTextoBuscable } from "./texto-buscable";
import { renderizarPaginaPdf } from "./pdf-a-imagen";
/* La extracción vive aparte desde ADR-372: la comparte la clasificación de
   papeles del despacho, y el mismo PDF tiene que leerse igual desde los dos. */
import { extractDocText } from "./extraer-texto";
import { describirImagenConVision } from "./vision-describe";
import { ocrEnServidor, ocrServidorSoporta } from "./ocr-servidor";

/**
 * Analiza el contenido de un documento y responde la pregunta "¿qué es esto?".
 *
 * Dos caminos, un solo resultado:
 *  · TEXTO (PDF vía unpdf, Word, Excel, .txt): se extrae el texto y se lo manda
 *    al modelo.
 *  · VISIÓN (fotos y escaneos): el modelo MIRA la imagen y transcribe lo que se
 *    lee. Antes esto sólo pasaba si la foto entraba por el escáner de cámara;
 *    ahora cualquier imagen del drive se puede describir.
 *  · OCR LOCAL (fotos y escaneos sin modelo de visión, o si se cayó): el
 *    servidor lee las letras con tesseract (`ocr-servidor`) y ese texto sigue
 *    el camino de TEXTO. Lee peor que la visión, pero sin él un DNI escaneado
 *    quedaba mudo y su vencimiento sin aviso.
 *
 * El vencimiento escrito en el papel («Fecha de Caducidad», la zona mecánica
 * del DNI) se anota solo si el documento no tenía uno (ver `anotarVencimiento`).
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
      /** ISO: el vencimiento leído del papel que quedó anotado en el documento. */
      vencimientoAnotado?: string;
      /** ISO: la fecha que quedó SÓLO como sugerencia (el papel no tenía una y no se anotó). */
      vencimientoSugerido?: string;
    }
  | { ok: false; error: string; status: number };

export { isAnalyzableMime };

/**
 * Cómo leer cuando nadie está mirando la pantalla (la lectura de la noche).
 * Sin opciones, todo sigue como siempre: mira con la IA, describe y anota.
 */
export interface OpcionesAnalisis {
  /**
   * La fecha leída queda SÓLO como sugerencia (`ocrMetadata.sugerencias`):
   * el dueño la confirma con un toque. Anotada sola, avisaba por WhatsApp de
   * una fecha que nadie miró.
   */
  soloSugerirVencimiento?: boolean;
  /** false = no pedirle a un modelo que mire la foto o el escaneo: directo al OCR del servidor, sin gasto. */
  conVision?: boolean;
  /** false = no describir con la IA de texto (sin gasto): queda el texto leído y la fecha. */
  conIA?: boolean;
}

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

/**
 * El texto de un escaneo o una foto leído por el OCR del servidor, o null. Va
 * DESPUÉS de la visión: sólo cuando no hay modelo que mire o se cayó.
 */
async function leerConOcrLocal(
  docId: string,
  datos: Buffer | null,
  mimeType: string,
): Promise<{ texto: string; paginas: number; confianza: number } | null> {
  if (!datos || !ocrServidorSoporta(mimeType)) return null;
  const r = await ocrEnServidor(datos, mimeType);
  if (!r.ok) {
    logger.info("documents.analyze.ocr_local_sin_texto", { docId, motivo: r.motivo });
    return null;
  }
  const texto = normalizar(r.texto);
  return texto ? { texto, paginas: r.paginas, confianza: r.confianza } : null;
}

/**
 * Anota el vencimiento leído del papel si el documento no tenía uno: la fecha
 * que puso una persona no se pisa (queda como sugerencia en la ficha). Lleva su
 * propio registro en la actividad, para saber que la fecha la puso la lectura
 * y de qué renglón salió. Devuelve si se anotó.
 */
async function anotarVencimiento(
  tenantId: string,
  docId: string,
  actorId: string,
  lectura: VencimientoLeido,
): Promise<boolean> {
  const anotado = await DocumentsDB.anotarVencimientoSiFalta(tenantId, docId, new Date(lectura.fecha)).catch((err) => {
    logger.error("[documents.analyze] anotar el vencimiento falló", { error: String(err), docId });
    return false;
  });
  if (anotado) {
    DocumentsDB.log(tenantId, {
      documentId: docId,
      actorId,
      action: "ai_expiry",
      metadata: { expiresAt: lectura.fecha, regla: lectura.regla, fragmento: lectura.fragmento },
    }).catch((err) => logger.error("[documents.analyze] audit ai_expiry falló", { error: String(err), docId }));
  }
  return anotado;
}

/** La última lectura fue de un modelo mirando la imagen (mejor que el OCR). */
const yaLeidoMirando = (doc: { ocrText: string | null; ocrMetadata: Record<string, unknown> | null }) =>
  !!doc.ocrText?.trim() && (doc.ocrMetadata as { analyzedVia?: string } | null)?.analyzedVia === "vision";

export async function analyzeDocumentContent(
  tenantId: string,
  docId: string,
  actorId: string,
  viewerRole?: string,
  opciones: OpcionesAnalisis = {},
): Promise<AnalyzeResult> {
  const { soloSugerirVencimiento = false, conVision = true, conIA = true } = opciones;
  const doc = await DocumentsDB.getById(tenantId, docId, viewerRole);
  if (!doc) return { ok: false, error: "not_found", status: 404 };

  // Carpetas del drive: la IA elige entre ELLAS (o ninguna) — nunca inventa.
  // Con el rol: sugerir una carpeta que quien sube no ve sería revelar su nombre.
  const carpetas = await DocumentsDB.listFolders(tenantId, viewerRole).catch(() => []);
  const nombresCarpetas = carpetas.map((c) => c.name);

  let text = "";
  let ia: ResultadoDescripcion | null = null;
  let aviso: string | undefined;
  /** El PDF no tenía texto y hubo que mirarlo (o leerlo con OCR): se dice en la ficha. */
  let escaneado = false;
  /** Cómo se leyó: el texto del archivo, un modelo que miró la imagen o el OCR del servidor. */
  let via: "texto" | "vision" | "ocr" = "texto";
  let ocrLocal: { paginas: number; confianza: number } | null = null;

  if (esImagenAnalizable(doc.mimeType)) {
    // La visión necesita una URL pública: el modelo baja la imagen desde afuera.
    const url = await getSignedUrl(doc.storagePath);
    if (!url) return { ok: false, error: "storage_unavailable", status: 502 };
    // Se baja una sola vez aunque la pidan la visión y después el OCR.
    let bajada: Promise<Buffer | null> | null = null;
    const descargar = () => (bajada ??= downloadFromStorage(doc.storagePath));
    const visto = conVision
      ? await describirImagenConVision(
          // Las dos formas de entregar la imagen: la URL para un modelo en la nube
          // y los bytes para uno propio (Ollama local no puede bajar nada de acá).
          { url, mimeType: doc.mimeType, descargar },
          nombresCarpetas,
        )
      : null;
    if (visto?.ok) {
      ia = visto.datos;
      text = normalizar(ia.ocrText ?? "");
      via = "vision";
    } else {
      const avisoPrevio = "No pude releerla ahora: queda lo que ya se había leído.";
      // Lo que ya leyó un modelo mirando vale más que el OCR: no se empeora.
      const previo = yaLeidoMirando(doc) ? loQueYaSabiamos(doc, avisoPrevio) : null;
      if (previo) return previo;
      // Sin modelo que mire (o se cayó): el OCR del servidor lee la foto.
      const local = await leerConOcrLocal(docId, await descargar(), doc.mimeType);
      if (local) {
        text = local.texto;
        ocrLocal = local;
        via = "ocr";
      } else {
        const anterior = loQueYaSabiamos(doc, avisoPrevio);
        if (anterior) return anterior;
        // Falta configuración vs. se cayó el servicio: son dos problemas
        // distintos y quien mira la pantalla tiene que poder distinguirlos.
        if (!visto) return { ok: false, error: "no_text", status: 422 };
        return visto.motivo === "falla"
          ? { ok: false, error: "vision_fail", status: 502 }
          : { ok: false, error: "vision_unavailable", status: 503 };
      }
    }
  } else {
    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return { ok: false, error: "storage_unavailable", status: 502 };
    text = normalizar(await extractDocText(new Uint8Array(buf), doc.mimeType).catch(() => ""));

    // PDF ESCANEADO: por dentro es una foto, así que extraer texto no devuelve
    // nada. Es como llega media contabilidad peruana. En vez de rendirse, se
    // dibuja la página y se la MIRA, igual que a una foto de celular.
    if (!text && doc.mimeType === "application/pdf") {
      const imagen = conVision ? await renderizarPaginaPdf(buf, 1) : null;
      if (imagen) {
        const visto = await describirImagenConVision(
          { url: "", mimeType: "image/png", descargar: async () => imagen },
          nombresCarpetas,
        );
        if (visto.ok) {
          ia = visto.datos;
          text = normalizar(ia.ocrText ?? "");
          escaneado = true;
          via = "vision";
        } else if (visto.motivo !== "sin_proveedor") {
          logger.warn("documents.analyze.pdf_escaneado_sin_leer", { docId, motivo: visto.motivo });
        }
      }
      // Nadie lo pudo mirar: el OCR del servidor lee hasta 3 páginas. Si un
      // modelo ya lo había leído mirando, eso queda (abajo, `loQueYaSabiamos`).
      if (!text && !yaLeidoMirando(doc)) {
        const local = await leerConOcrLocal(docId, buf, doc.mimeType);
        if (local) {
          text = local.texto;
          ocrLocal = local;
          escaneado = true;
          via = "ocr";
        }
      }
    }

    if (!text) {
      const previo = loQueYaSabiamos(doc, "No pude releerlo ahora: queda lo que ya se había leído.");
      if (previo) return previo;
      return { ok: false, error: "no_text", status: 422 };
    }
  }

  // TEXTO (del archivo o del OCR del servidor): lo describe la IA de texto.
  if (!ia && conIA) {
    if (getActiveProvider() !== "none") {
      try {
        const prompt = promptDeDescripcion({ modo: "texto", carpetas: nombresCarpetas, texto: text.slice(0, 10000) });
        const { text: out } = await generateText({ model: smartModel, prompt, temperature: 0.2 });
        const parsed = ResultSchema.safeParse(JSON.parse(cleanJSONResponse(out)));
        if (parsed.success) ia = parsed.data;
        else aviso = "La IA contestó algo que no pude entender. Prueba de nuevo.";
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

  // El vencimiento ESCRITO manda sobre el que la IA creyó entender: las reglas
  // exigen «vence / caducidad / válido hasta» pegado a la fecha (o el dígito de
  // control del DNI), y los modelos chicos transcriben bien "VÁLIDA HASTA:
  // 15/01/2027" y dejan el campo vacío igual. Es lo que dispara el aviso —o
  // sea, lo que evita la multa—.
  const lectura = leerVencimiento(text);
  if (lectura) sugerencias = { ...sugerencias, expiresAt: lectura.fecha };
  // En una factura, boleta o recibo la «Fecha de vencimiento» es la de PAGAR:
  // se queda como sugerencia, no se anota sola (anotada avisa por WhatsApp de
  // un vencimiento que no es tal). Sólo se anotan DNI, licencias, permisos,
  // títulos, contratos, certificados, SOAT, revisión técnica…
  const comprobante = lectura ? esComprobanteDePago(text, ia?.structured?.docType) : false;

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

  const vencimientoAnotado =
    lectura && !comprobante && !soloSugerirVencimiento ? await anotarVencimiento(tenantId, docId, actorId, lectura) : false;
  const vencimientoSugerido =
    !vencimientoAnotado && !(fresco ?? doc).expiresAt && sugerencias?.expiresAt ? sugerencias.expiresAt : undefined;

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
      // ficha conviene decirlo (la visión y el OCR se equivocan distinto).
      analyzedVia: via,
      // Un PDF escaneado se leyó MIRÁNDOLO (sólo su primera página) o con el
      // OCR (hasta 3): quien lea la ficha tiene que saber que no es entero.
      ...(escaneado ? { leidoComoEscaneo: true, paginasLeidas: ocrLocal?.paginas ?? 1 } : {}),
      ...(ocrLocal ? { ocrConfianza: ocrLocal.confianza } : {}),
      // La fecha leída y de qué renglón salió; `anotado` = quedó como vencimiento
      // del documento (no tenía uno). Si no, es sólo la sugerencia; `motivo`
      // dice por qué cuando es un comprobante (si ya tenía otra fecha, la ficha
      // lo ve comparando con `expiresAt`).
      vencimientoLeido: lectura
        ? { ...lectura, anotado: vencimientoAnotado, ...(comprobante ? { motivo: "comprobante" } : {}) }
        : null,
      // Con qué versión del lector se buscó la fecha: la lectura de la noche
      // repasa el texto guardado cuando el lector aprende algo nuevo.
      lectorVencimiento: VERSION_LECTOR_VENCIMIENTO,
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
    ...(vencimientoAnotado && lectura ? { vencimientoAnotado: lectura.fecha } : {}),
    ...(vencimientoSugerido ? { vencimientoSugerido } : {}),
  };
}
