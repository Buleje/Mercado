"use client";

/**
 * «Para asignar necesitas…» (17-10, P25/M47).
 *
 * Antes el botón «Asignar» salía apagado sin decir por qué (sólo un `title`
 * que el celular no muestra). Ahora se ve lo que falta, cuánto hay de cada
 * cosa y un botón que lleva a resolverlo.
 */
import { CheckCircle, Circle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { cn } from "@/lib/utils";

const RUTA_TABLERO = "/admin?tab=pedidos&vista=tablero";

function Requisito({
  listo,
  titulo,
  detalle,
  accion,
}: {
  listo: boolean;
  titulo: string;
  detalle: string;
  accion?: { texto: string; onClick: () => void };
}) {
  const Icono = listo ? CheckCircle : Circle;
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <Icono
        className={cn("h-5 w-5 shrink-0", listo ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]")}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{titulo}</span>
        <span className="block text-sm text-[var(--text-secondary)]">{detalle}</span>
      </span>
      {!listo && accion && (
        <button type="button" onClick={accion.onClick} className={button({ variant: "secondary" })}>
          {accion.texto}
        </button>
      )}
    </li>
  );
}

export function AsignacionesPrerrequisitos({
  repartidores,
  pedidos,
  cargandoPedidos,
  onIrEquipo,
}: {
  /** Repartidores que reciben pedidos. */
  repartidores: number;
  /** Pedidos esperando repartidor; null si no se pudieron traer. */
  pedidos: number | null;
  cargandoPedidos: boolean;
  onIrEquipo: () => void;
}) {
  const detallePedidos = cargandoPedidos
    ? "Buscando pedidos…"
    : pedidos == null
      ? "No se pudieron traer los pedidos. Actualiza desde «Más»."
      : pedidos === 0
        ? "Ninguno esperando: confírmalo en el Tablero y vuelve."
        : `${pedidos} esperando repartidor`;
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-bold text-[var(--text-primary)]">Para asignar necesitas</p>
      <ul className="divide-y divide-[var(--rule-soft)]">
        <Requisito
          listo={repartidores > 0}
          titulo="Un repartidor que recibe pedidos"
          detalle={
            repartidores > 0
              ? `${repartidores} en tu equipo`
              : "Ninguno todavía: agrégalo en Equipo o prende «Recibe pedidos»."
          }
          accion={{ texto: "Ir a Equipo", onClick: onIrEquipo }}
        />
        <Requisito
          listo={!cargandoPedidos && (pedidos ?? 0) > 0}
          titulo="Un pedido confirmado sin repartidor"
          detalle={detallePedidos}
          accion={cargandoPedidos ? undefined : { texto: "Ir al Tablero", onClick: () => irAEnlace(RUTA_TABLERO) }}
        />
      </ul>
    </div>
  );
}
