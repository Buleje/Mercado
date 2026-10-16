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
import { PLANTILLA_FABRICA, RANURAS, type Ranura, type TablaPlantilla } from "./gtf-talonario-plantilla";

/**
 * Las casillas del (5). Copia de `ORIGENES` + `ORIGENES_SIN_CASILLA_2024` de
 * `ctp-gtf-formato` (ese módulo es "use client" y esto lo lee también la ruta
 * del servidor): el test `forestal-gtf-matricial` falla si se separan.
 *
 * Cada casilla cae en su lugar del papel 2024 (`RANURAS` de la plantilla).
 * «Plan de Manejo Consolidado» y «Otros» ya no existen en 2024 pero se quedan,
 * ocultos (ADR-494): borrar un campo borra el acomodo guardado de ese campo.
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
  /** Sobre qué plantilla se acomodó (`PLANTILLA_FABRICA`): una de otra plantilla vuelve a la de fábrica. */
  plantilla?: string;
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
  /** Arranca oculta: el talonario no tiene esa columna o ya la trae impresa. */
  oculta?: boolean;
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

/*
 * El lugar de fábrica de cada valor sale de la plantilla del talonario
 * preimpreso (`gtf-talonario-plantilla`, medida sobre el talonario de Brandon
 * el 16-10): el renglón punteado que sigue a su rótulo. Antes era una grilla
 * de 4 columnas que no correspondía a ningún papel.
 */
const G = RANURAS.guia.campos;
const L = RANURAS.lista.campos;

/** Un campo en su ranura de la plantilla. */
const en = (r: Ranura, id: string, label: string, grupo: string, oculto = false): DefCampo => ({
  id, label, grupo, x: r.x, y: r.y, ancho: r.ancho, ...(r.alinea ? { alinea: r.alinea } : {}), ...(oculto ? { oculto } : {}),
});

const fecha = (n: "3" | "4", nombre: string): DefCampo[] => [
  en(G[n], n, `(${n}) ${nombre}`, "La guía"),
  en(G[`${n}d`], `${n}d`, `(${n}) Día`, "La guía", true),
  en(G[`${n}m`], `${n}m`, `(${n}) Mes`, "La guía", true),
  en(G[`${n}a`], `${n}a`, `(${n}) Año`, "La guía", true),
];

/* Rótulos con la numeración del formato 2024 (ADR-494). El id es la clave de
   `casillerosGtf` y no cambia: el acomodo guardado de cada campo va por id. */
