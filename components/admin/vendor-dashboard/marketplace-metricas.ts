/**
 * Cifras de los gráficos de la pestaña Marketplace del Inicio
 * (`MarketplaceAdvancedCharts`).
 *
 * 2026-10-09: movidas TAL CUAL desde el componente (mismas ventanas, mismos
 * estados, mismas sumas y redondeos). Lo nuevo es sólo de presentación:
 *  - qué gráfico tiene algo que mostrar (`queSeMuestra`, regla única de
 *    `lib/admin/inicio/hay-datos`);
 *  - rótulos escritos a mano (meses y días), sin `Intl`;
 *  - el pico del mapa horario (celda y día con más pedidos) sobre la misma matriz.
 */

import { algunDato, hayDatosEnSerie, hayFilas, hayTendencia, modoRanking, type ModoRanking } from "@/lib/admin/inicio/hay-datos";
import { DIAS_SEMANA, MESES_CORTOS } from "@/lib/admin/inicio/formato-tablero";
import type { VendorDashboardData } from "./vendor-dashboard.types";

export type PedidoMarketplace = {
  id: string | number;
  createdAt: string;
  total: number;
  status: string;
  items: Array<{ id: number | string; name?: string; quantity: number; price?: number }>;
};
export type ResenaMarketplace = { rating: number; date?: string };
export type ProductoMarketplace = { id: number | string; name: string; price: number };

const DIA_MS = 24 * 60 * 60 * 1000;

/** «setiembre» como se escribe en Perú; a mano para no depender del ICU. */
export const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
] as const;

/** «lun», «mié», «sáb»: primeras tres letras del día escrito a mano. */
export function diaCorto(diaSemana: number): string {
  return (DIAS_SEMANA[diaSemana] ?? "").slice(0, 3);
}

// ── 1. Embudo de pedidos (30 días) ────────────────────────────────────────
export function embudoDePedidos(orders: PedidoMarketplace[], nowMs: number) {
  const last30 = nowMs - 30 * DIA_MS;
  const recent = orders.filter((o) => new Date(o.createdAt).getTime() >= last30);
  const recibidos = recent.length;
  const confirmados = recent.filter((o) => ["confirmado", "en_camino", "entregado"].includes(o.status)).length;
  const enCamino = recent.filter((o) => ["en_camino", "entregado"].includes(o.status)).length;
  const entregados = recent.filter((o) => o.status === "entregado").length;
  const cancelados = recent.filter((o) => o.status === "cancelado").length;
  const pct = (n: number) => (recibidos > 0 ? Math.round((n / recibidos) * 100) : 0);
  const data = [
    { etapa: "Recibidos", cantidad: recibidos, pct: 100 },
    { etapa: "Confirmados", cantidad: confirmados, pct: pct(confirmados) },
    { etapa: "En camino", cantidad: enCamino, pct: pct(enCamino) },
    { etapa: "Entregados", cantidad: entregados, pct: pct(entregados) },
  ];
  const conversion = pct(entregados);
  return { data, recibidos, entregados, cancelados, conversion };
}

// ── 2. Ingresos de los últimos 6 meses (entregados) ───────────────────────
export function ingresosPorMes(orders: PedidoMarketplace[], ahora: Date) {
  const rows: Array<{ mes: string; mesLargo: string; ingresos: number; pedidos: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    const mEnd = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 0, 23, 59, 59);
    const period = orders.filter(
      (o) => o.status === "entregado" && new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd,
    );
    const ingresos = period.reduce((s, o) => s + Number(o.total ?? 0), 0);
    rows.push({
      mes: MESES_CORTOS[mStart.getMonth()],
      mesLargo: `${MESES_LARGOS[mStart.getMonth()]} ${mStart.getFullYear()}`,
      ingresos: Math.round(ingresos),
      pedidos: period.length,
    });
  }
  const total = rows.reduce((s, r) => s + r.ingresos, 0);
  const prom = total / Math.max(1, rows.length);
  const pedidos = rows.reduce((s, r) => s + r.pedidos, 0);
  const best = [...rows].sort((a, b) => b.ingresos - a.ingresos)[0];
  return { rows, total, prom, pedidos, best };
}

