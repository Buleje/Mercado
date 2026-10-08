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
import { descargarComprobante, type DatosComprobante } from "@/lib/adelantos/comprobante";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { esReciboFirmado, srcDelComprobante } from "@/lib/adelantos/recibo-firmado";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
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

/**
 * Con el recibo ya firmado en la pantalla, la hoja guardada va en la segunda
 * página: la firma suelta no se guarda aparte. Si la hoja no se puede leer, sale
 * el papel de siempre (para firmar a mano) y queda el rastro.
 */
export async function imprimirComprobante(a: DbAdelanto): Promise<void> {
  const [membrete, hojaFirmada] = await Promise.all([
    leerMembrete(),
    /* La hoja es privada: pasa por `GET /api/adelantos/<id>/comprobante`. */
    esReciboFirmado(a.comprobanteUrl)
      ? imagenComoJpeg(srcDelComprobante(a) as string).catch((e: unknown) => {
          logger.error("[adelantos] no se pudo leer la hoja firmada para el PDF", { error: String(e) });
          return undefined;
        })
      : Promise.resolve(undefined),
  ]);
  await descargarComprobante({ ...datosDelComprobante(a, membrete.nombre), hojaFirmada });
}
