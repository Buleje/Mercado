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
import { ESTADO_VENTA, ORIGEN_VENTA } from "./registro-ventas";

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

/**
 * NO CONFIRMADO: «clientes varios» con DNI `00000000`. La ficha no dice si el SIRE lo acepta como
 * documento válido, así que NO se manda: en boleta de menos de S/ 700 los campos 11-12 van vacíos
 * (el anexo lo permite); desde S/ 700 la fila se bloquea pidiendo el DNI real del cliente.
 */
const DNI_CLIENTES_VARIOS = /^0{8}$/;

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
  if (tipo === "1") return /^\d{8}$/.test(doc) && !DNI_CLIENTES_VARIOS.test(doc);
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
  const estado = celda(f.estado);
  // Anulado o con baja, y también lo que SUNAT todavía no aceptó (CDR distinto de aceptado): la fila
  // va, con todos los importes en cero (Anexo 3, nota 3). Nunca suma como venta válida.
  const enCero = estado === ESTADO_VENTA.anulado || estado === ESTADO_VENTA.pendiente;
  const total = !enCero && typeof f.total === "number" ? f.total : 0;

  if (!tipo) return { ok: false, motivo: MOTIVO_SIRE.sinComprobante };
  if (!serie || !numero) return { ok: false, motivo: celda(f.origen) === ORIGEN_VENTA.notaInterna ? MOTIVO_SIRE.notaInterna : MOTIVO_SIRE.sinSerie };
  if (TIPOS_CON_SERIE_DE_4.has(tipo) && !/^[A-Z0-9]{4}$/.test(serie)) return { ok: false, motivo: MOTIVO_SIRE.serieMal };
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha);
  if (!m || `${m[3]}${m[2]}` !== periodo6) return { ok: false, motivo: MOTIVO_SIRE.fueraDelMes };

  const ref = TIPOS_CON_REFERENCIA.has(tipo)
    ? [celda(f.refFecha), celda(f.refTipo), celda(f.refSerie).toUpperCase(), numeroSire(f.refNumero)]
    : ["", "", "", ""];
  if (TIPOS_CON_REFERENCIA.has(tipo) && (ref.some((r) => !r) || !/^\d{2}\/\d{2}\/\d{4}$/.test(ref[0]))) return { ok: false, motivo: MOTIVO_SIRE.sinReferencia };
  if (!enCero && typeof f.sinDesglose === "number" && aCentimos(f.sinDesglose) !== 0) return { ok: false, motivo: MOTIVO_SIRE.sinDesglose };

  // Campos 11-12: obligatorios en factura y en boleta de S/ 700 o más; en notas (07/08) y
  // boletas chicas, si el documento no es válido va vacío (el anexo lo permite).
  const tipoDoc = celda(f.clienteTipoDoc);
  const doc = celda(f.clienteDoc).replace(/^'/, "").replace(/\s+/g, "");
  const conDoc = Boolean(tipoDoc && doc && docValido(tipoDoc, doc));
  const exigeDoc = tipo === "01" || (tipo === "03" && Math.abs(aCentimos(total)) >= TOPE_BOLETA_SIN_DOC);
  // «Clientes varios» (00000000) cuenta como sin documento: el motivo es «falta el DNI», no «mal escrito».
  const docEscrito = doc !== "" && !DNI_CLIENTES_VARIOS.test(doc);
  if (exigeDoc && !conDoc) return { ok: false, motivo: docEscrito ? MOTIVO_SIRE.docMal : tipo === "01" ? MOTIVO_SIRE.facturaSinRuc : MOTIVO_SIRE.boletaSinDoc };

  const $ = (clave: string): string => (enCero ? "0.00" : montoSire(f[clave]));
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
    enCero ? "0.00" : NA, //               16 descuento de base (NC de periodos anteriores)
    $("igv"), //                            17 IGV
    enCero ? "0.00" : NA, //               18 descuento de IGV
    $("exonerada"), //                      19 exonerado
    $("inafecta"), //                       20 inafecto
    $("isc"), //                            21 ISC
    enCero ? "0.00" : NA, //               22 base IVAP
    enCero ? "0.00" : NA, //               23 IVAP
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

/** Qué comprobante es (tipo, serie y número tal como van al archivo); `null` si la fila no lo tiene completo. */
function claveDeFila(f: FilaLibro): string | null {
  const tipo = celda(f.tipo);
  const serie = celda(f.serie).toUpperCase();
  const numero = numeroSire(f.numero);
  return tipo && serie && numero ? `${tipo}|${serie}|${numero}` : null;
}

const esElectronico = (f: FilaLibro): boolean => celda(f.origen) === ORIGEN_VENTA.electronico;

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);

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

  // Un mismo comprobante puede venir dos veces (el POS lo anotó a mano Y salió electrónico). Gana el
  // electrónico —sus importes son los que SUNAT recibió—, sin importar cuál es más antiguo; entre
  // iguales, el primero del libro. El otro queda como «repetido».
  const claves = filas.map(claveDeFila);
  const dueno = new Map<string, number>();
  filas.forEach((f, i) => {
    const k = claves[i];
    if (!k) return;
    const j = dueno.get(k);
    if (j === undefined || (esElectronico(f) && !esElectronico(filas[j]))) dueno.set(k, i);
  });

  let pendientes = 0;
  filas.forEach((f, i) => {
    const k = claves[i];
    const repetido = k !== null && dueno.get(k) !== i;
    const l = repetido ? null : lineaDeFila(f, ruc, razon, periodo6);
    if (!l?.ok) {
      bloqueos.push({
        fila: numeroDeFila(f.correlativo),
        comprobante: nombreDeLaFila(f),
        motivo: l ? l.motivo : MOTIVO_SIRE.repetido,
      });
      return;
    }
    if (celda(f.estado) === ESTADO_VENTA.pendiente) pendientes++;
    lineas.push(l.campos.join("|") + (SIRE_PALOTE_FINAL ? "|" : ""));
  });

  const avisos = ["Archivo para REEMPLAZAR la propuesta de ventas del SIRE. Revísalo con tu contador antes de subirlo."];
  const nBloqueos = bloqueos.length;
  if (nBloqueos > 0)
    avisos.push(
      `${nBloqueos} ${plural(nBloqueos, "venta no entró", "ventas no entraron")} al archivo: SUNAT exige un dato que el sistema no tiene (o el comprobante estaba repetido). ${plural(nBloqueos, "Está", "Están")} en la lista.`,
    );
  const sinReferencia = bloqueos.filter((b) => b.motivo === MOTIVO_SIRE.sinReferencia).length;
  if (sinReferencia > 0)
    avisos.push(
      `${sinReferencia} ${plural(sinReferencia, "nota de crédito no entró", "notas de crédito no entraron")}: no se encontró la boleta o factura que ${plural(sinReferencia, "corrige", "corrigen")}. Búscala en SUNAT y anótala en las columnas de referencia (19 a 22) del libro.`,
    );
  if (pendientes > 0)
    avisos.push(
      `${pendientes} ${plural(pendientes, "comprobante sigue pendiente", "comprobantes siguen pendientes")} en SUNAT: ${plural(pendientes, "va", "van")} en cero en el archivo, porque SUNAT lo pide para lo que no aceptó. Cuando ${plural(pendientes, "lo acepte", "los acepte")}, baja el archivo de nuevo.`,
    );
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
