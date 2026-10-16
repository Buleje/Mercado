/**
 * gtf-matricial-disposicion — DÓNDE cae cada valor de la guía en el talonario
 * preimpreso de la matricial (Brandon 15-10: «acomodar cada campo, sea guía y
 * lista, para imprimirlo en esos talonarios de guía que tienen 3 copias»).
 *
 * El talonario ya trae el formato, los rótulos y los casilleros: se imprimen
 * SÓLO los valores, cada uno en sus milímetros. Esto define:
 *   · el catálogo de campos de cada hoja («guía» y «lista») con una posición
 *     de fábrica que sigue el orden de casilleros de la hoja SERFOR (ADR-338);
 *   · la tabla de cada hoja: el (34) de la guía y las trozas de la lista;
 *   · el esquema Zod y la normalización (lo guardado se completa con la de
 *     fábrica: un campo nuevo del catálogo no rompe una disposición vieja).
 *
 * Todo en mm, con origen en la esquina superior izquierda de la hoja; `y` es
 * el BORDE SUPERIOR del renglón. PURO y client-safe.
 */

import { z } from "zod";

/**
 * Las casillas del (5). Copia de `ORIGENES` + `ORIGENES_SIN_CASILLA_2024` de
 * `ctp-gtf-formato` (ese módulo es "use client" y esto lo lee también la ruta
 * del servidor): el test `forestal-gtf-matricial` falla si se separan.
 *
 * El ORDEN no es el del papel 2024 sino el del alta de cada campo: la posición
 * de fábrica de los nueve primeros sale de su índice (`C1 + i·21`, la hoja
 * 2015) y reordenarlos movería las «X» de quien nunca acomodó su talonario.
 * Los tres que trajo el formato 2024 van al final, en su propio renglón;
 * «Plan de Manejo Consolidado» y «Otros» ya no existen en 2024 pero se quedan
 * (ADR-494): borrar un campo borra el acomodo guardado de ese campo.
 */
export const ORIGENES_TALONARIO: ReadonlyArray<{ clave: string; label: string }> = [
  { clave: "concesion", label: "Concesión" },
  { clave: "permiso", label: "Permiso" },
  { clave: "autorizacion", label: "Autorización" },
  { clave: "bosque_local", label: "Bosque local" },
  { clave: "desbosque", label: "Desbosque" },
  { clave: "cambio_uso", label: "Cambio de Uso" },
  { clave: "plantacion", label: "Plantación" },
  { clave: "plan_consolidado", label: "Plan de Manejo Consolidado" },
  { clave: "otros", label: "Otros" },
  { clave: "varios_origenes", label: "Varios orígenes" },
  { clave: "ctp", label: "Centro de Transformación Primaria-CTP" },
  { clave: "cesion_uso", label: "Cesión en Uso" },
];

/** Las casillas del (5) que el formato 2024 ya no tiene: su campo se queda, con la marca «2015». */
const ORIGENES_SOLO_2015 = new Set(["plan_consolidado", "otros"]);
/** Las que trajo el formato 2024: arrancan ocultas, en un segundo renglón. */
const ORIGENES_SOLO_2024 = ["varios_origenes", "ctp", "cesion_uso"];

export type FormatoTalonario = "guia" | "lista";
export type Alineacion = "izq" | "centro" | "der";
export type SeparadorFecha = "/" | "." | "-";

export interface CampoPos {
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
  visible: boolean;
}

export interface ColumnaPos {
  x: number;
  anchoMm: number;
  alinea: Alineacion;
  visible: boolean;
}

export interface TablaPos {
  /** Borde superior de la PRIMERA fila. */
  y: number;
  altoFilaMm: number;
  maxFilas: number;
  letraPt: number;
  columnas: Record<string, ColumnaPos>;
}

export interface DisposicionHoja {
  anchoMm: number;
  altoMm: number;
  /** Corrimiento de la impresora: se suma a TODO al imprimir (la matricial corre todo junto). */
  offsetXMm: number;
  offsetYMm: number;
  separadorFecha: SeparadorFecha;
  campos: Record<string, CampoPos>;
  tabla: TablaPos;
}

