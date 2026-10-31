/**
 * El estado de cuenta unificado (Adelantos + cuenta forestal), en PDF.
 *
 * Mismo camino que ya usa el módulo (`comprobante-pdf.ts`): jsPDF + jspdf-autotable
 * cargados en demanda, nunca un segundo motor de impresión por un documento
 * nuevo. Lleva el membrete del negocio (logo, nombre, RUC), a quién y cuándo
 * (hora de Lima), y «Página X de Y»: es el papel que puede terminar
 * mostrándose fuera del sistema.
 *
 * IO (descarga un archivo), pero sin React/fetch/Prisma: recibe los datos ya
 * armados por `estado-cuenta-unificado.ts` (puro) y sólo los dibuja.
 */

import { formatCurrency } from "@/lib/currency";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { formatearDia, type LineaEstadoCuenta, type TotalesEstadoCuenta } from "@/lib/adelantos/estado-cuenta-unificado";
import { PALETA } from "@/lib/documentos/membrete-pdf";

export interface DatosEstadoCuentaPdf {
  /** Nombre de respaldo si el negocio no tiene uno en Datos del negocio (manda el del membrete). */
  negocio?: string | null;
  persona: string;
  documento?: string | null;
  lineas: LineaEstadoCuenta[];
  totales: TotalesEstadoCuenta;
}

const DIA_LARGO: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" };

/** Arma y descarga el estado de cuenta sobre el membrete común. Carga jsPDF en demanda: pesa. */
export async function descargarEstadoDeCuenta(d: DatosEstadoCuentaPdf): Promise<void> {
  const { abrirPapel } = await import("@/lib/documentos/membrete-papel");
  const papel = await abrirPapel({ tipo: "Estado de cuenta" }, { nombreRespaldo: d.negocio });
  papel.linea(d.persona, { tam: 12, negrita: true, alto: 6 });
  if (d.documento) papel.linea(`Documento: ${d.documento}`, { tam: 9, alto: 5 });
  papel.y += 2;

  papel.tabla({
    head: [["Fecha", "Concepto", "Referencia", "Monto", "Saldo"]],
    body: d.lineas.map((l) => [
      formatearDia(l.fecha, DIA_LARGO),
      l.concepto,
      l.referencia ?? "—",
      `${l.monto >= 0 ? "+" : "-"}${montoEnMoneda(Math.abs(l.monto), l.moneda)}`,
      montoEnMoneda(l.acumulado, l.moneda),
    ]),
    // Las líneas son las que se explican a la persona: el total va SEPARADO
    // por pata (mismo criterio que la fila — mostrar el neto solo esconde
    // que una parte se le adelantó plata y por otra ella vendió madera).
    foot: [
      ["", "", "", "Adelantos", formatCurrency(d.totales.adelantos.saldo)],
      ["", "", "", "Cuenta forestal", formatCurrency(d.totales.forestal.saldo)],
      ["", "", "", "Neto", formatCurrency(d.totales.neto)],
    ],
  });

  const otras = Object.entries(d.totales.otrasMonedas).filter(([, v]) => v !== 0);
  if (otras.length) {
    papel.espacio(10);
    papel.linea(`Otras monedas (fuera del neto): ${otras.map(([m, v]) => montoEnMoneda(v, m)).join(" · ")}`, { tam: 9 });
  }
  papel.espacio(8);
  papel.linea("Documento de referencia — no reemplaza un comprobante SUNAT.", { tam: 7, color: PALETA.terciario });

  papel.cerrar(`estado-cuenta-${d.persona.trim().replace(/\s+/g, "-").toLowerCase()}.pdf`);
}
