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
import { tipoDePieza, ordenTipo, type TipoComercial } from "./cubicacion-tipo";

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
  /** Firma escaneada (dataURL): se dibuja SOBRE la línea (13). */ firma?: string;
  firmaAspect?: number;
  /** Sello de la empresa (dataURL): junto a la firma, como en el papel. */ sello?: string;
  selloAspect?: number;
}

/** Las tres imágenes que puede llevar la hoja, con su campo de proporción. */
export const IMAGENES_ANEXO = [
  { campo: "logo", aspecto: "logoAspect", label: "Logo" },
  { campo: "firma", aspecto: "firmaAspect", label: "Firma" },
  { campo: "sello", aspecto: "selloAspect", label: "Sello" },
] as const;

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
  /** (11) SUB TOTAL del bloque, en la unidad elegida (pt o m³). */ subtotal: number;
  /**
   * El mismo subtotal SIEMPRE en m³. El casillero (3) se declara en metros
   * cúbicos aunque la columna V vaya en pies tablares, así que el volumen de la
   * hoja no se puede derivar de `subtotal`.
   */
  m3: number;
  /** El grupo no entró en un bloque y sigue acá. */ continuacion: boolean;
}

export interface HojaAnexo04 {
  bloques: BloqueAnexo04[];
  /** Filas dibujadas por bloque en ESTA hoja (35 en modo oficial). */ filasPorBloque: number;
  /**
   * (3) VOLUMEN TOTAL **de esta hoja**, en m³.
   *
   * Cada hoja es un papel que viaja y se muestra sola en un puesto de control:
   * si las tres dijeran el total del anexo, cualquiera de ellas ampararía 20 m³
   * teniendo 5. El total del documento sigue disponible en `Anexo04.totalM3`.
   */
  totalM3: number;
}

export interface Anexo04 {
  hojas: HojaAnexo04[];
  totalPiezas: number;
  totalPt: number;
  /**
   * (3) VOLUMEN TOTAL — siempre en m³, como el formato oficial. Es el que se
   * IMPRIME: igual a `totalCalculadoM3` salvo que se declare uno a mano
   * (`totalManualM3`), en cuyo caso las hojas se reconcilian contra ESTE valor.
   */
  totalM3: number;
  /**
   * El total que sale de sumar las piezas, sin ningún ajuste a mano — la
   * referencia para saber cuánto se movió `totalM3` cuando alguien lo declaró
   * distinto. Nunca se pierde, aunque `totalM3` esté ajustado.
   */
  totalCalculadoM3: number;
  unidadV: UnidadVolumen;
}

