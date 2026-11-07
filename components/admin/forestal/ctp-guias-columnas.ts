/**
 * Las columnas de la bandeja de Ingresos por guía (ADR-400) — qué se puede
 * apagar, en qué orden se pintan y cuántas celdas ocupan.
 *
 * Vive aparte de la tabla porque lo leen tres lados: la cabecera, la fila (y
 * sus asientos desplegados) y el pie, que cuenta las columnas VIVAS para su
 * `colSpan`. Con el conteo escrito en cada lado, apagar una corría el total una
 * celda y el m³ caía bajo otra columna (visto en pantalla, no por el tipo).
 */

import { useState } from "react";
import { useColumnasVisibles } from "./ctp-shared";

/**
 * Fijas quedan las que IDENTIFICAN la fila —N° de libro, fecha, especies,
 * cantidad y acciones—: esconderlas dejaría filas que no se pueden reconocer.
 */
export type ColGuiaOpcional =
  | "documento" | "proveedor" | "permiso" | "estado"
  | "tipoDoc" | "fechaGuia" | "sniffs" | "origen" | "recepcion" | "producto"
  | "piezas" | "trozas" | "unidad" | "costo" | "registro";
export type ColsGuiasVisibles = Record<ColGuiaOpcional, boolean>;

/**
 * Las quince columnas elegibles (Brandon, 2026-09-18: «quiero más opciones para
 * escoger»). El `grupo` es lo que hace usable un menú de quince: sin él es una
 * lista de casillas donde no se distingue «Recepción» (operación) de
 * «Valorizado» (plata). Cada dato sale de la guía o de su primer asiento —
 * ninguna columna inventa un cálculo que la fila no tenga.
 *
 * 2026-09-25 (Brandon: «ves guía, proveedor, permiso, especie y m³ de un
 * vistazo, sin desplazar»): proveedor y permiso comparten UNA celda, y
 * «Estado» arranca apagada — la tabla medía 2 010 px en una pantalla de 960.
 * El estado no se pierde: la celda de acciones lo dice cuando no hay un acto
 * pendiente, y la columna sigue en «Columnas».
 */
export const COLUMNAS_GUIAS_OPCIONALES: readonly {
  key: ColGuiaOpcional;
  label: string;
  porDefecto?: boolean;
  grupo?: string;
}[] = [
  // El papel
  { key: "documento", label: "Documento (GTF)", grupo: "El papel" },
  { key: "tipoDoc", label: "Tipo de documento", porDefecto: false, grupo: "El papel" },
  { key: "fechaGuia", label: "Fecha del documento", porDefecto: false, grupo: "El papel" },
  { key: "sniffs", label: "N° SNIFFS", porDefecto: false, grupo: "El papel" },
  // De dónde viene — proveedor y permiso van en la MISMA celda si están los dos.
  { key: "proveedor", label: "Proveedor", grupo: "De dónde viene" },
  { key: "permiso", label: "N° Permiso", grupo: "De dónde viene" },
  { key: "origen", label: "Origen (región/distrito)", porDefecto: false, grupo: "De dónde viene" },
  // Qué trae
  { key: "producto", label: "Producto", porDefecto: false, grupo: "Qué trae" },
  { key: "piezas", label: "Piezas", porDefecto: false, grupo: "Qué trae" },
  { key: "trozas", label: "Trozas cargadas", porDefecto: false, grupo: "Qué trae" },
  { key: "unidad", label: "Unidad declarada", porDefecto: false, grupo: "Qué trae" },
  // Cómo va
  { key: "recepcion", label: "Recepción en planta", porDefecto: false, grupo: "Cómo va" },
  { key: "estado", label: "Estado", porDefecto: false, grupo: "Cómo va" },
  { key: "costo", label: "Valorizado (S/)", porDefecto: false, grupo: "Cómo va" },
  { key: "registro", label: "Registró", porDefecto: false, grupo: "Cómo va" },
];

export const COLS_GUIAS_DEFECTO: ColsGuiasVisibles = Object.fromEntries(
  COLUMNAS_GUIAS_OPCIONALES.map((c) => [c.key, c.porDefecto ?? true]),
) as ColsGuiasVisibles;

/** Dónde se guarda la elección. `-v2` desde que cambió el defecto (2026-09-25). */
export const CLAVE_COLS_GUIAS = "ctp-ingresos-cols-v2";
const CLAVE_COLS_GUIAS_V1 = "ctp-ingresos-cols";

/**
 * El defecto de ANTES del 2026-09-25: las cuatro prendidas eran documento,
 * proveedor, permiso y estado. Sirve sólo para migrar.
 */
const DEFECTO_V1: ColsGuiasVisibles = { ...COLS_GUIAS_DEFECTO, estado: true };

