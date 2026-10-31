import "server-only";

/**
 * lib/whatsapp/archivar-papel.ts
 *
 * Papeles que llegan por WhatsApp → Archivo del panel (Brandon 2026-10-22).
 *
 *   El comunero le manda su DNI por WhatsApp; el dueño lo reenvía al número
 *   del negocio y queda en:
 *
 *     Archivo › Llegó por WhatsApp › 2026-10-22 › DNI de Juan.jpg
 *
 *   y el bot le contesta dónde quedó, con el enlace a la carpeta.
 *
 * Sólo lo usa el bot del DUEÑO (`anotar.ts`): el webhook decide antes, por la
 * lista blanca del negocio dueño del número, que quien escribe puede guardar.
 * Un cliente que manda una foto sigue yendo al Concierge como siempre.
 *
 * ── Tres cosas que, mal hechas, no dan error ─────────────────────────────────
 *  1. **Meta re-entrega.** El mismo mensaje puede llegar dos veces; el id del
 *     documento sale del id del mensaje, así que la segunda vez choca (P2002)
 *     en vez de dejar dos copias del mismo DNI.
 *  2. **El tipo se mira en los BYTES**, no sólo en el mime que declara Meta: un
 *     HTML llamado `foto.jpg` no entra al Archivo.
 *  3. **La carpeta nace cerrada** (admin/dueño): un DNI no tiene por qué verlo
 *     el cajero. Si el dueño después la abre, se respeta.
 */

import { createHash } from "crypto";
import { DocumentsDB } from "@/lib/db/documents.db";
import { buildStoragePath, deleteFromStorage, isMimeAllowed, uploadToStorage } from "@/lib/documents/storage";
import { ROL_CANDADO_DUENO } from "@/lib/documents/doc-access";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import { resolverMime } from "@/lib/documents/tipos-archivo";
import { logger } from "@/lib/logger";
import { limaDateKey, STORE_TIMEZONE } from "@/lib/utils";
import { bajarMediaConTope, type CredencialesMeta } from "./bot-dueno";

export const CARPETA_WHATSAPP = "Llegó por WhatsApp";
/**
 * Quién ve lo que llega por WhatsApp: sólo dueño/admin. Lleva el candado de
 * dueño (ADR-502) porque `["admin","owner"]` solo NO deja afuera a `manager` ni
 * a `tienda_owner` (ven todo el drive). Va en la carpeta Y en cada documento:
 * si el análisis lo mueve a otra carpeta, el permiso viaja con el papel (un DNI
 * de un tercero no puede quedar a la vista del cajero).
 */
export const ROLES_PAPEL_WHATSAPP: readonly string[] = ["admin", "owner", ROL_CANDADO_DUENO];
/** Un borrador `pending` más viejo que esto es de un proceso que murió a mitad. */
const PENDIENTE_MUERTO_MS = 2 * 60_000;
/** Un DNI o una boleta pesan KB; 15 MB alcanza para un PDF escaneado largo. */
export const MAX_BYTES_PAPEL = 15 * 1024 * 1024;
/** Rol con el que se analiza: el mismo con el que corre el bot del dueño. */
const ROL_ANALISIS = "admin";

// ── Tipos que entran ─────────────────────────────────────────────────────────

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const empiezaCon = (b: Buffer, firma: number[], desde = 0) => firma.every((x, i) => b[desde + i] === x);
const ascii = (b: Buffer, desde: number, texto: string) => b.subarray(desde, desde + texto.length).toString("latin1") === texto;

