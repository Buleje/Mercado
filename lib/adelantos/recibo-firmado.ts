/**
 * El recibo firmado en la pantalla de un adelanto (08-10): lo que se escribe
 * en la hoja que se guarda, quién firmó y cuándo, y cómo se reconoce después.
 *
 * Sin columna nueva: la hoja (firma + nombre + DNI + hora + monto) se guarda
 * como la foto del comprobante del adelanto, el mismo `comprobanteUrl` que
 * llena «Adjuntar archivo» en el alta. Si ya había una foto (el voucher), va
 * ARRIBA en la misma hoja: un solo lugar, nada se pierde.
 *
 * Ley 29733: la hoja lleva DNI + firma + monto, así que NO va al bucket
 * público. La sube el servidor (PATCH `adjuntarComprobante`, multipart) a la
 * carpeta privada del adelanto y la columna guarda `priv:<ruta>`; se ve sólo
 * por `GET /api/adelantos/<id>/comprobante` (sesión + permiso de lectura de
 * adelantos + mismo negocio). Desde el 10-10 el voucher del alta y el comprobante
 * de cada entrega también van privados (foto o PDF).
 *
 * La firma suelta no prueba nada (se puede pegar en cualquier papel); por eso
 * la hoja la pinta junto al monto, en número y en letras, el código y la hora.
 */

import { montoConMoneda, montoEnLetras, monedaEnLetras, rotuloDocumento, textosDelComprobante } from "@/lib/adelantos/comprobante";
import type { AdelantoConceptoRecibido } from "@/lib/adelantos/direccion";

export interface Firmante {
  nombre: string;
  documento: string;
}

/**
 * «jueves 08/10/2026 · 21:14», siempre en hora de Lima: la firma se hace en
 * el celular de quien sea, y un celular con otra zona horaria no puede mover
 * el día del recibo.
 */
export function fechaHoraLima(d: Date): string {
  const partes = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? "";
  return `${v("weekday")} ${v("day")}/${v("month")}/${v("year")} · ${v("hour")}:${v("minute")}`;
}

/** El documento como se guarda: sin espacios ni guiones («DNI 4567-8901» → «45678901»). */
export function limpiarDocumento(documento?: string | null): string {
  return (documento ?? "").replace(/^\s*(dni|ce|ruc)\s*[:.]?\s*/i, "").replace(/[\s.-]/g, "").toUpperCase();
}

/** `null` = se puede firmar; si no, lo que falta, en una línea. */
export function validarFirmante(f: Firmante): string | null {
  if (f.nombre.trim().length < 3) return "Escribe el nombre de quien firma.";
  const doc = limpiarDocumento(f.documento);
  if (!doc) return "Escribe el DNI de quien firma (8 números).";
  if (/^\d+$/.test(doc) && doc.length < 8) return "El DNI tiene 8 números.";
  if (!/^\d{8}$/.test(doc) && !/^[A-Z0-9]{9,12}$/.test(doc)) {
    return "El DNI tiene 8 números; el carné de extranjería, de 9 a 12.";
  }
  return null;
}

export interface DatosHoja {
  codigoOperacion?: string | null;
  negocio?: string | null;
  persona: string;
  monto: number;
  moneda?: string | null;
  direccion?: string | null;
  conceptoRecibido?: AdelantoConceptoRecibido | null;
  firmante: Firmante;
  /** Ya escrita con `fechaHoraLima`. */
  fechaHora: string;
}

export interface LineasHoja {
  titulo: string;
  monto: string;
  letras: string;
  /** Quién dio y quién recibió, según la dirección (ADR-448). */
  quien: string;
  firmo: string;
  cuando: string;
  pie: string;
}

export function lineasHojaFirmada(d: DatosHoja): LineasHoja {
  const t = textosDelComprobante({
    persona: d.persona,
    monto: d.monto,
    fecha: "",
    modalidad: "",
    negocio: d.negocio ?? undefined,
    direccion: d.direccion,
    conceptoRecibido: d.conceptoRecibido,
  });
  return {
    titulo: `Recibo firmado · ${d.codigoOperacion ?? "sin código"}`,
    monto: montoConMoneda(d.monto, d.moneda),
    letras: `Son: ${montoEnLetras(d.monto)} ${monedaEnLetras(d.moneda)}`,
    quien: `Dio: ${t.recibiDe} · Recibió: ${t.nombre}${t.concepto ? ` · ${t.concepto}` : ""}`,
    firmo: `Firmó: ${d.firmante.nombre.trim()} · ${rotuloDocumento(limpiarDocumento(d.firmante.documento))}`,
    cuando: `${d.fechaHora} (hora de Lima)`,
    pie: "Firma hecha a mano en la pantalla (dedo o mouse) desde el panel.",
  };
}

