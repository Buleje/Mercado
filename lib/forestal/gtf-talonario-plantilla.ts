/**
 * gtf-talonario-plantilla — el talonario PREIMPRESO dibujado en milímetros: la
 * guía (formato RDE D000014-2024) y su lista de trozas, tal como las imprime
 * la imprenta en tinta celeste (Brandon 16-10: «que se parezca lo más posible
 * a esos formatos, con ese color de texto, tamaños y formatos»).
 *
 * Medido sobre las fotos del talonario de Brandon (Imprenta Nueva Imagen, La
 * Merced): GTF 19-000003 y lista 19-000006 de la CN Séptimo Unidos de Santa Fe
 * de Aguachini, enderezadas con una homografía de las 4 esquinas del recuadro
 * y llevadas a una A4 con el recuadro en x 12,5–197,5 · y 6–289,5 mm. Las dos
 * hojas comparten el recuadro (misma imprenta) y la lista cierra sola: 30
 * filas de 5,647 mm entre 47,4 y 216,8 mm. Error esperable ±1 mm: lo corrige
 * la calibración de la impresora (corrimiento y escala del perfil).
 *
 * Dos usos, UNA fuente:
 *   · `plantillaTalonario` dibuja el formulario debajo de los valores en el
 *     diseñador (sólo pantalla; el papel ya lo trae impreso);
 *   · `RANURAS` es el lugar de fábrica de cada valor: el renglón punteado que
 *     sigue a su rótulo. `gtf-matricial-disposicion` arma su catálogo de acá,
 *     así el valor de fábrica cae siempre sobre su línea dibujada.
 *
 * PURO y client-safe. Origen arriba a la izquierda; `y` de un texto = su base.
 */

/** Cambia cuando cambian las ranuras: una disposición guardada sobre otra plantilla vuelve a la de fábrica. */
export const PLANTILLA_FABRICA = "imprenta-2024-v1";

export type TintaPlantilla = "forma" | "folio" | "dato";

export type TrazoPlantilla =
  | { t: "linea"; x1: number; y1: number; x2: number; y2: number; grosor: number; punteado?: boolean }
  | { t: "rect"; x: number; y: number; w: number; h: number; grosor: number; relleno?: boolean; radio?: number }
  | { t: "casilla"; x: number; y: number; w: number; h: number }
  | {
      t: "texto";
      x: number;
      y: number;
      s: string;
      pt: number;
      peso?: 400 | 600 | 700;
      alinea?: "izq" | "centro" | "der";
      /** Ancho que ocupa en el papel: el dibujo lo estira o encoge a esa medida (SVG `textLength`). */
      ancho?: number;
      tinta?: TintaPlantilla;
    };

export interface PlantillaHoja {
  anchoMm: number;
  altoMm: number;
  trazos: TrazoPlantilla[];
}

/** Lo que la imprenta imprime con los datos del titular, arriba a la izquierda, y el N° prenumerado. */
export interface EncabezadoTalonario {
  /** Razón social del titular del talonario (1 o 2 renglones). */
  titular?: string;
  ruc?: string;
  /** El título habilitante («19-SEC/REG-PLT-2026-117»). */
  titulo?: string;
  /** «PUERTO BERMÚDEZ - OXAPAMPA - PASCO». */
  ubicacion?: string;
  /** El (1): la serie de la región («19») y el N° prenumerado en rojo. */
  serie?: string;
  numero?: string;
}

/** Dónde va un valor: borde superior del renglón (como `CampoPos.y`), x, ancho y alineación. */
export interface Ranura {
  x: number;
  y: number;
  ancho: number;
  alinea?: "izq" | "centro" | "der";
}

export interface TablaPlantilla {
  /** Borde superior del texto de la PRIMERA fila (centrado en la fila). */
  y: number;
  altoFilaMm: number;
  maxFilas: number;
  letraPt: number;
  columnas: Record<string, Ranura>;
}

// ── Medidas del papel ───────────────────────────────────────────────────────

/** El recuadro de las dos hojas (mm). */
const X0 = 12.5, X1 = 197.5, Y0 = 6, Y1 = 289.5;
/** Donde arrancan los rótulos de la columna izquierda y donde terminan los renglones. */
const RX = 14.5, FIN = 195.5;
const LINEA = 0.35, FINA = 0.2, GRUESA = 0.5;
const LETRA_ROTULO = 9;
/** Base del valor a 0,5 mm del punteado con letra de 9 pt (base = 0,841 em del borde de arriba, `BASE_EM`). */
const SOBRE_LINEA_9PT = 3.17;

