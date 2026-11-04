/**
 * SIRE — Registro de Ventas e Ingresos Electrónico (RVIE): las filas del libro de trabajo
 * 14.1 (`armarRegistroVentas`) pasadas al TXT oficial de 33 campos separados por «|»
 * (Anexo 3 de la RS 112-2021, con los cambios de la RS 138-2023), que el contador sube al
 * SIRE para REEMPLAZAR la propuesta de SUNAT. El TXT va dentro de un .zip con el mismo
 * nombre (lo arma el endpoint). Ficha con las fuentes: `.claude/autonomo/noche-04-11/sire-formato.md`.
 *
 * Función PURA. Lo que SUNAT rechazaría y el sistema no sabe completar NO se inventa:
 * la fila va a `bloqueos` con un motivo en palabras del dueño y no entra al archivo.
 * El TXT de trabajo (`libroATxt`) no cambia: este es otro archivo, con otro nombre.
 */
import { aCentimos, type FilaLibro } from "./comun";

// ── Decisiones que la ficha no pudo confirmar con SUNAT (probar con una carga real) ────────

/** Posiciones 28-29 del nombre: `02` = reemplaza la propuesta (`01` = la acepta, `03` = ajustes posteriores). */
export const SIRE_OPORTUNIDAD = "02";
/** NO CONFIRMADO: fin de línea. Ningún anexo lo nombra; se usa el del PLE (CRLF). */
export const SIRE_FIN_DE_LINEA = "\r\n";
/** NO CONFIRMADO: «|» después del campo 33. Ningún anexo lo dice; el PLE lo lleva y no estorba. */
export const SIRE_PALOTE_FINAL = true;
/**
 * NO CONFIRMADO: campos 16 y 18 (descuentos de notas de crédito de periodos anteriores) y
 * 22-23 (IVAP, solo arroz pilado) no aplican al negocio: la ficha no sabe si SUNAT quiere
 * «0.00» o vacío. Se usa «0.00», como pide el anexo para el ICBPER sin información.
 */
export const SIRE_MONTO_QUE_NO_APLICA = "0.00";
/** NO CONFIRMADO: el anexo escribe el negativo como «- #.##»; SUNAT suele mostrar «-123.45» (sin espacio). */
export const SIRE_SIGNO_NEGATIVO = "-";

/** Boleta desde este total (en céntimos) va con el documento del cliente (campo 11). */
const TOPE_BOLETA_SIN_DOC = 70_000;
const LARGO_TEXTO = 1500;
const TIPOS_CON_SERIE_DE_4 = new Set(["01", "03", "07", "08"]);
const TIPOS_CON_REFERENCIA = new Set(["07", "08"]);

export const MOTIVO_SIRE = {
  sinComprobante: "Venta sin boleta ni factura (ticket del POS o pedido sin comprobante)",
  sinSerie: "Comprobante sin serie o sin número",
  notaInterna: "Nota de crédito interna sin serie propia: emítela como nota de crédito electrónica",
  serieMal: "Serie que no tiene 4 letras o números (por ejemplo B001)",
  fueraDelMes: "Fecha que falta o que no es de este mes",
  sinReferencia: "Nota de crédito sin el comprobante que corrige (fecha, tipo, serie y número)",
  sinDesglose: "El sistema no sabe qué parte es gravada, exonerada o inafecta",
  facturaSinRuc: "Factura sin RUC del cliente",
  boletaSinDoc: "Boleta de S/ 700 o más sin DNI ni RUC del cliente",
  docMal: "DNI o RUC del cliente mal escrito",
  repetido: "Comprobante repetido en el mes",
} as const;

export interface NegocioSire {
  ruc: string | null;
  razonSocial: string | null;
  /** `AAAA-MM` (el del libro) o `AAAAMM`. */
  periodo: string;
}