/** Marca del archivo: así la ficha reconoce una foto que ya es un recibo firmado. */
const MARCA = "firma-recibo";

/** Lo que antecede a la ruta privada en `comprobanteUrl` (la misma forma que las fotos de la carga del CTP). */
export const PREFIJO_PRIVADO = "priv:";
const CARPETA = "adelantos";
/** Ids de la base (cuid, o `main`): sin `/`, `.` ni `%`, así no arman otra carpeta. */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
const ARCHIVO_FIRMA = new RegExp(`^\\d{10,16}-${MARCA}-[a-f0-9]{8,32}\\.webp$`);

/**
 * Ruta en el bucket privado: `<tenantId>/adelantos/<adelantoId>/<ms>-firma-recibo-<azar>.webp`.
 * Una carpeta por adelanto: al volver a firmar, la hoja anterior queda ahí
 * (archivada, privada) y la nueva la lleva arriba.
 */
export function rutaFirmaPrivada(tenantId: string, adelantoId: string, ms: number, azar: string): string {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) throw new Error("id inválido para la ruta de la firma");
  const az = azar.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (az.length < 8) throw new Error("azar corto para la ruta de la firma");
  return `${tenantId}/${CARPETA}/${adelantoId}/${Math.trunc(ms)}-${MARCA}-${az}.webp`;
}

/** `<tenantId>/adelantos/<adelantoId>`: la carpeta privada con todas las hojas del adelanto (la vigente y las archivadas). */
export function carpetaFirmasDelAdelanto(tenantId: string, adelantoId: string): string {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) throw new Error("id inválido para la carpeta de las firmas");
  return `${tenantId}/${CARPETA}/${adelantoId}`;
}

/** Sólo una hoja de la carpeta de ESTE adelanto de ESTE negocio, un tramo, sin nada raro. */
export function esRutaFirmaDelAdelanto(ruta: string, tenantId: string, adelantoId: string): boolean {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) return false;
  const base = `${tenantId}/${CARPETA}/${adelantoId}/`;
  return ruta.startsWith(base) && ARCHIVO_FIRMA.test(ruta.slice(base.length));
}

/** Marca del voucher del alta guardado en privado (V, ADR-491). */
const MARCA_VOUCHER = "voucher";
/* `.pdf` desde el 10-10: «Adjuntar archivo» del alta también acepta el PDF del banco. */
const ARCHIVO_VOUCHER = new RegExp(`^\\d{10,16}-${MARCA_VOUCHER}-[a-f0-9]{8,32}\\.(webp|pdf)$`);
/** Lo que se guarda en la carpeta privada: la foto ya pasada a WebP o el PDF tal cual (verificado por contenido). */
export type ExtensionPrivada = "webp" | "pdf";

/**
 * (V, ADR-491) El voucher del alta, PRIVADO: `<tenantId>/adelantos/<adelantoId>/<ms>-voucher-<azar>.webp`.
 * Misma carpeta que la hoja firmada; `esReciboFirmado` NO lo reconoce como recibo.
 */
export function rutaVoucherPrivada(tenantId: string, adelantoId: string, ms: number, azar: string, ext: ExtensionPrivada = "webp"): string {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) throw new Error("id inválido para la ruta del voucher");
  const az = azar.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (az.length < 8) throw new Error("azar corto para la ruta del voucher");
  return `${tenantId}/${CARPETA}/${adelantoId}/${Math.trunc(ms)}-${MARCA_VOUCHER}-${az}.${ext === "pdf" ? "pdf" : "webp"}`;
}

/** Marca del comprobante de una ENTREGA o abono, guardado en privado (10-10, Ley 29733). */
const MARCA_ADJUNTO = "adjunto";
const ARCHIVO_ADJUNTO = new RegExp(`^\\d{10,16}-${MARCA_ADJUNTO}-[a-f0-9]{8,32}\\.(webp|pdf)$`);

/**
 * El comprobante de una entrega o abono, PRIVADO: `<tenantId>/adelantos/<adelantoId>/<ms>-adjunto-<azar>.<webp|pdf>`.
 * Se sube ANTES de registrar la entrega (`POST …/adjunto`) y la entrega guarda
 * `priv:<ruta>`; el POST de entregas sólo acepta una ruta con esta forma de la
 * carpeta de ESE adelanto.
 */
export function rutaAdjuntoPrivada(tenantId: string, adelantoId: string, ms: number, azar: string, ext: ExtensionPrivada): string {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) throw new Error("id inválido para la ruta del adjunto");
  const az = azar.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (az.length < 8) throw new Error("azar corto para la ruta del adjunto");
  return `${tenantId}/${CARPETA}/${adelantoId}/${Math.trunc(ms)}-${MARCA_ADJUNTO}-${az}.${ext === "pdf" ? "pdf" : "webp"}`;
}

