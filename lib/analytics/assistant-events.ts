/**
 * assistant-events — Analytics stub para el Asistente Buleje.
 *
 * Por ahora solo console.log con fire-and-forget. Cuando haya integración
 * real (PostHog / Segment / Sentry Breadcrumbs), reemplazar la función
 * `dispatch` por la llamada al SDK correspondiente.
 *
 * Regla: nunca romper el flujo de chat si el tracking falla.
 */

export type AssistantEvent =
  | { type: "assistantOpened"; productId: number }
  | { type: "questionAsked"; productId: number; question: string }
  | { type: "suggestionClicked"; productId: number; suggestion: string }
  | { type: "conversionFromChat"; productId: number; storeProductId: string };

/**
 * Emite un evento del asistente hacia el bus de analytics.
 *
 * Fire-and-forget: nunca lanza, nunca await. Si la integración real
 * tarda, no bloquea la UI del chat.
 */
export function trackAssistantEvent(event: AssistantEvent): void {
  Promise.resolve()
    .then(() => dispatch(event))
    .catch(() => {
      /* silent — ninguna analítica debe romper el chat */
    });
}

function dispatch(event: AssistantEvent): void {
  if (typeof window === "undefined") return;

  // TODO: reemplazar por PostHog / Segment cuando exista integración.
  // Por ahora solo log a consola con un prefijo reconocible.
  console.debug("[assistant]", event.type, event);
}
