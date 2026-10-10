/**
 * lib/rrhh/fotocheck-pdf.ts — fotochecks de las personas en PDF (ADR-416).
 *
 * Tarjeta CR80 (54 × 85,6 mm, el tamaño de un DNI), vertical, con frente y
 * dorso uno al lado del otro para imprimir en A4 y recortar: tres personas por
 * hoja. El QR abre la ficha de la persona en el panel, que pide iniciar sesión:
 * escanearlo no le muestra datos a nadie de afuera.
 *
 * IO en el navegador (dibuja la foto en un canvas y descarga), sin React ni
 * Prisma. Mismo motor que el resto de los PDF del panel: jsPDF y `qrcode`,
 * cargados en demanda.
 */

import type { jsPDF } from "jspdf";
import type { LogoPdf } from "@/lib/admin/membrete";

export interface PersonaFotocheck {
  nombre: string;
  puesto: string | null;
  /** Ya con el tipo: «DNI 70123456». */
  documento: string | null;
  /** Fecha de ingreso ya formateada, o `null`. */
  ingreso: string | null;
  fotoUrl: string | null;
  emergencia: { nombre: string | null; celular: string | null };
  /** Lo que se lee en una emergencia (ADR-417): de la lista cerrada, o `null` si no se sabe. */
  grupoSanguineo: string | null;
  /** Texto corto (≤200); `null` o vacío = no hay alergias registradas. */
  alergias: string | null;
  /** A dónde lleva el QR. */
  urlFicha: string;
}

export interface DatosFotochecks {
  negocio: string | null;
  /** Teléfono o dirección para «Si encuentras este fotocheck, devuélvelo a…». */
  contacto: string | null;
  personas: PersonaFotocheck[];
  /** Logo del negocio listo para jsPDF; sin logo, la banda lleva el nombre solo. */
  logo?: LogoPdf | null;
  /** Nombre del archivo, sin `.pdf`. */
  archivo: string;
}

const ANCHO = 54;
const ALTO = 85.6;
const ENTRE_CARAS = 8;
const ENTRE_FILAS = 6;
const MARGEN_SUPERIOR = 12;
const POR_HOJA = 3;
/** #007F7F — el turquesa de marca que pasa AA con texto blanco. */
const TURQUESA: [number, number, number] = [0, 127, 127];
const TINTA: [number, number, number] = [25, 25, 25];
const GRIS: [number, number, number] = [105, 105, 105];

/**
 * Reparto vertical del dorso, en mm desde el tope de la tarjeta (ADR-417).
 *
 * La tarjeta ya estaba llena: cuando hay datos de seguridad el QR se achica de
 * 26 a 22 mm, el bloque de emergencia baja 5,8 mm y el de «devuélvelo a» 4,8 —
 * la caja del grupo entra entre la leyenda del QR (baseline 37,3) y el título
 * de emergencia (37,5 → 54,9 de tinta libre). Sin esos datos queda el reparto
 * de siempre, así una tarjeta sin grupo ni alergias no cambia ni un milímetro.
 * Del título de emergencia cuelgan el nombre (+4) y el celular (+7,5); de
 * «devuélvelo a», el negocio (+3,6) y el contacto (+7). Abajo, fijos: la línea
 * de firma en 79,5 y su leyenda en 82,5.
 */
export const DORSO = {
  conCuidados: { qr: 22, qrTop: 12, leyenda: 37.3, cuidados: 40, emergencia: 56.8, devolver: 69.8 },
  sinCuidados: { qr: 26, qrTop: 13, leyenda: 43, emergencia: 51, devolver: 65 },
} as const;
/** Caja del grupo sanguíneo: 16 × 13 mm de turquesa, con la letra más grande del dorso. */
export const CAJA_GRUPO = { ancho: 16, alto: 13 } as const;
/** Alto de la tarjeta y de dónde cuelga el pie fijo (línea de firma), para el test de reparto. */
export const DORSO_FIRMA = { linea: 79.5, leyenda: 82.5, alto: ALTO } as const;

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/** La foto recortada a 3:4 (cubre el recuadro, como un fotocheck), en JPEG. `null` si no carga. */
async function fotoRecortada(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const w = 600;
    const h = 800;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    // Sin CORS, borrada o corrupta: el fotocheck sale con las iniciales en vez de la foto.
    return null;
  }
}

const primeraLinea = (doc: jsPDF, texto: string, ancho: number): string => (doc.splitTextToSize(texto, ancho) as string[])[0] ?? "";

function bordeDeCorte(doc: jsPDF, x: number, y: number): void {
  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, ANCHO, ALTO, 3, 3, "S");
}

