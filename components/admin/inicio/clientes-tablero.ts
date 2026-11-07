/**
 * Inicio › Clientes (`?tab=vendor-dashboard&vista=clientes`): las cuentas y qué
 * se muestra. Sin React, para poder probarlo.
 *
 * Las cuentas son las de siempre (movidas tal cual desde `ClientesDashboard` y
 * `ClientesAdvancedCharts` el 2026-10-09). Lo nuevo es sólo presentación:
 *  - el nombre del cliente sale de tu lista de clientes cuando la venta trae
 *    sólo el teléfono (antes el ranking mostraba «987654321»);
 *  - las ventas sin cliente se juntaban como un cliente llamado «anon» y
 *    encabezaban «Quién más te compra»: ya no entran a los rankings;
 *  - `queSeMuestraClientes` / `queSeMuestraAvanzado`: qué gráfico tiene algo que
 *    decir (regla única de `lib/admin/inicio/hay-datos`).
 */
import {
  algunDato,
  hayDatosEnSerie,
  hayFilas,
  hayTendencia,
  modoRanking,
  type ModoRanking,
} from "@/lib/admin/inicio/hay-datos";
import { MESES_CORTOS, cantidad, fechaCorta } from "@/lib/admin/inicio/formato-tablero";
import type { DateRange } from "./DashboardDateRange";

// ── Datos crudos (forma de /api/admin/dashboard) ─────────────────────────────

export interface ClienteCrudo {
  phone: string; name: string; totalSpent: number;
  creditBalance?: number; creditLimit?: number;
  loyaltyPoints?: number; loyaltyTier?: string;
  createdAt?: string; updatedAt?: string;
}
export interface PedidoCrudo {
  id: string | number; customer?: { name?: string; phone?: string };
  items?: { id: number; price: number; quantity: number }[];
  total: number; status: string; createdAt: string;
}
export interface VentaCruda {
  id?: string | number; total: number; customerPhone?: string; createdAt: string;
  items?: { productId: number; price: number; quantity: number }[];
}
export interface ResenaCruda { id?: string; name?: string; rating: number; text?: string; date?: string; productId?: number }

export interface ClientesCrudos {
  customers: ClienteCrudo[];
  orders: PedidoCrudo[];
  sales: VentaCruda[];
  reviews: ResenaCruda[];
}

/** Los que ya te habían comprado (barras apiladas, grupo «Leales»): gris tinta; los nuevos van en azul de clientes. */
export const COLOR_YA_CLIENTES = "var(--data-2)";

/** Clave con la que las cuentas juntan las ventas que no traen cliente. */
export const SIN_CLIENTE = "anon";

export interface ClientesData {
  // KPIs
  totalClientes: number;
  clientesActivos: number;
  nuevos: number;
  recurrentes: number;
  ratingPromedio: number;
  totalResenas: number;
  /** Clientes de tu lista con alguna compra registrada (gasto histórico > 0). */
  clientesConGasto: number;
  // Deltas
  dActivos: number | null;
  dNuevos: number | null;
  // Charts
  topClientes: { telefono: string; nombre: string; gasto: number; pedidos: number }[];
  retencion: { mes: string; nuevos: number; recurrentes: number; total: number }[];
  cohortData: { cohorte: string; m0: number; m1: number; m2: number; m3: number }[];
  distribucionGasto: { rango: string; cantidad: number }[];
  frecuenciaCompra: { frecuencia: string; cantidad: number }[];
  clientesPorDia: { dia: string; clave: string; nuevos: number; activos: number }[];
  distribucionRating: { rating: number; cantidad: number }[];
  ticketPorCliente: { telefono: string; nombre: string; ticket: number; visitas: number }[];
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

/** «oct» · «dic 2025» (el año sólo si no es el de `ref`). Meses escritos a mano. */
export function mesCorto(d: Date, ref: Date): string {
  const mes = MESES_CORTOS[d.getMonth()];
  return d.getFullYear() === ref.getFullYear() ? mes : `${mes} ${d.getFullYear()}`;
}

/** Teléfono → nombre de tu lista de clientes. */
export function mapaDeNombres(customers: readonly ClienteCrudo[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of customers) if (c.phone && c.name?.trim()) m.set(c.phone, c.name.trim());
  return m;
}

/** El nombre a mostrar: el de tu lista si lo hay; si no, el que vino; si no, el teléfono. */
export function nombreDeCliente(telefono: string | undefined, nombre: string | undefined, nombres: Map<string, string>): string {
  if (telefono && nombres.has(telefono)) return nombres.get(telefono)!;
  if (nombre?.trim() && nombre !== telefono) return nombre.trim();
  return telefono || "Cliente sin nombre";
}

// ── Cuentas de la pestaña (las de siempre) ───────────────────────────────────

export function calcularClientes(raw: ClientesCrudos, dateRange: DateRange, now: Date = new Date()): ClientesData {
  const { customers, orders, sales, reviews } = raw;
  const { from, to } = dateRange;
  const nombres = mapaDeNombres(customers);

  // Previous period
  const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
  const prevTo = new Date(from.getTime() - 1);

  // KPIs
  const totalClientes = customers.length;

  // Active = purchased in period
  const periodOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= from && new Date(o.createdAt) <= to);
  const periodSales = sales.filter(s => new Date(s.createdAt) >= from && new Date(s.createdAt) <= to);
  const activePhones = new Set<string>();
  periodOrders.forEach(o => { if (o.customer?.phone) activePhones.add(o.customer.phone); });
  periodSales.forEach(s => { if (s.customerPhone) activePhones.add(s.customerPhone); });
  const clientesActivos = activePhones.size;

