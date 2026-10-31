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
 *
 * Dos entradas: `parseCensoTabla(texto)` para lo pegado o un CSV, y
 * `parseCensoFilas(matriz)` para un .xlsx ya leído a celdas
 * (`leerArchivoAFilas` de `cubicacion-import-file`).
 *
 * 28-09, con la hoja real de un regente (N° · Cod · N. Comun · N. Cientifico ·
 * Nombre en idioma nativo · DAP · altura · vol · Este · Norte · condicion ·
 * observaciones): «Nombre en idioma nativo» caía en la ESPECIE por prefijo de
 * «nombre» —la Copaiba entraba como «Coubé»—, «N. Comun» no se reconocía, y el
 * científico, el volumen, la condición y las observaciones se perdían. Además
 * «14,853» (un volumen con coma decimal) se leía como 14 853.
 */

import { DAP_AVISO_M, DAP_MAX_M, mensajeDapFueraDeRango } from "./loth-constants";
import { dmcParaEspecie, normEspecie } from "./loth-poa";
import { parseUtmZone } from "./loth-utm";

/** Columnas que reconoce el lector, con sus alias reales de campo. */
const COLUMNAS: { key: CampoCenso; alias: string[] }[] = [
  { key: "treeCode", alias: ["codigo", "code", "arbol", "n arbol", "nro arbol", "n de arbol", "id", "codigo de arbol", "cod", "cod arbol", "codigo arbol"] },
  { key: "speciesCommon", alias: ["especie", "nombre comun", "n comun", "nom comun", "especie forestal", "nombre"] },
  { key: "speciesScientific", alias: ["nombre cientifico", "n cientifico", "nom cientifico", "cientifico", "especie cientifica"] },
  { key: "speciesNative", alias: ["nombre en idioma nativo", "idioma nativo", "nombre nativo", "nombre en lengua nativa", "lengua nativa", "n nativo", "nativo"] },
  { key: "dap", alias: ["dap", "dap m", "dap cm", "diametro", "diametro cm", "d"] },
  { key: "altura", alias: ["hc", "altura", "altura comercial", "altura comercial m", "hc m", "h"] },
  { key: "factorForma", alias: ["ff", "factor forma", "factor de forma"] },
  { key: "volumen", alias: ["vol", "volumen", "vol m3", "volumen m3", "vol m³", "volumen m³", "volumen estimado", "vol est"] },
  { key: "utmZona", alias: ["zona", "zona utm", "utm zona", "huso"] },
  { key: "utmX", alias: ["este", "x", "utm x", "coordenada este", "este m"] },
  { key: "utmY", alias: ["norte", "y", "utm y", "coordenada norte", "norte m"] },
  { key: "calidad", alias: ["calidad", "calidad de fuste", "cf"] },
  { key: "condicion", alias: ["condicion", "condicion del arbol", "condicion arbol"] },
  { key: "parcelaCorta", alias: ["parcela", "pc", "parcela de corta", "faja"] },
  { key: "notes", alias: ["observaciones", "observacion", "obs", "notas", "nota"] },
];

/**
 * El encabezado de la plantilla que se descarga: el de la hoja real del
 * regente, en su orden. «N°» es el correlativo de la hoja y no se guarda.
 */
export const ENCABEZADO_PLANTILLA_CENSO = [
  "N°",
  "Cod",
  "N. Comun",
  "N. Cientifico",
  "Nombre en idioma nativo",
  "DAP",
  "altura",
  "vol",
  "Este",
  "Norte",
  "condicion",
  "observaciones",
] as const;

export type CampoCenso =
  | "treeCode"
  | "speciesCommon"
  | "speciesScientific"
  | "speciesNative"
  | "dap"
  | "altura"
  | "factorForma"
  | "volumen"
  | "utmZona"
  | "utmX"
  | "utmY"
  | "calidad"
  | "condicion"
  | "parcelaCorta"
  | "notes";

/** Orden posicional del formato viejo (sin encabezado). */
const POSICIONAL: CampoCenso[] = ["treeCode", "speciesCommon", "dap", "altura", "factorForma", "utmZona", "utmX", "utmY"];

