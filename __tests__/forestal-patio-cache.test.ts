/**
 * Caché del patio: lo puro — cuán viejo es el dato y cómo se busca sin señal.
 * (IndexedDB no se testea acá; lo que importa es el criterio.)
 */
import { describe, expect, it } from "vitest";
import { antiguedad, buscarLocal, esViejo, VIEJO_MINUTOS } from "@/lib/forestal/patio-cache";

const ahora = new Date("2026-08-01T12:00:00Z");
const haceMin = (m: number) => new Date(ahora.getTime() - m * 60_000).toISOString();

describe("antiguedad", () => {
  it("distingue lo de recién de lo de ayer, que es lo único que importa en el patio", () => {
    expect(antiguedad(haceMin(0), ahora)).toBe("recién");
    expect(antiguedad(haceMin(20), ahora)).toBe("hace 20 min");
    expect(antiguedad(haceMin(90), ahora)).toBe("hace 1 h");
    expect(antiguedad(haceMin(60 * 30), ahora)).toBe("de ayer");
    expect(antiguedad(haceMin(60 * 24 * 3), ahora)).toBe("de hace 3 días");
  });

  it("una fecha rota no se dibuja como 'recién'", () => {
    // Decir "recién" sobre un dato del que no sabemos nada sería la mentira peor.
    expect(antiguedad("no-es-fecha", ahora)).toBe("de fecha desconocida");
  });
});

describe("esViejo", () => {
  it("marca viejo pasadas las dos horas", () => {
    expect(esViejo(haceMin(VIEJO_MINUTOS - 1), ahora)).toBe(false);
    expect(esViejo(haceMin(VIEJO_MINUTOS + 1), ahora)).toBe(true);
  });

  it("una fecha ilegible se trata como vieja, no como fresca", () => {
    expect(esViejo("", ahora)).toBe(true);
  });
});

describe("buscarLocal", () => {
  const trozas = [
    { codificacion: "13/A (0000041)", codigoPlanta: "118" },
    { codificacion: "13/A (0000042)", codigoPlanta: "119" },
    { codificacion: "07/B (0000112)", codigoPlanta: "204" },
    { codificacion: null, codigoPlanta: null },
  ];

  it("encuentra por código de planta, que es por lo que se pregunta en el patio", () => {
    expect(buscarLocal(trozas, "118")).toHaveLength(1);
    expect(buscarLocal(trozas, "118")[0].codificacion).toBe("13/A (0000041)");
  });

  it("encuentra por la codificación de la guía", () => {
    expect(buscarLocal(trozas, "0000112")).toHaveLength(1);
  });

  it("no distingue mayúsculas: se tipea como sale", () => {
    expect(buscarLocal(trozas, "13/a")).toHaveLength(2);
  });

  it("una búsqueda vacía no devuelve todo", () => {
    // Devolver el patio entero al borrar el campo es peor que no devolver nada.
    expect(buscarLocal(trozas, "")).toEqual([]);
    expect(buscarLocal(trozas, "   ")).toEqual([]);
  });

  it("no revienta con trozas sin ningún código", () => {
    expect(() => buscarLocal(trozas, "9")).not.toThrow();
  });

  it("respeta el límite", () => {
    expect(buscarLocal(trozas, "13/A", 1)).toHaveLength(1);
  });
});
