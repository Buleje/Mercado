/**
 * El dibujo del recibo del adelanto (23-10, Brandon: «mejorá el diseño del pdf
 * de comprobante de adelanto, algo más elaborado»), sobre el membrete común
 * (`lib/documentos/membrete-pdf.ts`). Los textos y las reglas siguen en
 * `comprobante.ts`; acá sólo se acomodan en la hoja.
 *
 * A4 (por defecto): membrete › banda del monto con «Son: …» › quién entrega y
 * quién recibe › detalle › declaración › «Firmas y constancias» en cuatro
 * casillas iguales (quien entrega, quien recibe, huella, foto) con su fecha.
 * Media hoja (A5 apaisado, el de siempre en el mostrador): lo mismo en menos
 * alto, con las dos líneas de firma y la casilla de la huella entre ellas.
 * Los anexos (hoja firmada vieja, voucher) van en páginas aparte y el pie con
 * «Página X de Y» en todas.
 */

import {
  PALETA,
  altoDelPie,
  datosDelMembrete,
  dibujarMembrete,
  dibujarMembreteBreve,
  dibujarPies,
  fechaDelDocumento,
  formatoDeImagen,
  margenDelMembrete,
  recortar,
  tinte,
  type DatosMembrete,
  type Rgb,
} from "@/lib/documentos/membrete-pdf";
import { direccionDe } from "./direccion";
import {
  avisoMontoFirmado,
  casillaDeHuella,
  monedaEnLetras,
  montoConMoneda,
  montoEnLetras,
  rotuloDocumento,
  textoHuellaPasskey,
  textosDelComprobante,
  type DatosComprobante,
  type FirmaEnPapel,
  type HuellaEnPapel,
  type ImagenEnPapel,
} from "./comprobante";

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;

const MODALIDAD_LABEL: Record<string, string> = {
  CUENTA_CORRIENTE: "Cuenta corriente (se liquida con entregas)",
  ENTREGAS_PACTADAS: "Entregas pactadas",
  DESCUENTO_PLANILLA: "Descuento por planilla",
};

interface Hoja {
  doc: Pdf;
  W: number;
  H: number;
  M: number;
  mbr: DatosMembrete;
  d: DatosComprobante;
  recibido: boolean;
  negocio: string;
  documento: string | null;
}

const letra = (doc: Pdf, peso: "normal" | "bold", tam: number, c: Rgb) => {
  doc.setFont("helvetica", peso);
  doc.setFontSize(tam);
  doc.setTextColor(c[0], c[1], c[2]);
};
const relleno = (doc: Pdf, c: Rgb) => doc.setFillColor(c[0], c[1], c[2]);
const trazo = (doc: Pdf, c: Rgb, ancho: number) => {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setLineWidth(ancho);
};
/** Rótulo chico en mayúsculas con aire entre letras: «MONTO ENTREGADO», «DETALLE». */
const rotulo = (doc: Pdf, texto: string, x: number, y: number, c: Rgb, tam = 7.2) => {
  letra(doc, "bold", tam, c);
  doc.text(texto.toLocaleUpperCase("es-PE"), x, y, { charSpace: 0.35 });
};
/** «miércoles 07/10/2026 · 21:14» → «07/10/2026 · 21:14» (entra en la casilla). */
const sinDia = (fechaHora: string) => fechaHora.replace(/^\p{L}+\s/u, "");
const LINEA_FIRMA: Rgb = [156, 163, 175];

function relacionDe(doc: Pdf, img: ImagenEnPapel): number {
  if (img.relacion && img.relacion > 0) return img.relacion;
  const p = doc.getImageProperties(img.imagen);
  return p.height > 0 ? p.width / p.height : 1;
}

/** La imagen dentro de un rectángulo, sin deformar y centrada. */
function encajar(doc: Pdf, img: ImagenEnPapel, x: number, y: number, ancho: number, alto: number): void {
  const r = relacionDe(doc, img);
  const w = Math.min(ancho, alto * r);
  const h = w / r;
  doc.addImage(img.imagen, formatoDeImagen(img.imagen), x + (ancho - w) / 2, y + (alto - h) / 2, w, h);
}

/** El pie de una casilla: líneas centradas, la 1.ª en negrita. */
function leyenda(doc: Pdf, lineas: (string | null | undefined)[], centro: number, y: number, ancho: number): void {
  let yy = y;
  for (const [i, l] of lineas.filter((x): x is string => !!x).entries()) {
    letra(doc, i === 0 ? "bold" : "normal", i === 0 ? 7.5 : 7, i === 0 ? PALETA.tinta : i === 1 ? PALETA.secundario : PALETA.terciario);
    doc.text(recortar(doc, l, ancho), centro, yy, { align: "center" });
    yy += 3.3;
  }
}

