/**
 * Pedir un papel por el bot de Telegram del dueño (31-10) — la parte pura.
 *
 * Brandon le escribe a su bot «DNI del jefe de Shinshiguani» (o «mándame…»,
 * «pásame…», «necesito…») y el bot le contesta con el archivo. Lo que decide
 * si la frase ES un pedido de papel es el MISMO lector del WhatsApp del dueño
 * (`leerPreguntaDePapeles`): plata, agenda y «anota…» nunca pasan. Acá se le
 * suman los verbos que en Telegram se dicen y en WhatsApp no estaban
 * («necesito», «dame», «quiero», «búscame»), y por Telegram todo pedido es
 * «mándamelo»: no hay lista de enlaces, hay archivo o botones.
 *
 * Y lo que no sale por Telegram: un papel con una clave de verdad (usuario y
 * contraseña de un portal, clave SOL, clave de rescate de BitLocker). Medido
 * el 31-10 sobre los 683 papeles de Blas (312 con texto leído): 5 traen
 * «clave:», y 4 de ellos son la clave PÚBLICA del validador documental de
 * SERFOR («…validadorDocumental/ Clave: 0S2…»), que va impresa en la carta
 * para comprobarla. Esa no cuenta; la credencial con «CONTRASEÑA: …», sí.
 */
import { leerCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { plegar, type CarpetaBuscable } from "@/lib/documentos/busqueda-natural";
import { leerPreguntaDePapeles } from "@/lib/whatsapp/preguntar-archivo";

/** Telegram deja mandar hasta 50 MB por bot; con margen para el formulario. */
export const MAX_BYTES_TELEGRAM = 49 * 1024 * 1024;
/** Cuántos papeles van como botones cuando hay más de uno. */
export const MAX_BOTONES = 5;

export interface PedidoDePapel {
  /** La frase para el buscador del Archivo, sin verbos ni el nombre del negocio. */
  frase: string;
  /** Si la frase entera es un código («DOC-000367», «doc 367»), el número. */
  codigo: number | null;
}

/**
 * Verbos de Telegram que el lector de WhatsApp no toma como pedido: se cambian
 * por «mándame». «manda…» a secas NO va acá: «manda la partida a Drucila» es
 * para otra persona y el lector ya lo deja pasar de largo.
 */
const VERBO_NUEVO = new Set([
  "necesito", "necesitaria", "quiero", "quisiera", "dame", "deme", "damelo", "damela", "buscame", "busca",
  "busco", "consigueme", "consigue", "traeme", "ubicame", "encuentrame",
]);
/** «mándame…» para uno mismo: el lector ya los entiende; sólo se quitan para leer un código. */
const VERBO_MANDAME = new Set([
  "mandame", "mandamelo", "mandamela", "pasame", "pasamelo", "pasamela", "enviame", "enviamelo", "enviamela",
  "reenviame", "reenviamelo",
]);

/** «de la bodega», «en la bodega», «de Blas»: dicen el negocio, no el papel. */
const NOMBRE_DEL_NEGOCIO = /(?:^|\s)(?:(?:de|en|para|del)\s+)?(?:la\s+)?(?:bodega|blas)(?=\s|$|[.,;:!?])/giu;

/**
 * ¿Es un pedido de papel? `null` = no (el buzón lo pasa a lo de siempre:
 * anotar, «hecho…», «resuelto…»).
 */
export function leerPedidoDePapel(texto: string | null | undefined): PedidoDePapel | null {
  const crudo = (texto ?? "").replace(NOMBRE_DEL_NEGOCIO, " ").replace(/\s+/g, " ").trim();
  if (!crudo || crudo.length > 300) return null;
  const palabras = crudo.split(" ");
  const primera = plegar(palabras[0] ?? "").replace(/[^a-z]/g, "");
  const verboNuevo = VERBO_NUEVO.has(primera);
  const resto = verboNuevo || VERBO_MANDAME.has(primera) ? palabras.slice(1).join(" ").trim() : crudo;
  if (!resto) return null;

  // «mándame DOC-000367» / «DOC-000367»: el código es único, no hay nada que interpretar.
  // Un número pelado no: «2026» es el año, «200» suena a plata.
  const codigo = leerCodigoDocumento(resto);
  if (codigo != null && !/^\s*\d+\s*$/.test(resto)) return { frase: resto, codigo };

  // El verbo nuevo se cambia por «mándame» para que el lector lo tome como pedido de envío.
  const p = leerPreguntaDePapeles(verboNuevo ? `mándame ${resto}` : crudo);
  if (p?.frase.trim()) return { frase: p.frase, codigo: null };
  // «mándame la credencial de Chinchihuani»: el lector no conoce «credencial» como papel, pero al bot nadie le
  // pide que mande otra cosa. Con verbo alcanza, salvo que suene a plata, agenda o «anota» (eso es del registro).
  // «dame 200» no nombra nada: hace falta al menos una palabra.
  const plano = plegar(resto);
  if ((verboNuevo || VERBO_MANDAME.has(primera)) && /[a-zñ]{3,}/.test(plano) && !SUENA_A_REGISTRO.test(plano)) {
    return { frase: resto, codigo: null };
  }
  return null;
}

/** Lo que el buzón anota en el registro de la semana o en la agenda, no un papel que buscar. */
const SUENA_A_REGISTRO =
  /(^|[^a-z])(s\/|soles?|lucas|adelant\w*|pag(o|os|ue|ar|ado|amos|aron)|cobr\w*|vend\w*|ventas?|compr\w*|gast\w*|anot\w*|apunt\w*|recuerd\w*|recordatorio\w*|cita|reunion\w*|agenda\w*|tareas?|pendientes?)([^a-z]|$)/u;

// ── Papeles con clave ─────────────────────────────────────────────────────────

/** Rótulo de clave + `:`/`=` + 4 o más caracteres (lo mismo que ADR-524 §4.3 para el texto libre). */
const CLAVE_ROTULADA = /(clave(?:\s*sol)?|contrase[ñn]a|password|\bpin|usuario\s*sol)\s*[:=]\s*\S{4,}/giu;
/** La clave del validador documental (SERFOR, gob.pe) es pública: va impresa para comprobar el papel. */
const ES_VALIDADOR = /validador|autenticidad|verifica/iu;
/** Clave de rescate de BitLocker: 8 grupos de 6 dígitos. */
const CLAVE_BITLOCKER = /\b\d{6}(?:-\d{6}){7}\b/u;
/** Un nombre (del papel o de su carpeta) que dice que adentro hay claves. */
const NOMBRE_DE_CLAVES = /\b(claves?|contrasenas?|passwords?|bitlocker|usuario sol)\b/u;

export interface PapelRevisable {
  name: string;
  ocrText?: string | null;
  ocrMetadata?: Record<string, unknown> | null;
}

function textoConClave(t: string | null | undefined): boolean {
  if (!t) return false;
  if (CLAVE_BITLOCKER.test(t)) return true;
  for (const m of t.matchAll(CLAVE_ROTULADA)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 200), m.index ?? 0);
    if (!ES_VALIDADOR.test(antes)) return true;
  }
  return false;
}

