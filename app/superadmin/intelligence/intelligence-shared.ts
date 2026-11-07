// Tipos y formatos de «Inteligencia de Barrio» (compartidos por el cliente y sus secciones).
// Tipos locales: no dependen del backend.

import type { MaderaDemanda } from "./DemandaMaderaSection";

export interface CategoryDemand {
  category: string;
  units: number;
  prevUnits: number;
  trendPct: number;
  rising: boolean;
}

export interface ZoneDemand {
  zone: string;
  units: number;
  topCategory: string | null;
  stockouts: number;
}

export interface StockoutSignal {
  name: string;
  category: string | null;
  tenantCount: number;
}

export interface UnmetDemand {
  category: string;
  trendPct: number;
  stockoutCount: number;
}

export interface DemandReport {
  generatedAt: string;
  period: { label: string; days: number };
  totalUnits: number;
  risingCategories: CategoryDemand[];
  fallingCategories: CategoryDemand[];
  unmetDemand: UnmetDemand[];
  byZone: ZoneDemand[];
  stockoutHotspots: StockoutSignal[];
  /** Madera de los aserraderos (m³ por especie); puede faltar si el servidor es viejo. */
  madera?: MaderaDemanda;
}

// ── Helpers de formato ────────────────────────────────────────────────────────

export function fmtUnits(n: number): string {
  return new Intl.NumberFormat("es-PE").format(n);
}

export function fmtPct(n: number, sign = true): string {
  const prefix = sign && n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(1)}%`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