/** Sólo un adjunto de entrega de la carpeta de ESTE adelanto de ESTE negocio. */
export function esRutaAdjuntoDelAdelanto(ruta: string, tenantId: string, adelantoId: string): boolean {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) return false;
  const base = `${tenantId}/${CARPETA}/${adelantoId}/`;
  return ruta.startsWith(base) && ARCHIVO_ADJUNTO.test(ruta.slice(base.length));
}

/** `true` si lo guardado es un PDF privado: la pantalla pinta un ícono, no un `<img>`. */
export function esComprobantePdf(url?: string | null): boolean {
  return !!url && url.startsWith(PREFIJO_PRIVADO) && url.toLowerCase().endsWith(".pdf");
}

/** Lo que `Content-Type` dice de una ruta privada ya validada. */
export function tipoDeRutaPrivada(ruta: string): "application/pdf" | "image/webp" {
  return ruta.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/webp";
}

/** Lo que la puerta `GET …/comprobante` sirve de la carpeta privada: la hoja firmada o el voucher privado. */
export function esRutaComprobanteDelAdelanto(ruta: string, tenantId: string, adelantoId: string): boolean {
  if (esRutaFirmaDelAdelanto(ruta, tenantId, adelantoId)) return true;
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) return false;
  const base = `${tenantId}/${CARPETA}/${adelantoId}/`;
  return ruta.startsWith(base) && ARCHIVO_VOUCHER.test(ruta.slice(base.length));
}

export function esComprobantePrivado(url?: string | null): url is string {
  return !!url && url.startsWith(PREFIJO_PRIVADO);
}

/**
 * Lo que va en `<img src>`, el enlace de la ficha y el PDF. La privada pasa
 * por la puerta del servidor; `?v=` cambia con cada firma (la puerta responde
 * `no-store`, pero la miniatura ya pintada no se vuelve a pedir si el `src` no
 * cambia: sin esto, tras volver a firmar se veía la anterior).
 */
export function srcDelComprobante(a: { id: string; comprobanteUrl?: string | null }): string | null {
  if (!a.comprobanteUrl) return null;
  if (!esComprobantePrivado(a.comprobanteUrl)) return a.comprobanteUrl;
  const archivo = a.comprobanteUrl.slice(a.comprobanteUrl.lastIndexOf("/") + 1);
  return `/api/adelantos/${encodeURIComponent(a.id)}/comprobante?v=${encodeURIComponent(archivo)}`;
}

/**
 * El comprobante de una entrega: la privada pasa por la misma puerta con
 * `?entrega=` (sesión + permiso + negocio + la ruta dentro de la carpeta del
 * adelanto); la pública vieja se pinta como siempre.
 */
export function srcDelComprobanteEntrega(e: { id: string; adelantoId: string; comprobanteUrl?: string | null }): string | null {
  if (!e.comprobanteUrl) return null;
  if (!esComprobantePrivado(e.comprobanteUrl)) return e.comprobanteUrl;
  return `/api/adelantos/${encodeURIComponent(e.adelantoId)}/comprobante?entrega=${encodeURIComponent(e.id)}`;
}

export function esReciboFirmado(url?: string | null): boolean {
  if (!url) return false;
  if (esComprobantePrivado(url)) return url.slice(url.lastIndexOf("/") + 1).includes(`-${MARCA}-`);
  try {
    return new URL(url, "http://x").pathname.split("/").pop()?.includes(`-${MARCA}-`) ?? false;
  } catch {
    return false;
  }
}

/**
 * Sólo una foto subida por ESTE negocio a su carpeta del bucket `media`: la
 * forma EXACTA que devuelve `/api/upload` (`<tenant>/<carpeta>/<ms>-<nombre>.webp`).
 * Sin esto, pegar una URL cualquiera dejaba un enlace ajeno como «comprobante»
 * de un adelanto. Regex y no `includes("..")`: `%2e%2e%2f` llega codificado al
 * `pathname` (y Storage lo decodifica), y `https://user@host` pasaba el origen.
 */
export function esFotoDelNegocio(url: string, { tenantId, origenStorage }: { tenantId: string; origenStorage: string }): boolean {
  if (!ID_SEGURO.test(tenantId)) return false;
  try {
    const u = new URL(url);
    const base = new URL(origenStorage);
    if (u.protocol !== "https:" || u.origin !== base.origin || u.username || u.password || u.search || u.hash) return false;
    const prefijo = `/storage/v1/object/public/media/${tenantId}/`;
    return u.pathname.startsWith(prefijo) && /^[a-z0-9_-]{1,40}\/\d{10,16}-[A-Za-z0-9_-]{0,50}\.webp$/.test(u.pathname.slice(prefijo.length));
  } catch {
    return false;
  }
}