const ES_JPEG = (b: Buffer) => empiezaCon(b, [0xff, 0xd8, 0xff]);
const ES_PNG = (b: Buffer) => empiezaCon(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ES_WEBP = (b: Buffer) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP");
/**
 * HEIC/HEIF: caja `ftyp` en el byte 4 y la MARCA en el 8. Sólo `ftyp` también
 * lo tienen un MP4 o un MOV, que no son fotos.
 */
const MARCAS_HEIF = new Set(["heic", "heix", "mif1", "msf1"]);
const ES_HEIF = (b: Buffer) => ascii(b, 4, "ftyp") && MARCAS_HEIF.has(b.subarray(8, 12).toString("latin1"));
const ES_PDF = (b: Buffer) => ascii(b, 0, "%PDF-");
/**
 * docx/xlsx son un zip con `[Content_Types].xml` y su carpeta (`word/` o `xl/`).
 * Los nombres de las entradas van sin comprimir en el directorio del zip, así
 * que se buscan en los bytes; cualquier otro zip no entra.
 */
const ES_ZIP = (b: Buffer) => empiezaCon(b, [0x50, 0x4b, 0x03, 0x04]);
const zipDeOffice = (carpeta: string) => (b: Buffer) =>
  ES_ZIP(b) && b.includes("[Content_Types].xml", 0, "latin1") && b.includes(carpeta, 0, "latin1");
const ES_DOCX = zipDeOffice("word/");
const ES_XLSX = zipDeOffice("xl/");
/** doc/xls viejos: contenedor OLE. */
const ES_OLE = (b: Buffer) => empiezaCon(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

interface TipoPermitido {
  /** La primera es la que se pone si el nombre no trae una válida. */
  extensiones: string[];
  firma: (bytes: Buffer) => boolean;
}

const TIPOS: Record<string, TipoPermitido> = {
  "image/jpeg": { extensiones: ["jpg", "jpeg"], firma: ES_JPEG },
  "image/png": { extensiones: ["png"], firma: ES_PNG },
  "image/webp": { extensiones: ["webp"], firma: ES_WEBP },
  "image/heic": { extensiones: ["heic"], firma: ES_HEIF },
  "image/heif": { extensiones: ["heif", "heic"], firma: ES_HEIF },
  "application/pdf": { extensiones: ["pdf"], firma: ES_PDF },
  [DOCX]: { extensiones: ["docx"], firma: ES_DOCX },
  [XLSX]: { extensiones: ["xlsx"], firma: ES_XLSX },
  "application/msword": { extensiones: ["doc"], firma: ES_OLE },
  "application/vnd.ms-excel": { extensiones: ["xls"], firma: ES_OLE },
};

/** `image/jpeg; charset=…` → `image/jpeg`; `image/jpg` (no estándar) → `image/jpeg`. */
export function normalizarMime(mime: string | null | undefined): string {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return m === "image/jpg" ? "image/jpeg" : m;
}

/**
 * El mime con el que se guarda: el que declaró Meta, o el de la extensión si
 * Meta mandó el genérico (`application/octet-stream`).
 */
export function mimeDelPapel(mimeDeclarado: string | null | undefined, filename?: string): string {
  return normalizarMime(resolverMime(filename ?? "", normalizarMime(mimeDeclarado)));
}

export function esMimeDePapel(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(TIPOS, normalizarMime(mime));
}

/** ¿Los bytes son de verdad lo que dice el mime? */
export function contenidoCoincide(mime: string, bytes: Buffer): boolean {
  const tipo = TIPOS[normalizarMime(mime)];
  return Boolean(tipo) && bytes.length >= 12 && tipo.firma(bytes);
}

// ── Nombre ───────────────────────────────────────────────────────────────────

/**
 * Lo que no puede ir en un nombre: separadores de ruta y lo que Windows prohíbe
 * (el drive se sincroniza con una carpeta de Windows), los de control, y los
 * invisibles de dirección/ancho cero — con U+202E un `gpj.exe` se lee
 * «exe.jpg».
 */
const PROHIBIDOS = /[\\/:*?"<>|\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

export function sanearNombre(crudo: string | null | undefined, tope = 100): string {
  return (crudo ?? "")
    .replace(PROHIBIDOS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, tope)
    .trim();
}

function separarExtension(nombre: string): { base: string; ext: string } {
  const i = nombre.lastIndexOf(".");
  if (i <= 0 || i === nombre.length - 1) return { base: nombre, ext: "" };
  return { base: nombre.slice(0, i), ext: nombre.slice(i + 1).toLowerCase() };
}

/** `14h05` en hora de Lima (sin `:`, que Windows no acepta en un nombre). */
export function horaLima(cuando: Date): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORE_TIMEZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(cuando);
  const dato = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return `${dato("hour")}h${dato("minute")}`;
}

export interface DatosDelNombre {
  /** Pie de foto, o el nombre pedido en «guárdalo como …». */
  pie?: string;
  /** Nombre del archivo como lo mandó WhatsApp (sólo documentos). */
  filename?: string;
  /** Nombre de perfil de quien lo mandó. */
  contacto?: string;
  tipo: "imagen" | "documento";
  mime: string;
  cuando: Date;
}

/**
 * Pie de foto > nombre del archivo > «Foto de <contacto> <hora>». La extensión
 * la decide el TIPO: si el nombre no trae una que le corresponda, se le pone.
 */
export function nombreDelPapel(d: DatosDelNombre): string {
  const tipo = TIPOS[normalizarMime(d.mime)];
  const extensiones = tipo?.extensiones ?? [];
  const conExtensionPropia = (nombre: string) => {
    const { base, ext } = separarExtension(nombre);
    return extensiones.includes(ext) ? { base: sanearNombre(base), ext } : { base: nombre, ext: "" };
  };

  let elegido = { base: "", ext: "" };
  for (const candidato of [d.pie, d.filename]) {
    const limpio = sanearNombre(candidato);
    if (!limpio) continue;
    elegido = conExtensionPropia(limpio);
    if (elegido.base) break;
  }
  if (!elegido.base) {
    const quien = sanearNombre(d.contacto, 40);
    const de = quien && quien.toLowerCase() !== "alguien" ? quien : "WhatsApp";
    elegido = { base: `${d.tipo === "imagen" ? "Foto" : "Documento"} de ${de} ${horaLima(d.cuando)}`, ext: "" };
  }
  const ext = elegido.ext || extensiones[0] || "";
  return ext ? `${elegido.base}.${ext}` : elegido.base;
}

/**
 * «guárdalo», «archívalo», «guárdalo como DNI de Juan», «súbelo al archivo».
 *
 * Devuelve `null` si el texto NO es una orden de guardar (es un dictado, una
 * pregunta…), y si lo es, el nombre pedido (`""` = no pidió ninguno). Una orden
 * de guardar no se le pasa al asistente de plata: no hay nada que anotar.
 */
const ORDEN_GUARDAR =
  /^\s*(?:(?:por\s*fa(?:vor)?|porfa)[\s,]+)?(?:gu[aá]rd(?:a|ar|alo|ala|alos|alas|amelo|amela|ame)|arch[ií]v(?:a|ar|alo|ala|alos|alas|amelo|amela|ame)|s[uú]b(?:elo|ela|ir)\s+al\s+archivo)(?=$|[\s,.:;!¡-])(?:\s+(?:en\s+(?:el\s+|mi\s+)?archivo|al\s+archivo))?(?:\s*(?:,|:|-|\.|!)\s*|\s+|$)(?:(?:como|con\s+el\s+nombre(?:\s+de)?)\s*:?\s*)?(.*)$/i;

export function ordenDeGuardar(texto: string | null | undefined): { nombre: string } | null {
  const m = (texto ?? "").trim().match(ORDEN_GUARDAR);
  if (!m) return null;
  return { nombre: (m[1] ?? "").replace(/^["«“']+|["»”'.!]+$/g, "").trim() };
}

// ── Id del documento (idempotencia) ──────────────────────────────────────────

/**
 * El id del documento sale del mensaje: Meta re-entrega el MISMO `message.id`,
 * y un segundo `create` con este id choca contra la clave primaria. Minúsculas
 * y dígitos, del largo de un cuid, por si algo los compara a ojo.
 */
export function idDelPapel(tenantId: string, waMessageId: string): string {
  return `wa${createHash("sha256").update(`${tenantId}:${waMessageId}`).digest("hex").slice(0, 23)}`;
}

const esChoqueDeId = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";

// ── Carpeta del día ──────────────────────────────────────────────────────────
/* Diez fotos reenviadas de golpe son diez webhooks casi a la vez, y
   `createFolderTree` no es atómico: sin juntar lo que está en vuelo, la carpeta
   del día nacía repetida. Mismo arreglo que `camaras/personas-drive.server.ts`. */

const TTL_CARPETA_MS = 5 * 60_000;
const enVuelo = new Map<string, Promise<string>>();
const recordadas = new Map<string, { id: string; hasta: number }>();

/**
 * `recordar: false` = devolver el id pero NO guardarlo: la próxima vez se
 * vuelve a calcular (se usa cuando no se pudo cerrar la carpeta, para que el
 * reintento la cierre en vez de quedar abierta durante todo el TTL).
 */
function conMemoria(clave: string, calcular: () => Promise<{ id: string; recordar: boolean }>): Promise<string> {
  const guardada = recordadas.get(clave);
  if (guardada && guardada.hasta > Date.now()) return Promise.resolve(guardada.id);
  const previa = enVuelo.get(clave);
  if (previa) return previa;
  const p = calcular()
    .then(({ id, recordar }) => {
      if (recordar) recordadas.set(clave, { id, hasta: Date.now() + TTL_CARPETA_MS });
      return id;
    })
    .finally(() => enVuelo.delete(clave));
  enVuelo.set(clave, p);
  return p;
}

function olvidarCarpetas(tenantId: string): void {
  for (const k of recordadas.keys()) if (k.startsWith(`${tenantId}|`)) recordadas.delete(k);
}

/** Sólo para tests: cada caso empieza sin carpetas recordadas. */
export function _olvidarTodasLasCarpetas(): void {
  recordadas.clear();
  enVuelo.clear();
}

/**
 * Deja la carpeta sólo para dueños SIEMPRE, no sólo al nacer: un cajero pudo
 * haber creado antes una «Llegó por WhatsApp» abierta (y `createFolderTree` la
 * reutiliza), o el cierre pudo fallar la primera vez. Si falla ahora, se avisa
 * y no se recuerda la carpeta: el papel igual entra, porque lleva el candado él
 * mismo (ver ROLES_PAPEL_WHATSAPP).
 */
async function cerrarCarpeta(tenantId: string, id: string): Promise<boolean> {
  try {
    const cerrada = await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...ROLES_PAPEL_WHATSAPP] });
    if (cerrada) return true;
    logger.error("[whatsapp/archivo] la carpeta no se pudo cerrar: no está", { tenantId, folderId: id });
  } catch (err) {
    logger.error("[whatsapp/archivo] la carpeta no se pudo cerrar", { tenantId, folderId: id, error: String(err) });
  }
  return false;
}

async function asegurarRaiz(tenantId: string): Promise<string> {
  return conMemoria(`${tenantId}|raiz`, async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [CARPETA_WHATSAPP] });
    const id = idPorRuta[CARPETA_WHATSAPP];
    if (!id) throw new Error("carpeta_whatsapp_no_creada");
    return { id, recordar: await cerrarCarpeta(tenantId, id) };
  });
}

