import type { Product, Sale } from "@/types/erp";

// ── Shared types for dashboard sub-tabs ────────────────────────────────────────

export interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image?: string;
}

export interface Order {
  id: string;
  customer: { name: string; phone?: string; location?: string; reference?: string };
  items: OrderItem[];
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Payable {
  id: string;
  supplierId?: string;
  supplierName?: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate?: string;
}

export interface DashboardAlerts {
  lowStock: number;
  pendingOrders: number;
  overduePayables: number;
}

export interface TopProduct {
  id: number | string;
  name: string;
  qty: number;
  revenue: number;
}

export interface TopCustomer {
  name: string;
  phone?: string;
  total: number;
  orderCount: number;
}

export interface HourBucket {
  hour: number;
  label: string;
  amount: number;
}

export type ChartType = "ventas-categoria" | "metodo-pago" | "top-10" | "ventas-hora" | "tendencia-semanal" | "flujo-caja";

export const CHART_OPTIONS: { id: ChartType; label: string }[] = [
  { id: "ventas-categoria", label: "Ventas por categoria (PieChart)" },
  { id: "metodo-pago", label: "Ventas por metodo de pago (PieChart)" },
  { id: "top-10", label: "Top 10 productos (BarChart)" },
  { id: "ventas-hora", label: "Ventas por hora (BarChart)" },
  { id: "tendencia-semanal", label: "Tendencia semanal (LineChart)" },
  { id: "flujo-caja", label: "Flujo de caja (ComposedChart)" },
];

export type DashTabId = "resumen" | "ventas" | "inventario" | "clientes" | "finanzas";

export type Period = "hoy" | "semana" | "mes";

export type SectionId = "kpis" | "margen-comparador" | "top-productos" | "horario-pico" | "clientes-alertas";

export interface RegionalConfig {
  currency: "PEN" | "USD";
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY";
}

// ── Reusable UI components ─────────────────────────────────────────────────────

export { type Product, type Sale };
