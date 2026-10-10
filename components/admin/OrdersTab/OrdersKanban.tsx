"use client";

/**
 * Pedidos y reparto › Tablero: los pedidos en marcha en cuatro columnas (Por
 * confirmar · Confirmado · Preparando · En camino) para MOVERLOS: cada
 * tarjeta trae la acción que la pasa al siguiente paso y se arrastra de una
 * columna a otra. Buscar, ordenar, elegir varios e imprimir es tarea de la
 * Lista (10-10, Brandon: «cada pestaña cumple su tarea»).
 *
 * El ancho manda (no la pantalla): con 52rem o más, cuatro columnas; desde
 * 34rem, dos; más angosto, una sola con la barra de secciones arriba. Antes
 * eran cuatro desde `lg` aunque el menú lateral dejara ~230 px a cada una.
 * Se dibuja UNA sola disposición: la doble (celular + escritorio) registraba
 * dos veces cada tarjeta y cada columna en el arrastre.
 *
 * Partido el 10-10 de 822 líneas: tarjeta en `kanban/TarjetaPedido`, columna
 * en `kanban/ColumnaKanban`, la configuración en `kanban/columnas`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ShoppingBasket } from "@buleje/design-system/icons";
import { EmptyState } from "@/components/admin/EmptyState";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { COLUMNAS, type ColumnId } from "./kanban/columnas";
import { ColumnaKanban } from "./kanban/ColumnaKanban";
import { TarjetaPedido } from "./kanban/TarjetaPedido";
import { masEsperaPrimero } from "./tiempo-en-estado";
import { VALID_TRANSITIONS } from "./types";

interface OrdersKanbanProps {
  activeOrders: DbOrder[];
  loading: boolean;
  /** Hay filtros puestos: el vacío lo dice («con estos filtros»). */
  conFiltros?: boolean;
  storeLat: number | null;
  storeLon: number | null;
  driverColor: (name: string) => string;
  onSelectOrder: (order: DbOrder) => void;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onVerifyYape: (id: string) => void;
  onRejectYape: (id: string) => void;
  onMarkDeudaPaid: (id: string) => void;
  /** Entrega sin reparto con su motivo (va al historial del pedido). */
  onManualDelivery?: (id: string, reason: string) => void;
}

const ID_PANEL = "pedidos-tablero-columna";
/** 34rem y 52rem a 16 px: desde ahí, dos y cuatro columnas. */
const DOS_COLUMNAS = 544;
const CUATRO_COLUMNAS = 832;
const nada = () => {};

/**
 * El ancho del contenedor (no de la pantalla). Ref de función: el contenedor
 * nace recién cuando llegan los pedidos (antes está el esqueleto) y un
 * `useRef` + efecto al montar no lo vería nunca. Sin ResizeObserver (jsdom):
 * ancho infinito, cuatro columnas.
 */
function useAncho<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [ancho, setAncho] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [el]);
  return { ref: setEl, ancho };
}

