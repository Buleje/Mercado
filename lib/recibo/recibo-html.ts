/**
 * lib/recibo/recibo-html.ts — dibuja el `ModeloRecibo` como una hoja HTML
 * completa (ticket 80 mm, ticket 58 mm o A4). La MISMA cadena se muestra en la
 * vista previa del modal (iframe `srcdoc`) y se imprime (iframe oculto +
 * `print()`): lo que se ve es lo que sale.
 *
 * Estilo del ticket clásico: letra monoespaciada, encabezado centrado, N° y
 * fecha en una fila, líneas «2x Producto à 4.50 ····· 9.00», guiones y el
 * TOTAL grande. El A4 sigue el mismo orden en página completa, con el recuadro
 * de RUC / tipo / número que usan los comprobantes peruanos.
 *
 * Es papel: negro sobre blanco con nombres de color CSS (no son tokens del panel).
 */

import type { FormatoRecibo, ModeloRecibo } from "./modelo-recibo";

/** Ancho de la hoja en px CSS (96 ppp): la vista previa escala desde acá. */
export const ANCHO_PX: Record<FormatoRecibo, number> = { ticket80: 302, ticket58: 219, a4: 794 };

const esc = (s: string | number | null | undefined): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** «1,234.50» — sin símbolo, para las columnas. */
const num = (n: number): string =>
  new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const sol = (n: number): string => `S/ ${num(n)}`;
const cant = (n: number): string => (Number.isInteger(n) ? String(n) : num(n));

const urlSegura = (u: string | null): string | null =>
  u && /^(https?:\/\/|\/|data:image\/)/i.test(u) ? u : null;

const fila = (izq: string, der: string, clase = ""): string =>
  `<div class="fila ${clase}"><span>${izq}</span><span class="der">${der}</span></div>`;

