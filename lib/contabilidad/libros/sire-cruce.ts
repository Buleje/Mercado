/**
 * SIRE — cruce del Registro de Ventas (libro 14.1) con la PROPUESTA que arma SUNAT (RVIE,
 * Anexo 2 de la RS 112-2021: los campos 1-33 en el mismo orden que el archivo que subimos, más
 * 34-40 de referencia). El dueño baja la propuesta del SIRE (.zip con un .txt separado por «|»),
 * la sube en «Para el contador» y ve, contra su libro del mismo mes:
 *   (a) lo que SUNAT tiene y el libro no, (b) lo que el libro tiene y SUNAT no,
 *   (c) lo que está en los dos con base, IGV o total distintos en más de S/ 0,01.
 * La clave es tipo|serie|número, normalizada igual que el exportador (`sire-rvie.ts`).
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
/** Lo que entra por el endpoint (Vercel corta en 4,5 MB); un .zip de propuesta pesa mucho menos. */
export const TOPE_ARCHIVO_BYTES = 4 * 1024 * 1024;
/** El .txt descomprimido: más que esto no es una propuesta de un mes (y frena un zip inflado). */
const TOPE_TXT_BYTES = 20 * 1024 * 1024;
/** Un .zip del SIRE trae 1 .txt; más de 5 no es una propuesta (y el tope es la SUMA: 04-11, 100 × 40 MB inflaban a 4 GB). */
const TOPE_TXT_EN_ZIP = 5;
/** Filas de diferencia que viajan a la pantalla; las cifras de arriba cuentan todas. */
export const TOPE_DIFERENCIAS = 1000;
const MINIMO_CAMPOS = 26;
const EJEMPLOS = 3;

export type Codificacion = "utf-8" | "latin1";
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
}

export interface PropuestaRvie {
  ruc: string | null;
  /** AAAAMM del campo 3. */
  periodo: string | null;
  comprobantes: ComprobanteCruce[];
  conTitulos: boolean;
  ilegibles: Array<{ linea: number; motivo: string }>;
  repetidos: number;
  rangos: number;
}
export type ResultadoPropuesta = ({ ok: true } & PropuestaRvie) | { ok: false; error: string };

