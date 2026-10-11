/**
 * Los datos del «Comprobante para firmar» de un adelanto ya guardado.
 *
 * Con la dirección (ADR-448): un RECIBIDO se imprime al revés — «Recibí de
 * {persona}», firma el negocio. Sin pasarla, el papel de la plata que te
 * dieron decía «Recibí de {negocio}» y lo firmaba la persona (revisión 28-09).
 * El nombre del negocio sale del membrete: sin él, el papel de un recibido
 * decía «— declara haber recibido…».
 */

import { leerMembrete } from "@/lib/admin/membrete-cliente";
import { descargarComprobante, type DatosComprobante, type FirmaEnPapel } from "@/lib/adelantos/comprobante";
import type { FirmaRegistrada, RegistroFirmasRespuesta } from "@/lib/adelantos/entregar-tipos";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { esReciboFirmado, fechaHoraLima, limpiarDocumento, srcDelComprobante } from "@/lib/adelantos/recibo-firmado";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import { imagenComoJpeg } from "../firma/hoja-firma";

export function datosDelComprobante(a: DbAdelanto, negocio?: string | null): DatosComprobante {
  const { direccion, concepto } = leerDireccion(a);
  return {
    codigoOperacion: a.codigoOperacion,
    reciboManual: a.reciboManual,
    persona: a.beneficiario?.nombre ?? "—",
    documento: a.beneficiario?.documento,
    telefono: a.beneficiario?.telefono,
    monto: a.montoAdelantado,
    moneda: a.moneda,
    fecha: a.fechaAdelanto,
    modalidad: a.modalidad,
    notas: a.notas,
    negocio: negocio?.trim() || undefined,
    direccion,
    conceptoRecibido: concepto,
  };
}

/** Del registro de firmas (ADR-491): la firma y la huella vigentes (la última de cada tipo). */
export function vigentesDelRegistro(firmas: readonly FirmaRegistrada[]): { firma: FirmaRegistrada | null; huella: FirmaRegistrada | null } {
  const de = (tipo: FirmaRegistrada["tipo"]) => firmas.find((f) => f.tipo === tipo && f.vigente) ?? null;
  return { firma: de("FIRMA"), huella: de("HUELLA") };
}

/**
 * Lo que va debajo de la firma: nombre, DNI y hora DEL REGISTRO. Con «ahora»,
 * un recibo bajado una semana después decía que se firmó hoy.
 */
export function firmaEnPapelDelRegistro(f: FirmaRegistrada, imagen: string): FirmaEnPapel {
  return { imagen, nombre: f.firmanteNombre, documento: limpiarDocumento(f.firmanteDocumento), fechaHora: fechaHoraLima(new Date(f.creadoEn)) };
}

/** El registro del adelanto; `null` si no se pudo leer (el papel sale igual, sin la firma). */
async function leerRegistro(adelantoId: string): Promise<FirmaRegistrada[] | null> {
  try {
    const res = await fetch(`/api/adelantos/${encodeURIComponent(adelantoId)}/firmas`, { credentials: "include", cache: "no-store" });
    const j = res.ok ? await leerJson<RegistroFirmasRespuesta>(res) : null;
    if (!j) logger.warn("[adelantos] no se pudo leer el registro de firmas para el PDF", { status: res.status });
    return j?.firmas ?? null;
  } catch (e) {
    logger.error("[adelantos] no se pudo leer el registro de firmas para el PDF", { error: String(e) });
    return null;
  }
}

/** Una imagen privada como JPEG para jsPDF (que no lee webp); `undefined` si no se pudo. */
function comoJpeg(src: string, que: string): Promise<string | undefined> {
  return imagenComoJpeg(src).catch((e: unknown) => {
    logger.error(`[adelantos] no se pudo leer ${que} para el PDF`, { error: String(e) });
    return undefined;
  });
}

/**
 * El recibo del adelanto (ADR-491): la firma vigente del REGISTRO sobre su
 * línea, con su nombre, DNI y hora; la casilla de la huella (con la foto si hay);
 * el aviso si se firmó por otro monto; y el voucher en una página aparte. Sin
 * registro, la hoja firmada vieja (legado) como antes. Lo que no se pueda leer
 * queda en el rastro y el papel sale igual.
 */
export async function imprimirComprobante(a: DbAdelanto): Promise<void> {
  const [membrete, firmas] = await Promise.all([leerMembrete(), leerRegistro(a.id)]);
  const { firma, huella } = vigentesDelRegistro(firmas ?? []);
  const recibo = esReciboFirmado(a.comprobanteUrl);
  const foto = srcDelComprobante(a);
  const [imgFirma, imgHuella, hojaFirmada, voucher] = await Promise.all([
    firma ? comoJpeg(firma.src, "la firma") : undefined,
    huella ? comoJpeg(huella.src, "la huella") : undefined,
    /* La hoja es privada: pasa por `GET /api/adelantos/<id>/comprobante`. */
    !firma && recibo && foto ? comoJpeg(foto, "la hoja firmada") : undefined,
    !recibo && foto ? comoJpeg(foto, "el voucher") : undefined,
  ]);
  await descargarComprobante({
    ...datosDelComprobante(a, membrete.nombre),
    ...(firma && imgFirma
      ? { firma: firmaEnPapelDelRegistro(firma, imgFirma), montoFirmado: firma.monedaFirmada === a.moneda ? firma.montoFirmado : null }
      : {}),
    ...(imgHuella ? { huella: { imagen: imgHuella } } : {}),
    hojaFirmada,
    voucher,
  });
}
