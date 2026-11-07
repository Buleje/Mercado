/**
 * sunat-comprobante — leer y revisar un comprobante electrónico peruano.
 *
 * Un XML de factura o un CDR son, en el drive, archivos opacos: nadie los abre
 * porque no se leen. Pero son los que valen ante SUNAT, y traen todo adentro.
 *
 * Acá se leen y se revisan SIN salir del sistema: qué comprobante es, de quién
 * a quién, por cuánto, y —si es un CDR— si SUNAT lo aceptó o lo rechazó y por
 * qué. Las revisiones son las que se pueden hacer con el archivo en la mano:
 * que el RUC tenga su dígito verificador correcto, que la serie tenga el
 * formato del tipo de comprobante, y que los importes cierren.
 *
 * No reemplaza la consulta al servicio de SUNAT (eso necesita credenciales del
 * contribuyente): responde "este archivo dice esto y es coherente", que es lo
 * que hace falta para archivarlo o para darse cuenta de que llegó rechazado.
 *
 * Módulo puro: sin red, sin base de datos. Sirve en el servidor y en tests.
 */

/** Los tipos que emite una bodega o un aserradero. Código SUNAT (catálogo 01). */
export const TIPOS_COMPROBANTE: Record<string, string> = {
  "01": "Factura",
  "03": "Boleta de venta",
  "07": "Nota de crédito",
  "08": "Nota de débito",
  "09": "Guía de remisión",
  "20": "Comprobante de retención",
  "40": "Comprobante de percepción",
};

export interface Comprobante {
  /** Código del catálogo 01; `null` si el XML no lo declara. */
  tipo: string | null;
  tipoNombre: string | null;
  serie: string | null;
  correlativo: string | null;
  rucEmisor: string | null;
  nombreEmisor: string | null;
  docReceptor: string | null;
  nombreReceptor: string | null;
  fecha: string | null;
  moneda: string | null;
  /** Importes tal como los declara el XML. */
  gravado: number | null;
  igv: number | null;
  total: number | null;
}

export interface Cdr {
  /** 0 = aceptado. 2000-3999 = rechazado. 4000+ = aceptado con observación. */
  codigo: number | null;
  descripcion: string | null;
  /** El comprobante al que responde, ej. "20123456789-01-F001-00000123". */
  referencia: string | null;
  aceptado: boolean;
  observado: boolean;
  rechazado: boolean;
}

export type Severidad = "error" | "aviso" | "ok";

export interface Hallazgo {
  severidad: Severidad;
  mensaje: string;
}

/** Texto de la primera etiqueta que coincida, sin importar el prefijo (cbc:, cac:…). */
function etiqueta(xml: string, nombre: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${nombre}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() || null : null;
}

/** Igual que `etiqueta` pero devuelve TODAS las coincidencias. */
function etiquetas(xml: string, nombre: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${nombre}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
}

