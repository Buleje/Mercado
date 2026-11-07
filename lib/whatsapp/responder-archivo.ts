import "server-only";

/**
 * lib/whatsapp/responder-archivo.ts
 *
 * Contesta por WhatsApp una pregunta por papeles («¿qué está vencido?»,
 * «¿dónde está el DNI del jefe?», «mándame el contrato del local»). El ruteo y
 * el texto son puros (`preguntar-archivo.ts`); acá va lo que toca la base y la
 * red: buscar con el MISMO lector de frases y los MISMOS filtros que la
 * búsqueda del Archivo (`GET /api/admin/documents`), con el rol de quien
 * pregunta, en el negocio del número que recibió el mensaje, y mandar el
 * archivo cuando lo pidió.
 *
 * Nada de lo de acá corre si el teléfono no está en la lista blanca de ESE
 * negocio: lo decide el webhook antes (`enrutarComoDueno`).
 */

import { logger } from "@/lib/logger";
import { redactPhone } from "@/lib/logger-pii";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import { TAGS_FOTOS_DE_MAQUINA } from "@/lib/documents/fotos-de-maquina";
import { interpretarBusqueda, type BusquedaInterpretada } from "@/lib/documentos/busqueda-natural";
import type { DbDocument } from "@/lib/types/documents";
import { mandarArchivo, mandarTexto, type CredencialesMeta, type MotivoArchivoNoEnviado } from "./bot-dueno";
import { autorDeWhatsApp } from "./archivar-papel";
import {
  armarRespuesta,
  baseDelPanel,
  enlaceAPapel,
  hoyEnLima,
  ordenarParaResponder,
  papelParaMandar,
  pieDelArchivo,
  type PreguntaDePapeles,
} from "./preguntar-archivo";

/**
 * Lo más pesado que se baja del storage para mandarlo desde el webhook. Meta
 * acepta 100 MB en documentos, pero esto corre dentro del `after()` del
 * webhook: un PDF de 60 MB se baja, se sube y se vence el tiempo de la
 * función. Más grande que esto, va el enlace.
 */
const MAX_BYTES_PARA_MANDAR = 16 * 1024 * 1024;
/** Fotos: el tope de Meta para mandarla COMO foto. */
const MAX_BYTES_FOTO = 5 * 1024 * 1024;

export interface ResultadoDeBusqueda {
  interp: BusquedaInterpretada;
  docs: DbDocument[];
  carpetas: { id: string; name: string; parentId: string | null }[];
}

/**
 * Buscar como en el Archivo: la frase se lee con `interpretarBusqueda`
 * (vencimiento, subida, tipo, origen, carpeta, texto) y se arman los MISMOS
 * filtros que la ruta del panel. La vista general esconde las fotos de las
 * cámaras salvo que las haya pedido («fotos de las cámaras»).
 */
export async function buscarPapeles(tenantId: string, frase: string, rol: string): Promise<ResultadoDeBusqueda> {
  // Las carpetas se piden siempre: además de resolver «del jefe» hacen falta
  // sus nombres para la respuesta. Ya vienen filtradas por el rol.
  const carpetas = await DocumentsDB.carpetasParaBuscar(tenantId, rol);
  const interp = interpretarBusqueda(frase, { carpetas });
  if (interp.soloRelleno) return { interp, docs: [], carpetas };

  const pedidas = new Set(interp.grupos.flatMap((g) => g.etiquetas ?? []));
  const sinTags = TAGS_FOTOS_DE_MAQUINA.filter((t) => !pedidas.has(t));
  const texto = interp.texto.trim();

  const docs = await DocumentsDB.list(
    tenantId,
    {
      q: texto || undefined,
      vence: interp.vence,
      subido: interp.subido,
      folderIds: interp.carpetas,
      grupos: interp.grupos.length ? interp.grupos : undefined,
      favorite: interp.favoritos ? true : undefined,
      sinTags: sinTags.length ? sinTags : undefined,
    },
    rol,
  );
  return { interp, docs, carpetas };
}

/** Lo que se le dice al dueño cuando el archivo no salió, con el enlace de respaldo. */
const MOTIVO_NO_SALIO: Record<MotivoArchivoNoEnviado | "grande" | "lectura", string> = {
  conexion: "la conexión del número con WhatsApp venció (reconéctala en Configuración › WhatsApp)",
  tipo: "WhatsApp no acepta ese tipo de archivo",
  rechazo: "WhatsApp no lo recibió",
  red: "no pude conectarme con WhatsApp",
  grande: "pesa demasiado para mandarlo por acá",
  lectura: "no pude leerlo del Archivo",
};

export interface PreguntaEntrante {
  tenantId: string;
  telefono: string;
  /** El rol de quien vinculó este teléfono (lista blanca). */
  rol: string;
  pregunta: PreguntaDePapeles;
  cred: CredencialesMeta;
}

/**
 * Busca y contesta. Devuelve qué hizo (para los tests y el log). No lanza: un
 * fallo de la base contesta «no pude buscar» en vez de dejar al dueño sin nada.
 */
