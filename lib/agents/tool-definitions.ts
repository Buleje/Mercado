/**
 * lib/agents/tool-definitions.ts
 *
 * Maps domain agent actions to OpenAI-compatible tool definitions
 * for native function calling via Groq API.
 *
 * Each tool follows the format:
 *   { type: "function", function: { name, description, parameters } }
 *
 * Naming convention: {domain}_{action_with_underscores}
 * Example: inventory_check_stock, orders_pending_summary
 */

import type { AgentDomain } from "./types";

// ── Helper: ¿el tool requiere aprobación humana? (HITL — ADR-010 / TD-025) ──

/**
 * Devuelve true si el tool con ese nombre tiene `requiresApproval: true`.
 * El orchestrator / route handler debe chequear esto ANTES de ejecutar el
 * tool; si es true, debe stashar el tool call en `lib/agents/pending-approvals.ts`
 * y devolver un mensaje al LLM indicando que el admin debe confirmar.
 *
 * Uso directo en `app/api/ai-assistant/route.ts`:
 * ```ts
 * import { isToolApprovalRequired } from "@/lib/agents/tool-definitions";
 *
 * if (isToolApprovalRequired(toolName)) {
 *   const approvalId = stashPendingApproval({...});
 *   return JSON.stringify({ requiresApproval: true, approvalId, ... });
 * }
 * ```
 */
export function isToolApprovalRequired(toolName: string): boolean {
  return Boolean(
    allAgentToolsRegistry.find((t) => t.function.name === toolName)
      ?.requiresApproval,
  );
}

// Registry populado al final del archivo con `ALL_AGENT_TOOLS`. Se usa en
// `isToolApprovalRequired` para lookup rápido. Declarado aquí como `let` para
// permitir la inicialización tardía en el export default (evita circular imports).
let allAgentToolsRegistry: ToolDefinition[] = [];

// ── Tool definition type (OpenAI-compatible) ──────────────────────────────────

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  /**
   * Metadata interna (NO se envía al LLM — Groq/OpenAI ignoran campos extra en el root).
   *
   * Excel Agentes IA práctica #10 "Human-in-the-Loop para acciones críticas":
   * cuando el LLM selecciona un tool marcado con `requiresApproval: true`, el
   * orchestrator NO debe ejecutarlo inmediatamente; debe emitir un evento
   * `pendingApproval` que el frontend (AICommandCenter.tsx) muestra como modal
   * "¿Aprobar esta acción? [Sí] [No]". Solo tras la confirmación humana el
   * orchestrator ejecuta el tool.
   *
   * Implementación del modal pendiente (TD-025). Este flag se agrega como
   * pre-stage: el valor ya está marcado en los tools que lo necesitan, pero
   * el orchestrator aún ejecuta todos inmediatamente. Cuando el modal se
   * implemente, solo tiene que leer este flag sin redefinir qué es crítico.
   */
  requiresApproval?: boolean;
}

// ── Tools que requieren aprobación humana (referencia rápida) ────────────────
//
// Para marcar un tool como crítico, agregar `requiresApproval: true` a su
// definición abajo. Criterio para decidir qué requiere aprobación:
//
//   1. ¿El tool envía comunicación externa (WhatsApp/email/push) a clientes
//      reales? → sí requiere aprobación (riesgo de spam o mensaje incorrecto).
//   2. ¿El tool modifica estado persistente (stock, precios, facturas,
//      fiados)? → sí requiere aprobación (riesgo de pérdida de datos o fraude).
//   3. ¿El tool es reversible? → si es irreversible (cancelar pedido, eliminar
//      cliente, rematar producto), siempre requiere aprobación.
//
// HOY los 30 tools del catálogo son casi todos read-only + 5 de notificaciones.
// Solo 2 de notificaciones califican (envían a clientes finales).
// Cuando se agreguen tools de compras/eliminación/descuentos grandes, marcarlos.

// ── Reverse mapping: tool name → domain + action ──────────────────────────────

export interface ToolMapping {
  domain: AgentDomain;
  action: string;
}

