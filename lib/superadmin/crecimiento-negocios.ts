/**
 * Lógica pura de las pantallas «Crecimiento» y «Activación» del superadmin.
 *
 * Un aserradero (Blas) no tiene pedidos de tienda: trabaja con el libro CTP,
 * las trozas, los lotes y las guías. Estas funciones deciden qué perfil tiene
 * un negocio (por sus datos, no por el rubro, que en Blas figura como bodega)
 * y qué pasos de arranque le corresponden. Sin acceso a base: las consultas
 * viven en `lib/db/crecimiento-negocios.db.ts`.
 */

export const PASOS_TIENDA = ["logo", "productos", "pedido", "venta"] as const;
export const PASOS_ASERRADERO = ["logo", "ingreso", "libro", "lote", "guia"] as const;

export type Perfil = "tienda" | "aserradero";

/** «Hay al menos uno» de cada hito, ya filtrado (sin anulados ni borrados). */
export type HechosDeNegocio = {
  productos: boolean;
  pedidos: boolean;
  ventas: boolean;
  libroCtp: boolean;
  trozas: boolean;
  lotes: boolean;
  gtfIngreso: boolean;
  gtfSalida: boolean;
};

export type Arranque = {
  perfil: Perfil;
  pasos: string[];
  steps: Record<string, boolean>;
  done: number;
  total: number;
  pct: number;
  stuckAt: string | null;
  complete: boolean;
};

/**
 * Aserradero = tiene movimiento forestal y NINGÚN pedido de tienda. Con un solo
 * pedido pasa a «tienda» (el panel de QA de `main` tiene libro de prueba y
 * pedidos: sigue siendo una tienda).
 */
export function perfilDeNegocio(h: Partial<HechosDeNegocio>): Perfil {
  const forestal = !!(h.libroCtp || h.trozas || h.lotes || h.gtfIngreso || h.gtfSalida);
  return forestal && !h.pedidos ? "aserradero" : "tienda";
}

export function calcularArranque(perfil: Perfil, h: HechosDeNegocio, tieneLogo: boolean): Arranque {
  const pasos: string[] = perfil === "aserradero" ? [...PASOS_ASERRADERO] : [...PASOS_TIENDA];
  const hechos: Record<string, boolean> = perfil === "aserradero"
    ? { logo: tieneLogo, ingreso: h.trozas || h.gtfIngreso, libro: h.libroCtp, lote: h.lotes, guia: h.gtfSalida }
    : { logo: tieneLogo, productos: h.productos, pedido: h.pedidos, venta: h.ventas };
  const steps: Record<string, boolean> = {};
  for (const p of pasos) steps[p] = !!hechos[p];
  const done = pasos.filter((p) => steps[p]).length;
  return {
    perfil,
    pasos,
    steps,
    done,
    total: pasos.length,
    pct: Math.round((done / pasos.length) * 100),
    stuckAt: pasos.find((p) => !steps[p]) ?? null,
    complete: done === pasos.length,
  };
}

// ── Crecimiento mensual ──────────────────────────────────────────────────────

const OFFSET_LIMA_H = 5; // Lima = UTC-5 todo el año (sin horario de verano)
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Últimos `n` meses de Lima como «AAAA-MM», del más viejo al actual. */
export function mesesLima(n: number, ahora: Date): string[] {
  const lima = new Date(ahora.getTime() - OFFSET_LIMA_H * 3_600_000);
  const claves: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() - i, 1));
    claves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return claves;
}

/** Instante UTC en que empieza el mes de Lima «AAAA-MM» (00:00 Lima = 05:00 UTC). */
export function inicioDeMesUTC(clave: string): Date {
  const [a, m] = clave.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1, OFFSET_LIMA_H));
}

/** «2026-06» → «jun 26». */
export function etiquetaMes(clave: string): string {
  const [a, m] = clave.split("-").map(Number);
  return `${MESES[m - 1]} ${String(a).slice(2)}`;
}

/** Variación % del último mes contra el anterior (anterior 0 y actual >0 = 100). */
export function variacionPct(anterior: number, actual: number): number {
  if (anterior > 0) return Math.round(((actual - anterior) / anterior) * 100);
  return actual > 0 ? 100 : 0;
}

export type DesgloseOperaciones = { pedidos: number; ventas: number; libroCtp: number; trozas: number };
export type MesDeCrecimiento = {
  month: string;
  revenue: number;
  orders: number;
  operaciones: number;
  desglose: DesgloseOperaciones;
};
/** Fila agregada por la base: un negocio, un mes, una fuente. */
export type FilaMensual = {
  tenantId: string;
  mes: string;
  fuente: keyof DesgloseOperaciones;
  n: number;
  total: number;
};

/** Arma los meses de UN negocio. Los meses sin movimiento quedan en cero. */
export function armarMesesDeNegocio(claves: string[], filas: FilaMensual[]): MesDeCrecimiento[] {
  return claves.map((clave) => {
    const desglose: DesgloseOperaciones = { pedidos: 0, ventas: 0, libroCtp: 0, trozas: 0 };
    let revenue = 0;
    for (const f of filas) {
      if (f.mes !== clave) continue;
      desglose[f.fuente] += f.n;
      if (f.fuente === "pedidos") revenue += f.total;
    }
    return {
      month: etiquetaMes(clave),
      revenue: Math.round(revenue * 100) / 100,
      orders: desglose.pedidos,
      operaciones: desglose.pedidos + desglose.ventas + desglose.libroCtp + desglose.trozas,
      desglose,
    };
  });
}
