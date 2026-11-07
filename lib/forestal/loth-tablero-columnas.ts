/**
 * Columnas del tablero de trozas — una sola definición para la pantalla y el
 * Excel para OSINFOR.
 *
 * Cada columna dice cómo se llama, cómo se ordena y qué valor lleva al Excel.
 * La pantalla muestra las que el usuario eligió; el Excel lleva TODAS: el que
 * fiscaliza no sabe qué columnas tenía prendidas el que exportó.
 *
 * Todo es puro (sin DOM ni exceljs) para poder probarlo; la descarga vive en
 * `loth-tablero-export.ts`.
 */

import { limaDateKey } from "@/lib/utils";
import { ESTADOS_META, type ResumenEstado, type TrozaTablero } from "./loth-tablero-trozas";

export type ColumnaKey =
  | "code"
  | "arbol"
  | "especie"
  | "cientifico"
  | "volumen"
  | "estado"
  | "gtf"
  | "diasPatio"
  | "placa"
  | "fechaTrozado"
  | "fechaSalida"
  | "transportista"
  | "conductor"
  | "destino"
  | "diamMayor"
  | "diamMenor"
  | "largo"
  | "plan"
  | "parcela"
  | "fechaTala"
  | "diasTalaSalida"
  | "foto"
  | "codDespacho"
  | "linea";

/** Tipo del valor: decide alineación en pantalla y formato de celda en Excel. */
export type TipoColumna = "texto" | "numero" | "m3" | "metros" | "fecha" | "dias";

export type ValorCelda = string | number | null;

export interface ColumnaTablero {
  key: ColumnaKey;
  label: string;
  tipo: TipoColumna;
  /** Visible al abrir por primera vez. */
  porDefecto: boolean;
  /** Valor crudo: se usa para ordenar y para el Excel. */
  valor: (f: TrozaTablero) => ValorCelda;
}

/**
 * «Días en patio» contesta lo mismo para todas: a la que sigue, cuánto lleva;
 * a la que ya salió, cuánto estuvo. Sin esto, con el patio en cero (Blas,
 * 30-09) la columna quedaba en blanco justo cuando interesa ver cuánto tardó.
 */
export const diasEnPatioDe = (f: TrozaTablero): number | null =>
  f.estado === "disponible" ? f.diasEnPatio : f.diasTrozadoASalida;

export const COLUMNAS_TABLERO: readonly ColumnaTablero[] = [
  { key: "code", label: "Cód. troza", tipo: "texto", porDefecto: true, valor: (f) => f.code },
  { key: "arbol", label: "Árbol", tipo: "texto", porDefecto: true, valor: (f) => f.treeCode },
  { key: "especie", label: "Especie", tipo: "texto", porDefecto: true, valor: (f) => f.especie },
  { key: "cientifico", label: "Nombre científico", tipo: "texto", porDefecto: false, valor: (f) => f.especieCientifica },
  { key: "volumen", label: "Vol. m³", tipo: "m3", porDefecto: true, valor: (f) => f.volumenM3 },
  { key: "estado", label: "Estado", tipo: "texto", porDefecto: true, valor: (f) => ESTADOS_META[f.estado].label },
  { key: "gtf", label: "GTF / salida", tipo: "texto", porDefecto: true, valor: (f) => f.gtf },
  { key: "diasPatio", label: "Días en patio", tipo: "dias", porDefecto: true, valor: diasEnPatioDe },
  { key: "placa", label: "Placa", tipo: "texto", porDefecto: true, valor: (f) => f.placa },
  { key: "fechaTrozado", label: "Fecha trozado", tipo: "fecha", porDefecto: false, valor: (f) => f.fecha },
  { key: "fechaSalida", label: "Fecha salida", tipo: "fecha", porDefecto: false, valor: (f) => f.fechaSalida },
  { key: "transportista", label: "Transportista", tipo: "texto", porDefecto: false, valor: (f) => f.transportista },
  { key: "conductor", label: "Conductor", tipo: "texto", porDefecto: false, valor: (f) => f.conductor },
  { key: "destino", label: "Destino", tipo: "texto", porDefecto: false, valor: (f) => f.destino },
  { key: "diamMayor", label: "Ø mayor (m)", tipo: "metros", porDefecto: false, valor: (f) => f.diamMayorM },
  { key: "diamMenor", label: "Ø menor (m)", tipo: "metros", porDefecto: false, valor: (f) => f.diamMenorM },
  { key: "largo", label: "Largo (m)", tipo: "metros", porDefecto: false, valor: (f) => f.largoM },
  { key: "plan", label: "Plan de manejo", tipo: "texto", porDefecto: false, valor: (f) => f.plan },
  { key: "parcela", label: "Parcela de corta", tipo: "texto", porDefecto: false, valor: (f) => f.parcela },
  { key: "fechaTala", label: "Fecha de tala", tipo: "fecha", porDefecto: false, valor: (f) => f.fechaTala },
  { key: "diasTalaSalida", label: "Días tala → salida", tipo: "dias", porDefecto: false, valor: (f) => f.diasTalaASalida },
  { key: "foto", label: "Foto", tipo: "texto", porDefecto: false, valor: (f) => (f.conFoto ? "Sí" : "No") },
  { key: "codDespacho", label: "Cód. despacho", tipo: "texto", porDefecto: false, valor: (f) => f.codigoDespacho },
  { key: "linea", label: "Línea del libro", tipo: "numero", porDefecto: false, valor: (f) => f.lineNo },
];