async function asegurarDia(tenantId: string, dia: string): Promise<string> {
  const raiz = await asegurarRaiz(tenantId);
  return conMemoria(`${tenantId}|${raiz}|${dia}`, async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: raiz, rutas: [dia] });
    const id = idPorRuta[dia];
    if (!id) throw new Error("carpeta_del_dia_no_creada");
    // La del día también: si alguien la creó a mano antes, nacía abierta.
    return { id, recordar: await cerrarCarpeta(tenantId, id) };
  });
}

async function carpetaDelDia(tenantId: string, dia: string): Promise<string> {
  try {
    return await asegurarDia(tenantId, dia);
  } catch (err) {
    // La recordada ya no existe (la borraron): una vuelta más, desde cero.
    logger.warn("[whatsapp/archivo] carpeta recordada no sirve, se reintenta", { tenantId, error: String(err) });
    olvidarCarpetas(tenantId);
    return asegurarDia(tenantId, dia);
  }
}

// ── Guardar ──────────────────────────────────────────────────────────────────

export interface PapelEntrante {
  /** `message.id` de Meta: la llave de la idempotencia. */
  waMessageId: string;
  mediaId: string;
  tipo: "imagen" | "documento";
  mimeDeclarado?: string;
  filename?: string;
  /** Pie de foto, o el nombre pedido en «guárdalo como …». */
  pie?: string;
  contacto?: string;
  /** Quién lo mandó, en dígitos: queda como autor `whatsapp:<telefono>`. */
  telefono: string;
  cuando?: Date;
}

