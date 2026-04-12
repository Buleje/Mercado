import "server-only";
import {
  ProductsDB,
  OrdersDB,
  CustomersDB,
  SalesDB,
  PayablesDB,
  PurchasesDB,
  ReviewsDB,
  FiadosDB,
  TurnosDB,
  PrestamosDB,
} from "@/lib/db";

// ── Snapshot cache (5 min TTL) ──────────────────────────────────────────────

let cachedSnapshot: {
  text: string;
  metrics: Record<string, unknown>;
  ts: number;
  tenantId: string;
} | null = null;
const CACHE_TTL = 5 * 60 * 1000;

// ── Calendario peruano helpers ──────────────────────────────────────────────

function isQuincena(d: Date): boolean {
  const day = d.getDate();
  return day >= 14 && day <= 16 || day >= 28 || day <= 2;
}

function getTemporada(d: Date): string {
  const m = d.getMonth(); // 0-based
  if (m >= 11 || m <= 2) return "Lluvias (dic-mar) — clima caluroso y húmedo en Pucallpa";
  if (m >= 5 && m <= 8) return "Seca (jun-sep) — mejor temporada para transporte fluvial";
  return "Transición — preparar inventario para siguiente temporada";
}

interface Feriado {
  nombre: string;
  fecha: Date;
  diasAntes: number;
}

function getProximoFeriado(d: Date): Feriado | null {
  const year = d.getFullYear();
  const feriados: { nombre: string; mes: number; dia: number }[] = [
    { nombre: "Año Nuevo", mes: 0, dia: 1 },
    { nombre: "Día del Trabajo", mes: 4, dia: 1 },
    { nombre: "San Pedro y San Pablo", mes: 5, dia: 29 },
    { nombre: "Fiestas Patrias", mes: 6, dia: 28 },
    { nombre: "Fiestas Patrias (2do día)", mes: 6, dia: 29 },
    { nombre: "Santa Rosa de Lima", mes: 7, dia: 30 },
    { nombre: "Combate de Angamos", mes: 9, dia: 8 },
    { nombre: "Aniversario de Pucallpa", mes: 9, dia: 13 },
    { nombre: "Todos los Santos", mes: 10, dia: 1 },
    { nombre: "Inmaculada Concepción", mes: 11, dia: 8 },
    { nombre: "Navidad", mes: 11, dia: 25 },
  ];

  // Add dynamic holidays
  // Día de la Madre: 2do domingo de mayo
  const mayo1 = new Date(year, 4, 1);
  const primerDomMayo = (7 - mayo1.getDay()) % 7;
  const diaMadre = primerDomMayo + 1 + 7; // 2do domingo
  feriados.push({ nombre: "Día de la Madre", mes: 4, dia: diaMadre });

  // Día del Padre: 3er domingo de junio
  const jun1 = new Date(year, 5, 1);
  const primerDomJun = (7 - jun1.getDay()) % 7;
  const diaPadre = primerDomJun + 1 + 14; // 3er domingo
  feriados.push({ nombre: "Día del Padre", mes: 5, dia: diaPadre });

  // San Valentín
  feriados.push({ nombre: "San Valentín", mes: 1, dia: 14 });

  let closest: Feriado | null = null;

  for (const f of feriados) {
    let fecha = new Date(year, f.mes, f.dia);
    if (fecha < d) {
      fecha = new Date(year + 1, f.mes, f.dia);
    }
    const diasAntes = Math.ceil((fecha.getTime() - d.getTime()) / 86_400_000);
    if (diasAntes >= 0 && diasAntes <= 60) {
      if (!closest || diasAntes < closest.diasAntes) {
        closest = { nombre: f.nombre, fecha, diasAntes };
      }
    }
  }

  return closest;
}

function getContextoFecha(d: Date): string {
  const parts: string[] = [];
  const day = d.getDay();
  if (day === 0) parts.push("Domingo — día de mayor tráfico en bodega");
  if (day === 6) parts.push("Sábado — día fuerte de ventas");
  if (day === 1) parts.push("Lunes — inicio de semana, buen día para reposición");

  const dayOfMonth = d.getDate();
  if (dayOfMonth >= 1 && dayOfMonth <= 5) parts.push("Inicio de mes — clientes con liquidez");
  if (dayOfMonth >= 14 && dayOfMonth <= 16) parts.push("Quincena — pico de ventas esperado");
  if (dayOfMonth >= 25) parts.push("Fin de mes — clientes ajustados, ofrecer fiado estratégico");

  const month = d.getMonth();
  if (month >= 1 && month <= 2) parts.push("Campaña escolar activa");
  if (month >= 10 || month === 0) parts.push("Campaña navideña/fin de año");

  return parts.join(". ") || "Día normal de operación";
}

// ── Main snapshot generator ─────────────────────────────────────────────────