/** El renglón de un valor de 9 pt que se escribe sobre el punteado `yLinea`, de `desde` a `hasta`. */
const enLinea = (desde: number, yLinea: number, hasta: number): Ranura => ({
  x: Math.round((desde + 0.6) * 10) / 10,
  y: Math.round((yLinea - SOBRE_LINEA_9PT) * 10) / 10,
  ancho: Math.round((hasta - desde - 0.6) * 10) / 10,
});

/** Una «X» de 9 pt centrada en la casilla de centro (cx, cy). */
const enCasilla = (cx: number, cy: number): Ranura => ({ x: cx - 3, y: Math.round((cy - 1.83) * 10) / 10, ancho: 6, alinea: "centro" });

/** Rótulo «(n) Texto:» + su punteado: un renglón del formulario. */
interface Renglon {
  /** id del valor en `casillerosGtf` (o null: el rótulo no tiene dato en el sistema). */
  id: string | null;
  rotulo: string;
  /** Inicio y fin del rótulo en el papel. */
  x: number;
  finRotulo: number;
  /** El punteado: altura y fin. */
  y: number;
  hasta: number;
}

// ── La guía ─────────────────────────────────────────────────────────────────

const RENGLONES_GUIA: Renglon[] = [
  { id: "2", rotulo: "(2) Autoridad Regional Forestal y de Fauna Silvestre (ARFFS):", x: RX, finRotulo: 92, y: 41.3, hasta: FIN },
  { id: "3", rotulo: "(3) Fecha de Expedición:", x: RX, finRotulo: 46.5, y: 46.4, hasta: 101 },
  { id: "4", rotulo: "(4) Fecha de Vencimiento:", x: 102.4, finRotulo: 135.5, y: 46.2, hasta: FIN },
  { id: "6", rotulo: "(6) N°", x: RX, finRotulo: 23, y: 67.4, hasta: FIN },
  { id: "7", rotulo: "(7) Nombre del Titular:", x: RX, finRotulo: 43.3, y: 72.6, hasta: 117.5 },
  { id: "rep", rotulo: "(8) Rep. Legal:", x: 118.8, finRotulo: 138.8, y: 72.5, hasta: FIN },
  { id: "8", rotulo: "(9) N° Resolución:", x: RX, finRotulo: 38.3, y: 77.3, hasta: 119.5 },
  { id: "9", rotulo: "(10) Plan de Manejo (Tipo):", x: 120.7, finRotulo: 154.9, y: 77.2, hasta: FIN },
  { id: "10", rotulo: "(11a) Departamento:", x: RX, finRotulo: 40, y: 81.9, hasta: 74.5 },
  { id: "11", rotulo: "(11b) Provincia:", x: 75.5, finRotulo: 95.1, y: 81.8, hasta: 136 },
  { id: "12", rotulo: "(11c) Distrito:", x: 136.9, finRotulo: 153.5, y: 81.7, hasta: FIN },
  { id: "13", rotulo: "(12) Propietario del Producto:", x: RX, finRotulo: 51.8, y: 92.9, hasta: FIN },
  { id: "15", rotulo: "(13) DNI/RUC N°", x: RX, finRotulo: 35.7, y: 97.9, hasta: 72 },
  { id: "16", rotulo: "(14a) Dirección:", x: 72.6, finRotulo: 92.5, y: 97.7, hasta: FIN },
  { id: "17", rotulo: "(14b) Departamento:", x: RX, finRotulo: 40, y: 102.8, hasta: 74.5 },
  { id: "18", rotulo: "(14c) Provincia:", x: 75.5, finRotulo: 94.8, y: 102.6, hasta: 135.5 },
  { id: "19", rotulo: "(14d) Distrito:", x: 136.5, finRotulo: 153.3, y: 102.4, hasta: FIN },
  { id: "20", rotulo: "(15) Tipo de Comprobante de Compra o Venta:", x: RX, finRotulo: 72.8, y: 107.6, hasta: 119 },
  { id: "21", rotulo: "(16) N° de Comprobante:", x: 120.1, finRotulo: 150.9, y: 107.4, hasta: FIN },
  { id: "p17", rotulo: "(17) Punto de Partida:", x: RX, finRotulo: 42.4, y: 117.9, hasta: 127 },
  { id: "p18", rotulo: "(18) N° Autorización:", x: 128, finRotulo: 154.6, y: 117.7, hasta: FIN },
  { id: "p19", rotulo: "(19) Tipo de Establecimiento:", x: RX, finRotulo: 51.4, y: 122.8, hasta: 99 },
  { id: "p20a", rotulo: "(20a) Dirección:", x: 100.1, finRotulo: 119.7, y: 122.6, hasta: FIN },
  { id: "p20b", rotulo: "(20b) Departamento:", x: RX, finRotulo: 40.9, y: 127.7, hasta: 74.5 },
  { id: "p20c", rotulo: "(20c) Provincia:", x: 75.7, finRotulo: 95.4, y: 127.5, hasta: 135 },
  { id: "p20d", rotulo: "(20d) Distrito:", x: 136.1, finRotulo: 153.3, y: 127.3, hasta: FIN },
  { id: "22", rotulo: "(21) Destinatario:", x: RX, finRotulo: 37, y: 137.8, hasta: 127 },
  { id: "d22", rotulo: "(22) N° Autorización:", x: 128, finRotulo: 154.6, y: 137.6, hasta: FIN },
  { id: "24", rotulo: "(23) DNI/RUC N°", x: RX, finRotulo: 36.7, y: 142.4, hasta: 81.5 },
  { id: "25", rotulo: "(24a) Dirección:", x: 82.4, finRotulo: 102.1, y: 142.2, hasta: FIN },
  { id: "26", rotulo: "(24b) Departamento:", x: RX, finRotulo: 41.7, y: 147.1, hasta: 74.5 },
  { id: "27", rotulo: "(24c) Provincia:", x: 75.9, finRotulo: 95.5, y: 147, hasta: 135 },
  { id: "28", rotulo: "(24d) Distrito:", x: 136.1, finRotulo: 153.5, y: 146.9, hasta: FIN },
  { id: "29", rotulo: "(25) N° Guía de Remisión Transportista:", x: RX, finRotulo: 65, y: 157.1, hasta: 119.5 },
  { id: "30", rotulo: "(26) Tipo de Transporte:", x: 120.5, finRotulo: 150.7, y: 156.9, hasta: FIN },
  { id: "31", rotulo: "(27) Tipo de Vehículo:", x: RX, finRotulo: 42.7, y: 161.8, hasta: 85 },
  { id: "31p", rotulo: "(28) Placa(s)/ Matrícula N°:", x: 86, finRotulo: 116.8, y: 161.6, hasta: FIN },
  { id: "32", rotulo: "(29) Nombre del Conductor:", x: RX, finRotulo: 50.1, y: 166.6, hasta: 110.5 },
  { id: "33", rotulo: "(30) DNI N°", x: 111.5, finRotulo: 125.7, y: 166.5, hasta: 149 },
  { id: "34", rotulo: "(31) Lic. Conducir N°", x: 150, finRotulo: 176.5, y: 166.3, hasta: FIN },
  { id: "36", rotulo: "(32) N° GTF de Origen:", x: RX, finRotulo: 44.6, y: 177.2, hasta: 116 },
  { id: "35", rotulo: "(33) Lista de Trozas/Productos Transformados N°", x: RX, finRotulo: 77.2, y: 181.8, hasta: FIN },
  { id: "38", rotulo: "(35) Observaciones:", x: 16.4, finRotulo: 45.5, y: 239.6, hasta: 135 },
];

