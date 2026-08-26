import { describe, expect, it } from "vitest";
import {
  estadoDeCredito,
  ordenarPorRiesgoDeCredito,
  requiereAtencion,
  saldoParaLimite,
} from "@/lib/adelantos/limite-credito";

/**
 * El tope es un número en soles (el form lo rotula "S/") — no hay tope en
 * dólares. `saldoParaLimite` es el único lugar que decide qué parte de la
 * deuda de una persona cuenta para él: sólo la de PEN, nunca una suma
 * cruzada con USD (auditoría de esta sesión).
 */
describe("saldoParaLimite", () => {
  it("toma sólo la parte en soles", () => {
    expect(saldoParaLimite({ PEN: 200, USD: 50 })).toBe(200);
  });

  it("sin deuda en soles, es 0 aunque deba en dólares", () => {
    expect(saldoParaLimite({ USD: 500 })).toBe(0);
  });

  it("sin deuda en ninguna moneda, es 0", () => {
    expect(saldoParaLimite({})).toBe(0);
  });
});

/**
 * El tope de crédito AVISA, no bloquea: es plata del dueño y él decide
 * saltárselo. Lo que se protege acá es que no pueda saltárselo sin enterarse, y
 * que no moleste a quien no tiene tope cargado.
 */
describe("estadoDeCredito", () => {
  it("sin límite cargado no opina — la mayoría no tiene tope", () => {
    expect(estadoDeCredito(null, 500, 300).estado).toBe("sin-limite");
    expect(estadoDeCredito(0, 500, 300).estado).toBe("sin-limite");
  });

  it("dentro del tope no molesta, pero dice cuánto queda", () => {
    const e = estadoDeCredito(1000, 200, 300);
    expect(e.estado).toBe("holgado");
    expect(e.estado === "holgado" && e.disponible).toBe(800);
    expect(requiereAtencion(e)).toBe(false);
  });

  it("avisa cuánto se pasa ANTES de registrar, no después", () => {
    const e = estadoDeCredito(1000, 800, 500);
    expect(e.estado).toBe("excede");
    expect(e.estado === "excede" && e.exceso).toBe(300);
    expect(requiereAtencion(e) && e.aviso).toMatch(/pasa su límite de S\/ 1,000\.00 por S\/ 300\.00/);
  });

  /** Justo en el tope no es "holgado": es el último que entra. */
  it("quedar exacto en el límite se avisa igual", () => {
    const e = estadoDeCredito(1000, 700, 300);
    expect(e.estado).toBe("al-limite");
    expect(requiereAtencion(e)).toBe(true);
  });

  it("sin monto nuevo, describe la situación actual", () => {
    const e = estadoDeCredito(1000, 1200);
    expect(e.estado).toBe("excede");
    expect(requiereAtencion(e) && e.aviso).toMatch(/Ya debe S\/ 1,200\.00/);
  });

  /** Un saldo negativo (adelanto a favor) no puede inflar el disponible. */
  it("no regala crédito por un saldo negativo", () => {
    const e = estadoDeCredito(1000, -500, 0);
    expect(e.estado === "holgado" && e.disponible).toBe(1000);
  });

  /**
   * Los saldos vienen de decimales de Postgres y de sumas en coma flotante. Lo
   * que no puede pasar es que una milésima invente un «pasa su límite» y frene
   * a alguien que está exactamente en cero de disponible.
   */
  it("una milésima de más no inventa un exceso", () => {
    expect(estadoDeCredito(1000, 999.999, 0).estado).not.toBe("excede");
    expect(estadoDeCredito(1000, 0.1 + 0.2, 0).estado).toBe("holgado");
  });

  it("pero un centavo real sí se reporta", () => {
    const e = estadoDeCredito(1000, 1000, 0.01);
    expect(e.estado).toBe("excede");
    expect(e.estado === "excede" && e.exceso).toBe(0.01);
  });
});

describe("orden de la lista de personas", () => {
  const p = (nombre: string, limiteCredito: number | null, saldoPendiente: number) => ({
    nombre,
    limiteCredito,
    saldoPendiente,
  });

  /**
   * La pregunta del mostrador es «¿a quién ya no le puedo fiar más?», y por
   * nombre alfabético no se responde.
   */
  it("primero quien está más cerca de su tope", () => {
    const orden = ordenarPorRiesgoDeCredito([
      p("Ana", 1000, 100), // 10%
      p("Beto", 1000, 900), // 90%
      p("Caro", 500, 250), // 50%
    ]);
    expect(orden.map((x) => x.nombre)).toEqual(["Beto", "Caro", "Ana"]);
  });

  it("los que no tienen límite van al final: no hay nada que medir", () => {
    const orden = ordenarPorRiesgoDeCredito([
      p("SinTope", null, 99999),
      p("ConTope", 1000, 100),
    ]);
    expect(orden.map((x) => x.nombre)).toEqual(["ConTope", "SinTope"]);
  });

  it("a igual uso, alfabético — para que la lista no baile entre cargas", () => {
    const orden = ordenarPorRiesgoDeCredito([p("Zoe", 1000, 500), p("Ana", 1000, 500)]);
    expect(orden.map((x) => x.nombre)).toEqual(["Ana", "Zoe"]);
  });
});
