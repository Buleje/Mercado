import "server-only";

/**
 * lib/documentos/papel-entrante.ts
 *
 * Papeles que llegan por un CANAL de mensajes → Archivo del panel.
 *
 *   WhatsApp (22-10): el dueño reenvía el DNI al número del negocio.
 *   Telegram (31-10): Brandon le manda la foto a su bot de la PC.
 *
 *     Archivo › Llegó por WhatsApp › 2026-10-22 › DNI de Juan.jpg
 *     Archivo › Llegó por Telegram › 2026-10-31 › Guía 0123.pdf
 *
 * Este módulo es el núcleo «guardar bytes que ya tengo, sin duplicar»; cada
 * canal pone cómo se consiguen los bytes (WhatsApp los baja de Meta en
 * `lib/whatsapp/archivar-papel.ts`, Telegram los recibe ya subidos en
 * `/api/admin/documents/llego-por-telegram`).
 *
 * ── Tres cosas que, mal hechas, no dan error ─────────────────────────────────
 *  1. **El canal re-entrega.** El mismo mensaje puede llegar dos veces; el id
 *     del documento sale del id del mensaje, así que la segunda vez choca
 *     (P2002) en vez de dejar dos copias del mismo DNI.
 *  2. **El tipo se mira en los BYTES**, no sólo en el mime declarado: un HTML
 *     llamado `foto.jpg` no entra al Archivo.
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

export type CanalPapel = "whatsapp" | "telegram";

/** Carpeta raíz de cada canal. Están también en `RAICES_DEL_SISTEMA` (ordenar-archivo.ts). */
export const CARPETA_DEL_CANAL: Readonly<Record<CanalPapel, string>> = {
  whatsapp: "Llegó por WhatsApp",
  telegram: "Llegó por Telegram",
};
const NOMBRE_DEL_CANAL: Readonly<Record<CanalPapel, string>> = { whatsapp: "WhatsApp", telegram: "Telegram" };
/** Dónde queda el id del mensaje en `ocrMetadata` (WhatsApp ya escribió `waMessageId` desde el 22-10). */
const CLAVE_ID_MENSAJE: Readonly<Record<CanalPapel, string>> = {
  whatsapp: "waMessageId",
  telegram: "telegramMessageId",
};

/**
 * Quién ve lo que llega por un canal: sólo dueño/admin. Lleva el candado de
 * dueño (ADR-502) porque `["admin","owner"]` solo NO deja afuera a `manager` ni
 * a `tienda_owner` (ven todo el drive). Va en la carpeta Y en cada documento:
 * si el análisis lo mueve a otra carpeta, el permiso viaja con el papel (un DNI
 * de un tercero no puede quedar a la vista del cajero).
 */
export const ROLES_PAPEL_ENTRANTE: readonly string[] = ["admin", "owner", ROL_CANDADO_DUENO];
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
 * El mime con el que se guarda: el que declaró el canal, o el de la extensión si
 * el canal mandó el genérico (`application/octet-stream`).
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
  /** Nombre del archivo como lo mandó el canal (sólo documentos). */
  filename?: string;
  /** Nombre de perfil de quien lo mandó. */
  contacto?: string;
  tipo: "imagen" | "documento";
  mime: string;
  /** Por dónde llegó: sólo cambia el «Foto de WhatsApp» cuando no hay contacto. Sin canal = WhatsApp. */
  canal?: CanalPapel;
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
    const de = quien && quien.toLowerCase() !== "alguien" ? quien : NOMBRE_DEL_CANAL[d.canal ?? "whatsapp"];
    elegido = { base: `${d.tipo === "imagen" ? "Foto" : "Documento"} de ${de} ${horaLima(d.cuando)}`, ext: "" };
  }
  const ext = elegido.ext || extensiones[0] || "";
  return ext ? `${elegido.base}.${ext}` : elegido.base;
}

// ── Id del documento (idempotencia) ──────────────────────────────────────────

/**
 * El id del documento sale del mensaje: el canal re-entrega el MISMO id, y un
 * segundo `create` con este id choca contra la clave primaria. Minúsculas y
 * dígitos, del largo de un cuid, por si algo los compara a ojo.
 *
 * WhatsApp conserva la fórmula del 22-10 (`wa` + hash de negocio:mensaje):
 * cambiarla haría que una re-entrega de un papel ya guardado entre de nuevo.
 */
