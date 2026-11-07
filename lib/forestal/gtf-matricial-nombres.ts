/**
 * gtf-matricial-nombres — el nombre corto de cada campo que se ve ENCIMA de su
 * valor en la hoja de la PANTALLA del talonario (Brandon 15-10: «que se ponga
 * el título del campo, tipo referencia, y no perderse nada»).
 *
 * Nunca se imprime: el papel sale de `gtf-matricial-print.ts`, que no lee
 * esto. Corto a propósito: va en letra chica sobre un casillero de pocos mm.
 * Lo que no está acá usa la etiqueta del catálogo.
 */

import { CATALOGO, ORIGENES_TALONARIO, type FormatoTalonario } from "./gtf-matricial-disposicion";

const ORIGEN_CORTO: Record<string, string> = {
  concesion: "Conces.",
  permiso: "Permiso",
  autorizacion: "Autoriz.",
  bosque_local: "B. local",
  desbosque: "Desbosq.",
  cambio_uso: "C. uso",
  plantacion: "Plantac.",
  plan_consolidado: "P. consol. (2015)",
  otros: "Otros (2015)",
  varios_origenes: "Varios orig.",
  ctp: "CTP",
  cesion_uso: "Cesión uso",
};

const fecha = (n: "3" | "4", nombre: string): Record<string, string> => ({
  [n]: `(${n}) ${nombre}`,
  [`${n}d`]: `(${n}) Día`,
  [`${n}m`]: `(${n}) Mes`,
  [`${n}a`]: `(${n}) Año`,
});

/* Con la numeración del formato 2024 (ADR-494); la CLAVE es la del talonario. */
const CAMPOS: Record<FormatoTalonario, Record<string, string>> = {
  guia: {
    numero: "(1) N° GTF",
    "2": "(2) Autoridad",
    ...fecha("3", "F. expedición"),
    ...fecha("4", "F. vencim."),
    ...Object.fromEntries(ORIGENES_TALONARIO.map((o) => [`5:${o.clave}`, ORIGEN_CORTO[o.clave] ?? o.label])),
    "6": "(6) Título hab.",
    "7": "(7) Titular",
    rep: "(8) Rep. legal",
    "8": "(9) Resolución",
    "9": "(10) Plan de manejo",
    "10": "(11a) Depto.",
    "11": "(11b) Provincia",
    "12": "(11c) Distrito",
    "13": "(12) Propietario",
    "14": "(13) DNI",
    "15": "(13) RUC",
    "16": "(14a) Dirección",
    "17": "(14b) Depto.",
    "18": "(14c) Provincia",
    "19": "(14d) Distrito",
    "20": "(15) Comprobante",
    "21": "(16) N° comprob.",
    p17: "(17) Partida",
    p18: "(18) N° autoriz.",
    p19: "(19) Tipo establ.",
    p20a: "(20a) Dirección",
    p20b: "(20b) Depto.",
    p20c: "(20c) Provincia",
    p20d: "(20d) Distrito",
    "22": "(21) Destinatario",
    d22: "(22) N° autoriz.",
    "23": "(23) DNI",
    "24": "(23) RUC",
    "25": "(24a) Dirección",
    "26": "(24b) Depto.",
    "27": "(24c) Provincia",
    "28": "(24d) Distrito",
    "29": "(25) Guía remisión",
    "30": "(26) Transporte",
    "31": "(27) Vehículo",
    "31p": "(28) Placa",
    "32": "(29) Conductor",
    "33": "(30) DNI cond.",
    "34": "(31) Licencia",
    "35": "(33) Listas",
    "36": "(32) GTF origen",
    "37t": "(34h) Total",
    "38": "(35) Observ.",
  },
  lista: {
    titular: "Titular",
    subtitulo: "Título hab.",
    ubicacion: "Ubicación",
    ruc: "RUC",
    numero: "N° lista",
    guia: "N° GTF",
    fecha: "Fecha",
    fechad: "Día",
    fecham: "Mes",
    fechaa: "Año",
    totPiezas: "Piezas",
    totVol: "Vol. total",
    obs: "Observ.",
  },
};

const COLUMNAS: Record<FormatoTalonario, Record<string, string>> = {
  guia: { "37a": "Científico", "37b": "Común", "37c": "Producto", "37d": "Descripción", "37e": "Cant.", "37f": "Unidad", "37g": "Total" },
  lista: { n: "N°", cientifico: "Científico", comun: "Común", producto: "Producto", codigo: "Código", d1: "D1", d2: "D2", largo: "Largo", cant: "Cant.", vol: "Vol." },
};

/** El nombre corto de un campo o columna; si no tiene, su etiqueta del catálogo. */
export function nombreCorto(formato: FormatoTalonario, tipo: "campo" | "columna", id: string): string {
  const corto = (tipo === "campo" ? CAMPOS : COLUMNAS)[formato][id];
  if (corto) return corto;
  const cat = CATALOGO[formato];
  return (tipo === "campo" ? cat.campos : cat.columnas).find((c) => c.id === id)?.label ?? id;
}
