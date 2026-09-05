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

const avisosTool = defineTools("analytics", [
  {
    function: {
      name: "analytics_avisos",
      description:
        "Lo que vale la pena contarle al dueño HOY sin que pregunte: combustible que se disparó en una máquina, fletes sin pagar, adelantos vencidos, fiados de más de un mes, máquinas paradas. Usar cuando pregunten «¿qué hay de nuevo?», «¿algo urgente?», «¿cómo viene todo?». Si devuelve cero, decilo tal cual: no inventes una alerta para no venir con las manos vacías.",
      parameters: { type: "object", properties: {} },
    },
  },
]);

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

// ── Plata: anotar operaciones dictadas (ESCRITURA con confirmación) ──────────
//
// El único bloque de tools que MUEVE plata.
//
// ⚠️ Las descripciones son CORTAS a propósito. Viajan las 15 en cada mensaje y
// la cuenta tiene 8.000 tokens POR MINUTO: 1.261 tokens de descripciones eran
// el 15 % del minuto gastado en repetir quince veces reglas que el system
// prompt dice UNA. Acá va sólo lo que es propio de cada herramienta; el «no
// multipliques vos», el «no inventes ids» y el «el usuario confirma» viven en
// `lib/asistente/conversar.ts` y en `app/api/ai-assistant/route.ts`.

