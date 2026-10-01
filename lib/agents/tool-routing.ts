/**
 * lib/agents/tool-routing.ts
 *
 * Qué herramientas se le mandan al modelo en cada pregunta.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * El catálogo completo son 52 herramientas = **7.043 tokens de puro esquema**,
 * y eso viaja en CADA llamada. Con la cuenta Groq del negocio (free tier,
 * 8.000 tokens POR MINUTO, medido 2026-09-04) una sola pregunta consume el
 * minuto entero: la segunda llamada —la que anota la operación después de
 * buscar la máquina— se cae con 429 y el usuario ve «no pude redactar la
 * respuesta» habiendo encontrado todo.
 *
 * Mandando sólo los dominios que la frase menciona, la misma pregunta pasa de
 * ~7.000 a ~1.500 tokens de esquema y las tres llamadas entran cómodas.
 *
 * ── El riesgo, y cómo se acota ───────────────────────────────────────────────
 * Elegir mal el subconjunto hace desaparecer una capacidad EN SILENCIO: el
 * modelo no dice «no tengo esa herramienta», dice «no puedo hacer eso». Por eso:
 *
 *   1. `ui` viaja SIEMPRE — si el asistente no puede resolver algo, al menos
 *      abre la pantalla donde sí se hace.
 *   2. Los diccionarios son GENEROSOS: sinónimos, plurales y las palabras como
 *      se dicen en Pucallpa («petróleo» por diésel, «plata» por dinero).
 *   3. Cuando la frase no menciona nada reconocible se manda el NÚCLEO
 *      (analítica, pedidos, inventario) — que es lo que contestan las preguntas
 *      abiertas tipo «¿cómo viene el negocio?»— y no el catálogo entero.
 *   4. La comparación es por PALABRA COMPLETA, no por substring: «cobre» (el
 *      metal) no puede activar cobranzas por vivir dentro de otra palabra.
 */

import { ALL_AGENT_TOOLS, type ToolDefinition } from "./tool-definitions";
import type { AgentDomain } from "./types";

/** Navegar es transversal: nunca se saca. */
const SIEMPRE: readonly AgentDomain[] = ["ui"];

/**
 * Lo que contesta una pregunta abierta («¿qué hago hoy?», «¿cómo viene esto?»).
 * Es el fallback cuando la frase no nombra ningún dominio.
 */
const NUCLEO: readonly AgentDomain[] = ["analytics", "orders", "inventory"];

/**
 * Las palabras que activan cada dominio, tal como las dice el dueño.
 *
 * No son etiquetas técnicas: son el vocabulario del negocio. «Petróleo» acá es
 * diésel, «plata» es dinero, «trozas» y «GTF» son del libro forestal.
 */
/**
 * Cuántas palabras tiene el diccionario de cada dominio.
 *
 * Se expone SÓLO para que un test pueda comprobar que ningún dominio quedó sin
 * vocabulario. Es el fallo más silencioso de todo el sistema de agentes: sin
 * palabras, sus tools nunca se le mandan al modelo, el modelo contesta «no
 * puedo hacer eso» y desde afuera parece una decisión suya y no un diccionario
 * vacío. No devuelve las palabras: sólo el conteo, que es lo que hay que
 * verificar.
 */
export function palabrasPorDominio(): Record<AgentDomain, number> {
  const out = {} as Record<AgentDomain, number>;
  for (const [dominio, palabras] of Object.entries(PALABRAS)) {
    out[dominio as AgentDomain] = palabras.length;
  }
  return out;
}