export interface FilaCenso {
  linea: number;
  treeCode: string;
  speciesCommon: string;
  speciesScientific: string | null;
  /** Nombre en idioma nativo («Coubé»), tal como viene en la hoja. */
  speciesNative: string | null;
  /** DAP en METROS (como lo guarda el censo), ya normalizado desde cm si venía así. */
  dapM: number | null;
  alturaComercialM: number | null;
  factorForma: number;
  utmZona: string | null;
  utmX: number | null;
  utmY: number | null;
  calidad: string | null;
  /** Condición que declara el censo («Aprovechable»…), no la categoría POA que calcula el sistema. */
  condicion: string | null;
  parcelaCorta: string | null;
  notes: string | null;
  /** El de la hoja si lo trae (es el declarado); si no, DAP² × π/4 × altura × ff. */
  volumenEstimadoM3: number | null;
  /** ¿`volumenEstimadoM3` vino en la hoja (true) o lo calculó el sistema? */
  volumenDeLaHoja: boolean;
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

/**
 * Texto → filas de celdas, respetando comillas. Una celda de Excel con salto de
 * línea («Nombre en↵idioma nativo») se pega entre comillas: partir por líneas
 * antes de mirar las comillas la cortaba en dos filas y corría el encabezado.
 */
function partirFilas(texto: string, delim: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') enComillas = false;
      else celda += c;
    } else if (c === '"' && celda.trim() === "") {
      enComillas = true;
    } else if (c === delim) {
      fila.push(celda.trim()); celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda.trim()); celda = "";
      filas.push(fila); fila = [];
    } else {
      celda += c;
    }
  }
  fila.push(celda.trim());
  filas.push(fila);
  return filas.filter((f) => f.some((x) => x.length > 0));
}

/**
 * Número con coma o punto decimal.
 *
 * Una medida del censo (DAP, altura, factor, volumen) nunca llega a miles: la
 * coma es SIEMPRE decimal. Antes se tomaba «,853» como miles y un volumen de
 * 14,853 m³ entraba como 14 853 m³ (y un DAP «0,870» como 870 → «8,70 m en
 * cm»). Con punto y coma juntos manda el que va último («1.234,5» o «1,234.5»).
 * Las coordenadas sí pueden traer miles («521,922»): van con `miles`.
 */