/**
 * `true` = no sale por Telegram. Mira el nombre, las carpetas que lo contienen,
 * lo que se leyó del papel (OCR) y lo que la IA o una persona escribió de él.
 */
export function papelConClave(doc: PapelRevisable, carpetas: readonly string[] = []): boolean {
  if ([doc.name, ...carpetas].some((n) => NOMBRE_DE_CLAVES.test(plegar(n ?? "")))) return true;
  if (textoConClave(doc.ocrText)) return true;
  const meta = doc.ocrMetadata ?? {};
  return ["descripcionUsuario", "description", "summary"].some((k) => {
    const v = (meta as Record<string, unknown>)[k];
    return typeof v === "string" && textoConClave(v);
  });
}

// ── Carpetas ──────────────────────────────────────────────────────────────────

/** Nombres de la carpeta y de las que la contienen, de afuera hacia adentro. */
export function cadenaDeCarpetas(folderId: string | null | undefined, carpetas: readonly CarpetaBuscable[]): string[] {
  const porId = new Map(carpetas.map((c) => [c.id, c]));
  const nombres: string[] = [];
  const vistas = new Set<string>();
  let id = folderId ?? null;
  while (id && !vistas.has(id) && nombres.length < 12) {
    vistas.add(id);
    const c = porId.get(id);
    if (!c) break;
    nombres.unshift(c.name);
    id = c.parentId;
  }
  return nombres;
}

/** «Comunidades y permisos › Shinshiguani»: las dos últimas, que es lo que se reconoce. */
export function carpetaCorta(cadena: readonly string[]): string {
  return cadena.slice(-2).join(" › ");
}

/** Nombre del archivo que llega al celular: el visible + la extensión del original. */
export function nombreDeArchivo(name: string, originalName: string | null | undefined): string {
  const ext = /\.[a-z0-9]{1,5}$/i.exec(originalName ?? "")?.[0] ?? "";
  const visible = name.replace(/[\r\n"\\/:*?<>|]+/g, " ").replace(/\s+/g, " ").trim() || "documento";
  return ext && !visible.toLowerCase().endsWith(ext.toLowerCase()) ? `${visible}${ext}` : visible;
}