// ── 3. Más vendidos (entregados, 30 días) ────────────────────────────────
export function masVendidos(orders: PedidoMarketplace[], products: ProductoMarketplace[], nowMs: number) {
  const last30 = nowMs - 30 * DIA_MS;
  const m = new Map<string | number, { name: string; pedidos: number; unidades: number; ingresos: number }>();
  orders
    .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
    .forEach((o) =>
      o.items.forEach((it) => {
        const p = products.find((x) => x.id === it.id);
        const cur = m.get(it.id) ?? { name: p?.name ?? it.name ?? "—", pedidos: 0, unidades: 0, ingresos: 0 };
        cur.pedidos += 1;
        cur.unidades += it.quantity;
        cur.ingresos += (it.price ?? p?.price ?? 0) * it.quantity;
        m.set(it.id, cur);
      }),
    );
  // Antes el nombre se cortaba a 14 letras acá; ahora va entero y lo corta el eje.
  const rows = Array.from(m.values())
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 10)
    .map((r) => ({ producto: r.name, ingresos: Math.round(r.ingresos), unidades: r.unidades }));
  const sumaTop = rows.reduce((s, r) => s + r.ingresos, 0);
  return { rows, sumaTop, maxIngresos: rows[0]?.ingresos ?? 0 };
}

// ── 4. Reseñas (todas) ────────────────────────────────────────────────────
export function distribucionResenas(reviews: ResenaMarketplace[]) {
  const arr = [5, 4, 3, 2, 1].map((r) => ({
    estrellas: r,
    cantidad: reviews.filter((rv) => Math.round(rv.rating) === r).length,
  }));
  const total = arr.reduce((s, x) => s + x.cantidad, 0);
  const promedio = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const buenos = arr.filter((x) => x.estrellas >= 4).reduce((s, x) => s + x.cantidad, 0);
  const malos = arr.filter((x) => x.estrellas <= 2).reduce((s, x) => s + x.cantidad, 0);
  return { arr, total, promedio, buenos, malos };
}

// ── 5. Esta semana vs la pasada (entregados, por día) ─────────────────────
export function semanaContraLaPasada(orders: PedidoMarketplace[], nowMs: number) {
  const buckets = Array.from({ length: 7 }).map(() => ({ dia: "", current: 0, previous: 0, hoy: false }));
  const curStart = nowMs - 7 * DIA_MS;
  const prevStart = nowMs - 14 * DIA_MS;
  orders
    .filter((o) => o.status === "entregado")
    .forEach((o) => {
      const t = new Date(o.createdAt).getTime();
      if (t >= curStart) {
        const daysAgo = Math.floor((nowMs - t) / DIA_MS);
        if (daysAgo < 0 || daysAgo >= 7) return;
        buckets[6 - daysAgo].current += Number(o.total ?? 0);
      } else if (t >= prevStart) {
        const daysAgo = Math.floor((curStart - t) / DIA_MS);
        if (daysAgo < 0 || daysAgo >= 7) return;
        buckets[6 - daysAgo].previous += Number(o.total ?? 0);
      }
    });
  const today = new Date(nowMs);
  buckets.forEach((r, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    r.dia = i === 6 ? "Hoy" : diaCorto(d.getDay());
    r.hoy = i === 6;
    r.current = Math.round(r.current);
    r.previous = Math.round(r.previous);
  });
  const actual = buckets.reduce((s, b) => s + b.current, 0);
  const anterior = buckets.reduce((s, b) => s + b.previous, 0);
  return { rows: buckets, actual, anterior };
}

// ── 6. Mapa franja × día (entregados, 30 días) ────────────────────────────
export const FRANJAS = [
  { label: "Madrugada", range: [0, 5] },
  { label: "Mañana", range: [6, 11] },
  { label: "Mediodía", range: [12, 14] },
  { label: "Tarde", range: [15, 18] },
  { label: "Noche", range: [19, 23] },
] as const;
/** Lunes primero, como se lee la semana en la bodega. */
export const DIAS_MAPA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;
const DIAS_MAPA_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