function dibujarFrente(doc: jsPDF, x: number, y: number, p: PersonaFotocheck, foto: string | null, qr: string, negocio: string | null, logo: LogoPdf | null): void {
  const centro = x + ANCHO / 2;
  bordeDeCorte(doc, x, y);

  // Banda con el negocio: esquinas de arriba redondeadas, las de abajo rectas.
  doc.setFillColor(...TURQUESA);
  doc.roundedRect(x, y, ANCHO, 14, 3, 3, "F");
  doc.rect(x, y + 7, ANCHO, 7, "F");
  // Con logo: va a la izquierda sobre fondo blanco (un logo oscuro no se ve sobre el
  // turquesa) y el nombre se centra en lo que queda de la banda.
  let izquierdaTitulo = x + 4;
  if (logo) {
    const altoLogo = 8.5;
    const anchoLogo = Math.min(16, (logo.ancho / logo.alto) * altoLogo);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x + 2.5, y + 2.75, anchoLogo + 2, altoLogo, 1.2, 1.2, "F");
    doc.addImage(logo.dataUrl, "PNG", x + 3.5, y + 2.75, anchoLogo, altoLogo);
    izquierdaTitulo = x + anchoLogo + 7;
  }
  const anchoTitulo = x + ANCHO - 4 - izquierdaTitulo;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  // Corta sólo entre palabras: con logo quedan ~27 mm y «INVERSIONES AGROFORESTALES
  // BLAS SAC» salía «INVERSIONES AGR / OFORESTALES». Si una palabra no entra o el
  // nombre pide más de 2 líneas, baja la letra hasta 6 pt; a 6 pt entran 3.
  const texto = (negocio || "Fotocheck").toUpperCase();
  const palabras = texto.split(/\s+/);
  let tamano = 8;
  doc.setFontSize(tamano);
  let lineas = doc.splitTextToSize(texto, anchoTitulo) as string[];
  while (tamano > 6 && (lineas.length > 2 || palabras.some((palabra) => doc.getTextWidth(palabra) > anchoTitulo))) {
    tamano -= 0.5;
    doc.setFontSize(tamano);
    lineas = doc.splitTextToSize(texto, anchoTitulo) as string[];
  }
  const titulo = lineas.slice(0, 3);
  // Centrado en la banda de 14 mm: la primera línea sube media línea por cada línea extra.
  const altoLinea = tamano * 0.3528 * 1.15;
  const baseTitulo = y + 7 + tamano * 0.3528 * 0.35 - ((titulo.length - 1) * altoLinea) / 2;
  doc.text(titulo, izquierdaTitulo + anchoTitulo / 2, baseTitulo, { align: "center", lineHeightFactor: 1.15 });

  const fw = 28;
  const fh = 37.3;
  const fx = centro - fw / 2;
  const fy = y + 18;
  if (foto) {
    doc.addImage(foto, "JPEG", fx, fy, fw, fh);
  } else {
    doc.setFillColor(232, 243, 243);
    doc.rect(fx, fy, fw, fh, "F");
    doc.setTextColor(...TURQUESA);
    doc.setFontSize(22);
    doc.text(iniciales(p.nombre), centro, fy + fh / 2 + 3, { align: "center" });
  }
  doc.setDrawColor(...TURQUESA);
  doc.setLineWidth(0.5);
  doc.rect(fx, fy, fw, fh, "S");

  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const nombre = (doc.splitTextToSize(p.nombre, ANCHO - 6) as string[]).slice(0, 2);
  doc.text(nombre, centro, y + 60, { align: "center", lineHeightFactor: 1.1 });
  const cursor = y + 60 + (nombre.length - 1) * 3.5 + 4.2;

  if (p.puesto) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TURQUESA);
    doc.setFontSize(7.5);
    doc.text(primeraLinea(doc, p.puesto, ANCHO - 6), centro, cursor, { align: "center" });
  }

  // Abajo: documento e ingreso a la izquierda y el QR a la derecha. En la primera
  // versión el documento iba centrado bajo el puesto y quedaba pegado al QR.
  const lado = 12;
  doc.addImage(qr, "PNG", x + ANCHO - lado - 3.5, y + ALTO - lado - 3.5, lado, lado);
  const dato = (etiqueta: string, valor: string, yEtiqueta: number) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.setFontSize(5.8);
    doc.text(etiqueta, x + 4, yEtiqueta);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TINTA);
    doc.setFontSize(7.2);
    doc.text(valor, x + 4, yEtiqueta + 3);
  };
  if (p.documento) {
    const [tipo, ...numero] = p.documento.split(" ");
    dato(tipo ?? "Documento", numero.join(" "), y + ALTO - 13.8);
  }
  if (p.ingreso) dato("Ingreso", p.ingreso, y + ALTO - 7.2);
}

/**
 * Datos de seguridad (ADR-417): en el aserradero el fotocheck hace de credencial
 * y lo que se lee en el momento es el grupo sanguíneo. Por eso va en una caja
 * turquesa a 16 pt —la letra más grande del dorso— y las alergias al costado.
 * Ocupa `CAJA_GRUPO.alto` mm desde `top`. Lo que no hay no se imprime: nada de
 * etiquetas vacías, porque «no se sabe» y «ninguna» no son lo mismo.
 */
