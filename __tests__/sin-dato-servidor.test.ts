// @vitest-environment node
/**
 * __tests__/sin-dato-servidor.test.ts
 *
 * Los helpers de `lib/errores/sin-dato.ts` también reemplazan los
 * `.catch(() => null)` de `app/api` y `lib`. Lo que tiene que sostenerse del
 * lado del servidor:
 *
 * - el módulo se puede importar SIN navegador (acá no hay `window`);
 * - `leerJson` acepta un `Request` (el cuerpo de un POST), no sólo `Response`;
 * - `sinDato` no tira y devuelve `null`, dejando el rastro en el logger;
 * - ni el helper ni `lib/navegacion.ts` llevan `"use client"`: con esa
 *   directiva una ruta del servidor recibe referencias de cliente y llamar a
 *   `sinDato(...)` revienta en vez de devolver `null`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { describirError, descartarEsperado, leerJson, sinDato } from "@/lib/errores/sin-dato";

afterEach(() => {
  vi.restoreAllMocks();
});

function post(body?: string): Request {
  return new Request("http://localhost/api/prueba", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("sin-dato en el servidor (entorno node)", () => {
  it("corre sin navegador", () => {
    expect(typeof window).toBe("undefined");
  });

  it("leerJson con un Request de cuerpo inválido devuelve null y no registra", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await expect(leerJson(post("{esto no es json"))).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("leerJson con un Request sin cuerpo devuelve null", async () => {
    await expect(leerJson(post())).resolves.toBeNull();
  });

  it("leerJson con un Request válido devuelve el objeto", async () => {
    await expect(leerJson<{ enabled: boolean }>(post(JSON.stringify({ enabled: true })))).resolves.toEqual({
      enabled: true,
    });
  });

  it("sinDato no tira, devuelve null y registra el contexto", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const falla = Promise.reject(new Error("Can't reach database server"));
    await expect(falla.catch(sinDato("api/sales ajustes del negocio"))).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[api/sales ajustes del negocio] no respondió", {
      error: "Error: Can't reach database server",
    });
  });

  it("un abort en el servidor tampoco se registra", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(sinDato("x")(new DOMException("cortado", "AbortError"))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("descartarEsperado devuelve null sin registrar", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    await expect(Promise.reject(new Error("key not found")).catch(descartarEsperado)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("ni el helper ni lib/navegacion.ts llevan la directiva use client", () => {
    for (const archivo of ["lib/errores/sin-dato.ts", "lib/navegacion.ts"]) {
      const fuente = readFileSync(path.join(process.cwd(), archivo), "utf8");
      expect(fuente, archivo).not.toMatch(/^\s*["']use client["']/m);
    }
  });
});

describe("describirError: lo que queda en el log (Ley 29733)", () => {
  it("de un error de Prisma sólo guarda el nombre y el código, nunca los valores de la consulta", () => {
    const e = Object.assign(new Error("Unique constraint failed on phone = 987654321"), { name: "PrismaClientKnownRequestError", code: "P2002" });
    expect(describirError(e)).toBe("PrismaClientKnownRequestError P2002");
    const validacion = Object.assign(new Error("Argument `username`: juan.perez@correo.pe is invalid"), { name: "PrismaClientValidationError" });
    expect(describirError(validacion)).toBe("PrismaClientValidationError");
  });

  it("de otros errores guarda nombre y mensaje recortado a 200 caracteres", () => {
    expect(describirError(new TypeError("Failed to fetch"))).toBe("TypeError: Failed to fetch");
    expect(describirError(new Error("x".repeat(500)))).toHaveLength("Error: ".length + 200);
    expect(describirError("texto suelto")).toBe("texto suelto");
  });
});
