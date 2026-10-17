import { leerJson } from "@/lib/errores/sin-dato";
import type { DbRecurringPurchase } from "@/lib/db/recurring-purchases.db";
import { csrfHeaders } from "@/lib/csrf-client";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { motivoSuficiente } from "@/lib/validations/motivo";
import type { DbPurchaseOrder, PurchaseStatus } from "@/lib/jsondb";
import { limaDateKey } from "@/lib/utils";
import { efectoDeLaCondicion } from "@/lib/compras/estados-oc";
import { planParaRepetir, resumenCancelacion } from "@/lib/compras/ciclo-oc";
import type { OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";
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
  const { prompt } = useConfirm();
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
    // Cancelar cierra la orden y ajusta su cuenta por pagar a lo que llegó: no
    // es un cambio de estado más, y salía del `<select>` sin preguntar nada.
    let cancelReason: string | undefined;
    if (status === "cancelado") {
      // C15: lo que pasa con lo recibido, lo que falta y la plata, ANTES de
      // confirmar. La regla es la del servidor; acá sólo se muestra.
      // b-9 (Brandon 17-10, «Motivo siempre»): y el porqué, que el servidor exige.
      const motivo = await prompt({
        title: `¿Cancelar la orden de ${orden?.supplierName || "este proveedor"} por ${formatCurrency(Number(orden?.total ?? 0))}?`,
        description: orden ? resumenCancelacion(orden, orden.seguimiento).join("\n") : "Una orden cancelada no vuelve atrás.",
        intent: "danger",
        confirmLabel: "Sí, cancelar",
        label: "Motivo de la cancelación",
        placeholder: "Ej.: el proveedor no tiene stock",
        required: true,
        validar: motivoSuficiente,
      });
      if (motivo === null) return;
      cancelReason = motivo.trim().slice(0, 300);
    }
    ordenesRef.current.cambios += 1;
    // Recibido, parcial y cancelado recargan con spinner, como antes; el resto, en silencio.
    let recargaConSpinner = false;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(cancelReason ? { status, cancelReason } : { status }),
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
        const detalle = await leerJson<{ cuentaPorPagar?: string; montoAntes?: number; montoDespues?: number }>(res);
        avisar(
          detalle?.cuentaPorPagar === "conservada_con_pagos"
            ? "Orden cancelada. La cuenta por pagar quedó abierta porque ya tenía pagos registrados."
            : detalle?.cuentaPorPagar === "anulada"
              ? "Orden cancelada y su cuenta por pagar anulada: no llegó nada."
              : detalle?.cuentaPorPagar === "ajustada"
                ? `Orden cancelada. La deuda bajó de ${formatCurrency(Number(detalle.montoAntes ?? 0))} a ${formatCurrency(Number(detalle.montoDespues ?? 0))}: lo que llegó.`
                : detalle?.cuentaPorPagar === "sin_cambio"
                  ? "Orden cancelada. La deuda se queda: es lo que vale lo que llegó."
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

  const deleteOrder = async (id: string) => {
    if (!(await confirm({
      title: "¿Eliminar esta orden de compra?",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    }))) return;
    await fetch(`/api/purchases/${id}`, { method: "DELETE", headers: csrfHeaders() });
    load();
  };

  /**
   * C16 · Repetir con revisión: antes de crear la copia dice qué tan vieja es
   * la original y qué costos cambiaron desde entonces (salen con el de tu
   * última compra). Comprobante, flete, pagos y fecha de entrega no se copian;
   * «ya pagada» tampoco: la nueva no está pagada.
   */
  const repetirOrden = async (o: OrdenOC) => {
    const plan = planParaRepetir(o, orders, limaDateKey());
    const lineas = [
      `La original es del ${plan.dia}${plan.dias > 0 ? ` (hace ${plan.dias} día${plan.dias === 1 ? "" : "s"})` : ""}.`,
      ...(plan.cambios.length > 0
        ? ["Sale con el costo de tu última compra:", ...plan.cambios.map((c) => `· ${c.nombre}: ${formatCurrency(c.antes)} → ${formatCurrency(c.ahora)} (${c.dia})`)]
        : ["Los costos son los mismos de tu última compra."]),
      plan.condicionCambio
        ? "La original ya estaba pagada: la nueva sale al contado."
        : efectoDeLaCondicion(plan.paymentMethod),
      "No se copian el comprobante, el flete, los pagos ni la fecha de entrega. Queda pendiente: revisa las cantidades antes de enviarla.",
    ];
    const ok = await confirm({
      title: `¿Repetir la orden de ${o.supplierName || "este proveedor"}?`,
      description: lineas.join("\n"),
      confirmLabel: "Repetir",
    });
    if (!ok) return;
    try {
      const sup = suppliers.find(s => s.id === o.supplierId);
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: o.supplierId,
          supplierName: sup?.name || o.supplierName || "",
          items: plan.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: i.unitCost, unit: i.unit })),
          paymentMethod: plan.paymentMethod,
          discount: o.discount ?? 0,
          igvIncluded: o.igvIncluded ?? true,
          notes: `(Repetida de la orden del ${plan.dia})`,
        }),
      });
      if (res.ok) {
        avisar("Orden repetida: revisa las cantidades antes de enviarla");
        load();
      } else {
        const detalle = await leerJson<{ error?: unknown }>(res);
        avisar(typeof detalle?.error === "string" ? detalle.error : "No se pudo repetir la orden", "error");
      }
    } catch {
      avisar("Sin conexión con el servidor — no se repitió la orden", "error");
    }
  };
  return {
    cambiarActivo,
    addRecurringOrder, removeRecurring, generarDesdeRecurrente, updateStatus,
    deleteOrder, repetirOrden,
  };
}