export function idDelPapel(tenantId: string, waMessageId: string): string {
  return `wa${createHash("sha256").update(`${tenantId}:${waMessageId}`).digest("hex").slice(0, 23)}`;
}

/** Telegram: `tg` + hash de negocio:telegram:`<chat>:<message_id>` (un message_id sólo es único dentro de su chat). */
export function idDelPapelDeCanal(tenantId: string, canal: CanalPapel, idMensaje: string): string {
  if (canal === "whatsapp") return idDelPapel(tenantId, idMensaje);
  return `tg${createHash("sha256").update(`${tenantId}:telegram:${idMensaje}`).digest("hex").slice(0, 23)}`;
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
 * haber creado antes una «Llegó por …» abierta (y `createFolderTree` la
 * reutiliza), o el cierre pudo fallar la primera vez. Si falla ahora, se avisa
 * y no se recuerda la carpeta: el papel igual entra, porque lleva el candado él
 * mismo (ver ROLES_PAPEL_ENTRANTE).
 */
async function cerrarCarpeta(tenantId: string, canal: CanalPapel, id: string): Promise<boolean> {
  try {
    const cerrada = await DocumentsDB.updateFolder(tenantId, id, { allowedRoles: [...ROLES_PAPEL_ENTRANTE] });
    if (cerrada) return true;
    logger.error(`[${canal}/archivo] la carpeta no se pudo cerrar: no está`, { tenantId, folderId: id });
  } catch (err) {
    logger.error(`[${canal}/archivo] la carpeta no se pudo cerrar`, { tenantId, folderId: id, error: String(err) });
  }
  return false;
}

async function asegurarRaiz(tenantId: string, canal: CanalPapel): Promise<string> {
  const raiz = CARPETA_DEL_CANAL[canal];
  return conMemoria(`${tenantId}|${canal}|raiz`, async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: null, rutas: [raiz] });
    const id = idPorRuta[raiz];
    if (!id) throw new Error(`carpeta_${canal}_no_creada`);
    return { id, recordar: await cerrarCarpeta(tenantId, canal, id) };
  });
}

async function asegurarDia(tenantId: string, canal: CanalPapel, dia: string): Promise<string> {
  const raiz = await asegurarRaiz(tenantId, canal);
  return conMemoria(`${tenantId}|${raiz}|${dia}`, async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree(tenantId, { parentId: raiz, rutas: [dia] });
    const id = idPorRuta[dia];
    if (!id) throw new Error("carpeta_del_dia_no_creada");
    // La del día también: si alguien la creó a mano antes, nacía abierta.
    return { id, recordar: await cerrarCarpeta(tenantId, canal, id) };
  });
}

async function carpetaDelDia(tenantId: string, canal: CanalPapel, dia: string): Promise<string> {
  try {
    return await asegurarDia(tenantId, canal, dia);
  } catch (err) {
    // La recordada ya no existe (la borraron): una vuelta más, desde cero.
    logger.warn(`[${canal}/archivo] carpeta recordada no sirve, se reintenta`, { tenantId, error: String(err) });
    olvidarCarpetas(tenantId);
    return asegurarDia(tenantId, canal, dia);
  }
}

// ── Guardar ──────────────────────────────────────────────────────────────────

export interface PapelAGuardar {
  /**
   * Id del mensaje en su canal: `message.id` de Meta, `<chat>:<message_id>` de
   * Telegram. Es la llave de la idempotencia.
   */
  idMensaje: string;
  tipo: "imagen" | "documento";
  mimeDeclarado?: string;
  filename?: string;
  /** Pie de foto, o el nombre pedido en «guárdalo como …». */
  pie?: string;
  contacto?: string;
  /** Autor del documento y del audit: `whatsapp:<teléfono>`, `telegram:<chat>`. */
  autor: string;
  /** Usuario del panel por el que entró (Telegram sube con la sesión del MCP): sólo va al audit. */
  pedidoPor?: string;
  cuando?: Date;
}