const toolMappingRegistry = new Map<string, ToolMapping>();

function defineTools(
  domain: AgentDomain,
  tools: Omit<ToolDefinition, "type">[],
): ToolDefinition[] {
  return tools.map((t) => {
    toolMappingRegistry.set(t.function.name, {
      domain,
      action: t.function.name.replace(`${domain}_`, "").replace(/_/g, "-"),
    });
    return { type: "function" as const, ...t };
  });
}

// ── Inventory tools ───────────────────────────────────────────────────────────

const inventoryTools = defineTools("inventory", [
  {
    function: {
      name: "inventory_check_stock",
      description:
        "Revisa los niveles de stock del inventario. Muestra productos agotados y con stock bajo (por debajo del mínimo). Úsalo cuando pregunten por stock, inventario, productos agotados o faltantes.",
      parameters: {
        type: "object",
        properties: {
          threshold: {
            type: "number",
            description:
              "Umbral de stock bajo. Si no se indica, usa el mínimo configurado por producto.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "inventory_fefo_audit",
      description:
        "Auditoría FEFO (primero en vencer, primero en salir). Muestra lotes vencidos y por vencer. Úsalo cuando pregunten por vencimientos, productos por caducar, o lotes.",
      parameters: {
        type: "object",
        properties: {
          daysAhead: {
            type: "number",
            description:
              "Días hacia adelante para buscar productos por vencer. Por defecto: 30 días.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "inventory_reorder_suggestions",
      description:
        "Sugiere qué productos reabastecer y en qué cantidad, basado en velocidad de venta y stock actual. Úsalo cuando pregunten qué comprar, qué reponer, o sugerencias de reorden.",
      parameters: {
        type: "object",
        properties: {
          leadTimeDays: {
            type: "number",
            description:
              "Días de anticipación para el reabastecimiento. Por defecto: 3 días.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "inventory_stock_valuation",
      description:
        "Calcula el valor total del inventario a costo y a precio de venta, desglosado por categoría. Úsalo cuando pregunten cuánto vale el inventario o valuación de stock.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "inventory_buscar_producto",
      description:
        "Busca productos por nombre, SKU o código de barras y devuelve su id, precio y stock. SIEMPRE usar esto ANTES de modificar un producto: si hay más de una coincidencia, preguntale al usuario cuál antes de tocar nada.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Parte del nombre, SKU o código de barras" } },
        required: ["texto"],
      },
    },
  },
  {
    function: {
      name: "inventory_ajustar_stock",
      description:
        "Deja el stock de un producto en la cantidad indicada y lo registra en el kardex con su motivo. Requiere el productId exacto (buscalo antes con inventory_buscar_producto) y un motivo. El usuario tiene que confirmar antes de que se ejecute.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Id del producto (de inventory_buscar_producto)" },
          nuevoStock: { type: "number", description: "Cantidad que queda en stock" },
          motivo: { type: "string", description: "Por qué se ajusta: conteo físico, rotura, merma…" },
        },
        required: ["productId", "nuevoStock", "motivo"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "inventory_movement_summary",
      description:
        "Resumen de movimientos de inventario (entradas, salidas, ajustes) en un rango de fechas. Úsalo cuando pregunten por movimientos de almacén o historial de stock.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Fecha inicio en formato ISO (YYYY-MM-DD).",
          },
          to: {
            type: "string",
            description: "Fecha fin en formato ISO (YYYY-MM-DD).",
          },
        },
      },
    },
  },
]);

// ── Orders tools ──────────────────────────────────────────────────────────────

const ordersTools = defineTools("orders", [
  {
    function: {
      name: "orders_pending_summary",
      description:
        "Resumen de pedidos pendientes: cuántos hay, monto total, desglose por estado. Úsalo cuando pregunten por pedidos sin entregar, pendientes o en espera.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "orders_delivery_schedule",
      description:
        "Programación de entregas para un día específico: qué pedidos hay que entregar, a qué clientes, en qué horarios. Úsalo cuando pregunten por entregas del día o rutas.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Fecha de las entregas en formato ISO (YYYY-MM-DD). Por defecto: hoy.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "orders_returns_analysis",
      description:
        "Análisis de devoluciones: motivos más frecuentes, productos más devueltos, valor total devuelto. Úsalo cuando pregunten por devoluciones o productos problemáticos.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "orders_status_overview",
      description:
        "Vista general de pedidos de los últimos 7 días por estado: cuántos confirmados, en camino, entregados, cancelados. Úsalo para una vista general del flujo de pedidos.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "orders_daily_sales_report",
      description:
        "Reporte diario de ventas: ingresos por delivery vs POS, desglose por método de pago, total de transacciones. Úsalo cuando pregunten cuánto se vendió hoy o el cierre del día.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Fecha del reporte en formato ISO (YYYY-MM-DD). Por defecto: hoy.",
          },
        },
      },
    },
  },
]);

