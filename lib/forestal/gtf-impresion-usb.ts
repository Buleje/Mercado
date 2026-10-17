/**
 * Imprimir DIRECTO en la matricial del monte desde el celular (16-10): Chrome
 * de Android + adaptador OTG + cable USB A-B, y los bytes ESC/P (`.prn` de
 * `…/gtf-matricial/salida`) van por WebUSB a la interfaz de impresora (clase
 * USB 0x07). Sin app instalada y sin el aviso que imprime RawBT gratis.
 *
 *   · WebUSB: https://wicg.github.io/webusb/ — la clase 0x07 no está entre las
 *     protegidas, y en Android ningún driver la toma (en Windows la toma
 *     `usbprint`: allá `open`/`claimInterface` fallan → «usa el PDF»).
 *   · iPhone no tiene WebUSB (ni Chrome de iOS, que es Safari por dentro).
 *   · RawBT queda como salida alternativa por `intent:` (su ejemplo oficial:
 *     https://github.com/402d/RawBT_ESCPOS_intent_examples).
 *
 * Sin React ni `navigator` fijo: todo recibe el `usb` (en los tests, uno
 * simulado). El orden importa: el permiso (`requestDevice`) se pide ANTES de
 * bajar la hoja, mientras dura el toque del usuario; si se baja primero y la
 * señal tarda, Chrome responde «Must be handling a user gesture».
 */

import { logger } from "@/lib/logger";

/* ── Lo que usamos de WebUSB (el DOM de TS no lo trae) ──────────────────── */

