// @vitest-environment node
/**
 * __tests__/logger-navegador.test.ts
 *
 * En producción `emit()` escribía con `process.stdout.write`. El `process` que
 * Next inyecta en el bundle del navegador no trae `stdout`: cualquier
 * `logger.warn/error` de un componente de cliente tiraba TypeError, y un
 * `.catch(sinDato("…"))` fallaba DENTRO del catch que debía absorber el error
 * (revisión 2026-09-14, 42 componentes `"use client"` importan el logger).
 *
 * `IS_PRODUCTION` se calcula al importar: cada caso reinicia los módulos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function loggerDeProduccion() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  return (await import("@/lib/logger")).logger;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("logger en producción, del lado del navegador", () => {
  it("no tira aunque `process.stdout` no exista y deja el JSON en la consola", async () => {
    // Lo que ve el bundle del cliente: hay `window` y un `process` sin stdout/stderr.
    vi.stubGlobal("window", {});
    vi.stubGlobal("process", { env: { NODE_ENV: "production" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = await loggerDeProduccion();

    expect(() => logger.warn("[CRM] no respondió", { error: "TypeError: Failed to fetch" })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({ level: "warn", message: "[CRM] no respondió" });
  });

  it("sinDato sigue devolviendo null en el navegador de producción", async () => {
    vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
    vi.stubGlobal("process", { env: { NODE_ENV: "production" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await loggerDeProduccion();
    const { sinDato } = await import("@/lib/errores/sin-dato");

    expect(() => sinDato("PLTab /api/pl")(new TypeError("Failed to fetch"))).not.toThrow();
    expect(sinDato("PLTab /api/pl")(new TypeError("Failed to fetch"))).toBeNull();
  });
});

describe("logger en producción, del lado del servidor", () => {
  it("CONTROL: sin `window` escribe una línea JSON en stdout, como antes", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = await loggerDeProduccion();

    logger.info("Order created", { orderId: "o1" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({ level: "info", message: "Order created", orderId: "o1" });
  });
});
