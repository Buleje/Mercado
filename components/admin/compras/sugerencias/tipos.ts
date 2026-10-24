/**
 * Tipos y tonos de Compras › Sugerencias (partido de SugerenciasCompraTab el
 * 10-10, que medía 926 líneas). La forma es la de `GET /api/compras/sugerencias`.
 */
import { AlertTriangle, Clock, Package, type LucideIcon } from "@buleje/design-system/icons";
import type { CausaReposicion, DetalleReposicion } from "@/lib/compras/reorden";
import type { NaturalezaCompra } from "@/lib/compras/naturaleza";

export type Urgency = "CRITICO" | "URGENTE" | "PLANIFICAR";
export type Causa = CausaReposicion;
export type { DetalleReposicion };

export type Sugerencia = {
  productId: number;
  productName: string;
  category: string;
  currentStock: number;
  stockMin: number;
  /** Unidades ya pedidas y todavía sin recibir (pendientes y lo que falta de las parciales). */
  enTransito: number;
  /** De dónde viene lo que está en camino; `borrador` = orden automática sin enviar (no se resta). */
  enCamino?: { ordenes: number; llegaEl: string | null; borrador: number } | null;
  /** Unidad del producto para la orden («pt», «kg»); antes la orden iba siempre en «und». */
  unit?: string;
  dailyAvg: number;
  daysOfStock: number;
  /** Nivel al que hay que volver a pedir: venta diaria × (lead time + colchón). */
  puntoReorden: number;
  leadTimeDias: number;
  leadTimeOrigen: "declarado" | "historial" | "default";
  suggestedQty: number;
  suggestedSupplier: { id: string; name: string; condicionPago?: string | null } | null;
  lastPrice: number | null;
  urgency: Urgency;
  /** Por qué entra (C26): agotado, no llega, se acaba en la entrega, bajo tu mínimo o por la venta. */
  causa?: Causa;
  /** Qué mandó en la cuenta: el ritmo de ventas o el mínimo que fijaste. */
  criterio?: "ventas" | "minimo";
  /** Los números con que se decidió (C28). */
  detalle?: DetalleReposicion;
  /** Por qué se sugiere, en palabras. */
  motivo: string;
};

/** Lo que el motor apartó a propósito (C25): no es que falte el dato. */
export type Excluidos = {
  servicios: Array<{ productId: number; name: string; naturaleza: NaturalezaCompra }>;
  sinControlDeStock: number;
};

/** Un producto que no se vendió en la ventana: no se repone, se avisa. */
export type SinRotacion = {
  productId: number;
  productName: string;
  category: string;
  currentStock: number;
  stockMin: number;
  excesoSobreMinimo: number;
  /** Estuvo sin stock más de media ventana: «sin ventas» no prueba que no se venda. */
  sinDatos?: boolean;
  diasConStock?: number;
  motivo: string;
  /** El endpoint los manda con la misma base que las sugerencias (el último proveedor). */
  suggestedSupplier?: { id: string; name: string } | null;
};

export type Resumen = {
  costoEstimado: number;
  unidades: number;
  sinPrecio: number;
  enTransito: number;
};

export type FilterKey = "todos" | "CRITICO" | "URGENTE" | "PLANIFICAR" | "sin-proveedor";

export interface ConfigUrgencia {
  label: string;
  short: string;
  hint: string;
  border: string;
  bg: string;
  text: string;
  iconBg: string;
  ring: string;
  icon: LucideIcon;
}

export const URGENCY_CONFIG: Record<Urgency, ConfigUrgencia> = {
  CRITICO: {
    label: "Crítico — se acaba en 3 días o menos",
    short: "Crítico",
    hint: "≤ 3 días",
    border: "border-[var(--data-error-500)]/40",
    bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10",
    text: "text-[var(--data-error-ink)]",
    iconBg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/20",
    ring: "ring-[var(--data-error-500)]/40",
    icon: AlertTriangle,
  },
  URGENTE: {
    label: "Urgente — se acaba esta semana",
    short: "Urgente",
    hint: "4-7 días",
    border: "border-[var(--data-warning-500)]/40",
    bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10",
    text: "text-[var(--data-warning-ink)]",
    iconBg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/20",
    ring: "ring-[var(--data-warning-500)]/40",
    icon: Clock,
  },
  PLANIFICAR: {
    label: "Planificar — más de 7 días",
    short: "Planificar",
    hint: "> 7 días",
    border: "border-[var(--data-success-500)]/40",
    bg: "bg-primary/10 dark:bg-[var(--data-success-500)]/10",
    text: "text-[var(--data-success-ink)]",
    iconBg: "bg-[var(--data-success-100)] dark:bg-[var(--data-success-500)]/20",
    ring: "ring-[var(--data-success-500)]/40",
    icon: Package,
  },
};

export const URGENCY_ORDER: Urgency[] = ["CRITICO", "URGENTE", "PLANIFICAR"];

/** Cómo se lee cada causa (C26). Toma el color de la urgencia que le corresponde. */
export const CAUSA_CONFIG: Record<Causa, { titulo: string; bajada: string; tono: Urgency }> = {
  agotado: { titulo: "Sin stock", bajada: "ya no hay para vender", tono: "CRITICO" },
  no_llega: { titulo: "No llega a tiempo", bajada: "se acaba antes de que entre el pedido", tono: "CRITICO" },
  durante_entrega: { titulo: "Se acaba en la entrega", bajada: "alcanza para pedir, no para el colchón", tono: "URGENTE" },
  minimo: { titulo: "Bajo tu mínimo", bajada: "lo vendido alcanza, pero bajó del mínimo que fijaste", tono: "PLANIFICAR" },
  ritmo: { titulo: "Por lo que se vende", bajada: "hay margen; conviene ir pidiendo", tono: "PLANIFICAR" },
};

export const CAUSA_ORDER: Causa[] = ["agotado", "no_llega", "durante_entrega", "minimo", "ritmo"];

export type AgruparPor = "urgencia" | "causa";

/** Plegado de entrada: lo que apura, abierto; lo que tiene margen, plegado. */
export const PLEGADO_INICIAL: Record<string, boolean> = {
  CRITICO: false, URGENTE: false, PLANIFICAR: true,
  agotado: false, no_llega: false, durante_entrega: false, minimo: true, ritmo: true,
};

/**
 * Los que no se vendieron en la ventana y están EN o BAJO su mínimo: los que
 * Productos y stock cuenta como «necesitan reposición» y que este motor no
 * sugiere (sin venta no hay rotación, ADR-376). Se muestran a la vista para que
 * quien llega desde allá los encuentre (10-10: en `main` el aviso decía «1
 * necesita reposición» y acá «Nada que reponer», con el producto plegado entre
 * los 75 sin venta).
 */
export function bajoSuMinimo(sinRotacion: readonly SinRotacion[]): SinRotacion[] {
  return sinRotacion.filter((s) => s.stockMin > 0 && s.currentStock <= s.stockMin);
}
