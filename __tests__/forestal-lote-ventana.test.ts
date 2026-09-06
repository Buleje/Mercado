import { describe, it, expect } from "vitest";
import {
  avisosVentana,
  diasDeVentana,
  estadoOperativo,
  titularDeLote,
} from "@/lib/forestal/lote-ventana";

/**
 * ADR-327 — la ventana de trabajo del lote y su dueño.
 *
 * Son DOS EJES: el `status` es comercial (abierto/cerrado/despachado) y la
 * ventana es operativa (programado/en proceso/finalizado). Confundirlos sería el
 * error: un lote puede estar abierto para sumar corridas y ya terminado de
 * aserrar.
 */

const HOY = new Date("2026-08-01T15:00:00.000Z");

describe("estado operativo según la ventana", () => {
  it("antes del inicio, está programado", () => {
    expect(estadoOperativo({ fechaInicio: "2026-08-10", fechaFin: "2026-08-20" }, HOY)).toBe("programado");
  });

  it("dentro de la ventana, en proceso", () => {
    expect(estadoOperativo({ fechaInicio: "2026-07-20", fechaFin: "2026-08-10" }, HOY)).toBe("en_proceso");
  });

  it("después del fin, finalizado", () => {
    expect(estadoOperativo({ fechaInicio: "2026-07-01", fechaFin: "2026-07-30" }, HOY)).toBe("finalizado");
  });

  it("los extremos son INCLUSIVOS: un lote de un día no nace terminado", () => {
    expect(estadoOperativo({ fechaInicio: "2026-08-01", fechaFin: "2026-08-01" }, HOY)).toBe("en_proceso");
  });

  it("con inicio pasado y sin fin, sigue en proceso: no se adivina que terminó", () => {
    expect(estadoOperativo({ fechaInicio: "2026-07-01", fechaFin: null }, HOY)).toBe("en_proceso");
  });

  it("sin fechas no hay estado operativo que inventar", () => {
    expect(estadoOperativo({}, HOY)).toBe("sin_fecha");
    expect(estadoOperativo({ fechaInicio: null, fechaFin: null }, HOY)).toBe("sin_fecha");
  });

  it("compara por DÍA en UTC: a las 19:00 de Lima no salta al día siguiente", () => {
    // 2026-08-01 23:00 UTC = 18:00 en Lima, mismo día.
    const tarde = new Date("2026-08-01T23:00:00.000Z");
    expect(estadoOperativo({ fechaInicio: "2026-08-01", fechaFin: "2026-08-01" }, tarde)).toBe("en_proceso");
  });
});

describe("duración de la ventana", () => {
  it("cuenta los dos extremos", () => {
    expect(diasDeVentana({ fechaInicio: "2026-08-01", fechaFin: "2026-08-01" })).toBe(1);
    expect(diasDeVentana({ fechaInicio: "2026-08-01", fechaFin: "2026-08-05" })).toBe(5);
  });

  it("falta una punta ⇒ null, no 0", () => {
    expect(diasDeVentana({ fechaInicio: "2026-08-01" })).toBeNull();
  });
});

describe("avisos de la ventana", () => {
  it("una ventana al revés casi siempre es un typo en el año", () => {
    expect(avisosVentana({ fechaInicio: "2026-08-10", fechaFin: "2026-08-01" }).join(" ")).toMatch(/anterior a la de inicio/);
  });

  it("más de un año de ventana se marca", () => {
    expect(avisosVentana({ fechaInicio: "2025-01-01", fechaFin: "2026-08-01" }).join(" ")).toMatch(/más de un año/);
  });

  it("fin sin inicio se marca", () => {
    expect(avisosVentana({ fechaFin: "2026-08-01" }).join(" ")).toMatch(/sin fecha de inicio/);
  });

  it("una ventana normal no genera ruido", () => {
    expect(avisosVentana({ fechaInicio: "2026-08-01", fechaFin: "2026-08-15" })).toEqual([]);
  });
});

describe("titular de la madera", () => {
  it("manda el nombre guardado en el lote: es acta", () => {
    // Si mañana se corrige la ficha del directorio, lo certificado no cambia.
    const t = titularDeLote({ titularNombre: "CC.NN. San Luis", titular: { nombre: "CC NN SAN LUIS SAC", docNumero: "20156701263" } });
    expect(t?.nombre).toBe("CC.NN. San Luis");
    expect(t?.doc).toBe("20156701263");
  });

  it("sin nombre propio cae al del directorio", () => {
    expect(titularDeLote({ titular: { nombre: "Maderera El Roble" } })?.nombre).toBe("Maderera El Roble");
  });

  it("sin titular ⇒ null: la madera es del propio centro", () => {
    expect(titularDeLote({})).toBeNull();
    expect(titularDeLote({ titularNombre: "   " })).toBeNull();
  });
});
