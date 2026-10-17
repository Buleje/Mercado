/**
 * El alcance de Facturas y boletas (F36): período, búsqueda, tipo, estado y
 * origen. UN objeto que manejan la tabla, los indicadores y el Excel: lo que
 * ves en la tabla es lo que suman las cifras y lo que baja el Excel.
 * Puro (sin React): se prueba solo.
 */
import { esPeriodo, rangoDePeriodo, rotuloDePeriodo, type PeriodoClave } from "@/lib/comprobantes/periodo";
import { STATUS_META, TYPE_META, type DocStatus, type DocType } from "./tipos";

export type OrigenFiltro = "" | "pedido" | "sin-pedido";

export interface FiltrosComprobantes {
  q: string;
  periodo: PeriodoClave;
  tipos: DocType[];
  estados: DocStatus[];
  origen: OrigenFiltro;
}

export const FILTROS_INICIALES: FiltrosComprobantes = { q: "", periodo: "mes", tipos: [], estados: [], origen: "" };

/** Tipos que se pueden filtrar (la base no guarda notas de débito todavía). */
export const TIPOS_FILTRABLES: readonly DocType[] = ["boleta", "factura", "nota-credito", "baja"];
/** «Emitido» no es un estado de SUNAT: era el rótulo de lo desconocido. */
export const ESTADOS_FILTRABLES: readonly DocStatus[] = ["aceptado", "pendiente", "rechazado", "anulado"];

const TIPO_API: Partial<Record<DocType, string>> = { boleta: "boleta", factura: "factura", "nota-credito": "nota_credito", baja: "baja" };
const ESTADO_API: Partial<Record<DocStatus, string[]>> = {
  aceptado: ["accepted"],
  pendiente: ["pending", "retrying"],
  rechazado: ["rejected"],
  anulado: ["voided"],
};

export const ROTULO_ORIGEN: Record<Exclude<OrigenFiltro, "">, string> = { pedido: "De un pedido", "sin-pedido": "Sin pedido" };

/** Los parámetros de `/api/admin/comprobantes/lista` para ese alcance. */
export function aParams(f: FiltrosComprobantes, limite: number): URLSearchParams {
  const p = new URLSearchParams();
  const r = rangoDePeriodo(f.periodo);
  if (r.desde) p.set("desde", r.desde);
  if (r.hasta) p.set("hasta", r.hasta);
  const q = f.q.trim();
  if (q) p.set("q", q.slice(0, 80));
  const tipos = f.tipos.map((t) => TIPO_API[t]).filter((t): t is string => !!t);
  if (tipos.length) p.set("tipo", tipos.join(","));
  const estados = [...new Set(f.estados.flatMap((e) => ESTADO_API[e] ?? []))];
  if (estados.length) p.set("estado", estados.join(","));
  if (f.origen) p.set("origen", f.origen);
  p.set("limite", String(limite));
  return p;
}

export interface ChipFiltro {
  clave: string;
  rotulo: string;
  quitar: (f: FiltrosComprobantes) => FiltrosComprobantes;
}

/** Los filtros puestos, como chips visibles con su «×» (el período sólo si no es el de fábrica). */
export function chipsDe(f: FiltrosComprobantes): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  if (f.periodo !== FILTROS_INICIALES.periodo) {
    chips.push({ clave: "periodo", rotulo: rotuloDePeriodo(f.periodo), quitar: (x) => ({ ...x, periodo: FILTROS_INICIALES.periodo }) });
  }
  if (f.q.trim()) chips.push({ clave: "q", rotulo: `«${f.q.trim()}»`, quitar: (x) => ({ ...x, q: "" }) });
  for (const t of f.tipos) chips.push({ clave: `tipo:${t}`, rotulo: TYPE_META[t].label, quitar: (x) => ({ ...x, tipos: x.tipos.filter((y) => y !== t) }) });
  for (const e of f.estados) chips.push({ clave: `estado:${e}`, rotulo: STATUS_META[e].label, quitar: (x) => ({ ...x, estados: x.estados.filter((y) => y !== e) }) });
  if (f.origen) chips.push({ clave: "origen", rotulo: ROTULO_ORIGEN[f.origen], quitar: (x) => ({ ...x, origen: "" }) });
  return chips;
}

export const esAlcanceInicial = (f: FiltrosComprobantes) => chipsDe(f).length === 0;

/** Nombre corto de una vista guardada: sus chips, o el período. */
export function nombreDeVista(f: FiltrosComprobantes): string {
  const partes = chipsDe(f).filter((c) => c.clave !== "periodo").map((c) => c.rotulo);
  return [...partes, rotuloDePeriodo(f.periodo)].join(" · ").slice(0, 60);
}

/** Lee un alcance guardado (localStorage) sin confiar en su forma. */
export function normalizarFiltros(v: unknown): FiltrosComprobantes | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const tipos = Array.isArray(o.tipos) ? o.tipos.filter((t): t is DocType => TIPOS_FILTRABLES.includes(t as DocType)) : [];
  const estados = Array.isArray(o.estados) ? o.estados.filter((e): e is DocStatus => ESTADOS_FILTRABLES.includes(e as DocStatus)) : [];
  return {
    q: typeof o.q === "string" ? o.q.slice(0, 80) : "",
    periodo: esPeriodo(o.periodo) ? o.periodo : FILTROS_INICIALES.periodo,
    tipos,
    estados,
    origen: o.origen === "pedido" || o.origen === "sin-pedido" ? o.origen : "",
  };
}

/** `?estado=aceptado,pendiente` (de Conciliación o la bandeja) → estados del filtro. */
export function estadosDeParam(v: string | null): DocStatus[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter((s): s is DocStatus => ESTADOS_FILTRABLES.includes(s as DocStatus));
}
