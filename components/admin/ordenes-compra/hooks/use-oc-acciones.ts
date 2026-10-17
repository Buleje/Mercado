import { leerJson } from "@/lib/errores/sin-dato";
import type { DbRecurringPurchase } from "@/lib/db/recurring-purchases.db";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbPurchaseOrder, DbProduct, PurchaseStatus } from "@/lib/jsondb";
import { formatCurrency } from "@/lib/format";
import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";
import { useOcModales } from "@/components/admin/ordenes-compra/hooks/use-oc-modales";
import { useOcCarga } from "@/components/admin/ordenes-compra/hooks/use-oc-carga";
import { useOcFormulario } from "@/components/admin/ordenes-compra/hooks/use-oc-formulario";

/** Acciones sobre órdenes y recurrentes (van después de `load`, que usan). Parte de `useOrdenesCompra`. */
export function useOcAcciones(previo: ReturnType<typeof useOcEstado> & ReturnType<typeof useOcRecurrentes> & ReturnType<typeof useOcModales> & ReturnType<typeof useOcCarga> & ReturnType<typeof useOcFormulario>) {
  const {
    confirm, orders, setOrders, suppliers, avisar, setRecurringOrders, setShowRecurringModal,
    recurringInterval, recurringNotifyDays, setGuardandoRecurrente, recurrentesRef, cargarRecurrentes,
    ordenesRef, load,
  } = previo;
  const addRecurringOrder = async (oc: DbPurchaseOrder) => {
    const sup = suppliers.find(s => s.id === oc.supplierId);
    setGuardandoRecurrente(true);
    try {
      const res = await fetch("/api/compras/recurrentes", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: oc.supplierId,
          supplierName: sup?.name || oc.supplierName || "",
          items: oc.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })),
          intervalDays: recurringInterval,
          notifyDaysBefore: recurringNotifyDays,
          paymentMethod: oc.paymentMethod,
        }),
      });
      if (!res.ok) {
        avisar("No se pudo programar el pedido recurrente", "error");
        return;
      }
      avisar(`Listo: se repite cada ${recurringInterval} días`);
      setShowRecurringModal(null);
      cargarRecurrentes();
    } catch {
      avisar("Sin conexión con el servidor — no se programó", "error");
    } finally {
      setGuardandoRecurrente(false);
    }
  };

  const removeRecurring = async (id: string) => {
    recurrentesRef.current.cambios += 1;
    try {
      const res = await fetch(`/api/compras/recurrentes/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) { avisar("No se pudo eliminar la recurrencia", "error"); return; }
      setRecurringOrders(prev => prev.filter(r => r.id !== id));
    } catch {
      avisar("Sin conexión con el servidor", "error");
    } finally {
      // La carga que estaba en vuelo se descartó: esta trae lo guardado.
      void cargarRecurrentes();
    }
  };

  /**
   * Pausar o activar una recurrencia (o una plantilla de Punto de compra, que nace pausada). Activar
   * una cuya fecha ya pasó la corre a un ciclo desde hoy: si no, nacería «Atrasada» y avisaría ya.
   */
  const cambiarActivo = async (r: DbRecurringPurchase, activo: boolean) => {
    recurrentesRef.current.cambios += 1;
    const cuerpo: { active: boolean; nextDate?: string } = { active: activo };
    if (activo && new Date(r.nextDate).getTime() < Date.now()) {
      cuerpo.nextDate = new Date(Date.now() + r.intervalDays * 86400000).toISOString();
    }
    setRecurringOrders(prev => prev.map(x => x.id === r.id ? { ...x, active: activo, nextDate: cuerpo.nextDate ?? x.nextDate } : x));
    try {
      const res = await fetch(`/api/compras/recurrentes/${r.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) { avisar(activo ? "No se pudo activar el pedido" : "No se pudo pausar el pedido", "error"); return; }
      avisar(activo ? `Activado: se repite cada ${r.intervalDays} días` : "Pausado: no se repite ni avisa hasta que lo actives");
    } catch {
      avisar("Sin conexión con el servidor", "error");
    } finally {
      // La carga que estaba en vuelo se descartó: esta trae lo guardado (y deshace si falló).
      void cargarRecurrentes();
    }
  };

  /** Crea la orden ahora y corre la fecha al siguiente ciclo. */
  const generarDesdeRecurrente = async (id: string) => {
    try {
      const res = await fetch(`/api/compras/recurrentes/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ generar: true }),
      });
      if (!res.ok) { avisar("No se pudo crear la orden", "error"); return; }
      avisar("Orden creada — revisa las cantidades antes de enviarla");
      load();
      cargarRecurrentes();
    } catch {
      avisar("Sin conexión con el servidor — no se creó la orden", "error");
    }
  };
  // El estado sólo cambia en pantalla si el servidor lo aceptó. Antes esto
  // ignoraba la respuesta y pintaba "Recibido" aunque el PATCH devolviera 422:
  // la orden se veía cerrada y el stock nunca subía.
  const updateStatus = async (id: string, status: PurchaseStatus) => {
    const orden = orders.find(o => o.id === id);
    const anterior = orden?.status;
    // Cancelar cierra la orden y anula su cuenta por pagar: no es un cambio de
    // estado más, y salía del `<select>` sin preguntar nada.
    if (status === "cancelado") {
      const aCredito = (orden?.paymentMethod ?? "").startsWith("credito_");
      const ok = await confirm({
        title: `¿Cancelar la orden de ${orden?.supplierName || "este proveedor"}?`,
        description: `Por ${formatCurrency(Number(orden?.total ?? 0))}.` +
          (aCredito ? " Se anulará también la cuenta por pagar que generó (salvo que ya tenga pagos)." : "") +
          " Una orden cancelada no vuelve atrás.",
        intent: "danger",
        confirmLabel: "Sí, cancelar",
      });
      if (!ok) return;
    }
    ordenesRef.current.cambios += 1;
    // Recibido, parcial y cancelado recargan con spinner, como antes; el resto, en silencio.
    let recargaConSpinner = false;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        if (anterior) setOrders(prev => prev.map(o => o.id === id ? { ...o, status: anterior } : o));
        // El cuerpo puede no ser JSON (502 de un proxy, por ejemplo): en ese
        // caso cae al mensaje genérico con el código.
        const detalle = await res.json().catch((err) => {
          console.warn("[compras] respuesta de error sin JSON", err);
          return null;
        });
        avisar(
          typeof detalle?.error === "string"
            ? detalle.error
            : `No se pudo cambiar el estado (error ${res.status})`,
          "error",
        );
        return;
      }
      // Marcar recibido mueve stock: recargar para ver los totales reales.
      if (status === "recibido" || status === "parcial") recargaConSpinner = true;
      if (status === "cancelado") {
        const detalle = await leerJson<{ cuentaPorPagar?: string }>(res);
        avisar(
          detalle?.cuentaPorPagar === "conservada_con_pagos"
            ? "Orden cancelada. La cuenta por pagar quedó abierta porque ya tenía pagos registrados."
            : detalle?.cuentaPorPagar === "anulada"
              ? "Orden cancelada y su cuenta por pagar anulada."
              : "Orden cancelada.",
          detalle?.cuentaPorPagar === "conservada_con_pagos" ? "error" : "ok",
        );
        recargaConSpinner = true;
      }
    } catch {
      if (anterior) setOrders(prev => prev.map(o => o.id === id ? { ...o, status: anterior } : o));
      avisar("Sin conexión con el servidor — el estado no se guardó", "error");
    } finally {
      // La carga que estaba en vuelo se descartó: esta trae lo guardado.
      void load({ silenciosa: !recargaConSpinner });
    }
  };

  const _receiveOrder = async (id: string) => {
    await updateStatus(id, "recibido");
    const po = orders.find(o => o.id === id);
    if (po) {
      const freshProds: DbProduct[] = await fetch("/api/products").then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : []);
      for (const item of po.items) {
        const prod = freshProds.find(p => p.id === item.productId);
        if (prod) {
          await fetch(`/api/products/${item.productId}`, {
            method: "PUT",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ stock: (prod.stock ?? 0) + item.quantity, costPrice: item.unitCost }),
          });
        } else {
          await fetch("/api/products", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              name: item.name, category: "abarrotes", price: item.unitCost,
              costPrice: item.unitCost, unit: item.unit, stock: item.quantity, active: true,
            }),
          });
        }
      }
    }
    load();
  };

  const deleteOrder = async (id: string) => {
    if (!(await confirm({
      title: "¿Eliminar esta orden de compra?",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;
    await fetch(`/api/purchases/${id}`, { method: "DELETE", headers: csrfHeaders() });
    load();
  };

  // Mejora 19: Duplicar OC
  const duplicateOrder = async (o: DbPurchaseOrder) => {
    try {
      const sup = suppliers.find(s => s.id === o.supplierId);
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: o.supplierId,
          supplierName: sup?.name || o.supplierName || "",
          items: o.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })),
          notes: o.notes ? `(Duplicada) ${o.notes}` : "(Duplicada)",
        }),
      });
      if (res.ok) {
        avisar("OC duplicada — revisa las cantidades antes de enviar");
        load();
      } else {
        avisar("No se pudo duplicar la orden", "error");
      }
    } catch {
      avisar("Sin conexión con el servidor — no se duplicó la orden", "error");
    }
  };
  return {
    cambiarActivo,
    addRecurringOrder, removeRecurring, generarDesdeRecurrente, updateStatus, _receiveOrder,
    deleteOrder, duplicateOrder,
  };
}
