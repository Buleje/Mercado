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
import type { DbAdelanto } from "@/lib/db/adelantos.db";

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

export async function imprimirComprobante(a: DbAdelanto): Promise<void> {
  const membrete = await leerMembrete();
  await descargarComprobante(datosDelComprobante(a, membrete.nombre));
}