export type ClaseDiferencia = "soloSunat" | "soloLibro" | "importes";
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
  /** Qué importes no cuadran (solo en «importes»). */
  campos: Array<keyof ImportesCruce>;
  /** Total de SUNAT menos total del libro, en soles. */
  diferencia: number;
}
export interface CruceSire {
  periodo: string;
  resumen: { soloSunat: number; soloLibro: number; importes: number; iguales: number; enSunat: number; enLibro: number; sinComprobante: number };
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
/** Posiciones 22-27 del nombre (Tabla 6): 140400 = ventas, 080400 = compras. */
const ES_DE_COMPRAS = /^LE\d{19}080400/i;
const ES_DE_VENTAS = /^LE\d{19}140400/i;

const ERROR_EXCEL = "Ese archivo es un Excel. En el SIRE baja la propuesta en TXT (sale como .zip) y súbela tal cual.";

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
  let contenido = bytes;
  let nombre = nombreSubido ? baseDe(nombreSubido) : null;
  if (esZip(bytes)) {
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
    const ruta = rutas.find((r) => ES_DE_VENTAS.test(baseDe(r))) ?? rutas.find((r) => !ES_DE_COMPRAS.test(baseDe(r))) ?? rutas[0];
    contenido = archivos[ruta];
    nombre = baseDe(ruta);
  }
  if (nombre && ES_DE_COMPRAS.test(nombre)) {
    return { ok: false, error: "Esa es la propuesta de COMPRAS (RCE). Aquí va la de VENTAS (RVIE, su nombre lleva 140400)." };
  }
  const { texto, codificacion } = decodificarPropuesta(contenido);
  return { ok: true, texto, nombre, codificacion };
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

// ── La propuesta ───────────────────────────────────────────────────────────

export function parsearPropuestaRvie(texto: string): ResultadoPropuesta {
  const lineas = texto.split(/\r\n|\n|\r/);
  if (!lineas.some((l) => l.includes("|"))) {
    if (lineas.every((l) => !l.trim())) return { ok: false, error: "La propuesta no trae comprobantes: el archivo está en blanco. Vuelve a bajarla del SIRE." };
    return { ok: false, error: "El archivo no viene separado por «|». Baja la propuesta en TXT (no en Excel ni CSV)." };
  }
  let pos = POSICION;
  let conTitulos = false;
  const vistos = new Set<string>();
  const comprobantes: ComprobanteCruce[] = [];
  const ilegibles: PropuestaRvie["ilegibles"] = [];
  const rucs = new Map<string, number>();
  const periodos = new Map<string, number>();
  let repetidos = 0;
  let rangos = 0;

  lineas.forEach((linea, i) => {
    if (!linea.trim()) return;
    const campos = linea.split("|").map((c) => c.trim());
    if (comprobantes.length === 0 && ilegibles.length === 0 && !conTitulos && !/^\d{11}$/.test(campos[0]) && /[a-z]/i.test(campos[0])) {
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
    if (vistos.has(clave)) return void repetidos++;
    vistos.add(clave);
    const final = campos[pos.numeroFinal];
    if (final && claveComprobante(campos[pos.tipo], campos[pos.serie], final) !== clave) rangos++;
    if (/^\d{11}$/.test(campos[pos.ruc])) rucs.set(campos[pos.ruc], (rucs.get(campos[pos.ruc]) ?? 0) + 1);
    if (/^\d{6}$/.test(campos[pos.periodo])) periodos.set(campos[pos.periodo], (periodos.get(campos[pos.periodo]) ?? 0) + 1);
    comprobantes.push({
      clave,
      comprobante: nombreComprobante(clave),
      tipo: clave.slice(0, 2),
      fecha: campos[pos.fecha] ?? "",
      cliente: campos[pos.cliente] ?? "",
      // Las notas de crédito de meses anteriores van con su descuento aparte (campos 16 y 18): se suman.
      base: base + dsctoBase,
      igv: igv + dsctoIgv,
      total,
    });
  });

  if (comprobantes.length === 0 && ilegibles.length > 0) {
    const ej = ilegibles.slice(0, EJEMPLOS).map((x) => `línea ${x.linea}: ${x.motivo}`).join("; ");
    return { ok: false, error: `No encontré ningún comprobante que se pueda leer (${ej}). ¿Es la propuesta de ventas del SIRE en TXT?` };
  }
  if (periodos.size > 1) return { ok: false, error: `La propuesta trae más de un mes (${[...periodos.keys()].join(", ")}). Baja la de un solo mes.` };
  return { ok: true, ruc: masFrecuente(rucs), periodo: masFrecuente(periodos), comprobantes, conTitulos, ilegibles, repetidos, rangos };
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

const enSoles = (c: ImportesCruce): ImportesCruce => ({ base: aSoles(c.base), igv: aSoles(c.igv), total: aSoles(c.total) });
const sumar = (cs: Iterable<ImportesCruce>): ImportesCruce => {
  const s = { base: 0, igv: 0, total: 0 };
  for (const c of cs) {
    s.base += c.base;
    s.igv += c.igv;
    s.total += c.total;
  }
  return enSoles(s);
};
const ORDEN_CLASE: Record<ClaseDiferencia, number> = { soloSunat: 0, soloLibro: 1, importes: 2 };
const comparaClave = (a: string, b: string): number => a.localeCompare(b, "es", { numeric: true });
const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);

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
  const diferencias: DiferenciaCruce[] = [];
  let iguales = 0;
  const fila = (clase: ClaseDiferencia, c: ComprobanteCruce, l: ComprobanteCruce | null, s: ComprobanteCruce | null, campos: DiferenciaCruce["campos"] = []): DiferenciaCruce => ({
    clase,
    clave: c.clave,
    comprobante: c.comprobante,
    tipo: c.tipo,
    fecha: c.fecha,
    cliente: c.cliente,
    libro: l && enSoles(l),
    sunat: s && enSoles(s),
    campos,
    diferencia: aSoles((s?.total ?? 0) - (l?.total ?? 0)),
  });

  for (const s of sunat.values()) {
    const l = libro.get(s.clave);
    if (!l) {
      diferencias.push(fila("soloSunat", s, null, s));
      continue;
    }
    const campos = (["base", "igv", "total"] as const).filter((k) => Math.abs(s[k] - l[k]) > TOLERANCIA_CENTIMOS);
    if (campos.length === 0) iguales++;
    else diferencias.push(fila("importes", { ...s, fecha: l.fecha || s.fecha, cliente: l.cliente || s.cliente }, l, s, campos));
  }
  for (const l of libro.values()) if (!sunat.has(l.clave)) diferencias.push(fila("soloLibro", l, l, null));

  const resumen = {
    soloSunat: diferencias.filter((d) => d.clase === "soloSunat").length,
    soloLibro: diferencias.filter((d) => d.clase === "soloLibro").length,
    importes: diferencias.filter((d) => d.clase === "importes").length,
    iguales,
    enSunat: sunat.size,
    enLibro: libro.size,
    sinComprobante,
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
  if (propuesta.repetidos > 0) avisos.push(`${propuesta.repetidos} ${plural(propuesta.repetidos, "comprobante viene repetido", "comprobantes vienen repetidos")} en la propuesta: se contó una vez.`);
  if (propuesta.rangos > 0)
    avisos.push(`${propuesta.rangos} ${plural(propuesta.rangos, "línea de la propuesta es un rango", "líneas de la propuesta son rangos")} de boletas (del N.º inicial al final): se cruza solo por el número inicial.`);
  const recortadas = Math.max(0, diferencias.length - TOPE_DIFERENCIAS);
  if (recortadas > 0) avisos.push(`La lista muestra las primeras ${TOPE_DIFERENCIAS} diferencias; las cifras de arriba cuentan todas.`);

  return {
    ok: true,
    periodo: `${p[1]}-${p[2]}`,
    resumen,
    totales: { sunat: sumar(sunat.values()), libro: sumar(libro.values()) },
    diferencias: diferencias.slice(0, TOPE_DIFERENCIAS),
    recortadas,
    avisos,
  };
}
