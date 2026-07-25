/**
 * anexo04-serfor.ts — arma la "LISTA DE PRODUCTOS TRANSFORMADOS" (ANEXO N° 04
 * de la Guía de Transporte Forestal, SERFOR) a partir del lote cubicado.
 *
 * Formato oficial: 4 BLOQUES por hoja, cada bloque con 6 columnas
 * (N° · (6) Cant · (7) E · (8) A · (9) L · (10) V) y 35 filas fijas. Un bloque =
 * UNA especie + UN tipo de producto; nunca se mezclan (así lo exige el anexo, y
 * por eso el subtotal (11) de cada bloque es leíble por el fiscalizador).
 *
 * PURO: sin DOM y sin jsPDF. Acá vive TAMBIÉN la geometría de la hoja (en pt de
 * A4) porque la consumen los dos renderers — el preview HTML y el PDF — y de
 * esa forma no pueden divergir: lo que se ve en pantalla es lo que se descarga.
 */
import type { PiezaCubicada } from "./cubicacion";
import { toInches, toFeet } from "./cubicacion";
import { clasificarTipo, ordenTipo, type TipoComercial } from "./cubicacion-tipo";

// ─── Datos que llena el emisor (cabecera y pie del anexo) ───────────────────

/** Unidad de la columna (10) V y de los subtotales (11). */
export type UnidadVolumen = "pt" | "m3";

export interface DatosAnexo04 {
  /** (1) N° del anexo. */ numero: string;
  /** (2) GTF N°. */ gtf: string;
  /** Razón social del CTP que emite (cabecera izquierda). */ empresa: string;
  /** (12) Observaciones. */ observaciones: string;
  /** (14) Nombres y apellidos del emisor. */ firmante: string;
  /** (15) Documento de identidad del emisor. */ documento: string;
  /** (16) Cargo que desempeña el emisor. */ cargo: string;
  /** Unidad de la columna V: pie tablar (como el formato llenado) o m³. */ unidadV: UnidadVolumen;
  /** "oficial" = 35 filas fijas por bloque; "compacto" = solo las usadas. */ modo: "oficial" | "compacto";
  /** Logo del emisor (dataURL) — el formato oficial lo lleva arriba a la izquierda. */ logo?: string;
  /** Proporción ancho/alto del logo, para no deformarlo al encajarlo. */ logoAspect?: number;
}

export const DATOS_ANEXO04_DEFAULT: DatosAnexo04 = {
  numero: "", gtf: "", empresa: "", observaciones: "",
  firmante: "", documento: "", cargo: "", unidadV: "pt", modo: "oficial",
};

/** Firmante guardado: en el aserradero firman siempre los mismos 2 o 3. */
export interface EmisorGuardado { firmante: string; documento: string; cargo: string }

/**
 * Siguiente correlativo a partir del último usado: incrementa el ÚLTIMO tramo
 * numérico y le conserva los ceros a la izquierda ("2-19-0461363" → "2-19-0461364",
 * "0009" → "0010"). Sin números, devuelve el mismo texto.
 */
export function siguienteCorrelativo(actual: string): string {
  const m = actual.match(/(\d+)(\D*)$/);
  if (!m) return actual;
  const [, num, cola] = m;
  const sig = String(Number(num) + 1).padStart(num.length, "0");
  return actual.slice(0, m.index) + sig + cola;
}

// ─── Estructura de la hoja ──────────────────────────────────────────────────

export interface FilaAnexo04 {
  /** Correlativo dentro del bloque (1..35). */ n: number;
  cantidad: number;
  /** (7) Espesor en pulgadas. */ e: number;
  /** (8) Ancho en pulgadas. */ a: number;
  /** (9) Largo en pies. */ l: number;
  /** (10) Volumen en la unidad elegida (pie tablar o m³). */ v: number;
}

export interface BloqueAnexo04 {
  /** (4) Especie. */ especie: string;
  /** (5) Tipo de producto. */ tipo: string;
  filas: FilaAnexo04[];
  /** (11) SUB TOTAL del bloque. */ subtotal: number;
  /** El grupo no entró en un bloque y sigue acá. */ continuacion: boolean;
}

export interface HojaAnexo04 {
  bloques: BloqueAnexo04[];
  /** Filas dibujadas por bloque en ESTA hoja (35 en modo oficial). */ filasPorBloque: number;
}

export interface Anexo04 {
  hojas: HojaAnexo04[];
  totalPiezas: number;
  totalPt: number;
  /** (3) VOLUMEN TOTAL — siempre en m³, como el formato oficial. */ totalM3: number;
  unidadV: UnidadVolumen;
}

export const FILAS_OFICIAL = 35;
export const BLOQUES_POR_HOJA = 4;
/** Mínimo de filas dibujadas en modo compacto (una hoja con 1 fila queda rara). */
const FILAS_MIN_COMPACTO = 6;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Número con COMA decimal y sin separador de miles — así viene llenado el
 * formato oficial ("414,000", "2529,000", volumen total "10,640").
 */
