/**
 * lib/vocabulary.ts
 *
 * Diccionario de términos del admin panel.
 * Modo "simple" (default): lenguaje accesible para bodegueros.
 * Modo "technical": terminología profesional para contadores y devs.
 */

export type VocabularyMode = "simple" | "technical";

export interface VocabEntry {
  simple: string;
  technical: string;
}

const VOCABULARY: Record<string, VocabEntry> = {
  // ── Inventario ──
  kardex: { simple: "Movimientos de stock", technical: "Kardex" },
  fefo: { simple: "Productos por vencer primero", technical: "Inventario FEFO" },
  sku: { simple: "Código de producto", technical: "SKU" },
  stock: { simple: "Cantidad disponible", technical: "Stock" },
  merma: { simple: "Productos perdidos", technical: "Merma" },
  lote: { simple: "Grupo de productos", technical: "Lote" },
  reorder_point: { simple: "Cuándo pedir más", technical: "Punto de reorden" },

  // ── Finanzas ──
  margen: { simple: "Ganancia", technical: "Margen bruto" },
  roi: { simple: "Retorno de inversión", technical: "ROI" },
  cuentas_cobrar: { simple: "Me deben", technical: "Cuentas por cobrar" },
  cuentas_pagar: { simple: "Yo debo", technical: "Cuentas por pagar" },
  flujo_caja: { simple: "Dinero que entra y sale", technical: "Flujo de caja" },
  utilidad: { simple: "Lo que gano", technical: "Utilidad neta" },
  capital: { simple: "Mi inversión", technical: "Capital de trabajo" },
  depreciacion: { simple: "Pérdida de valor", technical: "Depreciación" },
  igv: { simple: "Impuesto (18%)", technical: "IGV" },
  facturacion: { simple: "Boletas y facturas", technical: "Facturación electrónica" },

  // ── Ventas ──
  ticket_promedio: { simple: "Venta promedio", technical: "Ticket promedio" },
  conversion: { simple: "Visitas que compran", technical: "Tasa de conversión" },
  pipeline: { simple: "Flujo de pedidos", technical: "Pipeline de ventas" },
  upsell: { simple: "Vender más al cliente", technical: "Upselling" },
  cross_sell: { simple: "Productos complementarios", technical: "Cross-selling" },

  // ── Clientes ──
  crm: { simple: "Mis clientes", technical: "CRM" },
  segmentacion: { simple: "Grupos de clientes", technical: "Segmentación" },
  churn: { simple: "Clientes que no vuelven", technical: "Churn rate" },
  ltv: { simple: "Valor del cliente", technical: "LTV (Lifetime Value)" },
  nps: { simple: "Qué tan contentos están", technical: "NPS (Net Promoter Score)" },
  fidelizacion: { simple: "Programa de puntos", technical: "Programa de fidelización" },

  // ── Dashboard / Analytics ──
  dashboard: { simple: "Resumen del negocio", technical: "Dashboard" },
  analytics: { simple: "Estadísticas", technical: "Analytics" },
  forecast: { simple: "Predicción de ventas", technical: "Forecast" },
  kpi: { simple: "Indicadores clave", technical: "KPIs" },
  benchmark: { simple: "Comparar con otros", technical: "Benchmark" },
  trending: { simple: "Tendencia", technical: "Trending" },

  // ── Configuración ──
  rbac: { simple: "Permisos de usuario", technical: "RBAC (Control de acceso)" },
  webhook: { simple: "Notificación automática", technical: "Webhook" },
  api: { simple: "Conexión con otros sistemas", technical: "API" },
  cache: { simple: "Memoria rápida", technical: "Caché" },
  backup: { simple: "Copia de seguridad", technical: "Backup" },
  migration: { simple: "Actualización de datos", technical: "Migración" },

  // ── Logística ──
  delivery: { simple: "Entrega a domicilio", technical: "Delivery" },
  fulfillment: { simple: "Preparar y entregar", technical: "Fulfillment" },
  picking: { simple: "Recoger productos", technical: "Picking" },
  routing: { simple: "Ruta de entrega", technical: "Routing" },

  // ── IA ──
  ai_assistant: { simple: "Asistente inteligente", technical: "Asistente IA" },
  nlp: { simple: "Entender lo que escribes", technical: "NLP" },
  recommendation: { simple: "Sugerencias personalizadas", technical: "Sistema de recomendación" },
  anomaly: { simple: "Algo raro detectado", technical: "Anomalía" },
};

/**
 * Get a vocabulary term in the specified mode.
 * Falls back to the key itself if not found.
 */
export function vocab(key: string, mode: VocabularyMode = "simple"): string {
  const entry = VOCABULARY[key];
  if (!entry) return key;
  return entry[mode];
}

/**
 * Get all vocabulary entries (for settings UI display).
 */
export function getAllVocabulary(): Record<string, VocabEntry> {
  return VOCABULARY;
}