/** Lo que aceptan `construirAnexo04` y las salidas (PDF/Excel) que lo envuelven. */
export interface Anexo04Opts {
  especieGlobal?: string;
  /**
   * Volumen total declarado A MANO — reemplaza al calculado desde las piezas
   * y las hojas se reconcilian contra él (ver `reconciliarTotales`). `null`/
   * `undefined` = usar el calculado, como siempre. NUNCA toca las medidas ni
   * las piezas: es sólo el número que se imprime en (3) VOLUMEN TOTAL de cada
   * hoja y en el pie "Anexo completo: … m³".
   */
  totalManualM3?: number | null;
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
const tipoDe = (r: PiezaCubicada): TipoComercial => tipoDePieza(r);

function trocear<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Reparte una diferencia de milésimos entre varios totales para que su suma
 * cierre EXACTO contra `objetivo`, sin tocar de dónde salió cada uno.
 *
 * Por qué hace falta: cada hoja redondea su propio total a 3 decimales por
 * separado (para que ESA hoja, mostrada sola en un puesto de control, sea
 * consistente consigo misma). Sumar hojas ya redondeadas puede quedar a
 * 0,001-0,003 m³ del total real por el redondeo de cada una — el mismo hueco
 * que aparece al sumar a mano IVA por línea vs. IVA del total. Se ajusta de a
 * 0,001 m³, empezando por la hoja más grande (así el ajuste nunca se nota en
 * una hoja chica), y cicla si hace falta mover más de una vez por hoja.
 */
export function reconciliarTotales(valores: readonly number[], objetivo: number): number[] {
  if (valores.length === 0) return [];
  const mil = valores.map((v) => Math.round(v * 1000));
  const objetivoMil = Math.round(objetivo * 1000);
  const restante = objetivoMil - mil.reduce((a, v) => a + v, 0);
  if (restante === 0) return mil.map((v) => v / 1000);
  const orden = mil.map((_, i) => i).sort((a, b) => mil[b] - mil[a]);
  const paso = restante > 0 ? 1 : -1;
  let porMover = Math.abs(restante);
  // Tope de vueltas: con `orden.length` hojas y como mucho unos pocos m³ de
  // diferencia esto termina en un puñado de pasos — el tope es sólo para no
  // colgarse si algún día `objetivo` llega negativo o descabellado (ahí queda
  // lo mejor posible sin bajar ninguna hoja de 0, en vez de trabarse).
  for (let intento = 0; porMover > 0 && intento < orden.length * 1000; intento++) {
    const i = orden[intento % orden.length];
    if (mil[i] + paso < 0) continue;
    mil[i] += paso;
    porMover--;
  }
  return mil.map((v) => v / 1000);
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
  opts: Anexo04Opts = {},
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
        m3: chunk.reduce((a, r) => a + r.m3, 0),
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
    /* Lo que ampara ESTA hoja. Se suman los m³ exactos y se redondea una sola
       vez al final: sumando los subtotales ya redondeados, tres hojas podían
       diferir del total del anexo en un milímetro cúbico por hoja. */
    totalM3: r3(bs.reduce((a, b) => a + b.m3, 0)),
  }));
  // Un lote vacío igual imprime la hoja en blanco (el formato se llena a mano).
  if (hojas.length === 0) hojas.push({ bloques: [], filasPorBloque: modo === "oficial" ? FILAS_OFICIAL : FILAS_MIN_COMPACTO, totalM3: 0 });

  const totalCalculadoM3 = r3(rows.reduce((a, r) => a + r.m3, 0));
  const manual = opts.totalManualM3;
  const declararManual = rows.length > 0 && manual != null && Number.isFinite(manual) && manual >= 0;
  const totalM3 = declararManual ? r3(manual) : totalCalculadoM3;

  // Con más de una hoja (o un total declarado a mano), las hojas se
  // reconcilian contra `totalM3` — así lo que se suma a mano, hoja por hoja,
  // da EXACTO el total impreso arriba. Nunca toca `bloques`/`filas`: sólo el
  // (3) VOLUMEN TOTAL de cada hoja.
  if (hojas.length > 1 || declararManual) {
    const reconciliados = reconciliarTotales(hojas.map((h) => h.totalM3), totalM3);
    hojas.forEach((h, i) => { h.totalM3 = reconciliados[i]; });
  }

  return {
    hojas,
    totalPiezas: rows.reduce((a, r) => a + r.cantidad, 0),
    totalPt: r2(rows.reduce((a, r) => a + ptExacto(r), 0)),
    totalM3,
    totalCalculadoM3,
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
  /** Caja de la firma escaneada: apoyada SOBRE la línea (13). */
  firmaBox: { x: number; y: number; w: number; h: number };
  /** Caja del sello, a la izquierda de la firma (como se sella a mano). */
  selloBox: { x: number; y: number; w: number; h: number };
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
    // La firma se apoya sobre la línea (13) — la primera de las cuatro.
    firmaBox: { x: m + contentW - 150, y: yFirmas[0] - 34, w: 130, h: 32 },
    selloBox: { x: m + contentW - 232, y: yFirmas[0] - 40, w: 74, h: 46 },
    xEmpresa: (conLogo: boolean) => m + (conLogo ? 64 : 2),
    wEmpresa: (conLogo: boolean) => (conLogo ? 84 : 150),
  };
}

/**
 * Tamaños de letra del anexo, en PUNTOS de A4 — fuente única.
 *
 * Estaban escritos dos veces: `setFontSize()` en el PDF y `font-size` en el
 * preview HTML. Dos copias de un número que TIENE que coincidir es la receta
 * para que la pantalla y el papel dejen de decir lo mismo — que es justo lo que
 * este preview existe para evitar.
 *
 * Se agrandaron un tercio (2026-08-05, pedido de Brandon): el formato oficial
 * se llena a mano con lapicera y las medidas a 5 pt no se leían ni de cerca. El
 * tope real es el ANCHO de columna: la de volumen mide ~40 pt y el número más
 * largo que entra ahí («1039,500», 8 caracteres) pide ~0,5 pt por carácter, así
 * que 7 pt es lo más grande que cabe sin cortar.
 */
export const FUENTES = {
  banner: 9,
  bannerTitulo: 11,
  instrucciones: 6,
  /* 9 y no 10: a 10 pt «LISTA DE PRODUCTOS TRANSFORMADOS» se parte en dos
     líneas en el preview y en el PDF —que no parte— se montaría sobre la razón
     social. El ancho de ese casillero es el techo. */
  titulo: 9,
  empresa: 9,
  /** (1) N°, (2) GTF N°, (3) Volumen total. */
  campos: 8,
  /** «(4) Especie: …» y «(5) Tipo de producto: …». */
  bloqueHead: 6.4,
  tablaHead: 5.4,
  /** Las medidas y el volumen de cada pieza: la letra que más se mira. */
  celda: 7,
  subtotalLabel: 6.4,
  subtotalValor: 7,
  observaciones: 7.5,
  firma: 8,
  firmaLabel: 6.6,
  legal: 6,
  nota: 6,
} as const;

/** pt → px del preview (72 pt = 96 px). */
export const aPx = (pt: number): number => Math.round(pt * (96 / 72) * 100) / 100;

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
