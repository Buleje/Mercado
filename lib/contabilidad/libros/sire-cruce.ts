/**
 * SIRE — cruce del Registro de Ventas (libro 14.1) con la PROPUESTA que arma SUNAT (RVIE,
 * Anexo 2 de la RS 112-2021: los campos 1-33 en el mismo orden que el archivo que subimos, más
 * 34-40 de referencia). El dueño baja la propuesta del SIRE (.zip con un .txt separado por «|»),
 * la sube en «Para el contador» y ve, contra su libro del mismo mes:
 *   (a) lo que SUNAT tiene y el libro no, (b) lo que el libro tiene y SUNAT no,
 *   (c) lo que está en los dos con base, IGV o total distintos en más de S/ 0,01,
 *   (d) lo que SUNAT trae repetido con importes distintos (no se pierde: sale con los dos).
 * La clave es tipo|serie|número, normalizada igual que el exportador (`sire-rvie.ts`).
 * Una línea con N.º final (campo 10) es un RANGO de boletas: no se expande en memoria, se
 * compara su suma contra las boletas del libro dentro del rango (hasta 10.000 por rango).
 * Compras (RCE) NO se cruza: se reconoce por el CONTENIDO del archivo, no por su nombre.
 *
 * Funciones PURAS (bytes → texto → propuesta → cruce); el endpoint pone el libro y el negocio.
 * NO CONFIRMADO con una propuesta real (ficha `.claude/autonomo/noche-04-11/sire-formato.md` §5):
 * la codificación (se acepta UTF-8 y latin1), la fila de títulos (opcional: si viene, sus
 * nombres ubican las columnas) y el signo del negativo («-123.45» o «- 123.45»).
 */
import { unzipSync } from "fflate";
import { aCentimos, aSoles, type FilaLibro } from "./comun";
import { ESTADO_VENTA, ORIGEN_VENTA } from "./registro-ventas";

/** Diferencia que se tolera por importe, en céntimos (S/ 0,01: el redondeo de un comprobante). */
export const TOLERANCIA_CENTIMOS = 1;
/** Un rango suma varias boletas: se tolera 1 céntimo por boleta del libro, hasta S/ 1,00 en total. */
const TOPE_TOLERANCIA_RANGO = 100;
/** Lo que entra por el endpoint (Vercel corta en 4,5 MB); un .zip de propuesta pesa mucho menos. */
export const TOPE_ARCHIVO_BYTES = 4 * 1024 * 1024;
/** El .txt descomprimido: más que esto no es una propuesta de un mes (y frena un zip inflado). */
const TOPE_TXT_BYTES = 20 * 1024 * 1024;
/** Un .zip del SIRE trae 1 .txt; más de 5 no es una propuesta (y el tope es la SUMA: 04-11, 100 × 40 MB inflaban a 4 GB). */
const TOPE_TXT_EN_ZIP = 5;
/** Filas de diferencia que viajan a la pantalla; las cifras de arriba cuentan todas. */
export const TOPE_DIFERENCIAS = 1000;
/** Boletas que cubre un rango y aún se cruza; un rango más grande queda «sin expandir». */
export const TOPE_BOLETAS_POR_RANGO = 10_000;
const MINIMO_CAMPOS = 26;
const EJEMPLOS = 3;

export type Codificacion = "utf-8" | "latin1";
export type TipoPropuesta = "ventas" | "compras";
export type LecturaPropuesta = { ok: true; texto: string; nombre: string | null; codificacion: Codificacion } | { ok: false; error: string };

/** Céntimos de cada importe que se compara (base gravada, IGV, total). */
export interface ImportesCruce {
  base: number;
  igv: number;
  total: number;
}

export interface ComprobanteCruce extends ImportesCruce {
  clave: string;
  /** «B001-12» como lo lee el dueño. */
  comprobante: string;
  tipo: string;
  fecha: string;
  cliente: string;
  /** SUNAT trae la misma clave dos veces y los importes no coinciden: los del segundo. */
  repetidaCon?: ImportesCruce;
}

/** Línea con N.º final (campo 10): boletas desde..hasta. Los importes son la suma de todo el rango. */
export interface RangoCruce extends ComprobanteCruce {
  desde: number;
  hasta: number;
  boletas: number;
  /** Más de `TOPE_BOLETAS_POR_RANGO` boletas: no se cruza, solo se avisa. */
  sinExpandir: boolean;
}

