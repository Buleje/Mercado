/**
 * factura-xml.ts — lee la factura electrónica (XML UBL 2.1 de SUNAT) que te
 * manda el proveedor, para armar la compra sola (como Alegra/Siigo).
 *
 * Lee facturas (01) y boletas (03). Las notas de crédito y débito, la
 * constancia de SUNAT (CDR) y las guías se rechazan con un mensaje claro.
 *
 * Seguridad (el XML viene de afuera):
 *  - Cualquier `<!DOCTYPE` o `<!ENTITY` se rechaza ANTES de leer: sin
 *    entidades externas (XXE) ni «mil risas». SUNAT nunca los usa.
 *  - Tope de 2 MB (una factura con 200 líneas pesa ~300 KB) y de profundidad.
 *  - Los prefijos de namespace no importan (`cbc:`, `ns2:` o ninguno): se
 *    busca por nombre local y sólo entre hijos directos, así el `cbc:ID` de
 *    la firma (`cac:Signature`) nunca se confunde con el número del papel.
 *
 * El cuadre (líneas + impuestos = total) usa S/ 0.05 de tolerancia, la unidad
 * del negocio: si no cuadra es un AVISO, no un error (el papel manda).
 *
 * PURO: sin Prisma, React ni fetch. Lector XML propio (no hay parser en
 * package.json y no se instala uno para esto).
 */

export const TOPE_BYTES_XML = 2 * 1024 * 1024;
export const TOLERANCIA_CUADRE = 0.05;
const PROFUNDIDAD_MAX = 100;

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type TipoComprobanteXml = "factura" | "boleta";
export type TipoDocumentoCliente = "RUC" | "DNI" | "CE" | "PASAPORTE" | "OTRO";

export interface LineaFacturaXml {
  /** Orden en el papel (1, 2, 3…). */
  numero: number;
  descripcion: string;
  /** Código interno del proveedor (`SellersItemIdentification`). */
  codigoVendedor: string | null;
  /** GTIN/EAN si el proveedor lo manda (`StandardItemIdentification`). */
  codigoBarras: string | null;
  cantidad: number;
  /** Código de unidad de SUNAT tal cual (NIU, KGM, BX…). */
  unidadSunat: string | null;
  /** La misma unidad en palabras del negocio («unidad», «kg», «caja»). */
  unidad: string;
  /** Precio unitario SIN IGV (`Price/PriceAmount`). */
  precioUnitario: number;
  /** Precio unitario CON IGV si el papel lo trae (`PricingReference`, tipo 01). */
  precioUnitarioConIgv: number | null;
  /** Valor de venta de la línea, sin IGV (`LineExtensionAmount`). */
  valorVenta: number;
  /** Impuestos de la línea (`TaxTotal/TaxAmount`). */
  igv: number;
  /** Bonificación: va gratis (valor referencial tipo 02), no suma al total. */
  gratuita: boolean;
  /** Lo que cuesta la línea con impuestos (0 si es gratuita). Derivado. */
  total: number;
}

export interface FacturaXml {
  tipo: TipoComprobanteXml;
  codigoTipo: "01" | "03";
  serie: string;
  numero: string;
  /** Como viene en el papel, p. ej. «F001-00000123». */
  serieNumero: string;
  /** AAAA-MM-DD. */
  fecha: string;
  fechaVencimiento: string | null;
  moneda: string;
  emisor: { ruc: string; razonSocial: string; nombreComercial: string | null };
  cliente: { tipoDocumento: TipoDocumentoCliente | null; documento: string | null; nombre: string | null };
  lineas: LineaFacturaXml[];
  totales: {
    /** Σ valor de venta de las líneas cobradas (sin gratuitas). Calculado. */
    valorVenta: number;
    /** El subtotal que declara el papel (`LegalMonetaryTotal/LineExtensionAmount`). */
    valorVentaDeclarado: number | null;
    igv: number;
    /** ISC, ICBPER (bolsas) y otros: impuestos del papel menos el IGV. */
    otrosImpuestos: number;
    descuentos: number;
    cargos: number;
    anticipos: number;
    redondeo: number;
    /** Importe total a pagar que declara el papel (`PayableAmount`). */
    total: number;
  };
  cuadre: { cuadra: boolean; calculado: number; declarado: number; diferencia: number };
  avisos: string[];
}

