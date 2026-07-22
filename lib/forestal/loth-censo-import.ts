/**
 * loth-censo-import — lector del CENSO tal como lo entrega el regente: una hoja
 * de Excel pegada, con sus encabezados en cualquier orden y en la jerga de cada
 * consultora ("N° árbol", "Nombre común", "DAP (cm)", "Este", "Norte"…).
 *
 * El importador anterior exigía 8 columnas en orden fijo, sin encabezado y sin
 * validar nada: un archivo real entraba mal o entraba roto, y el censo es el
 * PUNTO DE PARTIDA de toda la cadena de custodia — un código duplicado o un DAP
 * en cm leído como metros arruina el POA y la trazabilidad.
 *
 * Acá se parsea, se valida fila por fila y se devuelve un preview con errores
 * (no se importa) y avisos (se importa, pero se muestra). PURO y client-safe.
 */

import { dmcParaEspecie, normEspecie } from "./loth-poa";
import { parseUtmZone } from "./loth-utm";

/** Columnas que reconoce el lector, con sus alias reales de campo. */
const COLUMNAS: { key: CampoCenso; alias: string[] }[] = [
  { key: "treeCode", alias: ["codigo", "code", "arbol", "n arbol", "nro arbol", "n de arbol", "id", "codigo de arbol", "cod"] },
  { key: "speciesCommon", alias: ["especie", "nombre comun", "especie forestal", "nombre"] },
  { key: "dap", alias: ["dap", "dap m", "dap cm", "diametro", "diametro cm", "d"] },
  { key: "altura", alias: ["hc", "altura", "altura comercial", "altura comercial m", "hc m", "h"] },
  { key: "factorForma", alias: ["ff", "factor forma", "factor de forma"] },
  { key: "utmZona", alias: ["zona", "zona utm", "utm zona", "huso"] },
  { key: "utmX", alias: ["este", "x", "utm x", "coordenada este", "este m"] },
  { key: "utmY", alias: ["norte", "y", "utm y", "coordenada norte", "norte m"] },
  { key: "calidad", alias: ["calidad", "calidad de fuste", "cf"] },
  { key: "parcelaCorta", alias: ["parcela", "pc", "parcela de corta", "faja"] },
];

export type CampoCenso =
  | "treeCode"
  | "speciesCommon"
  | "dap"
  | "altura"
  | "factorForma"
  | "utmZona"
  | "utmX"
  | "utmY"
  | "calidad"
  | "parcelaCorta";

/** Orden posicional del formato viejo (sin encabezado). */
const POSICIONAL: CampoCenso[] = ["treeCode", "speciesCommon", "dap", "altura", "factorForma", "utmZona", "utmX", "utmY"];

export interface FilaCenso {
  linea: number;
  treeCode: string;
  speciesCommon: string;
  /** DAP en METROS (como lo guarda el censo), ya normalizado desde cm si venía así. */
  dapM: number | null;
  alturaComercialM: number | null;
  factorForma: number;
  utmZona: string | null;
  utmX: number | null;
  utmY: number | null;
  calidad: string | null;
  parcelaCorta: string | null;
  volumenEstimadoM3: number | null;
  /** Bloquean la importación de ESA fila. */
  errores: string[];
  /** No bloquean: se importa y se muestra. */
  avisos: string[];
}

export interface CensoImportResult {
  filas: FilaCenso[];
  /** Campo → índice de columna detectado (para mostrar qué leyó). */
  mapeo: Partial<Record<CampoCenso, number>>;
  conEncabezado: boolean;
  validas: number;
  conError: number;
  conAviso: number;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[°º().]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Delimitador del archivo: se elige UNO por hoja (el que más aparece). Partir
 * por "cualquiera de los tres" rompe el CSV europeo, donde la coma es decimal:
 * "0,80" se leería como dos columnas.
 */
function detectarDelimitador(lineas: string[]): string {
  const muestra = lineas.slice(0, 5).join("\n");
  const cuenta = (ch: string) => muestra.split(ch).length - 1;
  const tab = cuenta("\t");
  const puntoYcoma = cuenta(";");
  const coma = cuenta(",");
  if (tab >= puntoYcoma && tab >= coma && tab > 0) return "\t";
  if (puntoYcoma >= coma && puntoYcoma > 0) return ";";
  return ",";
}

const splitLinea = (linea: string, delim: string): string[] =>
  linea.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));

