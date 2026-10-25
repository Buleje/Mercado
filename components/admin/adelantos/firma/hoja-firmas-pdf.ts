/**
 * La hoja de firmas del sábado en PDF (25-10): A4 apaisado sobre el membrete
 * común (`abrirPapel`, el mismo de los estados de cuenta), una fila por adelanto
 * con casilleros grandes para la firma y la huella. Sólo en el navegador.
 */

import type { AdelantoParaHoja } from "@/lib/adelantos/hoja-firmas";
import { fmtMon } from "../shared";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 10/09», en hora de Lima. */
export function fechaCorta(d: Date): string {
  const lima = new Date(d.getTime() - 5 * 3600_000);
  const dd = String(lima.getUTCDate()).padStart(2, "0");
  const mm = String(lima.getUTCMonth() + 1).padStart(2, "0");
  return `${DIAS[lima.getUTCDay()]} ${dd}/${mm}`;
}

/** Arma y baja `hoja-de-firmas-<código>.pdf`. */
export async function imprimirHojaDeFirmas(codigo: string, adelantos: readonly AdelantoParaHoja[], hoy = new Date()): Promise<void> {
  const { abrirPapel } = await import("@/lib/documentos/membrete-papel");
  const papel = await abrirPapel({ tipo: "Hoja de firmas", codigo }, { orientacion: "l" });
  papel.linea(`Hoja de firmas — ${fechaCorta(hoy)}`, { tam: 13, negrita: true, alto: 6.5 });
  papel.linea(`Hoja ${codigo} · ${adelantos.length} ${adelantos.length === 1 ? "adelanto" : "adelantos"}. Cada persona firma y pone su huella en su fila.`, { tam: 9, alto: 6 });

  papel.tabla({
    head: [["Persona", "DNI", "Fecha", "Concepto", "Monto", "Saldo", "Firma", "Huella"]],
    body: adelantos.map((a) => [
      a.codigo ? `${a.persona}\n${a.codigo}` : a.persona,
      a.documento ?? "—",
      fechaCorta(new Date(a.fecha)),
      a.concepto,
      fmtMon(a.monto, a.moneda),
      fmtMon(a.saldo, a.moneda),
      "",
      "",
    ]),
    styles: { fontSize: 9, cellPadding: 2, minCellHeight: 26, valign: "middle", lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: "bold" },
      1: { cellWidth: 22 },
      2: { cellWidth: 24 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 52 },
      7: { cellWidth: 30 },
    },
    headStyles: { minCellHeight: 9 },
    alternateRowStyles: {},
  });
  papel.espacio(8);
  papel.linea("Documento de constancia interna — no reemplaza un comprobante SUNAT.", { tam: 7 });

  papel.cerrar(`hoja-de-firmas-${codigo}.pdf`);
}