  // New vs returning
  const beforePeriodPhones = new Set<string>();
  orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < from).forEach(o => { if (o.customer?.phone) beforePeriodPhones.add(o.customer.phone); });
  sales.filter(s => new Date(s.createdAt) < from).forEach(s => { if (s.customerPhone) beforePeriodPhones.add(s.customerPhone); });
  let nuevos = 0, recurrentes = 0;
  activePhones.forEach(phone => {
    if (beforePeriodPhones.has(phone)) recurrentes++;
    else nuevos++;
  });

  // Previous period actives for delta
  const prevOrders = orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= prevFrom && new Date(o.createdAt) <= prevTo);
  const prevSales = sales.filter(s => new Date(s.createdAt) >= prevFrom && new Date(s.createdAt) <= prevTo);
  const prevActivePhones = new Set<string>();
  prevOrders.forEach(o => { if (o.customer?.phone) prevActivePhones.add(o.customer.phone); });
  prevSales.forEach(s => { if (s.customerPhone) prevActivePhones.add(s.customerPhone); });
  const prevBeforePhones = new Set<string>();
  orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < prevFrom).forEach(o => { if (o.customer?.phone) prevBeforePhones.add(o.customer.phone); });
  sales.filter(s => new Date(s.createdAt) < prevFrom).forEach(s => { if (s.customerPhone) prevBeforePhones.add(s.customerPhone); });
  let prevNuevos = 0;
  prevActivePhones.forEach(phone => { if (!prevBeforePhones.has(phone)) prevNuevos++; });
  const dActivos = prevActivePhones.size === 0 ? null : ((clientesActivos - prevActivePhones.size) / prevActivePhones.size) * 100;
  const dNuevos = prevNuevos === 0 ? null : ((nuevos - prevNuevos) / prevNuevos) * 100;

  // Reviews
  const ratingPromedio = reviews.length > 0 ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const totalResenas = reviews.length;

  // Top 10 customers by spend in period
  const clientSpend = new Map<string, { telefono: string; nombre: string; gasto: number; pedidos: number }>();
  periodOrders.forEach(o => {
    const phone = o.customer?.phone ?? SIN_CLIENTE;
    const e = clientSpend.get(phone) ?? { telefono: phone, nombre: nombreDeCliente(o.customer?.phone, o.customer?.name, nombres), gasto: 0, pedidos: 0 };
    e.gasto += o.total; e.pedidos++;
    clientSpend.set(phone, e);
  });
  periodSales.forEach(s => {
    const phone = s.customerPhone || SIN_CLIENTE;
    const e = clientSpend.get(phone) ?? { telefono: phone, nombre: nombreDeCliente(s.customerPhone, undefined, nombres), gasto: 0, pedidos: 0 };
    e.gasto += s.total; e.pedidos++;
    clientSpend.set(phone, e);
  });
  const topClientes = [...clientSpend.values()].sort((a, b) => b.gasto - a.gasto).slice(0, 10);

  // Monthly retention (last 6 months)
  const retencion: ClientesData["retencion"] = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const label = mesCorto(mStart, now);
    const mPhones = new Set<string>();
    orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= mStart && new Date(o.createdAt) <= mEnd).forEach(o => { if (o.customer?.phone) mPhones.add(o.customer.phone); });
    sales.filter(s => new Date(s.createdAt) >= mStart && new Date(s.createdAt) <= mEnd).forEach(s => { if (s.customerPhone) mPhones.add(s.customerPhone); });

    const priorPhones = new Set<string>();
    orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < mStart).forEach(o => { if (o.customer?.phone) priorPhones.add(o.customer.phone); });
    sales.filter(s => new Date(s.createdAt) < mStart).forEach(s => { if (s.customerPhone) priorPhones.add(s.customerPhone); });
    let mNew = 0, mRet = 0;
    mPhones.forEach(p => { if (priorPhones.has(p)) mRet++; else mNew++; });
    retencion.push({ mes: label, nuevos: mNew, recurrentes: mRet, total: mPhones.size });
  }

  // Cohort analysis (simplified — 4 monthly cohorts). La matriz que se dibuja
  // es la de `calcularAvanzado`; esta queda en los datos de la pestaña.
  const cohortData: ClientesData["cohortData"] = [];
  for (let c = 3; c >= 0; c--) {
    const cStart = new Date(now.getFullYear(), now.getMonth() - c, 1);
    const cEnd = new Date(now.getFullYear(), now.getMonth() - c + 1, 0, 23, 59, 59);
    const label = mesCorto(cStart, now);
    const firstPurchase = new Set<string>();
    const allPhonesBefore = new Set<string>();
    orders.filter(o => o.status === "entregado" && new Date(o.createdAt) < cStart).forEach(o => { if (o.customer?.phone) allPhonesBefore.add(o.customer.phone); });
    sales.filter(s => new Date(s.createdAt) < cStart).forEach(s => { if (s.customerPhone) allPhonesBefore.add(s.customerPhone); });
    orders.filter(o => o.status === "entregado" && new Date(o.createdAt) >= cStart && new Date(o.createdAt) <= cEnd).forEach(o => {
      if (o.customer?.phone && !allPhonesBefore.has(o.customer.phone)) firstPurchase.add(o.customer.phone);
    });
    sales.filter(s => new Date(s.createdAt) >= cStart && new Date(s.createdAt) <= cEnd).forEach(s => {
      if (s.customerPhone && !allPhonesBefore.has(s.customerPhone)) firstPurchase.add(s.customerPhone);
    });
    const cohortSize = firstPurchase.size;
    if (cohortSize === 0) { cohortData.push({ cohorte: label, m0: 0, m1: 0, m2: 0, m3: 0 }); continue; }
    const mPcts = [100]; // m0 by definition
    for (let m = 1; m <= 3; m++) {
      const mS = new Date(now.getFullYear(), now.getMonth() - c + m, 1);
      const mE = new Date(now.getFullYear(), now.getMonth() - c + m + 1, 0, 23, 59, 59);
      if (mS > now) { mPcts.push(0); continue; }
      let retained = 0;
      firstPurchase.forEach(phone => {
        const hasPurchase = orders.some(o => o.status === "entregado" && o.customer?.phone === phone && new Date(o.createdAt) >= mS && new Date(o.createdAt) <= mE)
          || sales.some(s => s.customerPhone === phone && new Date(s.createdAt) >= mS && new Date(s.createdAt) <= mE);
        if (hasPurchase) retained++;
      });
      mPcts.push(Math.round((retained / cohortSize) * 100));
    }
    cohortData.push({ cohorte: label, m0: mPcts[0], m1: mPcts[1], m2: mPcts[2], m3: mPcts[3] });
  }

  // Spend distribution
  const spendRanges = [
    { label: "Hasta S/ 50", min: 0, max: 50 },
    { label: "S/ 51 a 200", min: 50.01, max: 200 },
    { label: "S/ 201 a 500", min: 200.01, max: 500 },
    { label: "Más de S/ 500", min: 500.01, max: Infinity },
  ];
  const distribucionGasto = spendRanges.map(r => ({
    rango: r.label,
    cantidad: customers.filter(c => c.totalSpent >= r.min && c.totalSpent <= r.max).length,
  }));
  const clientesConGasto = customers.filter(c => c.totalSpent > 0).length;

  // Purchase frequency (orders per customer in period)
  const freqMap = new Map<string, number>();
  periodOrders.forEach(o => { if (o.customer?.phone) freqMap.set(o.customer.phone, (freqMap.get(o.customer.phone) ?? 0) + 1); });
  periodSales.forEach(s => { if (s.customerPhone) freqMap.set(s.customerPhone, (freqMap.get(s.customerPhone) ?? 0) + 1); });
  const freqRanges = [
    { label: "1 compra", min: 1, max: 1 },
    { label: "2 a 3 compras", min: 2, max: 3 },
    { label: "4 a 7 compras", min: 4, max: 7 },
    { label: "8 compras o más", min: 8, max: Infinity },
  ];
  const frecuenciaCompra = freqRanges.map(r => ({
    frecuencia: r.label,
    cantidad: [...freqMap.values()].filter(f => f >= r.min && f <= r.max).length,
  }));

  // Daily new/active clients in period
  const dayNewMap = new Map<string, Set<string>>();
  const dayActiveMap = new Map<string, Set<string>>();
  [...periodOrders.map(o => ({ date: o.createdAt, phone: o.customer?.phone })),
   ...periodSales.map(s => ({ date: s.createdAt, phone: s.customerPhone }))
  ].forEach(t => {
    if (!t.phone) return;
    const k = dateKey(new Date(t.date));
    if (!dayActiveMap.has(k)) dayActiveMap.set(k, new Set());
    dayActiveMap.get(k)!.add(t.phone);
    if (!beforePeriodPhones.has(t.phone)) {
      if (!dayNewMap.has(k)) dayNewMap.set(k, new Set());
      dayNewMap.get(k)!.add(t.phone);
    }
  });
  const allDays = [...new Set([...dayActiveMap.keys(), ...dayNewMap.keys()])].sort().slice(-14);
  const clientesPorDia = allDays.map(k => ({
    dia: fechaCorta(k), clave: k, nuevos: dayNewMap.get(k)?.size ?? 0, activos: dayActiveMap.get(k)?.size ?? 0,
  }));

  // Rating distribution
  const distribucionRating = [1, 2, 3, 4, 5].map(r => ({
    rating: r, cantidad: reviews.filter(rv => Math.round(rv.rating) === r).length,
  }));

  // Avg ticket per top client
  const ticketPorCliente = topClientes.slice(0, 8).map(c => ({
    telefono: c.telefono, nombre: c.nombre, ticket: c.pedidos > 0 ? c.gasto / c.pedidos : 0, visitas: c.pedidos,
  }));

  return {
    totalClientes, clientesActivos, nuevos, recurrentes, ratingPromedio, totalResenas, clientesConGasto,
    dActivos, dNuevos,
    topClientes, retencion, cohortData, distribucionGasto, frecuenciaCompra,
    clientesPorDia, distribucionRating, ticketPorCliente,
  };
}

