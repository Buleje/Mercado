/**
 * lib/telemetry/capturar-error-cliente.ts — Sentry en el navegador, bajado sólo
 * cuando hay un error que reportar.
 *
 * En el navegador NO hay `Sentry.init` (no existe instrumentation-client de
 * Sentry ni `withSentryConfig`; `window.__SENTRY__` no aparece ni en local ni en
 * producción, medido 16-10). Igual, cada `import * as Sentry from "@sentry/nextjs"`
 * de un error.tsx o ErrorBoundary metía Sentry entero (núcleo, replay, feedback:
 * ~500 KB en dev) en la primera carga de TODA página. Con este puente el código
 * queda listo para el día que se prenda el RUM de errores: el módulo se baja en
 * el primer error y llama a la misma `captureException`.
 */
type Contexto = Parameters<typeof import("@sentry/nextjs").captureException>[1];

export function capturarErrorCliente(error: unknown, contexto?: Contexto): void {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(error, contexto);
    })
    .catch((fallo: unknown) => {
      // Sin logger: el logger también reporta errores por acá y daría vueltas.
      if (process.env.NODE_ENV !== "production") console.warn("[capturarErrorCliente] Sentry no cargó", fallo);
    });
}