export interface PropuestaRvie {
  ruc: string | null;
  /** AAAAMM del campo 3. */
  periodo: string | null;
  comprobantes: ComprobanteCruce[];
  /** Líneas con rango de boletas (aparte de `comprobantes`). */
  rangosCruce: RangoCruce[];
  conTitulos: boolean;
  ilegibles: Array<{ linea: number; motivo: string }>;
  /** Líneas repetidas con los MISMOS importes (se cuentan una vez). */
  repetidos: number;
  /** Cuántas líneas son rangos (`rangosCruce.length`). */
  rangos: number;
}
export type ResultadoPropuesta = ({ ok: true } & PropuestaRvie) | { ok: false; error: string };

export type ClaseDiferencia = "soloSunat" | "soloLibro" | "importes" | "repetida";
export interface DiferenciaCruce {
  clase: ClaseDiferencia;
  clave: string;
  comprobante: string;
  tipo: string;
  fecha: string;
  cliente: string;
  /** En soles; `null` si ese lado no lo tiene. */
  libro: ImportesCruce | null;
  sunat: ImportesCruce | null;
  /** Solo en «repetida»: los importes de la segunda vez que SUNAT trae el comprobante. */
  sunatOtro: ImportesCruce | null;
  /** Solo en rangos de boletas: cuántas cubre y cuántas tiene el libro dentro. */
  rango: { boletas: number; enLibro: number } | null;
  /** Qué importes no cuadran («importes» y «repetida»). */
  campos: Array<keyof ImportesCruce>;
  /** Total de SUNAT menos total del libro, en soles (en «repetida»: el segundo total menos el primero). */
  diferencia: number;
}
export interface CruceSire {
  periodo: string;
  resumen: {
    soloSunat: number;
    soloLibro: number;
    importes: number;
    repetida: number;
    iguales: number;
    /** Comprobantes de SUNAT que se cruzaron (un rango cuenta sus boletas). */
    enSunat: number;
    enLibro: number;
    sinComprobante: number;
    /** Rangos de más de `TOPE_BOLETAS_POR_RANGO` boletas que no se cruzaron. */
    sinExpandir: number;
  };
  /** Suma de los comprobantes de cada lado, en soles. */
  totales: { sunat: ImportesCruce; libro: ImportesCruce };
  diferencias: DiferenciaCruce[];
  recortadas: number;
  avisos: string[];
}
export type ResultadoCruce = ({ ok: true } & CruceSire) | { ok: false; error: string };

// ── El archivo ─────────────────────────────────────────────────────────────

const esZip = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const esExcelViejo = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
const baseDe = (ruta: string): string => ruta.split("/").pop() ?? ruta;
/** Posiciones 22-27 del nombre (Tabla 6): 140400 = ventas, 080400 = compras. Solo de respaldo: manda el contenido. */
const ES_DE_COMPRAS = /^LE\d{19}080400/i;
const ES_DE_VENTAS = /^LE\d{19}140400/i;
const tipoDeNombre = (nombre: string): TipoPropuesta | null => (ES_DE_VENTAS.test(nombre) ? "ventas" : ES_DE_COMPRAS.test(nombre) ? "compras" : null);

const ERROR_EXCEL = "Ese archivo es un Excel. En el SIRE baja la propuesta en TXT (sale como .zip) y súbela tal cual.";
const ERROR_COMPRAS = "Este archivo es la propuesta de COMPRAS (RCE), no la de ventas. Aquí va la de VENTAS (RVIE): en el SIRE entra por «Registro de Ventas e Ingresos».";

/** UTF-8 si los bytes lo son; si no, latin1 (lo que guardan los programas de Windows). Sin la marca BOM. */
export function decodificarPropuesta(bytes: Uint8Array): { texto: string; codificacion: Codificacion } {
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), codificacion: "utf-8" };
  } catch {
    // No es UTF-8 válido: casi siempre es latin1 (ANSI de Windows).
    return { texto: new TextDecoder("latin1").decode(bytes), codificacion: "latin1" };
  }
}