export const fmtAnexo = (n: number, dec = 3): string => n.toFixed(dec).replace(".", ",");

/** Medida: hasta 2 decimales, sin ceros de relleno ("6", "1,5", "0,75"). */
export const fmtMedida = (n: number): string => {
  const s = (Math.round(n * 100) / 100).toString();
  return s.replace(".", ",");
};

/**
 * Pie tablar EXACTO de la fila. `pieza.pieTablar` viene redondeado a 2 decimales
 * (basta para vender), pero el anexo imprime 3: una pieza 2"×5"×7' es 5,833 y no
 * 5,83, y los subtotales del formato oficial salen de los valores exactos.
 */
const ptExacto = (r: PiezaCubicada): number =>
  ((toInches(r.espesor, r.uEspesor) * toInches(r.ancho, r.uAncho) * toFeet(r.largo, r.uLargo)) / 12) *
  (r.cantidad > 0 ? r.cantidad : 1);

/** Especie de la pieza, con el fallback del lote y en MAYÚSCULA como el anexo. */
const especieDe = (r: PiezaCubicada, global?: string): string =>
  (r.especie || global || "SIN ESPECIE").toUpperCase();

/** Tipo de producto (nomenclatura del aserradero) en MAYÚSCULA. */
const tipoDe = (r: PiezaCubicada): TipoComercial => clasificarTipo(r);

function trocear<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Agrupa el lote en bloques especie × tipo (sin mezclar), los trocea de a 35
 * filas y los reparte de a 4 por hoja. El orden es: especie por aparición en el
 * lote (respeta cómo lo cargó el operario) y dentro de cada especie el orden
 * canónico de tipos (comercial primero).
 */
export function construirAnexo04(
  rows: PiezaCubicada[],
  datos: Pick<DatosAnexo04, "unidadV" | "modo">,
  opts: { especieGlobal?: string } = {},
): Anexo04 {
  const { unidadV, modo } = datos;
  const vDe = (r: PiezaCubicada) => (unidadV === "m3" ? r.m3 : ptExacto(r));

  // Agrupar por especie × tipo conservando el orden de aparición de la especie.
  const grupos = new Map<string, { especie: string; tipo: TipoComercial; piezas: PiezaCubicada[]; orden: number }>();
  const ordenEspecie = new Map<string, number>();
  for (const r of rows) {
    const especie = especieDe(r, opts.especieGlobal);
    const tipo = tipoDe(r);
    if (!ordenEspecie.has(especie)) ordenEspecie.set(especie, ordenEspecie.size);
    const key = `${especie}||${tipo}`;
    const g = grupos.get(key);
    if (g) g.piezas.push(r);
    else grupos.set(key, { especie, tipo, piezas: [r], orden: ordenEspecie.get(especie)! });
  }

  const ordenados = [...grupos.values()].sort(
    (a, b) => a.orden - b.orden || ordenTipo(a.tipo) - ordenTipo(b.tipo),
  );

  const bloques: BloqueAnexo04[] = [];
  for (const g of ordenados) {
    trocear(g.piezas, FILAS_OFICIAL).forEach((chunk, i) => {
      const filas = chunk.map((r, j) => ({
        n: j + 1,
        cantidad: r.cantidad,
        e: r2(toInches(r.espesor, r.uEspesor)),
        a: r2(toInches(r.ancho, r.uAncho)),
        l: r2(toFeet(r.largo, r.uLargo)),
        v: r3(vDe(r)),
      }));
      bloques.push({
        especie: g.especie,
        tipo: g.tipo.toUpperCase(),
        filas,
        // El subtotal suma los valores EXACTOS (como el Excel del formato), no
        // los ya redondeados de cada fila: así cierra con la guía llenada a mano.
        subtotal: r3(chunk.reduce((a, r) => a + vDe(r), 0)),
        continuacion: i > 0,
      });
    });
  }

  const hojas: HojaAnexo04[] = trocear(bloques, BLOQUES_POR_HOJA).map((bs) => ({
    bloques: bs,
    filasPorBloque:
      modo === "oficial"
        ? FILAS_OFICIAL
        : Math.max(FILAS_MIN_COMPACTO, ...bs.map((b) => b.filas.length)),
  }));
  // Un lote vacío igual imprime la hoja en blanco (el formato se llena a mano).
  if (hojas.length === 0) hojas.push({ bloques: [], filasPorBloque: modo === "oficial" ? FILAS_OFICIAL : FILAS_MIN_COMPACTO });

  return {
    hojas,
    totalPiezas: rows.reduce((a, r) => a + r.cantidad, 0),
    totalPt: r2(rows.reduce((a, r) => a + ptExacto(r), 0)),
    totalM3: r3(rows.reduce((a, r) => a + r.m3, 0)),
    unidadV,
  };
}

// ─── Geometría de la hoja A4 (pt) — compartida por el PDF y el preview ──────

export const PAGINA = { w: 595.28, h: 841.89, margen: 20 } as const;

