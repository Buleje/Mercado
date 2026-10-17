/**
 * Los autofiltros de encabezado de las tablas del Libro TH (vista Plan, mapa y
 * rentabilidad): una definición por tabla, todas sobre filas que ya viven
 * enteras en el cliente. Texto = código/nombre que se tipea; multi = lista
 * corta que se elige; rango = números. Ver `filtros-tabla-forestal`.
 */

import type { CascadaEspecie } from "@/lib/forestal/loth-saldo-cascada";
import type { CosteoRow } from "@/lib/forestal/loth-constants";
import type { PoaEspecieRow } from "@/lib/forestal/loth-poa";
import type { LineaPlanTala } from "@/lib/forestal/loth-plan-tala";
import type { FilaPunto, FilaRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import type { ZafraMes } from "@/lib/forestal/loth-zafra";
import type { ColumnaFiltro } from "./filtros-tabla-forestal";
import type { FilaCoordenada } from "./loth-mapa-coordenadas";
import type { FilaRendimiento } from "./loth-rentabilidad-datos";
import type { Species } from "./loth-plan-shared";

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ── Plan: especies autorizadas (editar) ───────────────────────────────── */
export const COLUMNAS_PLAN_ESPECIES: ColumnaFiltro<Species>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (s) => s.speciesCommon },
  { id: "vol", label: "Vol. autoriz.", tipo: "rango", numero: (s) => num(s.volumenAutorizadoM3), unidad: "m³", paso: 10 },
  { id: "arboles", label: "N° árb.", tipo: "rango", numero: (s) => s.arbolesAutorizados, paso: 10 },
  { id: "anio", label: "Año", tipo: "rango", numero: (s) => s.anioInstalacion, paso: 1 },
  { id: "sup", label: "Sup. ha", tipo: "rango", numero: (s) => num(s.superficieHa), unidad: "ha", paso: 1 },
  { id: "precio", label: "Precio/m³", tipo: "rango", numero: (s) => num(s.precioVentaSoles), unidad: "S/", paso: 50 },
  { id: "ven", label: "VEN/m³", tipo: "rango", numero: (s) => num(s.valorEstadoNaturalSoles), unidad: "S/", paso: 5 },
];

/* ── Plan: registro de plantación (especie + su cascada) ───────────────── */
export interface FilaPlantacion { s: Species; c: CascadaEspecie | null }
export const COLUMNAS_PLANTACION: ColumnaFiltro<FilaPlantacion>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (f) => f.s.speciesCommon },
  { id: "arboles", label: "Árboles", tipo: "rango", numero: (f) => f.s.arbolesAutorizados, paso: 10 },
  { id: "anio", label: "Año", tipo: "rango", numero: (f) => f.s.anioInstalacion, paso: 1 },
  { id: "sup", label: "Sup. ha", tipo: "rango", numero: (f) => num(f.s.superficieHa), unidad: "ha", paso: 1 },
  { id: "registrado", label: "Registrado", tipo: "rango", numero: (f) => num(f.s.volumenAutorizadoM3), unidad: "m³", paso: 10 },
  { id: "talado", label: "Talado", tipo: "rango", numero: (f) => f.c?.taladoM3, unidad: "m³", paso: 10 },
  { id: "enPie", label: "En pie", tipo: "rango", numero: (f) => f.c?.enPieM3, unidad: "m³", paso: 10 },
  { id: "sinTrozar", label: "Sin trozar", tipo: "rango", numero: (f) => f.c?.taladoSinTrozarM3, unidad: "m³", paso: 10 },
  { id: "enPatio", label: "En patio", tipo: "rango", numero: (f) => f.c?.enPatioM3, unidad: "m³", paso: 10 },
  { id: "despachado", label: "Despachado", tipo: "rango", numero: (f) => f.c?.despachadoM3, unidad: "m³", paso: 10 },
  { id: "pct", label: "% talado", tipo: "rango", numero: (f) => f.c?.pctTalado, unidad: "%", paso: 10 },
];

/* ── Plan: cuadro del POA por especie ──────────────────────────────────── */
export const COLUMNAS_POA: ColumnaFiltro<PoaEspecieRow>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (e) => e.especie },
  { id: "dmc", label: "DMC", tipo: "rango", numero: (e) => e.dmcCm, unidad: "cm", paso: 5 },
  { id: "censados", label: "Censados", tipo: "rango", numero: (e) => e.censados, paso: 10 },
  { id: "sobreDmc", label: "≥ DMC", tipo: "rango", numero: (e) => e.sobreDmc, paso: 10 },
  { id: "bajoDmc", label: "Bajo DMC", tipo: "rango", numero: (e) => e.bajoDmc, paso: 10 },
  { id: "semilleros", label: "Semilleros", tipo: "rango", numero: (e) => e.semilleros, paso: 1 },
  { id: "aprovechables", label: "Aprovech.", tipo: "rango", numero: (e) => e.aprovechables, paso: 10 },
  { id: "volumen", label: "Vol. aprov.", tipo: "rango", numero: (e) => e.volumenAprovechableM3, unidad: "m³", paso: 10 },
  { id: "autorizado", label: "Autorizado", tipo: "rango", numero: (e) => e.volumenAutorizadoM3, unidad: "m³", paso: 10 },
];

