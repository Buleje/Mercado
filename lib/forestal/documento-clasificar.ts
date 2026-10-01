/**
 * documento-clasificar — qué papel es el que acaban de subir (ADR-371).
 *
 * Un despacho viaja con una carpeta de papeles: la GTF, su lista de productos,
 * la guía de remisión del remitente, la factura, las guías de origen, la
 * resolución del título habilitante, la guía del transportista. Todos llegan
 * como PDF o como foto del celular, con nombres tipo `IMG_20260808.jpg`, y sin
 * clasificar el expediente es una pila.
 *
 * Se clasifica con lo que se puede leer sin abrir el archivo —**el nombre**— y,
 * cuando hay texto (el PDF lo trae o el OCR lo extrajo), con **el contenido**,
 * que es mucho más confiable: los formatos del SNIFFS y de SUNAT tienen frases
 * y numeraciones propias.
 *
 * Devuelve SIEMPRE una etiqueta y una **confianza**: la pantalla propone y el
 * operador confirma. Adivinar en silencio es peor que preguntar — un papel mal
 * etiquetado en un expediente de fiscalización no se encuentra nunca.
 *
 * PURO y client-safe.
 */

export const TIPOS_DOCUMENTO_DESPACHO = [
  "GTF",
  "Lista de Productos",
  "Guía de Remisión Remitente",
  "Guía de Remisión Transportista",
  "Factura",
  "Boleta",
  "Guía de Origen",
  "Resolución o Registro de Plantación",
  "Constancia SERFOR",
  "Otro",
] as const;

export type TipoDocumentoDespacho = (typeof TIPOS_DOCUMENTO_DESPACHO)[number];

export interface Clasificacion {
  tipo: TipoDocumentoDespacho;
  /** 0-100. Debajo de `CONFIANZA_MINIMA` la pantalla pide confirmación expresa. */
  confianza: number;
  /** Qué disparó la decisión, para que el operador pueda desconfiar con motivo. */
  motivo: string;
  /** Número del documento si el texto lo trae (GTF, F001-123, etc.). */
  numero?: string;
}

/** Debajo de esto se marca como «revisá»: la etiqueta es una propuesta. */
export const CONFIANZA_MINIMA = 60;

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Reglas, de la más específica a la más general.
 *
 * `texto` pesa más que `nombre`: el nombre lo puso una persona apurada, el
 * contenido lo puso el sistema que emitió el papel.
 */
const REGLAS: {
  tipo: TipoDocumentoDespacho;
  /** Frases del CONTENIDO. Una sola alcanza. */
  texto: RegExp[];
  /** Pistas del NOMBRE del archivo. */
  nombre: RegExp[];
}[] = [
  {
    tipo: "Lista de Productos",
    texto: [/lista\s+de\s+productos/, /anexo\s*n?\s*[°º]?\s*0?4/, /detalle\s+de\s+productos\s+transformados/],
    nombre: [/lista[-_ ]?de[-_ ]?productos/, /anexo[-_ ]?0?4/],
  },
  {
    tipo: "GTF",
    texto: [
      /gu[ií]a\s+de\s+transporte\s+forestal/,
      /gtf\s*n?\s*[°º]?\s*\d/,
      /transporte\s+forestal.*declaraci[oó]n\s+jurada/,
    ],
    nombre: [/\bgtf\b/, /guia[-_ ]?transporte/, /transporte[-_ ]?forestal/],
  },
  {
    tipo: "Guía de Remisión Transportista",
    texto: [/gu[ií]a\s+de\s+remisi[oó]n\s*[-–]?\s*transportista/, /remisi[oó]n\s+transportista/],
    nombre: [/remision[-_ ]?transportista/, /\bgrt\b/],
  },
  {
    tipo: "Guía de Remisión Remitente",
    texto: [/gu[ií]a\s+de\s+remisi[oó]n\s*[-–]?\s*remitente/, /remisi[oó]n\s+remitente/, /\bt001\s*-\s*\d/],
    nombre: [/remision[-_ ]?remitente/, /\bgrr\b/, /guia[-_ ]?remision/],
  },
  {
    tipo: "Factura",
    texto: [/factura\s+electr[oó]nica/, /\bfactura\b/, /\bf\d{3}\s*-\s*\d+/, /igv/],
    nombre: [/\bfactura\b/, /\bf\d{3}-\d+/],
  },
  {
    tipo: "Boleta",
    texto: [/boleta\s+de\s+venta/, /\bb\d{3}\s*-\s*\d+/],
    nombre: [/\bboleta\b/, /\bb\d{3}-\d+/],
  },
  {
    tipo: "Guía de Origen",
    texto: [/gu[ií]a\s+de\s+origen/, /origen\s+del\s+recurso\s+forestal/],
    nombre: [/guia[-_ ]?origen/, /\bgo\b/],
  },
  {
    tipo: "Resolución o Registro de Plantación",
    texto: [
      /resoluci[oó]n\s+(directoral|de\s+direcci[oó]n)/,
      /\br\.?d\.?\s*n?\s*[°º]?\s*\d/,
      /registro\s+de\s+plantaci[oó]n/,
      /t[ií]tulo\s+habilitante/,
      /contrato\s+de\s+concesi[oó]n/,
    ],
    nombre: [/resolucion/, /\brd[-_ ]?\d/, /plantacion/, /titulo[-_ ]?habilitante/, /concesion/],
  },
  {
    tipo: "Constancia SERFOR",
    texto: [/constancia.*sniffs/, /sniffs/, /serfor.*constancia/],
    nombre: [/constancia/, /sniffs/],
  },
];

