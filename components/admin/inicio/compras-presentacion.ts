import { fechaConDia, fechaCorta, MESES_CORTOS, partesDeFecha } from "@/lib/admin/inicio/formato-tablero";
import { formatNumber } from "@/lib/format";

/**
 * Pestaña Compras del Inicio: la forma de los datos y las series que dibujan
 * `ComprasDashboard`, `ComprasCharts` y `ComprasAdvancedCharts`. Vive aparte
 * para que los gráficos (cargados con `dynamic`) no importen el tablero entero
 * y para probar las series sin montar nada.
 *
 * Sólo presentación (Brandon 2026-10-09): ordena y rellena lo que ya se sumó;
 * no cambia qué compra cuenta ni cuánto.
 */

/** `type` (no `interface`): los gráficos del DS piden `Record<string, …>`. */
export type FilaSerie = {
  /** «2026-10-09» (día) o el lunes de la semana. */
  clave: string;
  /** «09 oct». */
  etiqueta: string;
  total: number;
};

/** `type` (no `interface`): los gráficos del DS piden `Record<string, …>`. */
export type FilaMes = {
  /** «2026-10». */
  clave: string;
  /** «oct» (o «oct 2025» si la serie cruza de año). */
  etiqueta: string;
  /** «octubre» (o «octubre 2025»), para las cifras. */
  nombre: string;
  total: number;
  /** El mismo mes, un año antes. */
  anterior: number;
};

export interface Tramo {
  n: number;
  monto: number;
}

/** La deuda por urgencia; cada cuenta cae en UN tramo (antes «Vencido» se sumaba encima de «Pendiente»). */
export interface TramosDeuda {
  vencido: Tramo;
  urgente: Tramo;
  pendiente: Tramo;
}

export interface CuentaPorPagar {
  nombre: string;
  monto: number;
  diasRestantes: number;
  /** Fecha de vencimiento (ISO). */
  vence: string;
  status: "vencido" | "urgente" | "pendiente";
}

export interface ComprasData {
  // KPIs
  totalCompras: number;
  cantidadOrdenes: number;
  totalProveedores: number;
  /** Proveedores distintos con compras en el período. */
  proveedoresActivos: number;
  deudaPendiente: number;
  cuentasVencidas: number;
  promedioOrden: number;
  // Deltas
  dCompras: number | null;
  // Gráficos
  comprasPorProveedor: { nombre: string; total: number; ordenes: number }[];
  /** Todo el rango con los días sin compra en 0 (semana por semana si pasa de 62 días). */
  serie: { granularidad: "dia" | "semana"; filas: FilaSerie[] };
  tramosDeuda: TramosDeuda;
  cuentasPorVencer: CuentaPorPagar[];
  topProveedores: { nombre: string; total: number; ordenes: number }[];
  /** 12 meses (sin los primeros vacíos) con el mismo mes del año anterior. */
  comprasMensuales: FilaMes[];
}

const DIA_MS = 86_400_000;
/** Meses escritos a mano (no `Intl`: cambia con la versión de ICU). */
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
] as const;
/** Hasta este largo el rango se dibuja día por día; más largo (el año), por semana. */
export const MAX_DIAS_POR_DIA = 62;
/** Tope de días que se recorren (un rango personalizado de varios años). */
const MAX_DIAS_RANGO = 800;

const dos = (n: number) => String(n).padStart(2, "0");
const centimos = (n: number) => Math.round(n * 100) / 100;

function claveDeFecha(v: string | Date): string | null {
  const p = partesDeFecha(v);
  return p ? `${p.anio}-${dos(p.mes)}-${dos(p.dia)}` : null;
}

/** Fecha sin hora → ms UTC (aritmética de días sin husos ni horario de verano). */
function utc(clave: string): number {
  const [a, m, d] = clave.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function claveUtc(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
}

function lunesDe(clave: string): string {
  const t = utc(clave);
  const dow = new Date(t).getUTCDay(); // 0 = domingo
  return claveUtc(t - ((dow + 6) % 7) * DIA_MS);
}

/**
 * Compras del rango, día por día con los días sin compra en 0 (así el eje es
 * el calendario y no sólo los días con compras), o por semana si el rango pasa
 * de {@link MAX_DIAS_POR_DIA} días.
 */
export function serieDelRango(
  compras: readonly { total: number; createdAt?: string }[],
  from: Date,
  to: Date,
): ComprasData["serie"] {
  const desde = claveDeFecha(from);
  const hasta = claveDeFecha(to);
  if (!desde || !hasta) return { granularidad: "dia", filas: [] };
  const dias: string[] = [];
  for (let t = utc(desde); t <= utc(hasta) && dias.length < MAX_DIAS_RANGO; t += DIA_MS) dias.push(claveUtc(t));
  const porSemana = dias.length > MAX_DIAS_POR_DIA;
  const cubeta = (c: string) => (porSemana ? lunesDe(c) : c);

  const totales = new Map<string, number>();
  for (const d of dias) totales.set(cubeta(d), 0);
  for (const p of compras) {
    const c = p.createdAt ? claveDeFecha(p.createdAt) : null;
    if (!c) continue;
    const k = cubeta(c);
    totales.set(k, (totales.get(k) ?? 0) + (Number(p.total) || 0));
  }
  const filas = [...totales]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, total]) => ({ clave, etiqueta: fechaCorta(clave), total: centimos(total) }));
  return { granularidad: porSemana ? "semana" : "dia", filas };
}