/** Quién firma y con qué datos debajo: la persona (con su DNI, tapado en la copia) o el negocio (con su RUC). */
function firmante(h: Hoja, esPersona: boolean): { nombre: string; documento: string | null; firmo: string | null } {
  if (!esPersona) return { nombre: h.negocio, documento: h.mbr.datos.find((x) => x.startsWith("RUC ")) ?? null, firmo: null };
  const f: FirmaEnPapel | undefined = h.d.firma;
  if (f) return { nombre: f.nombre, documento: rotuloDocumento(f.documento, !!h.d.taparDocumento), firmo: `Firmó el ${sinDia(f.fechaHora)}` };
  return { nombre: h.d.persona, documento: h.documento ? rotuloDocumento(h.d.documento ?? "", !!h.d.taparDocumento) : null, firmo: null };
}

const rotuloHuella = (huella?: HuellaEnPapel) => (huella?.passkey ? "Confirmación (passkey)" : huella?.metodo ? `Huella (${huella.metodo})` : "Huella");

/** Lo de adentro de la casilla de la huella: la foto, el texto de la passkey, o la guía punteada para entintar. */
function dentroDeHuella(doc: Pdf, x: number, y: number, ancho: number, alto: number, huella?: HuellaEnPapel): void {
  if (huella?.passkey) {
    letra(doc, "normal", 7, PALETA.secundario);
    const lineas = doc.splitTextToSize(textoHuellaPasskey(huella.confirmadaEn), ancho - 5) as string[];
    doc.text(lineas, x + ancho / 2, y + (alto - lineas.length * 3) / 2 + 2.3, { align: "center" });
  } else if (huella) {
    encajar(doc, huella, x + 1.5, y + 1.5, ancho - 3, alto - 3);
  } else {
    // El tamaño de un dedo entintado (ADR-491), punteado: dónde va el dedo de quien no sabe firmar.
    trazo(doc, PALETA.regla, 0.25);
    doc.setLineDashPattern([1, 1], 0);
    doc.roundedRect(x + (ancho - 22) / 2, y + (alto - 28) / 2, 22, 28, 2, 2, "S");
    doc.setLineDashPattern([], 0);
  }
}

// ── A4 ──

function bandaDelMonto(h: Hoja, y: number, compacta: boolean): number {
  const { doc, M, W, d } = h;
  const CW = W - 2 * M;
  const k = compacta ? { alto: 20, x: 5, monto: 17, son: 8, yRot: 5.5, yMonto: 12.6, ySon: 17.2 } : { alto: 28, x: 7, monto: 24, son: 9.5, yRot: 7.5, yMonto: 17.8, ySon: 23.8 };
  letra(doc, "normal", k.son, PALETA.secundario);
  const son = (doc.splitTextToSize(`Son: ${montoEnLetras(d.monto)} ${monedaEnLetras(d.moneda)}`, CW * 0.58) as string[]).slice(0, compacta ? 1 : 2);
  const alto = k.alto + (son.length - 1) * 4.2;
  relleno(doc, tinte(h.mbr.acento, 0.93));
  doc.roundedRect(M, y, CW, alto, 2.5, 2.5, "F");
  rotulo(doc, h.recibido ? "Monto recibido" : "Monto entregado", M + k.x, y + k.yRot, h.mbr.acento, compacta ? 6.8 : 7.2);
  letra(doc, "bold", k.monto, PALETA.tinta);
  doc.text(montoConMoneda(d.monto, d.moneda), M + k.x, y + k.yMonto);
  letra(doc, "normal", k.son, PALETA.secundario);
  doc.text(son, M + k.x, y + k.ySon);

  // A la derecha: la fecha del adelanto y la modalidad (o cuándo vence).
  const xr = M + CW - k.x;
  const anchoDer = CW * 0.36;
  // «Cuenta corriente (se liquida con entregas)» no entra en negrita: la aclaración va debajo, chica.
  const [modalidad, aclaracion] = (MODALIDAD_LABEL[d.modalidad] ?? d.modalidad).split(/\s*\((.+)\)$/);
  const pares: [string, string, string | undefined][] = [
    ["Fecha del adelanto", fechaDelDocumento(d.fecha) ?? "—", undefined],
    ["Modalidad", modalidad, compacta ? undefined : aclaracion],
  ];
  let yr = y + (compacta ? 5.5 : 7.5);
  for (const [etiqueta, valor, debajo] of pares) {
    letra(doc, "normal", compacta ? 6.8 : 7.5, PALETA.terciario);
    doc.text(etiqueta, xr, yr, { align: "right" });
    letra(doc, "bold", compacta ? 8.5 : 9.5, PALETA.tinta);
    doc.text(recortar(doc, valor, anchoDer), xr, yr + (compacta ? 3.8 : 4.6), { align: "right" });
    if (debajo) {
      letra(doc, "normal", 7, PALETA.terciario);
      doc.text(recortar(doc, debajo, anchoDer), xr, yr + 8, { align: "right" });
    }
    yr += compacta ? 8 : 10;
  }
  return y + alto;
}