/** Franjas de sección: [título, y de arriba, y de abajo]. */
const FRANJAS_GUIA: Array<[string, number, number]> = [
  ["DATOS DEL ORIGEN DEL RECURSO O PROCEDENCIA", 48.5, 52.3],
  ["DATOS DEL PROPIETARIO DEL PRODUCTO", 84.4, 87.8],
  ["DATOS DEL PUNTO DE PARTIDA", 108.9, 112.3],
  ["DATOS DEL DESTINATARIO", 129.2, 132.6],
  ["DATOS DEL TRANSPORTISTA", 148.3, 152.4],
  ["DETALLE DEL PRODUCTO", 168.8, 172.3],
];

/** Las casillas del (5) en el papel 2024: [clave del origen, rótulo, x del rótulo, centro de la casilla]. */
const CASILLAS_ORIGEN: Array<[string, string, number, number, number]> = [
  ["concesion", "Concesión", 87.5, 103.3, 54.8],
  ["desbosque", "Desbosque", 87.5, 103.3, 58.4],
  ["ctp", "Centro de Transformación Primaria-CTP", 87.5, 131.7, 62],
  ["permiso", "Permiso", 111, 131.7, 54.8],
  ["cambio_uso", "Cambio de Uso", 111, 131.7, 58.4],
  ["autorizacion", "Autorización", 138, 158.3, 54.8],
  ["plantacion", "Plantación", 138, 158.3, 58.4],
  ["cesion_uso", "Cesión en Uso", 138, 158.3, 62],
  ["bosque_local", "Bosque Local", 166.5, 192.1, 54.8],
  ["varios_origenes", "Varios Orígenes (*)", 166.5, 192.1, 58.4],
];