const numero = (raw: string | undefined, { miles = false }: { miles?: boolean } = {}): number | null => {
  if (!raw) return null;
  let limpio = raw.replace(/\s/g, "");
  if (!limpio) return null;
  const coma = limpio.lastIndexOf(",");
  const punto = limpio.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    limpio = coma > punto ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  } else if (coma >= 0) {
    limpio = miles && /^-?\d{1,3}(,\d{3})+$/.test(limpio) ? limpio.replace(/,/g, "") : limpio.replace(",", ".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

/**
 * ¿La primera fila son encabezados? Si al menos 2 celdas matchean alias, sí.
 *
 * Dos pasadas: primero los nombres EXACTOS de cualquier columna, después los
 * que empiezan con un alias (el más largo gana). En una sola pasada por prefijo,
 * «nombre en idioma nativo» empezaba con «nombre» y se quedaba con la especie.
 */
function detectarEncabezado(celdas: string[]): Partial<Record<CampoCenso, number>> | null {
  const mapeo: Partial<Record<CampoCenso, number>> = {};
  const normalizadas = celdas.map((celda) => norm(celda));
  const usadas = new Set<number>();
  normalizadas.forEach((c, i) => {
    if (!c) return;
    const col = COLUMNAS.find((k) => mapeo[k.key] === undefined && k.alias.includes(c));
    if (col) { mapeo[col.key] = i; usadas.add(i); }
  });
  normalizadas.forEach((c, i) => {
    if (!c || usadas.has(i)) return;
    let mejor: { key: CampoCenso; largo: number } | null = null;
    for (const col of COLUMNAS) {
      if (mapeo[col.key] !== undefined) continue;
      for (const a of col.alias) {
        if (c.startsWith(`${a} `) && (!mejor || a.length > mejor.largo)) mejor = { key: col.key, largo: a.length };
      }
    }
    if (mejor) { mapeo[mejor.key] = i; usadas.add(i); }
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

const VACIO: CensoImportResult = { filas: [], mapeo: {}, conEncabezado: false, validas: 0, conError: 0, conAviso: 0 };

/**
 * Texto pegado / CSV → filas listas para importar, con sus errores y avisos.
 * Nunca lanza: una hoja sucia devuelve filas marcadas, no una excepción.
 */
export function parseCensoTabla(texto: string, ctx: CensoImportContext = {}): CensoImportResult {
  // OJO: NO se hace trim de la línea entera. Si la primera celda viene vacía
  // ("\tTornillo\t80"), el trim se come el separador y CORRE todas las columnas
  // una posición: el código pasa a ser la especie y la hoja entra mal.
  const bruto = String(texto ?? "");
  const lineas = bruto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return VACIO;
  return parseCensoFilas(partirFilas(bruto, detectarDelimitador(lineas)), ctx);
}

/**
 * Celdas de una hoja (un .xlsx leído con `leerArchivoAFilas`, o el texto ya
 * partido) → filas del censo. Los números de Excel llegan como número y se
 * leen con punto decimal: `14.853` es 14,853 m³.
 */
export function parseCensoFilas(
  matriz: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
  ctx: CensoImportContext = {},
): CensoImportResult {
  const texto = (v: string | number | null | undefined): string =>
    v == null ? "" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v).trim();
  const filasTexto = matriz.map((f) => f.map(texto)).filter((f) => f.some((c) => c.length > 0));
  if (filasTexto.length === 0) return VACIO;

  const cabecera = detectarEncabezado(filasTexto[0]);
  const mapeo: Partial<Record<CampoCenso, number>> = cabecera ?? Object.fromEntries(POSICIONAL.map((k, i) => [k, i]));
  const cuerpo = cabecera ? filasTexto.slice(1) : filasTexto;

  const vistos = new Map<string, number>();
  const filas: FilaCenso[] = [];

  cuerpo.forEach((celdas, idx) => {
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

    // Fuera de tope: NO se inventa ni se convierte sola — la fila queda con
    // error y la sugerencia (casillero vacío > inventado, ver DAP_MAX_M).
    const { m: dapM, convertido } = dapAMetros(numero(get("dap")));
    if (dapM == null) avisos.push("Sin DAP: no entra al volumen aprovechable del POA");
    else if (dapM > DAP_MAX_M) errores.push(mensajeDapFueraDeRango(dapM));
    else if (convertido) avisos.push(`DAP leído en cm (${(dapM * 100).toFixed(0)}) → ${dapM.toFixed(2)} m`);
    else if (dapM > DAP_AVISO_M) avisos.push(`DAP de ${dapM.toFixed(2)} m: revisa que esté en metros, no en centímetros.`);

    const alturaComercialM = numero(get("altura"));
    if (alturaComercialM != null && (alturaComercialM <= 0 || alturaComercialM > 80)) {
      errores.push(`Altura comercial de ${alturaComercialM} m fuera de rango`);
    }

    const ffRaw = numero(get("factorForma"));
    const factorForma = ffRaw != null && ffRaw > 0 && ffRaw <= 1 ? ffRaw : 0.65;

    /* El volumen de la hoja es el DECLARADO: si viene, manda (un derivado nunca
       se presenta como el dato). Se avisa sólo si no puede salir de un factor
       de forma real — la tolerancia es de campo, no de redondeo: con ff 0,65 y
       la hoja redondeada a 3 decimales, diferencias de 0,001 son ruido. */
    const volHoja = numero(get("volumen"));
    const volCalculado = volumenCenso(dapM, alturaComercialM, factorForma);
    if (volHoja != null && volHoja < 0) errores.push(`Volumen de ${volHoja} m³ negativo`);
    else if (volHoja != null && dapM && alturaComercialM) {
      const ffImplicito = volHoja / (0.7854 * dapM * dapM * alturaComercialM);
      if (ffImplicito < 0.4 || ffImplicito > 0.9) {
        avisos.push(
          `El volumen de la hoja (${volHoja} m³) no cuadra con el DAP y la altura: con ellos saldría ${volCalculado ?? "—"} m³. Revisa la fila.`,
        );
      }
    }
    const volumenDeLaHoja = volHoja != null && volHoja >= 0;

    const utmZonaRaw = (get("utmZona") ?? "").trim();
    const utmX = numero(get("utmX"), { miles: true });
    const utmY = numero(get("utmY"), { miles: true });
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
      speciesScientific: (get("speciesScientific") ?? "").trim() || null,
      speciesNative: (get("speciesNative") ?? "").trim() || null,
      dapM,
      alturaComercialM,
      factorForma,
      utmZona: utmZonaRaw ? `${parseUtmZone(utmZonaRaw).zone}${utmZonaRaw.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 1) || "L"}` : null,
      utmX,
      utmY,
      calidad: (get("calidad") ?? "").trim() || null,
      condicion: (get("condicion") ?? "").trim() || null,
      parcelaCorta: (get("parcelaCorta") ?? "").trim() || null,
      notes: (get("notes") ?? "").trim() || null,
      volumenEstimadoM3: volumenDeLaHoja ? volHoja : volCalculado,
      volumenDeLaHoja,
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
      speciesScientific: f.speciesScientific,
      speciesNative: f.speciesNative,
      dapM: f.dapM,
      alturaComercialM: f.alturaComercialM,
      factorForma: f.factorForma,
      volumenEstimadoM3: f.volumenEstimadoM3,
      utmZona: f.utmZona,
      utmX: f.utmX,
      utmY: f.utmY,
      calidad: f.calidad,
      condicion: f.condicion,
      parcelaCorta: f.parcelaCorta,
      notes: f.notes,
    }));
}