export interface DisposicionTalonario {
  guia: DisposicionHoja;
  lista: DisposicionHoja;
  actualizado?: { en: string; por: string } | null;
}

/** Un campo del catálogo: su nombre en pantalla y su lugar de fábrica. */
export interface DefCampo {
  id: string;
  label: string;
  /** Grupo del papel, para la lista de campos del panel. */
  grupo: string;
  x: number;
  y: number;
  ancho: number;
  alinea?: Alineacion;
  /** Arranca oculto: lo que el talonario suele traer impreso o una forma alternativa del mismo dato. */
  oculto?: boolean;
}

export interface DefColumna {
  id: string;
  label: string;
  x: number;
  ancho: number;
  alinea?: Alineacion;
}

export interface CatalogoFormato {
  nombre: string;
  campos: DefCampo[];
  columnas: DefColumna[];
  tabla: { y: number; altoFilaMm: number; maxFilas: number; letraPt: number };
  /** Qué es cada fila de la tabla, para el panel. */
  tablaLabel: string;
}

/** A4 vertical, la hoja de la RDE D000014-2024-MIDAGRI-SERFOR-DE (art. 3). Brandon la cambia por la medida de su talonario. */
export const HOJA_FABRICA = { anchoMm: 210, altoMm: 297 } as const;
export const LETRA_FABRICA_PT = 9;
/** Paso del arrastre y de las flechas; con Shift, el grande. */
export const PASO_MM = 0.5;
export const PASO_GRANDE_MM = 5;

/** 4 columnas como la hoja SERFOR: x 12 · 58 · 104 · 150. */
const C1 = 12, C2 = 58, C3 = 104, C4 = 150;
const MEDIA = 90, CUARTO = 44, ULTIMO = 48, ENTERA = 186, MEDIA_DER = 94;

const fecha = (n: "3" | "4", nombre: string, x: number, y: number): DefCampo[] => [
  { id: n, label: `(${n}) ${nombre}`, grupo: "La guía", x, y, ancho: n === "3" ? CUARTO : ULTIMO },
  { id: `${n}d`, label: `(${n}) Día`, grupo: "La guía", x, y: y + 4, ancho: 7, alinea: "centro", oculto: true },
  { id: `${n}m`, label: `(${n}) Mes`, grupo: "La guía", x: x + 9, y: y + 4, ancho: 7, alinea: "centro", oculto: true },
  { id: `${n}a`, label: `(${n}) Año`, grupo: "La guía", x: x + 18, y: y + 4, ancho: 12, alinea: "centro", oculto: true },
];

