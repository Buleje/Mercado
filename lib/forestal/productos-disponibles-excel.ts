/**
 * El Excel de «Productos disponibles»: UN archivo con una hoja por cada tabla
 * de la pantalla —por permiso, por especie, por producto, paquete por paquete—
 * y «Qué se exportó» (rediseño 2026-09-27, mismo formato que Trozas).
 *
 * Todas las hojas salen de las MISMAS filas filtradas, así los totales cierran
 * entre hojas: la suma de «m³ disponibles» de cualquier hoja de grupos es la de
 * la hoja de paquetes. Lo marcado como usado va en columnas aparte, nunca
 * sumado. Números como número (no texto): el contador suma en Excel.
 *
 * PURO y client-safe.
 */

import type { HojaExcel } from "@/lib/export-excel";
import { formatDateTime } from "@/lib/format";
import { disponiblesACsv, type FilaDisponibleCsv } from "./disponibles-csv";
import { ETIQUETA_TRAMO } from "./edad-del-patio";
import {
  ESTADOS_PRODUCTO,
  type FiltroProductos,
  ETIQUETA_ESTADO_PRODUCTO,
  porGrupo,
  ptDe,
  resumenProductos,
  type DimensionProducto,
  type FilaProducto,
} from "./productos-disponibles-resumen";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const HOJA_GRUPO: Record<DimensionProducto, string> = {
  permiso: "Por permiso",
  especie: "Por especie",
  producto: "Por producto",
};
export const HOJA_PAQUETES = "Paquete por paquete";
export const HOJA_QUE_SE_EXPORTO_PRODUCTOS = "Qué se exportó";

const TITULO: Record<DimensionProducto, string> = {
  permiso: "Permiso",
  especie: "Especie",
  producto: "Producto",
};

/** Una hoja de grupos, con las mismas columnas que su tabla en pantalla. */
export function hojaDeGrupos(
  filas: readonly FilaProducto[],
  dim: DimensionProducto,
  etiquetaProducto: (v: string) => string = (v) => v,
): HojaExcel {
  return {
    nombre: HOJA_GRUPO[dim],
    filas: porGrupo(filas, dim).map((g) => ({
      [TITULO[dim]]: dim === "producto" ? etiquetaProducto(g.etiqueta) : g.etiqueta,
      "pt disponibles": g.disponible.pt,
      "m³ disponibles": r3(g.disponible.m3),
      Paquetes: g.disponible.paquetes,
      Piezas: g.disponible.piezas,
      "% del m³": g.pctM3,
      "m³ apartados (incluidos)": r3(g.apartado.m3),
      "Marcado usado (m³, aparte)": r3(g.usado.m3),
      ...(dim !== "especie" ? { Especies: g.especies } : { Productos: g.productos }),
      "Días del más viejo": g.masViejoDias,
    })),
  };
}

/**
 * Paquete por paquete (las corridas sin paquete, con su saldo), en el orden y
 * con el aviso de la pantalla. «m³» es el del paquete; si alguna corrida no
 * cuadra se agrega «m³ según el libro», que es la que suman las otras hojas.
 */
export function hojaDePaquetes(
  filas: readonly FilaProducto[],
  etiquetaProducto: (v: string) => string = (v) => v,
): HojaExcel {
  const conLibro = filas.some((f) => Math.abs(f.m3Libro - f.volumenM3) > 0.0005);
  return {
    nombre: HOJA_PAQUETES,
    filas: filas.map((f) => ({
      Código: f.paquete?.codigo ?? "sin paquete",
      Producto: etiquetaProducto(f.producto),
      Especie: f.corrida.especie ?? "",
      Presentación: f.paquete?.presentacion ?? f.corrida.presentacion ?? "",
      "Espesor (cm)": f.paquete?.espesorCm ?? null,
      "Ancho (cm)": f.paquete?.anchoCm ?? null,
      "Largo (m)": f.paquete?.largoM ?? null,
      Piezas: f.piezas,
      pt: ptDe(f.volumenM3),
      "m³": r3(f.volumenM3),
      ...(conLibro ? { "m³ según el libro": r3(f.m3Libro) } : {}),
      Corrida: f.corrida.lineNo != null ? `N° ${f.corrida.lineNo}` : "",
      Lote: f.corrida.lote ?? "",
      Permiso: (f.corrida.titularOrigen ?? []).join(" · "),
      GTF: (f.corrida.gtfOrigen ?? []).join(" · "),
      "Días parado": f.dias,
      "Valor (S/)": f.valorSoles,
      Estado: ETIQUETA_ESTADO_PRODUCTO[f.estado],
      "Apartado para": f.apartado?.para ?? "",
    })),
  };
}