/**
 * De dónde salen los bytes: se pide DESPUÉS de saber que no es re-entrega
 * (WhatsApp no re-baja). Cualquier fallo que no sea «grande» es «descarga».
 */
export type BytesDelPapel =
  | { ok: true; bytes: Buffer; mime?: string }
  | { ok: false; motivo: "grande" | "descarga" | "fallo" };

export type ResultadoPapel =
  | { ok: true; documentId: string; nombre: string; mime: string; carpetaId: string; carpetaNombre: string }
  | { ok: false; motivo: "duplicado" | "tipo" | "grande" | "descarga" | "storage" | "error" };

export const autorDeTelegram = (chatId: string) => `telegram:${chatId.replace(/[^\d-]/g, "")}`;

export async function guardarPapelEntrante(
  tenantId: string,
  canal: CanalPapel,
  p: PapelAGuardar,
  traerBytes: () => Promise<BytesDelPapel>,
): Promise<ResultadoPapel> {
  const cuando = p.cuando ?? new Date();
  const autor = p.autor;
  const id = idDelPapelDeCanal(tenantId, canal, p.idMensaje);
  const ctx = `[${canal}/archivo]`;

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
      logger.warn(`${ctx} borrador pendiente abandonado — se reintenta`, { tenantId, documentId: id });
      await DocumentsDB.hardDelete(tenantId, id);
    }

    const bajada = await traerBytes();
    if (!bajada.ok) return { ok: false, motivo: bajada.motivo === "grande" ? "grande" : "descarga" };
    if (bajada.bytes.length > MAX_BYTES_PAPEL) return { ok: false, motivo: "grande" };

    const mime = mimeDelPapel(bajada.mime || p.mimeDeclarado, p.filename);
    if (!esMimeDePapel(mime) || !contenidoCoincide(mime, bajada.bytes)) {
      logger.warn(`${ctx} tipo no permitido o contenido que no coincide`, { tenantId, mime });
      return { ok: false, motivo: "tipo" };
    }

    const nombre = nombreDelPapel({ pie: p.pie, filename: p.filename, contacto: p.contacto, tipo: p.tipo, mime, cuando, canal });
    if (!isMimeAllowed(mime, nombre)) return { ok: false, motivo: "tipo" };

    const dia = limaDateKey(cuando);
    const carpetaId = await carpetaDelDia(tenantId, canal, dia);

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
        tags: [canal],
        // El candado va en el PAPEL, no sólo en la carpeta: si después se mueve
        // (a mano o por la sugerencia del análisis), sigue siendo sólo para dueños.
        allowedRoles: [...ROLES_PAPEL_ENTRANTE],
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
      // Se borra la fila: así el reintento del canal puede volver a intentarlo.
      await DocumentsDB.hardDelete(tenantId, borrador.id);
      logger.error(`${ctx} storage falló`, { tenantId, error: subida.error });
      return { ok: false, motivo: "storage" };
    }

    try {
      await DocumentsDB.update(tenantId, borrador.id, {
        storagePath,
        // Sin `description` a propósito: el indexador nocturno la toma si el
        // análisis de ahora no llega a terminar.
        ocrMetadata: { origen: canal, [CLAVE_ID_MENSAJE[canal]]: p.idMensaje, recibidoEn: cuando.toISOString() },
      });
    } catch (err) {
      // Sin esto quedaba un borrador `pending` con el archivo subido y huérfano.
      await deleteFromStorage([storagePath]).catch((e) =>
        logger.error(`${ctx} no se pudo borrar el archivo huérfano`, { tenantId, error: String(e) }),
      );
      await DocumentsDB.hardDelete(tenantId, borrador.id).catch((e) =>
        logger.error(`${ctx} no se pudo borrar el borrador`, { tenantId, error: String(e) }),
      );
      throw err;
    }

    DocumentsDB.log(tenantId, {
      documentId: borrador.id,
      actorId: autor,
      action: "upload",
      metadata: { origen: canal, mime, size: bajada.bytes.length, ...(p.pedidoPor ? { pedidoPor: p.pedidoPor } : {}) },
    }).catch((err) => logger.warn(`${ctx} audit falló`, { error: String(err) }));

    import("@/lib/documents/precalcular-miniatura")
      .then(({ precalcularMiniatura }) => precalcularMiniatura(storagePath, nombre, mime, bajada.bytes.length))
      .catch((err) => logger.warn(`${ctx} miniatura falló`, { error: String(err) }));

    return { ok: true, documentId: borrador.id, nombre, mime, carpetaId, carpetaNombre: dia };
  } catch (err) {
    logger.error(`${ctx} no se pudo guardar`, { tenantId, error: String(err) });
    return { ok: false, motivo: "error" };
  }
}