const CAMPOS_GUIA: DefCampo[] = [
  { id: "numero", label: "N° de la GTF", grupo: "La guía", x: C4, y: 14, ancho: ULTIMO, oculto: true },
  { id: "2", label: "(2) Autoridad Regional Forestal (ARFFS)", grupo: "La guía", x: C1, y: 40, ancho: MEDIA },
  ...fecha("3", "Fecha de expedición", C3, 40),
  ...fecha("4", "Fecha de vencimiento", C4, 40),
  /* (5) son casillas: cada origen es su campo y sólo el marcado imprime su «X». */
  ...ORIGENES_TALONARIO.filter((o) => !ORIGENES_SOLO_2024.includes(o.clave)).map((o, i): DefCampo => ({
    id: `5:${o.clave}`, label: `(5) ${o.label}${ORIGENES_SOLO_2015.has(o.clave) ? " (2015)" : ""}`,
    grupo: "Origen del recurso (5)", x: C1 + i * 21, y: 48, ancho: 6, alinea: "centro",
  })),
  ...ORIGENES_TALONARIO.filter((o) => ORIGENES_SOLO_2024.includes(o.clave)).map((o, i): DefCampo => ({
    id: `5:${o.clave}`, label: `(5) ${o.label}`, grupo: "Origen del recurso (5)", x: C1 + i * 21, y: 52, ancho: 6, alinea: "centro",
    oculto: true,
  })),
  /* Rótulos con la numeración del formato 2024 (ADR-494). El id es la clave de
     `casillerosGtf` y no cambia: el acomodo guardado de cada campo va por id. */
  { id: "6", label: "(6) N° del título habilitante", grupo: "La guía", x: C1, y: 56, ancho: MEDIA },
  { id: "7", label: "(7) Nombre del titular", grupo: "La guía", x: C3, y: 56, ancho: MEDIA_DER },
  { id: "rep", label: "(8) Rep. legal", grupo: "La guía", x: C1, y: 64, ancho: MEDIA },
  { id: "8", label: "(9) N° de resolución", grupo: "La guía", x: C3, y: 64, ancho: MEDIA_DER },
  { id: "9", label: "(10) Plan de manejo (tipo)", grupo: "La guía", x: C1, y: 72, ancho: MEDIA },
  { id: "10", label: "(11a) Departamento", grupo: "La guía", x: C3, y: 72, ancho: CUARTO },
  { id: "11", label: "(11b) Provincia", grupo: "La guía", x: C4, y: 72, ancho: ULTIMO },
  { id: "12", label: "(11c) Distrito", grupo: "La guía", x: C1, y: 80, ancho: ENTERA },
  { id: "13", label: "(12) Propietario del producto", grupo: "Propietario", x: C1, y: 94, ancho: MEDIA },
  { id: "14", label: "(13) DNI/RUC · el DNI", grupo: "Propietario", x: C3, y: 94, ancho: CUARTO },
  { id: "15", label: "(13) DNI/RUC · el RUC", grupo: "Propietario", x: C4, y: 94, ancho: ULTIMO },
  { id: "16", label: "(14a) Dirección", grupo: "Propietario", x: C1, y: 102, ancho: MEDIA },
  { id: "17", label: "(14b) Departamento", grupo: "Propietario", x: C3, y: 102, ancho: CUARTO },
  { id: "18", label: "(14c) Provincia", grupo: "Propietario", x: C4, y: 102, ancho: ULTIMO },
  { id: "19", label: "(14d) Distrito", grupo: "Propietario", x: C1, y: 110, ancho: CUARTO },
  { id: "20", label: "(15) Tipo de comprobante", grupo: "Propietario", x: C2, y: 110, ancho: CUARTO },
  { id: "21", label: "(16) N° de comprobante", grupo: "Propietario", x: C3, y: 110, ancho: MEDIA_DER },
  /* «Datos del punto de partida» (17)-(20d) y el (22) del destino nacieron con
     el formato 2024. Arrancan ocultos: el talonario 2015 no los tiene; quien
     tenga el de 2024 los prende y los ubica. */
  { id: "p17", label: "(17) Punto de partida", grupo: "Punto de partida", x: C1, y: 116, ancho: MEDIA, oculto: true },
  { id: "p18", label: "(18) N° de autorización", grupo: "Punto de partida", x: C3, y: 116, ancho: CUARTO, oculto: true },
  { id: "p19", label: "(19) Tipo de establecimiento", grupo: "Punto de partida", x: C4, y: 116, ancho: ULTIMO, oculto: true },
  { id: "p20a", label: "(20a) Dirección", grupo: "Punto de partida", x: C1, y: 119, ancho: MEDIA, oculto: true },
  { id: "p20b", label: "(20b) Departamento", grupo: "Punto de partida", x: C3, y: 119, ancho: CUARTO, oculto: true },
  { id: "p20c", label: "(20c) Provincia", grupo: "Punto de partida", x: C4, y: 119, ancho: ULTIMO, oculto: true },
  { id: "p20d", label: "(20d) Distrito", grupo: "Punto de partida", x: C1, y: 122, ancho: ENTERA, oculto: true },
  { id: "22", label: "(21) Destinatario", grupo: "Destinatario", x: C1, y: 124, ancho: MEDIA },
  { id: "23", label: "(23) DNI/RUC · el DNI", grupo: "Destinatario", x: C3, y: 124, ancho: CUARTO },
  { id: "24", label: "(23) DNI/RUC · el RUC", grupo: "Destinatario", x: C4, y: 124, ancho: ULTIMO },
  { id: "25", label: "(24a) Dirección", grupo: "Destinatario", x: C1, y: 132, ancho: MEDIA },
  { id: "26", label: "(24b) Departamento", grupo: "Destinatario", x: C3, y: 132, ancho: CUARTO },
  { id: "27", label: "(24c) Provincia", grupo: "Destinatario", x: C4, y: 132, ancho: ULTIMO },
  { id: "28", label: "(24d) Distrito", grupo: "Destinatario", x: C1, y: 140, ancho: ENTERA },
  { id: "d22", label: "(22) N° de autorización del destinatario", grupo: "Destinatario", x: C3, y: 144, ancho: MEDIA_DER, oculto: true },
  { id: "29", label: "(25) N° guía de remisión del transportista", grupo: "Transporte", x: C1, y: 154, ancho: CUARTO },
  { id: "30", label: "(26) Tipo de transporte", grupo: "Transporte", x: C2, y: 154, ancho: CUARTO },
  { id: "31", label: "(27) Tipo de vehículo", grupo: "Transporte", x: C3, y: 154, ancho: CUARTO },
  { id: "31p", label: "(28) Placa(s) / matrícula", grupo: "Transporte", x: C4, y: 154, ancho: ULTIMO },
  { id: "32", label: "(29) Nombre del conductor", grupo: "Transporte", x: C1, y: 162, ancho: MEDIA },
  { id: "33", label: "(30) DNI del conductor", grupo: "Transporte", x: C3, y: 162, ancho: CUARTO },
  { id: "34", label: "(31) Licencia de conducir", grupo: "Transporte", x: C4, y: 162, ancho: ULTIMO },
  { id: "35", label: "(33) Lista de trozas / productos transformados", grupo: "Producto", x: C1, y: 176, ancho: MEDIA },
  { id: "36", label: "(32) N° GTF de origen", grupo: "Producto", x: C3, y: 176, ancho: MEDIA_DER },
  { id: "37t", label: "(34h) Total movilizado", grupo: "Producto", x: 174, y: 242, ancho: 24, alinea: "der" },
  { id: "38", label: "(35) Observaciones", grupo: "Producto", x: C1, y: 252, ancho: ENTERA },
];