// ── Customers tools ───────────────────────────────────────────────────────────

const customersTools = defineTools("customers", [
  {
    function: {
      name: "customers_segmentation",
      description:
        "Segmentación de clientes por comportamiento (RFM): campeones, leales, potenciales, en riesgo, hibernando. Úsalo cuando pregunten por tipos de clientes o segmentos.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "customers_top_customers",
      description:
        "Ranking de mejores clientes por gasto total: nombre, monto gastado, nivel de lealtad. Úsalo cuando pregunten quiénes son los mejores clientes.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Cuántos clientes mostrar. Por defecto: 10.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "customers_churn_risk",
      description:
        "Clientes en riesgo de irse: los que no han comprado en X días. Úsalo cuando pregunten por clientes inactivos, que no vuelven, o riesgo de perderlos.",
      parameters: {
        type: "object",
        properties: {
          inactiveDays: {
            type: "number",
            description:
              "Días sin actividad para considerar en riesgo. Por defecto: 30 días.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "customers_birthday_upcoming",
      description:
        "Clientes con cumpleaños próximo en los siguientes días. Úsalo para campañas de cumpleaños o promociones personalizadas.",
      parameters: {
        type: "object",
        properties: {
          daysAhead: {
            type: "number",
            description:
              "Días hacia adelante para buscar cumpleaños. Por defecto: 7.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "customers_customer_360",
      description:
        "Perfil completo de un cliente: datos personales, historial de compras, lealtad, reseñas, preferencias. Úsalo cuando pregunten por un cliente específico.",
      parameters: {
        type: "object",
        properties: {
          phone: {
            type: "string",
            description: "Número de teléfono del cliente (obligatorio).",
          },
        },
        required: ["phone"],
      },
    },
  },
]);

// ── Analytics tools ───────────────────────────────────────────────────────────

const analyticsTools = defineTools("analytics", [
  {
    function: {
      name: "analytics_daily_kpis",
      description:
        "KPIs del día: ingresos totales (pedidos + POS), número de transacciones, ticket promedio, clientes nuevos. Úsalo cuando pregunten por métricas del día o indicadores clave.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Fecha de los KPIs en formato ISO (YYYY-MM-DD). Por defecto: hoy.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "analytics_product_performance",
      description:
        "Rendimiento de productos: top productos por ingresos y por cantidad vendida, y los que menos venden. Úsalo cuando pregunten qué se vende más, qué se vende menos.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Cuántos productos mostrar en cada ranking. Por defecto: 10.",
          },
          days: {
            type: "number",
            description: "Período en días para el análisis. Por defecto: 30.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "analytics_margin_analysis",
      description:
        "Análisis de márgenes de ganancia: productos con mejor y peor margen, margen promedio por categoría. Úsalo cuando pregunten por rentabilidad, márgenes o ganancias por producto.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "analytics_sales_trend",
      description:
        "Tendencia de ventas día a día: ingresos, cantidad de pedidos y ventas POS por cada día. Úsalo cuando pregunten por cómo van las ventas, si subieron o bajaron.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description:
              "Días de historial para la tendencia. Por defecto: 14.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "analytics_category_breakdown",
      description:
        "Desglose de ventas por categoría: cuánto vende cada categoría, porcentaje del total. Úsalo cuando pregunten por categorías, qué rubros venden más.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Período en días. Por defecto: 30.",
          },
        },
      },
    },
  },
]);

// ── Notifications tools ───────────────────────────────────────────────────────

const notificationsTools = defineTools("notifications", [
  {
    function: {
      name: "notifications_send_order_update",
      description:
        "Envía una notificación al cliente sobre el estado de su pedido (confirmado, en camino, entregado, cancelado). Úsalo cuando pidan avisar a un cliente sobre un pedido.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "ID del pedido (obligatorio).",
          },
          status: {
            type: "string",
            description:
              'Nuevo estado del pedido: "confirmado", "en_camino", "entregado", "cancelado".',
            enum: ["confirmado", "en_camino", "entregado", "cancelado"],
          },
        },
        required: ["orderId", "status"],
      },
    },
    // HITL: comunicación al cliente final sobre SU pedido específico.
    // Un mensaje incorrecto genera confusión directa con el cliente.
    // Excel Agentes IA práctica #10. Modal lo gatea en TD-025.
    requiresApproval: true,
  },
  {
    function: {
      name: "notifications_send_stock_alert",
      description:
        "Envía alertas de stock bajo y agotado a los administradores. Úsalo cuando pidan enviar alertas de inventario.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "notifications_send_expiry_warning",
      description:
        "Envía avisos de productos próximos a vencer. Úsalo cuando pidan alertar sobre vencimientos.",
      parameters: {
        type: "object",
        properties: {
          daysAhead: {
            type: "number",
            description:
              "Días para considerar 'próximo a vencer'. Por defecto: 7.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "notifications_send_promotion",
      description:
        "Envía una promoción a los clientes (todos o a un segmento específico). Úsalo cuando pidan enviar una promo o campaña.",
      parameters: {
        type: "object",
        properties: {
          promoId: {
            type: "string",
            description: "ID de la promoción a enviar (obligatorio).",
          },
          segment: {
            type: "string",
            description:
              'Segmento de clientes: "champions", "loyal", "potential", "at_risk", "hibernating". Si no se indica, envía a todos.',
          },
        },
        required: ["promoId"],
      },
    },
    // HITL: comunicación masiva de marketing a clientes. Un envío erróneo a
    // "todos" puede saturar WhatsApp/email y dañar la reputación de marca.
    // Riesgo más alto que notifications_send_order_update. TD-025.
    requiresApproval: true,
  },
  {
    function: {
      name: "notifications_digest_pending",
      description:
        "Resumen de notificaciones pendientes y acciones sin resolver. Úsalo cuando pregunten qué notificaciones hay pendientes.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
]);

// ── Pricing tools ─────────────────────────────────────────────────────────────

const pricingTools = defineTools("pricing", [
  {
    function: {
      name: "pricing_margin_check",
      description:
        "Verifica qué productos tienen márgenes fuera de rango (muy bajos o muy altos). Úsalo cuando pregunten por precios mal configurados o márgenes anómalos.",
      parameters: {
        type: "object",
        properties: {
          minMargin: {
            type: "number",
            description:
              "Margen mínimo aceptable en porcentaje. Por defecto: 15%.",
          },
          maxMargin: {
            type: "number",
            description:
              "Margen máximo aceptable en porcentaje. Por defecto: 80%.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "pricing_competitor_gap",
      description:
        "Análisis de brecha de precios frente a la competencia (funcionalidad en desarrollo, devuelve estructura base). Úsalo cuando pregunten por precios de la competencia.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    function: {
      name: "pricing_promotion_candidates",
      description:
        "Sugiere productos candidatos para descuento basándose en margen, stock y velocidad de venta. Úsalo cuando pregunten qué poner en oferta o qué productos promocionar.",
      parameters: {
        type: "object",
        properties: {
          minMargin: {
            type: "number",
            description:
              "Margen mínimo para considerar un producto para descuento. Por defecto: 25%.",
          },
          limit: {
            type: "number",
            description:
              "Máximo de candidatos a mostrar. Por defecto: 15.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "pricing_bundle_suggestions",
      description:
        "Sugiere bundles (combos) de productos que los clientes compran juntos. Úsalo cuando pregunten por combos, paquetes o qué productos agrupar.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Máximo de sugerencias. Por defecto: 5.",
          },
          days: {
            type: "number",
            description:
              "Días de historial para analizar co-compras. Por defecto: 30.",
          },
        },
      },
    },
  },
  {
    function: {
      name: "pricing_price_history",
      description:
        "Historial de cambios de precio de un producto específico. Úsalo cuando pregunten cómo ha cambiado el precio de algo.",
      parameters: {
        type: "object",
        properties: {
          productId: {
            type: "number",
            description: "ID del producto (obligatorio).",
          },
        },
        required: ["productId"],
      },
    },
  },
]);

// ── All tools combined ────────────────────────────────────────────────────────


// ── Forestal tools (Libro de Operaciones CTP — SERFOR) ───────────────────────
//
// Todos de LECTURA. Escribir en el libro tiene efectos legales ante SERFOR
// (invariantes I1-I5, auditoría, plazos) y se hace desde su pantalla.

const forestalTools = defineTools("forestal", [
  {
    function: {
      name: "forestal_existencias",
      description:
        "Cuánta madera hay en el aserradero según el Libro de Operaciones CTP: materia prima (trozas) por especie y producto terminado (tablones, tablillas) con su stock. Usar para '¿cuánta madera tengo?', '¿cuánto tornillo queda?', 'existencias del patio'. NO usar para el inventario de la bodega/minimarket (para eso, inventory_check_stock).",
      parameters: {
        type: "object",
        properties: {
          desde: { type: "string", description: "Inicio del período YYYY-MM-DD (opcional; sin esto, todo el libro)" },
          hasta: { type: "string", description: "Fin del período YYYY-MM-DD (opcional)" },
        },
      },
    },
  },
  {
    function: {
      name: "forestal_buscar_guia",
      description:
        "Busca ingresos de madera del libro CTP por N° de guía GTF, proveedor o especie. La GTF es el documento que acredita el origen legal de la madera. Usar para 'buscá la guía 001-0000123', '¿qué me trajo el proveedor X?'.",
      parameters: {
        type: "object",
        properties: {
          texto: { type: "string", description: "N° de guía, nombre del proveedor o especie" },
        },
        required: ["texto"],
      },
    },
  },
  {
    function: {
      name: "forestal_buscar_troza",
      description:
        "El estado y la historia de UNA troza por su código (el pintado en la testa o el código de planta): si está libre en el patio, ya consumida, retrozada o si no llegó. Usar para 'la troza A-14', '¿qué pasó con la pieza 231?'.",
      parameters: {
        type: "object",
        properties: {
          codigo: { type: "string", description: "Código de la troza (codificación de la guía o código de planta)" },
        },
        required: ["codigo"],
      },
    },
  },
  {
    function: {
      name: "forestal_pendientes",
      description:
        "Estado de cumplimiento del libro forestal: ingresos sin validar, registrados fuera del plazo SERFOR, CITES, sin código de origen, sin costo, y los problemas de la Ficha legal (títulos habilitantes vencidos, casilleros de la GTF en blanco). Usar para '¿qué me falta en el libro?', '¿estoy en regla con SERFOR?'.",
      parameters: { type: "object", properties: {} },
    },
  },
]);

// ── UI tools (llevar al usuario a la pantalla correcta) ──────────────────────

const uiTools = defineTools("ui", [
  {
    function: {
      name: "ui_abrir",
      description:
        "Devuelve un botón que abre la pantalla del panel donde se resuelve lo que el usuario pide. Usalo SIEMPRE que la respuesta implique 'andá a…' o 'revisá en…', en vez de nombrar el módulo en texto. Destinos: inventario, kardex, conteo-fisico, ventas, pos, caja, pedidos, clientes, fiados, compras, historial-gastos, sugerencias-compra, plata, adelantos, productos, promociones, analytics, documentos, libro-ctp, ctp-existencias, ctp-ingresos, ctp-ficha, libro-th.",
      parameters: {
        type: "object",
        properties: {
          destino: { type: "string", description: "Clave del destino (ej. 'kardex', 'ctp-ingresos')" },
          filtro: { type: "string", description: "Texto de búsqueda con el que abrir la pantalla (opcional)" },
        },
        required: ["destino"],
      },
    },
  },
]);


// ── Documentos (drive) ───────────────────────────────────────────────────────

const documentosTools = defineTools("documentos", [
  {
    function: {
      name: "documentos_buscar",
      description:
        "Busca archivos en el drive del negocio por nombre, etiqueta o por el TEXTO DENTRO del archivo (OCR): facturas, contratos, guías, comprobantes. Usar para 'buscá la factura de X', '¿dónde está el contrato de alquiler?'.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Qué buscar: proveedor, número de documento, palabra que aparece adentro" } },
        required: ["texto"],
      },
    },
  },
  {
    function: {
      name: "documentos_por_vencer",
      description:
        "Documentos con fecha de vencimiento próxima (contratos, seguros, certificados, licencias). Usar para '¿qué se me vence?', '¿algún papel por renovar?'.",
      parameters: {
        type: "object",
        properties: { dias: { type: "number", description: "Ventana en días (por defecto 30)" } },
      },
    },
  },
]);

// ── Caja ─────────────────────────────────────────────────────────────────────

const cajaTools = defineTools("caja", [
  {
    function: {
      name: "caja_estado",
      description:
        "Estado de la caja abierta: monto de apertura, entradas por método de pago (efectivo, Yape, tarjeta), salidas y cuánto efectivo DEBERÍA haber. Usar para '¿cómo va la caja?', '¿cuánto hay en caja?'. Aclarale al usuario que el efectivo esperado es un cálculo, no un conteo.",
      parameters: { type: "object", properties: {} },
    },
  },
]);

// ── Cobranzas (fiados + adelantos) ───────────────────────────────────────────

const cobranzasTools = defineTools("cobranzas", [
  {
    function: {
      name: "cobranzas_fiados",
      description:
        "Lo que los clientes deben (fiado), con antigüedad y cuánto lleva más de 30 días sin cobrarse. Usar para '¿quién me debe?', '¿cuánto tengo en la calle?', 'deudas viejas'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    function: {
      name: "cobranzas_adelantos",
      description:
        "Adelantos de sueldo pendientes de descontar, por persona. NO son fiados de clientes: es plata ya entregada al personal. Usar para '¿cuánto adelanté?', 'adelantos pendientes'.",
      parameters: { type: "object", properties: {} },
    },
  },
]);

export const ALL_AGENT_TOOLS: ToolDefinition[] = [
  ...inventoryTools,
  ...ordersTools,
  ...customersTools,
  ...analyticsTools,
  ...notificationsTools,
  ...pricingTools,
  ...forestalTools,
  ...documentosTools,
  ...cajaTools,
  ...cobranzasTools,
  ...uiTools,
];

// Inicializa el registry usado por `isToolApprovalRequired` (declarado arriba).
allAgentToolsRegistry = ALL_AGENT_TOOLS;

/**
 * Resolve a tool name to its domain + action for orchestrator dispatch.
 * Returns undefined if the tool name is not recognized.
 */
export function resolveToolCall(
  toolName: string,
): ToolMapping | undefined {
  return toolMappingRegistry.get(toolName);
}

/**
 * Get a subset of tools by domain (useful for scoped contexts).
 */
export function getToolsByDomain(domain: AgentDomain): ToolDefinition[] {
  const prefix = `${domain}_`;
  return ALL_AGENT_TOOLS.filter((t) =>
    t.function.name.startsWith(prefix),
  );
}
