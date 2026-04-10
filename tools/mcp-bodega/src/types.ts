/**
 * Shared types for the Bodega San Martin MCP server.
 * Maps to the Prisma schema models in the main project.
 */

/** Fiado (credit line) with overdue info */
export interface FiadoVencido {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  total: number;
  saldo: number;
  descripcion: string | null;
  status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
  fechaVence: string | null;
  diasVencido: number;
  createdAt: string;
}

/** Sales summary for a given date */
export interface VentasResumen {
  fecha: string;
  totalVentas: number;
  cantidadOrdenes: number;
  ticketPromedio: number;
  porMetodoPago: Record<string, { cantidad: number; total: number }>;
  porCajero: Record<string, { cantidad: number; total: number }>;
  topProductos: Array<{ name: string; cantidad: number; total: number }>;
}

/** Product with critical stock level */
export interface ProductoCritico {
  id: number;
  name: string;
  category: string;
  stock: number | null;
  stockMin: number | null;
  unit: string;
  razon: "stock_bajo" | "por_vencer";
  detalleVencimiento?: string;
}

/** WhatsApp send result */
export interface WhatsAppResult {
  success: boolean;
  message: string;
  auditId: string;
}

/** SUNAT boleta result */
export interface BoletaResult {
  series: string;
  number: number;
  fullNumber: string;
  subtotal: number;
  igv: number;
  total: number;
  customerName: string;
  customerDocument: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  createdAt: string;
}

/** MCP audit log entry */
export interface AuditLogEntry {
  id: string;
  tenantId: string;
  tool: string;
  params: Record<string, unknown>;
  latencyMs: number;
  success: boolean;
  error?: string;
  createdAt: string;
}
