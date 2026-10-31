"use client";

/**
 * La tarjeta del tablero envuelta para arrastrarla entre columnas (dnd-kit).
 * Un pase de estado inválido la sacude (`shake`) y vuelve a su columna.
 * Quien no puede mover pedidos (almacenero) no la arrastra: le daba 403.
 * Sin arrastre tampoco van los atributos de dnd-kit: traen `aria-disabled`
 * en el envoltorio y la tarjeta entera (con su botón de detalle) se anunciaba
 * deshabilitada — Playwright no la podía abrir (17-10) — y `touch-none` le
 * impedía al almacenero desplazar la columna con el dedo encima de una tarjeta.
 */
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { usePermisosPedidos } from "../permisos-pedidos";
import { TarjetaPedido, type TarjetaPedidoProps } from "./TarjetaPedido";

/** La tarjeta que se arrastra entre columnas (dnd-kit). */
export function TarjetaArrastrable({ shake, ...props }: TarjetaPedidoProps & { shake?: boolean }) {
  const { mover } = usePermisosPedidos();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.order.id,
    data: { order: props.order },
    disabled: !mover,
  });
  return (
    <div
      ref={setNodeRef}
      {...(mover ? attributes : {})}
      {...(mover ? listeners : {})}
      /* dnd-kit pone `role="button"` en el envoltorio, pero la tarjeta adentro
         tiene su botón de detalle y sus acciones: un botón que contiene botones
         (axe 2026-09-12: 18 «nested-interactive»). `group` no miente el rol. */
      role="group"
      aria-roledescription={mover ? "tarjeta arrastrable" : undefined}
      aria-label={`Pedido de ${props.order.customer.name}`}
      className={cn(
        "outline-none",
        !mover ? "cursor-default" : isDragging ? "touch-none cursor-grabbing opacity-30" : "touch-none cursor-grab",
      )}
      style={
        shake
          ? { animation: "orders-kanban-shake 0.5s cubic-bezier(.36,.07,.19,.97) both" }
          : undefined
      }
    >
      {shake && (
        <style>{`@keyframes orders-kanban-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}`}</style>
      )}
      <TarjetaPedido {...props} />
    </div>
  );
}
