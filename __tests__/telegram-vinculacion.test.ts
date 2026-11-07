/**
 * Los dos candados del bot de Telegram: el secreto del webhook y el código de
 * vinculación.
 *
 * Son lo único que separa «el dueño dicta un gasto» de «cualquiera que descubra
 * la URL escribe en los libros del negocio». Un bug acá no da error: da
 * escrituras que nadie pidió.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("el secreto del webhook", () => {
  const TOKEN = "123456:AAH-fake-bot-token-para-tests";

  beforeEach(() => {
    vi.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("acepta el secreto que él mismo emite", async () => {
    const { secretoWebhook, secretoValido } = await import("@/lib/telegram/bot");
    expect(secretoValido(secretoWebhook())).toBe(true);
  });

  it("rechaza ausencia, vacío y cualquier otro valor", async () => {
    const { secretoValido } = await import("@/lib/telegram/bot");
    expect(secretoValido(null)).toBe(false);
    expect(secretoValido("")).toBe(false);
    expect(secretoValido("falso")).toBe(false);
  });

  it("rechaza un secreto del largo correcto pero distinto", async () => {
    // El largo igual es el caso que un `timingSafeEqual` mal usado deja pasar
    // (o hace explotar): tiene que devolver false, no tirar.
    const { secretoWebhook, secretoValido } = await import("@/lib/telegram/bot");
    const real = secretoWebhook();
    const falso = "f".repeat(real.length);
    expect(falso.length).toBe(real.length);
    expect(secretoValido(falso)).toBe(false);
  });

  it("cambia si cambia el token del bot", async () => {
    const { secretoWebhook } = await import("@/lib/telegram/bot");
    const conUno = secretoWebhook();
    vi.resetModules();
    process.env.TELEGRAM_BOT_TOKEN = "999999:OTRO-token";
    const { secretoWebhook: otra } = await import("@/lib/telegram/bot");
    expect(otra()).not.toBe(conUno);
  });

  it("sin token configurado, `botConfigurado` es false y no se emite nada", async () => {
    vi.resetModules();
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { botConfigurado, secretoWebhook } = await import("@/lib/telegram/bot");
    expect(botConfigurado()).toBe(false);
    expect(() => secretoWebhook()).toThrow();
  });
});

describe("el código de vinculación", () => {
  beforeEach(() => vi.resetModules());

  it("se canjea una sola vez", async () => {
    const { crearCodigo, canjearCodigo } = await import("@/lib/telegram/vinculacion");
    const { codigo } = crearCodigo("tenant-a", "qaadmin");
    expect(canjearCodigo(codigo)).toEqual({ tenantId: "tenant-a", pedidoPor: "qaadmin" });
    // El segundo intento con el mismo código no vale: se quemó.
    expect(canjearCodigo(codigo)).toBeNull();
  });

  it("no distingue mayúsculas ni espacios — se tipea a mano en un chat", async () => {
    const { crearCodigo, canjearCodigo } = await import("@/lib/telegram/vinculacion");
    const { codigo } = crearCodigo("tenant-b", "qaadmin");
    expect(canjearCodigo(` ${codigo.toLowerCase()} `)).toEqual({ tenantId: "tenant-b", pedidoPor: "qaadmin" });
  });

  it("un código inventado no canjea nada", async () => {
    const { crearCodigo, canjearCodigo } = await import("@/lib/telegram/vinculacion");
    crearCodigo("tenant-c", "qaadmin");
    expect(canjearCodigo("ZZZZZZ")).toBeNull();
    expect(canjearCodigo("")).toBeNull();
    expect(canjearCodigo("   ")).toBeNull();
  });

  it("pedir uno nuevo invalida el anterior del mismo negocio", async () => {
    const { crearCodigo, canjearCodigo } = await import("@/lib/telegram/vinculacion");
    const primero = crearCodigo("tenant-d", "qaadmin").codigo;
    const segundo = crearCodigo("tenant-d", "qaadmin").codigo;
    expect(canjearCodigo(primero)).toBeNull();
    expect(canjearCodigo(segundo)?.tenantId).toBe("tenant-d");
  });

  it("vence a los 15 minutos", async () => {
    vi.useFakeTimers();
    try {
      const { crearCodigo, canjearCodigo, codigoVivoDe } = await import("@/lib/telegram/vinculacion");
      const { codigo } = crearCodigo("tenant-e", "qaadmin");
      expect(codigoVivoDe("tenant-e")?.codigo).toBe(codigo);
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
      expect(canjearCodigo(codigo)).toBeNull();
      expect(codigoVivoDe("tenant-e")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("el código no usa caracteres que se confunden al leerlos", async () => {
    const { crearCodigo } = await import("@/lib/telegram/vinculacion");
    // 0/O y 1/I/L se copian mal de una pantalla a otra y se dictan peor.
    for (let i = 0; i < 40; i++) {
      const { codigo } = crearCodigo(`t-${i}`, "qaadmin");
      expect(codigo).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    }
  });
});