const CSS_BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:white;color:black}
body{font-family:"Courier New",Courier,"Liberation Mono","Nimbus Mono PS",monospace;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.c{text-align:center}.neg{font-weight:700}.der{text-align:right;white-space:nowrap}
.fila{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.sep{border-top:1px dashed black;margin:6px 0}
.chico{font-size:.86em}.gris{color:dimgray}.sin-corte{white-space:nowrap}
.caja{border:1px solid black;padding:4px 6px;margin:6px 0;text-align:center}
.total{font-size:1.5em;font-weight:700}
.qr{display:block;margin:6px auto;width:30mm;height:30mm}
.leyenda{margin-top:4px}
`;

function encabezadoTicket(m: ModeloRecibo): string {
  const n = m.negocio;
  const nombre = n.nombre ?? n.razonSocial ?? "";
  const partes = [
    nombre ? `<div class="nombre">${esc(nombre)}</div>` : "",
    n.razonSocial && n.razonSocial !== nombre ? `<div class="chico">${esc(n.razonSocial)}</div>` : "",
    n.ruc ? `<div>RUC ${esc(n.ruc)}</div>` : "",
    n.direccion ? `<div>${esc(n.direccion)}</div>` : "",
    n.telefono ? `<div>Tel. ${esc(n.telefono)}</div>` : "",
  ];
  return `<header class="c">${partes.join("")}</header>`;
}

function datosDeVenta(m: ModeloRecibo): string {
  const out: string[] = [];
  out.push(`<div class="c neg titulo">${esc(m.titulo)}</div>`);
  out.push(fila(`N° ${esc(m.numero)}`, `${esc(m.fecha)} ${esc(m.hora)}`, "numfecha"));
  if (m.validoHasta) out.push(fila("Válida hasta:", esc(m.validoHasta)));
  if (m.atendio) out.push(fila("Atendió:", esc(m.atendio)));
  const c = m.cliente;
  if (c) {
    const etiquetaNombre = m.tipo === "factura" ? "Señor(es):" : "Cliente:";
    if (c.nombre) out.push(fila(etiquetaNombre, esc(c.nombre)));
    if (c.documento) out.push(fila(`${c.etiquetaDoc ?? "Doc."}:`, esc(c.documento)));
    if (c.telefono && !c.nombre) out.push(fila("Cliente:", esc(c.telefono)));
  } else if (m.tipo === "factura") {
    out.push(fila("Señor(es):", "—"));
  }
  return out.join("");
}

function lineasTicket(m: ModeloRecibo): string {
  return m.lineas
    .map((l) =>
      fila(
        `${esc(cant(l.cantidad))}x ${esc(l.nombre)} <span class="gris sin-corte">à ${esc(num(l.precio))}</span>`,
        esc(num(l.importe)),
        "linea",
      ),
    )
    .join("");
}

/** Subtotal, descuento, desglose del IGV según el tipo y el TOTAL. */
function totales(m: ModeloRecibo): string {
  const t = m.totales;
  const out: string[] = [];
  if (t.subtotal != null) out.push(fila("Subtotal", sol(t.subtotal)));
  if (t.descuento != null) out.push(fila("Descuento", `- ${sol(t.descuento)}`));
  if (m.esElectronico) {
    if (m.tipo === "factura") out.push(fila("Valor de venta", sol(t.gravada + t.exonerada + t.inafecta)));
    out.push(fila("Op. gravada", sol(t.gravada)));
    if (t.exonerada > 0) out.push(fila("Op. exonerada", sol(t.exonerada)));
    if (t.inafecta > 0) out.push(fila("Op. inafecta", sol(t.inafecta)));
    out.push(fila(`IGV ${t.tasaIgvPct} %`, sol(t.igv)));
  }
  out.push(fila(m.esElectronico ? "IMPORTE TOTAL" : "TOTAL", sol(t.total), "total"));
  if (!m.esElectronico) out.push(`<div class="der chico gris">IGV incluido: ${esc(sol(t.igv))}</div>`);
  if (m.tipo !== "ticket") out.push(`<div class="chico leyenda">SON: ${esc(t.enLetras)}</div>`);
  return out.join("");
}

function pago(m: ModeloRecibo): string {
  if (m.tipo === "cotizacion" || m.tipo === "proforma") return "";
  const p = m.pago;
  const out: string[] = [];
  if (p.detalle.length > 1) {
    out.push(fila("Pagado con:", esc(p.metodo)));
    for (const d of p.detalle) out.push(fila(`  ${esc(d.metodo)}`, sol(d.monto), "chico"));
  } else {
    out.push(fila("Pagado con:", esc(p.metodo)));
  }
  if (p.recibido != null) out.push(fila("Recibido", sol(p.recibido)));
  if (p.vuelto != null) out.push(fila("Vuelto", sol(p.vuelto)));
  return out.join("");
}

/** Hash + QR sólo si se emitió; si no, el aviso de pendiente. Más las leyendas del tipo. */
function cierreLegal(m: ModeloRecibo): string {
  const out: string[] = [];
  if (m.pendienteDeEmision) out.push(`<div class="caja neg">PENDIENTE DE EMISIÓN</div>`);
  if (m.emision) {
    const qr = urlSegura(m.emision.qrDataUrl ?? null);
    if (qr) out.push(`<img class="qr" src="${esc(qr)}" alt="Código QR del comprobante">`);
    out.push(`<div class="c chico">Hash: ${esc(m.emision.hash)}</div>`);
  }
  for (const l of m.leyendas) out.push(`<div class="c chico leyenda">${esc(l)}</div>`);
  if (m.emision?.consultaUrl) out.push(`<div class="c chico leyenda">Consúltala en: ${esc(m.emision.consultaUrl)}</div>`);
  return out.join("");
}

/** El cierre: el texto del negocio y, en el ticket, el correo (la cabecera ya lleva nombre, RUC y teléfono). */
function pie(m: ModeloRecibo, conCorreo: boolean): string {
  const n = m.negocio;
  return `<footer class="c">
    <div class="neg">${esc(n.pie ?? "¡Gracias por tu compra!")}</div>
    ${conCorreo && n.correo ? `<div class="chico">${esc(n.correo)}</div>` : ""}
  </footer>`;
}

function hojaTicket(m: ModeloRecibo, formato: "ticket80" | "ticket58"): string {
  const ancho = formato === "ticket80" ? 80 : 58;
  const relleno = formato === "ticket80" ? "4mm" : "5mm";
  const css = `${CSS_BASE}
@page{size:${ancho}mm auto;margin:0}
.hoja{width:${ancho}mm;padding:4mm ${relleno} 6mm;font-size:${formato === "ticket80" ? 12 : 10}px;line-height:1.35}
.nombre{font-size:1.3em;font-weight:700;margin-bottom:2px}
.titulo{margin:4px 0 2px}
.linea>span:first-child{flex:1;min-width:0;overflow-wrap:anywhere}
.numfecha{flex-wrap:wrap;column-gap:8px;row-gap:0}.numfecha>span{white-space:nowrap}.numfecha>span:last-child{margin-left:auto}`;
  const cuerpo = [
    m.provisional ? `<div class="caja chico">Venta sin conexión: montos por confirmar</div>` : "",
    encabezadoTicket(m),
    `<div class="sep"></div>`,
    datosDeVenta(m),
    `<div class="sep"></div>`,
    lineasTicket(m),
    `<div class="sep"></div>`,
    totales(m),
    pago(m) ? `<div class="sep"></div>${pago(m)}` : "",
    `<div class="sep"></div>`,
    cierreLegal(m),
    pie(m, true),
  ].join("");
  return documento(m, css, `<main class="hoja">${cuerpo}</main>`);
}

function hojaA4(m: ModeloRecibo): string {
  const n = m.negocio;
  const logo = urlSegura(n.logoUrl);
  const nombre = n.nombre ?? n.razonSocial ?? "";
  const conValor = m.tipo === "factura";
  const css = `${CSS_BASE}
@page{size:A4;margin:0}
.hoja{width:210mm;padding:14mm 14mm 16mm;font-size:12px;line-height:1.4}
@media screen{.hoja{min-height:297mm}}
.cab{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm}
.emisor{display:flex;gap:4mm;align-items:flex-start;min-width:0}
.logo{max-width:30mm;max-height:22mm;object-fit:contain}
.nombre{font-size:1.6em;font-weight:700}
.recuadro{border:1.5px solid black;padding:4mm 6mm;text-align:center;min-width:64mm}
.recuadro .tipo{font-weight:700;font-size:1.15em;margin:2mm 0}
.datos{display:grid;grid-template-columns:1fr 1fr;gap:1mm 8mm;border:1px solid black;padding:3mm 4mm;margin:6mm 0 4mm}
.datos .fila{justify-content:flex-start}
.datos .fila .der{text-align:left;white-space:normal}
table{width:100%;border-collapse:collapse;margin-top:2mm}
th{border-top:1px solid black;border-bottom:1px solid black;padding:1.5mm 2mm;text-align:left;font-weight:700}
td{padding:1.2mm 2mm;border-bottom:1px dashed silver;vertical-align:top}
.num{text-align:right;white-space:nowrap}
.bloque-tot{display:flex;justify-content:space-between;gap:10mm;margin-top:5mm}
.tot{width:80mm;margin-left:auto}
.tot .fila{padding:.6mm 0}
.izq{flex:1;min-width:0}
footer{margin-top:10mm;border-top:1px dashed black;padding-top:3mm}`;

  const cab = `<div class="cab">
    <div class="emisor">
      ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ""}
      <div>
        ${nombre ? `<div class="nombre">${esc(nombre)}</div>` : ""}
        ${n.razonSocial && n.razonSocial !== nombre ? `<div>${esc(n.razonSocial)}</div>` : ""}
        ${n.direccion ? `<div>${esc(n.direccion)}</div>` : ""}
        ${[n.telefono ? `Tel. ${n.telefono}` : null, n.correo].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join("")}
      </div>
    </div>
    <div class="recuadro">
      ${n.ruc ? `<div>R.U.C. ${esc(n.ruc)}</div>` : ""}
      <div class="tipo">${esc(m.titulo)}</div>
      <div class="neg">${esc(m.numero)}</div>
    </div>
  </div>`;

  const c = m.cliente;
  const datos = [
    fila("Fecha de emisión:", `${esc(m.fecha)} ${esc(m.hora)}`),
    m.validoHasta ? fila("Válida hasta:", esc(m.validoHasta)) : "",
    fila(m.tipo === "factura" ? "Señor(es):" : "Cliente:", esc(c?.nombre ?? c?.telefono ?? "—")),
    c?.documento ? fila(`${c.etiquetaDoc ?? "Doc."}:`, esc(c.documento)) : "",
    m.atendio ? fila("Atendió:", esc(m.atendio)) : "",
    m.tipo !== "cotizacion" && m.tipo !== "proforma" ? fila("Pago:", esc(m.pago.metodo)) : "",
    fila("Moneda:", "Soles (PEN)"),
  ].join("");

  const filas = m.lineas
    .map(
      (l) => `<tr><td class="num">${esc(cant(l.cantidad))}</td><td>${esc(l.unidad ?? "UND")}</td><td>${esc(l.nombre)}</td>${
        conValor ? `<td class="num">${esc(num(l.valorUnitario))}</td>` : ""
      }<td class="num">${esc(num(l.precio))}</td><td class="num">${esc(num(l.importe))}</td></tr>`,
    )
    .join("");
  const tabla = `<table><thead><tr><th class="num">Cant.</th><th>Unid.</th><th>Descripción</th>${
    conValor ? `<th class="num">V. unit.</th>` : ""
  }<th class="num">P. unit.</th><th class="num">Importe</th></tr></thead><tbody>${filas}</tbody></table>`;

  const pagoTxt = pago(m);
  const cuerpo = [
    m.provisional ? `<div class="caja">Venta sin conexión: montos por confirmar</div>` : "",
    cab,
    `<div class="datos">${datos}</div>`,
    tabla,
    `<div class="bloque-tot"><div class="izq">${pagoTxt}${cierreLegal(m)}</div><div class="tot">${totales(m)}</div></div>`,
    pie(m, false),
  ].join("");
  return documento(m, css, `<main class="hoja">${cuerpo}</main>`);
}

function documento(m: ModeloRecibo, css: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(`${m.nombreCorto} ${m.numero}`)}</title><style>${css}</style></head><body>${cuerpo}</body></html>`;
}

/** La hoja completa del recibo en el formato pedido. */
export function reciboHtml(m: ModeloRecibo, formato: FormatoRecibo): string {
  return formato === "a4" ? hojaA4(m) : hojaTicket(m, formato);
}
