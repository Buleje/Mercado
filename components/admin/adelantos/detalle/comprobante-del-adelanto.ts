/**
 * Los datos del «Comprobante para firmar» de un adelanto ya guardado.
 *
 * Con la dirección (ADR-448): un RECIBIDO se imprime al revés — «Recibí de
 * {persona}», firma el negocio. Sin pasarla, el papel de la plata que te
 * dieron decía «Recibí de {negocio}» y lo firmaba la persona (revisión 28-09).
 * El nombre del negocio sale del membrete: sin él, el papel de un recibido
 * decía «— declara haber recibido…».
 */

import {
  armarComprobante,
  diaYHoraCortos,
  metodoDeHuella,
  type DatosComprobante,
  type FirmaEnPapel,
  type FormatoComprobante,
  type HuellaEnPapel,
} from "@/lib/adelantos/comprobante";
import { METODO_PASSKEY, textoLlavePasskey } from "@/lib/adelantos/passkey-tipos";
import { momentoDeLaFoto } from "@/lib/adelantos/recibo-whatsapp";
import type { FirmaRegistrada, RegistroFirmasRespuesta } from "@/lib/adelantos/entregar-tipos";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { esComprobantePdf, esReciboFirmado, fechaHoraLima, limpiarDocumento, srcDelComprobante } from "@/lib/adelantos/recibo-firmado";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { membreteDelDocumento } from "@/lib/documentos/membrete-cargar";
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
    vence: a.fechaVencimiento ?? null,
    liquidado: a.totalEntregado,
    saldo: a.saldoPendiente,
    piesTablares: a.piesTablares ?? null,
    entregasPactadas: (a.entregasPactadas ?? []).map((p) => ({
      numero: p.numero,
      descripcion: p.descripcionEsperada,
      valor: p.valorEsperado,
      fecha: p.fechaEsperada ?? null,
      cumplida: !!p.cumplidaEn,
    })),
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
export async function imprimirComprobante(a: DbAdelanto, formato?: FormatoComprobante): Promise<void> {
  const doc = await armarReciboDelAdelanto(a, { formato });
  doc.save(nombreDelRecibo(a));
}

/** «adelanto-adl-2026-0057.pdf» */
export function nombreDelRecibo(a: Pick<DbAdelanto, "codigoOperacion">): string {
  return `adelanto-${(a.codigoOperacion ?? "sin-codigo").toLowerCase()}.pdf`;
}

/**
 * El mismo recibo como archivo, para mandarlo por WhatsApp (23-10): la copia
 * que sale del negocio, con el DNI tapado («****5678», Ley 29733). La ruta
 * rechaza una copia que lo lleve entero.
 */
export async function reciboComoArchivo(a: DbAdelanto): Promise<File> {
  const doc = await armarReciboDelAdelanto(a, { taparDocumento: true });
  return new File([doc.output("blob")], nombreDelRecibo(a), { type: "application/pdf" });
}

/** La casilla de la huella: la foto, o (ADR-513) el texto de la passkey y de dónde salió su llave. */
function huellaEnPapel(huella: FirmaRegistrada | null, imagen: string | undefined): HuellaEnPapel | undefined {
  if (!huella) return undefined;
  const cuando = fechaHoraLima(new Date(huella.creadoEn));
  if (huella.metodo === METODO_PASSKEY) {
    return { passkey: true, confirmadaEn: diaYHoraCortos(cuando), metodo: "passkey", ...(huella.llave ? { llave: textoLlavePasskey(huella.llave) } : {}) };
  }
  return imagen ? { imagen, metodo: metodoDeHuella(huella.canal), fechaHora: cuando.replace(/^\S+\s/, "") } : undefined;
}

/** Sin membrete (la ruta no respondió), el papel sale igual: nombre vacío y monograma. */
function membreteONulo() {
  return membreteDelDocumento().catch((e: unknown) => {
    logger.warn("[adelantos] el recibo sale sin membrete", { error: String(e) });
    return null;
  });
}

async function armarReciboDelAdelanto(a: DbAdelanto, copia: { taparDocumento?: boolean; formato?: FormatoComprobante } = {}) {
  const [membrete, firmas] = await Promise.all([membreteONulo(), leerRegistro(a.id)]);
  const { firma, huella } = vigentesDelRegistro(firmas ?? []);
  const recibo = esReciboFirmado(a.comprobanteUrl);
  const foto = srcDelComprobante(a);
  const [imgFirma, imgHuella, hojaFirmada, voucher] = await Promise.all([
    firma ? comoJpeg(firma.src, "la firma") : undefined,
    /* (ADR-513) La huella por passkey no tiene imagen: no se pide. */
    huella && huella.metodo !== METODO_PASSKEY ? comoJpeg(huella.src, "la huella") : undefined,
    /* La hoja es privada: pasa por `GET /api/adelantos/<id>/comprobante`. */
    !firma && recibo && foto ? comoJpeg(foto, "la hoja firmada") : undefined,
    /* Un voucher en PDF (10-10) no se pinta en el papel: se abre aparte. */
    !recibo && foto && !esComprobantePdf(a.comprobanteUrl) ? comoJpeg(foto, "el voucher") : undefined,
  ]);
  const tomada = momentoDeLaFoto(a.comprobanteUrl);
  return armarComprobante({
    ...datosDelComprobante(a, membrete?.nombre),
    membrete,
    formato: copia.formato,
    taparDocumento: copia.taparDocumento,
    ...(firma && imgFirma
      ? { firma: firmaEnPapelDelRegistro(firma, imgFirma), montoFirmado: firma.monedaFirmada === a.moneda ? firma.montoFirmado : null }
      : {}),
    ...(huellaEnPapel(huella, imgHuella) ? { huella: huellaEnPapel(huella, imgHuella) } : {}),
    hojaFirmada,
    voucher,
    ...(voucher && tomada ? { voucherFechaHora: fechaHoraLima(tomada) } : {}),
  });
}
