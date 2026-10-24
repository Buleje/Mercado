/**
 * __tests__/sin-dato.test.ts
 *
 * `lib/errores/sin-dato.ts` reemplaza los `.catch(() => null)` del panel.
 * Lo que tiene que sostener: siempre devuelve `null` (no cambia el flujo),
 * registra las fallas reales y calla las que no lo son.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const warn = vi.fn();
const seVa = vi.fn(() => false);

vi.mock("@/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => warn(...args), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/navegacion", () => ({
  laPaginaSeEstaYendo: () => seVa(),
}));

import { sinDato, leerJson, descartarEsperado } from "@/lib/errores/sin-dato";

beforeEach(() => {
  warn.mockClear();
  seVa.mockReset();
  seVa.mockReturnValue(false);
});

describe("sinDato", () => {
  it("un error de red se registra con el contexto y devuelve null", () => {
    const r = sinDato("CRM /api/orders")(new TypeError("Failed to fetch"));
    expect(r).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[CRM /api/orders] no respondió", {
      error: "TypeError: Failed to fetch",
    });
  });

  it("un pedido abortado no se registra y devuelve null", () => {
    const r = sinDato("CRM /api/orders")(new DOMException("cortado", "AbortError"));
    expect(r).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("otro DOMException que no es abort sí se registra", () => {
    sinDato("x")(new DOMException("otra", "NetworkError"));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("si la página se está yendo, no se registra", () => {
    seVa.mockReturnValue(true);
    const r = sinDato("CRM /api/orders")(new TypeError("Failed to fetch"));
    expect(r).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("como .catch de una promesa rechazada resuelve a null", async () => {
    await expect(Promise.reject(new Error("boom")).catch(sinDato("x"))).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("leerJson", () => {
  it("con JSON válido devuelve el objeto", async () => {
    const res = new Response(JSON.stringify({ error: "sin stock" }), { status: 400 });
    await expect(leerJson<{ error?: string }>(res)).resolves.toEqual({ error: "sin stock" });
  });

  it("con cuerpo que no es JSON devuelve null y no registra", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", { status: 502 });
    await expect(leerJson(res)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("descartarEsperado", () => {
  it("devuelve null sin registrar", async () => {
    await expect(Promise.reject(new Error("formato no reconocido")).catch(descartarEsperado)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