// ── Qué se muestra (sólo presentación) ───────────────────────────────────────

/** R1: ¿algún cliente compró en el rango? false → sólo el estado vacío del paiche. */
export function hayClientesEnRango(d: Pick<ClientesData, "clientesActivos" | "nuevos" | "recurrentes">): boolean {
  return algunDato([d.clientesActivos, d.nuevos, d.recurrentes]);
}

/** Ranking sin la bolsa de ventas sin cliente y sin filas en cero. */
export function sinAnonimos<T extends { telefono: string }>(filas: readonly T[]): T[] {
  return filas.filter((f) => f.telefono !== SIN_CLIENTE);
}

/**
 * KPI cuyo cero ES la noticia («Ninguno en riesgo»): la palabra en vez de un «0»
 * suelto que se lee como relleno (R3). Con dato, la cantidad con miles.
 */
export function cifraONinguno(n: number, palabra = "Ninguno"): string {
  return n > 0 ? cantidad(n) : palabra;
}

/** % redondeado de `parte` sobre `total`; null si no hay total. */
export function pct(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

export interface QueSeMuestraClientes {
  top: ModoRanking;
  retencion: boolean;
  porDia: boolean;
  gasto: boolean;
  frecuencia: boolean;
  ticket: ModoRanking;
}

export function queSeMuestraClientes(d: ClientesData): QueSeMuestraClientes {
  return {
    top: modoRanking(sinAnonimos(d.topClientes), "gasto"),
    retencion: hayTendencia(d.retencion, ["total"]),
    porDia: hayTendencia(d.clientesPorDia, ["activos"]),
    // Todos los clientes con gasto 0 caen en «Hasta S/ 50»: una barra sola que no dice nada.
    gasto: d.clientesConGasto > 0,
    frecuencia: hayDatosEnSerie(d.frecuenciaCompra, ["cantidad"]),
    ticket: modoRanking(sinAnonimos(d.ticketPorCliente), "ticket"),
  };
}