export type LecturaFacturaXml = { ok: true; factura: FacturaXml } | { ok: false; error: string };

// ── Lector XML mínimo ───────────────────────────────────────────────────────

interface Nodo {
  nombre: string;
  attrs: Record<string, string>;
  hijos: Nodo[];
  texto: string;
}

class ErrorXml extends Error {}

const MAL_FORMADO = "El XML está incompleto o dañado. Descárgalo de nuevo del correo del proveedor.";

function nombreLocal(nombre: string): string {
  return nombre.slice(nombre.indexOf(":") + 1);
}

function decodificar(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (todo, ent: string) => {
    if (ent === "amp") return "&";
    if (ent === "lt") return "<";
    if (ent === "gt") return ">";
    if (ent === "quot") return '"';
    if (ent === "apos") return "'";
    const cp = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : todo;
  });
}

function leerAtributos(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const nombre = m[1] ?? "";
    if (nombre === "xmlns" || nombre.startsWith("xmlns:")) continue;
    attrs[nombreLocal(nombre)] = decodificar(m[2] ?? m[3] ?? "");
  }
  return attrs;
}

/** Índice del `>` que cierra la etiqueta abierta en `desde`, saltando comillas. */
function finDeEtiqueta(xml: string, desde: number): number {
  let comilla = "";
  for (let i = desde + 1; i < xml.length; i++) {
    const c = xml[i];
    if (comilla) {
      if (c === comilla) comilla = "";
    } else if (c === '"' || c === "'") comilla = c;
    else if (c === ">") return i;
  }
  return -1;
}

function parsear(xml: string): Nodo {
  const doc: Nodo = { nombre: "#doc", attrs: {}, hijos: [], texto: "" };
  const pila: Nodo[] = [doc];
  const actual = (): Nodo => pila[pila.length - 1] ?? doc;
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      actual().texto += decodificar(xml.slice(i));
      break;
    }
    if (lt > i) actual().texto += decodificar(xml.slice(i, lt));
    if (xml.startsWith("<!--", lt)) {
      const fin = xml.indexOf("-->", lt + 4);
      if (fin === -1) throw new ErrorXml(MAL_FORMADO);
      i = fin + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const fin = xml.indexOf("]]>", lt + 9);
      if (fin === -1) throw new ErrorXml(MAL_FORMADO);
      actual().texto += xml.slice(lt + 9, fin);
      i = fin + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const fin = xml.indexOf("?>", lt + 2);
      if (fin === -1) throw new ErrorXml(MAL_FORMADO);
      i = fin + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) throw new ErrorXml(MENSAJE_DOCTYPE);
    const fin = finDeEtiqueta(xml, lt);
    if (fin === -1) throw new ErrorXml(MAL_FORMADO);
    const cuerpo = xml.slice(lt + 1, fin);
    if (cuerpo.startsWith("/")) {
      const cerrado = pila.pop();
      if (!cerrado || pila.length === 0 || cerrado.nombre !== nombreLocal(cuerpo.slice(1).trim())) {
        throw new ErrorXml(MAL_FORMADO);
      }
    } else {
      const autocierre = cuerpo.endsWith("/");
      const interior = autocierre ? cuerpo.slice(0, -1) : cuerpo;
      const m = /^[^\s/>]+/.exec(interior);
      if (!m) throw new ErrorXml(MAL_FORMADO);
      const nodo: Nodo = { nombre: nombreLocal(m[0]), attrs: leerAtributos(interior.slice(m[0].length)), hijos: [], texto: "" };
      actual().hijos.push(nodo);
      if (!autocierre) {
        pila.push(nodo);
        if (pila.length > PROFUNDIDAD_MAX) throw new ErrorXml(MAL_FORMADO);
      }
    }
    i = fin + 1;
  }
  if (pila.length !== 1 || doc.hijos.length !== 1 || doc.texto.trim() !== "") throw new ErrorXml(MAL_FORMADO);
  const raiz = doc.hijos[0];
  if (!raiz) throw new ErrorXml(MAL_FORMADO);
  return raiz;
}