const CAMPOS_GUIA: DefCampo[] = [
  /* El N° viene prenumerado en rojo por la imprenta. */
  en(G.numero, "numero", "N° de la GTF", "La guía", true),
  en(G["2"], "2", "(2) Autoridad Regional Forestal (ARFFS)", "La guía"),
  ...fecha("3", "Fecha de expedición"),
  ...fecha("4", "Fecha de vencimiento"),
  /* (5) son casillas: cada origen es su campo y sólo el marcado imprime su «X».
     Las dos que el formato 2024 retiró arrancan ocultas (rótulo «2015»). */
  ...ORIGENES_TALONARIO.map((o) =>
    en(G[`5:${o.clave}`], `5:${o.clave}`, `(5) ${o.label}${ORIGENES_SOLO_2015.has(o.clave) ? " (2015)" : ""}`, "Origen del recurso (5)", ORIGENES_SOLO_2015.has(o.clave)),
  ),
  en(G["6"], "6", "(6) N° del título habilitante", "La guía"),
  en(G["7"], "7", "(7) Nombre del titular", "La guía"),
  en(G.rep, "rep", "(8) Rep. legal", "La guía"),
  en(G["8"], "8", "(9) N° de resolución", "La guía"),
  en(G["9"], "9", "(10) Plan de manejo (tipo)", "La guía"),
  en(G["10"], "10", "(11a) Departamento", "La guía"),
  en(G["11"], "11", "(11b) Provincia", "La guía"),
  en(G["12"], "12", "(11c) Distrito", "La guía"),
  en(G["13"], "13", "(12) Propietario del producto", "Propietario"),
  en(G["14"], "14", "(13) DNI/RUC · el DNI", "Propietario"),
  en(G["15"], "15", "(13) DNI/RUC · el RUC", "Propietario"),
  en(G["16"], "16", "(14a) Dirección", "Propietario"),
  en(G["17"], "17", "(14b) Departamento", "Propietario"),
  en(G["18"], "18", "(14c) Provincia", "Propietario"),
  en(G["19"], "19", "(14d) Distrito", "Propietario"),
  en(G["20"], "20", "(15) Tipo de comprobante", "Propietario"),
  en(G["21"], "21", "(16) N° de comprobante", "Propietario"),
  /* «Datos del punto de partida» (17)-(20d) y el (22) del destino: el talonario 2024 los trae impresos. */
  en(G.p17, "p17", "(17) Punto de partida", "Punto de partida"),
  en(G.p18, "p18", "(18) N° de autorización", "Punto de partida"),
  en(G.p19, "p19", "(19) Tipo de establecimiento", "Punto de partida"),
  en(G.p20a, "p20a", "(20a) Dirección", "Punto de partida"),
  en(G.p20b, "p20b", "(20b) Departamento", "Punto de partida"),
  en(G.p20c, "p20c", "(20c) Provincia", "Punto de partida"),
  en(G.p20d, "p20d", "(20d) Distrito", "Punto de partida"),
  en(G["22"], "22", "(21) Destinatario", "Destinatario"),
  en(G.d22, "d22", "(22) N° de autorización del destinatario", "Destinatario"),
  en(G["23"], "23", "(23) DNI/RUC · el DNI", "Destinatario"),
  en(G["24"], "24", "(23) DNI/RUC · el RUC", "Destinatario"),
  en(G["25"], "25", "(24a) Dirección", "Destinatario"),
  en(G["26"], "26", "(24b) Departamento", "Destinatario"),
  en(G["27"], "27", "(24c) Provincia", "Destinatario"),
  en(G["28"], "28", "(24d) Distrito", "Destinatario"),
  en(G["29"], "29", "(25) N° guía de remisión del transportista", "Transporte"),
  en(G["30"], "30", "(26) Tipo de transporte", "Transporte"),
  en(G["31"], "31", "(27) Tipo de vehículo", "Transporte"),
  en(G["31p"], "31p", "(28) Placa(s) / matrícula", "Transporte"),
  en(G["32"], "32", "(29) Nombre del conductor", "Transporte"),
  en(G["33"], "33", "(30) DNI del conductor", "Transporte"),
  en(G["34"], "34", "(31) Licencia de conducir", "Transporte"),
  en(G["36"], "36", "(32) N° GTF de origen", "Producto"),
  en(G["35"], "35", "(33) Lista de trozas / productos transformados", "Producto"),
  en(G["37t"], "37t", "(34h) Total movilizado", "Producto"),
  en(G["38"], "38", "(35) Observaciones", "Producto"),
];

/* El encabezado de la lista (titular, RUC, título, ubicación), su N° y la
   fecha: la imprenta imprime los cuatro primeros y el N°; la lista del
   talonario no tiene fecha. Arrancan ocultos en su lugar. */
const CAMPOS_LISTA: DefCampo[] = [
  en(L.titular, "titular", "Titular", "Encabezado", true),
  en(L.subtitulo, "subtitulo", "Título habilitante", "Encabezado", true),
  en(L.ubicacion, "ubicacion", "Ubicación", "Encabezado", true),
  en(L.ruc, "ruc", "R.U.C.", "Encabezado", true),
  en(L.numero, "numero", "(1) N° de lista", "Encabezado", true),
  en(L.guia, "guia", "(2) GTF N°", "Encabezado"),
  en(L.fecha, "fecha", "Fecha de expedición", "Encabezado", true),
  en(L.fechad, "fechad", "Fecha · día", "Encabezado", true),
  en(L.fecham, "fecham", "Fecha · mes", "Encabezado", true),
  en(L.fechaa, "fechaa", "Fecha · año", "Encabezado", true),
  en(L.totPiezas, "totPiezas", "(11) Total · cantidad", "Totales"),
  en(L.totVol, "totVol", "(11) Total · volumen", "Totales"),
  en(L.obs, "obs", "(12) Observaciones", "Totales"),
];