export type ResultadoPapel =
  | { ok: true; documentId: string; nombre: string; mime: string; carpetaId: string; carpetaNombre: string }
  | { ok: false; motivo: "duplicado" | "tipo" | "grande" | "descarga" | "storage" | "error" };

/** El autor del documento: la lista blanca guarda teléfonos, no usuarios del panel. */
export const autorDeWhatsApp = (telefono: string) => `whatsapp:${telefono.replace(/\D/g, "")}`;

export async function archivarPapel(
  tenantId: string,
  cred: CredencialesMeta,
  p: PapelEntrante,
): Promise<ResultadoPapel> {
  const cuando = p.cuando ?? new Date();
  const autor = autorDeWhatsApp(p.telefono);
  const id = idDelPapel(tenantId, p.waMessageId);

  // Antes de bajar nada: lo que ya se sabe que no entra, no se baja.
  if (p.mimeDeclarado && !esMimeDePapel(mimeDelPapel(p.mimeDeclarado, p.filename))) {
    return { ok: false, motivo: "tipo" };
  }

  try {
    // Re-entrega: ya está (aunque esté en la papelera). Ni se vuelve a bajar.
    const previo = await DocumentsDB.getByIdIncludingDeleted(tenantId, id);
    if (previo) {
      if (previo.storagePath !== "pending") return { ok: false, motivo: "duplicado" };
      // Borrador sin archivo. Reciente = otra entrega lo está subiendo ahora.
      // Viejo = el proceso murió a mitad: se descarta y se vuelve a intentar
      // (si no, ese mensaje quedaba «duplicado» para siempre y sin papel).
      const edad = Date.now() - new Date(previo.uploadedAt).getTime();
      if (!(edad > PENDIENTE_MUERTO_MS)) return { ok: false, motivo: "duplicado" };
      logger.warn("[whatsapp/archivo] borrador pendiente abandonado — se reintenta", { tenantId, documentId: id });
      await DocumentsDB.hardDelete(tenantId, id);
    }

    const bajada = await bajarMediaConTope(p.mediaId, cred.token, MAX_BYTES_PAPEL);
    if (!bajada.ok) return { ok: false, motivo: bajada.motivo === "grande" ? "grande" : "descarga" };

    const mime = mimeDelPapel(bajada.mime || p.mimeDeclarado, p.filename);
    if (!esMimeDePapel(mime) || !contenidoCoincide(mime, bajada.bytes)) {
      logger.warn("[whatsapp/archivo] tipo no permitido o contenido que no coincide", { tenantId, mime });
      return { ok: false, motivo: "tipo" };
    }

    const nombre = nombreDelPapel({ pie: p.pie, filename: p.filename, contacto: p.contacto, tipo: p.tipo, mime, cuando });
    if (!isMimeAllowed(mime, nombre)) return { ok: false, motivo: "tipo" };

    const dia = limaDateKey(cuando);
    const carpetaId = await carpetaDelDia(tenantId, dia);

    let borrador;
    try {
      borrador = await DocumentsDB.create(tenantId, {
        id,
        folderId: carpetaId,
        name: nombre,
        originalName: nombre,
        mimeType: mime,
        size: bajada.bytes.length,
        storagePath: "pending",
        tags: ["whatsapp"],
        // El candado va en el PAPEL, no sólo en la carpeta: si después se mueve
        // (a mano o por la sugerencia del análisis), sigue siendo sólo para dueños.
        allowedRoles: [...ROLES_PAPEL_WHATSAPP],
        uploadedById: autor,
      });
    } catch (err) {
      // Dos entregas del mismo mensaje en carrera: la otra ya lo está guardando.
      if (esChoqueDeId(err)) return { ok: false, motivo: "duplicado" };
      olvidarCarpetas(tenantId);
      throw err;
    }

    const storagePath = buildStoragePath({ tenantId, documentId: borrador.id, versionLabel: "v1", originalName: nombre });
    const subida = await uploadToStorage(storagePath, bajada.bytes, mime);
    if (!subida.ok) {
      // Se borra la fila: así el reintento de Meta puede volver a intentarlo.
      await DocumentsDB.hardDelete(tenantId, borrador.id);
      logger.error("[whatsapp/archivo] storage falló", { tenantId, error: subida.error });
      return { ok: false, motivo: "storage" };
    }

    try {
      await DocumentsDB.update(tenantId, borrador.id, {
        storagePath,
        // Sin `description` a propósito: el indexador nocturno la toma si el
        // análisis de ahora no llega a terminar.
        ocrMetadata: { origen: "whatsapp", waMessageId: p.waMessageId, recibidoEn: cuando.toISOString() },
      });
    } catch (err) {
      // Sin esto quedaba un borrador `pending` con el archivo subido y huérfano.
      await deleteFromStorage([storagePath]).catch((e) =>
        logger.error("[whatsapp/archivo] no se pudo borrar el archivo huérfano", { tenantId, error: String(e) }),
      );
      await DocumentsDB.hardDelete(tenantId, borrador.id).catch((e) =>
        logger.error("[whatsapp/archivo] no se pudo borrar el borrador", { tenantId, error: String(e) }),
      );
      throw err;
    }

    DocumentsDB.log(tenantId, {
      documentId: borrador.id,
      actorId: autor,
      action: "upload",
      metadata: { origen: "whatsapp", mime, size: bajada.bytes.length },
    }).catch((err) => logger.warn("[whatsapp/archivo] audit falló", { error: String(err) }));

    import("@/lib/documents/precalcular-miniatura")
      .then(({ precalcularMiniatura }) => precalcularMiniatura(storagePath, nombre, mime, bajada.bytes.length))
      .catch((err) => logger.warn("[whatsapp/archivo] miniatura falló", { error: String(err) }));

    return { ok: true, documentId: borrador.id, nombre, mime, carpetaId, carpetaNombre: dia };
  } catch (err) {
    logger.error("[whatsapp/archivo] no se pudo guardar", { tenantId, error: String(err) });
    return { ok: false, motivo: "error" };
  }
}

