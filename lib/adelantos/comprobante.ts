/**
 * El papel que firma la persona cuando recibe la plata.
 *
 * POR QUÉ. El módulo podía exportar el estado de cuenta (todo el historial), pero
 * no el comprobante de UN adelanto — que es el que se necesita en el momento del
 * desembolso, con la firma. Sin él, el respaldo del préstamo queda en un
 * cuaderno o en nada.
 *
 * Se apoya en el código de operación (ADR-329): el papel y el sistema dicen el
 * mismo número, así que cuando aparece un recibo suelto se puede encontrar de
 * qué adelanto es.
 *
 * jsPDF y no HTML imprimible: es el idioma que ya usa este módulo para el
 * estado de cuenta y la lista de cobranza — meter un segundo motor de impresión
 * por un documento sería dos formas de hacer lo mismo.
 */

import { formatCurrency } from "@/lib/currency";
import { direccionDe, ETIQUETA_CONCEPTO, type AdelantoConceptoRecibido } from "@/lib/adelantos/direccion";

export interface DatosComprobante {
  codigoOperacion?: string | null;
  reciboManual?: string | null;
  persona: string;
  documento?: string | null;
  telefono?: string | null;
  monto: number;
  moneda?: string | null;
  fecha: string;
  modalidad: string;
  notas?: string | null;
  /** Nombre del negocio, para encabezar el papel. */
  negocio?: string;
  /**
   * (ADR-448) De qué lado está la plata. Sin dirección = DADO: el papel de
   * siempre, que firma la persona. En RECIBIDO se invierte: la persona entrega,
   * el negocio recibe y firma el compromiso.
   */
  direccion?: string | null;
  conceptoRecibido?: AdelantoConceptoRecibido | null;
  /**
   * La firma hecha en la pantalla (08-10): se pinta sobre la línea de la
   * PERSONA del adelanto (`ladoDeFirma`), con su nombre, DNI y la hora de Lima
   * debajo. Sin esto el papel sale con las dos líneas en blanco, como siempre.
   */
  firma?: FirmaEnPapel;
  /**
   * LEGADO (antes del registro de firmas, ADR-491): la hoja firmada que quedó
   * guardada como foto del adelanto (data URL JPEG). Va en una segunda página;
   * sólo se usa si el registro no tiene firma.
   */
  hojaFirmada?: string;
  /**
   * (ADR-491) La foto de la huella vigente del registro, para su casilla. Sin
   * ella la casilla sale vacía igual: es para entintar el dedo en el papel.
   */
  huella?: ImagenEnPapel;
  /**
   * (ADR-491) El monto que decía el recibo cuando se firmó. Si después se
   * corrigió el adelanto, el papel lo dice: la firma vale por lo que se vio.
   */
  montoFirmado?: number | null;
  /** (ADR-491) La foto del voucher (data URL JPEG), en una página aparte «Comprobante de pago». */
  voucher?: string;
}

/** Una imagen para el papel: data URL PNG o JPEG (jsPDF no lee webp). */
export interface ImagenEnPapel {
  imagen: string;
  /** Ancho ÷ alto; si falta, se lee de la imagen. */
  relacion?: number;
}

export interface FirmaEnPapel extends ImagenEnPapel {
  nombre: string;
  documento: string;
  /** Ya escrita: «jueves 08/10/2026 · 21:14». */
  fechaHora: string;
}

/** «soles» o «dólares americanos»: el papel de un adelanto en dólares decía «soles». */
export function monedaEnLetras(moneda?: string | null): string {
  return moneda === "USD" ? "dólares americanos" : "soles";
}