const CAMPOS_LISTA: DefCampo[] = [
  { id: "titular", label: "Titular", grupo: "Encabezado", x: C1, y: 14, ancho: 120 },
  { id: "subtitulo", label: "Título habilitante", grupo: "Encabezado", x: C1, y: 21, ancho: 120 },
  { id: "ubicacion", label: "Ubicación", grupo: "Encabezado", x: C1, y: 28, ancho: 120 },
  { id: "ruc", label: "R.U.C.", grupo: "Encabezado", x: C1, y: 35, ancho: 60 },
  { id: "numero", label: "N° de lista", grupo: "Encabezado", x: 160, y: 14, ancho: 38 },
  { id: "guia", label: "N° de la GTF", grupo: "Encabezado", x: 160, y: 21, ancho: 38 },
  { id: "fecha", label: "Fecha de expedición", grupo: "Encabezado", x: 160, y: 28, ancho: 38 },
  { id: "fechad", label: "Fecha · día", grupo: "Encabezado", x: 160, y: 35, ancho: 7, alinea: "centro", oculto: true },
  { id: "fecham", label: "Fecha · mes", grupo: "Encabezado", x: 169, y: 35, ancho: 7, alinea: "centro", oculto: true },
  { id: "fechaa", label: "Fecha · año", grupo: "Encabezado", x: 178, y: 35, ancho: 12, alinea: "centro", oculto: true },
  { id: "totPiezas", label: "Total de piezas", grupo: "Totales", x: 169, y: 218, ancho: 9, alinea: "centro" },
  { id: "totVol", label: "Volumen total", grupo: "Totales", x: 179, y: 218, ancho: 19, alinea: "der" },
  { id: "obs", label: "(7) Observaciones", grupo: "Totales", x: C1, y: 232, ancho: 120 },
];