// ── Después de guardar: leerlo y ponerlo donde va ────────────────────────────

/**
 * Si el análisis sugirió una carpeta que EXISTE, se lo mueve ahí — sólo si
 * sigue en la carpeta del día (si el dueño ya lo movió a mano, manda él) y si
 * la sugerida no es otra de WhatsApp (moverlo de un día a otro no ordena nada).
 */
export async function moverASugerida(
  tenantId: string,
  documentId: string,
  carpetaOriginal: string,
  autor: string,
): Promise<{ folderId: string; folderName: string } | null> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  const sug = (doc?.ocrMetadata as { sugerencias?: { folderId?: unknown; folderName?: unknown } } | null)?.sugerencias;
  const destino = typeof sug?.folderId === "string" ? sug.folderId : null;
  const nombre = typeof sug?.folderName === "string" ? sug.folderName : "";
  if (!doc || !destino || destino === doc.folderId || doc.folderId !== carpetaOriginal) return null;
  if (nombre.trim().toLowerCase() === CARPETA_WHATSAPP.toLowerCase() || /^\d{4}-\d{2}-\d{2}$/.test(nombre.trim())) {
    return null;
  }
  const movido = await DocumentsDB.update(tenantId, documentId, { folderId: destino });
  if (!movido) return null;
  DocumentsDB.log(tenantId, {
    documentId,
    actorId: autor,
    action: "move",
    metadata: { origen: "whatsapp", desde: carpetaOriginal, hacia: destino, motivo: "sugerencia_del_analisis" },
  }).catch((err) => logger.warn("[whatsapp/archivo] audit del movimiento falló", { error: String(err) }));
  return { folderId: destino, folderName: nombre };
}