/* ── Zafra: cronograma mensual ─────────────────────────────────────────── */
export const ESTADO_MES = (m: ZafraMes) => (m.actual ? "En curso" : m.transcurrido ? "Transcurrido" : "Por venir");
export const COLUMNAS_ZAFRA: ColumnaFiltro<ZafraMes>[] = [
  { id: "mes", label: "Mes", tipo: "multi", valor: (m) => m.label },
  { id: "metaMes", label: "Meta del mes", tipo: "rango", numero: (m) => m.metaMesM3, unidad: "m³", paso: 10 },
  { id: "metaAcum", label: "Meta acumulada", tipo: "rango", numero: (m) => m.metaAcumuladaM3, unidad: "m³", paso: 10 },
  { id: "estado", label: "Estado", tipo: "multi", valor: ESTADO_MES },
];

/* ── Qué talar para no perder saldo ────────────────────────────────────── */
export interface FilaTala { n: number; l: LineaPlanTala }
export const COLUMNAS_TALA: ColumnaFiltro<FilaTala>[] = [
  { id: "codigo", label: "Código", tipo: "texto", valor: (f) => f.l.arbol.treeCode },
  { id: "especie", label: "Especie", tipo: "multi", valor: (f) => f.l.arbol.especie },
  { id: "volumen", label: "Volumen", tipo: "rango", numero: (f) => f.l.arbol.volumenM3, unidad: "m³", paso: 1 },
  { id: "acumulado", label: "Acumulado", tipo: "rango", numero: (f) => f.l.acumuladoM3, unidad: "m³", paso: 10 },
  {
    id: "donde",
    label: "Dónde",
    tipo: "multi",
    valor: (f) => [f.l.arbol.parcela, f.l.arbol.utmX == null || f.l.arbol.utmY == null ? "sin GPS" : null].filter((x): x is string => Boolean(x)),
  },
];

/* ── Mapa: cuadro de coordenadas del polígono ──────────────────────────── */
export const COLUMNAS_VERTICES: ColumnaFiltro<FilaCoordenada>[] = [
  { id: "vertice", label: "Vértice", tipo: "texto", valor: (r) => r.code },
  { id: "este", label: "Este (m)", tipo: "rango", numero: (r) => r.este, unidad: "m", paso: 100 },
  { id: "norte", label: "Norte (m)", tipo: "rango", numero: (r) => r.norte, unidad: "m", paso: 100 },
  { id: "lado", label: "Lado (m)", tipo: "rango", numero: (r) => r.lado, unidad: "m", paso: 10 },
  { id: "azimut", label: "Azimut", tipo: "rango", numero: (r) => r.azimut, unidad: "°", paso: 10 },
];

/* ── Mapa: rutas y puntos ──────────────────────────────────────────────── */
const coord = (c: { zona: string; este: number; norte: number }) => `${c.zona} E ${Math.round(c.este)} N ${Math.round(c.norte)}`;
export const COLUMNAS_RUTAS: ColumnaFiltro<FilaRuta>[] = [
  { id: "ruta", label: "Ruta", tipo: "texto", valor: (r) => [r.nombre, r.tipoLabel] },
  { id: "largo", label: "Largo", tipo: "rango", numero: (r) => r.largoM, unidad: "m", paso: 100 },
  { id: "pendiente", label: "Pend. máx.", tipo: "rango", numero: (r) => r.pendienteMaxPct, unidad: "%", paso: 5 },
  { id: "inicio", label: "Inicio", tipo: "texto", valor: (r) => coord(r.inicio) },
  { id: "fin", label: "Fin", tipo: "texto", valor: (r) => coord(r.fin) },
];
export const COLUMNAS_PUNTOS: ColumnaFiltro<FilaPunto>[] = [
  { id: "punto", label: "Punto", tipo: "texto", valor: (p) => p.nombre },
  { id: "tipo", label: "Tipo", tipo: "multi", valor: (p) => p.tipoLabel },
  { id: "coordenada", label: "Coordenada", tipo: "texto", valor: (p) => coord(p.punto) },
];

/* ── Rentabilidad: margen y rendimiento por especie ───────────────────── */
export const COLUMNAS_MARGEN: ColumnaFiltro<CosteoRow>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (r) => r.species },
  { id: "movilizado", label: "Movilizado", tipo: "rango", numero: (r) => r.movilizadoM3, unidad: "m³", paso: 10 },
  { id: "precio", label: "Precio/m³", tipo: "rango", numero: (r) => r.precioVentaM3, unidad: "S/", paso: 50 },
  { id: "costo", label: "Costo/m³", tipo: "rango", numero: (r) => r.costoTotalM3, unidad: "S/", paso: 50 },
  { id: "margenM3", label: "Margen/m³", tipo: "rango", numero: (r) => r.margenM3, unidad: "S/", paso: 50 },
  { id: "margen", label: "Margen total", tipo: "rango", numero: (r) => r.margen, unidad: "S/", paso: 500 },
];
export const COLUMNAS_RENDIMIENTO: ColumnaFiltro<FilaRendimiento>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (s) => s.species },
  { id: "rend", label: "Rendimiento", tipo: "rango", numero: (s) => (s.taladoM3 > 0 ? s.rendimientoPct : null), unidad: "%", paso: 5 },
  { id: "merma", label: "Merma", tipo: "rango", numero: (s) => (s.taladoM3 > 0 ? s.mermaM3 : null), unidad: "m³", paso: 1 },
  { id: "valor", label: "Valor movilizado", tipo: "rango", numero: (s) => s.valorMovilizado, unidad: "S/", paso: 500 },
];
