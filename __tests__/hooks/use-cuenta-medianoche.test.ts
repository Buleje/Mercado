import { describe, expect, it } from "vitest";
import { calcularCuentaMedianoche } from "@/hooks/use-cuenta-medianoche";

/** La cuenta es a la medianoche de LIMA (UTC−5), no a la del navegador ni a la UTC. */
describe("calcularCuentaMedianoche", () => {
  it("a las 23:59:30 de Lima faltan 30 segundos", () => {
    const c = calcularCuentaMedianoche(Date.parse("2026-10-10T23:59:30-05:00"));
    expect(c.texto).toBe("00:00:30");
    expect(c.resumen).toBe("0 min");
  });

  it("a las 20:00 de Lima (ya es mañana en UTC) faltan 4 horas, no 24", () => {
    const c = calcularCuentaMedianoche(Date.parse("2026-10-11T01:00:00Z"));
    expect(c.texto).toBe("04:00:00");
    expect(c.resumen).toBe("4 h 0 min");
  });

  it("recién pasada la medianoche de Lima la cuenta vuelve a 24 h", () => {
    const c = calcularCuentaMedianoche(Date.parse("2026-10-11T00:00:01-05:00"));
    expect(c.horas).toBe(23);
    expect(c.texto).toBe("23:59:59");
  });
});