export interface UsbEndpointLike {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}
export interface UsbAlternateLike {
  alternateSetting: number;
  interfaceClass: number;
  endpoints: readonly UsbEndpointLike[];
}
export interface UsbInterfaceLike {
  interfaceNumber: number;
  alternates: readonly UsbAlternateLike[];
}
export interface UsbConfigurationLike {
  configurationValue: number;
  interfaces: readonly UsbInterfaceLike[];
}
export interface UsbTransferOutResultLike {
  bytesWritten: number;
  status: "ok" | "stall" | "babble";
}
export interface UsbDeviceLike {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: UsbConfigurationLike | null;
  configurations: readonly UsbConfigurationLike[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  selectAlternateInterface(n: number, alt: number): Promise<void>;
  transferOut(endpoint: number, data: Uint8Array): Promise<UsbTransferOutResultLike>;
  clearHalt(direction: "in" | "out", endpoint: number): Promise<void>;
}
export interface UsbLike {
  getDevices(): Promise<UsbDeviceLike[]>;
  requestDevice(o: { filters: Array<{ classCode?: number }> }): Promise<UsbDeviceLike>;
}

/** Clase USB «Printer» (USB Device Class Definition for Printing Devices). */
export const CLASE_IMPRESORA = 0x07;
/** 4 KB por `transferOut`: lo que aguanta cualquier búfer de la matricial sin cortar. */
export const BLOQUE_USB = 4096;

/* ── Qué puede este navegador ───────────────────────────────────────────── */

export type MotivoUsb =
  | "sin-webusb"
  | "cancelado"
  | "sin-permiso"
  | "sin-interfaz"
  | "interfaz-tomada"
  | "desconectada"
  | "fallo"
  | "bajada";

export interface Soporte {
  puede: boolean;
  /** Android: tiene sentido ofrecer «Abrir en RawBT». */
  android: boolean;
  mensaje: string;
}

export const esIos = (ua: string): boolean => /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
export const esAndroid = (ua: string): boolean => /Android/i.test(ua);

export function soporteImpresionDirecta(usb: UsbLike | null | undefined, ua: string): Soporte {
  const android = esAndroid(ua);
  if (usb) return { puede: true, android, mensaje: "" };
  if (esIos(ua)) {
    return {
      puede: false,
      android: false,
      mensaje: "En iPhone no se puede imprimir directo: Apple no deja usar el USB desde el navegador. Usa «PDF (tamaño real)» o un celular Android.",
    };
  }
  if (/Firefox\//i.test(ua)) return { puede: false, android, mensaje: "Firefox no puede usar el USB: abre esta página en Chrome." };
  return {
    puede: false,
    android,
    mensaje: android
      ? "Este navegador no puede usar el USB: abre esta página en Chrome."
      : "Este equipo no puede imprimir directo: abre la guía en Chrome de un celular Android con el cable OTG, o baja el .prn.",
  };
}

/* ── La impresora: cuál interfaz y qué endpoint ─────────────────────────── */

export interface RutaUsb {
  configuracion: number;
  interfaz: number;
  alterna: number;
  endpoint: number;
}

/** La primera interfaz de clase impresora con un endpoint OUT de tipo bulk. */
export function interfazDeImpresora(d: UsbDeviceLike): RutaUsb | null {
  for (const c of d.configurations) {
    for (const i of c.interfaces) {
      for (const a of i.alternates) {
        if (a.interfaceClass !== CLASE_IMPRESORA) continue;
        const ep = a.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
        if (ep) return { configuracion: c.configurationValue, interfaz: i.interfaceNumber, alterna: a.alternateSetting, endpoint: ep.endpointNumber };
      }
    }
  }
  return null;
}

export const nombreImpresora = (d: UsbDeviceLike): string =>
  [d.manufacturerName, d.productName].filter((s): s is string => !!s?.trim()).join(" ") || "la impresora USB";

/* ── Mensajes: cada uno dice qué hacer ──────────────────────────────────── */

const MENSAJE: Record<Exclude<MotivoUsb, "sin-webusb" | "bajada" | "fallo">, string> = {
  cancelado: "No elegiste la impresora. Conecta la matricial con el cable OTG, préndela y vuelve a intentarlo.",
  "sin-permiso": "El celular no dio permiso para usar el USB. Vuelve a intentarlo y elige la impresora.",
  "sin-interfaz": "Lo que está conectado no es una impresora USB: revisa que el cable vaya a la matricial.",
  "interfaz-tomada": "La impresora la está usando otra app (RawBT u otra) o el sistema. Ciérrala y prueba de nuevo; en una PC, usa el PDF.",
  desconectada: "Se desconectó la impresora: revisa el cable OTG y que esté prendida, y vuelve a intentarlo.",
};

export type FalloUsb = { ok: false; motivo: MotivoUsb; mensaje: string };
export type ResultadoUsb = { ok: true; impresora: string; bytes: number } | FalloUsb;

const nombreError = (e: unknown): string => (e instanceof Error || e instanceof DOMException ? e.name : "");
const textoError = (e: unknown): string => (e instanceof Error || e instanceof DOMException ? e.message : String(e));

function fallo(motivo: Exclude<MotivoUsb, "sin-webusb" | "bajada" | "fallo">): FalloUsb {
  return { ok: false, motivo, mensaje: MENSAJE[motivo] };
}

/**
 * La impresora ya autorizada (`getDevices`: no vuelve a preguntar) o, si no
 * hay, el selector de Chrome filtrado a impresoras. Llamarla PRIMERO en el clic.
 */
export async function elegirImpresora(usb: UsbLike): Promise<{ ok: true; device: UsbDeviceLike } | FalloUsb> {
  try {
    const autorizada = (await usb.getDevices()).find((d) => interfazDeImpresora(d) !== null);
    if (autorizada) return { ok: true, device: autorizada };
    return { ok: true, device: await usb.requestDevice({ filters: [{ classCode: CLASE_IMPRESORA }] }) };
  } catch (e) {
    const n = nombreError(e);
    /* NotFoundError = cerró el selector sin elegir (o no había nada conectado). */
    if (n === "NotFoundError" || n === "AbortError") return fallo("cancelado");
    if (n === "SecurityError" || n === "NotAllowedError") return fallo("sin-permiso");
    return { ok: false, motivo: "fallo", mensaje: `No se pudo abrir el USB: ${textoError(e)}` };
  }
}

/**
 * Manda los bytes a la impresora en bloques de `bloque` y SIEMPRE libera la
 * interfaz y cierra el dispositivo (aunque falle a mitad de la hoja).
 */
export async function enviarPorUsb(device: UsbDeviceLike, bytes: Uint8Array, bloque = BLOQUE_USB): Promise<ResultadoUsb> {
  const ruta = interfazDeImpresora(device);
  if (!ruta) return fallo("sin-interfaz");
  let abierto = false;
  let reclamada = false;
  let etapa: "abrir" | "reclamar" | "enviar" = "abrir";
  try {
    if (!device.opened) await device.open();
    abierto = true;
    if (device.configuration?.configurationValue !== ruta.configuracion) await device.selectConfiguration(ruta.configuracion);
    etapa = "reclamar";
    await device.claimInterface(ruta.interfaz);
    reclamada = true;
    if (ruta.alterna !== 0) await device.selectAlternateInterface(ruta.interfaz, ruta.alterna);
    etapa = "enviar";
    let enviados = 0;
    for (let i = 0; i < bytes.length; i += bloque) {
      const trozo = bytes.subarray(i, Math.min(i + bloque, bytes.length));
      let r = await device.transferOut(ruta.endpoint, trozo);
      /* Un «stall» se destraba una vez (papel atascado al empezar, búfer lleno). */
      if (r.status === "stall") {
        await device.clearHalt("out", ruta.endpoint);
        r = await device.transferOut(ruta.endpoint, trozo);
      }
      if (r.status !== "ok") break;
      enviados += r.bytesWritten;
    }
    if (enviados !== bytes.length) {
      return {
        ok: false,
        motivo: "fallo",
        mensaje: `La impresora recibió ${enviados} de ${bytes.length} bytes: revisa el papel y el cable, descarta esa hoja y vuelve a imprimir.`,
      };
    }
    return { ok: true, impresora: nombreImpresora(device), bytes: enviados };
  } catch (e) {
    const n = nombreError(e);
    if (n === "NotFoundError") return fallo("desconectada");
    /* «Access denied» al abrir (Windows) o «Unable to claim interface»: la tiene otro. */
    if (etapa !== "enviar" && (n === "SecurityError" || n === "NetworkError" || n === "InvalidStateError")) return fallo("interfaz-tomada");
    if (etapa === "enviar" && n === "NetworkError") return fallo("desconectada");
    return { ok: false, motivo: "fallo", mensaje: `No se pudo imprimir: ${textoError(e)}` };
  } finally {
    if (reclamada) await device.releaseInterface(ruta.interfaz).catch((err: unknown) => logger.warn("[impresion-usb] release", { error: String(err) }));
    if (abierto) await device.close().catch((err: unknown) => logger.warn("[impresion-usb] close", { error: String(err) }));
  }
}

/* ── Todo junto: permiso → bajar → mandar ───────────────────────────────── */

export interface ArchivoSalida {
  blob: Blob;
  nombre: string;
  /** Valores que no entraron en su casillero y el servidor cortó. */
  recortados?: number;
}

export type ResultadoDirecto =
  | { ok: true; impresora: string; bytes: number; archivo: ArchivoSalida }
  | { ok: false; motivo: MotivoUsb; mensaje: string; android: boolean; archivo: ArchivoSalida | null };

/**
 * `obtener` baja el `.prn` (o devuelve el porqué en palabras del monte). Se
 * llama DESPUÉS de tener la impresora: si el usuario cancela, no se baja nada.
 */
export async function imprimirPorUsb(
  obtener: () => Promise<ArchivoSalida | string>,
  entorno: { usb: UsbLike | null | undefined; ua: string; bloque?: number },
): Promise<ResultadoDirecto> {
  const s = soporteImpresionDirecta(entorno.usb, entorno.ua);
  if (!s.puede || !entorno.usb) return { ok: false, motivo: "sin-webusb", mensaje: s.mensaje, android: s.android, archivo: null };
  const elegida = await elegirImpresora(entorno.usb);
  if (!elegida.ok) return { ...elegida, android: s.android, archivo: null };
  const archivo = await obtener();
  if (typeof archivo === "string") return { ok: false, motivo: "bajada", mensaje: archivo, android: s.android, archivo: null };
  const r = await enviarPorUsb(elegida.device, new Uint8Array(await archivo.blob.arrayBuffer()), entorno.bloque);
  return r.ok ? { ...r, archivo } : { ...r, android: s.android, archivo };
}

/* ── Alternativa: RawBT por intent ──────────────────────────────────────── */

export const PAQUETE_RAWBT = "ru.a402d.rawbtprinter";

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * `intent:base64,<datos>#Intent;scheme=rawbt;package=…;end;` — el formato del
 * ejemplo oficial de RawBT. Sin la app instalada, Chrome abre su ficha en Play.
 */
export const urlIntentRawbt = (bytes: Uint8Array): string => `intent:base64,${base64(bytes)}#Intent;scheme=rawbt;package=${PAQUETE_RAWBT};end;`;