// ── Navegación (sólo hijos directos, por nombre local) ──────────────────────

function hijo(n: Nodo | undefined, nombre: string): Nodo | undefined {
  return n?.hijos.find((h) => h.nombre === nombre);
}

function hijosDe(n: Nodo | undefined, nombre: string): Nodo[] {
  return n ? n.hijos.filter((h) => h.nombre === nombre) : [];
}

function ruta(n: Nodo | undefined, ...nombres: string[]): Nodo | undefined {
  let actual = n;
  for (const nombre of nombres) actual = hijo(actual, nombre);
  return actual;
}

function textoDe(n: Nodo | undefined): string | null {
  const t = n?.texto.trim();
  return t ? t : null;
}

function texto(n: Nodo | undefined, ...nombres: string[]): string | null {
  return textoDe(ruta(n, ...nombres));
}

class ErrorDato extends Error {}

/** Monto del XML (punto decimal). `null` si no está; ErrorDato si no es número. */
function monto(n: Nodo | undefined, que: string, ...nombres: string[]): number | null {
  const t = texto(n, ...nombres);
  if (t === null) return null;
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) throw new ErrorDato(`${que} no es un número («${t.slice(0, 20)}»).`);
  return Number(t);
}

function montoObligatorio(n: Nodo | undefined, que: string, ...nombres: string[]): number {
  const v = monto(n, que, ...nombres);
  if (v === null) throw new ErrorDato(`Falta ${que} en el XML.`);
  return v;
}

const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
const sumar = (xs: number[]): number => Math.round(xs.reduce((t, x) => t + Math.round(x * 100), 0)) / 100;

// ── Catálogos de SUNAT ──────────────────────────────────────────────────────

const MENSAJE_DOCTYPE =
  "Este XML trae una sección DOCTYPE, que las facturas de SUNAT no usan. Por seguridad no se lee: pide al proveedor el XML original.";

/** Unidades de medida más comunes (catálogo 03 de SUNAT) en palabras del negocio. */
const UNIDADES: Record<string, string> = {
  NIU: "unidad", ZZ: "unidad", C62: "unidad", KGM: "kg", GRM: "g", TNE: "tonelada", LTR: "litro",
  MLT: "ml", GLL: "galón", MTR: "metro", MTK: "m²", MTQ: "m³", FOT: "pie", BX: "caja", PK: "paquete",
  BG: "bolsa", BO: "botella", CA: "lata", DZN: "docena", SA: "saco", BJ: "balde", CEN: "ciento",
  MIL: "millar", PR: "par", SET: "juego", RO: "rollo", TU: "tubo", PG: "placa", PF: "paleta",
};

function unidadLegible(codigo: string | null): string {
  if (!codigo) return "unidad";
  return UNIDADES[codigo.toUpperCase()] ?? codigo.toLowerCase();
}

function tipoDocumentoCliente(scheme: string | null | undefined, doc: string | null): TipoDocumentoCliente | null {
  if (!doc || doc === "-" || /^0+$/.test(doc)) return null;
  switch (scheme) {
    case "6": return "RUC";
    case "1": return "DNI";
    case "4": return "CE";
    case "7": return "PASAPORTE";
    default: return /^\d{11}$/.test(doc) ? "RUC" : /^\d{8}$/.test(doc) ? "DNI" : "OTRO";
  }
}