/** Columnas del (34): [id, borde izq, borde der, alineación del valor]. */
const COLS_GUIA: Array<[string, number, number, Ranura["alinea"]]> = [
  ["37a", X0, 53.5, "izq"],
  ["37b", 53.5, 93.4, "izq"],
  ["37c", 93.4, 116.1, "izq"],
  ["37d", 116.1, 138.2, "izq"],
  ["37e", 138.2, 155.9, "centro"],
  ["37f", 155.9, 173.9, "centro"],
  ["37g", 173.9, X1, "der"],
];
const TABLA_GUIA = { arriba: 188.8, sub: 194.9, filas: 200.3, alto: 4.84, n: 7 } as const;
/** 7 pt = 17 cpi (condensado): «Madera en rollo» (22,23 mm) entra en la columna (34c) de 22,7 mm con 0,2 mm de aire por lado. */
const LETRA_TABLA_GUIA = 7;

// ── La lista ────────────────────────────────────────────────────────────────

/** Columnas de la lista: [id, borde izq, borde der, alineación, rótulo (con salto `\n`)]. */
const COLS_LISTA: Array<[string, number, number, Ranura["alinea"], string]> = [
  ["n", X0, 19, "centro", "N°"],
  ["cientifico", 19, 60, "izq", "(3) Nombre Científico"],
  ["comun", 60, 96.2, "izq", "(4) Nombre común o comercial"],
  ["codigo", 96.2, 114.8, "centro", "(5) Codificación"],
  ["d1", 114.8, 130.6, "centro", "(6) d1"],
  ["d2", 130.6, 145.7, "centro", "(7) d2"],
  ["largo", 145.7, 160.4, "centro", "(8) L"],
  ["cant", 160.4, 175.6, "centro", "(9)\nCantidad"],
  ["vol", 175.6, X1 + 0.3, "der", "(10)\nVolumen m3"],
];
const TABLA_LISTA = { arriba: 35.5, sub: 40.6, filas: 47.4, alto: 5.647, n: 30 } as const;
const LETRA_TABLA_LISTA = 8;

// ── Ranuras (lugar de fábrica de cada valor) ─────────────────────────────────

const alto = (pt: number) => (pt * 25.4) / 72 * 1.15;
/** Borde de arriba del texto para centrarlo en una fila de `altoFila`. */
const centrado = (arriba: number, altoFila: number, pt: number) => Math.round((arriba + (altoFila - alto(pt)) / 2) * 100) / 100;

function ranurasGuia(): Record<string, Ranura> {
  const r: Record<string, Ranura> = {};
  for (const l of RENGLONES_GUIA) if (l.id) r[l.id] = enLinea(l.finRotulo, l.y, l.hasta);
  /* (13)/(23) DNI/RUC: un solo renglón con dos datos. El RUC va primero; el DNI (el del RUC, o el único) al final del renglón. */
  r["15"] = { ...enLinea(35.7, 97.9, 57.5) };
  r["14"] = { ...enLinea(56.9, 97.9, 72) };
  r["24"] = { ...enLinea(36.7, 142.4, 62) };
  r["23"] = { ...enLinea(61.4, 142.4, 81.5) };
  /* Las fechas en sus tres partes (para el talonario con «( / / )» impreso). */
  for (const [n, x0, y] of [["3", 47.1, 46.4], ["4", 136.1, 46.2]] as const) {
    const top = Math.round((y - SOBRE_LINEA_9PT) * 10) / 10;
    r[`${n}d`] = { x: x0 + 1, y: top, ancho: 6, alinea: "centro" };
    r[`${n}m`] = { x: x0 + 9, y: top, ancho: 6, alinea: "centro" };
    r[`${n}a`] = { x: x0 + 17, y: top, ancho: 10, alinea: "centro" };
  }
  for (const [clave, , , cx, cy] of CASILLAS_ORIGEN) r[`5:${clave}`] = enCasilla(cx, cy);
  /* Los dos orígenes que el formato 2024 retiró: sin casilla en el papel (quedan ocultos, a la izquierda del (5)). */
  r["5:plan_consolidado"] = enCasilla(80, 58.4);
  r["5:otros"] = enCasilla(80, 62);
  /* El N° viene prenumerado en rojo: si alguien lo prende, cae al lado del «N°». */
  r["numero"] = { x: 163, y: 19.6, ancho: 30 };
  r["37t"] = { x: 174.5, y: centrado(234.2, 6, 9), ancho: 22.3, alinea: "der" };
  return r;
}