export interface EntradaExcelProductos {
  /** Las filas filtradas (todas las del filtro, lo usado incluido: va en su columna). */
  filas: readonly FilaProducto[];
  /** Las filas de la hoja de paquetes (lo usado sólo si se pidió). */
  paquetes: readonly FilaProducto[];
  ahora: Date;
  filtros: readonly string[];
  /** Código del permiso cuando «Solo este permiso» está prendido. */
  alcance: string | null;
  etiquetaProducto?: (v: string) => string;
}

function hojaQueSeExporto(e: EntradaExcelProductos): HojaExcel {
  const r = resumenProductos(e.filas, e.ahora);
  const filas: { Dato: string; Valor: string | number }[] = [
    { Dato: "Fecha", Valor: formatDateTime(e.ahora) },
    { Dato: "Alcance", Valor: e.alcance ? `Solo este permiso: ${e.alcance}` : "Toda la planta" },
    { Dato: "Filtros", Valor: e.filtros.length > 0 ? e.filtros.join(" · ") : "Ninguno" },
    { Dato: "pt disponibles", Valor: r.disponible.pt },
    { Dato: "m³ disponibles", Valor: r3(r.disponible.m3) },
    { Dato: "Paquetes", Valor: r.disponible.paquetes },
    { Dato: "Piezas", Valor: r.disponible.piezas },
    { Dato: "De eso, apartado (m³)", Valor: r3(r.apartado.m3) },
    { Dato: "Marcado usado (m³, aparte)", Valor: r3(r.usado.m3) },
    { Dato: "Qué es", Valor: "Madera aserrada con saldo: producido − despachado − reprocesado." },
    { Dato: "pt", Valor: "m³ × 424 pt/m³ (madera ya aserrada)." },
    { Dato: "Marcado usado", Valor: "Salió sin guía ni reproceso. No suma a lo disponible." },
  ];
  if (r.descuadre.corridas > 0) {
    filas.push({
      Dato: "¡Revisar!",
      Valor: `${r.descuadre.corridas} corrida(s) no cuadran: sus paquetes suman ${r3(r.descuadre.paquetesM3)} m³ y el libro dice ${r3(r.descuadre.libroM3)} m³. Manda el libro.`,
    });
  }
  return { nombre: HOJA_QUE_SE_EXPORTO_PRODUCTOS, filas };
}

/** Las hojas, en el orden de las pestañas de la pantalla. */
export function hojasDeProductos(e: EntradaExcelProductos): HojaExcel[] {
  const et = e.etiquetaProducto;
  return [
    hojaDeGrupos(e.filas, "permiso", et),
    hojaDeGrupos(e.filas, "especie", et),
    hojaDeGrupos(e.filas, "producto", et),
    hojaDePaquetes(e.paquetes, et),
    hojaQueSeExporto(e),
  ];
}

/** `productos-disponibles-2026-09-27.xlsx` (día de Lima, no UTC). */
export function nombreArchivoProductos(ahora: Date): string {
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return `productos-disponibles-${dia}.xlsx`;
}

// ── CSV de «lo que ves» (la tabla de paquetes, con sus columnas prendidas) ────

/** Qué columnas opcionales están prendidas en la tabla (las mismas claves que su menú). */
export interface ColumnasCsv {
  presentacion: boolean;
  medidas: boolean;
  lote: boolean;
  pieTablar: boolean;
  edad: boolean;
  valor: boolean;
  permiso: boolean;
}