const col = (t: TablaPlantilla, id: string, label: string, oculta = false): DefColumna => {
  const c = t.columnas[id];
  return { id, label, x: c.x, ancho: c.ancho, ...(c.alinea && c.alinea !== "izq" ? { alinea: c.alinea } : {}), ...(oculta ? { oculta } : {}) };
};
const TG = RANURAS.guia.tabla;
const TL = RANURAS.lista.tabla;
const tablaDe = (t: TablaPlantilla) => ({ y: t.y, altoFilaMm: t.altoFilaMm, maxFilas: t.maxFilas, letraPt: t.letraPt });

export const CATALOGO: Record<FormatoTalonario, CatalogoFormato> = {
  guia: {
    nombre: "Guía",
    campos: CAMPOS_GUIA,
    tablaLabel: "Cuadro detalle de productos (34)",
    tabla: tablaDe(TG),
    columnas: [
      col(TG, "37a", "(34a) N. científico"),
      col(TG, "37b", "(34b) N. común o comercial"),
      col(TG, "37c", "(34c) Tipo de producto"),
      col(TG, "37d", "(34d) Descripción"),
      col(TG, "37e", "(34e) Cantidad"),
      col(TG, "37f", "(34f) Unidad de medida"),
      col(TG, "37g", "(34g) Total"),
    ],
  },
  lista: {
    nombre: "Lista",
    campos: CAMPOS_LISTA,
    tablaLabel: "Trozas de la lista",
    /* 30 filas: las del talonario. Cada lista de SERFOR (`FILAS_POR_LISTA`, 20) va en su hoja. */
    tabla: tablaDe(TL),
    columnas: [
      /* El talonario trae los N° de fila impresos y no tiene columna de producto: arrancan ocultas. */
      col(TL, "n", "N°", true),
      col(TL, "cientifico", "(3) N. científico"),
      col(TL, "comun", "(4) N. común o comercial"),
      { id: "producto", label: "Producto", x: TL.columnas.codigo.x, ancho: TL.columnas.codigo.ancho, oculta: true },
      col(TL, "codigo", "(5) Codificación"),
      col(TL, "d1", "(6) d1"),
      col(TL, "d2", "(7) d2"),
      col(TL, "largo", "(8) L"),
      col(TL, "cant", "(9) Cantidad"),
      col(TL, "vol", "(10) Volumen m³"),
    ],
  },
};

/** Los ids de fecha (se imprimen con el separador elegido). */
export const CAMPOS_FECHA: Record<FormatoTalonario, readonly string[]> = { guia: ["3", "4"], lista: ["fecha"] };

export function hojaDeFabrica(formato: FormatoTalonario): DisposicionHoja {
  const cat = CATALOGO[formato];
  return {
    plantilla: PLANTILLA_FABRICA,
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
      columnas: Object.fromEntries(cat.columnas.map((c) => [c.id, { x: c.x, anchoMm: c.ancho, alinea: c.alinea ?? "izq", visible: !c.oculta }])),
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
  plantilla: z.string().max(40).optional(),
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
  /* Acomodada sobre otra plantilla (la grilla de 4 columnas de antes del 16-10,
     que no era ningún papel): se conservan la medida, el corrimiento y el
     separador; los campos y la tabla vuelven a su renglón de la plantilla. */
  const otraPlantilla = raw.plantilla !== PLANTILLA_FABRICA;
  const numero = <K extends "anchoMm" | "altoMm" | "offsetXMm" | "offsetYMm">(k: K) => {
    const r = hojaSchema.shape[k].safeParse(raw[k]);
    return r.success ? r.data : base[k];
  };
  const sep = hojaSchema.shape.separadorFecha.safeParse(raw.separadorFecha);
  const campos = !otraPlantilla && esObjeto(raw.campos) ? raw.campos : {};
  const tablaRaw = !otraPlantilla && esObjeto(raw.tabla) ? raw.tabla : {};
  const cols = esObjeto(tablaRaw.columnas) ? tablaRaw.columnas : {};
  const tablaShape = hojaSchema.shape.tabla.shape;
  const deTabla = <K extends "y" | "altoFilaMm" | "maxFilas" | "letraPt">(k: K) => {
    const r = tablaShape[k].safeParse(tablaRaw[k]);
    return r.success ? r.data : base.tabla[k];
  };
  return {
    plantilla: PLANTILLA_FABRICA,
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