function ranurasLista(): Record<string, Ranura> {
  /* El encabezado (titular, RUC, título, ubicación) y el N° vienen impresos: sus valores arrancan ocultos en su lugar. */
  return {
    titular: { x: 14, y: 8, ancho: 61.5, alinea: "centro" },
    subtitulo: { x: 14, y: 24, ancho: 61.5, alinea: "centro" },
    ubicacion: { x: 14, y: 29.6, ancho: 61.5, alinea: "centro" },
    ruc: { x: 14, y: 18.6, ancho: 61.5, alinea: "centro" },
    numero: { x: 163, y: 20.4, ancho: 30 },
    guia: enLinea(149.6, 34.2, 183.5),
    /* La lista del talonario no tiene fecha: arranca oculta, debajo del título. */
    fecha: { x: 150.5, y: 25.6, ancho: 33 },
    fechad: { x: 150.5, y: 25.6, ancho: 6, alinea: "centro" },
    fecham: { x: 158.5, y: 25.6, ancho: 6, alinea: "centro" },
    fechaa: { x: 166.5, y: 25.6, ancho: 10, alinea: "centro" },
    totPiezas: { x: 161, y: centrado(216.8, 6.2, 9), ancho: 14, alinea: "centro" },
    totVol: { x: 176.2, y: centrado(216.8, 6.2, 9), ancho: 20.6, alinea: "der" },
    obs: enLinea(44, 229.2, FIN),
  };
}

/** Tabla del (34) y de la lista: columnas con `aire` mm a cada lado de las rayas. */
function tablaDe(cols: Array<[string, number, number, Ranura["alinea"], ...unknown[]]>, t: { filas: number; alto: number; n: number }, pt: number, aire: number): TablaPlantilla {
  return {
    y: centrado(t.filas, t.alto, pt),
    altoFilaMm: t.alto,
    maxFilas: t.n,
    letraPt: pt,
    columnas: Object.fromEntries(
      cols.map(([id, a, b, alinea]) => [id, { x: Math.round((a + aire) * 10) / 10, ancho: Math.round((b - a - 2 * aire) * 10) / 10, y: 0, alinea }]),
    ),
  };
}

export const RANURAS = {
  guia: { campos: ranurasGuia(), tabla: tablaDe(COLS_GUIA, { filas: TABLA_GUIA.filas, alto: TABLA_GUIA.alto, n: TABLA_GUIA.n }, LETRA_TABLA_GUIA, 0.2) },
  lista: { campos: ranurasLista(), tabla: tablaDe(COLS_LISTA, { filas: TABLA_LISTA.filas, alto: TABLA_LISTA.alto, n: TABLA_LISTA.n }, LETRA_TABLA_LISTA, 0.6) },
} as const;

// ── El dibujo ───────────────────────────────────────────────────────────────

type T = TrazoPlantilla;
const texto = (x: number, y: number, s: string, pt: number, o: Partial<Extract<T, { t: "texto" }>> = {}): T => ({ t: "texto", x, y, s, pt, ...o });
const linea = (x1: number, y1: number, x2: number, y2: number, grosor = LINEA, punteado = false): T => ({ t: "linea", x1, y1, x2, y2, grosor, punteado });
const punteado = (x1: number, y: number, x2: number): T => linea(x1, y, x2, y, FINA, true);

function renglon(l: Renglon): T[] {
  return [
    texto(l.x, l.y - 0.25, l.rotulo, LETRA_ROTULO, { peso: 600, ancho: l.finRotulo - l.x }),
    punteado(l.finRotulo + 0.4, l.y, l.hasta),
  ];
}

function franja([titulo, y0, y1]: [string, number, number]): T[] {
  return [
    { t: "rect", x: X0, y: y0, w: X1 - X0, h: y1 - y0, grosor: LINEA, relleno: true },
    texto(X0 + 3, y1 - 0.85, titulo, 8.3, { peso: 700, ancho: Math.round(titulo.length * 1.985 * 10) / 10 }),
  ];
}