function aNumero(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** ¿El archivo parece un XML de comprobante o un CDR? */
export function esArchivoSunat(nombre: string, mime?: string | null): boolean {
  const n = nombre.toLowerCase();
  return n.endsWith(".xml") || (n.startsWith("r-") && n.endsWith(".zip")) || mime === "application/xml" || mime === "text/xml";
}

/**
 * Dígito verificador del RUC (módulo 11 con los pesos de SUNAT).
 * Un RUC mal tipeado es el error más común y el que traba la declaración.
 */
export function rucValido(ruc: string | null | undefined): boolean {
  if (!ruc || !/^\d{11}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((t, p, i) => t + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const esperado = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return esperado === Number(ruc[10]);
}

/** Los dos primeros dígitos dicen qué clase de contribuyente es. */
export function tipoDeRuc(ruc: string): string | null {
  if (ruc.startsWith("10")) return "persona natural";
  if (ruc.startsWith("20")) return "empresa";
  if (ruc.startsWith("15") || ruc.startsWith("17")) return "no domiciliado";
  return null;
}

/** Lee un XML de comprobante (UBL 2.1). Devuelve `null` si no lo parece. */
export function leerComprobante(xml: string): Comprobante | null {
  if (!/<(?:\w+:)?(Invoice|CreditNote|DebitNote|DespatchAdvice)\b/i.test(xml)) return null;

  const id = etiqueta(xml, "ID");
  const [serie, correlativo] = (id ?? "").includes("-") ? (id as string).split("-") : [null, null];

  // El tipo viaja en InvoiceTypeCode; en notas, el documento mismo lo define.
  let tipo = etiqueta(xml, "InvoiceTypeCode");
  if (!tipo && /<(?:\w+:)?CreditNote\b/i.test(xml)) tipo = "07";
  if (!tipo && /<(?:\w+:)?DebitNote\b/i.test(xml)) tipo = "08";
  if (!tipo && /<(?:\w+:)?DespatchAdvice\b/i.test(xml)) tipo = "09";

  // Emisor y receptor: el primer bloque de Party es el que emite.
  const partes = [...xml.matchAll(/<(?:\w+:)?(AccountingSupplierParty|AccountingCustomerParty)\b[\s\S]*?<\/(?:\w+:)?\1>/gi)];
  const bloqueEmisor = partes.find((p) => /SupplierParty/i.test(p[1]))?.[0] ?? "";
  const bloqueReceptor = partes.find((p) => /CustomerParty/i.test(p[1]))?.[0] ?? "";

  const importes = etiquetas(xml, "TaxAmount").map(aNumero).filter((n): n is number => n !== null);

  return {
    tipo,
    tipoNombre: tipo ? TIPOS_COMPROBANTE[tipo] ?? null : null,
    serie: serie || null,
    correlativo: correlativo || null,
    rucEmisor: etiqueta(bloqueEmisor, "ID"),
    nombreEmisor: etiqueta(bloqueEmisor, "RegistrationName") ?? etiqueta(bloqueEmisor, "Name"),
    docReceptor: etiqueta(bloqueReceptor, "ID"),
    nombreReceptor: etiqueta(bloqueReceptor, "RegistrationName") ?? etiqueta(bloqueReceptor, "Name"),
    fecha: etiqueta(xml, "IssueDate"),
    moneda: etiqueta(xml, "DocumentCurrencyCode"),
    gravado: aNumero(etiqueta(xml, "LineExtensionAmount")),
    // El IGV es el mayor de los impuestos declarados (hay TaxAmount por línea).
    igv: importes.length ? Math.max(...importes) : null,
    total: aNumero(etiqueta(xml, "PayableAmount")),
  };
}

/** Lee un CDR (ApplicationResponse). Devuelve `null` si no lo es. */
export function leerCdr(xml: string): Cdr | null {
  if (!/<(?:\w+:)?ApplicationResponse\b/i.test(xml)) return null;
  const codigo = aNumero(etiqueta(xml, "ResponseCode"));
  const descripcion = etiqueta(xml, "Description");
  const referencia = etiqueta(xml, "DocumentReference") ? etiqueta(xml, "ID") : etiqueta(xml, "ID");

  // Catálogo 19 de SUNAT: 0 aceptado · 2000-3999 rechazado · 4000+ observado.
  const aceptado = codigo === 0;
  const rechazado = codigo !== null && codigo >= 2000 && codigo < 4000;
  const observado = codigo !== null && codigo >= 4000;

  return { codigo, descripcion, referencia, aceptado, observado, rechazado };
}

/**
 * Revisa lo que se puede revisar con el archivo en la mano.
 *
 * No inventa reglas: cada hallazgo apunta a algo que haría que SUNAT lo
 * rechace o que el contador tenga que corregir.
 */
export function revisarComprobante(c: Comprobante): Hallazgo[] {
  const out: Hallazgo[] = [];

  if (!c.rucEmisor) out.push({ severidad: "error", mensaje: "El XML no declara el RUC del emisor." });
  else if (!rucValido(c.rucEmisor)) out.push({ severidad: "error", mensaje: `El RUC del emisor (${c.rucEmisor}) no pasa el dígito verificador.` });

  // Una factura SIEMPRE va a RUC; una boleta puede ir a DNI o sin documento.
  if (c.tipo === "01") {
    if (!c.docReceptor) out.push({ severidad: "error", mensaje: "Una factura necesita el RUC del cliente." });
    else if (!rucValido(c.docReceptor)) out.push({ severidad: "error", mensaje: `El RUC del cliente (${c.docReceptor}) no pasa el dígito verificador.` });
  }

  // Serie: F/B + 3 caracteres para factura y boleta electrónicas.
  if (c.serie) {
    const esperado = c.tipo === "01" ? /^F[A-Z0-9]{3}$/ : c.tipo === "03" ? /^B[A-Z0-9]{3}$/ : null;
    if (esperado && !esperado.test(c.serie)) {
      out.push({ severidad: "aviso", mensaje: `La serie "${c.serie}" no tiene el formato habitual para ${c.tipoNombre ?? "este tipo"} (${c.tipo === "01" ? "F más 3" : "B más 3"}).` });
    }
  }

  // Los importes tienen que cerrar: gravado + IGV = total (con el redondeo).
  if (c.gravado !== null && c.igv !== null && c.total !== null) {
    const diferencia = Math.abs(c.gravado + c.igv - c.total);
    if (diferencia > 0.05) {
      out.push({ severidad: "error", mensaje: `Los importes no cierran: ${c.gravado} + ${c.igv} = ${(c.gravado + c.igv).toFixed(2)}, pero el total dice ${c.total}.` });
    }
  }

  // El IGV peruano es 18%: una diferencia grande suele ser un error de carga.
  if (c.gravado !== null && c.igv !== null && c.gravado > 0) {
    const tasa = c.igv / c.gravado;
    if (tasa > 0.01 && Math.abs(tasa - 0.18) > 0.02) {
      out.push({ severidad: "aviso", mensaje: `El IGV es el ${(tasa * 100).toFixed(1)}% del gravado, y lo habitual es 18%.` });
    }
  }

  if (!c.fecha) out.push({ severidad: "aviso", mensaje: "El XML no declara fecha de emisión." });

  if (out.length === 0) out.push({ severidad: "ok", mensaje: "El comprobante es coherente: RUC válido, serie e importes correctos." });
  return out;
}
