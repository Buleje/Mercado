import "server-only";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import { TIPO_LABELS } from "@/lib/types/contracts";
import type { DbContract } from "@/lib/types/contracts";

/**
 * El contrato como PDF de verdad (ADR-307).
 *
 * Antes "PDF" abría una ventana con HTML y llamaba a `window.print()`: no había
 * archivo, no se podía guardar, ni firmar, ni mandar por WhatsApp, ni indexar.
 * Acá se arma un A4 con márgenes de escritura legal, cláusulas justificadas y
 * bloques de firma reales, que se puede archivar y verificar por hash.
 */

// Medidas en puntos (72 pt = 1 pulgada). A4 = 595.28 × 841.89.
const A4: [number, number] = [595.28, 841.89];
const MARGEN_X = 62;
const MARGEN_SUP = 64;
const MARGEN_INF = 62;
const CUERPO = 10.5;
const INTERLINEA = 15.5;

const TINTA = rgb(0.09, 0.09, 0.11);
const TENUE = rgb(0.42, 0.42, 0.46);
const REGLA = rgb(0.78, 0.78, 0.8);
const ACENTO = rgb(0, 0.44, 0.44); // primary del DS, en tinta

export interface EmisorContrato {
  razonSocial: string;
  ruc?: string;
  direccion?: string;
}

export interface FirmaEnPdf {
  nombre: string;
  rol: string;
  documento: string;
  /** PNG en data URL, tal como lo dibujó el firmante. */
  firmaDataUrl: string;
  firmadoEn: Date;
}

export interface ContratoPdfOptions {
  contrato: DbContract;
  emisor?: EmisorContrato;
  firmas?: FirmaEnPdf[];
  /** Marca visible mientras el contrato no está firmado por todos. */
  borrador?: boolean;
}

export interface ContratoPdfResult {
  bytes: Uint8Array;
  paginas: number;
  /** SHA-256 del archivo: la huella que prueba que nadie lo cambió después. */
  hash: string;
}

// ── Composición de texto ─────────────────────────────────────────────────────

/**
 * pdf-lib sólo dibuja líneas: el corte de palabras es nuestro. Además las
 * fuentes estándar son WinAnsi, así que un carácter fuera de latin-1 (una
 * comilla tipográfica, un guion largo) reventaría el `drawText`.
 */
function aLatin1(texto: string): string {
  return texto
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    // Todo lo que quede arriba de latin-1 (incluidos los emoji, que son pares
    // sustitutos) no se puede dibujar con estas fuentes. Los saltos de linea y
    // las tabulaciones se conservan: son los que separan palabras mas adelante.
    .replace(/[\u0100-\uFFFF]/g, "");
}