export async function responderPreguntaDePapeles(
  p: PreguntaEntrante,
): Promise<"lista" | "nada" | "archivo" | "error"> {
  const { tenantId, telefono, rol, pregunta, cred } = p;
  const base = baseDelPanel();
  const hoy = hoyEnLima();

  let r: ResultadoDeBusqueda;
  try {
    r = await buscarPapeles(tenantId, pregunta.frase, rol);
  } catch (err) {
    logger.error("[whatsapp/archivo] la búsqueda de papeles falló", { tenantId, error: String(err) });
    await mandarTexto(cred, telefono, "⚠️ No pude buscar en tu Archivo ahora. Prueba de nuevo en un rato.");
    return "error";
  }

  const docs = ordenarParaResponder(r.docs, r.interp, hoy) as DbDocument[];
  // Sin datos personales: qué se entendió (tipos de filtro) y cuántos, no la frase ni los nombres.
  logger.info("[whatsapp/archivo] pregunta por papeles", {
    tenantId,
    filtros: r.interp.entendi.map((c) => c.tipo),
    resultados: docs.length,
    mandar: pregunta.mandar,
  });

  // «mándame…» con UN papel claro: va el archivo, no la lista.
  const elegido = pregunta.mandar ? (papelParaMandar(docs, r.interp) as DbDocument | null) : null;
  if (elegido) {
    const salio = await mandarElPapel(tenantId, telefono, cred, elegido, r.carpetas, hoy);
    if (salio === true) return "archivo";
    await mandarTexto(
      cred,
      telefono,
      `📎 Encontré *${elegido.name}*, pero no te lo pude mandar: ${MOTIVO_NO_SALIO[salio]}.\n` +
        `Ábrelo acá: ${enlaceAPapel(base, elegido.id)}`,
    );
    return "lista";
  }

  // Con 0 resultados buscando lo que vence, la pista útil es lo que YA venció.
  let vencidosAparte: number | undefined;
  if (docs.length === 0 && r.interp.vence && r.interp.vence !== "sin" && !r.interp.texto.trim() && r.interp.grupos.length === 0) {
    const hasta = r.interp.vence.hasta?.slice(0, 10);
    if (!hasta || hasta > hoy) {
      vencidosAparte = await contarVencidos(tenantId, rol, hoy).catch((err) => {
        logger.warn("[whatsapp/archivo] no se pudieron contar los vencidos", { tenantId, error: String(err) });
        return undefined;
      });
    }
  }

  await mandarTexto(
    cred,
    telefono,
    armarRespuesta({ pregunta, interp: r.interp, docs, carpetas: r.carpetas, base, hoy, vencidosAparte }),
  );
  return docs.length === 0 ? "nada" : "lista";
}

async function contarVencidos(tenantId: string, rol: string, hoy: string): Promise<number> {
  const vencidos = await DocumentsDB.list(
    tenantId,
    { vence: { hasta: `${hoy}T00:00:00.000Z` }, sinTags: [...TAGS_FOTOS_DE_MAQUINA] },
    rol,
  );
  return vencidos.length;
}

/** Baja el papel del storage y lo manda. `true` o el motivo por el que no salió. */
async function mandarElPapel(
  tenantId: string,
  telefono: string,
  cred: CredencialesMeta,
  doc: DbDocument,
  carpetas: ResultadoDeBusqueda["carpetas"],
  hoy: string,
): Promise<true | MotivoArchivoNoEnviado | "grande" | "lectura"> {
  const mime = resolverMime(doc.name, doc.mimeType);
  const esFoto = /^image\/(jpeg|png|webp)$/.test(mime);
  const tope = esFoto ? MAX_BYTES_FOTO : MAX_BYTES_PARA_MANDAR;
  // Primero lo que dice la fila (para no bajar 60 MB en vano)…
  if (doc.size > tope) return "grande";

  const bytes = await downloadFromStorage(doc.storagePath).catch((err) => {
    logger.warn("[whatsapp/archivo] no se pudo leer el papel del storage", { tenantId, error: String(err) });
    return null;
  });
  if (!bytes) return "lectura";
  // …y después lo que pesa DE VERDAD: `size` lo escribe quien subió el archivo
  // y una versión nueva puede no haberlo actualizado.
  if (bytes.byteLength > tope) return "grande";

  const r = await mandarArchivo(cred, telefono, { bytes, mime, nombre: doc.name, pie: pieDelArchivo(doc, carpetas, hoy) });
  if (!r.ok) return r.motivo;

  // Igual que el envío desde el drive: queda en la bitácora del papel quién lo pidió.
  DocumentsDB.log(tenantId, {
    documentId: doc.id,
    actorId: autorDeWhatsApp(telefono),
    action: "whatsapp_send",
    metadata: { telefono: redactPhone(telefono), tipo: esFoto ? "image" : "document", canal: "bot-dueno" },
  }).catch((err) => logger.error("[whatsapp/archivo] la bitácora del envío falló", { tenantId, error: String(err) }));
  return true;
}