function tarjetaDeParte(doc: Pdf, x: number, y: number, ancho: number, cual: string, nombre: string, sub: string | null): void {
  trazo(doc, PALETA.regla, 0.3);
  doc.roundedRect(x, y, ancho, 21, 2, 2, "S");
  rotulo(doc, cual, x + 5, y + 6.5, PALETA.terciario);
  letra(doc, "bold", 11, PALETA.tinta);
  doc.text(recortar(doc, nombre, ancho - 10), x + 5, y + 12.8);
  if (sub) {
    letra(doc, "normal", 8.5, PALETA.secundario);
    doc.text(recortar(doc, sub, ancho - 10), x + 5, y + 17.6);
  }
}

/** Filas del detalle: sólo lo que el adelanto tiene. */
function filasDelDetalle(h: Hoja): [string, string][] {
  const { d } = h;
  const t = textosDelComprobante({ ...d, negocio: h.negocio });
  const filas: [string, string | null | false][] = [
    ["Por", t.concepto],
    ["Vence", fechaDelDocumento(d.vence)],
    ["Pies tablares pactados", d.piesTablares ? `${d.piesTablares.toLocaleString("es-PE", { maximumFractionDigits: 2 })} PT` : null],
    ["Ya liquidado", (d.liquidado ?? 0) > 0 ? montoConMoneda(d.liquidado ?? 0, d.moneda) : null],
    ["Saldo pendiente", (d.liquidado ?? 0) > 0 && d.saldo != null ? montoConMoneda(d.saldo, d.moneda) : null],
    ["Concepto", d.notas?.trim() || null],
  ];
  return filas.filter((f): f is [string, string] => !!f[1]);
}

function detalle(h: Hoja, y0: number): number {
  const { doc, M, W, d } = h;
  const CW = W - 2 * M;
  const filas = filasDelDetalle(h);
  const pactadas = d.entregasPactadas ?? [];
  if (!filas.length && !pactadas.length) return y0;
  let y = y0;
  if (filas.length) {
    rotulo(doc, "Detalle", M, y, PALETA.terciario);
    y += 2.5;
    trazo(doc, PALETA.regla, 0.2);
    doc.line(M, y, M + CW, y);
    for (const [etiqueta, valor] of filas) {
      letra(doc, "normal", 9.5, PALETA.tinta);
      const lineas = (doc.splitTextToSize(valor, CW - 58) as string[]).slice(0, 4);
      const alto = 4.4 + lineas.length * 4.3;
      letra(doc, "normal", 8.5, PALETA.secundario);
      doc.text(etiqueta, M + 1, y + 5.6);
      letra(doc, "normal", 9.5, PALETA.tinta);
      doc.text(lineas, M + 56, y + 5.6);
      trazo(doc, PALETA.regla, 0.2);
      doc.line(M, y + alto, M + CW, y + alto);
      y += alto;
    }
    y += 7;
  }
  if (pactadas.length) {
    rotulo(doc, "Entregas pactadas", M, y, PALETA.terciario);
    y += 2.5;
    const col = { n: M + 2, que: M + 14, valor: M + CW - 38, fecha: M + CW - 2 };
    relleno(doc, PALETA.fondo);
    doc.rect(M, y, CW, 6.5, "F");
    letra(doc, "bold", 7.5, PALETA.secundario);
    doc.text("N.°", col.n, y + 4.4);
    doc.text("Qué se entrega", col.que, y + 4.4);
    doc.text("Valor", col.valor, y + 4.4, { align: "right" });
    doc.text("Fecha", col.fecha, y + 4.4, { align: "right" });
    y += 6.5;
    for (const p of pactadas.slice(0, 8)) {
      letra(doc, "normal", 8.5, PALETA.tinta);
      doc.text(String(p.numero), col.n, y + 4.6);
      doc.text(recortar(doc, p.descripcion, col.valor - col.que - 26), col.que, y + 4.6);
      doc.text(montoConMoneda(p.valor, d.moneda), col.valor, y + 4.6, { align: "right" });
      doc.text(p.cumplida ? "Cumplida" : (fechaDelDocumento(p.fecha) ?? "—"), col.fecha, y + 4.6, { align: "right" });
      trazo(doc, PALETA.regla, 0.2);
      doc.line(M, y + 6.6, M + CW, y + 6.6);
      y += 6.6;
    }
    if (pactadas.length > 8) {
      letra(doc, "normal", 7.5, PALETA.terciario);
      doc.text(`y ${pactadas.length - 8} más`, col.que, y + 4.2);
      y += 5;
    }
    y += 7;
  }
  return y - 7;
}