/** El encabezado de la imprenta: el recuadro del titular y el (1) prenumerado. */
function encabezado(e: EncabezadoTalonario, cajaDer: number, cajaAbajo: number, titulo: { s: string; cx: number; ancho: number; base: number }, bases: number[]): T[] {
  const cx = (X0 + cajaDer) / 2;
  const ancho = cajaDer - X0 - 3;
  const nombre = (e.titular ?? "").trim().toUpperCase() || "TITULAR DEL TALONARIO";
  /* La razón social en dos renglones si es larga, partida en la palabra más cercana a la mitad. */
  const partes = nombre.length > 30 ? partirEnDos(nombre) : [nombre];
  const out: T[] = [{ t: "rect", x: X0, y: Y0, w: cajaDer - X0, h: cajaAbajo - Y0, grosor: LINEA }];
  if (partes.length === 2) {
    out.push(texto(cx, bases[0], partes[0], 10, { peso: 700, alinea: "centro", ancho: Math.min(ancho, partes[0].length * 2.05) }));
    out.push(texto(cx, bases[1], partes[1], 10, { peso: 700, alinea: "centro", ancho: Math.min(ancho, partes[1].length * 2.05) }));
  } else {
    out.push(texto(cx, (bases[0] + bases[1]) / 2, partes[0], 10, { peso: 700, alinea: "centro", ancho: Math.min(ancho, partes[0].length * 2.05) }));
  }
  out.push(texto(cx, bases[2], e.ruc ? `RUC. ${e.ruc}` : "RUC.", 8.5, { alinea: "centro" }));
  if (e.titulo) out.push(texto(cx, bases[3], e.titulo, 11, { peso: 700, alinea: "centro", ancho: Math.min(ancho, e.titulo.length * 2.3) }));
  if (e.ubicacion) out.push(texto(cx, bases[4], e.ubicacion.toUpperCase(), 8, { alinea: "centro", ancho: Math.min(ancho, e.ubicacion.length * 1.6) }));
  /* Título de la hoja y el (1): «19  Nº 000003». */
  out.push(texto(titulo.cx, titulo.base, titulo.s, 13, { peso: 700, alinea: "centro", ancho: titulo.ancho }));
  out.push(texto(136, 23.2, "(1)", 7.5, { peso: 600 }));
  out.push(texto(146.6, 24.1, e.serie || "19", 15, { peso: 600, alinea: "centro" }));
  out.push(texto(156.8, 23.8, `Nº ${e.numero || "000000"}`, 12, { peso: 400, tinta: "folio", ancho: 26.5 }));
  return out;
}

function partirEnDos(s: string): [string, string] {
  const mitad = s.length / 2;
  let corte = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === " " && (corte < 0 || Math.abs(i - mitad) < Math.abs(corte - mitad))) corte = i;
  return corte < 0 ? [s, ""] : [s.slice(0, corte), s.slice(corte + 1)];
}