export async function generateBusinessSnapshot(
  tenantId: string
): Promise<{ text: string; metrics: Record<string, unknown> }> {
  const now = Date.now();
  if (
    cachedSnapshot &&
    cachedSnapshot.tenantId === tenantId &&
    now - cachedSnapshot.ts < CACHE_TTL
  ) {
    return { text: cachedSnapshot.text, metrics: cachedSnapshot.metrics };
  }

  const [products, orders, customers, sales, payables, purchases, reviews] =
    await Promise.all([
      ProductsDB.getAll(tenantId),
      OrdersDB.getAll(tenantId),
      CustomersDB.getAll(tenantId),
      SalesDB.getAll(tenantId),
      PayablesDB.getAll(tenantId),
      PurchasesDB.getAll(tenantId),
      ReviewsDB.getAll(tenantId),
    ]);

  // Fiados, turnos, préstamos — use tenantId
  const [fiados, turnosAbiertos, prestamos] = await Promise.all([
    FiadosDB.list(tenantId, { status: "ACTIVO" }),
    TurnosDB.list(tenantId, { status: "ABIERTO" }),
    PrestamosDB.list(tenantId, { status: "ACTIVO" }),
  ]);

  const d = new Date();
  const today = d.toISOString().slice(0, 10);
  const weekAgo = new Date(d.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(d.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const activeProducts = products.filter((p) => p.active);
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );

  const validOrders = orders.filter((o) => o.status !== "cancelado");
  const todayOrders = validOrders.filter((o) => o.createdAt?.slice(0, 10) === today);
  const weekOrders = validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo);
  const monthOrders = validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo);

  const todaySales = sales.filter((s) => s.createdAt?.slice(0, 10) === today);
  const weekSales = sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo);

  const todayRevenue =
    todayOrders.reduce((s, o) => s + o.total, 0) +
    todaySales.reduce((s, sl) => s + sl.total, 0);
  const weekRevenue =
    weekOrders.reduce((s, o) => s + o.total, 0) +
    weekSales.reduce((s, sl) => s + sl.total, 0);
  const monthRevenue =
    monthOrders.reduce((s, o) => s + o.total, 0) +
    sales
      .filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)
      .reduce((s, sl) => s + sl.total, 0);

  const pendingOrders = orders.filter((o) => o.status === "pendiente").length;
  const cancelledMonth = orders.filter(
    (o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= monthAgo
  ).length;

  const costMap: Record<string, number> = {};
  products.forEach((p) => {
    if (p.costPrice) costMap[p.id] = p.costPrice;
  });
  const monthCost = [
    ...monthOrders.flatMap((o) => o.items),
    ...sales
      .filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)
      .flatMap((s) => s.items),
  ].reduce(
    (s, i) => s + (costMap["id" in i ? i.id : i.productId] ?? 0) * i.quantity,
    0
  );
  const monthProfit = monthRevenue - monthCost;
  const margin =
    monthRevenue > 0 ? ((monthProfit / monthRevenue) * 100).toFixed(1) : "0";

  const prodRevenue: Record<string, { name: string; qty: number; rev: number }> = {};
  for (const o of monthOrders)
    for (const i of o.items) {
      if (!prodRevenue[i.id])
        prodRevenue[i.id] = { name: i.name, qty: 0, rev: 0 };
      prodRevenue[i.id].qty += i.quantity;
      prodRevenue[i.id].rev += i.price * i.quantity;
    }
  const top10 = Object.values(prodRevenue)
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 10);

  const spendMap = new Map<string, number>();
  validOrders.forEach((o) => {
    if (o.customer?.phone)
      spendMap.set(
        o.customer.phone,
        (spendMap.get(o.customer.phone) ?? 0) + o.total
      );
  });
  const topCustomers = [...spendMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : "N/A";

  const pendingPayables = payables.filter((p) => p.status !== "pagado");
  const totalDebt = pendingPayables.reduce(
    (s, p) => s + (p.amount - p.paidAmount),
    0
  );
  const overdueCount = pendingPayables.filter(
    (p) => new Date(p.dueDate) < d
  ).length;

  // ── Fiados data ──
  const totalFiadosPendiente = fiados.reduce((s, f) => s + f.saldo, 0);
  const topDeudores = [...fiados]
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 5);
  const fiadoPromedioDias =
    fiados.length > 0
      ? Math.round(
          fiados.reduce((s, f) => {
            const created = new Date(f.createdAt).getTime();
            return s + (d.getTime() - created) / 86_400_000;
          }, 0) / fiados.length
        )
      : 0;

  // ── Turnos data ──
  const turnoActual = turnosAbiertos[0] ?? null;

  // ── Préstamos data ──
  const totalPrestamosPendiente = prestamos.reduce((s, p) => s + p.monto, 0);

  // ── Calendario ──
  const esQuincena = isQuincena(d);
  const temporada = getTemporada(d);
  const proximoFeriado = getProximoFeriado(d);
  const contextoFecha = getContextoFecha(d);

  const text = `
SNAPSHOT DEL NEGOCIO (${today}):

VENTAS:
- Ingresos hoy: S/${todayRevenue.toFixed(2)} (${todayOrders.length + todaySales.length} transacciones)
- Ingresos semana: S/${weekRevenue.toFixed(2)} (${weekOrders.length + weekSales.length} transacciones)
- Ingresos mes: S/${monthRevenue.toFixed(2)} (${monthOrders.length} pedidos + ventas directas)
- Utilidad mes: S/${monthProfit.toFixed(2)} (Margen: ${margin}%)
- Cancelados este mes: ${cancelledMonth}

PEDIDOS:
- Pendientes: ${pendingOrders}
- Total activos: ${validOrders.length}

INVENTARIO:
- Productos activos: ${activeProducts.length}
- Agotados: ${outOfStock.length}${outOfStock.length > 0 ? " → " + outOfStock.slice(0, 5).map((p) => p.name).join(", ") : ""}
- Stock crítico: ${lowStock.length}${lowStock.length > 0 ? " → " + lowStock.slice(0, 5).map((p) => `${p.name}(${p.stock}/${p.stockMin})`).join(", ") : ""}

TOP 10 PRODUCTOS (30 días):
${top10.map((p, i) => `${i + 1}. ${p.name}: ${p.qty} uds, S/${p.rev.toFixed(2)}`).join("\n")}

CLIENTES:
- Total registrados: ${customers.length}
- Rating promedio: ${avgRating}★ (${reviews.length} reseñas)
- Top 5 clientes: ${topCustomers.map(([ph, spent]) => { const c = customers.find((x) => x.phone === ph); return `${c?.name ?? ph}: S/${spent.toFixed(2)}`; }).join(" | ")}

CUENTAS POR PAGAR:
- Deuda total: S/${totalDebt.toFixed(2)}
- Facturas vencidas: ${overdueCount}
- Facturas pendientes: ${pendingPayables.length}

COMPRAS:
- Total compras registradas: ${purchases.length}

FIADOS (CRÉDITO A CLIENTES):
- Total pendiente: S/${totalFiadosPendiente.toFixed(2)}
- Fiados activos: ${fiados.length}
- Promedio días de crédito: ${fiadoPromedioDias} días
- Top 5 deudores: ${topDeudores.map((f) => `${f.customerName ?? "Sin nombre"}(S/${f.saldo.toFixed(2)})`).join(", ") || "Ninguno"}

TURNOS:
- Turno actual: ${turnoActual ? `ABIERTO desde ${turnoActual.abrioEn.slice(11, 16)} — Ventas: S/${turnoActual.ventasTotal.toFixed(2)}` : "Sin turno abierto"}

PRÉSTAMOS:
- Préstamos activos: ${prestamos.length}
- Total pendiente: S/${totalPrestamosPendiente.toFixed(2)}

CALENDARIO:
- Fecha: ${today} | ${contextoFecha}
- ¿Es quincena? ${esQuincena ? "SÍ — preparar para pico de ventas" : "No"}
- Temporada: ${temporada}
- Próximo feriado: ${proximoFeriado ? `${proximoFeriado.nombre} en ${proximoFeriado.diasAntes} días (${proximoFeriado.fecha.toISOString().slice(0, 10)})` : "Ninguno próximo"}
`.trim();

  const metrics: Record<string, unknown> = {
    todayRevenue: +todayRevenue.toFixed(2),
    weekRevenue: +weekRevenue.toFixed(2),
    monthRevenue: +monthRevenue.toFixed(2),
    monthProfit: +monthProfit.toFixed(2),
    margin,
    pendingOrders,
    outOfStockCount: outOfStock.length,
    lowStockCount: lowStock.length,
    activeProducts: activeProducts.length,
    totalCustomers: customers.length,
    avgRating,
    pendingPayables: pendingPayables.length,
    totalDebt: +totalDebt.toFixed(2),
    overdueCount,
    topProductName: top10[0]?.name ?? "N/A",
    totalFiadosPendiente: +totalFiadosPendiente.toFixed(2),
    fiadosActivos: fiados.length,
    fiadoPromedioDias,
    turnoAbierto: !!turnoActual,
    turnoVentas: turnoActual ? +turnoActual.ventasTotal.toFixed(2) : 0,
    prestamosActivos: prestamos.length,
    totalPrestamosPendiente: +totalPrestamosPendiente.toFixed(2),
    esQuincena,
    temporada,
    proximoFeriado: proximoFeriado?.nombre ?? null,
    proximoFeriadoDias: proximoFeriado?.diasAntes ?? null,
  };

  cachedSnapshot = { text, metrics, ts: now, tenantId };
  return { text, metrics };
}

// ── Exported calendar helpers (for business-calendar endpoint) ───────────────

export { isQuincena, getTemporada, getProximoFeriado, getContextoFecha };
export type { Feriado };
