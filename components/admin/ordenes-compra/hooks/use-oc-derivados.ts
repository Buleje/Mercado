import { useMemo } from "react";
import { formatMonth } from "@/lib/format";
import { esAutomatica, mesEnLima } from "@/components/admin/ordenes-compra/oc-compartido";
import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";
import { useOcModales } from "@/components/admin/ordenes-compra/hooks/use-oc-modales";
import { useOcCarga } from "@/components/admin/ordenes-compra/hooks/use-oc-carga";
import { useOcFormulario } from "@/components/admin/ordenes-compra/hooks/use-oc-formulario";
import { useOcAcciones } from "@/components/admin/ordenes-compra/hooks/use-oc-acciones";

/** Totales de vista previa, indicadores y números por proveedor. Parte de `useOrdenesCompra`. */
export function useOcDerivados(previo: ReturnType<typeof useOcEstado> & ReturnType<typeof useOcRecurrentes> & ReturnType<typeof useOcModales> & ReturnType<typeof useOcCarga> & ReturnType<typeof useOcFormulario> & ReturnType<typeof useOcAcciones>) {
  const {
    orders, f, items, discount, flete, otrosCostos,
  } = previo;
  const itemsTotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  // Preview: el total que manda es el que calcula el backend con la misma
  // fórmula (regla 6 — totales en backend, el cliente sólo anticipa).
  const totalConDescuento = Math.max(0, itemsTotal * (1 - discount / 100));
  // ADR-377: flete y otros costos NO van en el total que se le paga al
  // proveedor por la mercadería, pero sí en lo que cuesta tenerla en el local.
  const sobrecostos = flete + otrosCostos;

  // Lo que se pinta: la página actual de lo filtrado (el hook ordena y corta).
  const filteredOrders = f.visibles;

  // KPIs por estado (sobre todas las órdenes, no filtradas — para que el chip mantenga el counter)
  const kpis = useMemo(() => {
    const counts = { pendiente: 0, parcial: 0, recibido: 0, cancelado: 0, auto_generated: 0 };
    let totalAcumulado = 0;
    let totalMes = 0;
    let canceladas = 0;
    let montoCancelado = 0;
    let montoPorRecibir = 0;
    // El mes de Lima, no el de UTC: a las 7 p. m. del 31 la cuenta ya saltaba al mes siguiente.
    const mesActual = mesEnLima(new Date());
    for (const o of orders) {
      if (counts[o.status as keyof typeof counts] != null) counts[o.status as keyof typeof counts] += 1;
      // Una orden cancelada no se le compró a nadie: sumarla al acumulado
      // inflaba «lo que llevás comprado» con pedidos que nunca existieron.
      if (o.status === "cancelado") {
        canceladas += 1;
        montoCancelado += o.total;
        continue;
      }
      totalAcumulado += o.total;
      if (o.status !== "recibido") montoPorRecibir += o.total;
      if (mesEnLima(o.createdAt) === mesActual) totalMes += o.total;
    }
    const porRecibir = counts.pendiente + counts.parcial + counts.auto_generated;
    return { counts, totalAcumulado, totalMes, canceladas, montoCancelado, porRecibir, montoPorRecibir, total: orders.length };
  }, [orders]);

  /**
   * Órdenes automáticas abiertas que repiten el MISMO pedido al mismo proveedor (10-10, main:
   * 33 de 35 pendientes eran «Atún Florida ×40» a Frigorífico Amazonia, una por día: el
   * reabastecimiento no mira si ya hay una abierta). Se avisa el grupo más grande.
   */
  const repetidas = useMemo(() => {
    const grupos = new Map<string, { supplierId: string; proveedor: string; detalle: string; n: number }>();
    for (const o of orders) {
      if (!esAutomatica(o) || !["pendiente", "auto_generated"].includes(o.status)) continue;
      const firma = o.items.map((i) => `${i.productId}:${i.quantity}`).sort().join("|");
      const clave = `${o.supplierId}#${firma}`;
      const g = grupos.get(clave);
      if (g) g.n += 1;
      else grupos.set(clave, {
        supplierId: o.supplierId,
        proveedor: o.supplierName ?? "",
        detalle: o.items.slice(0, 2).map((i) => `${i.name} ×${i.quantity}`).join(", ") + (o.items.length > 2 ? "…" : ""),
        n: 1,
      });
    }
    return [...grupos.values()].filter((g) => g.n > 1).sort((a, b) => b.n - a.n)[0] ?? null;
  }, [orders]);

  // Supplier analytics
  const getSupplierStats = (supplierId: string) => {
    const supplierOrders = orders.filter(o => o.supplierId === supplierId);
    const totalAmount = supplierOrders.reduce((s, o) => s + o.total, 0);
    const avgAmount = supplierOrders.length > 0 ? totalAmount / supplierOrders.length : 0;
    const lastPurchase = supplierOrders.length > 0 ? supplierOrders[0].createdAt : null;
    
    // Top 3 products
    const productCounts: Record<string, { id: string; name: string; count: number; total: number }> = {};
    for (const order of supplierOrders) {
      for (const item of order.items) {
        const key = String(item.productId);
        if (!productCounts[key]) {
          productCounts[key] = { id: key, name: item.name, count: 0, total: 0 };
        }
        productCounts[key].count += item.quantity;
        productCounts[key].total += item.quantity * item.unitCost;
      }
    }
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // Monthly spending (last 6 months)
    const monthlyData: Array<{ month: string; amount: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const monthKey = d.toISOString().slice(0, 7);
      const monthLabel = formatMonth(d);
      const monthOrders = supplierOrders.filter(o => o.createdAt.startsWith(monthKey));
      const monthTotal = monthOrders.reduce((s, o) => s + o.total, 0);
      monthlyData.push({ month: monthLabel, amount: monthTotal });
    }

    return {
      count: supplierOrders.length,
      totalAmount,
      avgAmount,
      lastPurchase,
      topProducts,
      monthlyData,
    };
  };
  return {
    itemsTotal, totalConDescuento, sobrecostos, filteredOrders, kpis, repetidas, getSupplierStats,
  };
}
