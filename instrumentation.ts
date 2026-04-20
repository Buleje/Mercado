export async function register() {
  // OTEL solo en producción — en dev, Turbopack + @opentelemetry/api tienen
  // un bug de hash-alias que rompe la carga del instrumentation.ts.
  // Ver: "Cannot find module '@opentelemetry/api-<hash>'" en dev logs.
  if (process.env.NODE_ENV === "production") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "bodega-san-martin" });
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();

    const [{ eventBus }, { registerAllHandlers }] = await Promise.all([
      import("@/lib/events/bus"),
      import("@/lib/events/register"),
    ]);
    registerAllHandlers(eventBus);
  }
}
