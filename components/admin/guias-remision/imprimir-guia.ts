/**
 * «GRR SUNAT»: abre la guía en una hoja A4 lista para imprimir.
 *
 * 17-10 (auditoría de comprobantes p3): cada dato pasa por `escapeHtml` —antes
 * se pegaba crudo en una ventana del mismo origen y un nombre de cliente con
 * `<img onerror>` corría dentro del panel—; el remitente sale del membrete del
 * negocio (antes decía «Buleje» en todas); la unidad se lee «Kilogramo (KGM)»
 * y el peso de los ítems se rotula ESTIMADO, aparte del bruto pesado.
 */

import type { Membrete } from "@/lib/admin/membrete";
import { escapeHtml } from "@/lib/safe-html";
import { unidadConCodigo } from "./guia-unidades";
import { getPlaca, MOTIVO_ROTULO, type GuiaRemision } from "./tipos";

const e = (v: unknown) => escapeHtml(v == null ? "" : String(v));

export function printGuiaSunat(g: GuiaRemision, formatDate: (d: string) => string, membrete: Membrete | null = null) {
  const items = g.items ?? [];
  const pesoEstimado = items.reduce((sum, it) => sum + it.cantidad * (it.pesoUnitario || 0), 0);
  const rowsHtml = items
    .map((it, i) => {
      const pesoCell = it.pesoUnitario ? (it.cantidad * it.pesoUnitario).toFixed(1) : "-";
      return `<tr><td>${i + 1}</td><td>${e(it.descripcion)}</td><td>${e(unidadConCodigo(it.unidad))}</td><td class="right">${e(it.cantidad)}</td><td class="right">${pesoCell}</td></tr>`;
    })
    .join("");

  const fila = (label: string, value: unknown) =>
    value === undefined || value === null || value === "" ? "" : `<div class="row"><span class="row-label">${label}:</span><span class="row-value">${e(value)}</span></div>`;

  const html = [
    `<!DOCTYPE html><html><head><title>GRR ${e(g.numero)}</title><style>`,
    "@media print { @page { size: A4; margin: 15mm; } }",
    "body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 13px; }",
    "h1 { text-align: center; font-size: 18px; margin: 0; }",
    "h2 { text-align: center; font-size: 14px; color: #555; margin: 4px 0 20px; }",
    ".sep { border-top: 1px solid #333; margin: 12px 0; } .sep-double { border-top: 3px double #333; margin: 12px 0; }",
    ".section { margin: 8px 0; } .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; color: #555; margin-bottom: 4px; }",
    ".row { display: flex; margin: 3px 0; } .row-label { width: 160px; font-weight: 600; color: #333; } .row-value { flex: 1; }",
    "table { width: 100%; border-collapse: collapse; margin: 8px 0; }",
    "th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #333; }",
    "td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 12px; } td.right, th.right { text-align: right; }",
    ".firmas { margin-top: 60px; display: flex; justify-content: space-between; }",
    ".firma-box { text-align: center; width: 200px; } .firma-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11px; }",
    ".total-peso { text-align: right; font-weight: bold; font-size: 14px; margin-top: 8px; }",
    "</style></head><body>",
    '<div class="sep-double"></div>',
    "<h1>GUIA DE REMISION REMITENTE</h1>",
    `<h2>N. ${e(g.numero)}</h2>`,
    '<div class="sep-double"></div>',
    '<div class="section"><div class="section-title">Remitente</div>',
    fila("Nombre/Razon Social", membrete?.nombre || "Buleje"),
    fila("RUC", membrete?.ruc),
    fila("Direccion", g.puntoPartida),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section"><div class="section-title">Destinatario</div>',
    fila("Nombre/Razon Social", g.destinatarioNombre),
    fila("RUC/DNI", g.destinatarioRuc),
    fila("Direccion", g.destinatarioDireccion),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section"><div class="section-title">Transporte</div>',
    fila("Modalidad", g.transportistaRuc ? "Publico" : "Privado"),
    fila("Transportista", g.transportistaNombre),
    fila("RUC", g.transportistaRuc),
    // La placa se guarda como `vehiculoPlaca`; `transportistaPlaca` es el
    // nombre viejo. `getPlaca` lee las dos: una guía sin placa no sirve en un
    // control de carretera.
    fila("Placa", getPlaca(g)),
    fila("Conductor", g.conductorNombre),
    fila("DNI Conductor", g.conductorDni),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section">',
    fila("Punto de partida", g.puntoPartida),
    fila("Punto de llegada", g.puntoLlegada),
    fila("Fecha traslado", formatDate(g.fechaTraslado)),
    fila("Motivo", MOTIVO_ROTULO[g.motivoTraslado] ?? g.motivoTraslado),
    fila("Doc. Referencia", g.documentoRef),
    fila("Bultos", g.bultos),
    "</div>",
    '<div class="sep"></div>',
    "<table>",
    '<thead><tr><th>#</th><th>Descripcion</th><th>Unidad</th><th class="right">Cantidad</th><th class="right">Peso (kg)</th></tr></thead>',
    `<tbody>${rowsHtml}</tbody>`,
    "</table>",
    pesoEstimado > 0 ? `<div class="total-peso">Peso estimado (items): ${pesoEstimado.toFixed(1)} kg</div>` : "",
    g.pesoBruto ? `<div class="total-peso">Peso bruto: ${Number(g.pesoBruto).toFixed(3)} kg</div>` : "",
    '<div class="sep"></div>',
    '<div class="firmas">',
    '<div class="firma-box"><div class="firma-line">Firma remitente</div></div>',
    '<div class="firma-box"><div class="firma-line">Firma transportista</div></div>',
    "</div>",
    "</body></html>",
  ].join("\n");

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}