/** El monto con su signo: «S/ 1,234.50» o «US$ 1,234.50». */
export function montoConMoneda(monto: number, moneda?: string | null): string {
  if (moneda === "USD") {
    return `US$ ${monto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return formatCurrency(monto);
}

/**
 * De qué lado del papel firma la PERSONA del adelanto. En lo DADO ella recibe
 * la plata: firma «Recibí conforme» (derecha). En lo RECIBIDO ella la entrega:
 * firma «Entregó» (izquierda) y el negocio firma el compromiso.
 */
export function ladoDeFirma(direccion?: string | null): "izquierda" | "derecha" {
  return direccionDe(direccion) === "RECIBIDO" ? "izquierda" : "derecha";
}

/** «DNI 12345678» si son 8 números; si no, «Doc. X» (carné de extranjería, pasaporte). */
export function rotuloDocumento(documento: string): string {
  const d = documento.trim();
  return /^\d{8}$/.test(d) ? `DNI ${d}` : `Doc. ${d}`;
}

/** La casilla de la huella (ADR-491): 22 × 28 mm, el tamaño de un dedo entintado. */
export const CASILLA_HUELLA = { ancho: 22, alto: 28 } as const;

/**
 * Dónde va la casilla: al lado de la línea de la PERSONA, del lado de adentro
 * (afuera no entra: el margen es de 16 mm). En mm de la hoja A5 apaisada.
 */
export function casillaDeHuella(direccion: string | null | undefined, anchoHoja: number, yFirma: number): { x: number; y: number; ancho: number; alto: number } {
  const { ancho, alto } = CASILLA_HUELLA;
  const x = ladoDeFirma(direccion) === "izquierda" ? 76 + 6 : anchoHoja - 76 - 6 - ancho;
  return { x, y: yFirma - 18, ancho, alto };
}

/** «Firmó por S/ 120.00; el monto hoy es S/ 150.00.» — `null` si son iguales (al céntimo) o no se sabe. */
export function avisoMontoFirmado(d: Pick<DatosComprobante, "monto" | "moneda" | "montoFirmado">): string | null {
  if (d.montoFirmado == null || Math.abs(d.montoFirmado - d.monto) < 0.005) return null;
  return `Firmó por ${montoConMoneda(d.montoFirmado, d.moneda)}; el monto hoy es ${montoConMoneda(d.monto, d.moneda)}.`;
}

/** Los textos del papel, sin jsPDF: lo que cambia según quién pone la plata. */
export interface TextosComprobante {
  titulo: string;
  /** «Recibí de» — quién puso la plata. */
  recibiDe: string;
  /** Quién la recibió: la persona en DADO, el negocio en RECIBIDO. */
  nombre: string;
  /** Por qué te dieron la plata (sólo en RECIBIDO): «Adelanto por un servicio que darás». */
  concepto: string | null;
  declaracion: string;
  firmaIzquierda: string;
  firmaDerecha: string;
}

export function textosDelComprobante(d: DatosComprobante): TextosComprobante {
  const negocio = d.negocio?.trim() || "—";
  if (direccionDe(d.direccion) === "RECIBIDO") {
    const servicio = d.conceptoRecibido !== "PRESTAMO";
    return {
      titulo: "COMPROBANTE DE ADELANTO RECIBIDO",
      recibiDe: d.persona,
      nombre: negocio,
      concepto: d.conceptoRecibido ? ETIQUETA_CONCEPTO[d.conceptoRecibido] : null,
      declaracion: servicio
        ? `${negocio} declara haber recibido el monto indicado como adelanto y se compromete a devolverlo con el servicio acordado.`
        : `${negocio} declara haber recibido el monto indicado en préstamo y se compromete a devolverlo según lo acordado.`,
      firmaIzquierda: `Entregó · ${d.persona}`,
      firmaDerecha: `Recibí conforme · ${negocio}`,
    };
  }
  return {
    titulo: "COMPROBANTE DE ADELANTO",
    recibiDe: negocio,
    nombre: d.persona,
    concepto: null,
    declaracion: "Declaro haber recibido el monto indicado y me comprometo a liquidarlo según la modalidad acordada.",
    firmaIzquierda: "Entregó",
    firmaDerecha: "Recibí conforme",
  };
}

const MODALIDAD_LABEL: Record<string, string> = {
  CUENTA_CORRIENTE: "Cuenta corriente (se liquida con entregas)",
  ENTREGAS_PACTADAS: "Entregas pactadas",
  DESCUENTO_PLANILLA: "Descuento por planilla",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

/**
 * Monto en letras — lo que hace que un recibo no se pueda alterar con un cero.
 *
 * Cubre hasta 999.999, que es de sobra para un adelanto; arriba de eso devuelve
 * el número, que es mejor que mentir con una conversión a medias.
 */
export function montoEnLetras(n: number): string {
  /**
   * Se redondea a centavos ANTES de partir. Hacerlo al revés daba «noventa y
   * nueve con 100/100» para 99.999: los centavos redondeaban a 100 y nadie los
   * acarreaba a la unidad. En un papel firmado eso es un error que se nota.
   */
  const total = Math.round(Math.abs(n) * 100);
  const entero = Math.floor(total / 100);
  const centavos = total % 100;
  if (entero > 999_999) return `${entero}`;

  const UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
    "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  /* «veintitrés», no «veintitres»: un papel firmado con faltas se discute. */
  const VEINTI_TILDE: Record<number, string> = { 2: "dós", 3: "trés", 6: "séis" };
  const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos"];

  const hasta999 = (x: number): string => {
    if (x === 0) return "";
    if (x === 100) return "cien";
    const c = Math.floor(x / 100);
    const d = x % 100;
    const resto =
      d < 20
        ? UNIDADES[d]
        : d % 10 === 0
          ? DECENAS[Math.floor(d / 10)]
          : Math.floor(d / 10) === 2
            ? `veinti${VEINTI_TILDE[d % 10] ?? UNIDADES[d % 10]}`
            : `${DECENAS[Math.floor(d / 10)]} y ${UNIDADES[d % 10]}`;
    return [CENTENAS[c], resto].filter(Boolean).join(" ");
  };

  const miles = Math.floor(entero / 1000);
  const resto = entero % 1000;
  /* Delante de «mil» el «uno» se apocopa: 21 000 = «veintiún mil», 101 000 =
     «ciento un mil». Sin esto el papel decía «veintiuno mil». */
  const apocope = (t: string) => t.replace(/veintiuno$/, "veintiún").replace(/uno$/, "un");
  const parteMiles = miles === 0 ? "" : miles === 1 ? "mil" : `${apocope(hasta999(miles))} mil`;
  const texto = [parteMiles, hasta999(resto)].filter(Boolean).join(" ") || "cero";
  return `${texto} con ${String(centavos).padStart(2, "0")}/100`;
}

/** Arma y descarga el comprobante. */
export async function descargarComprobante(d: DatosComprobante): Promise<void> {
  const doc = await armarComprobante(d);
  doc.save(`adelanto-${(d.codigoOperacion ?? "sin-codigo").toLowerCase()}.pdf`);
}

/** El PDF sin bajarlo (así se prueba fuera del navegador). Carga jsPDF en demanda: pesa. */
export async function armarComprobante(d: DatosComprobante): Promise<Pdf> {
  const { default: jsPDF } = await import("jspdf");
  // A5 apaisado: entra en media hoja A4, que es como se imprime en el mostrador.
  const doc = new jsPDF({ format: "a5", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const t = textosDelComprobante(d);
  let y = 14;

  doc.setFontSize(9);
  doc.text((d.negocio ?? "").toUpperCase(), 12, y);
  doc.setFontSize(15);
  doc.text(t.titulo, 12, (y += 8));

  // El código, grande y a la derecha: es lo que se busca cuando aparece el papel.
  doc.setFontSize(13);
  doc.text(d.codigoOperacion ?? "—", W - 12, 22, { align: "right" });
  if (d.reciboManual) {
    doc.setFontSize(9);
    doc.text(`Recibo ${d.reciboManual}`, W - 12, 28, { align: "right" });
  }

  doc.setLineWidth(0.4);
  doc.line(12, (y += 4), W - 12, y);

  doc.setFontSize(10);
  const linea = (etiqueta: string, valor: string) => {
    y += 7;
    doc.text(`${etiqueta}:`, 12, y);
    doc.text(valor, 45, y);
  };
  linea("Fecha", fecha(d.fecha));
  linea("Recibí de", t.recibiDe);
  if (d.documento && t.recibiDe === d.persona) linea("Documento", d.documento);
  linea(t.recibiDe === d.persona ? "Recibe" : "Nombre", t.nombre);
  if (d.documento && t.nombre === d.persona) linea("Documento", d.documento);
  if (t.concepto) linea("Por", t.concepto);
  linea("Modalidad", MODALIDAD_LABEL[d.modalidad] ?? d.modalidad);

  y += 9;
  doc.setFontSize(14);
  doc.text(montoConMoneda(d.monto, d.moneda), 12, y);
  doc.setFontSize(9);
  doc.text(`(${montoEnLetras(d.monto)} ${monedaEnLetras(d.moneda)})`, 12, (y += 5));
  const aviso = avisoMontoFirmado(d);
  if (aviso) {
    doc.setFontSize(8);
    doc.text(aviso, 12, (y += 5));
  }

  if (d.notas) {
    doc.setFontSize(9);
    doc.text(`Concepto: ${d.notas}`.slice(0, 110), 12, (y += 7));
  }

  // La declaración: sin esto el papel es un recibo, no un compromiso.
  y += 8;
  doc.setFontSize(8);
  doc.text(
    doc.splitTextToSize(t.declaracion, W - 24) as string[],
    12,
    y,
  );

  // Dos firmas: quien entrega y quien recibe.
  const yFirma = doc.internal.pageSize.getHeight() - 22;
  doc.line(16, yFirma, 76, yFirma);
  doc.line(W - 76, yFirma, W - 16, yFirma);
  doc.setFontSize(8);
  doc.text(t.firmaIzquierda, 46, yFirma + 5, { align: "center" });
  doc.text(t.firmaDerecha, W - 46, yFirma + 5, { align: "center" });
  if (d.firma) pintarFirma(doc, d.firma, ladoDeFirma(d.direccion) === "izquierda" ? 46 : W - 46, yFirma);
  pintarCasillaHuella(doc, casillaDeHuella(d.direccion, W, yFirma), d.huella);
  if (d.hojaFirmada) agregarHoja(doc, d.hojaFirmada, "Recibo firmado guardado en el adelanto");
  if (d.voucher) agregarHoja(doc, d.voucher, "Comprobante de pago");
  return doc;
}

/** El formato que jsPDF necesita, leído del data URL. */
function formatoDe(dataUrl: string): "PNG" | "JPEG" {
  return /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
}

function relacionDe(doc: Pdf, img: ImagenEnPapel): number {
  if (img.relacion && img.relacion > 0) return img.relacion;
  const p = doc.getImageProperties(img.imagen);
  return p.height > 0 ? p.width / p.height : 1;
}

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;

/** La firma sobre su línea (60 mm de ancho, hasta 16 mm de alto) y quién firmó debajo. */
function pintarFirma(doc: Pdf, f: FirmaEnPapel, centro: number, yLinea: number): void {
  const relacion = relacionDe(doc, f);
  const alto = Math.min(16, 56 / Math.max(relacion, 0.1));
  const ancho = alto * relacion;
  doc.addImage(f.imagen, formatoDe(f.imagen), centro - ancho / 2, yLinea - alto - 1, ancho, alto);
  doc.setFontSize(7);
  doc.text(`${f.nombre} · ${rotuloDocumento(f.documento)}`.slice(0, 60), centro, yLinea + 9, { align: "center" });
  doc.text(`Firmó el ${f.fechaHora} (hora de Lima)`, centro, yLinea + 13, { align: "center" });
}

/**
 * La casilla «Huella», SIEMPRE: vacía es para entintar el dedo en el mostrador
 * (quien no sabe firmar); con la foto del registro, la foto adentro sin deformar.
 */
function pintarCasillaHuella(doc: Pdf, c: ReturnType<typeof casillaDeHuella>, huella?: ImagenEnPapel): void {
  doc.setLineWidth(0.3);
  doc.rect(c.x, c.y, c.ancho, c.alto);
  if (huella) {
    const r = relacionDe(doc, huella);
    const margen = 1;
    const anchoUtil = c.ancho - margen * 2;
    const altoUtil = c.alto - margen * 2;
    const ancho = Math.min(anchoUtil, altoUtil * r);
    const alto = ancho / r;
    doc.addImage(huella.imagen, formatoDe(huella.imagen), c.x + (c.ancho - ancho) / 2, c.y + (c.alto - alto) / 2, ancho, alto);
  }
  doc.setFontSize(7);
  doc.text("Huella", c.x + c.ancho / 2, c.y + c.alto + 3.5, { align: "center" });
}

/** Una página aparte con una foto entera y sin deformar (la hoja firmada vieja o el voucher). */
function agregarHoja(doc: Pdf, imagen: string, titulo: string): void {
  doc.addPage("a5", "portrait");
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const props = doc.getImageProperties(imagen);
  const escala = Math.min((W - 20) / props.width, (H - 24) / props.height);
  doc.setFontSize(9);
  doc.text(titulo, 10, 10);
  doc.addImage(imagen, formatoDe(imagen), (W - props.width * escala) / 2, 14, props.width * escala, props.height * escala);
}
