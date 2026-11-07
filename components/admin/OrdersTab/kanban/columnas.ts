/**
 * Las cuatro columnas del tablero de Pedidos, en el orden del pedido:
 * Por confirmar → Confirmado → Preparando → En camino. Salió de
 * `OrdersKanban.tsx` al partirlo (10-10, tope de 300 líneas por componente).
 */
import type { ElementType } from "react";
import { Bike, ChefHat, Clock, ShoppingBasket } from "@buleje/design-system/icons";

export type ColumnId = "pendiente" | "confirmado" | "preparando" | "en_camino";

export interface Columna {
  id: ColumnId;
  label: string;
  /** Qué pasa en esta columna: va en el `title` de su cabecera y en la sección del celular. */
  description: string;
  accentVar: string;
  Icon: ElementType;
  iconColor: string;
  emptyMessage: string;
}

export const COLUMNAS: readonly Columna[] = [
  {
    id: "pendiente",
    label: "Por confirmar",
    description: "Yape por verificar · pago a aprobar",
    accentVar: "var(--data-warning-500)",
    Icon: Clock,
    iconColor: "text-[var(--data-warning-ink)]",
    emptyMessage: "Sin pedidos por confirmar",
  },
  {
    id: "confirmado",
    label: "Confirmado",
    description: "Aprobados · listos para preparar",
    accentVar: "var(--accent)",
    Icon: ShoppingBasket,
    iconColor: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
    emptyMessage: "Nada confirmado",
  },
  {
    id: "preparando",
    label: "Preparando",
    description: "En cocina · armando el pedido",
    accentVar: "var(--data-warning-500)",
    Icon: ChefHat,
    iconColor: "text-[var(--data-warning-ink)]",
    emptyMessage: "Nada en preparación",
  },
  {
    id: "en_camino",
    label: "En camino",
    description: "Asignado · rumbo al cliente",
    accentVar: "var(--data-info-500)",
    Icon: Bike,
    iconColor: "text-[var(--data-info-ink)]",
    emptyMessage: "Ningún motorizado en ruta",
  },
];

/** Cuántas tarjetas se ven por columna antes de «Ver los N». */
export const PEDIDOS_POR_COLUMNA = 2;
