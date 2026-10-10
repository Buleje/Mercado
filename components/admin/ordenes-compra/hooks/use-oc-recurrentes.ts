import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { DbPurchaseOrder } from "@/lib/jsondb";
// Sólo el tipo: TS lo borra al compilar, así que el "server-only" de esa clase
// no viaja al bundle del cliente (mismo patrón que el resto del repo).
import type { DbRecurringPurchase } from "@/lib/db/recurring-purchases.db";
import { formatDateLong } from "@/lib/format";

/** Pedidos recurrentes (ADR-377): carga y próximos. Parte de `useOrdenesCompra`. */
export function useOcRecurrentes() {
  // Pedidos recurrentes (ADR-377). Antes vivían en localStorage: se perdían
  // al abrir el admin en otro equipo y nadie más del negocio los veía.
  const [recurringOrders, setRecurringOrders] = useState<DbRecurringPurchase[]>([]);
  const [showRecurringModal, setShowRecurringModal] = useState<DbPurchaseOrder | null>(null);
  const [recurringInterval, setRecurringInterval] = useState(15);
  const [recurringNotifyDays, setRecurringNotifyDays] = useState(2);
  const [guardandoRecurrente, setGuardandoRecurrente] = useState(false);

  // Una carga que salió antes de un cambio trae la lista vieja: el GET del doble
  // montaje (o el que sigue a «Crear OC ahora») podía volver después de eliminar
  // y la recurrencia borrada reaparecía (mismo bug que Tareas, 2026-09-14). Sólo
  // aplica su lista la carga más nueva y sin cambios de por medio.
  const recurrentesRef = useRef({ ultima: 0, cambios: 0 });
  const cargarRecurrentes = useCallback(async () => {
    const esta = ++recurrentesRef.current.ultima;
    const cambiosAlSalir = recurrentesRef.current.cambios;
    try {
      const res = await fetch("/api/compras/recurrentes");
      if (res.ok) {
        const lista = (await res.json()) as DbRecurringPurchase[];
        if (esta === recurrentesRef.current.ultima && cambiosAlSalir === recurrentesRef.current.cambios) setRecurringOrders(lista);
      }
    } catch (err) {
      console.warn("[compras] no se pudieron cargar los pedidos recurrentes", err);
    }
  }, []);

  useEffect(() => { void cargarRecurrentes(); }, [cargarRecurrentes]);
  // Cuánto falta para cada uno. Date.now() intencional (componente cliente).
  const upcomingRecurring = useMemo(() => {
    const now = Date.now();
    return recurringOrders
      .filter(r => r.active)
      .map(r => ({
        ...r,
        daysUntil: Math.max(0, Math.ceil((new Date(r.nextDate).getTime() - now) / 86400000)),
        vencido: new Date(r.nextDate).getTime() < now,
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringOrders]);

  // Las pausadas (una plantilla de Punto de compra o una recurrencia detenida): antes no se veían
  // en ningún lado de Órdenes y no había cómo activarlas. La última tocada, primero.
  const pausados = useMemo(
    () => recurringOrders.filter(r => !r.active).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [recurringOrders],
  );

  // Fecha del próximo pedido recurrente para el modal
  const nextRecurringDateLabel = useMemo(() => {
    /* Sólo se lee con el modal abierto. Mirarlo acá vuelve real la dependencia:
       al abrir el modal se recalcula con la fecha de HOY. */
    if (!showRecurringModal) return "";
    const baseMs = Date.now();
    return formatDateLong(baseMs + recurringInterval * 86400000);
  }, [recurringInterval, showRecurringModal]);
  return {
    recurringOrders, setRecurringOrders, showRecurringModal, setShowRecurringModal, recurringInterval,
    setRecurringInterval, recurringNotifyDays, setRecurringNotifyDays, guardandoRecurrente,
    setGuardandoRecurrente, recurrentesRef, cargarRecurrentes, upcomingRecurring,
    pausados, nextRecurringDateLabel,
  };
}
