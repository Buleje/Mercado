/**
 * Cola del patio: la regla que decide si algo se reintenta o espera a un humano.
 * (IndexedDB no se testea acá — lo que importa es el criterio.)
 */
import { describe, expect, it } from "vitest";
import { clasificarRespuesta, decidirDestino, resumirAnotacion } from "@/lib/forestal/patio-cola";

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

describe("decidirDestino — cuándo encolar y cuándo mostrar el error", () => {
  it("sin señal encola: nunca llegó al servidor", () => {
    expect(decidirDestino({ online: false, status: null, ok: false })).toBe("encolar");
  });

  it("el fetch que tira excepción encola aunque el navegador se crea online", () => {
    // navigator.onLine miente seguido (wifi conectado sin salida). Lo que manda
    // es si el servidor llegó a opinar.
    expect(decidirDestino({ online: true, status: null, ok: false })).toBe("encolar");
  });

  it("el 4xx del libro se MUESTRA, no se encola", () => {
    // Encolarlo convertiría un "corregí esto" en un "esperá para siempre".
    expect(decidirDestino({ online: true, status: 422, ok: false })).toBe("mostrar-error");
    expect(decidirDestino({ online: true, status: 400, ok: false })).toBe("mostrar-error");
  });

  it("el 5xx encola: es transitorio de verdad", () => {
    expect(decidirDestino({ online: true, status: 500, ok: false })).toBe("encolar");
    expect(decidirDestino({ online: true, status: 503, ok: false })).toBe("encolar");
  });

  it("429 y 408 encolan: el protocolo mismo pide reintentar", () => {
    expect(decidirDestino({ online: true, status: 429, ok: false })).toBe("encolar");
    expect(decidirDestino({ online: true, status: 408, ok: false })).toBe("encolar");
  });

  it("la sesión vencida encola: se arregla volviendo a entrar, no descartando", () => {
    expect(decidirDestino({ online: true, status: 401, ok: false })).toBe("encolar");
    expect(decidirDestino({ online: true, status: 403, ok: false })).toBe("encolar");
  });

  it("el éxito no es ni una cosa ni la otra", () => {
    expect(decidirDestino({ online: true, status: 200, ok: true })).toBe("ok");
  });
});

describe("resumirAnotacion — las anotaciones del patio", () => {
  it("el consumo dice cuántas piezas, no la palabra 'consumo'", () => {
    expect(resumirAnotacion("consumo", { ctpEntryId: "c1", trozaIds: ["a", "b", "c"] }))
      .toBe("Piezas a la sierra: 3");
  });

  it("la recepción dice cuántas trozas, con el plural bien", () => {
    expect(resumirAnotacion("recepcion", { woodEntryId: "w1", cambios: [{ id: "t1" }] }))
      .toBe("Recepción de 1 troza");
    expect(resumirAnotacion("recepcion", { woodEntryId: "w1", cambios: [{ id: "t1" }, { id: "t2" }] }))
      .toBe("Recepción de 2 trozas");
  });

  it("no rompe el resumen de las secciones de siempre", () => {
    expect(resumirAnotacion("produccion", { speciesCommon: "Tornillo", quantity: 3, unit: "m3" }))
      .toContain("Tornillo");
  });
});
