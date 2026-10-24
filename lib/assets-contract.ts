/**
 * assets-contract.ts — genera un PDF de contrato/cotización de alquiler de
 * maquinaria (Activos & Maquinaria, Brandon 2026-06-06).
 *
 * Cliente-side con jsPDF, con el membrete del negocio (logo + nombre, ADR-514). Devuelve un Blob/descarga lista para mandar por
 * WhatsApp. Documento de una página, sobrio, en español-Perú.
 */
import { jsPDF } from "jspdf";
import { membreteDelDocumento } from "@/lib/documentos/membrete-cargar";
import { datosDelMembrete, dibujarMembrete, dibujarPies, margenDelMembrete, altoDelPie } from "@/lib/documentos/membrete-pdf";

const fmtPEN = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export interface ContractInput {
  mode: "contrato" | "cotizacion";
  asset: { name: string; type: string; plate?: string | null };
  client: string;
  quantity?: number | null;
  unitLabel: string;       // "horas", "días", "m³", "viajes"
  rate: number;
  amount: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  dateStr: string;         // fecha de emisión (ya formateada — evitar Date.now en SSR)
}

const PT = 0.3528; // mm por punto: el cuerpo se dibuja en mm, como el membrete

export async function generateContractPDF(input: ContractInput): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = margenDelMembrete();
  const titulo = input.mode === "contrato" ? "CONTRATO DE ALQUILER DE MAQUINARIA" : "COTIZACIÓN DE ALQUILER DE MAQUINARIA";

  const mbr = datosDelMembrete(await membreteDelDocumento(), {
    tipo: input.mode === "contrato" ? "Contrato de alquiler" : "Cotización de alquiler",
    fecha: input.dateStr,
  });
  let y = dibujarMembrete(doc, mbr) + 2;
  const acento = [...mbr.acento] as [number, number, number];

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...acento);
  doc.text(titulo, M, y); y += 9;

  // Datos
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.text(value, M + 38, y);
    y += 7;
  };
  row("Cliente", input.client || "—");
  row("Equipo", `${input.asset.name}${input.asset.plate ? ` (${input.asset.plate})` : ""}`);
  if (input.startDate || input.endDate) row("Periodo", `${input.startDate ?? "—"}  a  ${input.endDate ?? "—"}`);
  if (input.quantity != null) row("Cantidad", `${input.quantity} ${input.unitLabel}`);
  row("Tarifa", `${fmtPEN(input.rate)} / ${input.unitLabel.replace(/s$/, "")}`);
  y += 3;

  // Total destacado
  doc.setFillColor(238, 247, 247); doc.roundedRect(M, y, W - M * 2, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...acento);
  doc.text(input.mode === "contrato" ? "TOTAL DEL ALQUILER" : "TOTAL COTIZADO", M + 5, y + 7);
  doc.setFontSize(20);
  doc.text(fmtPEN(input.amount), W - M - 5, y + 11, { align: "right" });
  y += 25;

  // Notas
  if (input.notes) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(107, 114, 128);
    doc.text("CONDICIONES / NOTAS", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(input.notes, W - M * 2) as string[];
    doc.text(lines, M, y); y += lines.length * 13 * PT + 4;
  }

  // Cláusula breve + firmas (solo contrato)
  if (input.mode === "contrato") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(107, 114, 128);
    const clausula = "El arrendatario recibe el equipo operativo y se compromete a devolverlo en las mismas condiciones, salvo desgaste normal. El combustible y operador corren por cuenta de quien se indique. El pago se realiza según lo pactado.";
    const cl = doc.splitTextToSize(clausula, W - M * 2) as string[];
    doc.text(cl, M, y); y += cl.length * 11 * PT + 18;

    const yMax = doc.internal.pageSize.getHeight() - altoDelPie() - 8;
    if (y > yMax) { doc.addPage(); y = 30; }
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.3);
    doc.line(M, y, M + 64, y); doc.line(W - M - 64, y, W - M, y); y += 5;
    doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text("EL ARRENDADOR", M, y); doc.text("EL ARRENDATARIO", W - M - 64, y);
  }

  dibujarPies(doc, mbr);
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`${input.mode}-${safe(input.asset.name)}-${safe(input.client || "cliente")}.pdf`);
}