export function mapaHorario(orders: PedidoMarketplace[], nowMs: number) {
  const last30 = nowMs - 30 * DIA_MS;
  const matrix = FRANJAS.map(() => [0, 0, 0, 0, 0, 0, 0]);
  orders
    .filter((o) => o.status === "entregado" && new Date(o.createdAt).getTime() >= last30)
    .forEach((o) => {
      const d = new Date(o.createdAt);
      const dow = (d.getDay() + 6) % 7;
      const h = d.getHours();
      const bi = FRANJAS.findIndex(({ range }) => h >= range[0] && h <= range[1]);
      if (bi < 0) return;
      matrix[bi][dow] += 1;
    });
  const max = Math.max(1, ...matrix.flat());
  const total = matrix.flat().reduce((s, v) => s + v, 0);
  // Pico = la celda con más pedidos (antes sólo la franja, sin el día).
  let pico = { franja: -1, dia: -1, valor: 0 };
  matrix.forEach((fila, fi) =>
    fila.forEach((v, di) => {
      if (v > pico.valor) pico = { franja: fi, dia: di, valor: v };
    }),
  );
  const porDia = DIAS_MAPA.map((_, di) => matrix.reduce((s, fila) => s + fila[di], 0));
  const diaFuerte = porDia.reduce((best, v, i) => (v > porDia[best] ? i : best), 0);
  return {
    matrix,
    max,
    total,
    pico,
    picoTexto: pico.franja >= 0 ? `${FRANJAS[pico.franja].label} del ${DIAS_MAPA[pico.dia]}` : null,
    diaFuerte: porDia[diaFuerte] > 0 ? { nombre: DIAS_MAPA_LARGOS[diaFuerte], pedidos: porDia[diaFuerte] } : null,
  };
}

/**
 * Qué gráfico tiene algo que decir (regla R2 del Inicio):
 *  - embudo: al menos 2 etapas con pedidos (sólo «Recibidos» no es un embudo);
 *  - ingresos por mes y semana vs semana: tendencia = 2 puntos con valor;
 *  - más vendidos: oculto / lista corta (1-2) / barras (3+);
 *  - reseñas: alguna reseña;
 *  - mapa horario: al menos 2 celdas con pedidos (1 celda no muestra un patrón).
 */
export function queSeMuestra(c: {
  embudo: ReturnType<typeof embudoDePedidos>;
  mensual: ReturnType<typeof ingresosPorMes>;
  top: ReturnType<typeof masVendidos>;
  resenas: ReturnType<typeof distribucionResenas>;
  semana: ReturnType<typeof semanaContraLaPasada>;
  mapa: ReturnType<typeof mapaHorario>;
}): {
  embudo: boolean;
  mensual: boolean;
  top: ModoRanking;
  resenas: boolean;
  semana: boolean;
  mapa: boolean;
} {
  return {
    embudo: hayDatosEnSerie(c.embudo.data, ["cantidad"], { minPuntos: 2 }),
    mensual: hayTendencia(c.mensual.rows, ["ingresos"]),
    top: modoRanking(c.top.rows, "ingresos"),
    resenas: c.resenas.total > 0,
    semana: hayTendencia(c.semana.rows, ["current", "previous"]),
    mapa: hayDatosEnSerie(
      c.mapa.matrix.flat().map((v) => ({ v })),
      ["v"],
      { minPuntos: 2 },
    ),
  };
}

/**
 * ¿La pestaña Marketplace tiene algo que mostrar? (regla R1). false → sólo el
 * paiche. El stock bajo solo no cuenta: es inventario, no actividad.
 */
export function hayActividadMarketplace(data: VendorDashboardData, pedidos: readonly unknown[], resenas: readonly unknown[]): boolean {
  const k = data.kpis;
  return algunDato([
    k.salesToday,
    k.salesYesterday,
    k.salesLastWeek,
    k.pendingOrdersCount,
    hayFilas(data.pendingOrders),
    hayFilas(data.recentSales),
    hayDatosEnSerie(data.weeklyRevenue, ["total"]),
    hayFilas(pedidos),
    hayFilas(resenas),
  ]);
}
