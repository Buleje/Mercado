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
import type { CanalFirma } from "@/lib/adelantos/entregar-tipos";
import { TEXTO_CONFIRMADO_PASSKEY } from "@/lib/adelantos/passkey-tipos";
import type { MembreteDocumento } from "@/lib/documentos/membrete-pdf";
import { logger } from "@/lib/logger";

export interface DatosComprobante {
  codigoOperacion?: string | null;
  reciboManual?: string | null;
  persona: string;
  documento?: string | null;
  /**
   * La copia que sale del negocio (WhatsApp, 23-10): el DNI va tapado
   * («****5678») en la línea «Documento» y debajo de la firma (Ley 29733). El
   * papel que se imprime en el mostrador lo lleva entero.
   */
  taparDocumento?: boolean;
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
  huella?: HuellaEnPapel;
  /**
   * (ADR-491) El monto que decía el recibo cuando se firmó. Si después se
   * corrigió el adelanto, el papel lo dice: la firma vale por lo que se vio.
   */
  montoFirmado?: number | null;
  /** (ADR-491) La foto del voucher (data URL JPEG), en una página aparte «Comprobante de pago». */
  voucher?: string;
  /** (23-10) Cuándo se tomó esa foto, ya escrita («jueves 23/10/2026 · 14:05»): va en el título de su página. */
  voucherFechaHora?: string;
  /** (23-10) Cuándo vence (date-only o ISO): va en el detalle. */
  vence?: string | null;
  /** (23-10) Lo ya liquidado y lo que falta: el detalle los dice sólo si ya hubo entregas. */
  liquidado?: number | null;
  saldo?: number | null;
  /** (23-10) Pies tablares pactados (forestal), en el detalle. */
  piesTablares?: number | null;
  /** (23-10) Las entregas pactadas, en una tabla chica debajo del detalle. */
  entregasPactadas?: EntregaPactadaEnPapel[];
  /**
   * (23-10) El membrete del negocio: logo (o monograma), nombre, RUC y datos.
   * `undefined` = `descargarComprobante` lo trae solo; `null` = sin membrete
   * (sale el nombre de `negocio` con el monograma).
   */
  membrete?: MembreteDocumento | null;
  /** (23-10) A4 vertical (por defecto) o media hoja (A5 apaisado, para el mostrador). */
  formato?: FormatoComprobante;
}

export type FormatoComprobante = "a4" | "media-hoja";

export interface EntregaPactadaEnPapel {
  numero: number;
  descripcion: string;
  valor: number;
  fecha?: string | null;
  /** Ya se entregó: en vez de la fecha dice «Cumplida». */
  cumplida?: boolean;
}

/** Una imagen para el papel: data URL PNG o JPEG (jsPDF no lee webp). */
export interface ImagenEnPapel {
  imagen: string;
  /** Ancho ÷ alto; si falta, se lee de la imagen. */
  relacion?: number;
  /** (23-10) Cuándo quedó en el registro, ya escrita: la huella la lleva debajo de su casilla. */
  fechaHora?: string;
}

/** (23-10) La huella dice CÓMO se tomó: debajo de su casilla, «Huella (cámara)». */
export interface HuellaConImagen extends ImagenEnPapel {
  metodo?: string;
  passkey?: undefined;
}

/**
 * (ADR-513) La passkey del celular no tiene imagen: la casilla lleva el texto
 * «Lo confirmó el aparato registrado para esta persona (passkey) el 23/10 14:05»
 * y, debajo, de dónde salió la llave («llave registrada con este mismo enlace»).
 */
export interface HuellaPorPasskey {
  passkey: true;
  /** «23/10 14:05», hora de Lima. */
  confirmadaEn: string;
  /** `textoLlavePasskey(...)`; ausente en las firmas de antes de la constancia v2. */
  llave?: string;
  metodo?: string;
  fechaHora?: string;
  imagen?: undefined;
  relacion?: undefined;
}

export type HuellaEnPapel = HuellaConImagen | HuellaPorPasskey;

/** El texto de la casilla de una passkey: lo que prueba, sin decir «su huella». */
export function textoHuellaPasskey(confirmadaEn: string): string {
  return `${TEXTO_CONFIRMADO_PASSKEY} el ${confirmadaEn}`;
}

/** «jueves 23/10/2026 · 14:05» → «23/10 14:05» (lo corto que entra en la casilla). */
export function diaYHoraCortos(fechaHora: string): string {
  const m = /(\d{2}\/\d{2})\/\d{4} · (\d{2}:\d{2})/.exec(fechaHora);
  return m ? `${m[1]} ${m[2]}` : fechaHora;
}

/**
 * Cómo se tomó la huella, por el canal del registro: en la pantalla del negocio
 * (escaneada con la cámara o la foto del dedo), en SU celular por el enlace, o
 * pasada de una hoja en papel. Corto: va en 7 pt bajo una casilla de 22 mm.
 */
export function metodoDeHuella(canal: CanalFirma): string {
  return canal === "ENLACE" ? "su celular" : canal === "BACKFILL" ? "de la hoja" : "cámara";
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

/** «****5678»: sólo los 4 últimos, para la copia que se comparte. */
export function documentoTapado(documento: string): string {
  const d = documento.trim();
  return `****${d.length > 4 ? d.slice(-4) : ""}`;
}

/** «DNI 12345678» si son 8 números; si no, «Doc. X» (carné de extranjería, pasaporte). Con `tapar`, «DNI ****5678». */
export function rotuloDocumento(documento: string, tapar = false): string {
  const d = documento.trim();
  const v = tapar ? documentoTapado(d) : d;
  return /^\d{8}$/.test(d) ? `DNI ${v}` : `Doc. ${v}`;
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

/**
 * Arma y descarga el comprobante. Sin `membrete` en los datos, trae el del
 * negocio (logo incluido); si no llega, el papel sale igual con el monograma.
 */
export async function descargarComprobante(d: DatosComprobante): Promise<void> {
  const membrete =
    d.membrete !== undefined
      ? d.membrete
      : await import("@/lib/documentos/membrete-cargar")
          .then((m) => m.membreteDelDocumento())
          .catch((e: unknown) => {
            logger.warn("[adelantos] el recibo sale sin membrete", { error: String(e) });
            return null;
          });
  const doc = await armarComprobante({ ...d, membrete });
  doc.save(`adelanto-${(d.codigoOperacion ?? "sin-codigo").toLowerCase()}.pdf`);
}

type Pdf = InstanceType<(typeof import("jspdf"))["default"]>;

/**
 * El PDF sin bajarlo (así se prueba fuera del navegador). Carga jsPDF y el
 * dibujo en demanda: pesan. A4 vertical; «media hoja» = A5 apaisado, que entra
 * en medio A4 y es como se imprime en el mostrador.
 */
export async function armarComprobante(d: DatosComprobante): Promise<Pdf> {
  const [{ default: jsPDF }, { dibujarComprobante }] = await Promise.all([import("jspdf"), import("./comprobante-pdf")]);
  const doc = d.formato === "media-hoja" ? new jsPDF({ format: "a5", orientation: "landscape" }) : new jsPDF({ format: "a4", orientation: "portrait" });
  dibujarComprobante(doc, d);
  return doc;
}