const PALABRAS: Record<AgentDomain, readonly string[]> = {
  plata: [
    "anota", "anotar", "anotame", "anotalo", "apunta", "apuntar", "apuntame",
    "registra", "registrar", "registrame", "registro", "cargar", "carga",
    "gasto", "gastos", "gaste", "gasté", "pague", "pagué", "pagar", "pago", "pagos",
    "compre", "compré", "compra", "combustible", "petroleo", "petróleo", "diesel",
    "gasolina", "galon", "galón", "galones", "grifo", "tanque", "llenar",
    "adelanto", "adelantos", "adelante", "adelanté", "preste", "presté", "presto",
    "cobro", "cobre", "cobré", "cobrar", "cobranza", "debe", "debia", "debía",
    "pagome", "ingreso", "ingresos", "entro", "entró", "alquiler", "alquile",
    "flete", "fletes", "viaje", "viajes", "camion", "camión", "camiones",
    "tractor", "cargador", "excavadora", "maquina", "máquina", "maquinaria",
    "placa", "horometro", "horómetro", "repuesto", "mantenimiento", "peaje",
    "operador", "yape", "plin", "efectivo", "transferencia", "soles", "plata",
    "luz", "agua", "internet", "sueldo", "planilla", "boleta", "factura", "recibo",
    // Compra a proveedor, tesorería y fletes — mismo dominio, mismo vocabulario
    // de todos los días.
    "proveedor", "proveedores", "distribuidora", "orden", "pedido", "compras",
    "saco", "sacos", "caja", "cajas", "bidon", "bidón", "docena", "unidad", "unidades",
    "banco", "bcp", "interbank", "bbva", "scotiabank", "cuenta", "cuentas",
    "transferi", "transferí", "transferir", "transferencia", "pasa", "pasar", "pase",
    "deposito", "depósito", "deposite", "deposité", "retire", "retiré", "retiro",
    "caja chica", "chica", "tesoreria", "tesorería", "billetera", "saldo",
    "viaje", "viajes", "flete", "fletes", "camionada", "transportista", "chofer",
    "conductor", "m3", "metros", "cubicos", "cúbicos", "lote", "lotes",
  ],
  cobranzas: ["debe", "deben", "deuda", "deudas", "fiado", "fiados", "adelanto", "adelantos", "cobrar", "cobranza", "moroso", "morosos", "calle"],
  caja: ["caja", "cajon", "cajón", "arqueo", "turno", "cierre", "apertura", "efectivo"],
  // «compré 20 sacos de arroz» activa inventory ADEMÁS de plata: anotar la orden
  // de compra necesita el productId, y ese lo da `inventory_buscar_producto`.
  // Sin estas palabras el modelo tenía la herramienta de escribir y no la de
  // encontrar qué escribir.
  inventory: ["stock", "inventario", "almacen", "almacén", "producto", "productos", "agotado", "agotados", "falta", "faltante", "vence", "vencen", "vencimiento", "lote", "lotes", "reponer", "reposicion", "reposición", "kardex", "ajustar", "conteo", "compre", "compré", "compra", "compras", "compramos", "saco", "sacos", "docena", "docenas", "paquete", "paquetes", "bulto", "bultos", "botella", "botellas", "kilo", "kilos"],
  orders: ["pedido", "pedidos", "orden", "ordenes", "órdenes", "entrega", "entregas", "delivery", "reparto", "devolucion", "devolución", "devoluciones", "venta", "ventas", "vendi", "vendí"],
  customers: ["cliente", "clientes", "comprador", "compradores", "segmento", "segmentacion", "segmentación", "cumpleanos", "cumpleaños", "fidelidad", "recurrente"],
  analytics: ["kpi", "kpis", "indicador", "indicadores", "margen", "margenes", "márgenes", "tendencia", "grafico", "gráfico", "analisis", "análisis", "rentabilidad", "utilidad", "ganancia", "ganancias", "categoria", "categoría", "rendimiento", "resumen", "balance"],
  pricing: ["precio", "precios", "promocion", "promoción", "promociones", "oferta", "ofertas", "descuento", "descuentos", "combo", "combos", "bundle", "competencia"],
  notifications: ["avisa", "avisar", "aviso", "notifica", "notificar", "notificacion", "notificación", "mensaje", "whatsapp", "recordatorio", "alerta", "alertas"],
  forestal: ["forestal", "madera", "troza", "trozas", "gtf", "guia", "guía", "serfor", "osinfor", "aserradero", "aserrio", "aserrío", "cubicacion", "cubicación", "especie", "especies", "libro", "ctp", "tablas", "paquete", "paquetes"],
  documentos: ["documento", "documentos", "archivo", "archivos", "drive", "carpeta", "carpetas", "pdf", "contrato", "contratos", "vencer", "papeles"],
  n8n: ["n8n", "automatizacion", "automatización", "automatizaciones", "flujo", "flujos", "dispara", "disparar", "webhook", "integracion", "integración", "conecta", "correo", "email", "telegram", "sheets"],
  // Los días sueltos («el lunes») NO van acá a propósito: «el lunes cobré 300»
  // es plata, no agenda, y arrastraría estas tools a media conversación. Lo que
  // selecciona el dominio es la INTENCIÓN de agendar, no la mención del tiempo.
  agenda: ["recordame", "recuérdame", "recuerdame", "acordame", "agenda", "agendar", "agendame", "agéndame", "cita", "citas", "reunion", "reunión", "reuniones", "actividad", "actividades", "tarea", "tareas", "pendiente", "pendientes", "programar", "programa", "visita", "visitas", "vencimiento", "hecho", "listo", "cumpli", "cumplí"],
  ui: [],
};

/**
 * Las palabras de una frase, sin tildes y sin puntuación, de 3+ caracteres.
 *
 * Se saca la tilde de los DOS lados para que «petróleo» dictado sin tilde por
 * el reconocedor de voz siga activando el dominio.
 */
function palabrasDe(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3),
  );
}

const SIN_TILDE = new Map<AgentDomain, Set<string>>(
  (Object.entries(PALABRAS) as [AgentDomain, readonly string[]][]).map(([dom, ws]) => [
    dom,
    new Set(ws.map((w) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))),
  ]),
);

/** Qué dominios menciona la frase. Vacío = no reconoció ninguno. */
export function dominiosMencionados(texto: string): AgentDomain[] {
  const palabras = palabrasDe(texto);
  const hits: AgentDomain[] = [];
  for (const [dom, vocabulario] of SIN_TILDE) {
    if (vocabulario.size === 0) continue;
    for (const w of palabras) {
      if (vocabulario.has(w)) { hits.push(dom); break; }
    }
  }
  return hits;
}

/**
 * Las herramientas para esta pregunta.
 *
 * @param texto  el mensaje del usuario, tal cual lo escribió o dictó
 */
export function toolsParaMensaje(texto: string): ToolDefinition[] {
  const mencionados = dominiosMencionados(texto);
  const elegidos = new Set<AgentDomain>([
    ...SIEMPRE,
    ...(mencionados.length > 0 ? mencionados : NUCLEO),
  ]);
  /**
   * Anotar necesita buscar primero, y buscar vive en `plata`. Si la frase habla
   * de una máquina o de una persona pero no dijo ninguna palabra de plata, sin
   * esto el modelo no tendría con qué buscar el id.
   */
  if (elegidos.has("cobranzas")) elegidos.add("plata");

  return ALL_AGENT_TOOLS.filter((t) => elegidos.has(t.function.name.split("_")[0] as AgentDomain));
}

/** Sólo para diagnóstico: cuántos tokens de esquema pesa un conjunto. */
export function tokensAproximados(tools: ToolDefinition[]): number {
  return Math.round(JSON.stringify(tools).length / 3.6);
}