/** El número del documento, cuando el texto lo canta con un formato conocido. */
function numeroDe(texto: string): string | undefined {
  const patrones = [
    /\b([A-Z]{1,4}\d{2,3}\s*-\s*\d{3,10})\b/, // F001-00001234, T001-123
    /gtf\s*n?\s*[°º]?\s*([\d-]{5,20})/i,
    /\bn[°º]\s*([\d-]{5,20})\b/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m?.[1]) return m[1].replace(/\s+/g, "");
  }
  return undefined;
}

/**
 * Clasifica un archivo. `texto` es lo que se pudo leer del contenido (vacío si
 * es una foto sin OCR): sin él la confianza baja sola, que es lo honesto.
 */
export function clasificarDocumento(nombreArchivo: string, texto = ""): Clasificacion {
  const n = norm(nombreArchivo);
  const t = norm(texto).replace(/\s+/g, " ");

  let mejor: Clasificacion = {
    tipo: "Otro",
    confianza: 0,
    motivo: "Ni el nombre ni el contenido dicen qué papel es.",
  };

  for (const regla of REGLAS) {
    const porTexto = t ? regla.texto.find((r) => r.test(t)) : undefined;
    const porNombre = regla.nombre.find((r) => r.test(n));
    if (!porTexto && !porNombre) continue;
    /* El contenido manda: el nombre lo puso alguien apurado, el texto lo puso el
       sistema que emitió el papel. Los dos juntos son casi certeza. */
    const confianza = porTexto && porNombre ? 95 : porTexto ? 85 : 55;
    /* El motivo se escribe para una persona: mostrar el regex («guiíasde…») era
       ruido que además hacía dudar del acierto. */
    const motivo = porTexto && porNombre
      ? "Lo dicen el contenido y el nombre del archivo"
      : porTexto
        ? "Lo dice el contenido del archivo"
        : "Lo sugiere el nombre del archivo";
    if (confianza > mejor.confianza) mejor = { tipo: regla.tipo, confianza, motivo };
  }

  const numero = numeroDe(texto || nombreArchivo);
  return numero ? { ...mejor, numero } : mejor;
}

/** ¿Alcanza para etiquetar sin preguntar? */
export const esConfiable = (c: Clasificacion) => c.confianza >= CONFIANZA_MINIMA;

/**
 * Nombre con el que el papel se va a encontrar dentro de seis meses.
 * `GTF 001-0000025 · Factura F001-123` es buscable; `IMG_20260808.jpg` no.
 */
export function nombreDeArchivo(c: Clasificacion, gtf: string | null | undefined, original: string): string {
  const ext = original.includes(".") ? original.slice(original.lastIndexOf(".")) : "";
  const partes = [gtf?.trim() ? `GTF ${gtf.trim()}` : null, c.tipo, c.numero].filter(Boolean);
  return `${partes.join(" · ")}${ext}`.slice(0, 200);
}