export interface BloqueoSire {
  /** N.º correlativo de la fila en el libro de trabajo (el Excel lo muestra igual). */
  fila: number | null;
  /** «F001-12» o, sin comprobante, «Venta POS del 03/10/2026». */
  comprobante: string;
  motivo: string;
}

/** Lo que la pantalla muestra tras bajar: cuántas entraron y por qué no entraron las otras. */
export interface ResumenSire {
  lineas: number;
  bloqueadas: number;
  motivos: Array<{ motivo: string; cantidad: number; ejemplos: string[] }>;
}

export type ResultadoSire =
  | { ok: true; nombreArchivo: string; nombreZip: string; contenidoTxt: string; lineas: number; bloqueos: BloqueoSire[]; avisos: string[] }
  | { ok: false; error: string };

// ── Formato de cada campo ──────────────────────────────────────────────────

/** Monto con punto y 2 decimales, sin miles. Vacío o nulo = «0.00» (los campos 14-26 son obligatorios). */
export function montoSire(v: unknown): string {
  const c = typeof v === "number" && Number.isFinite(v) ? aCentimos(v) : 0;
  if (c === 0) return "0.00";
  const a = Math.abs(c);
  return `${c < 0 ? SIRE_SIGNO_NEGATIVO : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Texto sin «|», «/» ni «\» (Tabla 5, regla 2), sin saltos y sin el apóstrofo anti-Excel de `textoSeguro`. */
export function textoSire(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/^'(?=[=+\-@\t\r])/, "")
    .replace(/[|/\\\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, LARGO_TEXTO);
}

const celda = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
/** «000123» → «123»; lo que no es solo dígitos queda como vino. */
const numeroSire = (v: unknown): string => {
  const t = celda(v);
  return /^\d+$/.test(t) ? String(Number(t)) : t;
};

/** RUC: 11 dígitos con el dígito verificador (módulo 11) bien. */
export function rucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const r = 11 - (suma % 11);
  return (r === 10 ? 0 : r === 11 ? 1 : r) === Number(ruc[10]);
}

function docValido(tipo: string, doc: string): boolean {
  if (tipo === "1") return /^\d{8}$/.test(doc);
  if (tipo === "6") return rucValido(doc);
  if (tipo === "4" || tipo === "7") return /^[A-Za-z0-9]{1,12}$/.test(doc);
  return false;
}

/** Nombre del TXT (Tabla 6): LE + RUC + AAAA + MM + 00 + 140400 + oportunidad + 1 (operativa) + con/sin información + 1 (soles) + 2. */
export function nombreArchivoRvie(ruc: string, periodo6: string, conInformacion: boolean): string {
  return `LE${ruc}${periodo6}00140400${SIRE_OPORTUNIDAD}1${conInformacion ? "1" : "0"}12.txt`;
}

/** Agrupa los bloqueos por motivo, con unos pocos ejemplos: la pantalla los muestra en una lista corta. */
export function resumirBloqueos(lineas: number, bloqueos: readonly BloqueoSire[], ejemplos = 3): ResumenSire {
  const porMotivo = new Map<string, { cantidad: number; ejemplos: string[] }>();
  for (const b of bloqueos) {
    const g = porMotivo.get(b.motivo) ?? { cantidad: 0, ejemplos: [] };
    g.cantidad++;
    if (g.ejemplos.length < ejemplos) g.ejemplos.push(b.comprobante);
    porMotivo.set(b.motivo, g);
  }
  const motivos = [...porMotivo].map(([motivo, g]) => ({ motivo, ...g })).sort((a, b) => b.cantidad - a.cantidad);
  return { lineas, bloqueadas: bloqueos.length, motivos };
}

// ── Una fila ───────────────────────────────────────────────────────────────

type Linea = { ok: true; campos: string[]; clave: string } | { ok: false; motivo: string };

function lineaDeFila(f: FilaLibro, ruc: string, razon: string, periodo6: string): Linea {
  const tipo = celda(f.tipo);
  const serie = celda(f.serie).toUpperCase();
  const numero = numeroSire(f.numero);
  const fecha = celda(f.fechaEmision);
  const anulado = celda(f.estado) === "anulado";
  const total = typeof f.total === "number" ? f.total : 0;

  if (!tipo) return { ok: false, motivo: MOTIVO_SIRE.sinComprobante };
  if (!serie || !numero) return { ok: false, motivo: celda(f.origen) === "Nota de crédito interna" ? MOTIVO_SIRE.notaInterna : MOTIVO_SIRE.sinSerie };
  if (TIPOS_CON_SERIE_DE_4.has(tipo) && !/^[A-Z0-9]{4}$/.test(serie)) return { ok: false, motivo: MOTIVO_SIRE.serieMal };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha);
  if (!m || `${m[3]}${m[2]}` !== periodo6) return { ok: false, motivo: MOTIVO_SIRE.fueraDelMes };

  const ref = TIPOS_CON_REFERENCIA.has(tipo)
    ? [celda(f.refFecha), celda(f.refTipo), celda(f.refSerie).toUpperCase(), numeroSire(f.refNumero)]
    : ["", "", "", ""];
  if (TIPOS_CON_REFERENCIA.has(tipo) && (ref.some((r) => !r) || !/^\d{2}\/\d{2}\/\d{4}$/.test(ref[0]))) return { ok: false, motivo: MOTIVO_SIRE.sinReferencia };
  if (!anulado && typeof f.sinDesglose === "number" && aCentimos(f.sinDesglose) !== 0) return { ok: false, motivo: MOTIVO_SIRE.sinDesglose };

  // Campos 11-12: obligatorios en factura y en boleta de S/ 700 o más; en notas (07/08) y
  // boletas chicas, si el documento no es válido va vacío (el anexo lo permite).
  const tipoDoc = celda(f.clienteTipoDoc);
  const doc = celda(f.clienteDoc).replace(/^'/, "").replace(/\s+/g, "");
  const conDoc = Boolean(tipoDoc && doc && docValido(tipoDoc, doc));
  const exigeDoc = tipo === "01" || (tipo === "03" && Math.abs(aCentimos(total)) >= TOPE_BOLETA_SIN_DOC);
  if (exigeDoc && !conDoc) return { ok: false, motivo: doc ? MOTIVO_SIRE.docMal : tipo === "01" ? MOTIVO_SIRE.facturaSinRuc : MOTIVO_SIRE.boletaSinDoc };

  // Anulado o con baja: la fila va, con todos los importes en cero (Anexo 3, nota 3).
  const $ = (clave: string): string => (anulado ? "0.00" : montoSire(f[clave]));
  const NA = SIRE_MONTO_QUE_NO_APLICA;
  const campos = [
    ruc, //                                  1 RUC
    razon, //                                2 razón social
    periodo6, //                             3 periodo
    "", //                                   4 CAR: lo completa SUNAT
    fecha, //                                5 fecha de emisión
    "", //                                   6 vencimiento: solo recibos de servicios (tipo 14)
    tipo, //                                 7 tipo de comprobante
    serie, //                                8 serie
    numero, //                               9 número
    "", //                                  10 número final: cada boleta va detallada
    conDoc ? tipoDoc : "", //               11 tipo de documento del cliente
    conDoc ? doc : "", //                   12 número de documento
    textoSire(f.clienteNombre), //          13 nombre o razón social
    $("exportacion"), //                    14 exportación
    $("baseGravada"), //                    15 base gravada
    anulado ? "0.00" : NA, //               16 descuento de base (NC de periodos anteriores)
    $("igv"), //                            17 IGV
    anulado ? "0.00" : NA, //               18 descuento de IGV
    $("exonerada"), //                      19 exonerado
    $("inafecta"), //                       20 inafecto
    $("isc"), //                            21 ISC
    anulado ? "0.00" : NA, //               22 base IVAP
    anulado ? "0.00" : NA, //               23 IVAP
    "0.00", //                              24 ICBPER: el sistema no cobra bolsas aparte
    $("otros"), //                          25 otros tributos
    $("total"), //                          26 total
    "PEN", //                               27 moneda: el negocio vende en soles
    "", //                                  28 tipo de cambio: solo si no es PEN
    ...ref, //                              29-32 comprobante que modifica la nota
    "", //                                  33 proyecto de consorcio: no aplica
  ];
  return { ok: true, campos, clave: `${tipo}|${serie}|${numero}` };
}

const nombreDeLaFila = (f: FilaLibro): string => {
  const serie = celda(f.serie);
  const numero = celda(f.numero);
  if (serie && numero) return `${serie}-${numero}`;
  const fecha = celda(f.fechaEmision);
  return `${celda(f.origen) || "Venta"}${numero ? ` ${numero}` : ""}${fecha ? ` del ${fecha}` : ""}`;
};

// ── El archivo ─────────────────────────────────────────────────────────────

/** El correlativo viaja como texto («12») en el libro de trabajo; acá se vuelve número. */
function numeroDeFila(v: FilaLibro[string]): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return v !== null && v !== "" && Number.isInteger(n) && n > 0 ? n : null;
}

export function armarSireRvie(filas: readonly FilaLibro[], negocio: NegocioSire): ResultadoSire {
  const ruc = (negocio.ruc ?? "").replace(/\D/g, "");
  if (!ruc) return { ok: false, error: "Tu negocio no tiene RUC anotado. Agrégalo en los datos del negocio (Configuración) y vuelve a bajar el archivo." };
  if (!rucValido(ruc)) return { ok: false, error: `El RUC anotado del negocio (${negocio.ruc}) no es válido. Corrígelo en los datos del negocio (Configuración).` };
  const razon = textoSire(negocio.razonSocial);
  if (!razon) return { ok: false, error: "Tu negocio no tiene razón social anotada. Agrégala en los datos del negocio (Configuración)." };
  const p = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(negocio.periodo.trim());
  if (!p) return { ok: false, error: "El mes debe ser AAAA-MM." };
  const periodo6 = `${p[1]}${p[2]}`;

  const lineas: string[] = [];
  const bloqueos: BloqueoSire[] = [];
  const vistos = new Set<string>();
  let pendientes = 0;
  for (const f of filas) {
    const l = lineaDeFila(f, ruc, razon, periodo6);
    if (!l.ok || vistos.has(l.clave)) {
      bloqueos.push({
        fila: numeroDeFila(f.correlativo),
        comprobante: nombreDeLaFila(f),
        motivo: l.ok ? MOTIVO_SIRE.repetido : l.motivo,
      });
      continue;
    }
    vistos.add(l.clave);
    if (celda(f.estado) === "pendiente en SUNAT") pendientes++;
    lineas.push(l.campos.join("|") + (SIRE_PALOTE_FINAL ? "|" : ""));
  }

  const avisos = ["Archivo para REEMPLAZAR la propuesta de ventas del SIRE. Revísalo con tu contador antes de subirlo."];
  if (bloqueos.length > 0)
    avisos.push(`${bloqueos.length} ventas no entraron al archivo: les falta un dato que SUNAT exige y el sistema no lo inventa. Están en la lista.`);
  if (pendientes > 0) avisos.push(`${pendientes} comprobantes siguen pendientes en SUNAT: si SUNAT no los acepta, van en cero.`);
  if (lineas.length === 0 && bloqueos.length === 0) avisos.push("No hubo ventas en el mes: el archivo va «sin información».");

  const nombreArchivo = nombreArchivoRvie(ruc, periodo6, lineas.length > 0);
  return {
    ok: true,
    nombreArchivo,
    nombreZip: nombreArchivo.replace(/\.txt$/, ".zip"),
    contenidoTxt: lineas.map((l) => l + SIRE_FIN_DE_LINEA).join(""),
    lineas: lineas.length,
    bloqueos,
    avisos,
  };
}
