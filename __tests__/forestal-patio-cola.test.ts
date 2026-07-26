/**
 * Cola del patio: la regla que decide si algo se reintenta o espera a un humano.
 * (IndexedDB no se testea acá — lo que importa es el criterio.)
 */
import { describe, expect, it } from "vitest";
import { clasificarRespuesta, resumirAnotacion } from "@/lib/forestal/patio-cola";

describe("clasificarRespuesta", () => {
  it("200 sube y se borra de la cola", () => {
    expect(clasificarRespuesta(200, true)).toBe("ok");
    expect(clasificarRespuesta(201, true)).toBe("ok");
  });

  it("un invariante del libro (422) NO se reintenta: daría siempre lo mismo", () => {
    expect(clasificarRespuesta(422, false)).toBe("rechazado");
    expect(clasificarRespuesta(400, false)).toBe("rechazado");
    expect(clasificarRespuesta(404, false)).toBe("rechazado");
  });

  it("sesión vencida o CSRF (401/403) se reintenta: se arregla volviendo a entrar", () => {
    expect(clasificarRespuesta(401, false)).toBe("reintentar");
    expect(clasificarRespuesta(403, false)).toBe("reintentar");
  });

  it("rate limit y timeouts se reintentan (lo pide el propio protocolo)", () => {
    expect(clasificarRespuesta(429, false)).toBe("reintentar");
    expect(clasificarRespuesta(408, false)).toBe("reintentar");
    expect(clasificarRespuesta(425, false)).toBe("reintentar");
  });

  it("un 5xx es del servidor, no del dato: se reintenta", () => {
    expect(clasificarRespuesta(500, false)).toBe("reintentar");
    expect(clasificarRespuesta(502, false)).toBe("reintentar");
    expect(clasificarRespuesta(0, false)).toBe("reintentar");
  });
});

describe("resumirAnotacion", () => {
  it("arma una línea legible con lo que el operario reconoce", () => {
    expect(resumirAnotacion("ingresos", { speciesCommon: "Tornillo", quantity: 12.5, unit: "m3", gtfNumber: "001-0000120" }))
      .toBe("Tornillo · 12.5 m3 · 001-0000120");
  });

  it("un despacho se reconoce por producto y destino", () => {
    expect(resumirAnotacion("despacho", { productType: "Madera aserrada", quantity: 4, unit: "m3", destino: "Maderera Ucayali" }))
      .toBe("Madera aserrada · 4 m3 · Maderera Ucayali");
  });

  it("sin datos usables cae a la sección, nunca a un texto vacío", () => {
    expect(resumirAnotacion("produccion", {})).toBe("produccion");
    expect(resumirAnotacion("produccion", { speciesCommon: "   " })).toBe("produccion");
  });
});