export const CATALOGO: Record<FormatoTalonario, CatalogoFormato> = {
  guia: {
    nombre: "Guía",
    campos: CAMPOS_GUIA,
    tablaLabel: "Cuadro detalle de productos (34)",
    tabla: { y: 192, altoFilaMm: 6, maxFilas: 8, letraPt: 8 },
    columnas: [
      { id: "37a", label: "(34a) N. científico", x: 12, ancho: 40 },
      { id: "37b", label: "(34b) N. común o comercial", x: 53, ancho: 30 },
      { id: "37c", label: "(34c) Tipo de producto", x: 84, ancho: 26 },
      { id: "37d", label: "(34d) Descripción", x: 111, ancho: 30 },
      { id: "37e", label: "(34e) Cantidad", x: 142, ancho: 14, alinea: "der" },
      { id: "37f", label: "(34f) Unidad de medida", x: 157, ancho: 16 },
      { id: "37g", label: "(34g) Total", x: 174, ancho: 24, alinea: "der" },
    ],
  },
  lista: {
    nombre: "Lista",
    campos: CAMPOS_LISTA,
    tablaLabel: "Trozas de la lista",
    /* 20 filas: las de cada lista de SERFOR (`FILAS_POR_LISTA`). */
    tabla: { y: 56, altoFilaMm: 8, maxFilas: 20, letraPt: 8 },
    columnas: [
      { id: "n", label: "N°", x: 12, ancho: 7, alinea: "centro" },
      { id: "cientifico", label: "N. científico", x: 20, ancho: 36 },
      { id: "comun", label: "N. común", x: 57, ancho: 28 },
      { id: "producto", label: "Producto", x: 86, ancho: 22 },
      { id: "codigo", label: "(2) Codificación", x: 109, ancho: 20, alinea: "centro" },
      { id: "d1", label: "(4) D1 cm", x: 130, ancho: 12, alinea: "der" },
      { id: "d2", label: "(5) D2 cm", x: 143, ancho: 12, alinea: "der" },
      { id: "largo", label: "(6) Largo m", x: 156, ancho: 12, alinea: "der" },
      { id: "cant", label: "Cantidad", x: 169, ancho: 9, alinea: "centro" },
      { id: "vol", label: "Volumen m³", x: 179, ancho: 19, alinea: "der" },
    ],
  },
};

/** Los ids de fecha (se imprimen con el separador elegido). */
export const CAMPOS_FECHA: Record<FormatoTalonario, readonly string[]> = { guia: ["3", "4"], lista: ["fecha"] };

export function hojaDeFabrica(formato: FormatoTalonario): DisposicionHoja {
  const cat = CATALOGO[formato];
  return {
    ...HOJA_FABRICA,
    offsetXMm: 0,
    offsetYMm: 0,
    separadorFecha: "/",
    campos: Object.fromEntries(
      cat.campos.map((c) => [
        c.id,
        { x: c.x, y: c.y, anchoMm: c.ancho, letraPt: LETRA_FABRICA_PT, alinea: c.alinea ?? "izq", visible: !c.oculto },
      ]),
    ),
    tabla: {
      ...cat.tabla,
      columnas: Object.fromEntries(cat.columnas.map((c) => [c.id, { x: c.x, anchoMm: c.ancho, alinea: c.alinea ?? "izq", visible: true }])),
    },
  };
}

export const disposicionDeFabrica = (): DisposicionTalonario => ({ guia: hojaDeFabrica("guia"), lista: hojaDeFabrica("lista"), actualizado: null });

// ── Validación ──────────────────────────────────────────────────────────────
const mm = (min: number, max: number) => z.number().min(min).max(max);
const alineaSchema = z.enum(["izq", "centro", "der"]);
/** Una hoja de matricial no pasa de 1 m: más es un tipeo. Negativos chicos: el borde se puede corregir hacia afuera. */
export const POS_MIN_MM = -50;
export const POS_MAX_MM = 1000;
const POS = mm(POS_MIN_MM, POS_MAX_MM);
const ANCHO = mm(1, 1000);
const LETRA = mm(5, 24);

export const campoPosSchema = z.object({ x: POS, y: POS, anchoMm: ANCHO, letraPt: LETRA, alinea: alineaSchema, visible: z.boolean() });
export const columnaPosSchema = z.object({ x: POS, anchoMm: ANCHO, alinea: alineaSchema, visible: z.boolean() });
const MAX_CLAVES = 120;
const claves = <T extends z.ZodTypeAny>(v: T) =>
  z.record(z.string().min(1).max(24), v).refine((r) => Object.keys(r).length <= MAX_CLAVES, "Demasiados campos");

