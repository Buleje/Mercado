"use client";

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import type { LecturaIgv } from "./igv";

/**
 * El ⓘ del IGV: de dónde sale, cómo se carga y por qué en la Amazonía puede no
 * aplicar. Lo comparten la tarjeta «IGV a pagar» y el resumen fiscal.
 */
export default function AyudaIgv({ lectura }: { lectura: LecturaIgv }) {
  const deDonde =
    lectura.tipo === "sin_registro"
      ? `Este mes no hay comprobantes electrónicos emitidos ni gastos con su IGV anotado${lectura.gastos > 0 ? ` (0 de ${lectura.gastos})` : ""}. No se estima con el 18 %.`
      : `IGV de ${lectura.comprobantes} comprobante${lectura.comprobantes === 1 ? "" : "s"} electrónico${lectura.comprobantes === 1 ? "" : "s"} (${formatCurrency(lectura.debito)}) − IGV de ${lectura.conIgv} de ${lectura.gastos} gastos (${formatCurrency(lectura.credito)}). Sólo lo registrado, sin estimar.`;
  return (
    <InfoTip
      title="IGV del mes"
      ariaLabel="Qué es el IGV del mes"
      what={deDonde}
      affects="El IGV de tus ventas aparece al emitir boletas y facturas electrónicas desde el sistema. El de tus compras necesita el IGV de cada factura en su gasto: el registro de gastos todavía no lo pide."
      example="En la Amazonía (Ucayali, Loreto, Madre de Dios…) muchas ventas pueden estar exoneradas de IGV. Consulta con tu contador si te aplica antes de declarar."
    />
  );
}