/** Lo que el dueño subió (.zip del SIRE o el .txt suelto) → el texto de la propuesta. */
export function leerArchivoPropuesta(bytes: Uint8Array, nombreSubido?: string | null): LecturaPropuesta {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío. Vuelve a bajar la propuesta del SIRE." };
  if (bytes.length > TOPE_ARCHIVO_BYTES) return { ok: false, error: "El archivo pesa más de 4 MB. Sube el .zip que da el SIRE, sin descomprimir." };
  if (esExcelViejo(bytes)) return { ok: false, error: ERROR_EXCEL };
  if (!esZip(bytes)) {
    const nombre = nombreSubido ? baseDe(nombreSubido) : null;
    const { texto, codificacion } = decodificarPropuesta(bytes);
    if ((tipoDePropuesta(texto) ?? (nombre ? tipoDeNombre(nombre) : null)) === "compras") return { ok: false, error: ERROR_COMPRAS };
    return { ok: true, texto, nombre, codificacion };
  }

  let excel = false;
  let pesado = false;
  let archivos: Record<string, Uint8Array>;
  let acumulado = 0;
  let cuantos = 0;
  try {
    archivos = unzipSync(bytes, {
      filter: (f) => {
        if (f.name === "[Content_Types].xml" || f.name.startsWith("xl/")) excel = true;
        if (!/\.txt$/i.test(f.name) || f.name.startsWith("__MACOSX/") || baseDe(f.name).startsWith(".")) return false;
        acumulado += f.originalSize;
        cuantos += 1;
        if (acumulado > TOPE_TXT_BYTES || cuantos > TOPE_TXT_EN_ZIP) {
          pesado = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    return { ok: false, error: "No pude abrir el .zip: parece incompleto. Vuelve a bajarlo del SIRE." };
  }
  if (excel) return { ok: false, error: ERROR_EXCEL };
  if (pesado) return { ok: false, error: "El .zip trae demasiado para una propuesta de un mes. Sube el .zip tal cual lo da el SIRE." };
  const rutas = Object.keys(archivos);
  if (rutas.length === 0) return { ok: false, error: "El .zip no trae ningún .txt. Baja la propuesta en formato TXT." };
  // Cada .txt se reconoce por lo que trae adentro; el nombre solo desempata si el contenido no alcanza.
  const leidos = rutas.map((ruta) => {
    const d = decodificarPropuesta(archivos[ruta]);
    return { ruta, ...d, tipo: tipoDePropuesta(d.texto) ?? tipoDeNombre(baseDe(ruta)) };
  });
  const elegido = leidos.find((x) => x.tipo === "ventas") ?? leidos.find((x) => x.tipo === null) ?? leidos[0];
  if (elegido.tipo === "compras") return { ok: false, error: ERROR_COMPRAS };
  return { ok: true, texto: elegido.texto, nombre: baseDe(elegido.ruta), codificacion: elegido.codificacion };
}

// ── Campos ─────────────────────────────────────────────────────────────────

/** «123.45», «-123.45», «- 123.45», «+5», «12,50» → céntimos; vacío = 0; lo que no es monto = `null`. */
export function centimosSire(v: string | undefined): number | null {
  const t = (v ?? "").replace(/\s+/g, "");
  if (t === "") return 0;
  const m = /^([+-])?(\d{1,13})(?:[.,](\d+))?$/.exec(t);
  if (!m) return null;
  const dec = (m[3] ?? "").padEnd(3, "0");
  const c = Number(m[2]) * 100 + Number(dec.slice(0, 2)) + (Number(dec[2]) >= 5 ? 1 : 0);
  return m[1] === "-" && c !== 0 ? -c : c;
}

const limpio = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** tipo|serie|número como los escribe el exportador: tipo de 2 dígitos, serie en mayúsculas, número sin ceros a la izquierda. */
export function claveComprobante(tipo: unknown, serie: unknown, numero: unknown): string | null {
  let t = limpio(tipo);
  if (/^\d$/.test(t)) t = `0${t}`;
  let n = limpio(numero);
  if (/^\d+$/.test(n)) n = n.replace(/^0+(?=\d)/, "");
  return t && n ? `${t}|${limpio(serie).toUpperCase()}|${n}` : null;
}

const nombreComprobante = (clave: string): string => {
  const [, serie, numero] = clave.split("|");
  return serie ? `${serie}-${numero}` : numero;
};
const nombreRango = (clave: string, hasta: number): string => {
  const [, serie, numero] = clave.split("|");
  return serie ? `${serie}-${numero} al ${serie}-${hasta}` : `${numero} al ${hasta}`;
};

type Columna = "ruc" | "periodo" | "fecha" | "tipo" | "serie" | "numero" | "numeroFinal" | "cliente" | "base" | "dsctoBase" | "igv" | "dsctoIgv" | "total";
/** Posición (desde 0) de cada campo en el Anexo 2/3: campo N del anexo = posición N-1. */
const POSICION: Record<Columna, number> = { ruc: 0, periodo: 2, fecha: 4, tipo: 6, serie: 7, numero: 8, numeroFinal: 9, cliente: 12, base: 14, dsctoBase: 15, igv: 16, dsctoIgv: 17, total: 25 };
/** Nombres de las columnas como los escribe SUNAT (sin tildes, espacios ni signos). */
const TITULOS: Array<[Columna, (n: string) => boolean]> = [
  ["ruc", (n) => n === "ruc"],
  ["periodo", (n) => n === "periodo"],
  ["fecha", (n) => n === "fechadeemision" || n === "fechaemision"],
  ["tipo", (n) => n === "tipocpdoc" || n === "tipocp"],
  ["serie", (n) => n === "seriedelcdp" || n === "seriecdp"],
  ["numero", (n) => n.startsWith("nrocpodoc") || n === "nrocp"],
  ["numeroFinal", (n) => n.startsWith("nrofinal")],
  ["cliente", (n) => n === "apellidosnombresrazonsocial"],
  ["base", (n) => n === "bigravada"],
  ["dsctoBase", (n) => n === "dsctobi"],
  ["igv", (n) => n === "igvipm" || n === "igv"],
  ["dsctoIgv", (n) => n === "dsctoigvipm"],
  ["total", (n) => n === "totalcp"],
];
const normal = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Fila de títulos: el campo 1 no es un RUC y trae letras. Si sus nombres se reconocen, ubican las columnas. */
function posicionesDeTitulos(campos: string[]): Record<Columna, number> {
  const pos = { ...POSICION };
  const vistas = new Set<Columna>();
  campos.forEach((c, i) => {
    const n = normal(c);
    const hallada = TITULOS.find(([col, es]) => !vistas.has(col) && es(n));
    if (hallada) {
      pos[hallada[0]] = i;
      vistas.add(hallada[0]);
    }
  });
  return pos;
}

const masFrecuente = (cuenta: Map<string, number>): string | null => [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

const esTituloDeFila = (campos: string[]): boolean => !/^\d{11}$/.test(campos[0]) && /[a-z]/i.test(campos[0]);
const ES_MONEDA = /^[A-Za-z]{3}$/;
/** Títulos que solo trae el RCE: «BI Gravado DG», «Valor Adq. NG», «Clasif de Bss y Sss». */
const titulo_de_compras = (n: string): boolean => n.startsWith("bigravadodg") || n.startsWith("valoradq") || n.startsWith("clasifdebss");
/** Títulos que solo trae el RVIE: «BI Gravada», «Dscto BI». */
const titulo_de_ventas = (n: string): boolean => n === "bigravada" || n === "dsctobi";

/**
 * ¿Ventas (RVIE) o compras (RCE)? Por el CONTENIDO: los títulos propios de cada uno o, sin títulos,
 * dónde cae el código de moneda («PEN»): en el RVIE es el campo 27 (el 26 es el total); en el RCE
 * es el campo 26 (el 25 es el total). `null` = el contenido no alcanza para decidir.
 */
export function tipoDePropuesta(texto: string): TipoPropuesta | null {
  const cabeza = texto.slice(0, 200_000);
  const lineas = cabeza.split(/\r\n|\n|\r/);
  if (cabeza.length < texto.length) lineas.pop(); // la última puede venir cortada
  let compras = 0;
  let ventas = 0;
  let vistas = 0;
  for (const linea of lineas) {
    if (!linea.includes("|")) continue;
    vistas += 1;
    const campos = linea.split("|").map((c) => c.trim());
    if (vistas === 1 && esTituloDeFila(campos)) {
      const nombres = campos.map(normal);
      if (nombres.some(titulo_de_compras)) return "compras";
      if (nombres.some(titulo_de_ventas)) return "ventas";
      continue;
    }
    if (campos.length < MINIMO_CAMPOS) continue;
    if (ES_MONEDA.test(campos[25])) compras += 1;
    else if (ES_MONEDA.test(campos[26] ?? "")) ventas += 1;
    if (compras + ventas >= 20) break;
  }
  return compras > ventas ? "compras" : ventas > compras ? "ventas" : null;
}

// ── La propuesta ───────────────────────────────────────────────────────────

const IMPORTES: Array<keyof ImportesCruce> = ["base", "igv", "total"];
/** Qué importes difieren en más de `tolerancia` céntimos. */
const diferentes = (a: ImportesCruce, b: ImportesCruce, tolerancia = TOLERANCIA_CENTIMOS): Array<keyof ImportesCruce> => IMPORTES.filter((k) => Math.abs(a[k] - b[k]) > tolerancia);

export function parsearPropuestaRvie(texto: string): ResultadoPropuesta {
  const lineas = texto.split(/\r\n|\n|\r/);
  if (!lineas.some((l) => l.includes("|"))) {
    if (lineas.every((l) => !l.trim())) return { ok: false, error: "La propuesta no trae comprobantes: el archivo está en blanco. Vuelve a bajarla del SIRE." };
    return { ok: false, error: "El archivo no viene separado por «|». Baja la propuesta en TXT (no en Excel ni CSV)." };
  }
  if (tipoDePropuesta(texto) === "compras") return { ok: false, error: ERROR_COMPRAS };
  let pos = POSICION;
  let conTitulos = false;
  const vistos = new Map<string, ComprobanteCruce>();
  const comprobantes: ComprobanteCruce[] = [];
  const rangosCruce: RangoCruce[] = [];
  const ilegibles: PropuestaRvie["ilegibles"] = [];
  const rucs = new Map<string, number>();
  const periodos = new Map<string, number>();
  let repetidos = 0;

  lineas.forEach((linea, i) => {
    if (!linea.trim()) return;
    const campos = linea.split("|").map((c) => c.trim());
    if (comprobantes.length === 0 && rangosCruce.length === 0 && ilegibles.length === 0 && !conTitulos && esTituloDeFila(campos)) {
      conTitulos = true;
      pos = posicionesDeTitulos(campos);
      return;
    }
    const nLinea = i + 1;
    if (campos.length < MINIMO_CAMPOS) return void ilegibles.push({ linea: nLinea, motivo: `trae ${campos.length} campos y la propuesta lleva al menos ${MINIMO_CAMPOS}` });
    const clave = /^\d{1,2}$/.test(campos[pos.tipo]) ? claveComprobante(campos[pos.tipo], campos[pos.serie], campos[pos.numero]) : null;
    if (!clave) return void ilegibles.push({ linea: nLinea, motivo: "no se entiende el tipo o el número del comprobante" });
    const base = centimosSire(campos[pos.base]);
    const dsctoBase = centimosSire(campos[pos.dsctoBase]);
    const igv = centimosSire(campos[pos.igv]);
    const dsctoIgv = centimosSire(campos[pos.dsctoIgv]);
    const total = centimosSire(campos[pos.total]);
    if (base === null || igv === null || total === null || dsctoBase === null || dsctoIgv === null) {
      return void ilegibles.push({ linea: nLinea, motivo: "un importe no es un número" });
    }

    // Rango de boletas: el campo 10 trae el N.º final y es distinto del inicial.
    const final = campos[pos.numeroFinal];
    let rango: { desde: number; hasta: number } | null = null;
    if (final && !/^0*$/.test(final) && claveComprobante(campos[pos.tipo], campos[pos.serie], final) !== clave) {
      const desde = Number(campos[pos.numero]);
      const hasta = Number(final);
      if (!/^\d+$/.test(campos[pos.numero]) || !/^\d+$/.test(final) || !Number.isSafeInteger(desde) || !Number.isSafeInteger(hasta) || hasta < desde) {
        return void ilegibles.push({ linea: nLinea, motivo: "el número final del rango no es válido (no es un número o es menor que el inicial)" });
      }
      rango = { desde, hasta };
    }

    const lineaClave = rango ? `${clave}>${rango.hasta}` : clave;
    // Las notas de crédito de meses anteriores van con su descuento aparte (campos 16 y 18): se suman.
    const importes: ImportesCruce = { base: base + dsctoBase, igv: igv + dsctoIgv, total };
    const previo = vistos.get(lineaClave);
    if (previo) {
      // Misma clave otra vez: con los mismos importes se cuenta una vez; con otros, se guarda para mostrar los dos.
      if (!previo.repetidaCon && diferentes(previo, importes).length > 0) previo.repetidaCon = importes;
      else repetidos++;
      return;
    }
    if (/^\d{11}$/.test(campos[pos.ruc])) rucs.set(campos[pos.ruc], (rucs.get(campos[pos.ruc]) ?? 0) + 1);
    if (/^\d{6}$/.test(campos[pos.periodo])) periodos.set(campos[pos.periodo], (periodos.get(campos[pos.periodo]) ?? 0) + 1);
    const comun = { fecha: campos[pos.fecha] ?? "", cliente: campos[pos.cliente] ?? "", tipo: clave.slice(0, 2), ...importes };
    if (rango) {
      const boletas = rango.hasta - rango.desde + 1;
      const entrada: RangoCruce = { ...comun, clave: lineaClave, comprobante: nombreRango(clave, rango.hasta), ...rango, boletas, sinExpandir: boletas > TOPE_BOLETAS_POR_RANGO };
      vistos.set(lineaClave, entrada);
      rangosCruce.push(entrada);
      return;
    }
    const entrada: ComprobanteCruce = { ...comun, clave, comprobante: nombreComprobante(clave) };
    vistos.set(clave, entrada);
    comprobantes.push(entrada);
  });

  if (comprobantes.length === 0 && rangosCruce.length === 0 && ilegibles.length > 0) {
    const ej = ilegibles.slice(0, EJEMPLOS).map((x) => `línea ${x.linea}: ${x.motivo}`).join("; ");
    return { ok: false, error: `No encontré ningún comprobante que se pueda leer (${ej}). ¿Es la propuesta de ventas del SIRE en TXT?` };
  }
  if (periodos.size > 1) return { ok: false, error: `La propuesta trae más de un mes (${[...periodos.keys()].join(", ")}). Baja la de un solo mes.` };
  return { ok: true, ruc: masFrecuente(rucs), periodo: masFrecuente(periodos), comprobantes, rangosCruce, conTitulos, ilegibles, repetidos, rangos: rangosCruce.length };
}

// ── El cruce ───────────────────────────────────────────────────────────────

/** Los comprobantes del libro por clave. Repetido (anotado a mano Y electrónico): gana el electrónico, como en el exportador. */
function delLibro(filas: readonly FilaLibro[]): { porClave: Map<string, ComprobanteCruce>; sinComprobante: number } {
  const elegidos = new Map<string, { c: ComprobanteCruce; electronico: boolean }>();
  let sinComprobante = 0;
  for (const f of filas) {
    const clave = limpio(f.serie) ? claveComprobante(f.tipo, f.serie, f.numero) : null;
    if (!clave) {
      sinComprobante++;
      continue;
    }
    const electronico = limpio(f.origen) === ORIGEN_VENTA.electronico;
    const previo = elegidos.get(clave);
    if (previo && (previo.electronico || !electronico)) continue;
    // Anulado = importes en cero, como lo trae SUNAT. Lo pendiente va con sus importes: si SUNAT ya
    // lo tiene, se compara de verdad; si no lo tiene, sale en «tu libro tiene y SUNAT no».
    const anulado = limpio(f.estado) === ESTADO_VENTA.anulado;
    const $ = (k: string): number => {
      const v = f[k];
      return !anulado && typeof v === "number" && Number.isFinite(v) ? aCentimos(v) : 0;
    };
    elegidos.set(clave, {
      electronico,
      c: { clave, comprobante: nombreComprobante(clave), tipo: clave.slice(0, 2), fecha: limpio(f.fechaEmision), cliente: limpio(f.clienteNombre), base: $("baseGravada"), igv: $("igv"), total: $("total") },
    });
  }
  return { porClave: new Map([...elegidos].map(([k, v]) => [k, v.c])), sinComprobante };
}

type Numerada = { n: number; c: ComprobanteCruce };
/** Las boletas del libro por tipo|serie, ordenadas por número: ubicar las de un rango sin recorrer todo el libro. */
function indicePorSerie(libro: Map<string, ComprobanteCruce>): Map<string, Numerada[]> {
  const indice = new Map<string, Numerada[]>();
  for (const c of libro.values()) {
    const [tipo, serie, numero] = c.clave.split("|");
    const n = /^\d+$/.test(numero) ? Number(numero) : NaN;
    if (!Number.isSafeInteger(n)) continue;
    const llave = `${tipo}|${serie}`;
    const lista = indice.get(llave);
    if (lista) lista.push({ n, c });
    else indice.set(llave, [{ n, c }]);
  }
  for (const lista of indice.values()) lista.sort((a, b) => a.n - b.n);
  return indice;
}

/** Los comprobantes del libro cuyo número cae dentro del rango (mismo tipo y serie). */
function delRango(indice: Map<string, Numerada[]>, r: RangoCruce): ComprobanteCruce[] {
  const [tipo, serie] = r.clave.split("|");
  const lista = indice.get(`${tipo}|${serie}`);
  if (!lista) return [];
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const medio = (lo + hi) >> 1;
    if (lista[medio].n < r.desde) lo = medio + 1;
    else hi = medio;
  }
  const dentro: ComprobanteCruce[] = [];
  for (let i = lo; i < lista.length && lista[i].n <= r.hasta; i++) dentro.push(lista[i].c);
  return dentro;
}

const enSoles = (c: ImportesCruce): ImportesCruce => ({ base: aSoles(c.base), igv: aSoles(c.igv), total: aSoles(c.total) });
const sumarCentimos = (cs: Iterable<ImportesCruce>): ImportesCruce => {
  const s = { base: 0, igv: 0, total: 0 };
  for (const c of cs) {
    s.base += c.base;
    s.igv += c.igv;
    s.total += c.total;
  }
  return s;
};
const sumar = (cs: Iterable<ImportesCruce>): ImportesCruce => enSoles(sumarCentimos(cs));
const ORDEN_CLASE: Record<ClaseDiferencia, number> = { soloSunat: 0, soloLibro: 1, importes: 2, repetida: 3 };
const comparaClave = (a: string, b: string): number => a.localeCompare(b, "es", { numeric: true });
const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);
const conPuntos = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

interface ExtraFila {
  sunatOtro?: ImportesCruce;
  rango?: DiferenciaCruce["rango"];
  /** Reemplaza «total de SUNAT menos total del libro» (céntimos). */
  contraste?: number;
}

export function cruzarConPropuesta(propuesta: PropuestaRvie, filas: readonly FilaLibro[], negocio: { ruc: string | null; periodo: string }): ResultadoCruce {
  const p = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(negocio.periodo.trim());
  if (!p) return { ok: false, error: "El mes debe ser AAAA-MM." };
  const periodo6 = `${p[1]}${p[2]}`;
  if (propuesta.periodo && propuesta.periodo !== periodo6) {
    const suyo = `${propuesta.periodo.slice(0, 4)}-${propuesta.periodo.slice(4)}`;
    return { ok: false, error: `La propuesta es del mes ${suyo} y en pantalla está ${p[1]}-${p[2]}. Cambia el mes arriba o sube la propuesta de ${p[1]}-${p[2]}.` };
  }
  const ruc = (negocio.ruc ?? "").replace(/\D/g, "");
  if (ruc && propuesta.ruc && propuesta.ruc !== ruc) {
    return { ok: false, error: `La propuesta es del RUC ${propuesta.ruc} y tu negocio tiene el RUC ${ruc}. Sube la propuesta de tu negocio.` };
  }

  const { porClave: libro, sinComprobante } = delLibro(filas);
  const sunat = new Map(propuesta.comprobantes.map((c) => [c.clave, c]));
  const indice = indicePorSerie(libro);
  /** Boletas del libro que un rango ya resolvió: no cuentan como «solo en tu libro». */
  const cubiertas = new Set<string>();
  const diferencias: DiferenciaCruce[] = [];
  let iguales = 0;
  let enSunat = sunat.size;
  const fila = (clase: ClaseDiferencia, c: ComprobanteCruce, l: ImportesCruce | null, s: ImportesCruce | null, campos: DiferenciaCruce["campos"] = [], extra: ExtraFila = {}): DiferenciaCruce => ({
    clase,
    clave: c.clave,
    comprobante: c.comprobante,
    tipo: c.tipo,
    fecha: c.fecha,
    cliente: c.cliente,
    libro: l && enSoles(l),
    sunat: s && enSoles(s),
    sunatOtro: extra.sunatOtro ? enSoles(extra.sunatOtro) : null,
    rango: extra.rango ?? null,
    campos,
    diferencia: aSoles(extra.contraste ?? (s?.total ?? 0) - (l?.total ?? 0)),
  });

  for (const s of sunat.values()) {
    const l = libro.get(s.clave);
    if (s.repetidaCon) {
      const otro = s.repetidaCon;
      diferencias.push(fila("repetida", { ...s, fecha: l?.fecha || s.fecha, cliente: l?.cliente || s.cliente }, l ?? null, s, diferentes(s, otro), { sunatOtro: otro, contraste: otro.total - s.total }));
      continue;
    }
    if (!l) {
      diferencias.push(fila("soloSunat", s, null, s));
      continue;
    }
    const campos = diferentes(s, l);
    if (campos.length === 0) iguales++;
    else diferencias.push(fila("importes", { ...s, fecha: l.fecha || s.fecha, cliente: l.cliente || s.cliente }, l, s, campos));
  }

  for (const r of propuesta.rangosCruce) {
    const dentro = delRango(indice, r);
    for (const c of dentro) cubiertas.add(c.clave);
    if (r.sinExpandir) continue;
    enSunat += r.boletas;
    const rango = { boletas: r.boletas, enLibro: dentro.length };
    const delLibroEnRango = dentro.length > 0 ? sumarCentimos(dentro) : null;
    if (r.repetidaCon) {
      diferencias.push(fila("repetida", r, delLibroEnRango, r, diferentes(r, r.repetidaCon), { sunatOtro: r.repetidaCon, rango, contraste: r.repetidaCon.total - r.total }));
      continue;
    }
    if (!delLibroEnRango) {
      diferencias.push(fila("soloSunat", r, null, r, [], { rango }));
      continue;
    }
    const campos = diferentes(r, delLibroEnRango, Math.min(TOLERANCIA_CENTIMOS * dentro.length, TOPE_TOLERANCIA_RANGO));
    if (campos.length === 0) iguales += r.boletas;
    else diferencias.push(fila("importes", r, delLibroEnRango, r, campos, { rango }));
  }

  for (const l of libro.values()) if (!sunat.has(l.clave) && !cubiertas.has(l.clave)) diferencias.push(fila("soloLibro", l, l, null));

  const sinExpandir = propuesta.rangosCruce.filter((r) => r.sinExpandir);
  const cuenta = (clase: ClaseDiferencia): number => diferencias.filter((d) => d.clase === clase).length;
  const resumen = {
    soloSunat: cuenta("soloSunat"),
    soloLibro: cuenta("soloLibro"),
    importes: cuenta("importes"),
    repetida: cuenta("repetida"),
    iguales,
    enSunat,
    enLibro: libro.size,
    sinComprobante,
    sinExpandir: sinExpandir.length,
  };
  diferencias.sort((a, b) => ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase] || comparaClave(a.clave, b.clave));

  const avisos: string[] = [];
  if (!ruc) avisos.push("Tu negocio no tiene RUC anotado: no pude confirmar que la propuesta sea tuya. Agrégalo en los datos del negocio (Configuración).");
  if (sinComprobante > 0)
    avisos.push(`${sinComprobante} ${plural(sinComprobante, "venta del libro no tiene", "ventas del libro no tienen")} boleta ni factura (tickets del POS o notas internas): SUNAT no ${plural(sinComprobante, "la conoce", "las conoce")} y no entran al cruce.`);
  if (propuesta.ilegibles.length > 0) {
    const ej = propuesta.ilegibles.slice(0, EJEMPLOS).map((x) => `línea ${x.linea}: ${x.motivo}`).join("; ");
    avisos.push(`${propuesta.ilegibles.length} ${plural(propuesta.ilegibles.length, "línea de la propuesta no se pudo leer", "líneas de la propuesta no se pudieron leer")} (${ej}).`);
  }
  if (propuesta.repetidos > 0) avisos.push(`${propuesta.repetidos} ${plural(propuesta.repetidos, "comprobante viene repetido", "comprobantes vienen repetidos")} en la propuesta con los mismos importes: se contó una vez.`);
  const cruzados = propuesta.rangosCruce.length - sinExpandir.length;
  if (cruzados > 0)
    avisos.push(`${cruzados} ${plural(cruzados, "línea de la propuesta es un rango", "líneas de la propuesta son rangos")} de boletas (del N.º inicial al final): ${plural(cruzados, "la comparé", "las comparé")} con la suma de las boletas de tu libro dentro del rango.`);
  if (sinExpandir.length > 0) {
    const ej = sinExpandir.slice(0, EJEMPLOS).map((r) => r.comprobante).join("; ");
    avisos.push(
      `${sinExpandir.length} ${plural(sinExpandir.length, "rango trae", "rangos traen")} más de ${conPuntos(TOPE_BOLETAS_POR_RANGO)} boletas y no se ${plural(sinExpandir.length, "cruzó", "cruzaron")} (sin expandir: ${ej}); las boletas de tu libro dentro de ${plural(sinExpandir.length, "él", "ellos")} no cuentan como «solo en tu libro».`,
    );
  }
  const recortadas = Math.max(0, diferencias.length - TOPE_DIFERENCIAS);
  if (recortadas > 0) avisos.push(`La lista muestra las primeras ${TOPE_DIFERENCIAS} diferencias; las cifras de arriba cuentan todas.`);

  return {
    ok: true,
    periodo: `${p[1]}-${p[2]}`,
    resumen,
    totales: { sunat: sumar([...propuesta.comprobantes, ...propuesta.rangosCruce]), libro: sumar(libro.values()) },
    diferencias: diferencias.slice(0, TOPE_DIFERENCIAS),
    recortadas,
    avisos,
  };
}
