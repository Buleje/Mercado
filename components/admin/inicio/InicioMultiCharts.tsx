"use client";

import { memo, useMemo } from "react";
import type { DateRange } from "./DashboardDateRange";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { BulejeComposedChart } from "@/components/ui-system/charts";
import { DashboardSection } from "./_shared";
import { DraggableSections, type DraggableItem } from "./DraggableSections";

type Product = {
  id: number | string;
  name: string;
  active?: boolean;
  stock?: number;
  stockMin?: number;
  price: number;
  costPrice?: number;
  category?: string;
};
type OrderItem = { id: number | string; quantity: number; price?: number };
type Order = {
  id: string | number;
  createdAt: string;
  total: number;
  status: string;
  customer?: { name?: string; phone?: string };
  items: OrderItem[];
  paid?: boolean;
};
type Sale = {
  id?: string | number;
  createdAt: string;
  total: number;
  items: Array<{ productId: number | string; quantity: number; price?: number }>;
};
type Purchase = {
  id: string | number;
  createdAt: string;
  total: number;
  supplierName?: string;
  supplierId?: string | number;
  paid?: boolean;
  items?: Array<{ productId?: number | string; quantity?: number; price?: number }>;
};
type Payable = { id: string | number; amount: number; paid?: boolean; dueDate?: string };
type Customer = { id?: string | number; phone?: string; name?: string; createdAt?: string };

const CAT_LABEL: Record<string, string> = {
  frutas: "Frutas",
  verduras: "Verduras",
  carnes: "Carnes",
  lacteos: "Lácteos",
  bebidas: "Bebidas",
  limpieza: "Limpieza",
  abarrotes: "Abarrotes",
  panaderia: "Panadería",
  snacks: "Snacks",
  otros: "Otros",
};

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Construye hasta 14 buckets cubriendo el rango [from, to].
 * - Rango <= 1 día: 6 buckets de 4h
 * - Rango <= 14 días: buckets diarios
 * - Rango más largo: buckets de (span/14) días
 */
