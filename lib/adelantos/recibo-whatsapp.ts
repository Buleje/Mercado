/**
 * El recibo del adelanto por WhatsApp y su estado en la tabla (23-10).
 *
 * Puro (cliente y servidor). Lo que la tabla de Adelantos muestra por fila:
 *  - Firma / Huella: la última de cada tipo del registro (`AdelantoFirma`, ADR-491).
 *  - Foto: la foto del adelanto (`comprobanteUrl` privado: el recibo, el
 *    voucher o quien recibe). Su hora sale de la ruta (`<ms>-voucher-…`), sin
 *    columna nueva. Una por adelanto, como siempre (el voucher no se cambia).
 *  - Recibo: el último «Recibo por WhatsApp» de la actividad. «Enviado» quiere
 *    decir que se abrió el chat con el recibo: WhatsApp no confirma la entrega.
 *
 * Sin schema: el envío queda en `ActivityLog` (acción fija, número y vía en el
 * detalle con un formato que se vuelve a leer) y el PDF en el Archivo, en la
 * carpeta de la persona, con un enlace que vence a las 72 h y se corta al
 * anular el adelanto. La copia que se comparte lleva el DNI tapado (Ley 29733).
 */

import { ROLES_ENTIDAD_SENSIBLE } from "@/lib/documentos/enlaces-entidad";
import { PREFIJO_PRIVADO } from "./recibo-firmado";

/** La acción del registro de actividad. NO cambiarla: el estado se lee por ella. */
export const ACCION_RECIBO_WHATSAPP = "Recibo por WhatsApp";

/** Días que vive el enlace del PDF (`/d/<token>`): 72 h. Lleva firma, huella y foto. */
export const DIAS_ENLACE_RECIBO = 3;

/** Un recibo ya preparado se vuelve a usar si a su enlace le quedan al menos estas horas. */
export const HORAS_MINIMAS_PARA_REUSAR = 24;

/**
 * Quién manda el recibo: el PDF se guarda en la carpeta PRIVADA de la persona
 * (candado de dueño, ADR-502), así que sólo el dueño y el administrador. El
 * encargado ve el adelanto pero esa carpeta no: la ventana le dice por qué.
 */
export function puedeMandarRecibo(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_ENTIDAD_SENSIBLE as readonly string[]).includes(rol);
}
export const MOTIVO_RECIBO_SOLO_DUENO = "Sólo el dueño o un administrador: el PDF va a la carpeta privada de la persona.";

/** Por dónde salió: el chat de WhatsApp con el enlace, o el PDF mismo desde la hoja de compartir del celular. */
export type ViaEnvio = "whatsapp" | "compartido";

/** Etiqueta del PDF en el Archivo, además de la de la persona. */
export const TAG_RECIBO_ADELANTO = "recibo-adelanto";
export const tagDelAdelanto = (adelantoId: string): string => `adelanto:${adelantoId}`;

/** ¿Es un papel de un adelanto (su recibo)? Esos no se firman por el enlace público del Archivo. */
export function esPapelDeAdelanto(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).some((t) => t === TAG_RECIBO_ADELANTO || t.startsWith("adelanto:"));
}

/** Tope del PDF que llega del navegador (con firma, huella y foto pesa ~300 KB). */
export const MAX_BYTES_RECIBO_PDF = 6 * 1024 * 1024;

/**
 * El celular al que se manda: 9 dígitos que empiezan con 9 (con o sin el 51
 * adelante, con espacios o guiones). WhatsApp necesita un celular: un fijo no
 * sirve acá aunque la ficha lo acepte.
 */
export function celularParaRecibo(texto: string | null | undefined): { ok: true; nueve: string } | { ok: false; error: string } {
  let d = (texto ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("51")) d = d.slice(2);
  if (!d) return { ok: false, error: "Escribe el celular de quien recibió la plata." };
  if (d.length !== 9) return { ok: false, error: "Un celular peruano tiene 9 dígitos." };
  if (!d.startsWith("9")) return { ok: false, error: "Un celular peruano empieza con 9." };
  return { ok: true, nueve: d };
}

/**
 * El aviso del campo «Celular» de una persona: vacío no avisa (es opcional, sólo
 * sugerido); con algo escrito, la MISMA regla del envío del recibo. No bloquea
 * el guardado: la ficha acepta un fijo, pero con un fijo el recibo no se manda.
 */
export function avisoCelular(texto: string | null | undefined): string | null {
  if (!(texto ?? "").trim()) return null;
  const r = celularParaRecibo(texto);
  return r.ok ? null : `${r.error.replace(/\.$/, "")}. Sin un celular no se le puede mandar el recibo por WhatsApp.`;
}