export const COLUMNAS_POR_DEFECTO: readonly ColumnaKey[] = COLUMNAS_TABLERO.filter((c) => c.porDefecto).map((c) => c.key);

const CLAVES = new Set<string>(COLUMNAS_TABLERO.map((c) => c.key));

/**
 * Lo guardado en localStorage → columnas válidas, en el orden de la tabla.
 * Una clave que ya no existe se ignora; si no queda ninguna, las de siempre
 * (una tabla sin columnas no es una preferencia, es un estado roto).
 */
export function columnasValidas(guardado: unknown): ColumnaKey[] {
  if (!Array.isArray(guardado)) return [...COLUMNAS_POR_DEFECTO];
  const pedidas = new Set(guardado.filter((k): k is string => typeof k === "string" && CLAVES.has(k)));
  const r = COLUMNAS_TABLERO.filter((c) => pedidas.has(c.key)).map((c) => c.key);
  return r.length > 0 ? r : [...COLUMNAS_POR_DEFECTO];
}

/* ── Orden ──────────────────────────────────────────────────────────────── */

export interface OrdenTablero {
  key: ColumnaKey;
  dir: "asc" | "desc";
}

/**
 * Ordena por una columna. Lo vacío va SIEMPRE al final, en las dos
 * direcciones: al ordenar por placa lo que se busca son las placas, no diez
 * filas de «—» arriba. A igual valor se respeta el orden que traía (el del
 * tablero: lo disponible y lo más viejo primero).
 */
export function ordenarTablero(filas: readonly TrozaTablero[], orden: OrdenTablero | null): TrozaTablero[] {
  if (!orden) return [...filas];
  const col = COLUMNAS_TABLERO.find((c) => c.key === orden.key);
  if (!col) return [...filas];
  const signo = orden.dir === "asc" ? 1 : -1;
  return filas
    .map((f, i) => ({ f, i, v: col.valor(f) }))
    .sort((a, b) => {
      const va = a.v;
      const vb = b.v;
      if (va == null && vb == null) return a.i - b.i;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es", { numeric: true });
      return c !== 0 ? c * signo : a.i - b.i;
    })
    .map((x) => x.f);
}

/** Clic en una cabecera: asc → desc → sin orden. */
export function siguienteOrden(actual: OrdenTablero | null, key: ColumnaKey): OrdenTablero | null {
  if (!actual || actual.key !== key) return { key, dir: "asc" };
  if (actual.dir === "asc") return { key, dir: "desc" };
  return null;
}

/* ── Excel ──────────────────────────────────────────────────────────────── */

export interface HojaExport {
  columnas: { label: string; tipo: TipoColumna }[];
  filas: ValorCelda[][];
}

/** Todas las columnas, en el orden de la tabla, más CITES (lo pide el control). */
export function filasParaExcel(filas: readonly TrozaTablero[]): HojaExport {
  return {
    columnas: [
      ...COLUMNAS_TABLERO.map((c) => ({ label: c.label, tipo: c.tipo })),
      { label: "CITES", tipo: "texto" as const },
    ],
    filas: filas.map((f) => [...COLUMNAS_TABLERO.map((c) => c.valor(f)), f.cites ? "Sí" : "No"]),
  };
}

/**
 * La hoja resumen: una fila por estado + el total. «Sin volumen» va aparte
 * porque esas trozas se cuentan pero no suman: un total que las esconda
 * parece completo y no lo es.
 */
export function resumenParaExcel(resumen: readonly ResumenEstado[]): HojaExport {
  const total = resumen.reduce(
    (a, r) => ({ n: a.n + r.n, m3: a.m3 + r.m3, sin: a.sin + r.sinVolumen }),
    { n: 0, m3: 0, sin: 0 },
  );
  return {
    columnas: [
      { label: "Estado", tipo: "texto" },
      { label: "Trozas", tipo: "numero" },
      { label: "Volumen m³", tipo: "m3" },
      { label: "Trozas sin volumen", tipo: "numero" },
    ],
    filas: [
      ...resumen.map((r) => [r.label, r.n, r.m3, r.sinVolumen]),
      ["Total", total.n, Math.round(total.m3 * 10000) / 10000, total.sin],
    ],
  };
}

/**
 * `control-permiso-<título habilitante>-<AAAA-MM-DD>.xlsx`. El título se
 * limpia de lo que un sistema de archivos no acepta (`/` es común en los
 * números de contrato: «25-TAM/C-OPB-A-001-17»).
 */
export function nombreArchivoExport(tituloHabilitante: string | null | undefined, hoy: Date): string {
  const titulo = (tituloHabilitante ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // El día de Lima: a las 20:00 de Pucallpa el UTC ya es mañana.
  const fecha = limaDateKey(hoy);
  return `control-permiso-${titulo || "sin-titulo"}-${fecha}.xlsx`;
}