/** Dígito verificador del RUC (módulo 11): sólo para avisar. */
function rucCuadra(ruc: string): boolean {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((t, p, i) => t + p * Number(ruc[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(ruc[10]);
}

// ── Lectura de la factura ───────────────────────────────────────────────────

function fallo(error: string): LecturaFacturaXml {
  return { ok: false, error };
}

function pesoEnBytes(s: string): number {
  if (s.length * 3 <= TOPE_BYTES_XML) return s.length; // cota: nunca pasa el tope
  return new TextEncoder().encode(s).byteLength;
}

function rechazoPorRaiz(nombre: string): string | null {
  switch (nombre) {
    case "Invoice": return null;
    case "CreditNote": return "Este XML es una nota de crédito. Por ahora solo se leen facturas y boletas.";
    case "DebitNote": return "Este XML es una nota de débito. Por ahora solo se leen facturas y boletas.";
    case "ApplicationResponse":
      return "Este XML es la constancia de SUNAT (CDR), no la factura. Busca en el correo el otro XML (el que empieza con el RUC del proveedor).";
    case "DespatchAdvice": return "Este XML es una guía de remisión. Por ahora solo se leen facturas y boletas.";
    default: return "Este archivo no es una factura electrónica de SUNAT. Sube el XML de la factura o boleta.";
  }
}

function leerParte(party: Nodo | undefined): { id: string | null; scheme: string | null; nombre: string | null; comercial: string | null } {
  const ids = hijosDe(party, "PartyIdentification").map((p) => hijo(p, "ID"));
  const idNodo = ids.find((n) => n?.attrs.schemeID === "6") ?? ids[0];
  return {
    id: textoDe(idNodo),
    scheme: idNodo?.attrs.schemeID ?? null,
    nombre: texto(party, "PartyLegalEntity", "RegistrationName") ?? texto(party, "PartyName", "Name"),
    comercial: texto(party, "PartyName", "Name"),
  };
}

function leerLinea(l: Nodo, indice: number): LineaFacturaXml {
  const que = (campo: string) => `${campo} de la línea ${indice + 1}`;
  const cantidadNodo = hijo(l, "InvoicedQuantity");
  const cantidad = montoObligatorio(l, que("La cantidad"), "InvoicedQuantity");
  const valorVenta = montoObligatorio(l, que("El valor de venta"), "LineExtensionAmount");
  const precios = hijosDe(hijo(l, "PricingReference"), "AlternativeConditionPrice");
  const precioDeTipo = (tipo: string) => precios.find((p) => texto(p, "PriceTypeCode") === tipo);
  const gratuita = precioDeTipo("02") !== undefined;
  const conIgvNodo = precioDeTipo("01");
  const precioDeclarado = monto(l, que("El precio unitario"), "Price", "PriceAmount");
  const igv = sumar(hijosDe(l, "TaxTotal").map((t) => montoObligatorio(t, que("El IGV"), "TaxAmount")));
  const item = hijo(l, "Item");
  const descripcion = hijosDe(item, "Description").map(textoDe).filter((t): t is string => t !== null).join(" ")
    || texto(item, "Name") || "(sin descripción)";
  const unidadSunat = cantidadNodo?.attrs.unitCode?.trim() || null;
  return {
    numero: indice + 1,
    descripcion: descripcion.replace(/\s+/g, " ").trim(),
    codigoVendedor: texto(item, "SellersItemIdentification", "ID"),
    codigoBarras: texto(item, "StandardItemIdentification", "ID"),
    cantidad,
    unidadSunat,
    unidad: unidadLegible(unidadSunat),
    precioUnitario: precioDeclarado ?? (cantidad > 0 ? valorVenta / cantidad : 0),
    precioUnitarioConIgv: conIgvNodo ? monto(conIgvNodo, que("El precio con IGV"), "PriceAmount") : null,
    valorVenta,
    igv,
    gratuita,
    total: gratuita ? 0 : r2(valorVenta + igv),
  };
}

/** IGV del documento: el subtotal con esquema 1000; si no está, todos los impuestos. */
function igvDelDocumento(taxTotales: Nodo[], impuestos: number): number {
  const subtotales = taxTotales.flatMap((t) => hijosDe(t, "TaxSubtotal"));
  const deIgv = subtotales.filter((s) => texto(s, "TaxCategory", "TaxScheme", "ID") === "1000");
  if (deIgv.length === 0) return impuestos;
  return sumar(deIgv.map((s) => montoObligatorio(s, "El IGV del documento", "TaxAmount")));
}

function leerInvoice(raiz: Nodo): FacturaXml {
  const avisos: string[] = [];

  const codigoTipo = texto(raiz, "InvoiceTypeCode");
  if (codigoTipo !== "01" && codigoTipo !== "03") {
    throw new ErrorDato(codigoTipo
      ? `El comprobante es de tipo ${codigoTipo}. Por ahora solo se leen facturas (01) y boletas (03).`
      : "El XML no dice si es factura o boleta (falta InvoiceTypeCode).");
  }

  const serieNumero = texto(raiz, "ID");
  if (!serieNumero) throw new ErrorDato("Falta el número del comprobante (serie y número) en el XML.");
  const guion = serieNumero.indexOf("-");
  const serie = guion > 0 ? serieNumero.slice(0, guion) : serieNumero;
  const numero = guion > 0 ? serieNumero.slice(guion + 1) : "";
  if (!/^[A-Z0-9]{4}-\d{1,8}$/i.test(serieNumero)) avisos.push(`El número «${serieNumero}» no tiene la forma de SUNAT (F001-123). Revísalo.`);

  const fecha = texto(raiz, "IssueDate");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorDato("Falta la fecha de emisión en el XML.");
  const vence = texto(raiz, "DueDate") ?? texto(raiz, "PaymentTerms", "PaymentDueDate");

  const totalNodo = ruta(raiz, "LegalMonetaryTotal", "PayableAmount");
  let moneda = texto(raiz, "DocumentCurrencyCode") ?? totalNodo?.attrs.currencyID ?? null;
  if (!moneda) {
    moneda = "PEN";
    avisos.push("El XML no dice la moneda: se toma soles (PEN).");
  } else if (moneda !== "PEN") {
    avisos.push(`La factura está en ${moneda}: los montos se muestran en esa moneda, no en soles.`);
  }

  const proveedor = hijo(raiz, "AccountingSupplierParty");
  const emisor = leerParte(hijo(proveedor, "Party"));
  const ruc = emisor.id ?? texto(proveedor, "CustomerAssignedAccountID");
  if (!ruc) throw new ErrorDato("No se encontró el RUC del proveedor en el XML.");
  if (!/^\d{11}$/.test(ruc)) throw new ErrorDato(`El RUC del proveedor («${ruc.slice(0, 20)}») no tiene 11 dígitos.`);
  if (!rucCuadra(ruc)) avisos.push(`El RUC ${ruc} no pasa el dígito verificador de SUNAT. Revísalo con el papel.`);
  const razonSocial = emisor.nombre ?? emisor.comercial ?? `RUC ${ruc}`;

  const comprador = hijo(raiz, "AccountingCustomerParty");
  const cli = leerParte(hijo(comprador, "Party"));
  const docCliente = cli.id ?? texto(comprador, "CustomerAssignedAccountID");
  const schemeCliente = cli.scheme ?? texto(comprador, "AdditionalAccountID");

  const lineasXml = hijosDe(raiz, "InvoiceLine");
  if (lineasXml.length === 0) throw new ErrorDato("La factura no trae líneas de detalle.");
  const lineas = lineasXml.map(leerLinea);
  const gratuitas = lineas.filter((l) => l.gratuita).length;
  if (gratuitas > 0) avisos.push(`${gratuitas === 1 ? "1 línea va" : `${gratuitas} líneas van`} de bonificación (gratis): no suman al total.`);

  const lmt = hijo(raiz, "LegalMonetaryTotal");
  const total = montoObligatorio(lmt, "El importe total", "PayableAmount");
  const valorVentaDeclarado = monto(lmt, "El valor de venta total", "LineExtensionAmount");
  const descuentos = monto(lmt, "El descuento total", "AllowanceTotalAmount") ?? 0;
  const cargos = monto(lmt, "Los cargos", "ChargeTotalAmount") ?? 0;
  const anticipos = monto(lmt, "Los anticipos", "PrepaidAmount") ?? 0;
  const redondeo = monto(lmt, "El redondeo", "PayableRoundingAmount") ?? 0;

  const taxTotales = hijosDe(raiz, "TaxTotal");
  const impuestos = sumar(taxTotales.map((t) => montoObligatorio(t, "El total de impuestos", "TaxAmount")));
  const igv = igvDelDocumento(taxTotales, impuestos);

  const valorVenta = sumar(lineas.filter((l) => !l.gratuita).map((l) => l.valorVenta));
  if (valorVentaDeclarado !== null && Math.abs(valorVenta - valorVentaDeclarado) > TOLERANCIA_CUADRE) {
    avisos.push(`Las líneas suman ${valorVenta.toFixed(2)} sin IGV, pero el papel declara ${valorVentaDeclarado.toFixed(2)} (puede haber un descuento global).`);
  }
  const calculado = r2(valorVenta + impuestos - descuentos + cargos - anticipos + redondeo);
  const diferencia = r2(total - calculado);
  const cuadra = Math.abs(diferencia) <= TOLERANCIA_CUADRE;
  if (!cuadra) {
    avisos.push(`No cuadra: líneas + impuestos dan ${calculado.toFixed(2)} y el total del papel es ${total.toFixed(2)} (diferencia ${diferencia.toFixed(2)}). Revisa antes de guardar.`);
  }

  return {
    tipo: codigoTipo === "01" ? "factura" : "boleta",
    codigoTipo,
    serie,
    numero,
    serieNumero,
    fecha,
    fechaVencimiento: vence && /^\d{4}-\d{2}-\d{2}$/.test(vence) ? vence : null,
    moneda,
    emisor: { ruc, razonSocial, nombreComercial: emisor.comercial && emisor.comercial !== razonSocial ? emisor.comercial : null },
    cliente: {
      tipoDocumento: tipoDocumentoCliente(schemeCliente, docCliente),
      documento: docCliente && docCliente !== "-" && !/^0+$/.test(docCliente) ? docCliente : null,
      nombre: cli.nombre,
    },
    lineas,
    totales: { valorVenta, valorVentaDeclarado, igv, otrosImpuestos: r2(impuestos - igv), descuentos, cargos, anticipos, redondeo, total },
    cuadre: { cuadra, calculado, declarado: total, diferencia },
    avisos,
  };
}

/**
 * Lee el XML de una factura o boleta electrónica. Nunca tira: si algo falta o
 * no es una factura, devuelve `{ ok: false, error }` con la frase para el dueño.
 */
export function leerFacturaXml(xml: string): LecturaFacturaXml {
  if (typeof xml !== "string" || xml.trim() === "") return fallo("El archivo está vacío.");
  if (pesoEnBytes(xml) > TOPE_BYTES_XML) {
    return fallo("El archivo pesa más de 2 MB; una factura electrónica pesa mucho menos. Revisa que sea el XML correcto.");
  }
  const limpio = xml.replace(/^﻿/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(limpio)) return fallo(MENSAJE_DOCTYPE);
  try {
    const raiz = parsear(limpio);
    const rechazo = rechazoPorRaiz(raiz.nombre);
    if (rechazo) return fallo(rechazo);
    return { ok: true, factura: leerInvoice(raiz) };
  } catch (err) {
    if (err instanceof ErrorXml || err instanceof ErrorDato) return fallo(err.message);
    return fallo("No se pudo leer el XML. Descárgalo de nuevo del correo del proveedor.");
  }
}
