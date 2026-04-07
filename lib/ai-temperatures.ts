/**
 * lib/ai-temperatures.ts
 *
 * Temperaturas LLM canónicas por rol del agente.
 * Implementa el Excel Agentes IA práctica #7 ("temperaturas diferenciadas
 * por agente") como contrato único para TODO el código que llame a LLMs.
 *
 * Regla: NUNCA hardcodear un valor numérico en un payload LLM. Siempre
 * importar desde aquí y elegir el rol correcto. Si un rol nuevo aparece
 * (ej. "translation", "summary"), agregarlo aquí con su justificación
 * antes de usarlo.
 *
 * Fuente: `Mejores_Practicas_Agentes_IA.xlsx` práctica #7:
 *   Chat: 0.0 — respuestas exactas en datos
 *   Notif: 0.1 — ajustes finos en mensajes
 *   Gerente: 0.4 — creativas en consejos y resúmenes
 *
 * El Excel sugiere 3 valores base; este proyecto necesita más sabores
 * porque sus endpoints tocan varios casos de uso distintos.
 */

export const AI_TEMPERATURES = {
  /**
   * Chat de consulta directa sobre datos del negocio (precios, stock, pedidos).
   * Determinístico — el modelo NO debe inventar números ni nombres de productos.
   * Uso: WhatsApp auto-reply al cliente, chat/auto-reply del marketplace.
   * Valor Excel: 0.0
   */
  chat: 0.0,

  /**
   * Extracción de información de texto/voz a estructura (intent, slots, campos).
   * Determinístico — variación = errores de parsing.
   * Uso: OCR de facturas, voice-to-intent del POS, NLU básico.
   * Valor: 0.0 (Excel recomienda 0.0 para tareas determinísticas)
   */
  extraction: 0.0,

  /**
   * Notificaciones automáticas al cliente/operador.
   * Casi determinístico — margen minimal para templating natural.
   * Uso: notificaciones push, emails automáticos, plantillas WhatsApp.
   * Valor Excel: 0.1
   */
  notifications: 0.1,

  /**
   * Predicción numérica / forecast.
   * Casi determinístico — las predicciones deben ser estables entre runs.
   * Uso: demand-prediction, sales forecast, restock alerts.
   * Valor: 0.1 (forecasts con algo de variación para evitar modelos colapsados)
   */
  forecast: 0.1,

  /**
   * Segunda llamada LLM después de ejecutar tools — sintetiza datos objetivos.
   * Casi determinístico — el LLM no debe inventar cifras en el resumen.
   * Uso: ai-assistant después de function calls.
   * Valor: 0.1
   */
  toolFollowup: 0.1,

  /**
   * Primera llamada LLM con tools disponibles — decide qué tool llamar.
   * Baja pero no cero — necesita margen mínimo para resolver queries ambiguas.
   * Uso: ai-assistant router entry, cualquier LLM que elija herramientas.
   * Valor: 0.2
   */
  router: 0.2,

  /**
   * Rol "Gerente IA" del Excel — consejos, análisis, recomendaciones.
   * Creativa pero con anclaje en datos. El Gerente NO es un poeta.
   * Uso: ai-assistant modo consejero, coach, advisor endpoints.
   * Valor Excel: 0.4
   */
  gerente: 0.4,

  /**
   * Generación creativa con variedad deseada (marketing, copywriting, ideation).
   * Alta — la variedad es una feature, no un bug.
   * Uso: promociones/ai-suggest, campaign ideas, slogans, combos.
   * Valor: 0.5 (menos que 0.7-0.8 del Excel para marketing, pero más que Gerente)
   */
  creative: 0.5,
} as const;

export type AiTemperatureRole = keyof typeof AI_TEMPERATURES;
