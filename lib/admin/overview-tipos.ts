/**
 * Contrato de `GET /api/admin/overview` (Inicio): lo arma la ruta y lo dibujan
 * `components/admin/hoy/*`. Un solo lugar para que la forma no se copie.
 */

export type SeveridadAlerta = "info" | "warning" | "danger";

export interface AlertaDeInicio {
  id: string;
  severity: SeveridadAlerta;
  text: string;
  /** A dónde lleva el aviso, ya filtrado (`?filter=` lo lee el destino al montar). */
  href?: string;
  /** Atajos a una parte del aviso: «50 sin costo», «22 sin mínimo»… */
  enlaces?: Array<{ label: string; href: string }>;
}

export interface OverviewData {
  hero: {
    totalToday: number; // legacy
    totalRange?: number;
    deltaVsYesterday: number; // legacy
    deltaVsPrevious?: number;
    sparkline: number[];
    sparklineLabels?: string[];
    sparklineIso?: string[];
  };
  contextual: {
    ordersToday: number; // legacy
    ordersInRange?: number;
    uniqueCustomers: number;
    newCustomers: number;
    ticketAverage: number;
    activeOrders: number;
    /** Productos en su mínimo o agotados: el «Bajo stock» de Inventario. */
    criticalStock: number;
  };
  heatmap: Array<{ day: number; hour: number; value: number }>;
  topProducts: Array<{ productId: number | null; quantity: number }>;
  alerts: AlertaDeInicio[];
  insight: { type: "opportunity" | "warning" | "info"; text: string; cta?: { label: string; href: string } } | null;
  generatedAt: string;
}