function declaracion(h: Hoja, y: number, tam: number, ancho: number): number {
  const { doc, M } = h;
  const t = textosDelComprobante({ ...h.d, negocio: h.negocio });
  letra(doc, "normal", tam, PALETA.secundario);
  const lineas = doc.splitTextToSize(t.declaracion, ancho - 12) as string[];
  const alto = lineas.length * tam * 0.3528 * 1.35 + 5.6;
  relleno(doc, PALETA.fondo);
  doc.rect(M, y, ancho, alto, "F");
  relleno(doc, h.mbr.acento);
  doc.rect(M, y, 1.1, alto, "F");
  letra(doc, "normal", tam, PALETA.secundario);
  doc.text(lineas, M + 6, y + 3 + tam * 0.3528);
  return y + alto;
}

/** Las cuatro casillas iguales: quien entrega, quien recibe, la huella y la foto. `paginaFoto` = dónde va la foto entera. */
function firmasYConstancias(h: Hoja, y0: number, paginaFoto: number | null): void {
  const { doc, M, W, d } = h;
  const CW = W - 2 * M;
  rotulo(doc, "Firmas y constancias", M, y0, PALETA.terciario);
  const y = y0 + 3;
  const gap = 4;
  const w = (CW - 3 * gap) / 4;
  const alto = 34;
  const x = (i: number) => M + i * (w + gap);
  const marco = (i: number) => {
    trazo(doc, PALETA.regla, 0.3);
    doc.roundedRect(x(i), y, w, alto, 1.6, 1.6, "S");
  };
  const yLeyenda = y + alto + 4.2;

  // 0 = el negocio, 1 = la persona: la persona y sus constancias quedan juntas.
  for (const i of [0, 1]) {
    const esPersona = i === 1;
    marco(i);
    trazo(doc, LINEA_FIRMA, 0.3);
    doc.line(x(i) + 4, y + alto - 7, x(i) + w - 4, y + alto - 7);
    if (esPersona && d.firma) encajar(doc, d.firma, x(i) + 3, y + 2.5, w - 6, alto - 10.5);
    const quien = firmante(h, esPersona);
    const rol = esPersona === h.recibido ? "Entregó" : "Recibí conforme";
    leyenda(doc, [rol, quien.nombre, quien.documento, quien.firmo], x(i) + w / 2, yLeyenda, w);
  }

  marco(2);
  dentroDeHuella(doc, x(2), y, w, alto, d.huella);
  const debajoHuella = d.huella?.passkey
    ? (doc.setFontSize(7), (doc.splitTextToSize(d.huella.llave ?? "", w) as string[]).slice(0, 2))
    : [d.huella?.fechaHora ? sinDia(d.huella.fechaHora) : null];
  leyenda(doc, [rotuloHuella(d.huella), ...debajoHuella], x(2) + w / 2, yLeyenda, w);

  marco(3);
  const foto = d.voucher ?? d.hojaFirmada;
  if (foto) encajar(doc, { imagen: foto }, x(3) + 1.5, y + 1.5, w - 3, alto - 3);
  else {
    letra(doc, "normal", 7.5, PALETA.terciario);
    doc.text("Sin foto", x(3) + w / 2, y + alto / 2 + 1, { align: "center" });
  }
  const tituloFoto = d.voucher ? "Foto del pago" : d.hojaFirmada ? "Hoja firmada" : "Foto";
  const cuando = d.voucher && d.voucherFechaHora ? sinDia(d.voucherFechaHora) : null;
  leyenda(doc, [tituloFoto, cuando, paginaFoto ? `Completa en la pág. ${paginaFoto}` : null], x(3) + w / 2, yLeyenda, w);
}