const numero = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const limpio = raw.replace(/\s/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

/** ¿La primera fila son encabezados? Si al menos 2 celdas matchean alias, sí. */
function detectarEncabezado(celdas: string[]): Partial<Record<CampoCenso, number>> | null {
  const mapeo: Partial<Record<CampoCenso, number>> = {};
  celdas.forEach((celda, i) => {
    const c = norm(celda);
    if (!c) return;
    for (const col of COLUMNAS) {
      if (mapeo[col.key] !== undefined) continue;
      if (col.alias.includes(c) || col.alias.some((a) => c === a || c.startsWith(`${a} `))) {
        mapeo[col.key] = i;
        return;
      }
    }
  });
  return Object.keys(mapeo).length >= 2 ? mapeo : null;
}

/**
 * El DAP viene en metros (0.80) o en centímetros (80): se distingue por la
 * magnitud. Un árbol de 80 m de diámetro no existe; uno de 0,80 m sí.
 */
function dapAMetros(valor: number | null): { m: number | null; convertido: boolean } {
  if (valor == null || !Number.isFinite(valor) || valor <= 0) return { m: null, convertido: false };
  if (valor > 5) return { m: valor / 100, convertido: true }; // venía en cm
  return { m: valor, convertido: false };
}

/** Volumen del censo: Smalian sobre el DAP con factor de forma. */
export function volumenCenso(dapM: number | null, alturaM: number | null, ff: number): number | null {
  if (!dapM || !alturaM || dapM <= 0 || alturaM <= 0) return null;
  return Number((0.7854 * dapM * dapM * alturaM * (ff || 0.65)).toFixed(4));
}

export interface CensoImportContext {
  /** Códigos que ya existen en el censo del plan (para detectar repetidos). */
  codigosExistentes?: Set<string>;
  /** Especies autorizadas del plan (normalizadas) — avisa si la fila cae fuera. */
  especiesAutorizadas?: Set<string>;
  /** DMC por especie fijado en el plan. */
  dmcOverrides?: Record<string, number>;
}

/**
 * Texto pegado / CSV → filas listas para importar, con sus errores y avisos.
 * Nunca lanza: una hoja sucia devuelve filas marcadas, no una excepción.
 */
export function parseCensoTabla(texto: string, ctx: CensoImportContext = {}): CensoImportResult {
  // OJO: NO se hace trim de la línea entera. Si la primera celda viene vacía
  // ("\tTornillo\t80"), el trim se come el separador y CORRE todas las columnas
  // una posición: el código pasa a ser la especie y la hoja entra mal.
  const lineas = String(texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);

  const vacio: CensoImportResult = { filas: [], mapeo: {}, conEncabezado: false, validas: 0, conError: 0, conAviso: 0 };
  if (lineas.length === 0) return vacio;

  const delim = detectarDelimitador(lineas);
  const primera = splitLinea(lineas[0], delim);
  const cabecera = detectarEncabezado(primera);
  const mapeo: Partial<Record<CampoCenso, number>> = cabecera ?? Object.fromEntries(POSICIONAL.map((k, i) => [k, i]));
  const cuerpo = cabecera ? lineas.slice(1) : lineas;

  const vistos = new Map<string, number>();
  const filas: FilaCenso[] = [];

  cuerpo.forEach((linea, idx) => {
    const celdas = splitLinea(linea, delim);
    const get = (k: CampoCenso): string | undefined => {
      const i = mapeo[k];
      return i === undefined ? undefined : celdas[i];
    };

    const errores: string[] = [];
    const avisos: string[] = [];

    const treeCode = (get("treeCode") ?? "").trim();
    const speciesCommon = (get("speciesCommon") ?? "").trim();
    if (!treeCode) errores.push("Falta el código del árbol");
    if (!speciesCommon) errores.push("Falta la especie");

    // Duplicados: dentro del archivo y contra el censo ya cargado.
    const key = treeCode.toLowerCase();
    if (treeCode) {
      const antes = vistos.get(key);
      if (antes !== undefined) errores.push(`Código repetido en el archivo (ya está en la línea ${antes})`);
      else vistos.set(key, idx + (cabecera ? 2 : 1));
      if (ctx.codigosExistentes?.has(key)) errores.push("Ese código ya existe en el censo del plan");
    }

    const { m: dapM, convertido } = dapAMetros(numero(get("dap")));
    if (dapM == null) avisos.push("Sin DAP: no entra al volumen aprovechable del POA");
    else if (dapM > 3) errores.push(`DAP de ${(dapM * 100).toFixed(0)} cm: revisá la unidad`);
    else if (convertido) avisos.push(`DAP leído en cm (${(dapM * 100).toFixed(0)}) → ${dapM.toFixed(2)} m`);

    const alturaComercialM = numero(get("altura"));
    if (alturaComercialM != null && (alturaComercialM <= 0 || alturaComercialM > 80)) {
      errores.push(`Altura comercial de ${alturaComercialM} m fuera de rango`);
    }

    const ffRaw = numero(get("factorForma"));
    const factorForma = ffRaw != null && ffRaw > 0 && ffRaw <= 1 ? ffRaw : 0.65;

    const utmZonaRaw = (get("utmZona") ?? "").trim();
    const utmX = numero(get("utmX"));
    const utmY = numero(get("utmY"));
    if ((utmX == null) !== (utmY == null)) errores.push("Coordenada UTM incompleta (falta Este o Norte)");
    if (utmX != null && (utmX < 100_000 || utmX > 999_999)) errores.push(`Este ${utmX} fuera del rango UTM`);
    if (utmY != null && (utmY <= 0 || utmY > 10_000_000)) errores.push(`Norte ${utmY} fuera del rango UTM`);
    if (utmX == null && utmY == null) avisos.push("Sin coordenada: el árbol no se va a ver en el mapa");

    if (speciesCommon && ctx.especiesAutorizadas?.size && !ctx.especiesAutorizadas.has(normEspecie(speciesCommon))) {
      avisos.push("Especie no autorizada en el plan de manejo");
    }
    if (speciesCommon && dapM != null) {
      const { cm } = dmcParaEspecie(speciesCommon, ctx.dmcOverrides ?? {});
      if (dapM * 100 < cm) avisos.push(`Bajo el DMC de ${cm} cm: se censa, pero no es aprovechable`);
    }

    filas.push({
      linea: idx + (cabecera ? 2 : 1),
      treeCode,
      speciesCommon,
      dapM,
      alturaComercialM,
      factorForma,
      utmZona: utmZonaRaw ? `${parseUtmZone(utmZonaRaw).zone}${utmZonaRaw.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 1) || "L"}` : null,
      utmX,
      utmY,
      calidad: (get("calidad") ?? "").trim() || null,
      parcelaCorta: (get("parcelaCorta") ?? "").trim() || null,
      volumenEstimadoM3: volumenCenso(dapM, alturaComercialM, factorForma),
      errores,
      avisos,
    });
  });

  return {
    filas,
    mapeo,
    conEncabezado: !!cabecera,
    validas: filas.filter((f) => f.errores.length === 0).length,
    conError: filas.filter((f) => f.errores.length > 0).length,
    conAviso: filas.filter((f) => f.errores.length === 0 && f.avisos.length > 0).length,
  };
}

/** Filas listas para el endpoint bulk (solo las que no tienen errores). */
export function filasImportables(res: CensoImportResult): Record<string, unknown>[] {
  return res.filas
    .filter((f) => f.errores.length === 0)
    .map((f) => ({
      treeCode: f.treeCode,
      speciesCommon: f.speciesCommon,
      dapM: f.dapM,
      alturaComercialM: f.alturaComercialM,
      factorForma: f.factorForma,
      volumenEstimadoM3: f.volumenEstimadoM3,
      utmZona: f.utmZona,
      utmX: f.utmX,
      utmY: f.utmY,
      calidad: f.calidad,
      parcelaCorta: f.parcelaCorta,
    }));
}