export const hojaSchema = z.object({
  anchoMm: mm(50, 1000),
  altoMm: mm(50, 1000),
  offsetXMm: mm(-50, 50),
  offsetYMm: mm(-50, 50),
  separadorFecha: z.enum(["/", ".", "-"]),
  campos: claves(campoPosSchema),
  tabla: z.object({
    y: POS,
    altoFilaMm: mm(2, 60),
    maxFilas: z.int().min(1).max(200),
    letraPt: LETRA,
    columnas: claves(columnaPosSchema),
  }),
});

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Toma de `raw` lo que valida y completa el resto con la de fábrica. Los ids que el catálogo no conoce se descartan. */
export function normalizarHoja(formato: FormatoTalonario, raw: unknown): DisposicionHoja {
  const base = hojaDeFabrica(formato);
  if (!esObjeto(raw)) return base;
  const numero = <K extends "anchoMm" | "altoMm" | "offsetXMm" | "offsetYMm">(k: K) => {
    const r = hojaSchema.shape[k].safeParse(raw[k]);
    return r.success ? r.data : base[k];
  };
  const sep = hojaSchema.shape.separadorFecha.safeParse(raw.separadorFecha);
  const campos = esObjeto(raw.campos) ? raw.campos : {};
  const tablaRaw = esObjeto(raw.tabla) ? raw.tabla : {};
  const cols = esObjeto(tablaRaw.columnas) ? tablaRaw.columnas : {};
  const tablaShape = hojaSchema.shape.tabla.shape;
  const deTabla = <K extends "y" | "altoFilaMm" | "maxFilas" | "letraPt">(k: K) => {
    const r = tablaShape[k].safeParse(tablaRaw[k]);
    return r.success ? r.data : base.tabla[k];
  };
  return {
    anchoMm: numero("anchoMm"),
    altoMm: numero("altoMm"),
    offsetXMm: numero("offsetXMm"),
    offsetYMm: numero("offsetYMm"),
    separadorFecha: sep.success ? sep.data : base.separadorFecha,
    campos: Object.fromEntries(
      Object.entries(base.campos).map(([id, def]) => {
        const r = campoPosSchema.safeParse(campos[id]);
        return [id, r.success ? r.data : def];
      }),
    ),
    tabla: {
      y: deTabla("y"),
      altoFilaMm: deTabla("altoFilaMm"),
      maxFilas: deTabla("maxFilas"),
      letraPt: deTabla("letraPt"),
      columnas: Object.fromEntries(
        Object.entries(base.tabla.columnas).map(([id, def]) => {
          const r = columnaPosSchema.safeParse(cols[id]);
          return [id, r.success ? r.data : def];
        }),
      ),
    },
  };
}

export function normalizarDisposicion(raw: unknown): DisposicionTalonario {
  const r = esObjeto(raw) ? raw : {};
  const act = esObjeto(r.actualizado) && typeof r.actualizado.en === "string" && typeof r.actualizado.por === "string"
    ? { en: r.actualizado.en, por: r.actualizado.por }
    : null;
  return { guia: normalizarHoja("guia", r.guia), lista: normalizarHoja("lista", r.lista), actualizado: act };
}

/** Redondea a medio milímetro (el paso de la matricial que se puede medir con regla). */
export const aMedioMm = (v: number): number => Math.round(v * 2) / 2;

/** Distancia de las cruces de la hoja de prueba a cada borde (navegador, PDF y ESC/P). */
export const CRUZ_MM = 10;

/** Ancho de un carácter de Courier New: 0,6 em. 1 pt = 25,4/72 mm. */
export const mmPorCaracter = (letraPt: number): number => letraPt * 0.6 * (25.4 / 72);

/** ¿El texto entra en una línea de `anchoMm`? (monoespaciada: se cuenta, no se mide) */
export const entraEnUnaLinea = (texto: string, anchoMm: number, letraPt: number): boolean =>
  texto.length * mmPorCaracter(letraPt) <= anchoMm + 0.01;

/** X/Y dentro de lo que el servidor acepta: un arrastre fuera de la hoja no puede dejar la disposición sin guardar ni imprimir. */
export const acotarPos = (v: number): number => Math.min(POS_MAX_MM, Math.max(POS_MIN_MM, v));
