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

export interface PersonaFotocheck {
  nombre: string;
  puesto: string | null;
  /** Ya con el tipo: «DNI 70123456». */
  documento: string | null;
  /** Fecha de ingreso ya formateada, o `null`. */
  ingreso: string | null;
  fotoUrl: string | null;
  emergencia: { nombre: string | null; celular: string | null };
  /** A dónde lleva el QR. */
  urlFicha: string;
}

export interface DatosFotochecks {
  negocio: string | null;
  /** Teléfono o dirección para «Si encuentras este fotocheck, devuélvelo a…». */
  contacto: string | null;
  personas: PersonaFotocheck[];
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

function dibujarFrente(doc: jsPDF, x: number, y: number, p: PersonaFotocheck, foto: string | null, qr: string, negocio: string | null): void {
  const centro = x + ANCHO / 2;
  bordeDeCorte(doc, x, y);

  // Banda con el negocio: esquinas de arriba redondeadas, las de abajo rectas.
  doc.setFillColor(...TURQUESA);
  doc.roundedRect(x, y, ANCHO, 14, 3, 3, "F");
  doc.rect(x, y + 7, ANCHO, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const titulo = (doc.splitTextToSize((negocio || "Fotocheck").toUpperCase(), ANCHO - 8) as string[]).slice(0, 2);
  doc.text(titulo, centro, titulo.length > 1 ? y + 5.8 : y + 8.2, { align: "center", lineHeightFactor: 1.15 });

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

  const lado = 26;
  doc.addImage(qr, "PNG", centro - lado / 2, y + 13, lado, lado);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIS);
  doc.setFontSize(5.8);
  doc.text("Escanea para abrir su ficha en el panel", centro, y + 43, { align: "center" });

  doc.setTextColor(...TINTA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("EN CASO DE EMERGENCIA", x + 5, y + 51);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(primeraLinea(doc, p.emergencia.nombre ?? "—", ANCHO - 10), x + 5, y + 55);
  if (p.emergencia.celular) doc.text(p.emergencia.celular, x + 5, y + 58.5);

  // Sin nombre de negocio configurado no se imprime «devuélvelo a: —».
  if (negocio) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.setFontSize(5.8);
    doc.text("Si encuentras este fotocheck, devuélvelo a:", x + 5, y + 65);
    doc.setTextColor(...TINTA);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(primeraLinea(doc, negocio, ANCHO - 10), x + 5, y + 68.6);
    if (contacto) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(primeraLinea(doc, contacto, ANCHO - 10), x + 5, y + 72);
    }
  }

  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.line(x + 9, y + 79.5, x + ANCHO - 9, y + 79.5);
  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  doc.text("Firma del titular", centro, y + 82.5, { align: "center" });
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
    dibujarFrente(doc, x, y, p, foto, qr, d.negocio);
    dibujarDorso(doc, x + ANCHO + ENTRE_CARAS, y, p, qr, d.negocio, d.contacto);
  }

  doc.save(`${d.archivo}.pdf`);
}
