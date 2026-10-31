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
 * Desde el 31-10 el núcleo (tipos por bytes, nombre, idempotencia, carpeta con
 * candado, análisis) vive en `lib/documentos/papel-entrante.ts`, que también
 * usa Telegram. Acá queda lo propio de WhatsApp: bajar de Meta, «guárdalo
 * como …» y lo que se le contesta.
 */

import { bajarMediaConTope, type CredencialesMeta } from "./bot-dueno";
import {
  CARPETA_DEL_CANAL,
  MAX_BYTES_PAPEL,
  ROLES_PAPEL_ENTRANTE,
  analizarYOrdenarPapel,
  enlaceACarpeta,
  guardarPapelEntrante,
  moverPapelASugerida,
  type ResultadoPapel,
} from "@/lib/documentos/papel-entrante";

export {
  MAX_BYTES_PAPEL,
  _olvidarTodasLasCarpetas,
  contenidoCoincide,
  enlaceACarpeta,
  esMimeDePapel,
  horaLima,
  idDelPapel,
  mimeDelPapel,
  nombreDelPapel,
  normalizarMime,
  sanearNombre,
  type DatosDelNombre,
  type ResultadoPapel,
} from "@/lib/documentos/papel-entrante";

export const CARPETA_WHATSAPP = CARPETA_DEL_CANAL.whatsapp;
/** Quién ve lo que llega por WhatsApp: el candado del núcleo (`ROLES_PAPEL_ENTRANTE`). */
export const ROLES_PAPEL_WHATSAPP: readonly string[] = ROLES_PAPEL_ENTRANTE;

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

/** El autor del documento: la lista blanca guarda teléfonos, no usuarios del panel. */
export const autorDeWhatsApp = (telefono: string) => `whatsapp:${telefono.replace(/\D/g, "")}`;

export async function archivarPapel(
  tenantId: string,
  cred: CredencialesMeta,
  p: PapelEntrante,
): Promise<ResultadoPapel> {
  return guardarPapelEntrante(
    tenantId,
    "whatsapp",
    {
      idMensaje: p.waMessageId,
      tipo: p.tipo,
      mimeDeclarado: p.mimeDeclarado,
      filename: p.filename,
      pie: p.pie,
      contacto: p.contacto,
      autor: autorDeWhatsApp(p.telefono),
      cuando: p.cuando,
    },
    // Se baja recién cuando se sabe que no es re-entrega (ni un tipo que no entra).
    () => bajarMediaConTope(p.mediaId, cred.token, MAX_BYTES_PAPEL),
  );
}

// ── Después de guardar: leerlo y ponerlo donde va ────────────────────────────

/** Ver `moverPapelASugerida`: sólo si sigue en la carpeta del día. */
export function moverASugerida(
  tenantId: string,
  documentId: string,
  carpetaOriginal: string,
  autor: string,
): Promise<{ folderId: string; folderName: string } | null> {
  return moverPapelASugerida(tenantId, "whatsapp", documentId, carpetaOriginal, autor);
}

/** En segundo plano: si se mueve, `avisar` manda la segunda línea por WhatsApp. */
export function analizarYOrdenar(
  tenantId: string,
  guardado: { documentId: string; mime: string; carpetaId: string },
  autor: string,
  avisar: (destino: { folderId: string; folderName: string }) => Promise<unknown>,
): void {
  void analizarYOrdenarPapel(tenantId, "whatsapp", guardado, autor, avisar);
}

// ── Lo que se le contesta ────────────────────────────────────────────────────

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
