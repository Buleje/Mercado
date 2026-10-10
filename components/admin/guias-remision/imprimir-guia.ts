/** «GRR SUNAT»: abre la guía en una hoja A4 lista para imprimir. */

import { getPlaca, type GuiaRemision } from "./tipos";

export function printGuiaSunat(g: GuiaRemision, formatDate: (d: string) => string) {
  const items = g.items ?? [];
  const pesoTotal = items.reduce((sum, it) => sum + (it.cantidad * (it.pesoUnitario || 0)), 0);
  const rowsHtml = items.map((it, i) => {
    const pesoCell = it.pesoUnitario ? (it.cantidad * it.pesoUnitario).toFixed(1) : "-";
    return "<tr><td>" + (i + 1) + "</td><td>" + it.descripcion + "</td><td>" + it.unidad + '</td><td class="right">' + it.cantidad + '</td><td class="right">' + pesoCell + "</td></tr>";
  }).join("");

  const conditionalRow = (condition: unknown, label: string, value: string) =>
    condition ? '<div class="row"><span class="row-label">' + label + ':</span><span class="row-value">' + value + "</span></div>" : "";

  const html = [
    '<!DOCTYPE html><html><head><title>GRR ' + g.numero + "</title><style>",
    "@media print { @page { size: A4; margin: 15mm; } }",
    "body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 13px; }",
    "h1 { text-align: center; font-size: 18px; margin: 0; }",
    "h2 { text-align: center; font-size: 14px; color: #555; margin: 4px 0 20px; }",
    '.sep { border-top: 1px solid #333; margin: 12px 0; } .sep-double { border-top: 3px double #333; margin: 12px 0; }',
    ".section { margin: 8px 0; } .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; color: #555; margin-bottom: 4px; }",
    ".row { display: flex; margin: 3px 0; } .row-label { width: 160px; font-weight: 600; color: #333; } .row-value { flex: 1; }",
    "table { width: 100%; border-collapse: collapse; margin: 8px 0; }",
    'th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #333; }',
    "td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: 12px; } td.right, th.right { text-align: right; }",
    ".firmas { margin-top: 60px; display: flex; justify-content: space-between; }",
    '.firma-box { text-align: center; width: 200px; } .firma-line { border-top: 1px solid #000; padding-top: 5px; font-size: 11px; }',
    ".total-peso { text-align: right; font-weight: bold; font-size: 14px; margin-top: 8px; }",
    "</style></head><body>",
    '<div class="sep-double"></div>',
    "<h1>GUIA DE REMISION REMITENTE</h1>",
    "<h2>N. " + g.numero + "</h2>",
    '<div class="sep-double"></div>',
    '<div class="section"><div class="section-title">Remitente</div>',
    '<div class="row"><span class="row-label">Nombre/Razon Social:</span><span class="row-value">Buleje</span></div>',
    '<div class="row"><span class="row-label">Direccion:</span><span class="row-value">' + g.puntoPartida + "</span></div></div>",
    '<div class="sep"></div>',
    '<div class="section"><div class="section-title">Destinatario</div>',
    '<div class="row"><span class="row-label">Nombre/Razon Social:</span><span class="row-value">' + g.destinatarioNombre + "</span></div>",
    conditionalRow(g.destinatarioRuc, "RUC/DNI", g.destinatarioRuc || ""),
    conditionalRow(g.destinatarioDireccion, "Direccion", g.destinatarioDireccion || ""),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section"><div class="section-title">Transporte</div>',
    conditionalRow(g.transportistaNombre, "Transportista", g.transportistaNombre || ""),
    conditionalRow(g.transportistaRuc, "RUC", g.transportistaRuc || ""),
    // La placa se guarda como `vehiculoPlaca`; `transportistaPlaca` es el
    // nombre viejo. Preguntando sólo por el viejo, la guía impresa salía SIN
    // placa — y una guía de remisión sin placa del vehículo no sirve en un
    // control de carretera. `placaDe` ya sabe leer las dos.
    conditionalRow(getPlaca(g), "Placa", getPlaca(g)),
    conditionalRow(g.conductorNombre, "Conductor", g.conductorNombre || ""),
    conditionalRow(g.conductorDni, "DNI Conductor", g.conductorDni || ""),
    "</div>",
    '<div class="sep"></div>',
    '<div class="section">',
    '<div class="row"><span class="row-label">Punto de partida:</span><span class="row-value">' + g.puntoPartida + "</span></div>",
    '<div class="row"><span class="row-label">Punto de llegada:</span><span class="row-value">' + g.puntoLlegada + "</span></div>",
    '<div class="row"><span class="row-label">Fecha traslado:</span><span class="row-value">' + formatDate(g.fechaTraslado) + "</span></div>",
    '<div class="row"><span class="row-label">Motivo:</span><span class="row-value">' + g.motivoTraslado + "</span></div>",
    conditionalRow(g.documentoRef, "Doc. Referencia", g.documentoRef || ""),
    conditionalRow(g.bultos, "Bultos", String(g.bultos ?? "")),
    "</div>",
    '<div class="sep"></div>',
    "<table>",
    '<thead><tr><th>#</th><th>Descripcion</th><th>Unidad</th><th class="right">Cantidad</th><th class="right">Peso (kg)</th></tr></thead>',
    "<tbody>" + rowsHtml + "</tbody>",
    "</table>",
    '<div class="total-peso">Peso total: ' + (pesoTotal > 0 ? pesoTotal.toFixed(1) + " kg" : "N/A") + "</div>",
    g.pesoBruto ? '<div class="total-peso">Peso bruto: ' + Number(g.pesoBruto).toFixed(3) + " kg</div>" : "",
    '<div class="sep"></div>',
    '<div class="firmas">',
    '<div class="firma-box"><div class="firma-line">Firma remitente</div></div>',
    '<div class="firma-box"><div class="firma-line">Firma transportista</div></div>',
    "</div>",
    "</body></html>",
  ].join("\n");

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}
