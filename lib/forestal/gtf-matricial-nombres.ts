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
  plan_consolidado: "P. consol.",
  otros: "Otros",
};

const fecha = (n: "3" | "4", nombre: string): Record<string, string> => ({
  [n]: `(${n}) ${nombre}`,
  [`${n}d`]: `(${n}) Día`,
  [`${n}m`]: `(${n}) Mes`,
  [`${n}a`]: `(${n}) Año`,
});

const CAMPOS: Record<FormatoTalonario, Record<string, string>> = {
  guia: {
    numero: "N° GTF",
    "2": "(2) Autoridad",
    ...fecha("3", "F. expedición"),
    ...fecha("4", "F. vencim."),
    ...Object.fromEntries(ORIGENES_TALONARIO.map((o) => [`5:${o.clave}`, ORIGEN_CORTO[o.clave] ?? o.label])),
    "6": "(6) Título hab.",
    "7": "(7) Titular",
    rep: "Repr. legal",
    "8": "(8) Resolución",
    "9": "(9) Plan de manejo",
    "10": "(10) Depto.",
    "11": "(11) Provincia",
    "12": "(12) Distrito",
    "13": "(13) Propietario",
    "14": "(14) DNI",
    "15": "(15) RUC",
    "16": "(16) Dirección",
    "17": "(17) Depto.",
    "18": "(18) Provincia",
    "19": "(19) Distrito",
    "20": "(20) Comprobante",
    "21": "(21) N° comprob.",
    "22": "(22) Destinatario",
    "23": "(23) DNI",
    "24": "(24) RUC",
    "25": "(25) Dirección",
    "26": "(26) Depto.",
    "27": "(27) Provincia",
    "28": "(28) Distrito",
    "29": "(29) Guía remisión",
    "30": "(30) Transporte",
    "31": "(31) Vehículo",
    "31p": "(31) Placa",
    "32": "(32) Conductor",
    "33": "(33) DNI cond.",
    "34": "(34) Licencia",
    "35": "(35) Listas",
    "36": "(36) GTF origen",
    "37t": "Vol. total",
    "38": "(38) Observ.",
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