/**
 * Compras de los últimos 12 meses (hora de Lima) con el mismo mes del año
 * anterior. Los primeros meses sin compras en ninguno de los dos años se
 * sacan: un negocio que empezó en setiembre no ve diez barras vacías.
 */
export function comprasPorMes(
  compras: readonly { total: number; createdAt?: string }[],
  ahora: Date,
): FilaMes[] {
  const hoy = partesDeFecha(ahora);
  if (!hoy) return [];
  const porMes = new Map<string, number>();
  for (const p of compras) {
    const f = p.createdAt ? partesDeFecha(p.createdAt) : null;
    if (!f) continue;
    const k = `${f.anio}-${dos(f.mes)}`;
    porMes.set(k, (porMes.get(k) ?? 0) + (Number(p.total) || 0));
  }
  const meses: { anio: number; mes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = hoy.anio * 12 + (hoy.mes - 1) - i;
    meses.push({ anio: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  }
  const filas = meses.map(({ anio, mes }) => ({
    anio,
    clave: `${anio}-${dos(mes)}`,
    corto: MESES_CORTOS[mes - 1],
    largo: MESES_LARGOS[mes - 1],
    total: centimos(porMes.get(`${anio}-${dos(mes)}`) ?? 0),
    anterior: centimos(porMes.get(`${anio - 1}-${dos(mes)}`) ?? 0),
  }));
  const primero = filas.findIndex((f) => f.total !== 0 || f.anterior !== 0);
  const visibles = primero < 0 ? [] : filas.slice(primero);
  const cruzaAnio = visibles.length > 0 && visibles[0].anio !== visibles[visibles.length - 1].anio;
  return visibles.map(({ anio, clave, corto, largo, total, anterior }) => ({
    clave,
    etiqueta: cruzaAnio ? `${corto} ${anio}` : corto,
    nombre: cruzaAnio ? `${largo} ${anio}` : largo,
    total,
    anterior,
  }));
}

/** Suma la deuda por tramo de urgencia; cada cuenta, en uno solo. */
export function tramosDeDeuda(cuentas: readonly Pick<CuentaPorPagar, "monto" | "status">[]): TramosDeuda {
  const t: TramosDeuda = {
    vencido: { n: 0, monto: 0 },
    urgente: { n: 0, monto: 0 },
    pendiente: { n: 0, monto: 0 },
  };
  for (const c of cuentas) {
    t[c.status].n += 1;
    t[c.status].monto = centimos(t[c.status].monto + c.monto);
  }
  return t;
}

/**
 * Un vencimiento guardado como fecha sola llega como medianoche UTC
 * («2026-10-15T00:00:00.000Z»): en hora de Lima sería el 14. Se lee el día tal cual.
 */
function diaDeVencimiento(vence: string): string {
  return /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(vence) ? vence.slice(0, 10) : vence;
}

/** «venció hace 3 días» · «venció hoy» · «vence hoy» · «vence mañana» · «vence el jueves 15/10». */
export function cuandoVence(c: Pick<CuentaPorPagar, "diasRestantes" | "vence" | "status">): string {
  if (c.status === "vencido") {
    const d = Math.max(0, -c.diasRestantes);
    return d === 0 ? "venció hoy" : `venció hace ${d} ${d === 1 ? "día" : "días"}`;
  }
  if (c.diasRestantes <= 0) return "vence hoy";
  if (c.diasRestantes === 1) return "vence mañana";
  return `vence el ${fechaConDia(diaDeVencimiento(c.vence))}`;
}

/** Qué parte del total es `parte`, en % (0 si el total es 0). */
export function participacion(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0;
}

/** «70%» · «99.7%» · «<1%» (ni casi todo se redondea a «100%» ni un poco a «0%»). */
export function textoParticipacion(parte: number, total: number): string {
  const pct = participacion(parte, total);
  if (pct > 0 && pct < 0.5) return "<1%";
  const decimales = pct > 99 && pct < 100 ? 1 : 0;
  return `${formatNumber(Math.min(pct, decimales ? 99.9 : 100), decimales)}%`;
}