/** Anchos de las 6 columnas de un bloque, en pt (suman el ancho del bloque). */
export const COLS = [17, 25, 18, 18, 21, 39.82] as const;

export interface GeoHoja {
  contentW: number; bloqueW: number; cols: readonly number[];
  yBanner: number; hBanner: number;
  yInstr: number; hInstr: number;
  yInfo: number; hInfo: number;
  yBloqueHead: number; hBloqueHead: number;
  yTblHead: number; hTblHead: number;
  yFilas: number; hFila: number; filas: number;
  ySub: number; hSub: number;
  yObs: number; hObs: number;
  yLegal: number;
  /** Y de las 4 líneas de firma (13)-(16), dentro del recuadro de observaciones. */
  yFirmas: number[];
  /** X donde arranca el bloque i (0..3). */ xBloque: (i: number) => number;
  /** X donde arranca la columna j dentro de un bloque. */ xCol: (i: number, j: number) => number;
  /** Caja máxima del logo del emisor (arriba a la izquierda, como el oficial). */
  logoBox: { x: number; y: number; w: number; h: number };
  /** X donde arranca la razón social (corrida si hay logo). */ xEmpresa: (conLogo: boolean) => number;
  /** Ancho disponible para la razón social. */ wEmpresa: (conLogo: boolean) => number;
}

/**
 * Posiciones verticales/horizontales de una hoja, en pt de A4. El alto de fila
 * se ajusta a las filas que toque dibujar: 35 (oficial) las achica, un bloque
 * compacto las agranda hasta 18pt. El recuadro de observaciones estira para
 * llegar al pie, así la hoja compacta no queda con un hueco a la mitad.
 */
export function geometriaHoja(filas: number): GeoHoja {
  const m = PAGINA.margen;
  const contentW = PAGINA.w - m * 2;
  const bloqueW = contentW / BLOQUES_POR_HOJA;
  const escalaCol = bloqueW / COLS.reduce((a, c) => a + c, 0);
  const cols = COLS.map((c) => c * escalaCol);

  const yBanner = m, hBanner = 26;
  const yInstr = yBanner + hBanner, hInstr = 12;
  const yInfo = yInstr + hInstr, hInfo = 64;
  const yBloqueHead = yInfo + hInfo, hBloqueHead = 20;
  const yTblHead = yBloqueHead + hBloqueHead, hTblHead = 12;
  const yFilas = yTblHead + hTblHead;
  const hSub = 14;
  const yLegal = PAGINA.h - 46;
  const hObsMin = 96;
  const disponible = yLegal - 8 - hObsMin - 8 - hSub - yFilas;
  const hFila = Math.min(filas >= FILAS_OFICIAL ? 13.2 : 18, disponible / Math.max(1, filas));
  const ySub = yFilas + hFila * filas;
  const yObs = ySub + hSub + 8;
  const hObs = Math.max(hObsMin, yLegal - 8 - yObs);
  const yFirmas = [0, 1, 2, 3].map((i) => yObs + hObs - 14 - (3 - i) * 24);

  return {
    contentW, bloqueW, cols,
    yBanner, hBanner, yInstr, hInstr, yInfo, hInfo,
    yBloqueHead, hBloqueHead, yTblHead, hTblHead,
    yFilas, hFila, filas, ySub, hSub, yObs, hObs, yLegal, yFirmas,
    xBloque: (i: number) => m + i * bloqueW,
    xCol: (i: number, j: number) => m + i * bloqueW + cols.slice(0, j).reduce((a, c) => a + c, 0),
    logoBox: { x: m + 2, y: yInfo + 4, w: 56, h: 42 },
    xEmpresa: (conLogo: boolean) => m + (conLogo ? 64 : 2),
    wEmpresa: (conLogo: boolean) => (conLogo ? 84 : 150),
  };
}

/** Encabezados de las 6 columnas, con la numeración del formato oficial. */
export const HEAD_COLS = ["N°", "(6) Cant", "(7) E", "(8) A", "(9) L", "(10) V"] as const;

/** Textos fijos del pie — compartidos por el PDF y el preview. */
export const TEXTO_LEGAL = [
  "La GTF no es válida si contiene enmendaduras y/o alteraciones",
  "La presente GTF tiene carácter de declaración jurada y está sujeta a acciones penales contempladas en el numeral 34.3 del artículo N.º 34 de la Ley 27444 (Ley del Procedimiento Administrativo General)",
] as const;

export const ETIQUETAS_FIRMA = [
  "(13) Firma y sello del emisor",
  "(14) Nombres y apellidos del emisor",
  "(15) Documento de Identidad del emisor",
  "(16) Cargo que desempeña el emisor",
] as const;

/** Nota al pie que explica la unidad de la columna V (el anexo no la aclara). */
export const notaUnidad = (u: UnidadVolumen): string =>
  u === "pt"
    ? "(10) V = pie tablar: (E\" × A\" × L') ÷ 12 × cantidad. Volumen total (3) en m³."
    : "(10) V = m³ por medida (espesor × ancho × largo). Volumen total (3) en m³.";