function dibujarCuidados(doc: jsPDF, x: number, top: number, p: PersonaFotocheck): void {
  let izquierda = x + 5;
  if (p.grupoSanguineo) {
    const centroCaja = x + 4 + CAJA_GRUPO.ancho / 2;
    doc.setFillColor(...TURQUESA);
    doc.roundedRect(x + 4, top, CAJA_GRUPO.ancho, CAJA_GRUPO.alto, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.2);
    doc.text("GRUPO", centroCaja, top + 3.3, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    // «AB+» a 16 pt mide 11,4 mm: entra en los 16 de la caja con aire a los lados.
    doc.text(p.grupoSanguineo, centroCaja, top + 10.4, { align: "center" });
    izquierda = x + 4 + CAJA_GRUPO.ancho + 2.5;
  }

  const alergias = p.alergias?.trim();
  if (!alergias) return;
  const ancho = x + ANCHO - 5 - izquierda;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIS);
  doc.setFontSize(5.5);
  doc.text("ALERGIAS", izquierda, top + 3.2);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TINTA);
  doc.setFontSize(6.5);
  // Tres líneas es lo que entra en la caja (baselines 6,6 · 9,5 · 12,3 de 13 mm).
  // Si el texto da para más, la última avisa con puntos suspensivos en vez de cortarse seca.
  const todas = doc.splitTextToSize(alergias, ancho) as string[];
  const lineas = todas.slice(0, 3);
  if (todas.length > lineas.length && lineas.length > 0) lineas[lineas.length - 1] = `${lineas[lineas.length - 1]!.trimEnd()}…`;
  doc.text(lineas, izquierda, top + 6.6, { lineHeightFactor: 1.25 });
}

function dibujarDorso(doc: jsPDF, x: number, y: number, p: PersonaFotocheck, qr: string, negocio: string | null, contacto: string | null): void {
  const centro = x + ANCHO / 2;
  bordeDeCorte(doc, x, y);

  doc.setFillColor(...TURQUESA);
  doc.roundedRect(x, y, ANCHO, 9, 3, 3, "F");
  doc.rect(x, y + 4.5, ANCHO, 4.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("PERSONAL E INTRANSFERIBLE", centro, y + 5.8, { align: "center" });

  const conCuidados = Boolean(p.grupoSanguineo || p.alergias?.trim());
  const reparto = conCuidados ? DORSO.conCuidados : DORSO.sinCuidados;

  doc.addImage(qr, "PNG", centro - reparto.qr / 2, y + reparto.qrTop, reparto.qr, reparto.qr);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIS);
  doc.setFontSize(5.8);
  doc.text("Escanea para abrir su ficha en el panel", centro, y + reparto.leyenda, { align: "center" });

  if (conCuidados) dibujarCuidados(doc, x, y + DORSO.conCuidados.cuidados, p);

  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("EN CASO DE EMERGENCIA", x + 5, y + reparto.emergencia);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(primeraLinea(doc, p.emergencia.nombre ?? "—", ANCHO - 10), x + 5, y + reparto.emergencia + 4);
  if (p.emergencia.celular) doc.text(p.emergencia.celular, x + 5, y + reparto.emergencia + 7.5);

  // Sin nombre de negocio configurado no se imprime «devuélvelo a: —».
  if (negocio) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.setFontSize(5.8);
    doc.text("Si encuentras este fotocheck, devuélvelo a:", x + 5, y + reparto.devolver);
    doc.setTextColor(...TINTA);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(primeraLinea(doc, negocio, ANCHO - 10), x + 5, y + reparto.devolver + 3.6);
    if (contacto) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(primeraLinea(doc, contacto, ANCHO - 10), x + 5, y + reparto.devolver + 7);
    }
  }

  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.line(x + 9, y + DORSO_FIRMA.linea, x + ANCHO - 9, y + DORSO_FIRMA.linea);
  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.text("Firma del titular", centro, y + DORSO_FIRMA.leyenda, { align: "center" });
}

export async function descargarFotochecks(d: DatosFotochecks): Promise<void> {
  const { default: JsPDF } = await import("jspdf");
  const QR = (await import("qrcode")).default;
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const x = (doc.internal.pageSize.getWidth() - (ANCHO * 2 + ENTRE_CARAS)) / 2;
  const pieY = doc.internal.pageSize.getHeight() - 6;

  for (let i = 0; i < d.personas.length; i++) {
    if (i % POR_HOJA === 0) {
      if (i > 0) doc.addPage();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...GRIS);
      doc.text("Recorta por el borde gris · tamaño DNI (54 × 85,6 mm) · frente a la izquierda, dorso a la derecha", x, pieY);
    }
    const y = MARGEN_SUPERIOR + (i % POR_HOJA) * (ALTO + ENTRE_FILAS);
    const p = d.personas[i]!;
    const [foto, qr] = await Promise.all([
      p.fotoUrl ? fotoRecortada(p.fotoUrl) : Promise.resolve(null),
      QR.toDataURL(p.urlFicha, { margin: 0, width: 360, errorCorrectionLevel: "M" }),
    ]);
    dibujarFrente(doc, x, y, p, foto, qr, d.negocio, d.logo ?? null);
    dibujarDorso(doc, x + ANCHO + ENTRE_CARAS, y, p, qr, d.negocio, d.contacto);
  }

  doc.save(`${d.archivo}.pdf`);
}