/**
 * En segundo plano y en la MISMA cola que la subida del panel (con un modelo
 * local, treinta análisis a la vez tumban la máquina). Si se mueve, `avisar`
 * manda la segunda línea por WhatsApp.
 */
export function analizarYOrdenar(
  tenantId: string,
  guardado: { documentId: string; mime: string; carpetaId: string },
  autor: string,
  avisar: (destino: { folderId: string; folderName: string }) => Promise<unknown>,
): void {
  if (!isAnalyzableMime(guardado.mime)) return;
  void (async () => {
    const [{ enColaDeAnalisis }, { analyzeDocumentContent }] = await Promise.all([
      import("@/lib/documents/cola-analisis"),
      import("@/lib/documents/analyze-document"),
    ]);
    const r = await enColaDeAnalisis(guardado.documentId, () =>
      analyzeDocumentContent(tenantId, guardado.documentId, autor, ROL_ANALISIS),
    );
    if (!r.ok) return;
    const movido = await moverASugerida(tenantId, guardado.documentId, guardado.carpetaId, autor);
    if (movido) await avisar(movido);
  })().catch((err) => logger.error("[whatsapp/archivo] análisis en segundo plano falló", { tenantId, error: String(err) }));
}

// ── Lo que se le contesta ────────────────────────────────────────────────────