// ── Después de guardar: leerlo y ponerlo donde va ────────────────────────────

const RAICES_DE_CANAL = new Set(Object.values(CARPETA_DEL_CANAL).map((n) => n.toLowerCase()));

/**
 * Si el análisis sugirió una carpeta que EXISTE, se lo mueve ahí — sólo si
 * sigue en la carpeta del día (si el dueño ya lo movió a mano, manda él) y si
 * la sugerida no es otra de un canal (moverlo de un día a otro no ordena nada).
 */
export async function moverPapelASugerida(
  tenantId: string,
  canal: CanalPapel,
  documentId: string,
  carpetaOriginal: string,
  autor: string,
): Promise<{ folderId: string; folderName: string } | null> {
  const doc = await DocumentsDB.getById(tenantId, documentId);
  const sug = (doc?.ocrMetadata as { sugerencias?: { folderId?: unknown; folderName?: unknown } } | null)?.sugerencias;
  const destino = typeof sug?.folderId === "string" ? sug.folderId : null;
  const nombre = typeof sug?.folderName === "string" ? sug.folderName : "";
  if (!doc || !destino || destino === doc.folderId || doc.folderId !== carpetaOriginal) return null;
  if (RAICES_DE_CANAL.has(nombre.trim().toLowerCase()) || /^\d{4}-\d{2}-\d{2}$/.test(nombre.trim())) {
    return null;
  }
  const movido = await DocumentsDB.update(tenantId, documentId, { folderId: destino });
  if (!movido) return null;
  DocumentsDB.log(tenantId, {
    documentId,
    actorId: autor,
    action: "move",
    metadata: { origen: canal, desde: carpetaOriginal, hacia: destino, motivo: "sugerencia_del_analisis" },
  }).catch((err) => logger.warn(`[${canal}/archivo] audit del movimiento falló`, { error: String(err) }));
  return { folderId: destino, folderName: nombre };
}

/**
 * En la MISMA cola que la subida del panel (con un modelo local, treinta
 * análisis a la vez tumban la máquina). Si se mueve, `avisar` manda la segunda
 * línea por el canal. Nunca rechaza: el error queda en el log. La promesa es
 * para quien la quiera esperar (`after()` de una ruta); WhatsApp la suelta.
 */
export function analizarYOrdenarPapel(
  tenantId: string,
  canal: CanalPapel,
  guardado: { documentId: string; mime: string; carpetaId: string },
  autor: string,
  avisar: (destino: { folderId: string; folderName: string }) => Promise<unknown>,
): Promise<void> {
  if (!isAnalyzableMime(guardado.mime)) return Promise.resolve();
  return (async () => {
    const [{ enColaDeAnalisis }, { analyzeDocumentContent }] = await Promise.all([
      import("@/lib/documents/cola-analisis"),
      import("@/lib/documents/analyze-document"),
    ]);
    const r = await enColaDeAnalisis(guardado.documentId, () =>
      analyzeDocumentContent(tenantId, guardado.documentId, autor, ROL_ANALISIS),
    );
    if (!r.ok) return;
    const movido = await moverPapelASugerida(tenantId, canal, guardado.documentId, guardado.carpetaId, autor);
    if (movido) await avisar(movido);
  })().catch((err) =>
    logger.error(`[${canal}/archivo] análisis en segundo plano falló`, { tenantId, error: String(err) }),
  );
}

// ── Enlace ───────────────────────────────────────────────────────────────────

export function enlaceACarpeta(folderId: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe").replace(/\/+$/, "");
  return `${base}/admin?tab=documentos&vista=drive&sub=folder&carpeta=${encodeURIComponent(folderId)}`;
}
