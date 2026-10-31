"use client";

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import { textoExoneradas, type LecturaIgv } from "./igv";

/**
 * El ⓘ del IGV: de dónde sale, cómo se carga y por qué en la Amazonía puede no
 * aplicar. Lo comparten la tarjeta «IGV a pagar» y el resumen fiscal.
 */
export default function AyudaIgv({ lectura }: { lectura: LecturaIgv }) {
  const deDonde =
    lectura.tipo === "sin_registro"
      ? `Este mes no hay comprobantes electrónicos emitidos ni gastos con su IGV anotado${lectura.gastos > 0 ? ` (0 de ${lectura.gastos})` : ""}. No se estima con el 18 %.`
      : lectura.tipo === "exoneradas"
        ? `Este mes no emitiste comprobantes electrónicos y ${textoExoneradas(lectura.facturas).toLowerCase()} (IGV S/ 0). No se estima con el 18 %.`
        : `IGV de ${lectura.comprobantes} comprobante${lectura.comprobantes === 1 ? "" : "s"} electrónico${lectura.comprobantes === 1 ? "" : "s"} (${formatCurrency(lectura.debito)}) − IGV de ${lectura.conIgv} de ${lectura.gastos} gastos (${formatCurrency(lectura.credito)})${lectura.exoneradas > 0 ? `; ${lectura.exoneradas} factura${lectura.exoneradas === 1 ? "" : "s"} exonerada${lectura.exoneradas === 1 ? "" : "s"} con IGV S/ 0` : ""}. Sólo lo registrado, sin estimar.`;
  return (
    <InfoTip
      title="IGV del mes"
      ariaLabel="Qué es el IGV del mes"
      what={deDonde}
      affects="El IGV de tus ventas aparece al emitir boletas y facturas electrónicas desde el sistema. El de tus compras sale de la factura que anotas en cada gasto (Gasto nuevo o Corregir gasto, en Compras)."
      example="En la Amazonía (Ucayali, Loreto, Madre de Dios…) muchas ventas pueden estar exoneradas de IGV. Consulta con tu contador si te aplica antes de declarar."
    />
  );
}
