/**
 * assets-contract.ts — genera un PDF de contrato/cotización de alquiler de
 * maquinaria (Activos & Maquinaria, Brandon 2026-06-06).
 *
 * Cliente-side con jsPDF. Devuelve un Blob/descarga lista para mandar por
 * WhatsApp. Documento de una página, sobrio, en español-Perú.
 */
import { jsPDF } from "jspdf";
import { LEGAL } from "@/lib/legal";

const fmtPEN = (n: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export interface ContractInput {
  mode: "contrato" | "cotizacion";
  business?: string | null; // razón social / nombre del negocio
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

export function generateContractPDF(input: ContractInput): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 56;

  const business = input.business?.trim() || (LEGAL.razonSocial.includes("PENDIENTE") ? LEGAL.nombreComercial : LEGAL.razonSocial);
  const titulo = input.mode === "contrato" ? "CONTRATO DE ALQUILER DE MAQUINARIA" : "COTIZACIÓN DE ALQUILER DE MAQUINARIA";

  // Encabezado
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(20, 20, 20);
  doc.text(business, M, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110, 110, 110);
  if (!LEGAL.ruc.includes("PENDIENTE")) { doc.text(`RUC: ${LEGAL.ruc}`, M, y); y += 12; }
  doc.text(input.dateStr, W - M, 56, { align: "right" });
  y += 10;

  doc.setDrawColor(0, 160, 160); doc.setLineWidth(2);
  doc.line(M, y, W - M, y); y += 26;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 127, 127);
  doc.text(titulo, M, y); y += 26;

  // Datos
  doc.setTextColor(40, 40, 40);
  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), M, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.text(value, M + 130, y);
    y += 20;
  };
  row("Cliente", input.client || "—");
  row("Equipo", `${input.asset.name}${input.asset.plate ? ` (${input.asset.plate})` : ""}`);
  if (input.startDate || input.endDate) row("Periodo", `${input.startDate ?? "—"}  a  ${input.endDate ?? "—"}`);
  if (input.quantity != null) row("Cantidad", `${input.quantity} ${input.unitLabel}`);
  row("Tarifa", `${fmtPEN(input.rate)} / ${input.unitLabel.replace(/s$/, "")}`);
  y += 6;

  // Total destacado
  doc.setFillColor(235, 248, 248); doc.roundedRect(M, y, W - M * 2, 46, 6, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(0, 127, 127);
  doc.text(input.mode === "contrato" ? "TOTAL DEL ALQUILER" : "TOTAL COTIZADO", M + 16, y + 20);
  doc.setFontSize(20); doc.setTextColor(0, 140, 140);
  doc.text(fmtPEN(input.amount), W - M - 16, y + 30, { align: "right" });
  y += 70;

  // Notas
  if (input.notes) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text("CONDICIONES / NOTAS", M, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(input.notes, W - M * 2);
    doc.text(lines, M, y); y += lines.length * 13 + 10;
  }

  // Cláusula breve + firmas (solo contrato)
  if (input.mode === "contrato") {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    const clausula = "El arrendatario recibe el equipo operativo y se compromete a devolverlo en las mismas condiciones, salvo desgaste normal. El combustible y operador corren por cuenta de quien se indique. El pago se realiza según lo pactado.";
    const cl = doc.splitTextToSize(clausula, W - M * 2);
    doc.text(cl, M, y); y += cl.length * 11 + 50;

    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.8);
    doc.line(M, y, M + 180, y); doc.line(W - M - 180, y, W - M, y); y += 14;
    doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    doc.text("EL ARRENDADOR", M, y); doc.text("EL ARRENDATARIO", W - M - 180, y);
  }

  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`${input.mode}-${safe(input.asset.name)}-${safe(input.client || "cliente")}.pdf`);
}