/**
 * Pasa la elección guardada con la clave vieja a la nueva, una sola vez.
 *
 * El hook de columnas guarda el registro ENTERO al montar, así que en la clave
 * vieja no se distingue «nunca tocó nada» de «eligió esto»: todo el que abrió
 * Ingresos alguna vez tiene las quince claves escritas. La regla: si lo
 * guardado es IDÉNTICO al defecto viejo, nunca eligió — toma el defecto nuevo.
 * Si difiere en algo, eligió él — se respeta tal cual, «Estado» incluido.
 * Devuelve lo que quedó escrito en la clave nueva (o `null` si no había nada).
 */
export function migrarColumnasGuias(storage: Pick<Storage, "getItem" | "setItem">): ColsGuiasVisibles | null {
  try {
    const nueva = storage.getItem(CLAVE_COLS_GUIAS);
    if (nueva) return { ...COLS_GUIAS_DEFECTO, ...(JSON.parse(nueva) as Partial<ColsGuiasVisibles>) };
    const vieja = storage.getItem(CLAVE_COLS_GUIAS_V1);
    if (!vieja) return null;
    const guardadas = { ...DEFECTO_V1, ...(JSON.parse(vieja) as Partial<ColsGuiasVisibles>) };
    const nuncaEligio = (Object.keys(DEFECTO_V1) as ColGuiaOpcional[]).every((k) => guardadas[k] === DEFECTO_V1[k]);
    const resultado = nuncaEligio ? COLS_GUIAS_DEFECTO : guardadas;
    storage.setItem(CLAVE_COLS_GUIAS, JSON.stringify(resultado));
    return resultado;
  } catch {
    /* JSON roto o storage bloqueado: arranca con el defecto, como antes. */
    return null;
  }
}

/** Las opcionales que van DESPUÉS de «Cantidad» (antes de «Acciones»), en orden. */
export const COLS_DERECHA: readonly ColGuiaOpcional[] = ["piezas", "trozas", "unidad", "costo", "registro", "estado"];

/**
 * Cuántas celdas VIVAS hay a cada lado de las fijas. Proveedor y permiso
 * cuentan UNA: comparten celda (2026-09-25).
 */
export function columnasVivas(cols: ColsGuiasVisibles): { izquierda: number; derecha: number } {
  const izquierda = [
    cols.tipoDoc,
    cols.documento,
    cols.fechaGuia,
    cols.sniffs,
    cols.proveedor,
    cols.permiso,
    cols.origen,
    cols.recepcion,
    cols.producto,
  ].filter(Boolean).length;
  const derecha = COLS_DERECHA.reduce((n, k) => n + (cols[k] ? 1 : 0), 0);
  return { izquierda, derecha };
}

/**
 * Las columnas elegidas de la bandeja, con la migración de la clave vieja
 * corrida ANTES de que el hook lea el storage (el inicializador de `useState`
 * corre en orden, en el primer render). Idempotente: con la clave nueva ya
 * escrita, no toca nada.
 */
export function useColumnasGuias() {
  useState(() => {
    if (typeof window !== "undefined") migrarColumnasGuias(window.localStorage);
    return true;
  });
  return useColumnasVisibles(CLAVE_COLS_GUIAS, COLUMNAS_GUIAS_OPCIONALES);
}

/**
 * Las columnas que se pueden ARRASTRAR a otro lugar (Brandon, 2026-09-26), en
 * su orden de fábrica. Quedan fuera la casilla de marcar y «Acciones», que
 * viven en los bordes. Proveedor y permiso son DOS columnas desde el
 * 2026-09-26 (Brandon: «separar la columna proveedor · permiso en dos»).
 */
export const ORDEN_GUIAS_DEFECTO = [
  "fecha", "tipoDoc", "documento", "fechaGuia", "sniffs", "proveedor", "permiso", "origen", "recepcion", "producto",
  "especies", "cantidad", "piezas", "trozas", "unidad", "costo", "registro", "estado",
] as const;
export type ColGuia = (typeof ORDEN_GUIAS_DEFECTO)[number];
/** Dónde se guarda el orden (`orden-columnas:<clave>`). */
export const CLAVE_ORDEN_GUIAS = "ctp-ingresos-guias";

/** ¿Se pinta esta columna? Fecha, especies y cantidad identifican la fila: siempre. */
export function colGuiaVisible(id: ColGuia, cols: ColsGuiasVisibles): boolean {
  if (id === "fecha" || id === "especies" || id === "cantidad") return true;
  return cols[id];
}

/** Las visibles, en el orden elegido: la cabecera, la fila y el pie cuentan con la MISMA lista. */
export function guiasVisiblesEnOrden(orden: readonly string[], cols: ColsGuiasVisibles): ColGuia[] {
  return (orden as ColGuia[]).filter((id) => colGuiaVisible(id, cols));
}
