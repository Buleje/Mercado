/**
 * Los datos de «Rentabilidad y rendimiento» del Libro TH: la forma de lo que
 * devuelve `GET /api/admin/forestal/plan?analytics=1[&planId=…]` y el CSV que
 * sale de ello.
 *
 * Es UNA sola respuesta para las dos vistas que se fusionaron (Rentabilidad y
 * Analítica): el margen, el flujo bosque→producto y el rendimiento salen del
 * mismo pedido y del mismo plan, así que no pueden decir cifras distintas.
 */

import type { CosteoRowRaw } from "@/lib/forestal/loth-analitica";
import { construirFlujo } from "@/lib/forestal/loth-analitica";

export interface Funnel {
  taladoM3: number;
  trozadoM3: number;
  despachoTrozaM3: number;
  consumidoM3: number;
  productoCantidad: number;
  despachoProductoM3: number;
}

export interface Costeo {
  rows: CosteoRowRaw[];
  ingresoTotal: number;
  costoTotal: number;
  margenTotal: number;
  margenPctTotal: number;
  costoOperativoM3: number;
}

export interface Anomalia {
  level: "error" | "warn";
  code: string;
  message: string;
  species?: string;
}

export interface Analytics {
  hasPlan: boolean;
  plan: {
    id: string;
    planNumber: string | null;
    titularName: string;
    estado: string;
    vigenciaHasta: string | null;
    costos: { extraccionM3: number; transformacionM3: number; fleteM3: number };
  } | null;
  aprovechamiento: {
    funnel: Funnel;
    bySpecies: { species: string; cites: boolean; taladoM3: number; trozadoM3: number; rendimientoPct: number; mermaM3: number }[];
    rendimientoGlobalPct: number;
  };
  balance: {
    rows: { species: string; movilizado: number; saldo: number; valorMovilizado: number }[];
    pagoDerechoTotal: number;
    valorTotal: number;
  } | null;
  anomalias: Anomalia[];
  lateCount: number;
  costeo: Costeo | null;
  especiesNoAutorizadas?: string[];
  /** Sólo con un plan pedido y 2+ planes: las líneas de ESE plan (misma atribución que Extracción). `null` = el libro entero. */
  idsDelPlan?: string[] | null;
  /** Líneas de la cadena que no se pudieron atribuir a ningún plan (no entran en ninguno). */
  sinAtribuir?: { lineas: number; ambiguas: number } | null;
}

/** Un plan del selector. */
export interface PlanOpcion {
  id: string;
  planNumber: string | null;
  titularName: string;
  estado: string;
}

/** «PO 12 · Maderera El Aguajal SAC»: cómo se nombra un plan en el selector. */
export function nombreDePlan(p: Pick<PlanOpcion, "planNumber" | "titularName">): string {
  return p.planNumber ? `${p.planNumber} · ${p.titularName}` : p.titularName;
}

/** Una fila por especie con lo que sólo se ve acá: rendimiento, merma y valor. */
export interface FilaRendimiento {
  species: string;
  cites: boolean;
  taladoM3: number;
  rendimientoPct: number | null;
  mermaM3: number;
  valorMovilizado: number;
}

// ─── Export CSV (BOM UTF-8 para Excel es-PE) ────────────────────────────────
export function buildAnalyticsCsv(d: Analytics): string {
  const rows: (string | number)[][] = [];
  const push = (...cells: (string | number)[]) => rows.push(cells);
  push("Rentabilidad y rendimiento del Libro de Operaciones · Títulos Habilitantes");
  push("Plan", d.plan?.titularName ?? "—", d.plan?.planNumber ?? "");
  push("");
  push("Indicador", "Valor");
  push("Rendimiento de aprovechamiento (%)", d.aprovechamiento.rendimientoGlobalPct);
  push("Valor movilizado (S/)", (d.balance?.valorTotal ?? 0).toFixed(2));
  push("Pago derecho total (S/)", (d.balance?.pagoDerechoTotal ?? 0).toFixed(2));
  push("Anomalías", d.anomalias.length);
  if ((d.especiesNoAutorizadas ?? []).length > 0) push("Especies fuera del plan", (d.especiesNoAutorizadas ?? []).join(" · "));
  push("");
  // El flujo se exporta con el mismo modelo que se dibuja: las dos ramas de la
  // bifurcación van marcadas como tales, no como pasos consecutivos.
  const flujo = construirFlujo(d.aprovechamiento.funnel);
  push("Flujo del aprovechamiento (m³)");
  push("Etapa", "m³", "% del total", "% de su origen");
  flujo.nodos.forEach((n) => push(n.label, n.m3.toFixed(4), n.pctDelTotal, n.pctDelPadre ?? ""));
  if (flujo.mermas.length > 0) {
    push("");
    push("Mermas", "m³", "%");
    flujo.mermas.forEach((m) => push(m.label, m.m3.toFixed(4), m.pct));
  }
  push("");
  push("Rendimiento por especie");
  push("Especie", "Talado m³", "Trozado m³", "Rendimiento %", "Merma m³");
  d.aprovechamiento.bySpecies.forEach((s) =>
    push(s.species, s.taladoM3.toFixed(4), s.trozadoM3.toFixed(4), s.rendimientoPct, s.mermaM3.toFixed(4)));
  if (d.balance) {
    push("");
    push("Valorización y saldo por especie");
    push("Especie", "Movilizado m³", "Saldo m³", "Valor movilizado S/");
    d.balance.rows.forEach((r) =>
      push(r.species, r.movilizado.toFixed(4), r.saldo.toFixed(4), r.valorMovilizado.toFixed(2)));
  }
  if (d.costeo && d.costeo.rows.length > 0) {
    push("");
    push("Costeo y margen por m³");
    push("Especie", "Precio/m³", "Costo/m³", "Margen/m³", "Margen %", "Margen total");
    d.costeo.rows.forEach((c) =>
      push(c.species, c.precioVentaM3.toFixed(2), c.costoTotalM3.toFixed(2), c.margenM3.toFixed(2), c.margenPct, c.margen.toFixed(2)));
    push("TOTAL", "", "", "", d.costeo.margenPctTotal, d.costeo.margenTotal.toFixed(2));
  }
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // BOM UTF-8 explícito para que Excel es-PE lea bien los acentos.
  return "﻿" + rows.map((r) => r.map((c) => esc(String(c))).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