export function enlaceACarpeta(folderId: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe").replace(/\/+$/, "");
  return `${base}/admin?tab=documentos&vista=drive&sub=folder&carpeta=${encodeURIComponent(folderId)}`;
}

export function mensajeGuardado(r: { nombre: string; carpetaId: string; carpetaNombre: string }): string {
  return (
    `📁 Guardado en tu Archivo › ${CARPETA_WHATSAPP} › ${r.carpetaNombre} como «${r.nombre}».\n` +
    `Ábrelo: ${enlaceACarpeta(r.carpetaId)}`
  );
}

export function mensajeMovido(destino: { folderId: string; folderName: string }): string {
  return `📂 Lo pasé a la carpeta «${destino.folderName}», que es donde va.\nÁbrelo: ${enlaceACarpeta(destino.folderId)}`;
}

export const MENSAJE_NO_GUARDADO: Record<Exclude<ResultadoPapel, { ok: true }>["motivo"], string | null> = {
  // La primera entrega ya contestó: no se repite.
  duplicado: null,
  tipo: "📎 Ese tipo de archivo no lo guardo. Mándame una foto, un PDF, un Word o un Excel.",
  grande: `📎 Ese archivo pesa más de ${MAX_BYTES_PAPEL / 1024 / 1024} MB. Súbelo desde el panel, en Archivo.`,
  descarga: "No pude bajar el archivo de WhatsApp. Prueba mandarlo de nuevo.",
  storage: "⚠️ No pude guardarlo en el Archivo. Prueba de nuevo en un rato.",
  error: "⚠️ No pude guardarlo en el Archivo. Prueba de nuevo en un rato.",
};
