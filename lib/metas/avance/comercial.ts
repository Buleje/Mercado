/**
 * lib/metas/avance/comercial.ts — cuánto lleva cada meta de la bodega y del
 * marketplace en su ventana (ADR-488). Una calculadora por categoría; leen por
 * las clases `lib/db/*.db.ts` de siempre y nunca escriben.
 *
 * Ventas, ticket y pedidos comparten las MISMAS dos lecturas (ventas del POS y
 * pedidos que entran) vía `memo.una`: tres metas del mes = 3 consultas, no 9.
 *
 * Lo que no se cuenta se dice: en `detalle` (una línea para el ⓘ) o en
 * `parcial` (el número está incompleto y por qué). Todo en tuteo.
 */
import "server-only";
import type { CategoriaMeta } from "@/lib/admin/metas-tareas";
import type { VentanaMeta } from "@/lib/admin/metas-periodo";
import { AnalyticsKpisV2DB } from "@/lib/db/analytics-kpis-v2.db";
import { AnalyticsFiadoDB } from "@/lib/db/analytics-fiado.db";
import { ExpensesDB } from "@/lib/db/finance.db";
import { AdminTasksDB } from "@/lib/db/admin-tasks.db";
import { MetasAvanceDB } from "@/lib/db/metas-avance.db";
import { veredictoArqueo, esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { diaDeFecha } from "@/lib/finance/resultado-del-negocio";
import { toNumOrZero } from "@/lib/decimal-utils";
import type { Calculadora, MemoLectura } from "./tipos";

const DIA_MS = 86_400_000;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (n: number) => n.toLocaleString("es-PE");
const cuenta = (n: number, uno: string, varios: string) => `${num(n)} ${n === 1 ? uno : varios}`;
const unir = (...partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" · ") || undefined;

/** ¿El día de una fecha guardada («2026-10-01» a medianoche UTC = ese día; un instante = su día de Lima) cae en la ventana? */
const enLaVentana = (fecha: string | Date | null | undefined, v: VentanaMeta) => {
  const dia = diaDeFecha(fecha);
  return dia !== "" && dia >= v.desde && dia <= v.hasta;
};
/**
 * Gastos y compras pueden guardarse como día de calendario (00:00 UTC = 19:00
 * del día anterior en Lima): se lee con un día de margen a cada lado y se corta
 * en memoria con `enLaVentana`.
 */
const conMargen = (v: VentanaMeta) => ({ from: new Date(v.gte.getTime() - DIA_MS), to: new Date(v.lt.getTime() + DIA_MS) });

// ── Lecturas compartidas ────────────────────────────────────────────────────

/** Ventas del POS de la ventana: cantidad y total (las dos agregaciones de `AnalyticsKpisV2DB`). */
function ventasPos(tenantId: string, v: VentanaMeta, memo: MemoLectura) {
  return memo.una(`sale:${v.desde}:${v.hasta}`, async () => {
    const [suma, promedio] = await Promise.all([
      AnalyticsKpisV2DB.ingresosForRange(tenantId, v.gte, v.lt),
      AnalyticsKpisV2DB.ticketAvg(tenantId, v.gte, v.lt),
    ]);
    return { n: promedio._count.id, total: toNumOrZero(suma._sum.total) };
  });
}

/** Pedidos (tienda, marketplace, mayorista) que ya cuentan como venta. */
function pedidos(tenantId: string, v: VentanaMeta, memo: MemoLectura) {
  return memo.una(`order:${v.desde}:${v.hasta}`, () => MetasAvanceDB.pedidosDelRango(tenantId, v.gte, v.lt));
}

function pedidosMarketplace(tenantId: string, v: VentanaMeta, memo: MemoLectura) {
  return memo.una(`order-mkt:${v.desde}:${v.hasta}`, () => MetasAvanceDB.pedidosDelRango(tenantId, v.gte, v.lt, "marketplace"));
}

const detalleVentas = (s: { n: number }, o: { n: number }) =>
  `${cuenta(s.n, "venta", "ventas")} del POS y ${cuenta(o.n, "pedido", "pedidos")}`;

// ── Calculadoras ────────────────────────────────────────────────────────────

const ventas: Calculadora = async (tenantId, v, _unidad, memo) => {
  const [s, o] = await Promise.all([ventasPos(tenantId, v, memo), pedidos(tenantId, v, memo)]);
  return { valor: r2(s.total + o.total), detalle: detalleVentas(s, o) };
};

const ticketPromedio: Calculadora = async (tenantId, v, _unidad, memo) => {
  const [s, o] = await Promise.all([ventasPos(tenantId, v, memo), pedidos(tenantId, v, memo)]);
  const n = s.n + o.n;
  if (n === 0) return { valor: null, detalle: "Todavía no hay ventas en este período." };
  return { valor: r2((s.total + o.total) / n), detalle: detalleVentas(s, o) };
};

const ventasYPedidos: Calculadora = async (tenantId, v, _unidad, memo) => {
  const [s, o] = await Promise.all([ventasPos(tenantId, v, memo), pedidos(tenantId, v, memo)]);
  return { valor: s.n + o.n, detalle: detalleVentas(s, o) };
};

const unidades: Calculadora = async (tenantId, v) => {
  const u = await MetasAvanceDB.unidadesVendidas(tenantId, v.gte, v.lt);
  return { valor: u.ventas + u.pedidos, detalle: `${num(u.ventas)} del POS y ${num(u.pedidos)} de pedidos` };
};

const clientesNuevos: Calculadora = async (tenantId, v) => {
  const n = await MetasAvanceDB.clientesNuevos(tenantId, v.gte, v.lt);
  return { valor: n, detalle: `${cuenta(n, "cliente se registró", "clientes se registraron")} en este período` };
};

const retencion: Calculadora = async (tenantId, v) => {
  const r = await MetasAvanceDB.retencion(tenantId, v.gte, v.lt);
  const parcial = r.sinTelefono > 0
    ? `${cuenta(r.sinTelefono, "venta sin teléfono no se puede seguir", "ventas sin teléfono no se pueden seguir")}`
    : undefined;
  if (r.activos === 0) {
    return { valor: null, detalle: "Todavía no hay ventas con el teléfono del cliente en este período.", parcial };
  }
  return {
    valor: r1((r.volvieron / r.activos) * 100),
    detalle: `${num(r.volvieron)} de ${cuenta(r.activos, "cliente", "clientes")} compraron 2 veces o más`,
    parcial,
  };
};

const cierresCuadrados: Calculadora = async (tenantId, v) => {
  const cierres = await MetasAvanceDB.cierresDelRango(tenantId, v.gte, v.lt);
  let cuadraron = 0;
  let solos = 0;
  for (const c of cierres) {
    if (esCierreAutomatico(c.notes)) {
      solos++;
      continue;
    }
    const estado = veredictoArqueo({
      expectedAmount: c.expectedAmount,
      countedAmount: c.closingAmount,
      difference: c.difference,
      notes: c.notes,
      closedAt: c.closedAt,
    });
    if (estado === "conforme") cuadraron++;
  }
  return {
    valor: cuadraron,
    detalle: unir(
      `${num(cuadraron)} de ${cuenta(cierres.length, "cierre", "cierres")} cuadraron`,
      solos > 0 && `${cuenta(solos, "se cerró solo sin contar", "se cerraron solos sin contar")}`,
    ),
  };
};

const fiadosCobrados: Calculadora = async (tenantId, v) => {
  // El método sólo filtra desde: el corte de arriba va acá.
  const cuotas = (await AnalyticsFiadoDB.getPaidCuotasInRange(tenantId, v.gte)).filter(
    (c) => c.pagadoEn != null && c.pagadoEn.getTime() < v.lt.getTime(),
  );
  const total = cuotas.reduce((s, c) => s + toNumOrZero(c.monto), 0);
  return { valor: r2(total), detalle: cuenta(cuotas.length, "abono cobrado", "abonos cobrados") };
};

const comprasRecibidas: Calculadora = async (tenantId, v) => {
  const { from, to } = conMargen(v);
  const [historial, pendientes] = await Promise.all([
    ExpensesDB.getHistorialUnificado(tenantId, { from, to, source: "purchase" }),
    MetasAvanceDB.comprasPendientes(tenantId, v.gte, v.lt),
  ]);
  // Sólo recibidas o parciales (lo filtra `getHistorialUnificado`): una OC pendiente todavía no es compra.
  const recibidas = historial.filter((h) => h.source === "purchase" && enLaVentana(h.fecha, v));
  return {
    valor: r2(recibidas.reduce((s, h) => s + h.amount, 0)),
    detalle: unir(
      cuenta(recibidas.length, "orden recibida", "órdenes recibidas"),
      pendientes > 0 &&
        `${cuenta(pendientes, "orden pendiente no cuenta", "órdenes pendientes no cuentan")} hasta que ${pendientes === 1 ? "la recibas" : "las recibas"}`,
    ),
  };
};

const gastos: Calculadora = async (tenantId, v) => {
  const { from, to } = conMargen(v);
  // Sin plantillas: un gasto fijo sin pagar es un recordatorio, no plata que salió.
  const filas = (await ExpensesDB.getByDateRange(tenantId, from, to, { incluirPlantillas: false })).filter((g) =>
    enLaVentana(g.date, v),
  );
  return { valor: r2(filas.reduce((s, g) => s + g.amount, 0)), detalle: cuenta(filas.length, "gasto anotado", "gastos anotados") };
};

const marketplaceVentas: Calculadora = async (tenantId, v, _unidad, memo) => {
  const o = await pedidosMarketplace(tenantId, v, memo);
  return {
    valor: r2(o.total),
    detalle: `${cuenta(o.n, "pedido que cuenta", "pedidos que cuentan")} (confirmados, en camino o entregados); los cancelados no`,
  };
};

const marketplacePedidos: Calculadora = async (tenantId, v, _unidad, memo) => {
  const o = await pedidosMarketplace(tenantId, v, memo);
  return { valor: o.n, detalle: "Cuentan los confirmados, en camino o entregados; los cancelados no." };
};

const tareasTerminadas: Calculadora = async (tenantId, v) => {
  const tareas = await AdminTasksDB.listar(tenantId);
  const desde = v.gte.getTime();
  const hasta = v.lt.getTime();
  const hechas = tareas.filter((t) => {
    if (t.status !== "completada" || !t.completedAt) return false;
    const ms = new Date(t.completedAt).getTime();
    return ms >= desde && ms < hasta;
  });
  return { valor: hechas.length, detalle: cuenta(hechas.length, "tarea terminada", "tareas terminadas") };
};

export const CALCULADORAS_COMERCIALES: Partial<Record<CategoriaMeta, Calculadora>> = {
  ventas,
  ticket_promedio: ticketPromedio,
  pedidos: ventasYPedidos,
  productos: unidades,
  clientes: clientesNuevos,
  retencion,
  caja: cierresCuadrados,
  fiados_cobrados: fiadosCobrados,
  compras: comprasRecibidas,
  gastos,
  marketplace_ventas: marketplaceVentas,
  marketplace_pedidos: marketplacePedidos,
  tareas: tareasTerminadas,
};
