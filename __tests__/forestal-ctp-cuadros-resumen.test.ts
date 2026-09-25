import { describe, expect, it } from "vitest";
import { contrastarProducto, contrastarTrozas, cuadroProductoCierra, veredicto } from "@/lib/forestal/ctp-cuadros-resumen";

/** Los totales REALES del libro de Brandon (Cuadro Resumen 2). */
const CUADRO_REAL = {
  saldoInicial: 152.922,
  ingresos: 9.655,
  consumos: 24.146,
  producido: 1100.217,
  salidas: 1211.359,
  saldoFinal: 27.289,
};

describe("cuadroProductoCierra · la fórmula que imprime el SNIFFS", () => {
  it("el cuadro real cierra: A+B+D−C−E = saldo final", () => {
    // Si no cerrara, el problema estaría en el archivo o en cómo se leyó, y no
    // se podría usar para juzgar nada.
    expect(cuadroProductoCierra(CUADRO_REAL)).toBe(true);
  });

  it("detecta un cuadro que no cierra", () => {
    expect(cuadroProductoCierra({ ...CUADRO_REAL, saldoFinal: 99 })).toBe(false);
  });
});

describe("contrastarProducto · dónde el detalle no coincide con lo declarado", () => {
  it("marca las diferencias reales medidas en el libro", () => {
    const d = contrastarProducto(CUADRO_REAL, {
      producidoM3: 1332.196,
      despachadoM3: 1054.019,
      consumoInternoM3: 423.446,
    });
    const prod = d.find((x) => x.concepto === "Producción")!;
    expect(prod.diferencia).toBeCloseTo(231.979, 2);
    const sal = d.find((x) => x.concepto === "Salidas")!;
    expect(sal.diferencia).toBeCloseTo(266.106, 2);
  });

  it("el saldo inicial siempre aparece: el detalle no lo trae", () => {
    const d = contrastarProducto(CUADRO_REAL, { producidoM3: 1100.217, despachadoM3: 1211.359, consumoInternoM3: 0 });
    expect(d.map((x) => x.concepto)).toEqual(["Saldo inicial"]);
  });

  it("sin diferencias no reporta nada", () => {
    const sinApertura = { ...CUADRO_REAL, saldoInicial: 0 };
    const d = contrastarProducto(sinApertura, {
      producidoM3: 1100.217,
      despachadoM3: 1211.359,
      consumoInternoM3: 0,
    });
    expect(d).toEqual([]);
    expect(veredicto(d)).toContain("Todo cuadra");
  });

  it("no persigue decimales: por debajo de la tolerancia no es una diferencia", () => {
    const d = contrastarProducto(
      { ...CUADRO_REAL, saldoInicial: 0 },
      { producidoM3: 1100.222, despachadoM3: 1211.359, consumoInternoM3: 0 },
    );
    expect(d).toEqual([]);
  });
});

describe("contrastarTrozas", () => {
  const CUADRO = {
    saldoInicial: 0,
    ingresos: 2204.89,
    retrozadoInicial: 271.731,
    retrozadoFinal: 263.921,
    consumos: 1941.309,
    saldoFinal: 212.944,
  };

  it("explica el patio de más con la merma del retrozado", () => {
    // Cortar una troza pierde volumen; el detalle no lo registra y el patio
    // calculado queda por encima del declarado.
    const d = contrastarTrozas(CUADRO, { ingresadoM3: 2229.036, consumidoM3: 1950.964, enPatioM3: 278.072 });
    const patio = d.find((x) => x.concepto === "Saldo en patio")!;
    expect(patio.pista).toContain("7.81");
  });

  it("sin merma no inventa la pista", () => {
    const d = contrastarTrozas(
      { ...CUADRO, retrozadoInicial: 100, retrozadoFinal: 100 },
      { ingresadoM3: 2229.036, consumidoM3: 1950.964, enPatioM3: 278.072 },
    );
    expect(d.find((x) => x.concepto === "Saldo en patio")!.pista).toBe("");
  });
});

describe("veredicto", () => {
  it("nombra la diferencia más grande, que es por donde hay que empezar", () => {
    const d = contrastarProducto(CUADRO_REAL, {
      producidoM3: 1332.196,
      despachadoM3: 1054.019,
      consumoInternoM3: 423.446,
    });
    expect(veredicto(d)).toContain("Salidas");
    expect(veredicto(d)).toContain("266.106");
  });
});