const plataTools = defineTools("plata", [
  {
    function: {
      name: "plata_buscar_maquina",
      description:
        "Busca un camión, tractor o máquina por nombre o placa y devuelve su maquinaId. Sólo si no está en la lista del negocio.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Nombre, número o placa" } },
        required: ["texto"],
      },
    },
  },
  {
    function: {
      name: "plata_buscar_persona",
      description:
        "Busca a una persona del padrón de adelantos por nombre o documento. Devuelve personaId y sus adelantos abiertos con adelantoId y saldo.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Nombre o documento" } },
        required: ["texto"],
      },
    },
  },
  {
    function: {
      name: "plata_buscar_deuda",
      description:
        "Busca fiados abiertos (lo que un cliente debe) por nombre o teléfono. Devuelve fiadoId y saldo. Sin texto lista todas.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Nombre o teléfono del cliente" } },
      },
    },
  },
  {
    function: {
      name: "plata_buscar_proveedor",
      description: "Busca un proveedor por nombre, RUC o documento. Devuelve proveedorId.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Nombre, RUC o documento" } },
        required: ["texto"],
      },
    },
  },
  {
    function: {
      name: "plata_buscar_cuenta",
      description: "Lista las cuentas de tesorería con su saldo, o busca una. Sin texto devuelve todas.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Nombre o banco" } },
      },
    },
  },
  {
    function: {
      name: "plata_buscar_lote",
      description:
        "Busca un lote de producción forestal y devuelve su código exacto, para usarlo como centroCosto de un gasto.",
      parameters: {
        type: "object",
        properties: { texto: { type: "string", description: "Código del lote o parte de él" } },
      },
    },
  },
  {
    function: {
      name: "plata_registrar_gasto",
      description:
        "Anota un gasto (plata que salió). Con maquinaId va al libro de esa máquina; sin él, al libro de gastos del negocio. Para combustible pasá cantidad (galones) y precioUnitario, no el total.",
      parameters: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "Qué se compró o pagó" },
          monto: { type: "number", description: "Total en soles. Omitir si diste cantidad y precioUnitario." },
          cantidad: { type: "number", description: "Galones o unidades" },
          precioUnitario: { type: "number", description: "Precio por galón o unidad" },
          categoria: {
            type: "string",
            description:
              "De máquina: combustible|mantenimiento|repuesto|operador|peaje|otro. Del negocio: alquiler|servicios|personal|transporte|limpieza|marketing|mantenimiento|otros",
          },
          maquinaId: { type: "string", description: "Sólo si el gasto es de una máquina" },
          metodoPago: { type: "string", description: "efectivo|yape|plin|transferencia|tarjeta|credito" },
          proveedor: { type: "string", description: "A quién se le pagó" },
          centroCosto: { type: "string", description: "Etiqueta para agrupar (ej. el código de un lote)" },
          fecha: { type: "string", description: "AAAA-MM-DD. Omitir si es hoy." },
          notas: { type: "string" },
        },
        required: ["descripcion"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_registrar_ingreso",
      description:
        "Anota plata que ENTRÓ y no es una venta del mostrador. Con maquinaId queda como alquiler o viaje de esa máquina; sin él entra a la caja abierta. No sirve para ventas de productos.",
      parameters: {
        type: "object",
        properties: {
          descripcion: { type: "string", description: "De qué es el ingreso" },
          monto: { type: "number", description: "Total en soles. Omitir si diste cantidad y tarifa." },
          cantidad: { type: "number", description: "Horas, días, viajes o m³" },
          tarifa: { type: "number", description: "Precio por unidad" },
          unidad: { type: "string", description: "hora|dia|viaje|m3" },
          maquinaId: { type: "string" },
          cliente: { type: "string", description: "Quién pagó o alquiló" },
          cobrado: { type: "boolean", description: "false si quedó a deber" },
          metodoPago: { type: "string", description: "efectivo|yape|plin|transferencia|tarjeta" },
        },
        required: ["descripcion"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_registrar_adelanto",
      description:
        "Anota un adelanto de plata a una persona del padrón. Si supera su límite de crédito el sistema lo frena: eso se autoriza en la pantalla.",
      parameters: {
        type: "object",
        properties: {
          personaId: { type: "string" },
          monto: { type: "number", description: "En soles" },
          metodoPago: { type: "string", description: "Omitir si no salió de la caja" },
          fecha: { type: "string", description: "AAAA-MM-DD" },
          notas: { type: "string", description: "Para qué es" },
        },
        required: ["personaId", "monto"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_cobrar_fiado",
      description: "Registra un pago sobre lo que un cliente debía. Si el monto supera el saldo, el sistema lo rechaza.",
      parameters: {
        type: "object",
        properties: {
          fiadoId: { type: "string" },
          monto: { type: "number", description: "Cuánto pagó, en soles" },
          notas: { type: "string" },
        },
        required: ["fiadoId", "monto"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_liquidar_adelanto",
      description:
        "Descuenta plata de un adelanto abierto (la persona devolvió o entregó algo). Sólo entregas en plata o servicios; si entrega producto que suma al stock, va por la pantalla.",
      parameters: {
        type: "object",
        properties: {
          adelantoId: { type: "string" },
          monto: { type: "number", description: "Valor de lo entregado" },
          descripcion: { type: "string", description: "Qué entregó" },
          metodoPago: { type: "string", description: "Si entró a la caja" },
        },
        required: ["adelantoId", "monto"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_registrar_compra",
      description:
        "Anota una compra a un proveedor como orden PENDIENTE. Cada ítem necesita el productId de inventory_buscar_producto. NO sube el stock: eso pasa al marcarla recibida en Compras.",
      parameters: {
        type: "object",
        properties: {
          proveedorId: { type: "string" },
          items: {
            type: "array",
            description: "Una entrada por producto",
            items: {
              type: "object",
              properties: {
                productId: { type: "number" },
                cantidad: { type: "number", description: "Entero" },
                costoUnitario: { type: "number", description: "En soles" },
              },
              required: ["productId", "cantidad", "costoUnitario"],
            },
          },
          metodoPago: { type: "string" },
          notas: { type: "string" },
        },
        required: ["proveedorId", "items"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_mover_tesoreria",
      description:
        "Mueve plata de una cuenta. Con cuentaDestinoId es transferencia entre cuentas; sin ella, movimiento suelto (hace falta tipo y descripción). Frena si no alcanza el saldo o si las monedas difieren.",
      parameters: {
        type: "object",
        properties: {
          cuentaId: { type: "string", description: "Cuenta de origen" },
          cuentaDestinoId: { type: "string", description: "Sólo para transferencias" },
          monto: { type: "number" },
          tipo: { type: "string", description: "ingreso|egreso — sólo para movimientos sueltos" },
          descripcion: { type: "string", description: "De qué es" },
        },
        required: ["cuentaId", "monto"],
      },
    },
    requiresApproval: true,
  },
  {
    function: {
      name: "plata_registrar_flete",
      description:
        "Anota un viaje de madera: tipo ingreso (la trae) o despacho (se la lleva). Con el volumen calcula el costo por m³.",
      parameters: {
        type: "object",
        properties: {
          monto: { type: "number", description: "Cuánto costó, en soles" },
          placa: { type: "string" },
          transportista: { type: "string" },
          volumenM3: { type: "number" },
          tipo: { type: "string", description: "ingreso|despacho" },
          gtfNumber: { type: "string", description: "N° de la guía forestal" },
          pagaQuien: { type: "string", description: "ctp|proveedor|destinatario" },
          pagado: { type: "boolean", description: "true si ya se pagó" },
          fecha: { type: "string", description: "AAAA-MM-DD" },
          notas: { type: "string" },
        },
        required: ["monto"],
      },
    },
    requiresApproval: true,
  },
]);

// ── n8n: disparar automatizaciones del dueño ─────────────────────────────────

const n8nTools = defineTools("n8n", [
  {
    function: {
      name: "n8n_listar_flujos",
      description:
        "Lista las automatizaciones (flujos de n8n) que el dueño dejó configuradas, con para qué sirve cada una. Usar cuando pregunten qué automatizaciones hay, o antes de disparar una si no está claro cuál.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    function: {
      name: "n8n_disparar_flujo",
      description:
        "Dispara una automatización de n8n por su nombre. Manda datos del negocio a un servidor de afuera, así que el usuario confirma antes de que se ejecute. Si el nombre calza con dos flujos parecidos, el sistema lo frena y hay que preguntar cuál.",
      parameters: {
        type: "object",
        properties: {
          flujo: { type: "string", description: "Nombre o descripción del flujo, tal como lo dijo el usuario" },
          flujoId: { type: "string", description: "Id exacto, si ya lo sabés por n8n_listar_flujos" },
          mensaje: { type: "string", description: "Texto a mandarle al flujo" },
          datos: { type: "object", description: "Datos estructurados para el flujo, si el usuario los dio" },
        },
      },
    },
    requiresApproval: true,
  },
]);

export const ALL_AGENT_TOOLS: ToolDefinition[] = [
  ...inventoryTools,
  ...ordersTools,
  ...customersTools,
  ...analyticsTools,
  ...avisosTool,
  ...notificationsTools,
  ...pricingTools,
  ...forestalTools,
  ...documentosTools,
  ...cajaTools,
  ...cobranzasTools,
  ...uiTools,
  ...plataTools,
  ...n8nTools,
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