function buildBuckets(from: Date, to: Date): Array<{ label: string; start: number; end: number }> {
  const span = to.getTime() - from.getTime();
  const days = span / MS_DAY;

  if (days <= 1) {
    const out: Array<{ label: string; start: number; end: number }> = [];
    const fromStart = new Date(from);
    fromStart.setHours(Math.floor(fromStart.getHours() / 4) * 4, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const start = new Date(fromStart.getTime() + i * 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000 - 1);
      out.push({
        label: `${String(start.getHours()).padStart(2, "0")}h`,
        start: start.getTime(),
        end: end.getTime(),
      });
    }
    return out;
  }

  if (days <= 14) {
    const out: Array<{ label: string; start: number; end: number }> = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(to);
    last.setHours(23, 59, 59, 999);
    while (cursor.getTime() <= last.getTime()) {
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);
      out.push({
        label: DAY_LABELS[cursor.getDay()] ?? `${cursor.getDate()}`,
        start: cursor.getTime(),
        end: dayEnd.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  // Rango largo: máx 14 buckets uniformes
  const bucketSize = Math.ceil(days / 14);
  const out: Array<{ label: string; start: number; end: number }> = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= to.getTime()) {
    const bucketEnd = new Date(cursor.getTime() + bucketSize * MS_DAY - 1);
    const actualEnd = bucketEnd.getTime() > to.getTime() ? to : bucketEnd;
    out.push({
      label: days > 60
        ? `${MONTH_LABELS[cursor.getMonth()]} ${cursor.getDate()}`
        : `${cursor.getDate()}/${cursor.getMonth() + 1}`,
      start: cursor.getTime(),
      end: actualEnd.getTime(),
    });
    cursor.setTime(cursor.getTime() + bucketSize * MS_DAY);
  }
  return out;
}

function bucketIndex(iso: string | Date, buckets: Array<{ start: number; end: number }>): number {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return buckets.findIndex((b) => t >= b.start && t <= b.end);
}

function defaultLast7Range(): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}


const RANGE_LABEL: Record<string, string> = {
  diario: "hoy",
  semanal: "esta semana",
  mensual: "este mes",
  anual: "este año",
  personalizado: "rango seleccionado",
};
const KPI_SUFFIX: Record<string, string> = {
  diario: "hoy",
  semanal: "semana",
  mensual: "mes",
  anual: "año",
  personalizado: "rango",
};

export const InicioMultiCharts = memo(function InicioMultiCharts({ dateRange }: { dateRange?: DateRange }) {
  const { data } = useDashboardData();

  // Rango efectivo (default: rango activo si no se pasa)
  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (dateRange) return { from: dateRange.from, to: dateRange.to };
    return defaultLast7Range();
  }, [dateRange?.from, dateRange?.to]);

  const buckets = useMemo(() => buildBuckets(rangeFrom, rangeTo), [rangeFrom, rangeTo]);
  const rangeFromMs = rangeFrom.getTime();
  const rangeToMs = rangeTo.getTime();
  const presetKey = dateRange?.preset ?? "semanal";
  const rangeLabel = RANGE_LABEL[presetKey] ?? "rango";
  const kpiSuffix = KPI_SUFFIX[presetKey] ?? "rango";

  const products = (data?.products ?? []) as Product[];
  const orders = (data?.orders ?? []) as Order[];
  const sales = (data?.sales ?? []) as Sale[];
  const purchases = (data?.purchases ?? []) as Purchase[];
  const payables = (data?.payables ?? []) as Payable[];
  const customers = (data?.customers ?? []) as Customer[];

  // ── 1. CAJA — ingresos vs egresos + saldo neto acumulado ─────────────────
  const cajaChart = useMemo(() => {
    const rows = buckets.map((b) => ({
      day: b.label,
      ingresos: 0,
      egresos: 0,
      neto: 0,
    }));
    orders.forEach((o) => {
      if (o.status === "cancelado") return;
      const i = bucketIndex(o.createdAt, buckets);
      if (i >= 0) rows[i].ingresos += Number(o.total ?? 0);
    });
    sales.forEach((s) => {
      const i = bucketIndex(s.createdAt, buckets);
      if (i >= 0) rows[i].ingresos += Number(s.total ?? 0);
    });
    purchases.forEach((p) => {
      const i = bucketIndex(p.createdAt, buckets);
      if (i >= 0) rows[i].egresos += Number(p.total ?? 0);
    });
    let acc = 0;
    rows.forEach((r) => {
      acc += r.ingresos - r.egresos;
      r.neto = Math.round(acc);
      r.ingresos = Math.round(r.ingresos);
      r.egresos = Math.round(r.egresos);
    });
    return rows;
  }, [orders, sales, purchases, buckets]);

  const cajaKpis = useMemo(() => {
    const ingresos = cajaChart.reduce((s, r) => s + r.ingresos, 0);
    const egresos = cajaChart.reduce((s, r) => s + r.egresos, 0);
    const pendientePagar = payables
      .filter((p) => !p.paid)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const neto = ingresos - egresos;
    return { ingresos, egresos, neto, pendientePagar };
  }, [cajaChart, payables]);

  // ── 2. INVENTARIO — stock, valor, SKUs por categoría ─────────────────────
  const invChart = useMemo(() => {
    const m = new Map<string, { stock: number; valor: number; skus: number }>();
    products.forEach((p) => {
      if (!p.active) return;
      const cat = p.category ?? "otros";
      const cur = m.get(cat) ?? { stock: 0, valor: 0, skus: 0 };
      const stk = p.stock ?? 0;
      cur.stock += stk;
      cur.valor += stk * (p.costPrice ?? p.price * 0.7);
      cur.skus += 1;
      m.set(cat, cur);
    });
    return Array.from(m.entries())
      .sort(([, a], [, b]) => b.valor - a.valor)
      .slice(0, 7)
      .map(([cat, v]) => ({
        categoria: CAT_LABEL[cat] ?? cat,
        stock: v.stock,
        valor: Math.round(v.valor),
        skus: v.skus,
      }));
  }, [products]);

  const invKpis = useMemo(() => {
    const activos = products.filter((p) => p.active);
    const valor = activos.reduce(
      (s, p) => s + (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7),
      0,
    );
    const criticos = activos.filter(
      (p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5),
    ).length;
    const sinStock = activos.filter((p) => (p.stock ?? 0) <= 0).length;
    return { valor: Math.round(valor), skus: activos.length, criticos, sinStock };
  }, [products]);

  // ── 3. COMPRAS — monto + órdenes + pendiente por proveedor top-7 ─────────
  const compChart = useMemo(() => {
    const m = new Map<string, { monto: number; ordenes: number; pendiente: number }>();
    purchases
      .filter((p) => {
        const t = new Date(p.createdAt).getTime();
        return t >= rangeFromMs && t <= rangeToMs;
      })
      .forEach((p) => {
        const key = p.supplierName ?? "Sin proveedor";
        const cur = m.get(key) ?? { monto: 0, ordenes: 0, pendiente: 0 };
        cur.monto += Number(p.total ?? 0);
        cur.ordenes += 1;
        if (!p.paid) cur.pendiente += Number(p.total ?? 0);
        m.set(key, cur);
      });
    return Array.from(m.entries())
      .sort(([, a], [, b]) => b.monto - a.monto)
      .slice(0, 7)
      .map(([prov, v]) => ({
        proveedor: prov.length > 14 ? prov.slice(0, 13) + "…" : prov,
        monto: Math.round(v.monto),
        ordenes: v.ordenes,
        pendiente: Math.round(v.pendiente),
      }));
  }, [purchases, rangeFromMs, rangeToMs]);

  const compKpis = useMemo(() => {
    const recent = purchases.filter((p) => {
      const t = new Date(p.createdAt).getTime();
      return t >= rangeFromMs && t <= rangeToMs;
    });
    const total = recent.reduce((s, p) => s + Number(p.total ?? 0), 0);
    const provActivos = new Set(recent.map((p) => p.supplierName ?? "Sin proveedor")).size;
    const pendiente = recent.filter((p) => !p.paid).reduce((s, p) => s + Number(p.total ?? 0), 0);
    return { total: Math.round(total), provActivos, pendiente: Math.round(pendiente), ordenes: recent.length };
  }, [purchases, rangeFromMs, rangeToMs]);

  // ── 4. CLIENTES — nuevos + recurrentes + ticket prom. en el rango ──────
  const cliChart = useMemo(() => {
    const rows = buckets.map((b) => ({
      day: b.label,
      nuevos: 0,
      recurrentes: 0,
      ticketProm: 0,
    }));
    const newMap = new Map<string, number>();
    customers.forEach((c) => {
      if (!c.createdAt) return;
      const i = bucketIndex(c.createdAt, buckets);
      if (i >= 0) rows[i].nuevos += 1;
      if (c.phone) newMap.set(c.phone, new Date(c.createdAt).setHours(0, 0, 0, 0));
    });
    const ticketsByBucket: number[][] = Array.from({ length: buckets.length }, () => []);
    orders.forEach((o) => {
      if (o.status === "cancelado") return;
      const i = bucketIndex(o.createdAt, buckets);
      if (i < 0) return;
      ticketsByBucket[i].push(Number(o.total ?? 0));
      const phone = o.customer?.phone;
      if (phone && newMap.has(phone) && newMap.get(phone)! < buckets[i].start) {
        rows[i].recurrentes += 1;
      } else if (!phone || !newMap.has(phone)) {
        rows[i].recurrentes += 1;
      }
    });
    sales.forEach((s) => {
      const i = bucketIndex(s.createdAt, buckets);
      if (i < 0) return;
      ticketsByBucket[i].push(Number(s.total ?? 0));
    });
    rows.forEach((r, i) => {
      const arr = ticketsByBucket[i];
      r.ticketProm = Math.round(
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
      );
    });
    return rows;
  }, [customers, orders, sales, buckets]);

  const cliKpis = useMemo(() => {
    const total = customers.length;
    const nuevosEnRango = customers.filter(
      (c) => {
        if (!c.createdAt) return false;
        const t = new Date(c.createdAt).getTime();
        return t >= rangeFromMs && t <= rangeToMs;
      },
    ).length;
    const ordersInRange = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= rangeFromMs && t <= rangeToMs && o.status !== "cancelado";
    });
    const salesInRange = sales.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= rangeFromMs && t <= rangeToMs;
    });
    const uniquePhones = new Set(ordersInRange.map((o) => o.customer?.phone).filter(Boolean)).size;
    const ticketArr = [...ordersInRange, ...salesInRange].map((x) => Number(x.total ?? 0)).filter((v) => v > 0);
    const ticketProm = ticketArr.length
      ? Math.round(ticketArr.reduce((a, b) => a + b, 0) / ticketArr.length)
      : 0;
    return { total, nuevosMes: nuevosEnRango, activos: uniquePhones, ticketProm };
  }, [customers, orders, sales, rangeFromMs, rangeToMs]);

  // ── 5. PRODUCTOS — unidades + ingresos + margen top-7 en el rango ──────
  const prodChart = useMemo(() => {
    const m = new Map<
      string | number,
      { name: string; unidades: number; ingresos: number; margen: number }
    >();
    const priceCost = (id: string | number) => {
      const p = products.find((x) => x.id === id);
      return { price: p?.price ?? 0, cost: p?.costPrice ?? (p?.price ?? 0) * 0.7, name: p?.name ?? "—" };
    };
    orders
      .filter((o) => {
        if (o.status === "cancelado") return false;
        const t = new Date(o.createdAt).getTime();
        return t >= rangeFromMs && t <= rangeToMs;
      })
      .forEach((o) =>
        o.items.forEach((it) => {
          const pc = priceCost(it.id);
          const cur = m.get(it.id) ?? {
            name: pc.name,
            unidades: 0,
            ingresos: 0,
            margen: 0,
          };
          cur.unidades += it.quantity;
          cur.ingresos += it.quantity * (it.price ?? pc.price);
          cur.margen += it.quantity * ((it.price ?? pc.price) - pc.cost);
          m.set(it.id, cur);
        }),
      );
    sales
      .filter((s) => {
        const t = new Date(s.createdAt).getTime();
        return t >= rangeFromMs && t <= rangeToMs;
      })
      .forEach((s) =>
        s.items.forEach((it) => {
          const pc = priceCost(it.productId);
          const cur = m.get(it.productId) ?? {
            name: pc.name,
            unidades: 0,
            ingresos: 0,
            margen: 0,
          };
          cur.unidades += it.quantity;
          cur.ingresos += it.quantity * (it.price ?? pc.price);
          cur.margen += it.quantity * ((it.price ?? pc.price) - pc.cost);
          m.set(it.productId, cur);
        }),
      );
    return Array.from(m.values())
      .sort((a, b) => b.ingresos - a.ingresos)
      .slice(0, 7)
      .map((v) => ({
        producto: v.name.length > 16 ? v.name.slice(0, 15) + "…" : v.name,
        unidades: v.unidades,
        ingresos: Math.round(v.ingresos),
        margen: Math.round(v.margen),
      }));
  }, [products, orders, sales, rangeFromMs, rangeToMs]);

  const prodKpis = useMemo(() => {
    const activos = products.filter((p) => p.active).length;
    const best = prodChart[0]?.producto ?? "—";
    const ingresos = prodChart.reduce((s, r) => s + r.ingresos, 0);
    const margen = prodChart.reduce((s, r) => s + r.margen, 0);
    const margenPct = ingresos > 0 ? Math.round((margen / ingresos) * 100) : 0;
    return { activos, best, ingresos, margenPct };
  }, [products, prodChart]);

  const fmtPEN = (v: number) =>
    `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  const sections: DraggableItem[] = [
    {
      id: "caja",
      render: () => (
        <DashboardSection
          hideHeader
          kicker={`Flujo de caja · ${rangeLabel}`}
          title="Ingresos, egresos y saldo neto"
          kpis={[
            { label: `Ingresos ${kpiSuffix}`, value: fmtPEN(cajaKpis.ingresos), tone: "success" },
            { label: `Egresos ${kpiSuffix}`, value: fmtPEN(cajaKpis.egresos), tone: "warning" },
            {
              label: "Neto",
              value: fmtPEN(cajaKpis.neto),
              tone: cajaKpis.neto >= 0 ? "success" : "warning",
            },
            { label: "Por pagar", value: fmtPEN(cajaKpis.pendientePagar), tone: "primary" },
          ]}
        >
          <BulejeComposedChart
            data={cajaChart}
            xKey="day"
            bars={[
              { key: "ingresos", label: "Ingresos", color: "primary", yAxis: "left" },
              { key: "egresos", label: "Egresos", color: "amber", yAxis: "left" },
            ]}
            lines={[{ key: "neto", label: "Saldo neto", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v) => `S/ ${Number(v).toLocaleString("es-PE")}`}
            height={300}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "inventario",
      render: () => (
        <DashboardSection
          hideHeader
          kicker="Inventario · top 7 categorías"
          title="Stock, valor y SKUs por categoría"
          kpis={[
            { label: "Valor total", value: fmtPEN(invKpis.valor), tone: "primary" },
            { label: "SKUs activos", value: String(invKpis.skus), tone: "neutral" },
            { label: "Stock crítico", value: String(invKpis.criticos), tone: "warning" },
            { label: "Sin stock", value: String(invKpis.sinStock), tone: "warning" },
          ]}
        >
          <BulejeComposedChart
            data={invChart}
            xKey="categoria"
            bars={[{ key: "stock", label: "Stock (u)", color: "primary", yAxis: "left" }]}
            lines={[{ key: "valor", label: "Valor S/", color: "accent", yAxis: "right" }]}
            areas={[
              { key: "skus", label: "SKUs", color: "tertiary", yAxis: "left", opacity: 0.18 },
            ]}
            leftAxisFormat={(v) => v.toString()}
            rightAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("valor")
                ? `S/ ${Number(v).toLocaleString("es-PE")}`
                : Number(v).toLocaleString("es-PE")
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "compras",
      render: () => (
        <DashboardSection
          hideHeader
          kicker={`Compras · top 7 proveedores · ${rangeLabel}`}
          title="Monto, órdenes y deuda por proveedor"
          kpis={[
            { label: `Compras ${kpiSuffix}`, value: fmtPEN(compKpis.total), tone: "primary" },
            { label: "Órdenes", value: String(compKpis.ordenes), tone: "neutral" },
            { label: "Proveedores", value: String(compKpis.provActivos), tone: "neutral" },
            { label: "Por pagar", value: fmtPEN(compKpis.pendiente), tone: "warning" },
          ]}
        >
          <BulejeComposedChart
            data={compChart}
            xKey="proveedor"
            bars={[{ key: "monto", label: "Monto S/", color: "primary", yAxis: "left" }]}
            lines={[{ key: "ordenes", label: "Órdenes", color: "accent", yAxis: "right" }]}
            areas={[
              { key: "pendiente", label: "Por pagar S/", color: "amber", yAxis: "left", opacity: 0.22 },
            ]}
            leftAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            rightAxisFormat={(v) => v.toString()}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("órdenes")
                ? Number(v).toLocaleString("es-PE")
                : `S/ ${Number(v).toLocaleString("es-PE")}`
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
    {
      id: "clientes",
      render: () => (
        <DashboardSection
          hideHeader
          kicker={`Clientes · ${rangeLabel}`}
          title="Nuevos, recurrentes y ticket promedio"
          kpis={[
            { label: "Total clientes", value: cliKpis.total.toLocaleString("es-PE"), tone: "primary" },
            { label: `Nuevos ${kpiSuffix}`, value: String(cliKpis.nuevosMes), tone: "success" },
            { label: "Activos", value: String(cliKpis.activos), tone: "neutral" },
            { label: "Ticket prom.", value: fmtPEN(cliKpis.ticketProm), tone: "primary" },
          ]}
        >
          <BulejeComposedChart
            data={cliChart}
            xKey="day"
            bars={[
              { key: "nuevos", label: "Nuevos", color: "primary", yAxis: "left" },
              { key: "recurrentes", label: "Recurrentes", color: "tertiary", yAxis: "left" },
            ]}
            lines={[{ key: "ticketProm", label: "Ticket prom. S/", color: "accent", yAxis: "right" }]}
            leftAxisFormat={(v) => v.toString()}
            rightAxisFormat={(v) => `S/${v}`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("ticket")
                ? `S/ ${Number(v).toLocaleString("es-PE")}`
                : Number(v).toLocaleString("es-PE")
            }
            height={300}
            minDataPoints={2}
          />
        </DashboardSection>
      ),
    },
    {
      id: "productos",
      render: () => (
        <DashboardSection
          hideHeader
          kicker={`Productos · top 7 · ${rangeLabel}`}
          title="Unidades, ingresos y margen por producto"
          kpis={[
            { label: "SKUs activos", value: String(prodKpis.activos), tone: "neutral" },
            {
              label: "Best seller",
              value: prodKpis.best.length > 14 ? prodKpis.best.slice(0, 13) + "…" : prodKpis.best,
              tone: "success",
            },
            { label: "Ingresos top-7", value: fmtPEN(prodKpis.ingresos), tone: "primary" },
            {
              label: "Margen prom.",
              value: `${prodKpis.margenPct}%`,
              tone: prodKpis.margenPct >= 25 ? "success" : "warning",
            },
          ]}
        >
          <BulejeComposedChart
            data={prodChart}
            xKey="producto"
            bars={[{ key: "unidades", label: "Unidades", color: "primary", yAxis: "left" }]}
            lines={[{ key: "ingresos", label: "Ingresos S/", color: "accent", yAxis: "right" }]}
            areas={[
              { key: "margen", label: "Margen S/", color: "tertiary", yAxis: "right", opacity: 0.2 },
            ]}
            leftAxisFormat={(v) => v.toString()}
            rightAxisFormat={(v) => `S/${(v / 1000).toFixed(0)}k`}
            tooltipFormat={(v, name) =>
              name?.toLowerCase().includes("unidades")
                ? `${Number(v).toLocaleString("es-PE")} u`
                : `S/ ${Number(v).toLocaleString("es-PE")}`
            }
            height={300}
            minDataPoints={1}
          />
        </DashboardSection>
      ),
    },
  ];

  // layout="grid" (2026-04-24): los 5 charts (caja, inventario, compras,
  // clientes, productos) se renderizan 2 por fila en lg+ en vez de 1 por
  // fila. Reduce el scroll y permite leer comparaciones en paralelo.
  return (
    <DraggableSections
      items={sections}
      storageKey="inicio-multi-order"
      layout="grid"
    />
  );
});