function cuerpoA4(h: Hoja, y0: number): void {
  const { doc, M, W, H, d, mbr } = h;
  const CW = W - 2 * M;
  let y = bandaDelMonto(h, y0, false) + 5;
  const aviso = avisoMontoFirmado(d);
  if (aviso) {
    letra(doc, "bold", 8.5, PALETA.tinta);
    doc.text(`Atención: ${aviso}`, M, y + 1.5);
    y += 7;
  }
  const wCard = (CW - 6) / 2;
  const persona = { nombre: d.persona, sub: h.documento ? rotuloDocumento(d.documento ?? "", !!d.taparDocumento) : null };
  const negocio = { nombre: h.negocio, sub: mbr.datos.find((x) => x.startsWith("RUC ")) ?? mbr.razonSocial };
  const [entrega, recibe] = h.recibido ? [persona, negocio] : [negocio, persona];
  tarjetaDeParte(doc, M, y, wCard, "Entrega", entrega.nombre, entrega.sub);
  tarjetaDeParte(doc, M + wCard + 6, y, wCard, "Recibe", recibe.nombre, recibe.sub);
  y = detalle(h, y + 21 + 8) + 7;
  y = declaracion(h, y, 8.5, CW) + 10;

  const altoBloque = 3 + 34 + 4.2 + 4 * 3.3;
  if (y + altoBloque > H - altoDelPie() - 2) {
    doc.addPage("a4", "portrait");
    y = dibujarMembreteBreve(doc, mbr, "Firmas y constancias");
  }
  const paginas = doc.getNumberOfPages();
  firmasYConstancias(h, y, d.voucher || d.hojaFirmada ? paginas + 1 : null);
}

// ── Media hoja (A5 apaisado) ──

function cuerpoMediaHoja(h: Hoja, y0: number): void {
  const { doc, M, W, H, d } = h;
  const CW = W - 2 * M;
  let y = bandaDelMonto(h, y0, true) + 3.5;
  const aviso = avisoMontoFirmado(d);
  if (aviso) {
    letra(doc, "bold", 7.5, PALETA.tinta);
    doc.text(`Atención: ${aviso}`, M, y + 2);
    y += 5;
  }
  const t = textosDelComprobante({ ...d, negocio: h.negocio });
  const docPersona = h.documento ? rotuloDocumento(d.documento ?? "", !!d.taparDocumento) : null;
  const izquierda: [string, string | null][] = [
    ["Entrega", h.recibido ? `${d.persona}${docPersona ? ` · ${docPersona}` : ""}` : h.negocio],
    ["Recibe", h.recibido ? h.negocio : `${d.persona}${docPersona ? ` · ${docPersona}` : ""}`],
    ["Por", t.concepto],
  ];
  const derecha: [string, string | null][] = [
    ["Vence", fechaDelDocumento(d.vence)],
    ["Saldo", (d.liquidado ?? 0) > 0 && d.saldo != null ? montoConMoneda(d.saldo, d.moneda) : null],
    ["Pies tablares", d.piesTablares ? `${d.piesTablares.toLocaleString("es-PE", { maximumFractionDigits: 2 })} PT` : null],
  ];
  const columna = (filas: [string, string | null][], x: number, ancho: number) => {
    let yy = y;
    for (const [etiqueta, valor] of filas) {
      if (!valor) continue;
      letra(doc, "normal", 7, PALETA.terciario);
      doc.text(etiqueta, x, yy + 3.6);
      letra(doc, "normal", 8.5, PALETA.tinta);
      doc.text(recortar(doc, valor, ancho - 20), x + 19, yy + 3.6);
      yy += 5;
    }
    return yy;
  };
  y = Math.max(columna(izquierda, M, CW * 0.6), columna(derecha, M + CW * 0.62, CW * 0.38)) + 0.5;
  if (d.notas?.trim()) {
    letra(doc, "normal", 7, PALETA.terciario);
    doc.text("Concepto", M, y + 3.6);
    letra(doc, "normal", 8.5, PALETA.tinta);
    const lineas = (doc.splitTextToSize(d.notas.trim(), CW - 19) as string[]).slice(0, 2);
    doc.text(lineas, M + 19, y + 3.6);
    y += 1.5 + lineas.length * 3.9;
  }
  declaracion(h, y + 2, 7.5, CW);

  // Las dos líneas de firma, con la casilla de la huella entre ellas (ADR-491: al lado de la persona).
  const yFirma = H - 30;
  trazo(doc, LINEA_FIRMA, 0.3);
  doc.line(16, yFirma, 76, yFirma);
  doc.line(W - 76, yFirma, W - 16, yFirma);
  const personaIzq = h.recibido;
  const centroPersona = personaIzq ? 46 : W - 46;
  if (d.firma) {
    const r = relacionDe(doc, d.firma);
    const alto = Math.min(16, 56 / Math.max(r, 0.1));
    doc.addImage(d.firma.imagen, formatoDeImagen(d.firma.imagen), centroPersona - (alto * r) / 2, yFirma - alto - 1, alto * r, alto);
  }
  for (const esPersona of [true, false]) {
    const centro = esPersona === personaIzq ? 46 : W - 46;
    const quien = firmante(h, esPersona);
    const rol = esPersona === h.recibido ? "Entregó" : "Recibí conforme";
    leyenda(doc, [rol, [quien.nombre, quien.documento].filter(Boolean).join(" · "), quien.firmo ? `${quien.firmo} (hora de Lima)` : null], centro, yFirma + 4, 64);
  }
  const c = casillaDeHuella(d.direccion, W, yFirma);
  trazo(doc, PALETA.regla, 0.3);
  doc.roundedRect(c.x, c.y, c.ancho, c.alto, 1.2, 1.2, "S");
  if (d.huella?.passkey || d.huella) dentroDeHuella(doc, c.x, c.y, c.ancho, c.alto, d.huella);
  const debajo = d.huella?.passkey ? d.huella.llave : d.huella?.fechaHora;
  leyenda(doc, [rotuloHuella(d.huella), debajo ? (d.huella?.passkey ? debajo : sinDia(debajo)) : null], c.x + c.ancho / 2, c.y + c.alto + 3.5, 44);
}