/** «987 654 321»: como se dicta. */
export function celularLegible(nueve: string): string {
  return /^\d{9}$/.test(nueve) ? `${nueve.slice(0, 3)} ${nueve.slice(3, 6)} ${nueve.slice(6)}` : nueve;
}

/**
 * ¿Se anota el celular en la ficha al mandar? Sólo si la ficha está VACÍA: un
 * fijo o un número escrito con espacios es de la persona y no se pisa. Mismo
 * criterio en la ventana («lo anotamos») y en el servidor (`anotarCelularSiFalta`).
 */
export function fichaSinTelefono(telefono: string | null | undefined): boolean {
  return !(telefono ?? "").trim();
}

/** Lo que se le escribe, con el enlace al PDF. Los datos salen de la base (la ruta los devuelve), no de la pantalla. */
export function mensajeRecibo(d: { nombre: string; codigo: string | null; monto: string; negocio: string; enlace: string; vence: string }): string {
  const primerNombre = d.nombre.trim().split(/\s+/)[0] || "";
  const cod = d.codigo ? ` ${d.codigo}` : "";
  return [
    `Hola${primerNombre ? ` ${primerNombre}` : ""}, te mando el recibo del adelanto${cod} por ${d.monto}${d.negocio ? ` de ${d.negocio}` : ""}.`,
    `Puedes verlo y bajarlo acá${d.vence ? ` hasta el ${d.vence}` : ""}: ${d.enlace}`,
  ].join("\n");
}

/** El detalle que queda en la actividad. `leerDetalleEnvio` lo vuelve a leer: mismo formato. */
export function detalleEnvio(d: { codigo: string | null; adelantoId: string; nueve: string; documentoId: string; via?: ViaEnvio }): string {
  const como = d.via === "compartido" ? "compartido desde el celular para el" : "enviado por WhatsApp al";
  return `Recibo de ${d.codigo || d.adelantoId} ${como} ${d.nueve} · documento ${d.documentoId}`;
}

const DETALLE = /(enviado por WhatsApp al|compartido desde el celular para el) (\d{9})(?: · documento ([A-Za-z0-9_-]{1,64}))?/;

export function leerDetalleEnvio(detalle: string): { nueve: string; documentoId: string | null; via: ViaEnvio } | null {
  const m = DETALLE.exec(detalle);
  return m ? { nueve: m[2], documentoId: m[3] ?? null, via: m[1].startsWith("compartido") ? "compartido" : "whatsapp" } : null;
}

/**
 * ¿El PDF lleva alguno de estos documentos COMPLETO? jsPDF guarda el texto sin
 * comprimir, así que un DNI escrito entero aparece tal cual en los bytes. La
 * ruta lo usa para no publicar una copia sin tapar (un navegador viejo o un
 * error del armado). Documentos de menos de 6 caracteres no se miran: saldrían
 * por casualidad en una imagen.
 */
export function pdfLlevaAlgunDocumento(pdf: Uint8Array, documentos: readonly (string | null | undefined)[]): boolean {
  const buscados = [...new Set(documentos.map((d) => (d ?? "").trim()).filter((d) => d.length >= 6))];
  if (buscados.length === 0) return false;
  const texto = new TextDecoder("latin1").decode(pdf);
  return buscados.some((d) => texto.includes(d));
}

/** Cuándo se tomó la foto del adelanto: el `<ms>` de su ruta privada. `null` si no es una ruta privada nuestra. */
export function momentoDeLaFoto(comprobanteUrl: string | null | undefined): Date | null {
  if (!comprobanteUrl?.startsWith(PREFIJO_PRIVADO)) return null;
  const archivo = comprobanteUrl.slice(comprobanteUrl.lastIndexOf("/") + 1);
  const m = /^(\d{10,16})-/.exec(archivo);
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** El estado del recibo de UN adelanto, como lo manda `GET /api/adelantos/estado-recibos`. */
export interface EstadoRecibo {
  /** ISO de la última firma / huella; `null` si no hay. */
  firma: string | null;
  huella: string | null;
  /** El último envío: por WhatsApp (el enlace en el chat) o compartido desde el celular (el PDF). */
  envio: { en: string; nueve: string; por: string; via: ViaEnvio } | null;
}

export type EstadoRecibos = Record<string, EstadoRecibo>;

export const ESTADO_VACIO: EstadoRecibo = { firma: null, huella: null, envio: null };

/** «23/10 14:05» en hora de Lima: la fecha del negocio (corta, para una celda). */
export function fechaCortaLima(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}/${v("month")} ${v("hour")}:${v("minute")}`;
}