export function OrdersKanban({
  activeOrders,
  loading,
  conFiltros = false,
  storeLat,
  storeLon,
  driverColor,
  onSelectOrder,
  onUpdateStatus,
  onVerifyYape,
  onRejectYape,
  onMarkDeudaPaid,
  onManualDelivery,
}: OrdersKanbanProps) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  /* En angosto: la columna que se eligió; sin elegir, la primera con pedidos. */
  const [elegida, setElegida] = useState<ColumnId | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  /* Salto de estado inválido (Por confirmar → Preparando): sin el sacudón y el
     aviso, la tarjeta vuelve a su columna y parece que el arrastre no anda. */
  const [rejectedId, setRejectedId] = useState<string | null>(null);
  const rejectedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (rejectedTimeoutRef.current) clearTimeout(rejectedTimeoutRef.current);
    },
    [],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const overId = e.over?.id;
    const activeId = String(e.active.id);
    if (!overId) return;
    const target = COLUMNAS.find((c) => c.id === overId);
    const order = activeOrders.find((o) => o.id === activeId);
    if (!target || !order || order.status === target.id) return;
    if (!(VALID_TRANSITIONS[order.status] ?? []).includes(target.id as OrderStatus)) {
      const from = COLUMNAS.find((c) => c.id === order.status)?.label ?? order.status;
      toast.error(`No se puede pasar de "${from}" a "${target.label}" directo`, {
        description: "Primero pasa por los estados intermedios del pedido.",
      });
      if (rejectedTimeoutRef.current) clearTimeout(rejectedTimeoutRef.current);
      setRejectedId(activeId);
      rejectedTimeoutRef.current = setTimeout(() => setRejectedId(null), 500);
      return;
    }
    onUpdateStatus(activeId, target.id as OrderStatus);
  };

  const draggedOrder = activeDragId
    ? (activeOrders.find((o) => o.id === activeDragId) ?? null)
    : null;

  /* Dentro de cada columna, el que más espera primero: lo atrasado no queda tapado por «Ver los N». */
  const columnsData = useMemo(() => {
    const map: Record<ColumnId, DbOrder[]> = {
      pendiente: [],
      confirmado: [],
      preparando: [],
      en_camino: [],
    };
    for (const o of activeOrders) if (o.status in map) map[o.status as ColumnId].push(o);
    for (const lista of Object.values(map)) lista.sort(masEsperaPrimero);
    return map;
  }, [activeOrders]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        {[1, 2, 3, 4].map((c) => (
          <div key={c} className="space-y-2">
            <div className="h-10 rounded-lg skeleton-shimmer" />
            {[1, 2].map((i) => (
              <div key={i} className="h-36 rounded-xl skeleton-shimmer" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (activeOrders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket className="h-10 w-10 text-[var(--text-tertiary)]" />}
        title={
          conFiltros
            ? "No hay pedidos en marcha con estos filtros"
            : "No hay pedidos en marcha: los nuevos aparecen aquí al momento"
        }
        actions={[]}
      />
    );
  }

  const angosto = ancho < DOS_COLUMNAS;
  const activa = elegida ?? COLUMNAS.find((c) => columnsData[c.id].length > 0)?.id ?? "pendiente";
  const visibles = angosto ? COLUMNAS.filter((c) => c.id === activa) : COLUMNAS;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div ref={ref} className="min-w-0 space-y-2">
        {angosto && (
          <BarraDeSecciones
            secciones={COLUMNAS.map((c) => ({
              clave: c.id,
              rotulo: c.label,
              cuenta: columnsData[c.id].length,
            }))}
            activa={activa}
            onCambiar={setElegida}
            etiqueta="Columnas del tablero"
            idPanel={ID_PANEL}
          />
        )}
        <div
          id={angosto ? ID_PANEL : undefined}
          role={angosto ? "tabpanel" : undefined}
          aria-labelledby={angosto ? idPestanaDeSeccion(ID_PANEL, activa) : undefined}
          className={cn(
            "grid gap-3",
            !angosto && (ancho >= CUATRO_COLUMNAS ? "grid-cols-4" : "grid-cols-2"),
          )}
        >
          {visibles.map((col) => (
            <ColumnaKanban
              key={col.id}
              columna={col}
              orders={columnsData[col.id]}
              conCabecera={!angosto}
              storeLat={storeLat}
              storeLon={storeLon}
              nowMs={nowMs}
              driverColor={driverColor}
              rejectedId={rejectedId}
              isActiveTarget={!!draggedOrder && draggedOrder.status !== col.id}
              onSelectOrder={onSelectOrder}
              onUpdateStatus={onUpdateStatus}
              onVerifyYape={onVerifyYape}
              onRejectYape={onRejectYape}
              onMarkDeudaPaid={onMarkDeudaPaid}
              onManualDelivery={onManualDelivery}
            />
          ))}
        </div>
      </div>

      {/* La tarjeta que flota mientras se arrastra. */}
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
        {draggedOrder ? (
          <div className="rotate-2 scale-105 rounded-xl shadow-[var(--shadow-xl)] ring-2 ring-[var(--accent)]">
            <TarjetaPedido
              order={draggedOrder}
              storeLat={storeLat}
              storeLon={storeLon}
              nowMs={nowMs}
              driverColor={driverColor}
              onSelect={nada}
              onUpdateStatus={nada}
              onVerifyYape={nada}
              onRejectYape={nada}
              onMarkDeudaPaid={nada}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