/** Una página aparte con una foto entera y sin deformar (la hoja firmada vieja o el voucher). */
function agregarHoja(h: Hoja, a4: boolean, imagen: string, titulo: string): void {
  const { doc, mbr } = h;
  doc.addPage(a4 ? "a4" : "a5", "portrait");
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margen = a4 ? margenDelMembrete() : 10;
  const y = dibujarMembreteBreve(doc, mbr, titulo, { compacto: !a4 });
  encajar(doc, { imagen }, margen, y, W - 2 * margen, H - y - altoDelPie({ compacto: !a4 }) - 4);
}

/** Dibuja el recibo entero en `doc` (A4 vertical o A5 apaisado, según cómo se creó). */
export function dibujarComprobante(doc: Pdf, d: DatosComprobante): void {
  const a4 = d.formato !== "media-hoja";
  const negocio = d.negocio?.trim() || d.membrete?.nombre?.trim() || "—";
  const t = textosDelComprobante({ ...d, negocio });
  // El pie de comprobantes del negocio («Gracias por su compra») es de la venta, no de un adelanto.
  const mbr = datosDelMembrete(
    { ...d.membrete, nombre: d.membrete?.nombre ?? d.negocio ?? null, pie: null },
    { tipo: t.titulo, codigo: d.codigoOperacion ?? "Sin código", fecha: fechaDelDocumento(d.fecha), extra: d.reciboManual ? `Recibo manual N.° ${d.reciboManual}` : null },
  );
  doc.setProperties({ title: `${t.titulo} ${d.codigoOperacion ?? ""}`.trim(), author: mbr.titulo, subject: d.persona });
  const h: Hoja = {
    doc,
    W: doc.internal.pageSize.getWidth(),
    H: doc.internal.pageSize.getHeight(),
    M: margenDelMembrete({ compacto: !a4 }),
    mbr,
    d,
    recibido: direccionDe(d.direccion) === "RECIBIDO",
    negocio,
    documento: d.documento?.trim() || null,
  };
  const y0 = dibujarMembrete(doc, mbr, { compacto: !a4 });
  if (a4) cuerpoA4(h, y0);
  else cuerpoMediaHoja(h, y0);
  if (d.hojaFirmada) agregarHoja(h, a4, d.hojaFirmada, "Recibo firmado guardado en el adelanto");
  if (d.voucher) agregarHoja(h, a4, d.voucher, d.voucherFechaHora ? `Comprobante de pago · foto del ${d.voucherFechaHora} (hora de Lima)` : "Comprobante de pago");
  dibujarPies(doc, mbr, { compacto: !a4 });
}