function cortarEnLineas(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const palabras = aLatin1(texto).split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";

  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(tentativa, size) <= ancho) {
      actual = tentativa;
      continue;
    }
    if (actual) lineas.push(actual);
    // Una palabra sola más ancha que el renglón (un URL largo) se parte a lo bruto.
    if (font.widthOfTextAtSize(palabra, size) > ancho) {
      let resto = palabra;
      while (font.widthOfTextAtSize(resto, size) > ancho && resto.length > 1) {
        let corte = resto.length;
        while (corte > 1 && font.widthOfTextAtSize(resto.slice(0, corte), size) > ancho) corte--;
        lineas.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      actual = resto;
    } else {
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Dibuja una línea repartiendo el sobrante entre los espacios (texto justificado). */
function dibujarJustificado(
  page: PDFPage,
  linea: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  ancho: number,
) {
  const palabras = linea.split(" ");
  if (palabras.length < 2) {
    page.drawText(linea, { x, y, size, font, color: TINTA });
    return;
  }
  const anchoTexto = palabras.reduce((s, p) => s + font.widthOfTextAtSize(p, size), 0);
  const espacio = (ancho - anchoTexto) / (palabras.length - 1);
  let cursor = x;
  for (const palabra of palabras) {
    page.drawText(palabra, { x: cursor, y, size, font, color: TINTA });
    cursor += font.widthOfTextAtSize(palabra, size) + espacio;
  }
}

function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
}

function money(monto: number, moneda: string): string {
  const simbolo = moneda === "USD" ? "US$" : "S/";
  return `${simbolo} ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Generación ───────────────────────────────────────────────────────────────

export async function generarContratoPdf(opts: ContratoPdfOptions): Promise<ContratoPdfResult> {
  const { contrato, emisor, firmas = [], borrador = false } = opts;

  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const anchoUtil = A4[0] - MARGEN_X * 2;
  let page = pdf.addPage(A4);
  let y = A4[1] - MARGEN_SUP;

  const nuevaPagina = () => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGEN_SUP;
  };

  const asegurarEspacio = (alto: number) => {
    if (y - alto < MARGEN_INF) nuevaPagina();
  };

  // ── Encabezado ────────────────────────────────────────────────────────────
  const titulo = `CONTRATO DE ${(TIPO_LABELS[contrato.tipo] ?? contrato.tipo).toUpperCase()}`;
  const anchoTitulo = serifBold.widthOfTextAtSize(aLatin1(titulo), 15);
  page.drawText(aLatin1(titulo), {
    x: (A4[0] - anchoTitulo) / 2,
    y,
    size: 15,
    font: serifBold,
    color: TINTA,
  });
  y -= 18;

  const subtitulo = `N.o ${contrato.numero}`;
  const anchoSub = sans.widthOfTextAtSize(aLatin1(subtitulo), 9.5);
  page.drawText(aLatin1(subtitulo), {
    x: (A4[0] - anchoSub) / 2,
    y,
    size: 9.5,
    font: sans,
    color: TENUE,
  });
  y -= 12;

  page.drawLine({
    start: { x: MARGEN_X, y },
    end: { x: A4[0] - MARGEN_X, y },
    thickness: 1.2,
    color: TINTA,
  });
  page.drawLine({
    start: { x: MARGEN_X, y: y - 3 },
    end: { x: A4[0] - MARGEN_X, y: y - 3 },
    thickness: 0.5,
    color: TINTA,
  });
  y -= 24;

  // ── Ficha: quién, cuánto, desde cuándo ────────────────────────────────────
  const ficha: [string, string][] = [
    ["Contraparte", `${contrato.clienteNombre}${contrato.clienteDoc ? ` (${contrato.clienteDoc})` : ""}`],
    ["Monto", contrato.monto > 0 ? money(contrato.monto, contrato.moneda) : "Sin monto pactado"],
    ["Vigencia", `${fechaLarga(contrato.fechaInicio)}${contrato.fechaVencimiento ? ` — ${fechaLarga(contrato.fechaVencimiento)}` : " — sin fecha de término"}`],
  ];
  if (emisor?.razonSocial) {
    ficha.unshift(["Emisor", `${emisor.razonSocial}${emisor.ruc ? ` (RUC ${emisor.ruc})` : ""}`]);
  }

  const altoFicha = ficha.length * 13 + 14;
  page.drawRectangle({
    x: MARGEN_X,
    y: y - altoFicha + 6,
    width: anchoUtil,
    height: altoFicha,
    color: rgb(0.97, 0.97, 0.95),
  });
  let yFicha = y - 6;
  for (const [etiqueta, valor] of ficha) {
    page.drawText(aLatin1(`${etiqueta}:`), { x: MARGEN_X + 10, y: yFicha, size: 8.5, font: sansBold, color: ACENTO });
    const anchoEtiqueta = sansBold.widthOfTextAtSize(aLatin1(`${etiqueta}:`), 8.5);
    const disponible = anchoUtil - 20 - anchoEtiqueta - 6;
    const [primeraLinea] = cortarEnLineas(valor, sans, 8.5, disponible);
    page.drawText(primeraLinea ?? "", {
      x: MARGEN_X + 10 + anchoEtiqueta + 6,
      y: yFicha,
      size: 8.5,
      font: sans,
      color: TINTA,
    });
    yFicha -= 13;
  }
  y = y - altoFicha - 10;

  // ── Resumen en criollo ────────────────────────────────────────────────────
  const resumen = (contrato.resumen || contrato.descripcion || "").trim();
  if (resumen) {
    const lineas = cortarEnLineas(resumen, serif, 9.5, anchoUtil - 22);
    asegurarEspacio(lineas.length * 13 + 22);
    const alto = lineas.length * 13 + 16;
    page.drawRectangle({ x: MARGEN_X, y: y - alto + 8, width: 3, height: alto, color: ACENTO });
    page.drawText("EN CRIOLLO", { x: MARGEN_X + 12, y, size: 7.5, font: sansBold, color: ACENTO });
    y -= 12;
    for (const linea of lineas) {
      page.drawText(linea, { x: MARGEN_X + 12, y, size: 9.5, font: serif, color: TENUE });
      y -= 13;
    }
    y -= 12;
  }

  // ── Cláusulas ─────────────────────────────────────────────────────────────
  const cuerpo = (contrato.contenido?.trim() || contrato.clausulas.join("\n\n")).trim();
  const parrafos = cuerpo.split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);

  for (const parrafo of parrafos) {
    // El encabezado de cláusula ("CLAUSULA PRIMERA.- OBJETO:") va en negrita.
    const encabezado = parrafo.match(/^(CL[AÁ]USULA [A-ZÁÉÍÓÚÑ]+\.-\s*[^:]{0,60}:)/);
    const lineas = cortarEnLineas(parrafo, serif, CUERPO, anchoUtil);

    asegurarEspacio(INTERLINEA * Math.min(lineas.length, 3));

    lineas.forEach((linea, i) => {
      if (y - INTERLINEA < MARGEN_INF) nuevaPagina();
      const esUltima = i === lineas.length - 1;
      // La última línea de un párrafo NO se justifica (quedaría estirada).
      if (esUltima) {
        page.drawText(linea, { x: MARGEN_X, y, size: CUERPO, font: serif, color: TINTA });
      } else {
        dibujarJustificado(page, linea, serif, CUERPO, MARGEN_X, y, anchoUtil);
      }
      // Subrayamos el encabezado con una negrita superpuesta en la primera línea.
      if (i === 0 && encabezado) {
        const titulo = aLatin1(encabezado[1]);
        if (linea.startsWith(titulo)) {
          page.drawRectangle({
            x: MARGEN_X,
            y: y - 2.5,
            width: serif.widthOfTextAtSize(titulo, CUERPO),
            height: CUERPO + 4,
            color: rgb(1, 1, 1),
          });
          page.drawText(titulo, { x: MARGEN_X, y, size: CUERPO, font: serifBold, color: TINTA });
          const resto = linea.slice(titulo.length);
          if (resto) {
            page.drawText(resto, {
              x: MARGEN_X + serifBold.widthOfTextAtSize(titulo, CUERPO),
              y,
              size: CUERPO,
              font: serif,
              color: TINTA,
            });
          }
        }
      }
      y -= INTERLINEA;
    });
    y -= 8;
  }

  // ── Bloques de firma ──────────────────────────────────────────────────────
  const anchoBloque = (anchoUtil - 40) / 2;
  const altoBloque = 96;
  asegurarEspacio(altoBloque + 30);
  y -= 24;

  const ROL_TEXTO: Record<string, string> = {
    EMISOR: "Primera parte",
    CONTRAPARTE: "Segunda parte",
    TESTIGO: "Testigo",
  };

  /**
   * Los bloques salen de los FIRMANTES cuando el contrato tiene lista de firma.
   * Antes se rotulaban con el emisor y la contraparte del contrato, así que el
   * papel firmado podía decir "PRIMERA PARTE" arriba del trazo de una persona
   * con nombre y apellido. Sin lista de firmantes se cae a las dos partes del
   * contrato, que es lo que corresponde para firmar a mano en papel.
   */
  const bloques: { nombre: string; sub: string; firma?: FirmaEnPdf }[] =
    contrato.firmantes.length > 0
      ? contrato.firmantes.slice(0, 4).map((f) => ({
          nombre: f.nombre,
          sub: f.documento ? `${ROL_TEXTO[f.rol] ?? f.rol} · Doc. ${f.documento}` : (ROL_TEXTO[f.rol] ?? f.rol),
          firma: firmas.find((x) => x.nombre === f.nombre && x.rol === f.rol),
        }))
      : [
    {
      nombre: emisor?.razonSocial || "PRIMERA PARTE",
      sub: emisor?.ruc ? `RUC ${emisor.ruc}` : "Primera parte",
      firma: firmas.find((f) => f.rol === "EMISOR"),
    },
    {
      nombre: contrato.clienteNombre,
      sub: contrato.clienteDoc ? `Doc. ${contrato.clienteDoc}` : "Segunda parte",
      firma: firmas.find((f) => f.rol !== "EMISOR"),
    },
  ];

  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    const columna = i % 2;
    // Con tres o más firmantes los bloques bajan a una fila nueva en vez de
    // salirse de la hoja.
    if (columna === 0 && i > 0) {
      y -= altoBloque;
      if (y - altoBloque < MARGEN_INF) {
        nuevaPagina();
        y -= 24;
      }
    }
    const x = MARGEN_X + columna * (anchoBloque + 40);

    if (bloque.firma?.firmaDataUrl?.startsWith("data:image/png;base64,")) {
      try {
        const png = await pdf.embedPng(bloque.firma.firmaDataUrl);
        const escala = Math.min(anchoBloque / png.width, 52 / png.height);
        page.drawImage(png, {
          x: x + (anchoBloque - png.width * escala) / 2,
          y: y - 52 + (52 - png.height * escala) / 2,
          width: png.width * escala,
          height: png.height * escala,
        });
      } catch {
        // Una firma ilegible no puede tumbar la generación del contrato entero.
      }
    }

    const yLinea = y - 58;
    page.drawLine({
      start: { x, y: yLinea },
      end: { x: x + anchoBloque, y: yLinea },
      thickness: 0.8,
      color: TINTA,
    });
    const nombre = cortarEnLineas(bloque.nombre, sansBold, 8.5, anchoBloque)[0] ?? "";
    const anchoNombre = sansBold.widthOfTextAtSize(nombre, 8.5);
    page.drawText(nombre, {
      x: x + (anchoBloque - anchoNombre) / 2,
      y: yLinea - 12,
      size: 8.5,
      font: sansBold,
      color: TINTA,
    });
    const sub = aLatin1(bloque.sub);
    const anchoSubBloque = sans.widthOfTextAtSize(sub, 7.5);
    page.drawText(sub, {
      x: x + (anchoBloque - anchoSubBloque) / 2,
      y: yLinea - 22,
      size: 7.5,
      font: sans,
      color: TENUE,
    });
    if (bloque.firma) {
      const sello = aLatin1(`Firmado el ${bloque.firma.firmadoEn.toLocaleString("es-PE")}`);
      const anchoSello = sans.widthOfTextAtSize(sello, 6.5);
      page.drawText(sello, {
        x: x + (anchoBloque - anchoSello) / 2,
        y: yLinea - 32,
        size: 6.5,
        font: sans,
        color: ACENTO,
      });
    }
  }

  // ── Pie con folio ─────────────────────────────────────────────────────────
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGEN_X, y: MARGEN_INF - 16 },
      end: { x: A4[0] - MARGEN_X, y: MARGEN_INF - 16 },
      thickness: 0.5,
      color: REGLA,
    });
    const pie = aLatin1(`${contrato.numero} · ${emisor?.razonSocial || "Buleje"}`);
    p.drawText(pie, { x: MARGEN_X, y: MARGEN_INF - 28, size: 7, font: sans, color: TENUE });
    const folio = `Pagina ${i + 1} de ${paginas.length}`;
    p.drawText(folio, {
      x: A4[0] - MARGEN_X - sans.widthOfTextAtSize(folio, 7),
      y: MARGEN_INF - 28,
      size: 7,
      font: sans,
      color: TENUE,
    });

    if (borrador) {
      p.drawText("BORRADOR", {
        x: 150,
        y: 380,
        size: 70,
        font: sansBold,
        color: rgb(0.85, 0.85, 0.87),
        rotate: degrees(38),
        opacity: 0.35,
      });
    }
  });

  const bytes = await pdf.save();
  return {
    bytes,
    paginas: paginas.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