/**
 * La tabla tal como se ve, a CSV (`disponibles-csv`, con su fila TOTAL). Un CSV
 * que no coincide con la pantalla obliga a revisar cuál de los dos miente.
 */
export function csvDeProductos(
  filas: readonly FilaProducto[],
  cols: ColumnasCsv,
  etiquetaProducto: (v: string) => string = (v) => v,
): string {
  const si = (on: boolean, claves: (keyof FilaDisponibleCsv)[]) => (on ? claves : []);
  const columnas: (keyof FilaDisponibleCsv)[] = [
    "codigo",
    "producto",
    "especie",
    ...si(cols.presentacion, ["presentacion"]),
    ...si(cols.medidas, ["espesorCm", "anchoCm", "largoM"]),
    "piezas",
    "volumenM3",
    ...si(cols.pieTablar, ["pieTablar"]),
    ...si(cols.lote, ["corrida", "lote"]),
    "saldoCorridaM3",
    ...si(cols.edad, ["diasParado"]),
    ...si(cols.valor, ["valorSoles"]),
    ...si(cols.permiso, ["permiso"]),
    "gtf",
    "apartadoPara",
    "estado",
  ];
  return disponiblesACsv(
    filas.map((f) => ({
      codigo: f.paquete?.codigo ?? "",
      producto: etiquetaProducto(f.producto),
      especie: f.corrida.especie ?? "",
      presentacion: f.paquete?.presentacion ?? f.corrida.presentacion ?? "",
      espesorCm: f.paquete?.espesorCm ?? null,
      anchoCm: f.paquete?.anchoCm ?? null,
      largoM: f.paquete?.largoM ?? null,
      piezas: f.piezas,
      volumenM3: f.volumenM3,
      pieTablar: ptDe(f.volumenM3),
      corrida: f.corrida.lineNo != null ? `N° ${f.corrida.lineNo}` : "",
      lote: f.corrida.lote ?? "",
      permiso: (f.corrida.titularOrigen ?? []).join(" · "),
      gtf: (f.corrida.gtfOrigen ?? []).join(" · "),
      saldoCorridaM3: f.corrida.disponible,
      diasParado: f.dias,
      valorSoles: f.valorSoles,
      apartadoPara: f.apartado?.para ?? null,
      estado: f.corrida.usadoAt ? "Marcado como usado" : f.apartado ? "Apartado" : "Disponible",
    })),
    { columnas },
  );
}

// ── Los filtros puestos, escritos como se leen ───────────────────────────────

/** Para los chips de la pantalla y la hoja «Qué se exportó». */
export function filtrosEnTexto(
  f: FiltroProductos,
  etiquetaProducto: (v: string) => string = (v) => v,
): { id: keyof FiltroProductos; label: string; texto: string }[] {
  const out: { id: keyof FiltroProductos; label: string; texto: string }[] = [];
  if (f.texto.trim()) out.push({ id: "texto", label: "Búsqueda", texto: `«${f.texto.trim()}»` });
  if (f.permiso.length) out.push({ id: "permiso", label: "Permiso", texto: f.permiso.join(" o ") });
  if (f.especie.length) out.push({ id: "especie", label: "Especie", texto: f.especie.join(" o ") });
  if (f.producto.length)
    out.push({ id: "producto", label: "Producto", texto: f.producto.map(etiquetaProducto).join(" o ") });
  if (f.estado.length)
    out.push({
      id: "estado",
      label: "Estado",
      /* Los tres = el tilde «ver también lo marcado como usado». */
      texto:
        f.estado.length === ESTADOS_PRODUCTO.length
          ? "todo, con lo marcado usado"
          : f.estado.map((e) => ETIQUETA_ESTADO_PRODUCTO[e]).join(" o "),
    });
  if (f.tramos.length)
    out.push({ id: "tramos", label: "Días parado", texto: f.tramos.map((t) => ETIQUETA_TRAMO[t]).join(" o ") });
  return out;
}