function plantillaGuia(e: EncabezadoTalonario): PlantillaHoja {
  const t: T[] = [{ t: "rect", x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0, grosor: GRUESA, radio: 1.2 }];
  t.push(...encabezado(e, 75.5, 36.6, { s: "GUIA DE TRANSPORTE FORESTAL", cx: 157, ancho: 71, base: 11.3 }, [10.8, 16, 21.6, 27.3, 32.7]));
  t.push(texto(124, 33, "N° DE REGISTRO:", 8.5, { peso: 700, ancho: 30.9 }), punteado(155.3, 33.2, 193));
  t.push(linea(X0, 36.6, X1, 36.6));
  for (const l of RENGLONES_GUIA) t.push(...renglon(l));
  /* (35) tiene un segundo renglón entero. */
  t.push(punteado(RX, 245.4, FIN));
  for (const f of FRANJAS_GUIA) t.push(...franja(f));
  /* (5) */
  t.push(texto(RX, 55, "(5)ORIGEN DEL RECURSO O PROCEDENCIA:", LETRA_ROTULO, { peso: 600, ancho: 63 }));
  for (const [, rotulo, x, cx, cy] of CASILLAS_ORIGEN) {
    t.push(texto(x, cy + 0.9, rotulo, 6.8, { ancho: rotulo.length > 20 ? 37 : undefined }));
    t.push({ t: "casilla", x: cx - 2.5, y: cy - 1.3, w: 5, h: 2.6 });
  }
  /* (34) cuadro */
  t.push(texto(RX, 186.5, "(34) CUADRO DETALLE DE PRODUCTOS(**):", 8, { peso: 700, ancho: 69 }));
  const { arriba, sub, filas, alto: h, n } = TABLA_GUIA;
  const abajo = filas + n * h;
  t.push({ t: "rect", x: X0, y: arriba, w: X1 - X0, h: filas - arriba, grosor: LINEA, relleno: true });
  t.push(linea(X0, abajo, X1, abajo));
  for (let k = 1; k < n; k++) t.push(linea(X0, filas + k * h, X1, filas + k * h, FINA));
  for (const x of [53.5, 93.4, 116.1, 155.9]) t.push(linea(x, arriba, x, abajo));
  for (const x of [138.2, 173.9]) t.push(linea(x, sub, x, abajo));
  t.push(linea(116.1, sub, X1, sub));
  const centro = (a: number, b: number) => (a + b) / 2;
  t.push(
    texto(centro(X0, 53.5), 195.6, "(34a) Nombre Científico", 7.2, { peso: 600, alinea: "centro" }),
    texto(centro(53.5, 93.4), 193.6, "(34b) Nombre común", 7.2, { peso: 600, alinea: "centro" }),
    texto(centro(53.5, 93.4), 196.9, "o comercial", 7.2, { peso: 600, alinea: "centro" }),
    texto(centro(93.4, 116.1), 193.6, "(34c) Tipo de", 7.2, { peso: 600, alinea: "centro" }),
    texto(centro(93.4, 116.1), 196.9, "producto", 7.2, { peso: 600, alinea: "centro" }),
    texto(centro(116.1, 155.9), 191.3, "Forma de Embalaje o", 6.6, { peso: 600, alinea: "centro" }),
    texto(centro(116.1, 155.9), 193.9, "Presentación del Producto", 6.6, { peso: 600, alinea: "centro" }),
    texto(centro(155.9, X1), 193.2, "Cantidad", 7.6, { peso: 600, alinea: "centro" }),
    texto(centro(116.1, 138.2), 198.4, "(34d) Descripción", 6.4, { peso: 600, alinea: "centro" }),
    texto(centro(138.2, 155.9), 198.4, "(34e) Cantidad", 6.4, { peso: 600, alinea: "centro" }),
    texto(centro(155.9, 173.9), 197.3, "(34f) Unidad", 6.4, { peso: 600, alinea: "centro" }),
    texto(centro(155.9, 173.9), 199.6, "de medida", 6.4, { peso: 600, alinea: "centro" }),
    texto(centro(173.9, X1), 198.4, "(34g) Total", 6.4, { peso: 600, alinea: "centro" }),
  );
  /* (34h) */
  t.push(texto(171.9, 237.9, "(34h) TOTAL MOVILIZADO", 8.6, { peso: 700, alinea: "der", ancho: 32.8 }));
  t.push({ t: "rect", x: 173.9, y: abajo, w: X1 - 173.9, h: 6, grosor: LINEA });
  /* (36) anexos */
  t.push(texto(16.4, 248.7, "(36) Anexos que forman parte integrante de la Guía de Transporte Forestal:", 8.8, { peso: 700, ancho: 112.9 }));
  /* [texto, ancho medido en la foto] */
  const anexos: Array<[string, number]> = [
    ["Anexo 01 : Formato Adicional para el detalle de Productos de la Guía de Transporte Forestal", 100.8],
    ["Anexo 02 : Formato para consignar Varios Orígenes de la Guía de Transporte Forestal", 94.2],
    ["Anexo 03 : Listado de Trozas", 31.7],
    ["Anexo 04 : Listado de Productos Transformados", 52.5],
  ];
  anexos.forEach(([s, ancho], i) => {
    const cy = 252.5 + i * 3.57;
    t.push({ t: "casilla", x: 22.7, y: cy - 1.3, w: 3.5, h: 2.6 }, texto(27.5, cy + 0.95, s, 6.9, { ancho }));
  });
  const notas = [
    "* En caso el origen del recurso procede de “Varios Orígenes” se debe usar el Anexo N° 02 Formato",
    "para consignar Varios Orígenes de la Guía de Transporte Forestal.",
    "** En caso del cuadro Detalle de Productos de la GTF no sea suficiente se debe usar el Anexo N° 01",
    "“Formato Adicional para el Detalle de Productos de la Guía de Transporte Forestal”.",
  ];
  notas.forEach((s, i) => t.push(texto(15.7, 266.9 + i * 3, s, 7, { ancho: s.length > 80 ? 102.3 : undefined })));
  const legal = [
    "La GTF no es válida si contiene enmendaduras y/o alteraciones",
    "La presente GTF tiene carácter de declaración jurada y está sujeta a acciones penales contempladas en el",
    "numeral 34.3 del artículo N° 34 de la Ley 27444 (Ley del Procedimiento Administrativo General).",
  ];
  legal.forEach((s, i) => t.push(texto(15.4, 280.1 + i * 3.2, s, 7.3, { ancho: s.length > 80 ? 110.8 : undefined })));
  /* (37)-(39): firma, nombres y documento del emisor (se llenan a mano). */
  for (const [y, s] of [[256.8, "(37) Firma y sello del Emisor"], [270.8, "(38) Nombres y Apellidos del Emisor"], [284.6, "(39) Documento de Identidad del Emisor"]] as const) {
    t.push(punteado(137, y, 193), texto(165, y + 2.8, s, 7.4, { alinea: "centro" }));
  }
  return { anchoMm: 210, altoMm: 297, trazos: t };
}

