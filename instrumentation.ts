import { registerOTel } from "@vercel/otel";

export async function register() {
  registerOTel({ serviceName: "bodega-san-martin" });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