function plantillaLista(e: EncabezadoTalonario): PlantillaHoja {
  const t: T[] = [{ t: "rect", x: X0, y: Y0, w: X1 - X0 + 0.3, h: Y1 - Y0, grosor: GRUESA, radio: 1.2 }];
  t.push(...encabezado(e, 77, TABLA_LISTA.arriba, { s: "LISTA DE TROZAS", cx: 158, ancho: 49.5, base: 12.5 }, [10.5, 15.6, 21.4, 27, 32.4]));
  t.push(texto(131.9, 33.3, "(2) GTF N°", 8.5, { peso: 700, ancho: 17.1 }), punteado(150, 34.2, 183.5));
  const { arriba, sub, filas, alto: h, n } = TABLA_LISTA;
  const abajo = filas + n * h;
  const der = X1 + 0.3;
  t.push({ t: "rect", x: X0, y: arriba, w: der - X0, h: filas - arriba, grosor: LINEA, relleno: true });
  t.push(linea(X0, abajo, der, abajo));
  for (let k = 1; k < n; k++) t.push(linea(X0, filas + k * h, der, filas + k * h, FINA));
  for (const [, a] of COLS_LISTA.slice(1)) t.push(linea(a, [60, 130.6, 145.7].includes(a) ? sub : arriba, a, abajo));
  t.push(linea(19, sub, 96.2, sub), linea(114.8, sub, 160.4, sub));
  t.push(texto(53.2, 38.6, "ESPECIE", 9, { peso: 700, alinea: "centro", ancho: 14.5 }), texto(137.5, 38.6, "Dimensiones", 7.6, { peso: 600, alinea: "centro", ancho: 16.4 }));
  for (const [id, a, b, , rotulo] of COLS_LISTA) {
    const lineas = rotulo.split("\n");
    const base = id === "n" ? 42.4 : id === "codigo" ? 42.2 : lineas.length > 1 ? 39.5 : 44.7;
    lineas.forEach((s, i) => t.push(texto((a + b) / 2, base + i * 3.6, s, id === "comun" ? 6.9 : 7.2, { peso: 600, alinea: "centro" })));
  }
  for (let k = 0; k < n; k++) t.push(texto((X0 + 19) / 2, filas + k * h + 4.1, String(k + 1), 8.2, { alinea: "centro" }));
  /* (11) TOTAL */
  t.push(texto(158.5, 221.4, "(11) TOTAL", 9, { peso: 700, alinea: "der" }));
  t.push({ t: "rect", x: 160.4, y: abajo, w: 175.6 - 160.4, h: 6.2, grosor: LINEA }, { t: "rect", x: 175.6, y: abajo, w: der - 175.6, h: 6.2, grosor: LINEA });
  /* (12) */
  t.push(texto(RX, 228.9, "(12) Observaciones:", 9, { ancho: 28.3 }), punteado(44.5, 229.2, FIN), punteado(RX, 235.3, FIN));
  /* (13)-(16): [desde, hasta, punteado, rótulo, ancho del rótulo] */
  for (const [x0, x1, y, s, ancho] of [
    [25, 94, 251.6, "(13) Firma y Sello del Emisor", 40.6],
    [116.5, 185, 251.6, "(14) Nombres y Apellidos del Emisor", 50.4],
    [25, 94, 270.6, "(15) Documento de Identidad del Emisor", 56.2],
    [116.5, 185, 270.6, "(16) Cargo que desempeña el Emisor", 52.5],
  ] as const) {
    t.push(punteado(x0, y, x1), texto((x0 + x1) / 2, y + 3.1, s, 9, { alinea: "centro", ancho }));
  }
  const legal = [
    "La GTF no es válida si contiene enmendaduras y/o alteraciones",
    "La presente GTF tiene carácter de declaración jurada y está sujeta a acciones penales contempladas en el numeral 34.3 del artículo N° 34 de la Ley 27444",
    "(Ley del Procedimiento Administrativo General).",
  ];
  legal.forEach((s, i) => t.push(texto(15.4, 280.6 + i * 3.4, s, 7.5, { ancho: s.length > 100 ? 172.3 : undefined })));
  return { anchoMm: 210, altoMm: 297, trazos: t };
}

/** El formulario impreso de la hoja, para dibujarlo debajo de los valores (sólo pantalla). */
export function plantillaTalonario(formato: "guia" | "lista", e: EncabezadoTalonario = {}): PlantillaHoja {
  return formato === "guia" ? plantillaGuia(e) : plantillaLista(e);
}
